-- GM-CRM Accounts Phase 5A: employee cash custody and controlled handover.
-- Additive migration. Apply only after reviewing and testing in Supabase staging.
create index if not exists gm_accounts_cash_movements_from_status_idx
  on public.gm_accounts_cash_movements(from_employee_id,status,recorded_at desc);
create index if not exists gm_accounts_cash_movements_to_status_idx
  on public.gm_accounts_cash_movements(to_employee_id,status,recorded_at desc);
create unique index if not exists gm_accounts_cash_handover_request_uidx
  on public.gm_accounts_cash_movements(reference) where movement_type='handover' and reference like 'handover:%';

create or replace function public.gm_accounts_create_cash_handover(
 p_request_key text,p_from_employee_id text,p_to_employee_id text,p_amount numeric,
 p_denominations jsonb,p_note text,p_recorded_by text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing gm_accounts_cash_movements%rowtype; v_sum numeric(14,2):=0;
 v_row jsonb; v_denom numeric(8,2); v_count integer;
begin
 if coalesce(trim(p_request_key),'')='' or coalesce(trim(p_from_employee_id),'')='' or coalesce(trim(p_to_employee_id),'')='' or coalesce(trim(p_recorded_by),'')='' then raise exception 'Required handover fields are missing'; end if;
 if p_from_employee_id=p_to_employee_id then raise exception 'Sender and recipient must be different employees'; end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 then raise exception 'Invalid handover amount'; end if;
 if jsonb_typeof(p_denominations)<>'array' or jsonb_array_length(p_denominations)=0 then raise exception 'Cash denomination counts are required'; end if;
 select * into v_existing from gm_accounts_cash_movements where reference='handover:'||trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'movementId',v_existing.id,'status',v_existing.status); end if;
 for v_row in select value from jsonb_array_elements(p_denominations) loop
  v_denom:=(v_row->>'denomination')::numeric(8,2); v_count:=(v_row->>'pieceCount')::integer;
  if v_denom not in (500,200,100,50,20,10) or v_count<0 then raise exception 'Invalid denomination count'; end if;
  if exists(select 1 from jsonb_array_elements(p_denominations) x where x->>'denomination'=v_row->>'denomination' having count(*)>1) then raise exception 'Duplicate denomination row'; end if;
  v_sum:=v_sum+(v_denom*v_count);
 end loop;
 if (select count(distinct (x->>'denomination')) from jsonb_array_elements(p_denominations) x)<>6 then raise exception 'All six denomination types must be supplied'; end if;
 if v_sum<>p_amount then raise exception 'Denomination total must equal the declared handover amount'; end if;
 insert into gm_accounts_cash_movements(movement_type,method,from_employee_id,to_employee_id,amount,status,reference,note,recorded_by)
 values('handover','cash',trim(p_from_employee_id),trim(p_to_employee_id),p_amount,'recorded','handover:'||trim(p_request_key),left(coalesce(p_note,''),300),trim(p_recorded_by)) returning id into v_id;
 for v_row in select value from jsonb_array_elements(p_denominations) loop
  insert into gm_accounts_cash_denominations(movement_id,denomination,piece_count)
  values(v_id,(v_row->>'denomination')::numeric(8,2),(v_row->>'pieceCount')::integer);
 end loop;
 return jsonb_build_object('ok',true,'movementId',v_id,'status','recorded','amount',p_amount);
exception when unique_violation then
 select * into v_existing from gm_accounts_cash_movements where reference='handover:'||trim(p_request_key);
 if found then return jsonb_build_object('ok',true,'alreadyRecorded',true,'movementId',v_existing.id,'status',v_existing.status); end if;
 raise;
end; $$;

create or replace function public.gm_accounts_confirm_cash_handover(p_movement_id uuid,p_confirmed_by text)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare v_move gm_accounts_cash_movements%rowtype; v_balance numeric(14,2); v_entry uuid;
begin
 select * into v_move from gm_accounts_cash_movements where id=p_movement_id for update;
 if not found then raise exception 'Handover not found'; end if;
 if v_move.movement_type<>'handover' then raise exception 'Movement is not a handover'; end if;
 if v_move.status='confirmed' then return jsonb_build_object('ok',true,'alreadyConfirmed',true,'movementId',v_move.id); end if;
 if v_move.status<>'recorded' then raise exception 'Handover is not awaiting confirmation'; end if;
 perform pg_advisory_xact_lock(hashtext(v_move.from_employee_id));
 if coalesce(trim(p_confirmed_by),'')='' or trim(p_confirmed_by)<>v_move.to_employee_id then raise exception 'Only the named recipient can confirm this handover'; end if;
 select coalesce(sum(l.debit-l.credit),0) into v_balance from gm_accounts_journal_lines l where l.account_code='EMPLOYEE_CASH_CUSTODY' and l.employee_id=v_move.from_employee_id;
 if v_balance<v_move.amount then raise exception 'Sender cash custody balance is insufficient'; end if;
 insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
 values('cash_handover',v_move.id,'Confirmed cash handover from '||v_move.from_employee_id||' to '||v_move.to_employee_id,trim(p_confirmed_by)) returning id into v_entry;
 insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values
 (v_entry,1,'EMPLOYEE_CASH_CUSTODY',v_move.to_employee_id,v_move.amount,0),
 (v_entry,2,'EMPLOYEE_CASH_CUSTODY',v_move.from_employee_id,0,v_move.amount);
 update gm_accounts_cash_movements set status='confirmed',confirmed_by=trim(p_confirmed_by),confirmed_at=now() where id=v_move.id;
 return jsonb_build_object('ok',true,'movementId',v_move.id,'status','confirmed');
end; $$;

create or replace function public.gm_accounts_dispute_cash_handover(p_movement_id uuid,p_disputed_by text,p_reason text)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare v_move gm_accounts_cash_movements%rowtype;
begin
 select * into v_move from gm_accounts_cash_movements where id=p_movement_id for update;
 if not found then raise exception 'Handover not found'; end if;
 if v_move.movement_type<>'handover' or v_move.status<>'recorded' then raise exception 'Handover cannot be disputed in its current state'; end if;
 if coalesce(trim(p_disputed_by),'')<>v_move.to_employee_id then raise exception 'Only the named recipient can dispute this handover'; end if;
 if coalesce(trim(p_reason),'')='' then raise exception 'A dispute reason is required'; end if;
 update gm_accounts_cash_movements set status='disputed',confirmed_by=trim(p_disputed_by),note=left(coalesce(note,'')||' | DISPUTED: '||trim(p_reason),600) where id=v_move.id;
 return jsonb_build_object('ok',true,'movementId',v_move.id,'status','disputed');
end; $$;

revoke all on function public.gm_accounts_create_cash_handover(text,text,text,numeric,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_confirm_cash_handover(uuid,text) from public,anon,authenticated;
revoke all on function public.gm_accounts_dispute_cash_handover(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_create_cash_handover(text,text,text,numeric,jsonb,text,text) to service_role;
grant execute on function public.gm_accounts_confirm_cash_handover(uuid,text) to service_role;
grant execute on function public.gm_accounts_dispute_cash_handover(uuid,text,text) to service_role;
