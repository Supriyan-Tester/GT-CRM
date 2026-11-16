#!/usr/bin/env node
"use strict";
// Request correction (Phase 6B) and the employee's own collection list: permissions, validation, RPC call, own-rows-only, SQL and page wiring.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const calls = [];
let rpcFail = "";
const mine = [{ id: "c1", customer_name_snapshot: "Shop", method: "cash", total_amount: "250.50", status: "correction_requested", received_at: "2026-11-05T05:00:00Z", rejection_reason: null, correction_note: "Wrong invoice" }];
const fakeFetch = async (url, opts) => {
  calls.push({ url, opts });
  if (url.includes("/rpc/")) {
    if (rpcFail) return { ok: false, status: 400, headers: { get: () => null }, text: async () => rpcFail, json: async () => ({}) };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, status: "correction_requested" }), text: async () => "" };
  }
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => (url.includes("collected_by=eq.") ? mine : []), text: async () => "" };
};
const send = (res, code, value) => { res.status = code; res.payload = value; res.done && res.done(); };
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "k", send, body: (req, cb) => cb(null, req.input), customerLookup: () => null,
  canBill: (x) => x.role === "admin" && x.billing === true, canCollect: (x) => x.role === "sales" || x.role === "worker", fetch: fakeFetch,
});
const call = (method, p, session, input, query) => new Promise((resolve) => {
  const res = { done: () => resolve(res) };
  const url = new URL("http://x" + p + (query || ""));
  routes.handle({ method, input }, res, { pathname: p, searchParams: url.searchParams }, session);
});
const ID = "11111111-2222-3333-4444-555555555555";
const rpcCalls = () => calls.filter((c) => c.url.includes("/rpc/"));

(async () => {
  const admin = { role: "admin", billing: true, id: "admin1" }, sales = { role: "sales", id: "e1" };
  const rc = "/api/accounts/collections/" + ID + "/request-correction";

  // Request correction.
  assert.strictEqual((await call("POST", rc, sales, { note: "Wrong invoice" })).status, 403, "Billing only");
  assert.strictEqual((await call("POST", rc, null, { note: "Wrong invoice" })).status, 401);
  assert.strictEqual((await call("POST", "/api/accounts/collections/not-an-id/request-correction", admin, { note: "Wrong invoice" })).status, 400, "bad id");
  assert.strictEqual((await call("POST", rc, admin, { note: "ab" })).status, 400, "note too short");
  assert.strictEqual((await call("POST", rc, admin, {})).status, 400, "note required");
  assert.strictEqual(rpcCalls().length, 0, "nothing reached the database for invalid requests");
  const ok = await call("POST", rc, admin, { note: "  Wrong invoice, please record again  " });
  assert.strictEqual(ok.status, 200);
  const sent = JSON.parse(rpcCalls()[0].opts.body);
  assert(rpcCalls()[0].url.endsWith("/rpc/gm_accounts_request_collection_correction"));
  assert.deepStrictEqual(sent, { p_collection_id: ID, p_requested_by: "admin1", p_note: "Wrong invoice, please record again" });
  await call("POST", rc, admin, { note: "x".repeat(500) });
  assert.strictEqual(JSON.parse(rpcCalls()[1].opts.body).p_note.length, 300, "note capped at 300");
  rpcFail = "Collection is not pending approval";
  assert.strictEqual((await call("POST", rc, admin, { note: "Too late now" })).status, 409, "already decided -> conflict");
  rpcFail = "";

  // Employee's own list: only their rows, whatever the query string says.
  assert.strictEqual((await call("GET", "/api/accounts/my-collections", admin)).status, 403, "collectors only");
  assert.strictEqual((await call("GET", "/api/accounts/my-collections", null)).status, 401);
  calls.length = 0;
  const m = await call("GET", "/api/accounts/my-collections", sales, null, "?collected_by=e2");
  assert.strictEqual(m.status, 200);
  assert(calls[0].url.includes("collected_by=eq.e1") && !calls[0].url.includes("e2"), "filtered by the signed-in employee only");
  assert.strictEqual(m.payload.collections[0].total_amount, 250.5);
  assert.strictEqual(m.payload.collections[0].correction_note, "Wrong invoice");

  // Admin list accepts the new status and reports its count.
  calls.length = 0;
  const l = await call("GET", "/api/accounts/collections", admin, null, "?status=correction_requested");
  assert.strictEqual(l.status, 200);
  assert(calls.some((c) => c.url.includes("status=eq.correction_requested") && c.url.includes("correction_note")), "filter and columns");
  assert.strictEqual(typeof l.payload.stats.correctionCount, "number");

  // SQL.
  const sql = read("sql/supabase-accounts-phase-6b-collection-correction.sql");
  assert(/check \(status in \('pending_approval','approved','rejected','reversed','correction_requested'\)\)/.test(sql), "status list");
  assert(sql.includes("function public.gm_accounts_request_collection_correction(") && sql.includes("status<>'pending_approval'") && sql.includes("for update"), "only pending, row locked");
  assert(/revoke all on function public\.gm_accounts_request_collection_correction\(uuid,text,text\) from public,anon,authenticated/.test(sql) && /grant execute on function public\.gm_accounts_request_collection_correction\(uuid,text,text\) to service_role/.test(sql), "not callable by browsers");
  assert(!/insert into public\.gm_accounts_journal/i.test(sql), "posts nothing to the ledger");

  // Pages.
  const admPage = read("admin/collections.html"), salesPage = read("sales/collections.html"), workerPage = read("worker/collections.html");
  assert(admPage.includes("request-correction") && admPage.includes("correction_requested") && admPage.includes("esc(x.correction_note"), "admin page: button, tab and escaped note");
  for (const [name, page, esc] of [["sales", salesPage, "Sales.esc(x.customer_name_snapshot)"], ["worker", workerPage, "esc(x.customer_name_snapshot)"]]) {
    assert(page.includes("/api/accounts/my-collections") && page.includes("correction_requested") && page.includes(esc), name + " page lists own collections, escaped");
    assert(page.includes("rejection_reason") && page.includes("correction_note") && page.includes("please record this collection again"), name + " page shows the reason");
  }
  console.log("Accounts correction regression passed.");
})().catch((e) => { console.error(e); process.exit(1); });
