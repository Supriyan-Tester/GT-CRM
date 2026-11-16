-- GM-CRM Accounts Phase 5C: UPI clearing to bank settlement and reconciliation.
-- Bank balance is updated only after Billing verifies the credit against the bank statement.
create table if not exists public.gm_accounts_upi_settlements (
 id uuid primary key default gen_random_uuid(), request_key text not null unique,
 amount numeric(14,2) not null check(amount>0), bank_reference text not null unique,
 bank_credit_date date not null, note text not null default '',
 status text not null default 'pending' check(status in ('pending','confirmed','disputed')),
 recorded_by text not null, recorded_at timestamptz not null default now(),
 confirmed_by text, confirmed_at timestamptz, dispute_reason text, disputed_by text, disputed_at timestamptz
);
create index if not exists gm_accounts_upi_settlement_status_idx on public.gm_accounts_upi_settlements(status,recorded_at desc);
alter table public.gm_accounts_upi_settlements enable row level security;

create or replace function public.gm_accounts_create_upi_settlement(
 p_request_key text,p_amount numeric,p_bank_reference text,p_bank_credit_date date,p_note text default '',p_recorded_by text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing gm_accounts_upi_settlements%rowtype; v_id uuid;
begin
 if coalesce(trim(p_request_key),'')='' or coalesce(trim(p_bank_reference),'')='' or coalesce(trim(p_recorded_by),'')='' or p_bank_credit_date is null then raise exception 'Required UPI settlement fields are missing'; end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 then raise exception 'Invalid UPI settlement amount'; end if;
 select * into v_existing from gm_accounts_upi_settlements where request_key=trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'settlementId',v_existing.id,'status',v_existing.status); end if;
 insert into gm_accounts_upi_settlements(request_key,amount,bank_reference,bank_credit_date,note,recorded_by)
 values(trim(p_request_key),p_amount,trim(p_bank_reference),p_bank_credit_date,left(coalesce(p_note,''),300),trim(p_recorded_by)) returning id into v_id;
 return jsonb_build_object('ok',true,'settlementId',v_id,'status','pending');
end; $$;

create or replace function public.gm_accounts_confirm_upi_settlement(p_settlement_id uuid,p_confirmed_by text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row gm_accounts_upi_settlements%rowtype; v_balance numeric(14,2); v_entry uuid;
begin
 select * into v_row from gm_accounts_upi_settlements where id=p_settlement_id for update;
 if not found then raise exception 'UPI settlement not found'; end if;
 if v_row.status='confirmed' then return jsonb_build_object('ok',true,'alreadyConfirmed',true,'settlementId',v_row.id); end if;
 if v_row.status<>'pending' then raise exception 'UPI settlement is not pending'; end if;
 if coalesce(trim(p_confirmed_by),'')='' or trim(p_confirmed_by)=v_row.recorded_by then raise exception 'A different authorised Billing employee must verify the bank credit'; end if;
 perform pg_advisory_xact_lock(hashtext('gm_accounts_upi_clearing'));
 select coalesce(sum(debit-credit),0) into v_balance from gm_accounts_journal_lines where account_code='UPI_CLEARING';
 if v_balance<v_row.amount then raise exception 'UPI clearing balance is insufficient for this settlement'; end if;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('upi_bank_settlement',v_row.id,'UPI settlement to bank: '||v_row.bank_reference,trim(p_confirmed_by)) returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,debit,credit) values
 (v_entry,1,'BANK',v_row.amount,0),(v_entry,2,'UPI_CLEARING',0,v_row.amount);
 update gm_accounts_upi_settlements set status='confirmed',confirmed_by=trim(p_confirmed_by),confirmed_at=now() where id=v_row.id;
 return jsonb_build_object('ok',true,'settlementId',v_row.id,'status','confirmed');
end; $$;

create or replace function public.gm_accounts_dispute_upi_settlement(p_settlement_id uuid,p_disputed_by text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row gm_accounts_upi_settlements%rowtype;
begin
 select * into v_row from gm_accounts_upi_settlements where id=p_settlement_id for update;
 if not found or v_row.status<>'pending' then raise exception 'Only pending UPI settlements can be disputed'; end if;
 if coalesce(trim(p_disputed_by),'')='' or trim(p_disputed_by)=v_row.recorded_by or coalesce(trim(p_reason),'')='' then raise exception 'A different Billing employee and dispute reason are required'; end if;
 update gm_accounts_upi_settlements set status='disputed',disputed_by=trim(p_disputed_by),disputed_at=now(),dispute_reason=left(trim(p_reason),300) where id=v_row.id;
 return jsonb_build_object('ok',true,'settlementId',v_row.id,'status','disputed');
end; $$;
revoke all on function public.gm_accounts_create_upi_settlement(text,numeric,text,date,text,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_confirm_upi_settlement(uuid,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_dispute_upi_settlement(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_upi_settlement(text,numeric,text,date,text,text) to service_role;
grant execute on function public.gm_accounts_confirm_upi_settlement(uuid,text) to service_role;
grant execute on function public.gm_accounts_dispute_upi_settlement(uuid,text,text) to service_role;
