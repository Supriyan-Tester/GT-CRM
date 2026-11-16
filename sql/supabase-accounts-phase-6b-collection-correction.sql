-- Accounts Phase 6B: ask the employee to correct a pending customer collection.
-- Apply AFTER Phase 1, 5A-5E and 6A, on a staging project first.
--
-- "Request correction" means: "something about this collection is wrong (wrong invoice, unclear bill photo, wrong
-- amount); please record it again correctly". It behaves like Phase 6A reject, with a different message to the employee:
--   * the customer's receivable is NOT reduced (it only ever drops on approval);
--   * the invoice amounts it had reserved become available again, so the employee can record a fresh collection;
--   * the money recorded when the collection was received STAYS where it is (employee cash, UPI or bank), because the
--     cash or transfer physically exists. Nothing is posted to the ledger here, so the daily closing still matches.
-- The corrected collection is a NEW collection. The old one stays on record, marked "correction requested".
alter table public.gm_accounts_collections add column if not exists correction_note text;
alter table public.gm_accounts_collections add column if not exists correction_requested_by text;
alter table public.gm_accounts_collections add column if not exists correction_requested_at timestamptz;

-- The status list is a check constraint. Replace whichever one lists the collection statuses.
do $$
declare c record;
begin
 for c in select conname from pg_constraint
   where conrelid='public.gm_accounts_collections'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%pending_approval%' and pg_get_constraintdef(oid) like '%rejected%'
 loop
  execute format('alter table public.gm_accounts_collections drop constraint %I',c.conname);
 end loop;
 alter table public.gm_accounts_collections add constraint gm_accounts_collections_status_check
  check (status in ('pending_approval','approved','rejected','reversed','correction_requested'));
end $$;

create or replace function public.gm_accounts_request_collection_correction(p_collection_id uuid,p_requested_by text,p_note text)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare v_collection gm_accounts_collections%rowtype; v_note text:=left(trim(coalesce(p_note,'')),300);
begin
 if coalesce(trim(p_requested_by),'')='' then raise exception 'Requesting user is required'; end if;
 if char_length(v_note)<3 then raise exception 'A note of at least 3 characters is required'; end if;
 select * into v_collection from gm_accounts_collections where id=p_collection_id for update;
 if not found then raise exception 'Collection not found'; end if;
 if v_collection.status='correction_requested' then return jsonb_build_object('ok',true,'alreadyRequested',true,'collectionId',v_collection.id); end if;
 if v_collection.status<>'pending_approval' then raise exception 'Collection is not pending approval'; end if;
 update gm_accounts_collections
  set status='correction_requested',correction_note=v_note,correction_requested_by=left(trim(p_requested_by),80),correction_requested_at=now()
  where id=p_collection_id;
 return jsonb_build_object('ok',true,'collectionId',p_collection_id,'status','correction_requested');
end; $$;

revoke all on function public.gm_accounts_request_collection_correction(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_request_collection_correction(uuid,text,text) to service_role;
