-- GM-CRM Accounts Phase 5E: integrated financial integrity hardening.
-- Apply after Accounts Phase 1 and Phase 5A-5D migrations, in Supabase staging first.
-- This migration is additive and does not rewrite historical journal entries.

-- One canonical transaction-scoped lock key is used by all employee-custody debits.
-- This matches the office-deposit lock and serializes handover/deposit confirmation
-- for the same employee across both workflows.
create or replace function public.gm_accounts_confirm_cash_handover(p_movement_id uuid,p_confirmed_by text)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare v_move gm_accounts_cash_movements%rowtype; v_balance numeric(14,2); v_entry uuid;
begin
 select * into v_move from gm_accounts_cash_movements where id=p_movement_id for update;
 if not found then raise exception 'Handover not found'; end if;
 if v_move.movement_type<>'handover' then raise exception 'Movement is not a handover'; end if;
 if v_move.status='confirmed' then return jsonb_build_object('ok',true,'alreadyConfirmed',true,'movementId',v_move.id); end if;
 if v_move.status<>'recorded' then raise exception 'Handover is not awaiting confirmation'; end if;
 if coalesce(trim(p_confirmed_by),'')='' or trim(p_confirmed_by)<>v_move.to_employee_id then raise exception 'Only the named recipient can confirm this handover'; end if;
 perform pg_advisory_xact_lock(hashtext('gm_accounts_employee_cash:'||v_move.from_employee_id));
 select coalesce(sum(l.debit-l.credit),0) into v_balance from gm_accounts_journal_lines l where l.account_code='EMPLOYEE_CASH_CUSTODY' and l.employee_id=v_move.from_employee_id;
 if v_balance<v_move.amount then raise exception 'Sender cash custody balance is insufficient'; end if;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('cash_handover',v_move.id,'Confirmed cash handover from '||v_move.from_employee_id||' to '||v_move.to_employee_id,trim(p_confirmed_by)) returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values
 (v_entry,1,'EMPLOYEE_CASH_CUSTODY',v_move.to_employee_id,v_move.amount,0),
 (v_entry,2,'EMPLOYEE_CASH_CUSTODY',v_move.from_employee_id,0,v_move.amount);
 update gm_accounts_cash_movements set status='confirmed',confirmed_by=trim(p_confirmed_by),confirmed_at=now() where id=v_move.id;
 return jsonb_build_object('ok',true,'movementId',v_move.id,'status','confirmed');
end; $$;

-- Strengthen office deposit denomination validation before any rows are inserted.
create or replace function public.gm_accounts_create_office_deposit(
 p_request_key text,p_employee_id text,p_amount numeric,p_denominations jsonb,p_note text default '',p_recorded_by text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing gm_accounts_cash_movements%rowtype; v_row jsonb; v_d numeric; v_n integer; v_sum numeric(14,2):=0; v_seen text[]:='{}';
begin
 if coalesce(trim(p_request_key),'')='' or coalesce(trim(p_employee_id),'')='' or coalesce(trim(p_recorded_by),'')='' then raise exception 'Required office deposit fields are missing'; end if;
 if p_employee_id<>p_recorded_by then raise exception 'Deposit must be submitted by the employee holding the cash'; end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 then raise exception 'Invalid deposit amount'; end if;
 select * into v_existing from gm_accounts_cash_movements where reference='office-deposit:'||trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'movementId',v_existing.id,'status',v_existing.status); end if;
 if jsonb_typeof(p_denominations)<>'array' or jsonb_array_length(p_denominations)<>6 then raise exception 'All six denomination counts are required'; end if;
 for v_row in select value from jsonb_array_elements(p_denominations) loop
  if coalesce(v_row->>'pieceCount','') !~ '^[0-9]{1,7}$' then raise exception 'Invalid denomination count'; end if;
  v_d:=(v_row->>'denomination')::numeric; v_n:=(v_row->>'pieceCount')::integer;
  if v_d::text=any(v_seen) then raise exception 'Duplicate denomination row'; end if;
  v_seen:=array_append(v_seen,v_d::text);
  v_sum:=v_sum+v_d*v_n;
 end loop;
 if cardinality(v_seen)<>6 or not (v_seen @> array['500','200','100','50','20','10']) then raise exception 'All six unique denomination types must be supplied'; end if;
 if v_sum<>p_amount then raise exception 'Denomination total must equal the declared deposit amount'; end if;
 insert into gm_accounts_cash_movements(movement_type,method,from_employee_id,amount,status,reference,note,recorded_by)
 values('office_receipt','cash',trim(p_employee_id),p_amount,'recorded','office-deposit:'||trim(p_request_key),left(coalesce(p_note,''),300),trim(p_recorded_by)) returning id into v_id;
 insert into gm_accounts_cash_denominations(movement_id,denomination,piece_count)
 select v_id,(x->>'denomination')::numeric,(x->>'pieceCount')::integer from jsonb_array_elements(p_denominations) x;
 return jsonb_build_object('ok',true,'movementId',v_id,'status','recorded');
exception when unique_violation then
 select * into v_existing from gm_accounts_cash_movements where reference='office-deposit:'||trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'movementId',v_existing.id,'status',v_existing.status); end if;
 raise;
end; $$;

-- Recreate the daily closing function with a fixed India-business-day cutoff.
-- A closing for date D includes only journal entries posted before midnight IST
-- at the start of D+1. Future dates are rejected; historical snapshots are date-aware.
create or replace function public.gm_accounts_create_daily_closing(
 p_request_key text,p_closing_date date,p_counted_employee_balances jsonb,p_counted_office_cash numeric,p_note text,p_submitted_by text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing gm_accounts_daily_closings%rowtype; v_expected jsonb:='{}'::jsonb; v_counted jsonb:='{}'::jsonb;
 v_row record; v_item jsonb; v_expected_emp numeric(14,2):=0; v_counted_emp numeric(14,2):=0;
 v_office numeric(14,2):=0; v_upi numeric(14,2):=0; v_bank numeric(14,2):=0;
 v_emp_var numeric(14,2); v_office_var numeric(14,2); v_total_var numeric(14,2); v_id uuid;
begin
 if coalesce(trim(p_request_key),'')='' or p_closing_date is null or coalesce(trim(p_submitted_by),'')='' then raise exception 'Required daily closing fields are missing'; end if;
 if p_closing_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'Future daily closing dates are not allowed'; end if;
 if p_counted_office_cash is null or p_counted_office_cash<0 or p_counted_office_cash>10000000 then raise exception 'Invalid counted office cash'; end if;
 select * into v_existing from gm_accounts_daily_closings where request_key=trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadySubmitted',true,'closingId',v_existing.id,'status',v_existing.status); end if;
 perform pg_advisory_xact_lock(hashtext('gm_accounts_daily_closing:'||p_closing_date::text));
 if exists(select 1 from gm_accounts_daily_closings where closing_date=p_closing_date and status<>'disputed') then raise exception 'A closing record already exists for this date'; end if;
 for v_row in
  select employee_id,round(sum(debit-credit),2) as balance from gm_accounts_journal_lines
  where account_code='EMPLOYEE_CASH_CUSTODY' and employee_id is not null and journal_entry_id in (select id from gm_accounts_journal_entries where posted_at < ((p_closing_date + 1)::timestamp at time zone 'Asia/Kolkata')) group by employee_id having round(sum(debit-credit),2)<>0
 loop
  v_expected:=v_expected||jsonb_build_object(v_row.employee_id,v_row.balance);
  v_expected_emp:=v_expected_emp+v_row.balance;
 end loop;
 if jsonb_typeof(p_counted_employee_balances)<>'array' then raise exception 'Employee cash counts are required as an array'; end if;
 for v_item in select value from jsonb_array_elements(p_counted_employee_balances) loop
  if coalesce(trim(v_item->>'employeeId'),'')='' or coalesce(v_item->>'amount','') !~ '^([0-9]+)(\.[0-9]{1,2})?$' then raise exception 'Invalid employee cash count'; end if;
  if (v_counted ? (v_item->>'employeeId')) then raise exception 'Duplicate employee cash count'; end if;
  v_counted:=v_counted||jsonb_build_object(v_item->>'employeeId',(v_item->>'amount')::numeric);
  v_counted_emp:=v_counted_emp+(v_item->>'amount')::numeric;
 end loop;
 if (select count(*) from jsonb_object_keys(v_expected))<>(select count(*) from jsonb_object_keys(v_counted)) then raise exception 'Count every employee with an outstanding custody balance'; end if;
 if exists(select 1 from jsonb_object_keys(v_expected) as keys(key) where not (v_counted ? key)) or exists(select 1 from jsonb_object_keys(v_counted) as keys(key) where not (v_expected ? key)) then raise exception 'Employee cash count list does not match custody balances'; end if;
 select coalesce(sum(debit-credit),0) into v_office from gm_accounts_journal_lines where account_code='OFFICE_CASH' and journal_entry_id in (select id from gm_accounts_journal_entries where posted_at < ((p_closing_date + 1)::timestamp at time zone 'Asia/Kolkata')); 
 select coalesce(sum(debit-credit),0) into v_upi from gm_accounts_journal_lines where account_code='UPI_CLEARING' and journal_entry_id in (select id from gm_accounts_journal_entries where posted_at < ((p_closing_date + 1)::timestamp at time zone 'Asia/Kolkata')); 
 select coalesce(sum(debit-credit),0) into v_bank from gm_accounts_journal_lines where account_code='BANK' and journal_entry_id in (select id from gm_accounts_journal_entries where posted_at < ((p_closing_date + 1)::timestamp at time zone 'Asia/Kolkata')); 
 v_emp_var:=round(v_counted_emp-v_expected_emp,2); v_office_var:=round(p_counted_office_cash-v_office,2); v_total_var:=v_emp_var+v_office_var;
 insert into gm_accounts_daily_closings(closing_date,request_key,expected_employee_balances,counted_employee_balances,expected_employee_total,counted_employee_total,expected_office_cash,counted_office_cash,expected_upi_clearing,expected_bank,employee_variance,office_variance,total_cash_variance,variance_status,note,submitted_by)
 values(p_closing_date,trim(p_request_key),v_expected,v_counted,v_expected_emp,v_counted_emp,v_office,p_counted_office_cash,v_upi,v_bank,v_emp_var,v_office_var,v_total_var,case when v_total_var=0 then 'clear' else 'investigation' end,left(coalesce(p_note,''),300),trim(p_submitted_by)) returning id into v_id;
 return jsonb_build_object('ok',true,'closingId',v_id,'status','pending_approval','varianceStatus',case when v_total_var=0 then 'clear' else 'investigation' end,'employeeVariance',v_emp_var,'officeVariance',v_office_var,'totalCashVariance',v_total_var);
end; $$;


revoke all on function public.gm_accounts_confirm_cash_handover(uuid,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_confirm_cash_handover(uuid,text) to service_role;
revoke all on function public.gm_accounts_create_office_deposit(text,text,numeric,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_office_deposit(text,text,numeric,jsonb,text,text) to service_role;
revoke all on function public.gm_accounts_create_daily_closing(text,date,jsonb,numeric,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_daily_closing(text,date,jsonb,numeric,text,text) to service_role;
