#!/usr/bin/env node
"use strict";
// Split payment (Phase 6C): the server-side split of invoice amounts across payment methods, the route, the SQL, and page wiring.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateSplitCollection } = require("../backend/modules/accounts/accounts.domain");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const EV = (n) => "accounts/evidence/00000000-0000-0000-0000-00000000000" + n + ".jpg";
const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b";
const balances = { [A]: { customerCode: "C1", outstandingAmount: 5000 }, [B]: { customerCode: "C1", outstandingAmount: 3000 } };
const base = (extra) => ({ customerCode: "C1", requestKey: "visit-1", note: "n", allocations: [{ invoiceId: A, amount: 5000, evidencePath: EV(1) }, { invoiceId: B, amount: 2000, evidencePath: EV(2) }], ...extra });
const total = (parts) => parts.reduce((n, p) => n + Math.round(p.total * 100), 0);

// The split: invoices are filled in order by the first method, then the next. An invoice can be paid two ways.
let v = validateSplitCollection(base({ payments: [{ method: "cash", amount: 4500 }, { method: "upi", amount: 2500 }] }), balances);
assert.strictEqual(v.total, 7000);
assert.deepStrictEqual(v.parts.map((p) => [p.method, p.total, p.allocations.map((a) => [a.invoiceId, a.amount])]), [
  ["cash", 4500, [[A, 4500]]],
  ["upi", 2500, [[A, 500], [B, 2000]]],
]);
assert.strictEqual(v.parts[0].allocations[0].evidencePath, EV(1));
assert.strictEqual(v.parts[1].allocations[0].evidencePath, EV(1), "the same bill photo backs both parts of an invoice");
assert.strictEqual(v.parts[1].allocations[1].evidencePath, EV(2));
assert.strictEqual(v.requestKey, "visit-1");

// Three methods, and exact paise.
v = validateSplitCollection({ customerCode: "C1", requestKey: "k", allocations: [{ invoiceId: A, amount: 0.1, evidencePath: EV(1) }, { invoiceId: B, amount: 0.2, evidencePath: EV(2) }], payments: [{ method: "cash", amount: 0.05 }, { method: "upi", amount: 0.15 }, { method: "bank_transfer", amount: 0.1 }] }, balances);
assert.strictEqual(v.total, 0.3);
assert.strictEqual(total(v.parts), 30, "no paise lost or invented");
assert.deepStrictEqual(v.parts.map((p) => p.allocations.map((a) => [a.invoiceId === A ? "A" : "B", a.amount])), [[["A", 0.05]], [["A", 0.05], ["B", 0.1]], [["B", 0.1]]]);
for (const p of v.parts) assert.strictEqual(p.allocations.reduce((n, a) => n + Math.round(a.amount * 100), 0), Math.round(p.total * 100), "each part adds up to its own payment");

// Rejections.
const bad = (mut, msg) => assert.throws(() => validateSplitCollection(base(mut), balances), msg);
bad({ payments: [{ method: "cash", amount: 7000 }] }, /two or three/);
bad({ payments: [] }, /two or three/);
bad({}, /two or three/);
bad({ payments: [{ method: "cash", amount: 1 }, { method: "upi", amount: 1 }, { method: "bank_transfer", amount: 1 }, { method: "cash", amount: 1 }] }, /two or three/);
bad({ payments: [{ method: "cash", amount: 4000 }, { method: "upi", amount: 2999.99 }] }, /add up/);
bad({ payments: [{ method: "cash", amount: 4000 }, { method: "upi", amount: 3000.01 }] }, /add up/);
bad({ payments: [{ method: "cash", amount: 4500 }, { method: "cash", amount: 2500 }] }, /only once/);
bad({ payments: [{ method: "cash", amount: 7000 }, { method: "upi", amount: 0 }] }, /greater than zero/);
bad({ payments: [{ method: "cash", amount: 7001 }, { method: "upi", amount: -1 }] }, /greater than zero|non-negative/);
bad({ payments: [{ method: "gold", amount: 4500 }, { method: "upi", amount: 2500 }] }, /Cash, UPI or Bank/);
bad({ payments: [{ method: "cash", amount: "abc" }, { method: "upi", amount: 2500 }] }, /./);
bad({ requestKey: "x".repeat(91), payments: [{ method: "cash", amount: 4500 }, { method: "upi", amount: 2500 }] }, /request reference/);
bad({ requestKey: "", payments: [{ method: "cash", amount: 4500 }, { method: "upi", amount: 2500 }] }, /request reference/);
bad({ allocations: [{ invoiceId: A, amount: 5001, evidencePath: EV(1) }], payments: [{ method: "cash", amount: 4500 }, { method: "upi", amount: 501 }] }, /exceed/);
bad({ allocations: [{ invoiceId: A, amount: 100, evidencePath: "" }], payments: [{ method: "cash", amount: 50 }, { method: "upi", amount: 50 }] }, /bill-photo/);
bad({ allocations: [{ invoiceId: A, amount: 100, evidencePath: EV(1) }, { invoiceId: A, amount: 100, evidencePath: EV(1) }], payments: [{ method: "cash", amount: 100 }, { method: "upi", amount: 100 }] }, /only once/);

// Route.
const calls = [];
const known = new Set([EV(1), EV(2)]);
const fakeFetch = async (url, opts) => {
  calls.push({ url, opts });
  const ok = (j) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => j, text: async () => "" });
  if (url.includes("/rpc/")) return ok({ ok: true, visitRef: "visit-1", collections: [] });
  if (url.includes("gm_accounts_invoices?")) return ok([{ id: A, customer_code: "C1", initial_outstanding: "5000" }, { id: B, customer_code: "C1", initial_outstanding: "3000" }]);
  return ok([]);
};
const send = (res, code, value) => { res.status = code; res.payload = value; res.done && res.done(); };
const routes = createAccountsRoutes({
  url: "https://example.supabase.co", key: "k", send, body: (req, cb) => cb(null, req.input),
  customerLookup: (c) => (c === "C1" ? { code: "C1", name: "Shop" } : null), canAccessCustomer: (s, c) => c === "C1",
  canBill: (x) => x.role === "admin", canCollect: (x) => x.role === "sales", files: known, fetch: fakeFetch,
});
const post = (input, session) => new Promise((resolve) => {
  const res = { done: () => resolve(res) };
  routes.handle({ method: "POST", input }, res, { pathname: "/api/accounts/collections/split", searchParams: new URLSearchParams() }, session);
});
const sales = { role: "sales", id: "e1", name: "Ravi" };
const rpcCalls = () => calls.filter((c) => c.url.includes("/rpc/"));
const body = (extra) => base({ payments: [{ method: "cash", amount: 4500 }, { method: "upi", amount: 2500 }], ...extra });

(async () => {
  assert.strictEqual((await post(body(), { role: "admin", id: "a" })).status, 403, "collectors only");
  assert.strictEqual((await post(body(), null)).status, 401);
  assert.strictEqual((await post(body({ customerCode: "C2" }), sales)).status, 400, "unknown customer");
  assert.strictEqual((await post(body({ payments: [{ method: "cash", amount: 7000 }] }), sales)).status, 400, "one method is not a split");
  assert.strictEqual((await post(body({ payments: [{ method: "cash", amount: 1 }, { method: "upi", amount: 1 }] }), sales)).status, 400, "amounts must match");
  assert.strictEqual((await post(body({ allocations: [{ invoiceId: "not-a-uuid", amount: 7000, evidencePath: EV(1) }] }), sales)).status, 400, "bad invoice id");
  assert.strictEqual((await post(body({ allocations: [{ invoiceId: A, amount: 5000, evidencePath: EV(1) }, { invoiceId: B, amount: 2000, evidencePath: "accounts/evidence/00000000-0000-0000-0000-0000000000ff.jpg" }] }), sales)).status, 400, "unknown photo");
  assert.strictEqual(rpcCalls().length, 0, "nothing reached the database for invalid requests");
  const ok = await post(body(), sales);
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(rpcCalls().length, 1, "one database call for the whole visit");
  assert(rpcCalls()[0].url.endsWith("/rpc/gm_accounts_record_split_collection"));
  const sent = JSON.parse(rpcCalls()[0].opts.body);
  assert.strictEqual(sent.p_request_key, "visit-1");
  assert.strictEqual(sent.p_collected_by, "e1", "recorded under the signed-in employee");
  assert.deepStrictEqual(sent.p_parts, [
    { method: "cash", allocations: [{ invoiceId: A, amount: 4500, evidencePath: EV(1) }] },
    { method: "upi", allocations: [{ invoiceId: A, amount: 500, evidencePath: EV(1) }, { invoiceId: B, amount: 2000, evidencePath: EV(2) }] },
  ]);
  assert.deepStrictEqual(ok.payload.parts, [{ method: "cash", total: 4500 }, { method: "upi", total: 2500 }]);

  // Admin list: the visit filter is validated and visit_ref is returned.
  const adm = (query) => new Promise((resolve) => {
    const res = { done: () => resolve(res) };
    routes.handle({ method: "GET" }, res, { pathname: "/api/accounts/collections", searchParams: new URLSearchParams(query) }, { role: "admin", id: "a" });
  });
  calls.length = 0;
  await adm("visit=visit-1:cash");
  assert(calls.some((c) => c.url.includes("visit_ref=eq.visit-1%3Acash") && /select=[^&]*visit_ref/.test(c.url)), "visit filter and column");
  calls.length = 0;
  await adm("visit=" + encodeURIComponent("x&status=eq.approved"));
  assert(!calls.some((c) => c.url.includes("visit_ref=eq.")), "a malformed visit value is ignored, not passed to the database");

  // SQL.
  const sql = read("sql/supabase-accounts-phase-6c-split-payment.sql");
  assert(sql.includes("add column if not exists visit_ref text") && sql.includes("function public.gm_accounts_record_split_collection("), "column and function");
  assert(sql.includes("public.gm_accounts_record_collection(") && !/insert into public\.gm_accounts_(journal|cash)/i.test(sql), "reuses the existing money rules, adds none");
  assert(/revoke all on function public\.gm_accounts_record_split_collection\(text,text,text,text,text,jsonb,text\) from public,anon,authenticated/.test(sql) && /grant execute on function public\.gm_accounts_record_split_collection\(text,text,text,text,text,jsonb,text\) to service_role/.test(sql), "not callable by browsers");

  // Pages.
  for (const [name, page, ids] of [["sales", read("sales/collections.html"), ["clSplit", "clSp_"]], ["worker", read("worker/collections.html"), ["splitChk", "sp_"]]]) {
    assert(page.includes("/api/accounts/collections/split") && page.includes("splitPayments()") && page.includes("splitOk()"), name + " page uses the split route and checks the sum");
    assert(page.includes('id="' + ids[0] + '"') && page.includes('id="' + ids[1] + 'cash"') && page.includes('id="' + ids[1] + 'upi"') && page.includes('id="' + ids[1] + 'bank_transfer"'), name + " page has the split inputs");
    assert(page.includes("/api/accounts/collections\"") || page.includes('"/api/accounts/collections",'), name + " page still posts single-method collections");
  }
  const adminPage = read("admin/collections.html");
  assert(adminPage.includes("visit_ref") && adminPage.includes("?visit=") && adminPage.includes("Split"), "admin page shows the split tag and the other parts");
  console.log("Accounts split-payment regression passed.");
})().catch((e) => { console.error(e); process.exit(1); });
