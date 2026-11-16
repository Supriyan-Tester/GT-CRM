#!/usr/bin/env node
"use strict";
// Accounts reports: collection, employee collection and outstanding. Approved-only, exact paise, Billing-only, page wiring.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildCollectionReport, buildOutstandingReport, buildHandoverReport } = require("../backend/modules/accounts/accounts.domain");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const col = (id, by, name, method, amt, status, at) => ({ id, customer_code: "C1", customer_name_snapshot: "Shop", collected_by: by, collector_name_snapshot: name, method, total_amount: amt, status, received_at: at, approved_at: at });
const collections = [
  col("a", "e1", "Ravi", "cash", 100.1, "approved", "2026-11-02T05:00:00Z"),
  col("b", "e1", "Ravi", "upi", 200.2, "approved", "2026-11-03T05:00:00Z"),
  col("c", "e2", "Sita", "bank_transfer", 50, "approved", "2026-11-03T20:00:00Z"), // 02:00 IST on the 4th
  col("d", "e2", "Sita", "cash", 999, "pending_approval", "2026-11-03T05:00:00Z"),
  col("e", "e2", "Sita", "cash", 999, "rejected", "2026-11-03T05:00:00Z"),
];
let r = buildCollectionReport({ collections });
assert.strictEqual(r.count, 3, "pending and rejected are left out");
assert.strictEqual(r.total, 350.3, "paise stay exact");
assert.deepStrictEqual(r.byMethod, { cash: 100.1, upi: 200.2, bankTransfer: 50 });
assert.deepStrictEqual(r.byEmployee.map((e) => [e.name, e.count, e.total]), [["Ravi", 2, 300.3], ["Sita", 1, 50]], "employees sorted by total");
assert.strictEqual(r.rows[0].date, "2026-11-04", "IST day, not UTC day");
assert.strictEqual(buildCollectionReport({ collections: [] }).total, 0);

const invoices = [
  { id: "i1", customer_code: "C1", customer_name_snapshot: "Shop", invoice_date: "2026-09-01", initial_outstanding: 1000.1 },
  { id: "i2", customer_code: "C1", customer_name_snapshot: "Shop", invoice_date: "2026-10-01", initial_outstanding: 500 },
  { id: "i3", customer_code: "C2", customer_name_snapshot: "Paid Up", invoice_date: "2026-10-05", initial_outstanding: 300 },
  { id: "i4", customer_code: "C3", customer_name_snapshot: "Big", invoice_date: "2026-10-20", initial_outstanding: 5000 },
];
const allocations = [
  { invoice_id: "i1", amount: 400.05, collection_id: "ok1" },
  { invoice_id: "i2", amount: 500, collection_id: "pending1" }, // not approved: must not reduce
  { invoice_id: "i3", amount: 300, collection_id: "ok2" },
];
let o = buildOutstandingReport({ invoices, allocations, approvedCollectionIds: ["ok1", "ok2"], today: "2026-11-05" });
assert.deepStrictEqual(o.rows.map((x) => [x.code, x.outstanding, x.invoices]), [["C3", 5000, 1], ["C1", 1100.05, 2]], "fully paid customer dropped, biggest first");
assert.strictEqual(o.total, 6100.05);
assert.strictEqual(o.customers, 2);
assert.strictEqual(o.invoices, 3);
assert.strictEqual(o.rows[1].oldestDays, 65, "oldest invoice 2026-09-01 to 2026-11-05");

// Cash handover report: handovers and office deposits only, IST day, status buckets, names from the employee list.
const mv = (type, from, to, amt, status, at, by) => ({ movement_type: type, from_employee_id: from, to_employee_id: to, amount: amt, status, recorded_at: at, confirmed_by: by });
const movements = [
  mv("handover", "e1", "e2", 500.5, "confirmed", "2026-11-02T05:00:00Z", "e2"),
  mv("handover", "e1", "e2", 200, "recorded", "2026-11-03T20:00:00Z", null), // 02:00 IST on the 4th
  mv("office_receipt", "e2", null, 1000.25, "disputed", "2026-11-03T05:00:00Z", null),
  mv("collection_received", "e1", null, 999, "recorded", "2026-11-03T05:00:00Z", null), // not a handover
];
const h = buildHandoverReport({ movements, names: { e1: "Ravi", e2: "Sita" } });
assert.strictEqual(h.count, 3, "other movement types are left out");
assert.strictEqual(h.total, 1700.75, "paise stay exact");
assert.deepStrictEqual([h.confirmed, h.awaiting, h.disputed].map((x) => [x.count, x.amount]), [[1, 500.5], [1, 200], [1, 1000.25]]);
assert.strictEqual(h.rows[0].date, "2026-11-04", "IST day, not UTC day");
assert.deepStrictEqual(h.rows.find((r) => r.type === "Office deposit"), { date: "2026-11-03", type: "Office deposit", from: "Sita", to: "Office", amount: 1000.25, status: "Disputed", confirmedBy: "" });
assert.strictEqual(h.rows.find((r) => r.status === "Confirmed").confirmedBy, "Sita");
assert.strictEqual(buildHandoverReport({ movements: [], names: {} }).total, 0);

// Routes.
const calls = [];
const fakeFetch = async (url) => {
  calls.push(url);
  const table = new URL(url).pathname.split("/").pop();
  const rows = table === "gm_accounts_cash_movements" ? movements : table === "gm_accounts_invoices" ? invoices : table === "gm_accounts_collection_allocations" ? allocations
    : url.includes("select=id&status=eq.approved") ? [{ id: "ok1" }, { id: "ok2" }] : collections.filter((c) => c.status === "approved");
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => rows, text: async () => "" };
};
const send = (res, code, value) => { res.status = code; res.payload = value; res.done && res.done(); };
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "k", send, body: () => {}, customerLookup: () => null, employeeList: () => [{ id: "e1", name: "Ravi" }, { id: "e2", name: "Sita" }],
  canBill: (x) => x.role === "admin" && x.billing === true, canCollect: () => false, fetch: fakeFetch,
});
const call = (p, session, query) => new Promise((resolve) => {
  const res = { done: () => resolve(res) };
  const url = new URL("http://x" + p + (query || ""));
  routes.handle({ method: "GET" }, res, { pathname: p, searchParams: url.searchParams }, session);
});
(async () => {
  const admin = { role: "admin", billing: true }, sales = { role: "sales" };
  for (const p of ["/api/accounts/reports/collections", "/api/accounts/reports/outstanding"])
    assert.strictEqual((await call(p, sales, "?from=2026-11-01&to=2026-11-05")).status, 403, "Billing only: " + p);
  assert.strictEqual((await call("/api/accounts/reports/collections", null)).status, 401);
  const q = "/api/accounts/reports/collections";
  assert.strictEqual((await call(q, admin)).status, 400, "dates required");
  assert.strictEqual((await call(q, admin, "?from=2026-13-40&to=2026-11-05")).status, 400, "impossible date");
  assert.strictEqual((await call(q, admin, "?from=2026-11-05&to=2026-11-01")).status, 400, "reversed range");
  const c = await call(q, admin, "?from=2026-11-01&to=2026-11-05");
  assert.strictEqual(c.status, 200);
  assert.strictEqual(c.payload.total, 350.3);
  assert(calls.some((u) => u.includes("status=eq.approved") && u.includes("approved_at=gte.2026-10-31T18%3A30%3A00.000Z") && u.includes("approved_at=lt.2026-11-05T18%3A30%3A00.000Z")), "range is whole IST days, approved only");
  const hq = "/api/accounts/reports/handovers";
  assert.strictEqual((await call(hq, sales, "?from=2026-11-01&to=2026-11-05")).status, 403, "Billing only: handovers");
  assert.strictEqual((await call(hq, admin, "?from=2026-11-05&to=2026-11-01")).status, 400);
  const ho = await call(hq, admin, "?from=2026-11-01&to=2026-11-05");
  assert.strictEqual(ho.status, 200);
  assert.strictEqual(ho.payload.count, 3);
  assert.strictEqual(ho.payload.total, 1700.75);
  assert.deepStrictEqual(ho.payload.rows.filter((r) => r.type === "Handover").map((r) => [r.from, r.to]), [["Ravi", "Sita"], ["Ravi", "Sita"]], "employee ids shown as names");
  assert(calls.some((u) => u.includes("gm_accounts_cash_movements") && u.includes("movement_type=in.(handover,office_receipt)") && u.includes("recorded_at=gte.2026-10-31T18%3A30%3A00.000Z")), "handover query: right types, whole IST days");
  const out = await call("/api/accounts/reports/outstanding", admin);
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.payload.customers, 2);
  assert.strictEqual(out.payload.total, 6100.05);

  const page = read("admin/accounts-reports.html"), a = read("shared/admin.js"), srv = read("server.js");
  assert(page.includes('GA.mount("accounts-reports.html"') && page.includes("/api/accounts/reports/collections") && page.includes("/api/accounts/reports/outstanding"), "page loads both APIs");
  assert(page.includes("/api/accounts/reports/handovers") && page.includes("Cash handover") && page.includes("esc(x.from)") && page.includes("esc(x.to)"), "handover tab, escaped");
  assert(page.includes("window.print()") && page.includes("@media print") && page.includes("text/csv"), "print and CSV");
  assert(page.includes("esc(x.customer)") && page.includes("esc(e.name)") && page.includes("esc(r.name)"), "names are escaped in HTML");
  assert(/\[=\+\\-@/.test(page), "CSV cells that start with = + - @ are neutralised");
  assert(a.includes('"accounts-reports.html": ["billing"]') && srv.includes('"accounts-reports.html": ["billing"]'), "permission wired");
  assert(a.includes('["accounts-reports.html", "Accounts reports"'), "menu entry");
  console.log("Accounts reports regression passed.");
})().catch((e) => { console.error(e); process.exit(1); });
