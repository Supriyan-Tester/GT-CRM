"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"..");
const routes=fs.readFileSync(path.join(root,"backend/modules/accounts/accounts.routes.js"),"utf8");
const sql=fs.readFileSync(path.join(root,"sql/supabase-accounts-phase-5b-office-cash.sql"),"utf8");
const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
const checks=[
()=>assert(routes.includes('/api/accounts/office-deposits')),
()=>assert(routes.includes('/api/accounts/office-cash')),
()=>assert(routes.includes('gm_accounts_create_office_deposit')),
()=>assert(routes.includes('gm_accounts_confirm_office_deposit')),
()=>assert(routes.includes('if (!canBill(session))')),
()=>assert(sql.includes("movement_type='office_receipt'")),
()=>assert(sql.includes("'EMPLOYEE_CASH_CUSTODY'")),
()=>assert(sql.includes("'OFFICE_CASH'")),
()=>assert(sql.includes('pg_advisory_xact_lock')),
()=>assert(sql.includes('Denomination total must equal')),
()=>assert(sql.includes('revoke all on function')),
()=>assert(server.includes('"office-cash.html": ["billing"]')),
()=>assert(fs.existsSync(path.join(root,'sales/office-deposit.html'))),
()=>assert(fs.existsSync(path.join(root,'worker/office-deposit.html'))),
()=>assert(fs.existsSync(path.join(root,'admin/office-cash.html')))
];checks.forEach((f,i)=>{f();});console.log('Phase 5B office cash regression: '+checks.length+' assertions passed.');
