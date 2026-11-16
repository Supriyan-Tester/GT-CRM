-- GM-CRM Accounts Phase 5D: daily cash closing and reconciliation.
-- Additive only. Variances are recorded for investigation; this migration never posts an automatic adjustment.
create table if not exists public.gm_accounts_daily_closings (
 id uuid primary key default gen_random_uuid(), closing_date date not null,
 request_key text not null unique, expected_employee_balances jsonb not null,
 counted_employee_balances jsonb not null, expected_employee_total numeric(14,2) not null,
 counted_employee_total numeric(14,2) not null, expected_office_cash numeric(14,2) not null,
 counted_office_cash numeric(14,2) not null, expected_upi_clearing numeric(14,2) not null,
 expected_bank numeric(14,2) not null, employee_variance numeric(14,2) not null,
 office_variance numeric(14,2) not null, total_cash_variance numeric(14,2) not null,
 status text not null default 'pending_approval' check(status in ('pending_approval','approved','disputed')),
 variance_status text not null default 'clear' check(variance_status in ('clear','investigation')),
 note text not null default '', submitted_by text not null, submitted_at timestamptz not null default now(),
 approved_by text, approved_at timestamptz, dispute_reason text, disputed_by text, disputed_at timestamptz
);
create index if not exists gm_accounts_daily_closings_date_idx on public.gm_accounts_daily_closings(closing_date desc,submitted_at desc);
create unique index if not exists gm_accounts_daily_closings_one_active_per_date_uidx on public.gm_accounts_daily_closings(closing_date) where status in ('pending_approval','approved');
alter table public.gm_accounts_daily_closings enable row level security;

create or replace function public.gm_accounts_create_daily_closing(
 p_request_key text,p_closing_date date,p_counted_employee_balances jsonb,p_counted_office_cash numeric,p_note text,p_submitted_by text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing gm_accounts_daily_closings%rowtype; v_expected jsonb:='{}'::jsonb; v_counted jsonb:='{}'::jsonb;
 v_row record; v_item jsonb; v_expected_emp numeric(14,2):=0; v_counted_emp numeric(14,2):=0;
 v_office numeric(14,2):=0; v_upi numeric(14,2):=0; v_bank numeric(14,2):=0;
 v_emp_var numeric(14,2); v_office_var numeric(14,2); v_total_var numeric(14,2); v_id uuid;
begin
 if coalesce(trim(p_request_key),'')='' or p_closing_date is null or coalesce(trim(p_submitted_by),'')='' then raise exception 'Required daily closing fields are missing'; end if;
 if p_counted_office_cash is null or p_counted_office_cash<0 or p_counted_office_cash>10000000 then raise exception 'Invalid counted office cash'; end if;
 select * into v_existing from gm_accounts_daily_closings where request_key=trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadySubmitted',true,'closingId',v_existing.id,'status',v_existing.status); end if;
 perform pg_advisory_xact_lock(hashtext('gm_accounts_daily_closing:'||p_closing_date::text));
 if exists(select 1 from gm_accounts_daily_closings where closing_date=p_closing_date and status<>'disputed') then raise exception 'A closing record already exists for this date'; end if;
 for v_row in
  select employee_id,round(sum(debit-credit),2) as balance from gm_accounts_journal_lines
  where account_code='EMPLOYEE_CASH_CUSTODY' and employee_id is not null group by employee_id having round(sum(debit-credit),2)<>0
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
 select coalesce(sum(debit-credit),0) into v_office from gm_accounts_journal_lines where account_code='OFFICE_CASH';
 select coalesce(sum(debit-credit),0) into v_upi from gm_accounts_journal_lines where account_code='UPI_CLEARING';
 select coalesce(sum(debit-credit),0) into v_bank from gm_accounts_journal_lines where account_code='BANK';
 v_emp_var:=round(v_counted_emp-v_expected_emp,2); v_office_var:=round(p_counted_office_cash-v_office,2); v_total_var:=v_emp_var+v_office_var;
 insert into gm_accounts_daily_closings(closing_date,request_key,expected_employee_balances,counted_employee_balances,expected_employee_total,counted_employee_total,expected_office_cash,counted_office_cash,expected_upi_clearing,expected_bank,employee_variance,office_variance,total_cash_variance,variance_status,note,submitted_by)
 values(p_closing_date,trim(p_request_key),v_expected,v_counted,v_expected_emp,v_counted_emp,v_office,p_counted_office_cash,v_upi,v_bank,v_emp_var,v_office_var,v_total_var,case when v_total_var=0 then 'clear' else 'investigation' end,left(coalesce(p_note,''),300),trim(p_submitted_by)) returning id into v_id;
 return jsonb_build_object('ok',true,'closingId',v_id,'status','pending_approval','varianceStatus',case when v_total_var=0 then 'clear' else 'investigation' end,'employeeVariance',v_emp_var,'officeVariance',v_office_var,'totalCashVariance',v_total_var);
end; $$;

create or replace function public.gm_accounts_approve_daily_closing(p_closing_id uuid,p_approved_by text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row gm_accounts_daily_closings%rowtype;
begin
 select * into v_row from gm_accounts_daily_closings where id=p_closing_id for update;
 if not found then raise exception 'Daily closing not found'; end if;
 if v_row.status='approved' then return jsonb_build_object('ok',true,'alreadyApproved',true,'closingId',v_row.id); end if;
 if v_row.status<>'pending_approval' then raise exception 'Daily closing is not awaiting approval'; end if;
 if coalesce(trim(p_approved_by),'')='' or trim(p_approved_by)=v_row.submitted_by then raise exception 'A different Billing employee must approve the daily closing'; end if;
 update gm_accounts_daily_closings set status='approved',approved_by=trim(p_approved_by),approved_at=now() where id=v_row.id;
 return jsonb_build_object('ok',true,'closingId',v_row.id,'status','approved','varianceStatus',v_row.variance_status,'totalCashVariance',v_row.total_cash_variance);
end; $$;

create or replace function public.gm_accounts_dispute_daily_closing(p_closing_id uuid,p_disputed_by text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row gm_accounts_daily_closings%rowtype;
begin
 select * into v_row from gm_accounts_daily_closings where id=p_closing_id for update;
 if not found or v_row.status<>'pending_approval' then raise exception 'Only pending daily closings can be disputed'; end if;
 if coalesce(trim(p_disputed_by),'')='' or trim(p_disputed_by)=v_row.submitted_by or coalesce(trim(p_reason),'')='' then raise exception 'A different Billing employee and dispute reason are required'; end if;
 update gm_accounts_daily_closings set status='disputed',disputed_by=trim(p_disputed_by),disputed_at=now(),dispute_reason=left(trim(p_reason),300) where id=v_row.id;
 return jsonb_build_object('ok',true,'closingId',v_row.id,'status','disputed');
end; $$;
revoke all on function public.gm_accounts_create_daily_closing(text,date,jsonb,numeric,text,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_approve_daily_closing(uuid,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_dispute_daily_closing(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_daily_closing(text,date,jsonb,numeric,text,text) to service_role;
grant execute on function public.gm_accounts_approve_daily_closing(uuid,text) to service_role;
grant execute on function public.gm_accounts_dispute_daily_closing(uuid,text,text) to service_role;
