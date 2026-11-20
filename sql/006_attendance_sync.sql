-- Run in the NEW Supabase SQL Editor (after 001-005). Safe to run twice.
-- Adds what the attendance / leaves / notifications copy needs: the old id and a place for the original record.
alter table public.employee_attendance add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.employee_leaves add column if not exists legacy_id text;
alter table public.employee_leaves add column if not exists extra jsonb not null default '{}'::jsonb;
create unique index if not exists employee_leaves_legacy_id_uidx on public.employee_leaves(legacy_id);

alter table public.notifications add column if not exists legacy_id text;
alter table public.notifications add column if not exists extra jsonb not null default '{}'::jsonb;
create unique index if not exists notifications_legacy_id_uidx on public.notifications(legacy_id);

notify pgrst, 'reload schema';
