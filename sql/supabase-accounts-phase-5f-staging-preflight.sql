-- GM-CRM Accounts Phase 5F: read-only staging preflight diagnostics.
-- Run ONLY after migrations 1 and 5A-5E have been applied to STAGING.
-- This file is intentionally read-only. It does not create, update, or delete data.

-- 1. Required schema objects.
with required_objects(name, kind) as (
  values
    ('gm_accounts_cash_movements','r'),
    ('gm_accounts_cash_denominations','r'),
    ('gm_accounts_journal_entries','r'),
    ('gm_accounts_journal_lines','r'),
    ('gm_accounts_daily_closings','r'),
    ('gm_accounts_upi_settlements','r')
)
select r.name, case when c.oid is null then 'MISSING' else 'OK' end as status
from required_objects r
left join pg_class c on c.relname=r.name and c.relnamespace='public'::regnamespace
order by r.name;

-- 2. Required RPCs and whether execution is limited to service_role.
with required_functions(signature) as (
  values
    ('public.gm_accounts_confirm_cash_handover(uuid,text)'),
    ('public.gm_accounts_create_office_deposit(text,text,numeric,jsonb,text,text)'),
    ('public.gm_accounts_confirm_office_deposit(uuid,text)'),
    ('public.gm_accounts_create_upi_settlement(text,numeric,text,date,text,text)'),
    ('public.gm_accounts_confirm_upi_settlement(uuid,text)'),
    ('public.gm_accounts_create_daily_closing(text,date,jsonb,numeric,text,text)'),
    ('public.gm_accounts_approve_daily_closing(uuid,text)')
)
select f.signature,
       p.oid is not null as function_exists,
       case when p.oid is null then 'MISSING'
            when has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              then 'REVIEW: client role has EXECUTE'
            when has_function_privilege('service_role',p.oid,'EXECUTE')
              then 'OK'
            else 'REVIEW: service_role lacks EXECUTE'
       end as privilege_status
from required_functions f
left join pg_proc p on p.oid=to_regprocedure(f.signature)
order by f.signature;

-- 3. Unbalanced posted journal entries. Expected result: zero rows.
select e.id, e.source_type, e.source_id,
       round(sum(l.debit-l.credit),2) as imbalance
from public.gm_accounts_journal_entries e
join public.gm_accounts_journal_lines l on l.journal_entry_id=e.id
group by e.id,e.source_type,e.source_id
having round(sum(l.debit-l.credit),2) <> 0
order by e.id;

-- 4. Duplicate cash movement references. Expected result: zero rows.
select reference, count(*) as duplicate_count
from public.gm_accounts_cash_movements
where reference is not null
group by reference
having count(*) > 1;

-- 5. Denomination integrity. Expected result: zero rows.
select d.movement_id,
       count(*) as row_count,
       count(distinct d.denomination) as distinct_denominations,
       sum(d.denomination*d.piece_count) as denomination_total,
       m.amount as declared_amount
from public.gm_accounts_cash_denominations d
join public.gm_accounts_cash_movements m on m.id=d.movement_id
group by d.movement_id,m.amount
having count(*) <> 6
    or count(distinct d.denomination) <> 6
    or sum(d.denomination*d.piece_count) <> m.amount
order by d.movement_id;

-- 6. Duplicate active closings. Expected result: zero rows.
select closing_date, count(*) as active_count
from public.gm_accounts_daily_closings
where status in ('pending_approval','approved')
group by closing_date
having count(*) > 1;

-- 7. Pending workflow counts for staging operator review.
select 'cash_handover' as workflow, status, count(*) as item_count
from public.gm_accounts_cash_movements
where movement_type='handover'
group by status
union all
select 'office_deposit', status, count(*)
from public.gm_accounts_cash_movements
where movement_type='office_receipt'
group by status
union all
select 'upi_settlement', status, count(*)
from public.gm_accounts_upi_settlements
group by status
union all
select 'daily_closing', status, count(*)
from public.gm_accounts_daily_closings
group by status
order by workflow,status;

-- 8. Snapshot: current account balances by journal account.
select account_code, round(sum(debit-credit),2) as debit_balance
from public.gm_accounts_journal_lines
group by account_code
order by account_code;
