#!/usr/bin/env node
"use strict";
// Customer statement: running balance, opening balance for a date range, approved payments only, Billing-only access, page wiring.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildStatement } = require("../backend/modules/accounts/accounts.domain");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const invoices = [
  { id: "i1", invoice_no: "A1", invoice_date: "2026-10-01", source_kind: "opening", initial_outstanding: 1000.1, created_at: "2026-10-01T05:00:00Z" },
  { id: "i2", invoice_no: "A2", invoice_date: "2026-11-02", source_kind: "manual", initial_outstanding: 500, created_at: "2026-11-02T05:00:00Z" },
];
const allocations = [
  { collection_id: "c1", invoice_id: "i1", amount: 400.05 },
  { collection_id: "c2", invoice_id: "i2", amount: 100 },
  { collection_id: "c3", invoice_id: "i2", amount: 50 },
];
const collections = [
  { id: "c1", status: "approved", method: "upi", approved_at: "2026-10-05T10:00:00Z" },
  { id: "c2", status: "pending_approval", method: "cash", received_at: "2026-11-03T10:00:00Z" },
  { id: "c3", status: "rejected", method: "cash", received_at: "2026-11-03T10:00:00Z" },
];

// Whole history: pending and rejected payments are not counted; paise stay exact.
let s = buildStatement({ invoices, allocations, collections });
assert.strictEqual(s.rows.length, 3, "2 invoices + 1 approved payment");
assert.strictEqual(s.totalDebit, 1500.1);
assert.strictEqual(s.totalCredit, 400.05);
assert.strictEqual(s.closingBalance, 1100.05);
assert.deepStrictEqual(s.rows.map((r) => r.balance), [1000.1, 600.05, 1100.05], "running balance");
assert.strictEqual(s.openingBalance, 0);

// Date range: earlier entries become the opening balance.
s = buildStatement({ invoices, allocations, collections, from: "2026-10-20" });
assert.strictEqual(s.openingBalance, 600.05);
assert.strictEqual(s.rows.length, 1);
assert.strictEqual(s.closingBalance, 1100.05);
s = buildStatement({ invoices, allocations, collections, to: "2026-10-04" });
assert.strictEqual(s.closingBalance, 1000.1, "entries after the end date are left out");

// A payment approved late on the 5th IST (UTC evening) belongs to the IST date, not the UTC date.
s = buildStatement({ invoices: [invoices[0]], allocations: [allocations[0]], collections: [{ ...collections[0], approved_at: "2026-10-05T20:00:00Z" }] });
assert.strictEqual(s.rows[1].date, "2026-10-06");

// Route.
const fakeFetch = async (url) => {
  const table = new URL(url).pathname.split("/").pop();
  const rows = table === "gm_accounts_invoices" ? invoices : table === "gm_accounts_collection_allocations" ? allocations : collections.filter((c) => c.status === "approved");
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => rows, text: async () => "" };
};
const send = (res, code, value) => { res.status = code; res.payload = value; res.done && res.done(); };
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "k", send, body: () => {},
  customerLookup: (c) => (c === "C1" ? { code: "C1", name: "Test Shop", phone: "9876543210", address: "12 Market Road, <b>Pune</b>" } : null),
  canBill: (x) => x.role === "admin" && x.billing === true, canCollect: () => false, fetch: fakeFetch,
});
const call = (p, session, query) => new Promise((resolve) => {
  const res = { done: () => resolve(res) };
  const url = new URL("http://x" + p + (query || ""));
  routes.handle({ method: "GET" }, res, { pathname: p, searchParams: url.searchParams }, session);
});
(async () => {
  const admin = { role: "admin", billing: true };
  assert.strictEqual((await call("/api/accounts/customers/C1/statement", { role: "sales" })).status, 403, "Billing only");
  assert.strictEqual((await call("/api/accounts/customers/NOPE/statement", admin)).status, 404);
  assert.strictEqual((await call("/api/accounts/customers/C1/statement", admin, "?from=2026-13-40")).status, 400);
  assert.strictEqual((await call("/api/accounts/customers/C1/statement", admin, "?from=2026-11-05&to=2026-11-01")).status, 400);
  const r = await call("/api/accounts/customers/C1/statement", admin, "?from=2026-10-20");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.payload.customer.name, "Test Shop");
  assert.strictEqual(r.payload.customer.phone, "9876543210");
  assert.strictEqual(r.payload.customer.address, "12 Market Road, <b>Pune</b>");
  assert.strictEqual(r.payload.closingBalance, 1100.05);

  const page = read("admin/statement.html"), a = read("shared/admin.js"), srv = read("server.js"), ledger = read("admin/accounts.html");
  assert(page.includes('GA.mount("statement.html"') && page.includes("/statement") && page.includes("window.print()") && page.includes("@media print"), "page loads the API and prints");
  assert(a.includes('"statement.html": ["billing"]') && srv.includes('"statement.html": ["billing"]'), "permission wired");
  assert(ledger.includes('statement.html'), "ledger links to the statement");
  assert(page.includes("esc(d.customer.address)") && page.includes("esc(d.customer.phone)"), "phone and address shown, escaped");
  console.log("Accounts statement regression passed.");
})().catch((e) => { console.error(e); process.exit(1); });