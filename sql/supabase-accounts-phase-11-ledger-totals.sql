-- Phase 11: fast ledger totals. Run once AFTER phase 10. Safe to re-run. No new tables.
-- Why no summary table: a stored balance can drift from the journal. The journal stays the single source
-- of truth; the database adds it up with a covering index instead of the server downloading every row.

create index if not exists gm_accounts_journal_lines_account_idx
  on public.gm_accounts_journal_lines (account_code, employee_id) include (debit, credit);

create or replace function public.gm_accounts_ledger_totals(p_accounts text[], p_employee_id text default null)
returns table (account_code text, employee_id text, debit numeric, credit numeric)
language sql stable security definer set search_path = public as $$
  select l.account_code, l.employee_id, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  from public.gm_accounts_journal_lines l
  where l.account_code = any (p_accounts)
    and (p_employee_id is null or l.employee_id = p_employee_id)
  group by l.account_code, l.employee_id;
$$;
comment on function public.gm_accounts_ledger_totals(text[], text) is
  'Debit and credit totals per account and employee from the journal. Read-only. Used by the Cash and Accounts screens.';

revoke all on function public.gm_accounts_ledger_totals(text[], text) from public, anon, authenticated;
grant execute on function public.gm_accounts_ledger_totals(text[], text) to service_role;
