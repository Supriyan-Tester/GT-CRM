-- Phase 12: discount and return credit on an invoice. Run once in the Supabase SQL editor AFTER phase 11. Safe to re-run.
-- A discount or return credit lowers what the customer still owes on one invoice, with no cash involved.
-- The bill total never changes. Every adjustment is kept in gm_accounts_invoice_adjustments (who, when, why, amount)
-- and posts a balanced journal entry:  debit SALES_DISCOUNT or SALES_RETURNS  /  credit CUSTOMER_RECEIVABLE.
-- An adjustment can be reversed (never edited), which posts the opposite entry and keeps the history.

-- 1. An invoice can now be cleared completely (outstanding 0). Replace the old "> 0" check with ">= 0".
do $$
declare c record;
begin
 for c in select conname from pg_constraint
   where conrelid='public.gm_accounts_invoices'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%initial_outstanding%'
 loop execute format('alter table public.gm_accounts_invoices drop constraint %I', c.conname); end loop;
 alter table public.gm_accounts_invoices add constraint gm_accounts_invoices_initial_outstanding_check
  check (initial_outstanding >= 0 and initial_outstanding <= original_amount);
end $$;

-- 2. Two new ledger accounts.
alter table public.gm_accounts_journal_lines drop constraint if exists gm_accounts_journal_lines_account_code_check;
alter table public.gm_accounts_journal_lines add constraint gm_accounts_journal_lines_account_code_check
 check (account_code in ('CUSTOMER_RECEIVABLE','EMPLOYEE_CASH_CUSTODY','OFFICE_CASH','UPI_CLEARING','BANK','COLLECTION_SUSPENSE',
  'OPENING_BALANCE_EQUITY','SALES','SALES_DISCOUNT','SALES_RETURNS'));

-- 3. Adjustment history.
create table if not exists public.gm_accounts_invoice_adjustments (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.gm_accounts_invoices(id),
 customer_code text not null,
 kind text not null check (kind in ('discount','return')),
 amount numeric(14,2) not null check (amount > 0),
 reason text not null,
 created_by text not null,
 created_at timestamptz not null default now(),
 due_before numeric(14,2) not null check (due_before >= 0),
 due_after numeric(14,2) not null check (due_after >= 0),
 journal_entry_id uuid not null references public.gm_accounts_journal_entries(id),
 reversed_at timestamptz,
 reversed_by text,
 reverse_reason text,
 reverse_journal_entry_id uuid references public.gm_accounts_journal_entries(id),
 check ((reversed_at is null) = (reversed_by is null))
);
comment on table public.gm_accounts_invoice_adjustments is
 'Discounts and return credits applied to one invoice. Append-only history; a mistake is reversed, not edited.';
alter table public.gm_accounts_invoice_adjustments enable row level security;
create index if not exists gm_accounts_invoice_adjustments_invoice_idx
 on public.gm_accounts_invoice_adjustments(invoice_id, created_at);
create index if not exists gm_accounts_invoice_adjustments_customer_idx
 on public.gm_accounts_invoice_adjustments(customer_code, created_at desc);

-- 4. Add an adjustment.
create or replace function public.gm_accounts_adjust_invoice(
 p_invoice_id uuid, p_kind text, p_amount numeric, p_by text, p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v gm_accounts_invoices%rowtype; v_committed numeric(14,2); v_available numeric(14,2);
 v_entry uuid; v_account text; v_id uuid;
begin
 if coalesce(trim(p_by),'')='' or coalesce(trim(p_reason),'')='' then raise exception 'Enter a reason for the adjustment'; end if;
 if p_kind not in ('discount','return') then raise exception 'Choose discount or return'; end if;
 if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then raise exception 'Enter an amount above 0 with at most 2 decimals'; end if;
 select * into v from gm_accounts_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 -- Payments already collected (approved or waiting) are not touched: only the balance still due can be adjusted.
 select coalesce(sum(a.amount),0) into v_committed from gm_accounts_collection_allocations a
  join gm_accounts_collections c on c.id=a.collection_id
  where a.invoice_id=v.id and c.status not in ('rejected','reversed');
 v_available := v.initial_outstanding - v_committed;
 if p_amount > v_available then raise exception 'Enter an amount up to the balance still due (%)', v_available; end if;

 v_account := case p_kind when 'discount' then 'SALES_DISCOUNT' else 'SALES_RETURNS' end;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('invoice_adjustment',gen_random_uuid(),initcap(p_kind)||' on invoice '||v.invoice_no||': '||trim(p_reason),trim(p_by))
 returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
  (v_entry,1,v_account,v.customer_code,p_amount,0),
  (v_entry,2,'CUSTOMER_RECEIVABLE',v.customer_code,0,p_amount);

 update gm_accounts_invoices set initial_outstanding = initial_outstanding - p_amount where id=v.id;
 insert into gm_accounts_invoice_adjustments(invoice_id,customer_code,kind,amount,reason,created_by,due_before,due_after,journal_entry_id)
 values(v.id,v.customer_code,p_kind,p_amount,trim(p_reason),trim(p_by),v.initial_outstanding,v.initial_outstanding-p_amount,v_entry)
 returning id into v_id;
 return jsonb_build_object('ok',true,'adjustment_id',v_id,'outstanding_after',v.initial_outstanding-p_amount-v_committed);
end; $$;

-- 5. Reverse an adjustment.
create or replace function public.gm_accounts_reverse_invoice_adjustment(p_adjustment_id uuid, p_by text, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare adj gm_accounts_invoice_adjustments%rowtype; v gm_accounts_invoices%rowtype; v_entry uuid; v_account text;
begin
 if coalesce(trim(p_by),'')='' or coalesce(trim(p_reason),'')='' then raise exception 'Enter a reason for the reversal'; end if;
 select * into adj from gm_accounts_invoice_adjustments where id=p_adjustment_id for update;
 if not found then raise exception 'Adjustment not found'; end if;
 if adj.reversed_at is not null then raise exception 'This adjustment is already reversed'; end if;
 select * into v from gm_accounts_invoices where id=adj.invoice_id for update;
 if v.initial_outstanding + adj.amount > v.original_amount then
  raise exception 'Cannot reverse: the invoice due would be more than the bill total'; end if;

 v_account := case adj.kind when 'discount' then 'SALES_DISCOUNT' else 'SALES_RETURNS' end;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('invoice_adjustment_reversal',adj.id,'Reversed '||adj.kind||' on invoice '||v.invoice_no||': '||trim(p_reason),trim(p_by))
 returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
  (v_entry,1,'CUSTOMER_RECEIVABLE',v.customer_code,adj.amount,0),
  (v_entry,2,v_account,v.customer_code,0,adj.amount);
 update gm_accounts_invoices set initial_outstanding = initial_outstanding + adj.amount where id=v.id;
 update gm_accounts_invoice_adjustments set reversed_at=now(), reversed_by=trim(p_by), reverse_reason=trim(p_reason),
  reverse_journal_entry_id=v_entry where id=adj.id;
 return jsonb_build_object('ok',true);
end; $$;

-- 6. Deleting an opening invoice (phase 10) now also handles adjustments:
--    blocked while an active adjustment exists; reversed ones are copied into the deletion snapshot.
create or replace function public.gm_accounts_delete_invoice(p_invoice_id uuid, p_deleted_by text, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v gm_accounts_invoices%rowtype; v_entry uuid; v_snap jsonb;
begin
 if coalesce(trim(p_deleted_by),'')='' or coalesce(trim(p_reason),'')='' then raise exception 'Enter a reason for the deletion'; end if;
 select * into v from gm_accounts_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 if v.source_kind<>'opening' then raise exception 'Only opening-balance invoices can be deleted'; end if;
 if exists (select 1 from gm_accounts_collection_allocations a join gm_accounts_collections c on c.id=a.collection_id
            where a.invoice_id=v.id and c.status not in ('rejected','reversed')) then
  raise exception 'This invoice has payments recorded. Reject or reverse them first'; end if;
 if exists (select 1 from gm_accounts_invoice_adjustments where invoice_id=v.id and reversed_at is null) then
  raise exception 'This invoice has a discount or return credit. Reverse it first'; end if;

 v_snap := jsonb_build_object('invoice',to_jsonb(v),
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from gm_accounts_collection_allocations a where a.invoice_id=v.id),'[]'::jsonb),
  'edits',coalesce((select jsonb_agg(to_jsonb(e)) from gm_accounts_invoice_edits e where e.invoice_id=v.id),'[]'::jsonb),
  'adjustments',coalesce((select jsonb_agg(to_jsonb(j)) from gm_accounts_invoice_adjustments j where j.invoice_id=v.id),'[]'::jsonb));

 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('invoice_delete',gen_random_uuid(),'Deleted invoice '||v.invoice_no||': '||trim(p_reason),trim(p_deleted_by)) returning id into v_entry;
 if v.initial_outstanding > 0 then
  insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
   (v_entry,1,'OPENING_BALANCE_EQUITY',v.customer_code,v.initial_outstanding,0),
   (v_entry,2,'CUSTOMER_RECEIVABLE',v.customer_code,0,v.initial_outstanding);
 end if;

 insert into gm_accounts_invoice_deletions(invoice_id,deleted_by,reason,snapshot,journal_entry_id)
 values(v.id,trim(p_deleted_by),trim(p_reason),v_snap,v_entry);
 delete from gm_accounts_collection_allocations where invoice_id=v.id;
 delete from gm_accounts_invoice_edits where invoice_id=v.id;
 delete from gm_accounts_invoice_adjustments where invoice_id=v.id;
 delete from gm_accounts_invoices where id=v.id;
 return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.gm_accounts_adjust_invoice(uuid,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_adjust_invoice(uuid,text,numeric,text,text) to service_role;
revoke all on function public.gm_accounts_reverse_invoice_adjustment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_reverse_invoice_adjustment(uuid,text,text) to service_role;
revoke all on function public.gm_accounts_delete_invoice(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_delete_invoice(uuid,text,text) to service_role;
