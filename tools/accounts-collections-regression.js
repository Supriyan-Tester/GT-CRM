#!/usr/bin/env node
"use strict";
// Collections page: filtered/paged list, reject with reason, Billing-only access, balances correct past 1000 entries.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const UUID = "123e4567-e89b-12d3-a456-426614174000";

const seen = [];
const rpcCalls = [];
const fakeFetch = async (url, opts) => {
  const u = new URL(url);
  const table = u.pathname.split("/").pop();
  seen.push(url);
  let rows = [], range = "";
  if (u.pathname.includes("/rpc/")) { rpcCalls.push({ name: table, body: JSON.parse(opts.body) }); rows = { ok: true }; }
  else if (table === "gm_accounts_collections") {
    const sel = u.searchParams.get("select");
    if (sel.startsWith("id,customer_code")) {
      rows = [{ id: UUID, customer_code: "C1", customer_name_snapshot: "Shop", method: "cash", total_amount: "250.00", status: "pending_approval", received_at: new Date().toISOString() }];
      range = "0-0/137";
    } else if (u.searchParams.get("status") === "eq.approved" && sel === "id") { rows = [{ id: "x" }]; range = "0-0/9"; }
    else if (u.searchParams.get("status") === "eq.rejected") { rows = [{ id: "y" }]; range = "0-0/3"; }
    else if (u.searchParams.get("status") === "eq.pending_approval") rows = [{ total_amount: 100 }, { total_amount: 150 }];
    else rows = [{ total_amount: 400 }];
  } else if (table === "gm_accounts_collection_allocations") rows = [{ collection_id: UUID, invoice_id: "i1", amount: 250, evidence_path: "a/b/photo1.jpg" }];
  else if (table === "gm_accounts_invoices") rows = [{ id: "i1", invoice_no: "INV-1", invoice_date: "2026-11-01", original_amount: 300, initial_outstanding: 300 }];
  else if (table === "gm_accounts_journal_lines") {
    const offset = Number(u.searchParams.get("offset") || 0);
    const all = Array.from({ length: 1200 }, () => ({ debit: 10, credit: 0 }));
    rows = all.slice(offset, offset + Number(u.searchParams.get("limit") || 1000));
  }
  return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === "content-range" ? range : null) }, json: async () => rows, text: async () => "" };
};
const send = (res, code, value) => { res.status = code; res.payload = value; res.done && res.done(); };
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "k", send, body: (req, cb) => cb(null, req.payload), customerLookup: () => null,
  canBill: (s) => s.role === "admin" && s.billing === true, canCollect: () => false, fetch: fakeFetch,
});
const call = (method, p, session, query, payload) => new Promise((resolve) => {
  const res = { done: () => resolve(res) };
  const url = new URL("http://x" + p + (query || ""));
  routes.handle({ method, payload }, res, { pathname: p, searchParams: url.searchParams }, session);
});
const admin = { role: "admin", billing: true, id: "A1" };

(async () => {
  assert.strictEqual((await call("GET", "/api/accounts/collections", { role: "sales" })).status, 403, "list needs Billing");
  assert.strictEqual((await call("POST", "/api/accounts/collections/" + UUID + "/reject", { role: "sales" }, "", { reason: "no" })).status, 403, "reject needs Billing");

  const r = await call("GET", "/api/accounts/collections", admin, "?status=pending_approval&method=cash&q=Sh%2A%28op&from=2026-11-01&to=2026-11-05&page=2");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.payload.total, 137, "total comes from the database count");
  assert.strictEqual(r.payload.page, 2);
  assert.strictEqual(r.payload.stats.pendingCount, 2);
  assert.strictEqual(r.payload.stats.pendingAmount, 250);
  assert.strictEqual(r.payload.stats.approvedCount, 9);
  assert.strictEqual(r.payload.stats.rejectedCount, 3);
  assert.strictEqual(r.payload.stats.approvedMonthAmount, 400);
  assert.strictEqual(r.payload.rows[0].total_amount, 250);
  assert.strictEqual(r.payload.rows[0].invoices[0].invoiceNo, "INV-1");
  assert.strictEqual(r.payload.rows[0].invoices[0].outstanding, 300, "outstanding is shown per invoice (nothing approved yet)");
  assert(r.payload.rows[0].invoices[0].evidenceUrl.startsWith("/api/accounts/evidence/photo1"), "photo link goes through the protected evidence API");
  const listUrl = seen.find((x) => x.includes("customer_code"));
  assert(listUrl.includes("status=eq.pending_approval") && listUrl.includes("method=eq.cash") && listUrl.includes("ilike.") && listUrl.includes("received_at=gte.") && listUrl.includes("received_at=lt.") && listUrl.includes("offset=25&") || listUrl.includes("offset=25"), "filters and page offset reach the query");
  assert(listUrl.includes("ilike.") && !listUrl.includes("%28") && !listUrl.includes("(op"), "search text is cleaned");

  const bad = await call("POST", "/api/accounts/collections/" + UUID + "/reject", admin, "", { reason: "x" });
  assert.strictEqual(bad.status, 400, "reason is required");
  assert.strictEqual((await call("POST", "/api/accounts/collections/not-an-id/reject", admin, "", { reason: "wrong bill" })).status, 400, "bad id refused");
  const ok = await call("POST", "/api/accounts/collections/" + UUID + "/reject", admin, "", { reason: "  Photo is blurry " });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(rpcCalls[0], { name: "gm_accounts_reject_collection", body: { p_collection_id: UUID, p_rejected_by: "A1", p_reason: "Photo is blurry" } }, "reject calls the database function");

  const oc = await call("GET", "/api/accounts/office-cash", admin);
  assert.strictEqual(oc.payload.officeBalance, 12000, "office cash balance counts all 1200 entries");

  const page = read("admin/collections.html"), a = read("shared/admin.js"), s = read("server.js"), sql = read("sql/supabase-accounts-phase-6a-collection-rejection.sql");
  assert(page.includes('GA.mount("collections.html"') && page.includes("/api/accounts/collections") && page.includes("\"reject\"") && page.includes("\"approve\""), "page uses the list, approve and reject APIs");
  assert(page.includes("coChecked") && page.includes("id=\"coApprove\" type=\"button\" disabled"), "Approve stays disabled until evidence is confirmed");
  assert(a.includes('"collections.html": ["billing"]') && s.includes('"collections.html": ["billing"]') && a.includes('["collections.html", "Collections"'), "menu and permissions wired");
  assert(/status<>'pending_approval'/.test(sql) && /service_role/.test(sql) && !/journal_entries/.test(sql), "reject SQL: only from pending, service role only, no ledger posting");
  assert(page.includes("data-ok") && page.includes("data-no") && page.includes("coBulkGo") && page.includes("exportCsv") && page.includes("Invoice details"), "row Approve/Reject, bulk approve, export and invoice details are on the Collections page");
  assert(page.includes("csvCell") && page.includes("[=+"), "export guards against spreadsheet formulas");
  console.log("accounts collections regression passed");
})().catch((e) => { console.error(e); process.exit(1); });
