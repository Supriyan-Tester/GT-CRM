#!/usr/bin/env node
"use strict";
const assert = require("assert");
const { createAccountsRoutes } = require("../backend/modules/accounts/accounts.routes");
const objects = new Map();
const files = {
  has: (p) => objects.has(p),
  put: async (p, b, mime) => { objects.set(p, Buffer.from(b)); },
  get: async (p) => objects.get(p) || null,
};
const customerLookup = (code) => code === "C001" ? { code, name: "Test Shop" } : null;
const fetch = async (url) => {
  const u = new URL(url);
  const path = u.pathname + u.search;
  if (path.includes("gm_accounts_collection_allocations")) {
    const evidence = (u.searchParams.get("evidence_path") || "").replace(/^eq\./,"");
    return { ok: true, json: async () => evidence && objects.has(evidence) ? [{ evidence_path: evidence, collection_id: "11111111-1111-4111-8111-111111111111" }] : [] };
  }
  if (path.includes("gm_accounts_invoices")) return { ok: true, json: async () => [] };
  if (path.includes("gm_accounts_collections")) return { ok: true, json: async () => [{ id: "11111111-1111-4111-8111-111111111111", collected_by: "S1" }] };
  return { ok: true, json: async () => [] };
};
function send(res, code, payload) { res.writeHead(code); res.end(JSON.stringify(payload)); }
function response() { return { status:0, payload:null, writeHead(c,h){this.status=c;this.headers=h||{};}, end(v){this.payload=Buffer.isBuffer(v)?v:(typeof v==="string"?JSON.parse(v):v);} }; }
const routes=createAccountsRoutes({
  url:"https://test.supabase.co",key:"test",files,send,
  body:(req,cb)=>cb(null,req.payload),fetch,customerLookup,
  canBill:(s)=>s.role==="admin",canCollect:(s)=>s.role==="sales"||s.role==="worker",
  canAccessCustomer:(s,code)=>s.role!=="worker"||code==="C001",
  isActiveDeliveryWorker:()=>true,employeeName:()=>"Tester",
});
(async()=>{
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const data="data:image/png;base64,"+png.toString("base64");
  let res=response();
  assert.strictEqual(routes.handle({method:"POST",payload:{data} },res,{pathname:"/api/accounts/evidence"},{role:"sales",id:"S1"}),true);
  await new Promise(r=>setImmediate(r));
  assert.strictEqual(res.status,201);
  assert.ok(res.payload.evidencePath.startsWith("accounts/evidence/"));
  assert.ok(files.has(res.payload.evidencePath));
  const token=res.payload.evidencePath.split("/").pop().replace(".png","");
  res=response();
  routes.handle({method:"GET"},res,{pathname:"/api/accounts/evidence/"+token},{role:"sales",id:"S1"});
  await new Promise(r=>setImmediate(r));
  assert.strictEqual(res.status,200);
  assert.ok(Buffer.isBuffer(res.payload));
  assert.strictEqual(res.headers["Content-Type"],"image/png");
  res=response();
  routes.handle({method:"GET"},res,{pathname:"/api/accounts/evidence/"+token},{role:"sales",id:"S2"});
  await new Promise(r=>setImmediate(r));
  assert.strictEqual(res.status,404);
  res=response();
  routes.handle({method:"POST",payload:{data:"data:image/png;base64,AAAA"}},res,{pathname:"/api/accounts/evidence"},{role:"sales",id:"S1"});
  assert.strictEqual(res.status,400);
  res=response();
  routes.handle({method:"POST",payload:{customerCode:"C001",invoiceNo:"OLD-1",invoiceDate:"2025-01-01",originalAmount:100,outstandingAmount:50,evidencePath:"accounts/evidence/00000000-0000-4000-8000-000000000000.png"}},res,{pathname:"/api/accounts/opening-invoices"},{role:"admin",id:"A1"});
  assert.strictEqual(res.status,400);
  console.log("Accounts evidence API regression: 8 assertions passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
