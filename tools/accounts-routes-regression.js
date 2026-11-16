#!/usr/bin/env node
"use strict";
const assert = require("assert");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
function response() {
  return { status: 0, payload: null, headersSent: false, writeHead(code) { this.status = code; }, end(value) { this.payload = JSON.parse(value); this.headersSent = true; } };
}
function send(res, code, value) { res.writeHead(code); res.end(JSON.stringify(value)); }
const customerLookup = (code) => code === "C001" ? { code, name: "Test Shop" } : null;
let called = null;
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "service-test-key", send,
  body: (req, cb) => cb(null, req.payload), customerLookup,
  canBill: (s) => s.role === "admin" && s.billing === true,
  canCollect: (s) => s.role === "sales" || s.role === "worker",
  isActiveDeliveryWorker: () => true, employeeName: () => "Tester",
  fetch: async (url, options) => {
    called = { url, options };
    return { ok: true, status: 200, json: async () => ({ ok: true, collectionId: "11111111-1111-4111-8111-111111111111" }), text: async () => "" };
  },
});
let res = response();
assert.strictEqual(routes.handle({ method: "GET" }, res, { pathname: "/api/accounts/collections/pending" }, { role: "sales" }), true);
assert.strictEqual(res.status, 403);
res = response();
assert.strictEqual(routes.handle({ method: "POST", payload: {} }, res, { pathname: "/api/accounts/opening-invoices" }, { role: "sales" }), true);
assert.strictEqual(res.status, 403);
res = response();
assert.strictEqual(routes.handle({ method: "POST", payload: { customerCode: "NOPE" } }, res, { pathname: "/api/accounts/opening-invoices" }, { role: "admin", billing: true, id: "A1" }), true);
assert.strictEqual(res.status, 400);
res = response();
assert.strictEqual(routes.handle({ method: "POST" }, res, { pathname: "/api/accounts/collections/11111111-1111-4111-8111-111111111111/approve" }, { role: "admin", billing: true, id: "A1" }), true);
setImmediate(() => {
  assert.strictEqual(res.status, 200);
  assert.ok(called.url.includes("rpc/gm_accounts_approve_collection"));
  assert.strictEqual(JSON.parse(called.options.body).p_approved_by, "A1");
  const noConfig = createAccountsRoutes({ send, body: (req, cb) => cb(null, {}), customerLookup, canBill: () => true, canCollect: () => true });
  const missing = response();
  noConfig.handle({ method: "GET" }, missing, { pathname: "/api/accounts/collections/pending" }, { role: "admin" });
  assert.strictEqual(missing.status, 503);
  console.log("Accounts routes regression: 7 assertions passed.");
});
