-- Phase 7: a delivery employee can record cash for a bill that is on their Daily plan but not yet in Accounts.
-- Run on STAGING first. Safe to run twice.
-- 1) Allow a SALES account in journal lines (the receivable for a delivered bill is matched by sales).
alter table public.gm_accounts_journal_lines drop constraint if exists gm_accounts_journal_lines_account_code_check;
alter table public.gm_accounts_journal_lines add constraint gm_accounts_journal_lines_account_code_check
  check (account_code in ('CUSTOMER_RECEIVABLE','EMPLOYEE_CASH_CUSTODY','OFFICE_CASH','UPI_CLEARING','BANK','COLLECTION_SUSPENSE','OPENING_BALANCE_EQUITY','SALES'));

-- 2) Creates the ledger invoice for a delivered bill. Returns the existing invoice if it was already created.
create or replace function public.gm_accounts_create_delivery_invoice(
 p_customer_code text,p_customer_name text,p_invoice_no text,p_invoice_date date,
 p_amount numeric,p_evidence_path text,p_created_by text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_invoice_id uuid; v_entry_id uuid;
begin
 if coalesce(trim(p_customer_code),'')='' or coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_invoice_no),'')=''
 or coalesce(trim(p_evidence_path),'')='' or coalesce(trim(p_created_by),'')='' then raise exception 'Required delivery invoice fields are missing'; end if;
 if p_amount<=0 then raise exception 'Invalid delivery invoice amount'; end if;
 select id into v_invoice_id from gm_accounts_invoices where customer_code=trim(p_customer_code) and invoice_no=trim(p_invoice_no);
 if v_invoice_id is not null then return v_invoice_id; end if;
 if exists (select 1 from gm_accounts_invoices where invoice_no=trim(p_invoice_no) and customer_code<>trim(p_customer_code)) then
  raise exception 'Invoice number already belongs to another customer'; end if;
 insert into gm_accounts_invoices(customer_code,customer_name_snapshot,invoice_no,invoice_date,source_kind,original_amount,initial_outstanding,evidence_path,created_by)
 values(trim(p_customer_code),trim(p_customer_name),trim(p_invoice_no),p_invoice_date,'manual',p_amount,p_amount,p_evidence_path,trim(p_created_by)) returning id into v_invoice_id;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('delivery_invoice',v_invoice_id,'Delivered invoice '||trim(p_invoice_no),trim(p_created_by)) returning id into v_entry_id;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
 (v_entry_id,1,'CUSTOMER_RECEIVABLE',trim(p_customer_code),p_amount,0),
 (v_entry_id,2,'SALES',trim(p_customer_code),0,p_amount);
 return v_invoice_id;
end; $$;

revoke all on function public.gm_accounts_create_delivery_invoice(text,text,text,date,numeric,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_delivery_invoice(text,text,text,date,numeric,text,text) to service_role;
