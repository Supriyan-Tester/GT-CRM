-- Run in the NEW Supabase SQL Editor (after 001-004). Safe to run twice.
-- Adds what the delivery plans / pin tasks copy needs: the old id, and a place for the original record.
alter table public.delivery_plans add column if not exists legacy_id text;
create unique index if not exists delivery_plans_legacy_id_uidx on public.delivery_plans(legacy_id);
alter table public.delivery_plan_stops add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.customer_pin_tasks add column if not exists legacy_id text;
alter table public.customer_pin_tasks add column if not exists extra jsonb not null default '{}'::jsonb;
create unique index if not exists customer_pin_tasks_legacy_id_uidx on public.customer_pin_tasks(legacy_id);

notify pgrst, 'reload schema';
