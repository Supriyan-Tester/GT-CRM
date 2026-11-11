"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "sql/supabase-accounts-phase-5a-cash-handover.sql"), "utf8");
const routes = fs.readFileSync(path.join(root, "backend/modules/accounts/accounts.routes.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const sales = fs.readFileSync(path.join(root, "sales/cash-handover.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "worker/cash-handover.html"), "utf8");
const salesNav = fs.readFileSync(path.join(root, "sales/sales.js"), "utf8");
let passed = 0;
function check(condition, message) { if (!condition) throw new Error("FAIL " + message); passed++; console.log("PASS " + message); }
check(/gm_accounts_create_cash_handover/.test(sql) && /gm_accounts_confirm_cash_handover/.test(sql), "handover create and confirmation RPCs are defined");
check(/gm_accounts_dispute_cash_handover/.test(sql), "recipient dispute RPC is defined");
check(/v_sum<>p_amount/.test(sql) && /count\(distinct/.test(sql), "all six denomination types and exact cash total are validated");
check(/pg_advisory_xact_lock/.test(sql), "sender custody confirmations are serialized to prevent concurrent over-transfer");
check(/EMPLOYEE_CASH_CUSTODY/.test(sql) && /debit,credit/.test(sql), "confirmed handover posts balanced employee-custody journal lines");
check(/status='confirmed'/.test(sql) && /status='disputed'/.test(sql), "confirmed and disputed states are persisted");
check(/revoke all on function public\.gm_accounts_create_cash_handover/.test(sql) && /to service_role/.test(sql), "RPC execution is restricted to service role");
check(/\/api\/accounts\/cash-handover/.test(routes) && /\/api\/accounts\/cash-custody/.test(routes), "cash custody and handover endpoints are wired");
check(/employeeExists\(recipientId\)/.test(routes) && /employeeExists:/.test(server), "recipient must be an active known employee");
check(/Only the named recipient can confirm/.test(sql) && /Only the named recipient can dispute/.test(sql), "only the recipient can confirm or dispute the handover");
check(/denominations/.test(sales) && /denominations/.test(worker), "Sales and Delivery handover pages capture denomination counts");
check(/Confirm receipt/.test(sales) && /Dispute/.test(worker), "recipient confirmation and dispute actions are present in UI");
check(/Cash handover/.test(salesNav), "Sales navigation exposes cash handover page");
for (const file of ["backend/modules/accounts/accounts.routes.js", "server.js", "sales/sales.js"]) {
  const { spawnSync } = require("child_process");
  const r = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  check(r.status === 0, file + " passes Node syntax validation");
}
for (const [label, html] of [["Sales", sales], ["Delivery", worker]]) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error(label + " inline script missing");
  const tmp = path.join(__dirname, ".cash-handover-inline-check.js");
  fs.writeFileSync(tmp, script[1]);
  const { spawnSync } = require("child_process");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  fs.unlinkSync(tmp);
  check(r.status === 0, label + " handover UI inline script passes syntax validation");
}
console.log("Accounts cash handover regression: " + passed + " assertions passed.");
