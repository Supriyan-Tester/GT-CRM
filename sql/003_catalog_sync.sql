-- Run in the NEW Supabase SQL Editor (after 001 and 002). Safe to run twice.
-- Adds what the products / vehicles / routes / customers copy needs.
alter table public.routes add column if not exists legacy_id text;
alter table public.routes add column if not exists extra jsonb not null default '{}'::jsonb;
create unique index if not exists routes_legacy_id_uidx on public.routes(legacy_id);

alter table public.vehicle_fuel_logs add column if not exists legacy_id text;
alter table public.vehicle_fuel_logs add column if not exists extra jsonb not null default '{}'::jsonb;
create unique index if not exists vehicle_fuel_logs_legacy_id_uidx on public.vehicle_fuel_logs(legacy_id);

-- "removed" marker: a deleted item is marked, never erased (orders and history may point at it)
alter table public.products  add column if not exists removed_at timestamptz;
alter table public.vehicles  add column if not exists removed_at timestamptz;
alter table public.routes    add column if not exists removed_at timestamptz;
alter table public.customers add column if not exists removed_at timestamptz;

notify pgrst, 'reload schema';
