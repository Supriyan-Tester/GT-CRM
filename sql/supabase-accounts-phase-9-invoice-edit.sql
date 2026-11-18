-- Phase 9: edit an invoice (number, date, bill total, opening due, bill photo).
-- Run once in the Supabase SQL editor AFTER the earlier Accounts files. Safe to re-run.
-- Every edit is saved in gm_accounts_invoice_edits (who, when, why, before/after).
-- If the opening due changes, a balancing journal entry is posted so the books stay correct.

create table if not exists public.gm_accounts_invoice_edits (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.gm_accounts_invoices(id),
 edited_by text not null, edited_at timestamptz not null default now(), reason text not null,
 before jsonb not null, after jsonb not null,
 journal_entry_id uuid references public.gm_accounts_journal_entries(id)
);
alter table public.gm_accounts_invoice_edits enable row level security;
create index if not exists gm_accounts_invoice_edits_invoice_idx on public.gm_accounts_invoice_edits(invoice_id, edited_at desc);

create or replace function public.gm_accounts_edit_invoice(
 p_invoice_id uuid, p_invoice_no text, p_invoice_date date, p_original_amount numeric, p_outstanding_amount numeric,
 p_evidence_path text, p_edited_by text, p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v gm_accounts_invoices%rowtype; v_committed numeric(14,2); v_delta numeric(14,2);
 v_entry uuid; v_counter text; v_before jsonb; v_after jsonb;
begin
 if coalesce(trim(p_edited_by),'')='' or coalesce(trim(p_reason),'')='' then raise exception 'Enter a reason for the change'; end if;
 if coalesce(trim(p_invoice_no),'')='' then raise exception 'Enter an invoice number'; end if;
 if p_original_amount<=0 or p_outstanding_amount<=0 or p_outstanding_amount>p_original_amount then
  raise exception 'Invalid invoice amounts: opening due must be above 0 and not more than the bill total'; end if;
 select * into v from gm_accounts_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 if exists (select 1 from gm_accounts_invoices where customer_code=v.customer_code and invoice_no=trim(p_invoice_no) and id<>v.id) then
  raise exception 'Invoice number already exists for this customer'; end if;
 if exists (select 1 from gm_accounts_invoices where invoice_no=trim(p_invoice_no) and customer_code<>v.customer_code) then
  raise exception 'Invoice number already belongs to another customer'; end if;
 -- payments already collected (approved or still waiting) must stay covered by the opening due
 select coalesce(sum(a.amount),0) into v_committed from gm_accounts_collection_allocations a
  join gm_accounts_collections c on c.id=a.collection_id
  where a.invoice_id=v.id and c.status not in ('rejected','reversed');
 if p_outstanding_amount < v_committed then
  raise exception 'Opening due cannot be less than payments already recorded (%)', v_committed; end if;

 v_before := jsonb_build_object('invoice_no',v.invoice_no,'invoice_date',v.invoice_date,'original_amount',v.original_amount,
  'initial_outstanding',v.initial_outstanding,'evidence_path',v.evidence_path);
 v_delta := p_outstanding_amount - v.initial_outstanding;
 if v_delta <> 0 then
  v_counter := case when v.source_kind='opening' then 'OPENING_BALANCE_EQUITY' else 'SALES' end;
  insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
  values('invoice_edit',gen_random_uuid(),'Edit of invoice '||v.invoice_no||': '||trim(p_reason),trim(p_edited_by)) returning id into v_entry;
  if v_delta > 0 then
   insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
   (v_entry,1,'CUSTOMER_RECEIVABLE',v.customer_code,v_delta,0),(v_entry,2,v_counter,v.customer_code,0,v_delta);
  else
   insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
   (v_entry,1,'CUSTOMER_RECEIVABLE',v.customer_code,0,-v_delta),(v_entry,2,v_counter,v.customer_code,-v_delta,0);
  end if;
 end if;

 update gm_accounts_invoices set invoice_no=trim(p_invoice_no), invoice_date=p_invoice_date,
  original_amount=p_original_amount, initial_outstanding=p_outstanding_amount,
  evidence_path=coalesce(nullif(trim(p_evidence_path),''), evidence_path)
 where id=v.id;

 v_after := jsonb_build_object('invoice_no',trim(p_invoice_no),'invoice_date',p_invoice_date,'original_amount',p_original_amount,
  'initial_outstanding',p_outstanding_amount,'evidence_path',coalesce(nullif(trim(p_evidence_path),''), v.evidence_path));
 insert into gm_accounts_invoice_edits(invoice_id,edited_by,reason,before,after,journal_entry_id)
 values(v.id,trim(p_edited_by),trim(p_reason),v_before,v_after,v_entry);
 return jsonb_build_object('ok',true,'delta',v_delta);
end; $$;

revoke all on function public.gm_accounts_edit_invoice(uuid,text,date,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_edit_invoice(uuid,text,date,numeric,numeric,text,text,text) to service_role;
