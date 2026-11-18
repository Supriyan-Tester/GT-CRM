-- Phase 8B: Cash Closing, receive part of an employee's balance (earlier days and today separately).
-- Run once in the Supabase SQL editor. Safe to re-run. Does not change the existing gm_accounts_receive_cash function.
-- p_expected is the part being closed (it must not be more than the employee's balance). The request key starts with
-- cc-e- (earlier days) or cc-t- (today) so the Cash Closing screen knows which part was closed.

create or replace function public.gm_accounts_receive_cash_part(
  p_request_key text, p_employee_id text, p_expected numeric, p_denominations jsonb,
  p_reason text, p_difference_action text, p_received_by text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing gm_accounts_cash_movements%rowtype; v_row jsonb; v_d numeric; v_n integer; v_counted numeric(14,2):=0;
  v_balance numeric(14,2); v_part numeric(14,2); v_diff numeric(14,2); v_move uuid; v_entry uuid; v_line smallint:=0; v_seen numeric[]:='{}'; v_action text:=coalesce(p_difference_action,''); v_reason text:=coalesce(p_reason,'');
begin
  if coalesce(trim(p_request_key),'')='' or coalesce(trim(p_employee_id),'')='' or coalesce(trim(p_received_by),'')='' then raise exception 'Required cash receipt fields are missing'; end if;
  if trim(p_employee_id)=trim(p_received_by) then raise exception 'You cannot receive cash from yourself'; end if;
  select * into v_existing from gm_accounts_cash_movements where reference='cash-closing:'||trim(p_request_key);
  if found then return jsonb_build_object('ok',true,'alreadyReceived',true,'movementId',v_existing.id); end if;
  if jsonb_typeof(p_denominations)<>'array' or jsonb_array_length(p_denominations)<>9 then raise exception 'All nine denomination counts are required'; end if;
  for v_row in select value from jsonb_array_elements(p_denominations) loop
    v_d:=(v_row->>'denomination')::numeric; v_n:=(v_row->>'pieceCount')::integer;
    if v_d not in (500,200,100,50,20,10,5,2,1) or v_n is null or v_n<0 or v_n>100000 then raise exception 'Invalid denomination count'; end if;
    if v_d=any(v_seen) then raise exception 'Duplicate denomination row'; end if;
    v_seen:=v_seen||v_d; v_counted:=v_counted+v_d*v_n;
  end loop;
  if v_counted<=0 then raise exception 'Enter the cash you counted'; end if;
  perform pg_advisory_xact_lock(hashtext('gm_accounts_employee_cash:'||trim(p_employee_id)));
  select coalesce(sum(debit-credit),0) into v_balance from gm_accounts_journal_lines where account_code='EMPLOYEE_CASH_CUSTODY' and employee_id=trim(p_employee_id);
  if v_balance<=0 then raise exception 'This employee holds no cash'; end if;
  v_part:=round(coalesce(p_expected,0),2);
  if v_part<=0 then raise exception 'Enter a valid amount to receive'; end if;
  if round(v_balance,2)<v_part then raise exception 'Employee balance changed. Refresh and count again'; end if;
  v_diff:=round(v_part-v_counted,2);
  -- Bills are rounded off to the whole rupee: counting the rounded amount is a match, the paise are cleared as round-off.
  if v_diff<>0 and v_counted=round(v_part,0) then v_action:='record'; v_reason:='Round-off to the nearest rupee'; end if;
  if v_diff<>0 then
    if trim(v_reason)='' then raise exception 'A reason is required when the count differs'; end if;
    if v_action not in ('record','employee') then raise exception 'Choose how to handle the difference'; end if;
  end if;

  insert into gm_accounts_cash_movements(movement_type,method,from_employee_id,to_employee_id,amount,status,reference,note,recorded_by,confirmed_by,confirmed_at)
  values('office_receipt','cash',trim(p_employee_id),'OFFICE',v_counted,'confirmed','cash-closing:'||trim(p_request_key),left(v_reason,300),trim(p_received_by),trim(p_received_by),now())
  returning id into v_move;
  insert into gm_accounts_cash_denominations(movement_id,denomination,piece_count)
  select v_move,(x->>'denomination')::numeric,(x->>'pieceCount')::integer from jsonb_array_elements(p_denominations) x;

  insert into gm_accounts_journal_entries(source_type,source_id,description,posted_by)
  values('office_cash_receipt',v_move,'Cash closing: received from employee '||trim(p_employee_id),trim(p_received_by)) returning id into v_entry;
  insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values
    (v_entry,1,'OFFICE_CASH',null,v_counted,0);
  if v_diff=0 then
    insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values (v_entry,2,'EMPLOYEE_CASH_CUSTODY',trim(p_employee_id),0,v_counted);
  elsif v_action='employee' then
    -- Employee is credited exactly what was counted: a shortage stays on their balance, an excess leaves them in credit.
    insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values (v_entry,2,'EMPLOYEE_CASH_CUSTODY',trim(p_employee_id),0,v_counted);
  elsif v_diff>0 then
    -- Shortage recorded only: employee balance is cleared, the shortage is parked in suspense.
    insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values
      (v_entry,2,'EMPLOYEE_CASH_CUSTODY',trim(p_employee_id),0,v_part),
      (v_entry,3,'COLLECTION_SUSPENSE',null,v_diff,0);
  else
    -- Excess recorded only: employee balance is cleared, the excess is parked in suspense.
    insert into gm_accounts_journal_lines(journal_entry_id,line_no,account_code,employee_id,debit,credit) values
      (v_entry,2,'EMPLOYEE_CASH_CUSTODY',trim(p_employee_id),0,v_part),
      (v_entry,3,'COLLECTION_SUSPENSE',null,0,-v_diff);
  end if;
  if v_diff<>0 then
    insert into gm_accounts_cash_movements(movement_type,method,from_employee_id,to_employee_id,amount,status,reference,note,recorded_by,confirmed_by,confirmed_at)
    values(case when v_diff>0 then 'shortage' else 'excess' end,'cash',trim(p_employee_id),'OFFICE',abs(v_diff),'confirmed',
      'cash-closing-diff:'||v_move,left(v_action||': '||v_reason,300),trim(p_received_by),trim(p_received_by),now());
  end if;
  return jsonb_build_object('ok',true,'movementId',v_move,'counted',v_counted,'difference',v_diff,'status','confirmed');
end; $$;

revoke all on function public.gm_accounts_receive_cash_part(text,text,numeric,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.gm_accounts_receive_cash_part(text,text,numeric,jsonb,text,text,text) to service_role;
