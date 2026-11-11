#!/usr/bin/env node
"use strict";
// Accounts dashboard: the summary endpoint adds up balances from every journal line (even past the 1000-row page limit),
// counts today's collections and pending work, and is limited to people with Billing permission.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function response() {
  return { status: 0, payload: null, writeHead(code) { this.status = code; }, end(value) { this.payload = JSON.parse(value); } };
}
const send = (res, code, value) => { res.writeHead(code); res.end(JSON.stringify(value)); };
const nowIso = new Date().toISOString();
let lineRequests = 0;
const fakeFetch = async (url) => {
  const u = new URL(url);
  const table = u.pathname.split("/").pop();
  const offset = Number(u.searchParams.get("offset") || 0);
  let rows = [];
  if (table === "gm_accounts_journal_lines") {
    lineRequests++;
    // 1500 receivable debits of 10 => 15000, split over two pages of the 1000-row limit
    const all = Array.from({ length: 1500 }, () => ({ account_code: "CUSTOMER_RECEIVABLE", debit: 10, credit: 0 }));
    all.push({ account_code: "OFFICE_CASH", debit: 500, credit: 100 }, { account_code: "BANK", debit: 70, credit: 0 });
    rows = all.slice(offset, offset + Number(u.searchParams.get("limit") || 1000));
  } else if (table === "gm_accounts_collections") {
    const status = u.searchParams.get("status") || "";
    if (status === "eq.pending_approval") rows = [{ id: "a", total_amount: 200 }, { id: "b", total_amount: 300 }];
    else if (u.searchParams.get("order") === "received_at.desc") rows = [{ id: "r1", customer_name_snapshot: "Shop", collector_name_snapshot: "Ravi", method: "cash", total_amount: 200, status: "approved", received_at: nowIso }];
    else rows = [
      { method: "cash", total_amount: 200, status: "approved", received_at: nowIso },
      { method: "upi", total_amount: 50, status: "pending_approval", received_at: nowIso },
    ];
  } else if (table === "gm_accounts_cash_movements") rows = [{ id: "m1" }];
  else if (table === "gm_accounts_upi_settlements") rows = [];
  else if (table === "gm_accounts_daily_closings") rows = [{ id: "d1" }];
  return { ok: true, status: 200, json: async () => rows, text: async () => "" };
};
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "service-test-key", send, body: () => {}, customerLookup: () => null,
  canBill: (s) => s.role === "admin" && s.billing === true, canCollect: () => false, fetch: fakeFetch,
});
const call = (session, query = "") => new Promise((resolve) => {
  const res = response();
  const origEnd = res.end.bind(res);
  res.end = (v) => { origEnd(v); resolve(res); };
  routes.handle({ method: "GET" }, res, { pathname: "/api/accounts/summary", searchParams: new URL("http://x/?" + query).searchParams }, session);
});

(async () => {
  const denied = await call({ role: "sales" });
  assert.strictEqual(denied.status, 403, "summary needs Billing permission");
  const ok = await call({ role: "admin", billing: true, id: "A1" });
  assert.strictEqual(ok.status, 200, "summary loads for Billing");
  const b = ok.payload.balances;
  assert.strictEqual(b.receivables, 15000, "balance is added up past the 1000-row page limit");
  assert(lineRequests >= 2, "journal lines are read in more than one page");
  assert.strictEqual(b.officeCash, 400, "office cash is debits minus credits");
  assert.strictEqual(b.bank, 70, "bank balance is read");
  assert.strictEqual(ok.payload.todayCollections.cash, 200, "today's cash collections");
  assert.strictEqual(ok.payload.todayCollections.upi, 50, "today's UPI collections");
  assert.strictEqual(ok.payload.todayCollections.total, 250, "today's total");
  assert.strictEqual(ok.payload.pending.collections, 2, "pending collection count");
  assert.strictEqual(ok.payload.pending.collectionsAmount, 500, "pending collection amount");
  assert.strictEqual(ok.payload.pending.cashMovements, 1, "pending deposits and handovers");
  assert.strictEqual(ok.payload.pending.dailyClosings, 1, "pending daily closings");
  assert.strictEqual(ok.payload.daily.length, 14, "chart covers 14 days");
  assert.strictEqual(ok.payload.range, "today", "default range is today");
  assert.strictEqual(ok.payload.rangeCollections.total, 250, "today range total");
  assert.strictEqual(ok.payload.pending.discrepancies, 2, "disputed handovers, UPI settlements and closings are counted");
  const wk = await call({ role: "admin", billing: true, id: "A1" }, "range=week");
  assert.strictEqual(wk.payload.range, "week", "week range accepted");
  assert(wk.payload.rangeFrom <= ok.payload.today, "week starts on or before today");
  const bad = await call({ role: "admin", billing: true, id: "A1" }, "range=forever");
  assert.strictEqual(bad.payload.range, "today", "unknown range falls back to today");
  assert.strictEqual(ok.payload.recent.length, 1, "recent collections returned");

  const page = read("admin/accounts-dashboard.html"), admin = read("shared/admin.js"), server = read("server.js");
  assert(page.includes("/api/accounts/summary") && page.includes("GA.mount(\"accounts-dashboard.html\""), "dashboard page calls the summary API inside the admin shell");
  assert(admin.includes('"accounts-dashboard.html": ["billing"]') && server.includes('"accounts-dashboard.html": ["billing"]'), "dashboard page is Billing-gated in menu and server");
  assert(server.includes('"upi-settlements.html": ["billing"]'), "UPI settlements page is Billing-gated on the server");
  assert(page.includes('collections.html?status=pending_approval'), "Dashboard links to the Collections page pending tab");
  console.log("PASS Accounts dashboard: Billing-only summary, balances beyond 1000 entries, today's collections, pending counts, 14-day chart data, page and menu wiring (19 assertions).");
})().catch((e) => { console.error(e); process.exit(1); });
