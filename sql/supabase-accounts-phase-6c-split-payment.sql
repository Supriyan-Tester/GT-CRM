-- Accounts Phase 6C: one customer visit paid in more than one way (for example part cash, part UPI).
-- Apply AFTER Phase 1, 5A-5E, 6A and 6B, on a staging project first.
--
-- A split visit is stored as one normal collection PER payment method, linked by the same visit_ref. Each linked
-- collection goes through the existing approval, cash custody, UPI clearing and daily closing exactly as before,
-- so no money rule changes. This function records all the linked collections in ONE database call: either every
-- part is saved or none is, and sending the same request again does not create duplicates.
alter table public.gm_accounts_collections add column if not exists visit_ref text;
create index if not exists gm_accounts_collections_visit_ref_idx on public.gm_accounts_collections(visit_ref) where visit_ref is not null;

-- p_parts: [{"method":"cash","allocations":[{"invoiceId":"...","amount":3000,"evidencePath":"..."}]}, {"method":"upi","allocations":[...]}]
-- The same invoice may appear in more than one part (an invoice can be paid partly in cash and partly by UPI).
create or replace function public.gm_accounts_record_split_collection(
 p_request_key text,p_customer_code text,p_customer_name text,p_collected_by text,p_collector_name text,
 p_parts jsonb,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_part jsonb; v_method text; v_methods text[]:='{}'; v_result jsonb; v_results jsonb:='[]'::jsonb; v_key text:=trim(coalesce(p_request_key,''));
begin
 if v_key='' or char_length(v_key)>90 then raise exception 'A valid collection request reference is required'; end if;
 if jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts)<2 or jsonb_array_length(p_parts)>3 then
  raise exception 'A split payment needs two or three payment methods'; end if;
 for v_part in select value from jsonb_array_elements(p_parts) loop
  v_method:=v_part->>'method';
  if v_method is null or v_method not in ('cash','upi','bank_transfer') then raise exception 'Invalid payment method'; end if;
  if v_method=any(v_methods) then raise exception 'Each payment method can appear only once in a split payment'; end if;
  v_methods:=v_methods||v_method;
  v_result:=public.gm_accounts_record_collection(v_key||':'||v_method,p_customer_code,p_customer_name,p_collected_by,p_collector_name,v_method,v_part->'allocations',p_note);
  update gm_accounts_collections set visit_ref=v_key where id=(v_result->>'collectionId')::uuid;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('method',v_method,'collectionId',v_result->>'collectionId','status',v_result->>'status','total',v_result->'total','alreadyRecorded',coalesce((v_result->>'alreadyRecorded')::boolean,false)));
 end loop;
 return jsonb_build_object('ok',true,'visitRef',v_key,'collections',v_results);
end; $$;

revoke all on function public.gm_accounts_record_split_collection(text,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_record_split_collection(text,text,text,text,text,jsonb,text) to service_role;
