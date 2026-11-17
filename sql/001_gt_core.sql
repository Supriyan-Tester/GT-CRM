-- ============================================================================
-- GT-CRM core schema  (001)  -- safe to run more than once
-- Run in the NEW Supabase: SQL Editor -> New query -> paste -> Run.
-- Accounts tables are NOT here on purpose: your existing gm_accounts_* tables (with all their rules)
-- are renamed to accounts_* later in the accounts step, so no accounting data is ever re-typed.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- helpers ---------------------------------------------------------
-- Today's date in India. (current_date is UTC and gives yesterday between 12:00 AM and 5:30 AM.)
create or replace function public.ist_today() returns date
  language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- 1. employees & access ------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique not null,
  legacy_id text unique,                           -- old id such as 'W001' / 'A1', used while both systems run
  full_name text not null,
  phone text unique not null check (phone ~ '^[0-9]{10}$'),
  alt_phone text not null default '',
  email text not null default '',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  gender text not null default '',
  date_of_birth date,
  address text not null default '',
  id_number text not null default '',
  monthly_salary numeric(12, 2) check (monthly_salary is null or monthly_salary >= 0),
  role text not null check (role in ('super_admin','admin','sales','billing','inventory','delivery','helper','loading')),
  module_permissions text[] not null default '{}',
  sales_page_permissions text[] not null default '{}',
  password_hash text not null,
  must_change_password boolean not null default false,
  is_active boolean not null default true,
  joined_date date not null default public.ist_today(),
  relieved_date date,
  notes text not null default '',
  last_login_at timestamptz,
  privacy_consent_at timestamptz,
  extra jsonb not null default '{}'::jsonb,        -- any old field that has no column yet, so nothing is lost
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_sessions (
  token_hash text primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  portal_role text not null check (portal_role in ('admin','sales','employee')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_leaves (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  approved_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  entry_date date not null default public.ist_today(),
  entry_type text not null check (entry_type in ('advance','deduction','repayment')),
  amount numeric(12, 2) not null check (amount > 0),
  note text not null default '',
  recorded_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 2. fleet --------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text unique not null,
  legacy_id text unique,
  registration_no text unique not null,
  vehicle_name text not null,
  current_odometer integer not null default 0 check (current_odometer >= 0),
  insurance_expiry_date date,
  permit_expiry_date date,
  fitness_expiry_date date,
  is_active boolean not null default true,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  fill_date date not null default public.ist_today(),
  liters numeric(8, 2) not null check (liters > 0),
  total_cost numeric(12, 2) not null check (total_cost > 0),
  odometer_reading integer not null check (odometer_reading >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  service_date date not null default public.ist_today(),
  service_type text not null,
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  odometer_reading integer check (odometer_reading >= 0),
  workshop_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- 3. attendance & live location ----------------------------------
create table if not exists public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  attendance_date date not null,
  status text not null default 'present' check (status in ('present','late','half_day','absent')),
  punch_in_at timestamptz,
  punch_out_at timestamptz,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  start_km integer check (start_km >= 0),
  end_km integer check (end_km >= 0),
  driven_km integer default 0 check (driven_km >= 0),
  punch_in_lat numeric(10, 6),
  punch_in_lng numeric(10, 6),
  punch_out_lat numeric(10, 6),
  punch_out_lng numeric(10, 6),
  is_closed_by_office boolean not null default false,
  office_edit_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date),
  check (end_km is null or start_km is null or end_km >= start_km)
);

create table if not exists public.employee_locations (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  lat numeric(10, 6) not null,
  lng numeric(10, 6) not null,
  accuracy_meters integer not null default 0,
  refresh_requested boolean not null default false,
  recorded_at timestamptz not null default now()
);

-- ---------- 4. routes, customers, pin tasks --------------------------------
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  route_code text unique not null,
  route_name text unique not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique not null,
  shop_name text not null,
  contact_name text not null default '',
  phone text not null default '',
  address text not null default '',
  area text not null default '',
  gstin text not null default '',
  route_id uuid references public.routes(id) on delete set null,
  route_sequence integer not null default 0,
  lat numeric(10, 6),
  lng numeric(10, 6),
  pin_accuracy_meters integer,
  pin_saved_by uuid references public.employees(id) on delete set null,
  pin_saved_at timestamptz,
  is_active boolean not null default true,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_pin_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  assigned_to_employee_id uuid references public.employees(id) on delete cascade, -- null = all field staff
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- 5. products & stock --------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text unique not null,
  legacy_id text unique,
  barcode text,
  product_name text not null,
  alias text not null default '',
  category text not null default '',
  hsn_code text not null default '',
  unit text not null default 'pcs',
  selling_price numeric(12, 2) not null check (selling_price >= 0),
  mrp numeric(12, 2) not null default 0 check (mrp >= 0),
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  tax_percent numeric(5, 2) not null default 0 check (tax_percent >= 0),
  box_qty integer check (box_qty is null or box_qty >= 2),
  track_stock boolean not null default false,
  stock_qty numeric(12, 3) not null default 0,
  is_active boolean not null default true,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Why stock changed. products.stock_qty stays the quick total; this table is the history behind it.
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in
    ('opening','purchase','sale','sale_cancel','return_restock','damage','company_return','adjustment')),
  qty_change numeric(12, 3) not null check (qty_change <> 0),   -- + in, - out
  reference_type text not null default '',                      -- 'sales_order', 'product_return', ...
  reference_id uuid,
  note text not null default '',
  recorded_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 6. sales, visits, delivery plans -------------------------------
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  request_key text unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sales_employee_id uuid not null references public.employees(id) on delete restrict,
  order_date date not null default public.ist_today(),
  status text not null default 'placed' check (status in ('draft','placed','processing','out_for_delivery','delivered','cancelled')),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  notes text not null default '',
  is_after_hours boolean not null default false,
  after_hours_reason text not null default '',
  order_lat numeric(10, 6),
  order_lng numeric(10, 6),
  distance_from_shop_meters integer,
  assigned_delivery_employee_id uuid references public.employees(id) on delete set null,
  assigned_at timestamptz,
  delivered_at timestamptz,
  cancelled_by uuid references public.employees(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  replaces_order_id uuid references public.sales_orders(id) on delete set null,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  unit_snapshot text not null default 'pcs',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_percent numeric(5, 2) not null default 0,
  ordered_qty numeric(12, 3) not null check (ordered_qty > 0),
  delivered_qty numeric(12, 3),
  returned_qty numeric(12, 3) default 0,
  return_reason text not null default '',
  line_total numeric(14, 2) not null check (line_total >= 0),
  unique (order_id, product_id)
);

create table if not exists public.sales_shop_visits (
  id uuid primary key default gen_random_uuid(),
  sales_employee_id uuid not null references public.employees(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  visit_date date not null default public.ist_today(),
  visit_status text not null check (visit_status in ('ordered','no_order')),
  order_id uuid references public.sales_orders(id) on delete set null,
  no_order_reason text not null default '',
  note text not null default '',
  lat numeric(10, 6),
  lng numeric(10, 6),
  distance_meters integer,
  visited_at timestamptz not null default now(),
  unique (sales_employee_id, customer_id, visit_date)
);

create table if not exists public.delivery_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  route_id uuid references public.routes(id) on delete set null,
  driver_employee_id uuid not null references public.employees(id) on delete restrict,
  helper_employee_ids uuid[] not null default '{}',
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  notes text not null default '',
  created_by uuid references public.employees(id) on delete set null,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_plan_stops (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.delivery_plans(id) on delete cascade,
  stop_sequence integer not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_no text not null default '',
  invoice_amount numeric(14, 2) not null default 0,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','delivered','partial','skipped','failed')),
  delivered_at timestamptz,
  delivered_by uuid references public.employees(id) on delete set null,
  note text not null default ''
);

-- ---------- 7. returns ------------------------------------------------------
create table if not exists public.product_returns (
  id uuid primary key default gen_random_uuid(),
  return_code text unique not null,
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  recorded_by_employee_id uuid not null references public.employees(id) on delete restrict,
  status text not null default 'pending_inspection' check (status in
    ('pending_inspection','company_return_pending','reconciliation_complete','closed')),
  note text not null default '',
  inspected_by uuid references public.employees(id) on delete set null,
  inspected_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.product_returns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  returned_qty numeric(12, 3) not null check (returned_qty > 0),
  return_reason text not null default '',
  restock_qty numeric(12, 3) not null default 0 check (restock_qty >= 0),
  company_qty numeric(12, 3) not null default 0 check (company_qty >= 0),
  damaged_qty numeric(12, 3) not null default 0 check (damaged_qty >= 0),
  supplier_name text not null default '',
  company_status text not null default 'not_applicable' check (company_status in
    ('not_applicable','awaiting_dispatch','dispatched','acknowledged','replacement_received',
     'credit_note_issued','refund_received','rejected_by_company')),
  dispatch_ref text not null default '',
  company_response_ref text not null default '',
  company_amount numeric(12, 2),
  replacement_received_qty numeric(12, 3),
  replacement_accepted_qty numeric(12, 3),
  inspection_note text not null default ''
);

-- ---------- 8. files (photos & documents live in Backblaze B2) -------------
-- One row per file. The file itself is in B2 at storage_path.
create table if not exists public.stored_files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in
    ('employee','customer','product','vehicle','sales_order','product_return','accounts')),
  owner_id uuid,                                   -- null only for old files not yet linked
  kind text not null,                              -- 'photo','rc','insurance','permit','fitness','bill','evidence', ...
  storage_path text not null unique,               -- e.g. 'c/CUST-001.jpg'
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  uploaded_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 9. alerts, audit, settings, leftovers --------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  title text not null,
  message text not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name_snapshot text not null default '',
  lat numeric(10, 6),
  lng numeric(10, 6),
  accuracy_meters integer,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  actor_employee_id uuid references public.employees(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id integer primary key default 1 check (id = 1),
  company_name text not null default 'General Traders',
  company_phone text not null default '',
  company_address text not null default '',
  company_gstin text not null default '',
  depot_lat numeric(10, 6),
  depot_lng numeric(10, 6),
  late_attendance_after text not null default '08:30',
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.system_settings (id, company_name) values (1, 'General Traders') on conflict (id) do nothing;

-- Holds the old-style records that have not moved into their own table yet (pin lists, crew lists, consent, etc.).
-- It shrinks as each area moves; it is not a place for new features.
create table if not exists public.app_kv (
  key text primary key,
  v jsonb,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- 10. updated_at triggers ----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employees','vehicles','employee_attendance','customers','products',
                           'sales_orders','delivery_plans','system_settings','app_kv']
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- 11. indexes (every linking column, plus the common screens) ----
create index if not exists idx_employees_role            on public.employees(role) where is_active;
create index if not exists idx_sessions_employee         on public.employee_sessions(employee_id);
create index if not exists idx_sessions_expiry           on public.employee_sessions(expires_at);
create index if not exists idx_leaves_employee           on public.employee_leaves(employee_id, start_date desc);
create index if not exists idx_advances_employee         on public.employee_advances(employee_id, entry_date desc);
create index if not exists idx_fuel_vehicle              on public.vehicle_fuel_logs(vehicle_id, fill_date desc);
create index if not exists idx_maint_vehicle             on public.vehicle_maintenance_logs(vehicle_id, service_date desc);
create index if not exists idx_attendance_date           on public.employee_attendance(attendance_date desc);
create index if not exists idx_customers_route           on public.customers(route_id, route_sequence);
create index if not exists idx_pin_tasks_customer        on public.customer_pin_tasks(customer_id);
create index if not exists idx_pin_tasks_pending         on public.customer_pin_tasks(assigned_to_employee_id) where status = 'pending';
create index if not exists idx_stock_product             on public.stock_movements(product_id, created_at desc);
create index if not exists idx_orders_date               on public.sales_orders(order_date desc);
create index if not exists idx_orders_employee           on public.sales_orders(sales_employee_id, order_date desc);
create index if not exists idx_orders_customer           on public.sales_orders(customer_id, order_date desc);
create index if not exists idx_orders_status             on public.sales_orders(status, order_date desc);
create index if not exists idx_order_items_order         on public.sales_order_items(order_id);
create index if not exists idx_order_items_product       on public.sales_order_items(product_id);
create index if not exists idx_visits_customer           on public.sales_shop_visits(customer_id, visit_date desc);
create index if not exists idx_plans_date                on public.delivery_plans(plan_date desc);
create index if not exists idx_plans_driver              on public.delivery_plans(driver_employee_id, plan_date desc);
create index if not exists idx_plan_stops_plan           on public.delivery_plan_stops(plan_id, stop_sequence);
create index if not exists idx_plan_stops_customer       on public.delivery_plan_stops(customer_id);
create index if not exists idx_returns_order             on public.product_returns(order_id);
create index if not exists idx_returns_customer          on public.product_returns(customer_id);
create index if not exists idx_return_items_return       on public.product_return_items(return_id);
create index if not exists idx_files_owner               on public.stored_files(owner_type, owner_id);
create index if not exists idx_notifications_created     on public.notifications(created_at desc);
create index if not exists idx_notifications_unread      on public.notifications(created_at desc) where not is_read;
create index if not exists idx_activity_created          on public.activity_logs(created_at desc);

-- ---------- 12. lock direct browser access ---------------------------------
-- Only the server (service key) reads or writes. No policies on purpose = browsers get nothing.
do $$
declare t text;
begin
  foreach t in array array['employees','employee_sessions','employee_leaves','employee_advances','vehicles',
    'vehicle_fuel_logs','vehicle_maintenance_logs','employee_attendance','employee_locations','routes','customers',
    'customer_pin_tasks','products','stock_movements','sales_orders','sales_order_items','sales_shop_visits',
    'delivery_plans','delivery_plan_stops','product_returns','product_return_items','stored_files',
    'notifications','activity_logs','system_settings','app_kv']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
