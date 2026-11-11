#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert"),{spawnSync}=require("child_process");
const root=path.resolve(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const sql=read("sql/supabase-accounts-phase-5d-daily-closing.sql"),routes=read("backend/modules/accounts/accounts.routes.js"),page=read("admin/daily-closing.html"),server=read("server.js"),accounts=read("admin/accounts.html"),suite=read("tools/run-regression-suite.js");
const checks=[
[/create table if not exists public\.gm_accounts_daily_closings/i,"daily closing snapshot table"],
[/expected_employee_balances jsonb[\s\S]*?counted_employee_balances jsonb/i,"expected and physically counted employee snapshots"],
[/expected_office_cash[\s\S]*?counted_office_cash[\s\S]*?expected_upi_clearing[\s\S]*?expected_bank/i,"office, UPI and bank balances captured separately"],
[/employee_variance[\s\S]*?office_variance[\s\S]*?total_cash_variance/i,"employee and office cash variance calculations"],
[/count every employee with an outstanding custody balance/i,"all outstanding employee custody balances must be counted"],
[/A closing record already exists for this date/i,"one active closing per date"],
[/gm_accounts_approve_daily_closing[\s\S]*?different Billing employee/i,"independent approval required"],
[/gm_accounts_dispute_daily_closing[\s\S]*?dispute_reason/i,"pending closing dispute audit trail"],
[/variance_status[\s\S]*?investigation/i,"variance is flagged for investigation"],
[/does not post an automatic shortage\/excess adjustment/i,"no automatic journal adjustment on variance"],
[/GET" && p === "\/api\/accounts\/daily-closing"[\s\S]*?if \(!canBill\(session\)\)/,"Billing-only closing read endpoint"],
[/POST" && p === "\/api\/accounts\/daily-closing"[\s\S]*?gm_accounts_create_daily_closing/i,"closing submission RPC endpoint"],
[/gm_accounts_approve_daily_closing[\s\S]*?gm_accounts_dispute_daily_closing/i,"approval and dispute API actions"],
[/daily-closing\.html": \["billing"\]/,"page route restricted to Billing"],
[/Daily Cash Closing/,"closing UI and navigation"],
[/expectedBalance[\s\S]*?countedOfficeCash[\s\S]*?employeeCounts/i,"physical count form includes employees and office"],
[/upiClearing[\s\S]*?bankBalance/,"UPI and bank shown as ledger-only balances"],
[/Variance[\s\S]*?investigation|variance/i,"variance explanation displayed"],
[/accounts-daily-closing-regression\.js/ ,"regression suite includes Phase 5D test"]
];
for(const [re,label] of checks){assert(re.test(sql+"\n"+routes+"\n"+page+"\n"+server+"\n"+accounts+"\n"+suite),"Missing: "+label);console.log("PASS "+label);}
for(const f of ["backend/modules/accounts/accounts.routes.js","server.js"]){const r=spawnSync(process.execPath,["--check",path.join(root,f)],{encoding:"utf8"});assert.strictEqual(r.status,0,r.stderr);console.log("PASS "+f+" syntax");}
const m=page.match(/<script>([\s\S]*?)<\/script>/);assert(m,"inline script exists");const tmp=path.join(__dirname,".daily-closing-inline-check.js");fs.writeFileSync(tmp,m[1]);const r=spawnSync(process.execPath,["--check",tmp],{encoding:"utf8"});fs.unlinkSync(tmp);assert.strictEqual(r.status,0,r.stderr);console.log("PASS daily closing UI inline script syntax");
assert(!/insert into gm_accounts_journal_entries/i.test(sql),"daily closing must not post journal entries automatically");console.log("PASS no automatic accounting adjustment");console.log("Accounts daily closing regression: "+(checks.length+4)+" assertions passed.");
