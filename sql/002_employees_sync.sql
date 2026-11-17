-- Run in the NEW Supabase SQL Editor (after 001_gt_core.sql). Safe to run twice.
-- Lets the employees step match each advance to the old ledger entry, and mark removed people without deleting them.
alter table public.employee_advances add column if not exists legacy_id text;
create unique index if not exists employee_advances_legacy_id_uidx on public.employee_advances(legacy_id);
alter table public.employees add column if not exists removed_at timestamptz;
