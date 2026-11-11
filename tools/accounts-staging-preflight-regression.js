'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/supabase-accounts-phase-5f-staging-preflight.sql'), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'run-regression-suite.js'), 'utf8');
const required = [
  'gm_accounts_cash_movements','gm_accounts_cash_denominations',
  'gm_accounts_journal_entries','gm_accounts_journal_lines',
  'gm_accounts_daily_closings','gm_accounts_upi_settlements',
  'gm_accounts_confirm_cash_handover(uuid,text)',
  'gm_accounts_create_office_deposit(text,text,numeric,jsonb,text,text)',
  'gm_accounts_confirm_office_deposit(uuid,text)',
  'gm_accounts_create_upi_settlement(text,numeric,text,date,text,text)',
  'gm_accounts_confirm_upi_settlement(uuid,text)',
  'gm_accounts_create_daily_closing(text,date,jsonb,numeric,text,text)',
  'gm_accounts_approve_daily_closing(uuid,text)'
];
let passed = 0;
for (const item of required) {
  if (sql.includes(item)) { passed++; console.log(`PASS preflight covers ${item}`); }
  else { console.error(`FAIL missing preflight coverage: ${item}`); process.exitCode = 1; }
}
for (const [label, pattern] of [
  ['journal imbalance diagnostic', /having\s+round\(sum\(l\.debit-l\.credit\),2\)\s*<>\s*0/i],
  ['duplicate cash reference diagnostic', /group by reference\s+having count\(\*\) > 1/i],
  ['denomination exact-set diagnostic', /count\(distinct d\.denomination\) <> 6/i],
  ['duplicate active closing diagnostic', /where status in \('pending_approval','approved'\)[\s\S]*?having count\(\*\) > 1/i],
  ['client-role RPC privilege diagnostic', /has_function_privilege\('anon',p\.oid,'EXECUTE'\)[\s\S]*?has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/i],
  ['workflow backlog diagnostic', /pending workflow counts/i],
  ['read-only SQL guard', /^\s*(insert|update|delete|alter|drop|create|truncate)\s/m]
]) {
  const ok = label === 'read-only SQL guard' ? !pattern.test(sql) : pattern.test(sql);
  if (ok) { passed++; console.log(`PASS ${label}`); }
  else { console.error(`FAIL ${label}`); process.exitCode = 1; }
}
if (process.exitCode) process.exit(process.exitCode);
console.log(`Accounts staging preflight regression: ${passed} assertions passed.`);
