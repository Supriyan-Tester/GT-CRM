-- Run in the NEW Supabase SQL Editor (after 001, 002, 003). Safe to run twice.
-- Adds what the sales orders / shop visits / returns copy needs: a place for the original record,
-- and one-row-per-product protection on return lines.
alter table public.sales_shop_visits add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.sales_order_items add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.product_return_items add column if not exists extra jsonb not null default '{}'::jsonb;
create unique index if not exists product_return_items_return_product_uidx on public.product_return_items(return_id, product_id);

notify pgrst, 'reload schema';
