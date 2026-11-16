-- GM-CRM Accounts Phase 5B: employee deposits into the office cash register.
-- Additive: reuses gm_accounts_cash_movements, denominations and journal tables.
create index if not exists gm_accounts_office_receipts_status_idx
 on public.gm_accounts_cash_movements(movement_type,status,recorded_at desc);
create unique index if not exists gm_accounts_office_deposit_request_uidx
 on public.gm_accounts_cash_movements(reference)
 where movement_type='office_receipt' and reference like 'office-deposit:%';

create or replace function public.gm_accounts_create_office_deposit(
 p_request_key text,p_employee_id text,p_amount numeric,p_denominations jsonb,p_note text default '',p_recorded_by text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing gm_accounts_cash_movements%rowtype; v_row jsonb; v_d numeric; v_n integer; v_sum numeric(14,2):=0; v_count integer:=0;
begin
 if coalesce(trim(p_request_key),'')='' or coalesce(trim(p_employee_id),'')='' or coalesce(trim(p_recorded_by),'')='' then raise exception 'Required office deposit fields are missing'; end if;
 if p_employee_id<>p_recorded_by then raise exception 'Deposit must be submitted by the employee holding the cash'; end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 then raise exception 'Invalid deposit amount'; end if;
 select * into v_existing from gm_accounts_cash_movements where reference='office-deposit:'||trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'movementId',v_existing.id,'status',v_existing.status); end if;
 if jsonb_typeof(p_denominations)<>'array' or jsonb_array_length(p_denominations)<>6 then raise exception 'All six denomination counts are required'; end if;
 for v_row in select value from jsonb_array_elements(p_denominations) loop
  v_d:=(v_row->>'denomination')::numeric; v_n:=(v_row->>'pieceCount')::integer;
  if v_d not in (500,200,100,50,20,10) or v_n<0 then raise exception 'Invalid denomination count'; end if;
  v_sum:=v_sum+v_d*v_n; v_count:=v_count+1;
 end loop;
 if v_count<>6 or v_sum<>p_amount then raise exception 'Denomination total must equal the declared deposit amount'; end if;
 insert into gm_accounts_cash_movements(movement_type,method,from_employee_id,amount,status,reference,note,recorded_by)
 values('office_receipt','cash',trim(p_employee_id),p_amount,'recorded','office-deposit:'||trim(p_request_key),left(coalesce(p_note,''),300),trim(p_recorded_by)) returning id into v_id;
 insert into gm_accounts_cash_denominations(movement_id,denomination,piece_count)
 select v_id,(x->>'denomination')::numeric,(x->>'pieceCount')::integer from jsonb_array_elements(p_denominations) x;
 return jsonb_build_object('ok',true,'movementId',v_id,'status','recorded');
end; $$;

create or replace function public.gm_accounts_confirm_office_deposit(p_movement_id uuid,p_confirmed_by text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_move gm_accounts_cash_movements%rowtype; v_balance numeric(14,2); v_entry uuid;
begin
 select * into v_move from gm_accounts_cash_movements where id=p_movement_id for update;
 if not found or v_move.movement_type<>'office_receipt' then raise exception 'Office deposit not found'; end if;
 if v_move.status='confirmed' then return jsonb_build_object('ok',true,'alreadyConfirmed',true,'movementId',v_move.id); end if;
 if v_move.status<>'recorded' then raise exception 'Office deposit is not awaiting confirmation'; end if;
 if coalesce(trim(p_confirmed_by),'')='' or trim(p_confirmed_by)=v_move.from_employee_id then raise exception 'A different authorised billing employee must confirm the deposit'; end if;
 perform pg_advisory_xact_lock(hashtext('gm_accounts_employee_cash:'||v_move.from_employee_id));
 select coalesce(sum(debit-credit),0) into v_balance from gm_accounts_journal_lines where account_code='EMPLOYEE_CASH_CUSTODY' and employee_id=v_move.from_employee_id;
 if v_balance<v_move.amount then raise exception 'Employee custody balance is insufficient'; end if;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('office_cash_receipt',v_move.id,'Office cash received from employee '||v_move.from_employee_id,trim(p_confirmed_by)) returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values
 (v_entry,1,'EMPLOYEE_CASH_CUSTODY',v_move.from_employee_id,0,v_move.amount),
 (v_entry,2,'OFFICE_CASH',null,v_move.amount,0);
 update gm_accounts_cash_movements set status='confirmed',to_employee_id='OFFICE',confirmed_by=trim(p_confirmed_by),confirmed_at=now() where id=v_move.id;
 return jsonb_build_object('ok',true,'movementId',v_move.id,'status','confirmed');
end; $$;

revoke all on function public.gm_accounts_create_office_deposit(text,text,numeric,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_confirm_office_deposit(uuid,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_office_deposit(text,text,numeric,jsonb,text,text) to service_role;
grant execute on function public.gm_accounts_confirm_office_deposit(uuid,text) to service_role;
