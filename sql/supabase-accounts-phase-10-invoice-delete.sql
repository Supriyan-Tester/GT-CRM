-- Phase 10: delete an opening-balance invoice. Run once AFTER phase 9. Safe to re-run.
-- Blocked if any collection (approved or waiting) exists on the invoice.
-- A full copy is kept in gm_accounts_invoice_deletions, and a reversing journal entry keeps the books balanced.

create table if not exists public.gm_accounts_invoice_deletions (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null,
 deleted_by text not null, deleted_at timestamptz not null default now(), reason text not null,
 snapshot jsonb not null, journal_entry_id uuid references public.gm_accounts_journal_entries(id)
);
alter table public.gm_accounts_invoice_deletions enable row level security;

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

 v_snap := jsonb_build_object('invoice',to_jsonb(v),
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from gm_accounts_collection_allocations a where a.invoice_id=v.id),'[]'::jsonb),
  'edits',coalesce((select jsonb_agg(to_jsonb(e)) from gm_accounts_invoice_edits e where e.invoice_id=v.id),'[]'::jsonb));

 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('invoice_delete',gen_random_uuid(),'Deleted invoice '||v.invoice_no||': '||trim(p_reason),trim(p_deleted_by)) returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
  (v_entry,1,'OPENING_BALANCE_EQUITY',v.customer_code,v.initial_outstanding,0),
  (v_entry,2,'CUSTOMER_RECEIVABLE',v.customer_code,0,v.initial_outstanding);

 insert into gm_accounts_invoice_deletions(invoice_id,deleted_by,reason,snapshot,journal_entry_id)
 values(v.id,trim(p_deleted_by),trim(p_reason),v_snap,v_entry);
 delete from gm_accounts_collection_allocations where invoice_id=v.id;
 delete from gm_accounts_invoice_edits where invoice_id=v.id;
 delete from gm_accounts_invoices where id=v.id;
 return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.gm_accounts_delete_invoice(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_delete_invoice(uuid,text,text) to service_role;
