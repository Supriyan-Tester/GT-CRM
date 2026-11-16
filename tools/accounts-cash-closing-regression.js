#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.resolve(__dirname, ".."), read = f => fs.readFileSync(path.join(root, f), "utf8");
const sql = read("sql/supabase-accounts-phase-8a-cash-closing.sql"), page = read("admin/cash-closing.html"), adminJs = read("shared/admin.js"), server = read("server.js");
const { createAccountsRoutes } = require(path.join(root, "backend/modules/accounts/accounts.routes.js"));

const checks = [
  [/denomination in \(500,200,100,50,20,10,5,2,1\)/.test(sql), "database accepts all nine denominations"],
  [/jsonb_array_length\(p_denominations\)<>9/.test(sql), "receive RPC requires exactly nine denomination rows"],
  [/gm_accounts_employee_cash:/.test(sql), "receive RPC uses the canonical employee custody lock"],
  [/Employee balance changed/.test(sql), "stale expected balance is rejected"],
  [/A reason is required when the count differs/.test(sql), "reason is required for a difference"],
  [/v_action not in \('record','employee'\)/.test(sql), "difference action must be chosen"],
  [/cash-closing:'\|\|trim\(p_request_key\)/.test(sql) && /gm_accounts_cash_closing_request_uidx/.test(sql), "receipt is idempotent per request key"],
  [/COLLECTION_SUSPENSE/.test(sql) && /'shortage'/.test(sql) && /'excess'/.test(sql), "record-only differences are parked and logged as shortage/excess"],
  [/revoke all on function public\.gm_accounts_receive_cash[\s\S]*grant execute[\s\S]*service_role/.test(sql), "RPC is service-role only"],
  [/cannot receive cash from yourself/.test(sql), "admin cannot receive from themselves"],
  [/v_counted=round\(v_balance,0\)/.test(sql) && /Round-off to the nearest rupee/.test(sql), "counting the rounded-off amount clears the paise without a reason"],
  [/askDifference/.test(page) && !/ccDiffBox/.test(page), "record/add choice only appears in a second popup when the count differs"],
  [/Receive/.test(page) && /data-d/.test(page) && /DENOMS = \[500, 200, 100, 50, 20, 10, 5, 2, 1\]/.test(page), "page opens a nine-denomination popup"],
  [/Add to employee's balance|Add to employee\\'s balance/.test(page) && /Record only/.test(page), "page asks to record or add the difference to the employee"],
  [/Employee ID/.test(page), "page shows employee ID"],
  [/"cash-closing\.html": \["billing"\]/.test(adminJs) && /"cash-closing\.html": \["billing"\]/.test(server), "page is Billing-only on client and server"],
  [/\["cash-closing\.html", "Cash closing"/.test(adminJs) && !/^\s*\["office-cash\.html"/m.test(adminJs) && !/^\s*\["daily-closing\.html"/m.test(adminJs), "menu shows Cash closing and hides old pages"],
];
checks.forEach(([ok, name]) => { assert.ok(ok, "FAILED: " + name); console.log("PASS " + name); });

(async () => {
  const calls = [];
  const fetch = async (url, opts) => { calls.push({ url, body: opts && opts.body && JSON.parse(opts.body) }); return { ok: true, json: async () => ({ ok: true }), text: async () => "" }; };
  const routes = createAccountsRoutes({ url: "https://x.test", key: "k", fetch, db: {}, canBill: s => s.billing, canCollect: () => true,
    send: (res, code, data) => { res.code = code; res.data = data; },
    body: (req, cb) => cb(null, req.input) });
  const run = (method, p, input, billing = true) => { const res = {}, req = { method, input }; routes.handle(req, res, new URL("http://l" + p), { id: "A1", billing }); return new Promise(r => setTimeout(() => r(res), 20)); };
  const dn = c => [500, 200, 100, 50, 20, 10, 5, 2, 1].map(d => ({ denomination: d, pieceCount: c[d] || 0 }));
  const base = { employeeId: "W001", expected: 4200, denominations: dn({ 500: 6, 200: 5, 100: 2 }), requestKey: "cc-abcdef123456" };
  let r = await run("POST", "/api/accounts/cash-closing/receive", base, false); assert.strictEqual(r.code, 403); console.log("PASS non-billing user is refused");
  r = await run("POST", "/api/accounts/cash-closing/receive", base); assert.strictEqual(r.code, 201); assert.ok(calls.pop().url.endsWith("gm_accounts_receive_cash")); console.log("PASS matching count is received");
  r = await run("POST", "/api/accounts/cash-closing/receive", { ...base, denominations: dn({ 500: 8 }) }); assert.strictEqual(r.code, 400); console.log("PASS a difference without reason is refused");
  r = await run("POST", "/api/accounts/cash-closing/receive", { ...base, denominations: dn({ 500: 8 }), reason: "short" }); assert.strictEqual(r.code, 400); console.log("PASS a difference without a chosen action is refused");
  r = await run("POST", "/api/accounts/cash-closing/receive", { ...base, denominations: dn({ 500: 8 }), reason: "short", differenceAction: "employee" }); assert.strictEqual(r.code, 201); console.log("PASS a difference with reason and action is received");
  r = await run("POST", "/api/accounts/cash-closing/receive", { ...base, expected: 4200.92, denominations: dn({ 500: 6, 200: 5, 100: 2, 1: 1 }) }); assert.strictEqual(r.code, 201); console.log("PASS the rounded-off amount is accepted without a reason");
  r = await run("POST", "/api/accounts/cash-closing/receive", { ...base, denominations: base.denominations.slice(0, 6) }); assert.strictEqual(r.code, 400); console.log("PASS six denominations are refused");
  r = await run("POST", "/api/accounts/cash-closing/receive", { ...base, employeeId: "A1" }); assert.strictEqual(r.code, 400); console.log("PASS receiving from yourself is refused");
  console.log("Cash closing regression: " + (checks.length + 8) + " assertions passed.");
})().catch(e => { console.error(e); process.exit(1); });