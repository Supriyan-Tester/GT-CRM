#!/usr/bin/env node
"use strict";
const assert = require("assert");
const { createHealthRoutes } = require("../backend/modules/health/health.routes");

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }
function harness(options = {}) {
  const responses = [];
  const errors = [];
  const handler = createHealthRoutes({
    send: (_res, status, body) => { responses.push({ status, body }); return "sent"; },
    cloud: !!options.cloud,
    ping: options.ping || (() => Promise.resolve()),
    logger: { error: (...args) => errors.push(args) },
  });
  return { handler, responses, errors };
}
function request(pathname, method = "GET") {
  return { req: { method }, res: {}, url: { pathname } };
}

test("GET /api/health returns the unchanged liveness payload", () => {
  const h = harness();
  assert.strictEqual(h.handler(...Object.values(request("/api/health"))), "sent");
  assert.deepStrictEqual(h.responses, [{ status: 200, body: { ok: true } }]);
});
test("POST /api/health remains method-independent", () => {
  const h = harness({ cloud: true, ping: () => { throw Error("must not ping"); } });
  const r = request("/api/health", "POST");
  assert.strictEqual(h.handler(r.req, r.res, r.url), "sent");
  assert.deepStrictEqual(h.responses[0], { status: 200, body: { ok: true } });
});
test("health remains available when cloud storage is unavailable", () => {
  const h = harness({ cloud: true, ping: () => Promise.reject(Error("offline")) });
  const r = request("/api/health");
  h.handler(r.req, r.res, r.url);
  assert.strictEqual(h.responses[0].status, 200);
});
test("local readiness returns local storage payload", () => {
  const h = harness();
  const r = request("/api/ready");
  assert.strictEqual(h.handler(r.req, r.res, r.url), "sent");
  assert.deepStrictEqual(h.responses[0], { status: 200, body: { ok: true, storage: "local" } });
});
test("cloud readiness returns Supabase payload after ping", async () => {
  const h = harness({ cloud: true });
  const r = request("/api/ready");
  await h.handler(r.req, r.res, r.url);
  assert.deepStrictEqual(h.responses[0], { status: 200, body: { ok: true, storage: "supabase" } });
});
test("rejected cloud ping returns generic 503", async () => {
  const h = harness({ cloud: true, ping: () => Promise.reject(Error("secret detail")) });
  const r = request("/api/ready");
  await h.handler(r.req, r.res, r.url);
  assert.deepStrictEqual(h.responses[0], { status: 503, body: { ok: false, error: "Storage dependency unavailable" } });
  assert.strictEqual(JSON.stringify(h.responses).includes("secret detail"), false);
  assert.strictEqual(h.errors.length, 1);
});
test("synchronous ping failure returns controlled 503", () => {
  const h = harness({ cloud: true, ping: () => { throw Error("offline"); } });
  const r = request("/api/ready");
  assert.strictEqual(h.handler(r.req, r.res, r.url), "sent");
  assert.strictEqual(h.responses[0].status, 503);
});
test("POST /api/ready falls through to existing dispatcher", () => {
  const h = harness();
  const r = request("/api/ready", "POST");
  assert.strictEqual(h.handler(r.req, r.res, r.url), null);
  assert.deepStrictEqual(h.responses, []);
});
test("unrelated API route falls through", () => {
  const h = harness();
  const r = request("/api/login", "POST");
  assert.strictEqual(h.handler(r.req, r.res, r.url), null);
});
test("unrelated URL falls through", () => {
  const h = harness();
  const r = request("/login.html");
  assert.strictEqual(h.handler(r.req, r.res, r.url), null);
});

(async () => {
  let failed = 0;
  for (const item of cases) {
    try { await item.fn(); console.log("PASS", item.name); }
    catch (error) { failed++; console.error("FAIL", item.name, "\n", error); }
  }
  console.log(`\nHealth routes regression: ${cases.length - failed}/${cases.length} passed.`);
  if (failed) process.exitCode = 1;
})();
