-- Phase 12: faster Collections page. Run once, BEFORE restarting the server with the new accounts.routes.js. Safe to re-run. No new tables.
-- The page used to download every collection row (and every payment on each listed invoice) just to add them up.
-- These two read-only functions let the database add them up and return a few numbers instead.

-- The tile numbers at the top of the Collections page.
create or replace function public.gm_accounts_collection_stats(p_month_start timestamptz)
returns table (pending_count bigint, pending_amount numeric, approved_count bigint, rejected_count bigint,
               correction_count bigint, approved_month_amount numeric)
language sql stable security definer set search_path = public as $$
  select
    count(*) filter (where status = 'pending_approval'),
    coalesce(sum(total_amount) filter (where status = 'pending_approval'), 0),
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'correction_requested'),
    coalesce(sum(total_amount) filter (where status = 'approved' and approved_at >= p_month_start), 0)
  from public.gm_accounts_collections
  where status in ('pending_approval', 'approved', 'rejected', 'correction_requested');
$$;
comment on function public.gm_accounts_collection_stats(timestamptz) is
  'Counts per status, the pending amount and this month''s approved amount. Read-only. Used by the Collections page.';

-- How much has been paid (approved payments only) against each of the given invoices.
create or replace function public.gm_accounts_invoice_paid(p_invoice_ids uuid[])
returns table (invoice_id uuid, paid numeric)
language sql stable security definer set search_path = public as $$
  select a.invoice_id, coalesce(sum(a.amount), 0)
  from public.gm_accounts_collection_allocations a
  join public.gm_accounts_collections c on c.id = a.collection_id and c.status = 'approved'
  where a.invoice_id = any (p_invoice_ids)
  group by a.invoice_id;
$$;
comment on function public.gm_accounts_invoice_paid(uuid[]) is
  'Approved payments added up per invoice. Read-only. Used by the Collections page.';

-- Lets the approved-this-month sum use an index instead of reading every approved row.
create index if not exists gm_accounts_collection_approved_at_idx
  on public.gm_accounts_collections (approved_at) where status = 'approved';

revoke all on function public.gm_accounts_collection_stats(timestamptz) from public, anon, authenticated;
revoke all on function public.gm_accounts_invoice_paid(uuid[]) from public, anon, authenticated;
grant execute on function public.gm_accounts_collection_stats(timestamptz) to service_role;
grant execute on function public.gm_accounts_invoice_paid(uuid[]) to service_role;
