-- Run in the NEW Supabase (SQL Editor) AFTER the copy finished with "Copy complete".
-- Makes new journal entries continue from the last old number, and puts the rule back to "always automatic".
select setval(
  pg_get_serial_sequence('public.gm_accounts_journal_entries', 'entry_no'),
  greatest((select coalesce(max(entry_no), 0) from public.gm_accounts_journal_entries), 1),
  (select count(*) > 0 from public.gm_accounts_journal_entries)
);
alter table public.gm_accounts_journal_entries alter column entry_no set generated always;
