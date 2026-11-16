#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "sql/supabase-accounts-phase-5e-integrity-hardening.sql"), "utf8");
const handover = fs.readFileSync(path.join(root, "sql/supabase-accounts-phase-5a-cash-handover.sql"), "utf8");
const office = fs.readFileSync(path.join(root, "sql/supabase-accounts-phase-5b-office-cash.sql"), "utf8");
const closing = fs.readFileSync(path.join(root, "sql/supabase-accounts-phase-5d-daily-closing.sql"), "utf8");
const checks = [
  [sql.includes("gm_accounts_employee_cash:'||v_move.from_employee_id"), "handover confirmation uses canonical employee-custody advisory lock"],
  [office.includes("gm_accounts_employee_cash:'||v_move.from_employee_id"), "office deposit confirmation uses the same canonical advisory lock"],
  [/create or replace function public\.gm_accounts_confirm_cash_handover[\s\S]*?pg_advisory_xact_lock\(hashtext\('gm_accounts_employee_cash:'\|\|v_move\.from_employee_id\)\)/.test(sql), "Phase 5E replaces the mismatched handover lock"],
  [/create or replace function public\.gm_accounts_create_office_deposit[\s\S]*?Duplicate denomination row/.test(sql), "office deposit rejects duplicate denomination rows"],
  [/cardinality\(v_seen\)<>6[\s\S]*?array\['500','200','100','50','20','10'\]/.test(sql), "office deposit requires the exact six unique denomination types"],
  [/v_sum<>p_amount/.test(sql), "office deposit denomination sum must equal declared amount"],
  [/p_closing_date > \(now\(\) at time zone 'Asia\/Kolkata'\)::date/.test(sql), "future business-date closing is rejected"],
  [/posted_at < \(\(p_closing_date \+ 1\)::timestamp at time zone 'Asia\/Kolkata'\)/.test(sql), "closing journal snapshot uses India-local end-of-day cutoff"],
  [/account_code='EMPLOYEE_CASH_CUSTODY'[\s\S]*?posted_at <[\s\S]*?group by employee_id/.test(sql), "employee custody expected balance is date-scoped"],
  [/into v_office[\s\S]*?account_code='OFFICE_CASH'[\s\S]*?posted_at </.test(sql), "office cash expected balance is date-scoped"],
  [/into v_upi[\s\S]*?account_code='UPI_CLEARING'[\s\S]*?posted_at </.test(sql), "UPI clearing expected balance is date-scoped"],
  [/into v_bank[\s\S]*?account_code='BANK'[\s\S]*?posted_at </.test(sql), "bank expected balance is date-scoped"],
  [/revoke all on function public\.gm_accounts_confirm_cash_handover[\s\S]*?to service_role/.test(sql), "replacement handover RPC remains service-role-only"],
  [/revoke all on function public\.gm_accounts_create_office_deposit[\s\S]*?to service_role/.test(sql), "replacement office deposit RPC remains service-role-only"],
  [/revoke all on function public\.gm_accounts_create_daily_closing[\s\S]*?to service_role/.test(sql), "replacement daily closing RPC remains service-role-only"],
  [/primary key\(movement_id,denomination\)/.test(fs.readFileSync(path.join(root,"sql/supabase-accounts-phase-1.sql"),"utf8")), "database primary key independently prevents duplicate denomination records"],
  [/pg_advisory_xact_lock\(hashtext\(v_move\.from_employee_id\)\)/.test(handover), "regression documents original Phase 5A lock mismatch"],
  [/pg_advisory_xact_lock\(hashtext\('gm_accounts_employee_cash:'\|\|v_move\.from_employee_id\)\)/.test(office), "regression confirms original Phase 5B lock key"],
  [/sum\(debit-credit\)[\s\S]*?account_code='EMPLOYEE_CASH_CUSTODY'/.test(closing), "baseline daily-closing migration identified for corrected replacement"],
  [/sum\(debit-credit\)[\s\S]*?account_code='OFFICE_CASH'/.test(closing), "baseline office balance query identified for corrected replacement"],
  [/sum\(debit-credit\)[\s\S]*?account_code='UPI_CLEARING'/.test(closing), "baseline UPI balance query identified for corrected replacement"],
  [/sum\(debit-credit\)[\s\S]*?account_code='BANK'/.test(closing), "baseline bank balance query identified for corrected replacement"],
  [/insert into gm_accounts_journal_entries/i.test(sql.slice(sql.indexOf("create or replace function public.gm_accounts_create_daily_closing"))) === false, "daily closing remains a snapshot and does not auto-post adjustments"]
];
for (const [ok, label] of checks) { assert(ok, "Missing: " + label); console.log("PASS " + label); }
console.log("Accounts Phase 5E integrity regression: " + checks.length + " assertions passed.");
