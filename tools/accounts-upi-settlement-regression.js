#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"..");
const routes=fs.readFileSync(path.join(root,"backend/modules/accounts/accounts.routes.js"),"utf8");
const sql=fs.readFileSync(path.join(root,"sql/supabase-accounts-phase-5c-upi-settlement.sql"),"utf8");
const page=fs.readFileSync(path.join(root,"admin/upi-settlements.html"),"utf8");
const checks=[
  [/GET[\s\S]*?\/api\/accounts\/upi-settlements/,"Billing UPI register API"],
  [/POST[\s\S]*?gm_accounts_create_upi_settlement/,"Pending settlement API"],
  [/gm_accounts_confirm_upi_settlement/,"Bank-credit confirmation API"],
  [/gm_accounts_dispute_upi_settlement/,"Dispute API"],
  [/if \(!canBill\(session\)\)/,"Billing role enforcement"],
  [/bankReference[\s\S]*?bankCreditDate/,"Bank reference and credit date validation"],
  [/create table if not exists public\.gm_accounts_upi_settlements/i,"Dedicated settlement register"],
  [/account_code='UPI_CLEARING'[\s\S]*?v_balance<v_row\.amount/i,"Cannot settle beyond clearing balance"],
  [/account_code,debit,credit[\s\S]*?BANK[\s\S]*?UPI_CLEARING/i,"Balanced bank and clearing journal posting"],
  [/status='confirmed'[\s\S]*?confirmed_by/i,"Confirmed audit fields"],
  [/status='disputed'[\s\S]*?dispute_reason/i,"Dispute audit fields"],
  [/Verify bank credit[\s\S]*?bank statement/i,"Manual bank statement verification UI"],
  [/UPI Clearing balance[\s\S]*?settlements/i,"Clearing balance display"],
  [/requestKey:'upi-settle:'[\s\S]*?crypto\.randomUUID/i,"Idempotency request key"]
];
for(const [re,label] of checks){assert(re.test(routes+"\n"+sql+"\n"+page),"Missing: "+label);console.log("PASS "+label);}
assert(!/status='confirmed'[\s\S]{0,200}create_upi_settlement/i.test(sql),"Creating a settlement must not post bank journal entry");
console.log("UPI settlement regression: "+(checks.length+1)+" assertions passed.");
