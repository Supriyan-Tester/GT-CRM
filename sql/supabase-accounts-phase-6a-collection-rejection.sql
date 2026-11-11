-- Accounts Phase 6A: reject a pending customer collection.
-- Apply AFTER Phase 1 and 5A-5E, on a staging project first.
--
-- Rejecting a collection means "this payment is not accepted against the customer's invoices".
--   * the customer's receivable is NOT reduced (it only ever drops on approval);
--   * the invoice amounts it had reserved become available again (only approved and pending collections count);
--   * the money that was recorded when the collection was received STAYS where it is (employee cash, UPI or bank, against
--     "collection suspense"), because the cash or transfer physically exists. Nothing is posted to the ledger here, so the
--     daily closing still matches the cash actually held. What happens to that money next (hand back, refund, re-record)
--     is a separate, deliberate step.
alter table public.gm_accounts_collections add column if not exists rejected_by text;
alter table public.gm_accounts_collections add column if not exists rejected_at timestamptz;

create or replace function public.gm_accounts_reject_collection(p_collection_id uuid,p_rejected_by text,p_reason text)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare v_collection gm_accounts_collections%rowtype; v_reason text:=left(trim(coalesce(p_reason,'')),300);
begin
 if coalesce(trim(p_rejected_by),'')='' then raise exception 'Rejecting user is required'; end if;
 if char_length(v_reason)<3 then raise exception 'A reason of at least 3 characters is required'; end if;
 select * into v_collection from gm_accounts_collections where id=p_collection_id for update;
 if not found then raise exception 'Collection not found'; end if;
 if v_collection.status='rejected' then return jsonb_build_object('ok',true,'alreadyRejected',true,'collectionId',v_collection.id); end if;
 if v_collection.status<>'pending_approval' then raise exception 'Collection is not pending approval'; end if;
 update gm_accounts_collections
  set status='rejected',rejection_reason=v_reason,rejected_by=left(trim(p_rejected_by),80),rejected_at=now()
  where id=p_collection_id;
 return jsonb_build_object('ok',true,'collectionId',p_collection_id,'status','rejected');
end; $$;

revoke all on function public.gm_accounts_reject_collection(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_reject_collection(uuid,text,text) to service_role;
