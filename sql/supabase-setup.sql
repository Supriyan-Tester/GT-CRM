-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- 1) Table that holds all saved records, logins (as hashes) and sessions.
create table if not exists public.gm_kv (
  key text primary key,
  v   text,
  rev bigint not null default 0
);
-- Lock it: nobody can read or write it from a browser. Only the server (with the secret service key) can.
alter table public.gm_kv enable row level security;

-- 2) Private bucket for pictures, documents and daily backups.
insert into storage.buckets (id, name, public)
values ('gm-files', 'gm-files', false)
on conflict (id) do nothing;