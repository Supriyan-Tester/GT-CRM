-- GM-CRM Accounts & Ledger foundation (additive; does not alter gm_kv).
-- Review before applying. Financial writes must use server-side service-role RPCs.
create extension if not exists pgcrypto;

create table if not exists public.gm_accounts_invoices (
 id uuid primary key default gen_random_uuid(), customer_code text not null,
 customer_name_snapshot text not null, invoice_no text not null, invoice_date date not null,
 source_kind text not null check (source_kind in ('opening','sales_order','manual')),
 source_order_id text, original_amount numeric(14,2) not null check (original_amount > 0),
 initial_outstanding numeric(14,2) not null check (initial_outstanding > 0 and initial_outstanding <= original_amount),
 evidence_path text not null, created_by text not null, created_at timestamptz not null default now(),
 unique(customer_code,invoice_no), unique(source_order_id)
);
create table if not exists public.gm_accounts_collections (
 id uuid primary key default gen_random_uuid(), request_key text not null unique,
 customer_code text not null, customer_name_snapshot text not null,
 collected_by text not null, collector_name_snapshot text not null,
 method text not null check (method in ('cash','upi','bank_transfer')),
 total_amount numeric(14,2) not null check (total_amount > 0), note text not null default '',
 status text not null default 'pending_approval' check (status in ('pending_approval','approved','rejected','reversed')),
 received_at timestamptz not null default now(), approved_by text, approved_at timestamptz,
 rejection_reason text, created_at timestamptz not null default now()
);
create table if not exists public.gm_accounts_collection_allocations (
 id uuid primary key default gen_random_uuid(), collection_id uuid not null references public.gm_accounts_collections(id),
 invoice_id uuid not null references public.gm_accounts_invoices(id), amount numeric(14,2) not null check (amount > 0),
 evidence_path text not null, created_at timestamptz not null default now(), unique(collection_id,invoice_id)
);
create table if not exists public.gm_accounts_journal_entries (
 id uuid primary key default gen_random_uuid(), entry_no bigint generated always as identity unique,
 source_type text not null, source_id uuid not null, description text not null, posted_by text not null,
 posted_at timestamptz not null default now(), reversal_of uuid references public.gm_accounts_journal_entries(id),
 unique(source_type,source_id)
);
create table if not exists public.gm_accounts_journal_lines (
 id uuid primary key default gen_random_uuid(), journal_entry_id uuid not null references public.gm_accounts_journal_entries(id),
 line_no smallint not null, account_code text not null check (account_code in
 ('CUSTOMER_RECEIVABLE','EMPLOYEE_CASH_CUSTODY','OFFICE_CASH','UPI_CLEARING','BANK','COLLECTION_SUSPENSE','OPENING_BALANCE_EQUITY')),
 customer_code text, employee_id text, debit numeric(14,2) not null default 0 check (debit >= 0),
 credit numeric(14,2) not null default 0 check (credit >= 0), created_at timestamptz not null default now(),
 unique(journal_entry_id,line_no), check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create table if not exists public.gm_accounts_cash_movements (
 id uuid primary key default gen_random_uuid(), collection_id uuid unique references public.gm_accounts_collections(id),
 movement_type text not null check (movement_type in ('collection_received','handover','office_receipt','shortage','excess','adjustment')),
 method text not null check (method in ('cash','upi','bank_transfer')), from_employee_id text, to_employee_id text,
 amount numeric(14,2) not null check (amount > 0), status text not null default 'recorded'
 check (status in ('recorded','confirmed','disputed','reversed')), reference text, note text not null default '',
 recorded_by text not null, recorded_at timestamptz not null default now(), confirmed_by text, confirmed_at timestamptz
);
create table if not exists public.gm_accounts_cash_denominations (
 movement_id uuid not null references public.gm_accounts_cash_movements(id) on delete restrict,
 denomination numeric(8,2) not null check (denomination in (500,200,100,50,20,10)),
 piece_count integer not null check (piece_count >= 0), primary key(movement_id,denomination)
);
create index if not exists gm_accounts_invoice_customer_date_idx on public.gm_accounts_invoices(customer_code,invoice_date desc);
create index if not exists gm_accounts_collection_customer_date_idx on public.gm_accounts_collections(customer_code,received_at desc);
create index if not exists gm_accounts_collection_status_idx on public.gm_accounts_collections(status,received_at);
create index if not exists gm_accounts_allocation_invoice_idx on public.gm_accounts_collection_allocations(invoice_id);

alter table public.gm_accounts_invoices enable row level security;
alter table public.gm_accounts_collections enable row level security;
alter table public.gm_accounts_collection_allocations enable row level security;
alter table public.gm_accounts_journal_entries enable row level security;
alter table public.gm_accounts_journal_lines enable row level security;
alter table public.gm_accounts_cash_movements enable row level security;
alter table public.gm_accounts_cash_denominations enable row level security;

-- Legacy handwritten credit bills are opening receivables, not new-period revenue.
create or replace function public.gm_accounts_create_opening_invoice(
 p_customer_code text,p_customer_name text,p_invoice_no text,p_invoice_date date,
 p_original_amount numeric,p_outstanding_amount numeric,p_evidence_path text,p_created_by text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_invoice_id uuid; v_entry_id uuid;
begin
 if coalesce(trim(p_customer_code),'')='' or coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_invoice_no),'')=''
 or coalesce(trim(p_evidence_path),'')='' or coalesce(trim(p_created_by),'')='' then raise exception 'Required opening invoice fields are missing'; end if;
 if p_original_amount<=0 or p_outstanding_amount<=0 or p_outstanding_amount>p_original_amount then raise exception 'Invalid opening invoice amounts'; end if;
 insert into gm_accounts_invoices(customer_code,customer_name_snapshot,invoice_no,invoice_date,source_kind,original_amount,initial_outstanding,evidence_path,created_by)
 values(trim(p_customer_code),trim(p_customer_name),trim(p_invoice_no),p_invoice_date,'opening',p_original_amount,p_outstanding_amount,p_evidence_path,trim(p_created_by)) returning id into v_invoice_id;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('opening_invoice',v_invoice_id,'Opening receivable for legacy invoice '||trim(p_invoice_no),trim(p_created_by)) returning id into v_entry_id;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit) values
 (v_entry_id,1,'CUSTOMER_RECEIVABLE',trim(p_customer_code),p_outstanding_amount,0),
 (v_entry_id,2,'OPENING_BALANCE_EQUITY',trim(p_customer_code),0,p_outstanding_amount);
 return v_invoice_id;
end; $$;

-- Collection receipt increases custody immediately; customer AR is untouched until approval.
create or replace function public.gm_accounts_record_collection(
 p_request_key text,p_customer_code text,p_customer_name text,p_collected_by text,p_collector_name text,
 p_method text,p_allocations jsonb,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing gm_accounts_collections%rowtype; v_collection_id uuid; v_total numeric(14,2):=0;
 v_row jsonb; v_invoice gm_accounts_invoices%rowtype; v_amount numeric(14,2); v_path text;
 v_entry_id uuid; v_debit_account text;
begin
 if coalesce(trim(p_request_key),'')='' or coalesce(trim(p_customer_code),'')='' or coalesce(trim(p_customer_name),'')=''
 or coalesce(trim(p_collected_by),'')='' or coalesce(trim(p_collector_name),'')='' then raise exception 'Required collection fields are missing'; end if;
 if p_method not in ('cash','upi','bank_transfer') then raise exception 'Invalid payment method'; end if;
 if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then raise exception 'At least one invoice allocation is required'; end if;
 select * into v_existing from gm_accounts_collections where request_key=trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'collectionId',v_existing.id,'status',v_existing.status); end if;
 -- Calculate the collection total before inserting because the table enforces total_amount > 0.
 for v_row in select value from jsonb_array_elements(p_allocations) loop
  v_amount:=(v_row->>'amount')::numeric(14,2); v_path:=trim(coalesce(v_row->>'evidencePath',''));
  if v_amount<=0 or v_path='' then raise exception 'Every allocation needs a positive amount and bill-photo evidence'; end if;
  v_total:=v_total+v_amount;
 end loop;
 if v_total<=0 then raise exception 'Collection total must be positive'; end if;
 insert into gm_accounts_collections(request_key,customer_code,customer_name_snapshot,collected_by,collector_name_snapshot,method,total_amount,note)
 values(trim(p_request_key),trim(p_customer_code),trim(p_customer_name),trim(p_collected_by),trim(p_collector_name),p_method,v_total,left(coalesce(p_note,''),300)) returning id into v_collection_id;
 for v_row in select value from jsonb_array_elements(p_allocations) loop
  v_amount:=(v_row->>'amount')::numeric(14,2); v_path:=trim(coalesce(v_row->>'evidencePath',''));
  select * into v_invoice from gm_accounts_invoices where id=(v_row->>'invoiceId')::uuid and customer_code=trim(p_customer_code) for update;
  if not found then raise exception 'Invoice does not belong to the selected customer'; end if;
  if v_amount>(v_invoice.initial_outstanding-coalesce((select sum(a.amount) from gm_accounts_collection_allocations a join gm_accounts_collections c on c.id=a.collection_id where a.invoice_id=v_invoice.id and c.status in ('approved','pending_approval')),0))
  then raise exception 'Allocation exceeds invoice outstanding amount'; end if;
  insert into gm_accounts_collection_allocations(collection_id,invoice_id,amount,evidence_path) values(v_collection_id,v_invoice.id,v_amount,v_path);
 end loop;
 if p_method='cash' then
  insert into gm_accounts_cash_movements(collection_id,movement_type,method,from_employee_id,amount,recorded_by,note)
  values(v_collection_id,'collection_received','cash',trim(p_collected_by),v_total,trim(p_collected_by),'Cash received; awaiting Admin approval');
 end if;
 v_debit_account:=case p_method when 'cash' then 'EMPLOYEE_CASH_CUSTODY' when 'upi' then 'UPI_CLEARING' else 'BANK' end;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('collection_received',v_collection_id,'Collection received; pending customer allocation approval',trim(p_collected_by)) returning id into v_entry_id;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,employee_id,debit,credit) values
 (v_entry_id,1,v_debit_account,case when p_method='cash' then trim(p_customer_code) else null end,case when p_method='cash' then trim(p_collected_by) else null end,v_total,0),
 (v_entry_id,2,'COLLECTION_SUSPENSE',trim(p_customer_code),null,0,v_total);
 return jsonb_build_object('ok',true,'collectionId',v_collection_id,'status','pending_approval','total',v_total);
exception when unique_violation then
 select * into v_existing from gm_accounts_collections where request_key=trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'collectionId',v_existing.id,'status',v_existing.status); end if;
 raise;
end; $$;

-- Approval atomically checks invoice balances, reduces receivables and clears collection suspense.
create or replace function public.gm_accounts_approve_collection(p_collection_id uuid,p_approved_by text)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare v_collection gm_accounts_collections%rowtype; v_alloc record; v_remaining numeric(14,2); v_entry_id uuid; v_line integer:=0;
begin
 select * into v_collection from gm_accounts_collections where id=p_collection_id for update;
 if not found then raise exception 'Collection not found'; end if;
 if v_collection.status='approved' then return jsonb_build_object('ok',true,'alreadyApproved',true,'collectionId',v_collection.id); end if;
 if v_collection.status<>'pending_approval' then raise exception 'Collection is not pending approval'; end if;
 if coalesce(trim(p_approved_by),'')='' then raise exception 'Approver is required'; end if;
 for v_alloc in select a.invoice_id,a.amount,i.initial_outstanding from gm_accounts_collection_allocations a join gm_accounts_invoices i on i.id=a.invoice_id where a.collection_id=p_collection_id order by a.invoice_id for update of i loop
  select v_alloc.initial_outstanding-coalesce(sum(a.amount),0) into v_remaining from gm_accounts_collection_allocations a join gm_accounts_collections c on c.id=a.collection_id where a.invoice_id=v_alloc.invoice_id and c.status='approved';
  if v_alloc.amount>v_remaining then raise exception 'Invoice outstanding changed; collection cannot be approved'; end if;
 end loop;
 update gm_accounts_collections set status='approved',approved_by=trim(p_approved_by),approved_at=now() where id=p_collection_id;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('collection_approved',p_collection_id,'Approved customer collection '||p_collection_id,trim(p_approved_by)) returning id into v_entry_id;
 for v_alloc in select a.invoice_id,a.amount,i.customer_code from gm_accounts_collection_allocations a join gm_accounts_invoices i on i.id=a.invoice_id where a.collection_id=p_collection_id order by a.invoice_id loop
  v_line:=v_line+1;
  insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit)
  values(v_entry_id,v_line,'COLLECTION_SUSPENSE',v_alloc.customer_code,v_alloc.amount,0);
  v_line:=v_line+1;
  insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,customer_code,debit,credit)
  values(v_entry_id,v_line,'CUSTOMER_RECEIVABLE',v_alloc.customer_code,0,v_alloc.amount);
 end loop;
 return jsonb_build_object('ok',true,'collectionId',p_collection_id,'status','approved');
end; $$;

revoke all on public.gm_accounts_invoices,public.gm_accounts_collections,public.gm_accounts_collection_allocations,
 public.gm_accounts_journal_entries,public.gm_accounts_journal_lines,public.gm_accounts_cash_movements,public.gm_accounts_cash_denominations from anon,authenticated;
revoke all on function public.gm_accounts_create_opening_invoice(text,text,text,date,numeric,numeric,text,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_record_collection(text,text,text,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_approve_collection(uuid,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_opening_invoice(text,text,text,date,numeric,numeric,text,text) to service_role;
grant execute on function public.gm_accounts_record_collection(text,text,text,text,text,text,jsonb,text) to service_role;
grant execute on function public.gm_accounts_approve_collection(uuid,text) to service_role;
