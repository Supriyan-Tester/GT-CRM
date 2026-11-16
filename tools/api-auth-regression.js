#!/usr/bin/env node
"use strict";
// End-to-end API authorization drill. Runs a disposable copy of the app with synthetic users/data.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const http = require("http");
const sourceRoot = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gmcrm-api-auth-"));
const app = path.join(tmp, "app");
const port = 18000 + Math.floor(Math.random() * 10000);
const password = "TestPass123";
const salt = crypto.randomBytes(16);
const hash = "s1$" + salt.toString("hex") + "$" + crypto.scryptSync(password, salt, 32).toString("hex");
const roles = ["Super Admin", "Admin", "Sales", "Billing", "Inventory", "Delivery", "Helper"];
const phones = roles.map((_, i) => "900000000" + i);
const accounts = roles.map((role, i) => ({ id: "A" + (i + 1), phone: phones[i], name: "Test " + role, role, perms: role === "Super Admin" || role === "Admin" ? [] : [role.toLowerCase()], status: "active" }));
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }
function req(method, pathname, cookie, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers: Object.assign({ "Content-Type": "application/json" }, cookie ? { Cookie: cookie } : {}, data ? { "Content-Length": data.length } : {}) }, (res) => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let child = null;
(async () => {
  try {
    fs.mkdirSync(app, { recursive: true });
    for (const f of ["server.js", "storage.js", "activity.js", "backup-integrity.js"]) fs.copyFileSync(path.join(sourceRoot, f), path.join(app, f));
    fs.cpSync(path.join(sourceRoot, "backend"), path.join(app, "backend"), { recursive: true });
    fs.cpSync(path.join(sourceRoot, "shared"), path.join(app, "shared"), { recursive: true });
    const items = {
      gm_admin_account_v1: accounts,
      gm_admin_workers_v1: { workers: [], leaves: [] },
      gm_admin_products_v1: { products: [{ id: "p1", name: "Synthetic Product" }] },
      gm_admin_ledger_v1: { entries: [{ id: "l1" }] },
      gm_admin_vehicles_v1: { vehicles: [{ id: "v1" }] },
      gm_admin_business_v1: { secret: "synthetic-private-business-data" },
      gm_admin_attedit_v1: { entries: [{ id: "att1" }] },
      gm_admin_settings_v1: { test: true },
    };
    writeJson(path.join(app, "data", "db.json"), { rev: Object.keys(items).length, items: Object.fromEntries(Object.entries(items).map(([k,v],i) => [k,{v:JSON.stringify(v),rev:i+1}])), activity: {} });
    writeJson(path.join(app, "data", "auth.json"), { admins: Object.fromEntries(accounts.map(a => [a.id, { h: hash, must: false }])), workers: {} });
    const childEnv = { ...process.env, PORT: String(port), NODE_ENV: "test" };
    // Explicitly strip cloud/proxy settings so this harness can never target a real Supabase project.
    delete childEnv.SUPABASE_URL;
    delete childEnv.SUPABASE_SERVICE_KEY;
    delete childEnv.SUPABASE_BUCKET;
    delete childEnv.RENDER;
    delete childEnv.TRUST_PROXY;
    child = spawn(process.execPath, ["server.js"], { cwd: app, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
    const waitReady = async () => { for (let i=0;i<80;i++) { if (child.exitCode !== null) throw new Error("test server exited: " + logs); try { const r=await req("GET","/api/health"); if(r.status===200)return; } catch {} await wait(100); } throw new Error("test server did not start: " + logs); };
    await waitReady();
    // boot migrates legacy non-admin account roles into employee records; login by phone remains supported.
    const sessions = {};
    for (let i=0;i<roles.length;i++) {
      const login = await req("POST", "/api/login", null, { phone: phones[i], password });
      assert.strictEqual(login.status, 200, roles[i] + " login");
      const cookie = (login.headers["set-cookie"] || []).join(";").match(/gm_sid=[A-Za-z0-9_-]+/);
      assert(cookie, roles[i] + " receives session cookie");
      sessions[roles[i]] = cookie[0];
      const me = await req("GET", "/api/me", cookie[0]);
      assert.strictEqual(me.status, 200, roles[i] + " /api/me");
    }
    console.log("PASS seven synthetic roles authenticate and receive sessions");

    // Privileged endpoints: only Super Admin can access account and access administration / backups.
    for (const role of roles.slice(1)) {
      for (const [method, url, body] of [["GET","/api/users"],["GET","/api/access"],["GET","/api/export"],["POST","/api/import",{}]]) {
        const r = await req(method,url,sessions[role],body);
        assert.strictEqual(r.status,403, role + " denied " + url + " (got " + r.status + ")");
      }
    }
    assert.strictEqual((await req("GET","/api/users",sessions["Super Admin"])).status,200);
    assert.strictEqual((await req("GET","/api/access",sessions["Super Admin"])).status,200);
    assert.strictEqual((await req("GET","/api/export",sessions["Super Admin"])).status,200);
    assert.strictEqual((await req("GET","/api/activity",sessions.Admin)).status,200);
    assert.strictEqual((await req("GET","/api/activity",sessions["Super Admin"])).status,200);
    for (const role of roles.slice(2)) assert.strictEqual((await req("GET","/api/activity",sessions[role])).status,403, role + " activity denied");
    console.log("PASS Super Admin-only management/export and full-admin activity endpoints enforce authorization");

    // Module-scoped writes through the actual generic KV route.
    const targets = ["gm_admin_products_v1","gm_admin_ledger_v1","gm_admin_vehicles_v1","gm_admin_attedit_v1"];
    const allowed = { "Admin": targets, "Sales": [], "Billing": ["gm_admin_ledger_v1"], "Inventory": ["gm_admin_products_v1"], "Delivery": [], "Helper": [] };
    for (const role of roles.slice(1)) {
      for (const key of targets) {
        const latest = JSON.parse((await req("GET","/api/state",sessions["Super Admin"])).body);
        const r = await req("PUT", "/api/kv/"+key, sessions[role], { v: JSON.stringify({ probe: role }), base: latest.items[key].rev });
        assert.strictEqual(r.status, (allowed[role] || []).includes(key) ? 200 : 403, role + " write " + key + " (got " + r.status + ")");
      }
    }
    for (const role of roles) {
      const r = await req("PUT", "/api/kv/gm_admin_access_v1", sessions[role], { v: "{}" });
      assert.strictEqual(r.status,403, role + " cannot write server-owned access record through KV");
    }
    for (const role of ["Delivery","Helper"]) {
      const me = JSON.parse((await req("GET","/api/me",sessions[role])).body);
      const own = await req("PUT","/api/kv/gm_crm_data_v5__"+me.id,sessions[role],{v:JSON.stringify({self:role})});
      assert.strictEqual(own.status,200,role+" can write own worker record");
      const other = await req("PUT","/api/kv/gm_crm_data_v5__W999",sessions[role],{v:"{}"});
      assert.strictEqual(other.status,403,role+" cannot write another worker record");
    }
    console.log("PASS module write boundaries, worker self-isolation and server-owned KV records enforced over HTTP");

    // Role-specific state must not expose the private business record to module accounts.
    for (const role of ["Sales","Billing","Inventory","Delivery","Helper"]) {
      const state = await req("GET","/api/state",sessions[role]);
      assert.strictEqual(state.status,200);
      const parsed = JSON.parse(state.body);
      assert(!parsed.items.gm_admin_business_v1, role + " cannot read private business record");
    }
    const superState = JSON.parse((await req("GET","/api/state",sessions["Super Admin"])).body);
    assert(superState.items.gm_admin_business_v1, "Super Admin can read private business record");
    console.log("PASS API state filters sensitive records by role");

    // Sales must be restricted to its own sales endpoints and allowed read-only state.
    assert.strictEqual((await req("GET","/api/users",sessions.Sales)).status,403);
    assert.strictEqual((await req("GET","/api/activity",sessions.Sales)).status,403);
    assert.strictEqual((await req("PUT","/api/kv/gm_admin_products_v1",sessions.Sales,{v:"{}"})).status,403);
    console.log("PASS Sales session cannot call admin APIs or write shared records");

    // Role changes and deactivation must revoke existing sessions immediately.
    const roleChange = await req("PUT","/api/users/A2",sessions["Super Admin"],{name:accounts[1].name,phone:phones[1],role:"Super Admin",status:"active",perms:[],email:""});
    assert.strictEqual(roleChange.status,200,"Super Admin can change synthetic account role");
    assert.strictEqual((await req("GET","/api/me",sessions.Admin)).status,401,"old Admin session revoked after role change");
    const promotedLogin = await req("POST","/api/login",null,{phone:phones[1],password});
    assert.strictEqual(promotedLogin.status,200,"promoted account can authenticate under new role");
    const promotedCookie = (promotedLogin.headers["set-cookie"] || []).join(";").match(/gm_sid=[A-Za-z0-9_-]+/)[0];
    assert.strictEqual(JSON.parse((await req("GET","/api/me",promotedCookie)).body).super,true,"new session receives current Super Admin privileges");
    const deactivate = await req("PUT","/api/users/A2",sessions["Super Admin"],{name:accounts[1].name,phone:phones[1],role:"Super Admin",status:"inactive",perms:[],email:""});
    assert.strictEqual(deactivate.status,200,"Super Admin can deactivate synthetic account");
    assert.strictEqual((await req("GET","/api/me",promotedCookie)).status,401,"deactivation revokes active session");
    const inactiveLogin = await req("POST","/api/login",null,{phone:phones[1],password});
    assert.strictEqual(inactiveLogin.status,403,"inactive Super Admin cannot login");
    console.log("PASS role changes and account deactivation revoke sessions; inactive login is rejected");

    console.log("API authorization regression: all 6 test groups passed in an isolated local server.");
  } finally {
    // Stop server and remove disposable fixtures. Never touches the source project's data or cloud credentials.
    try { child.kill("SIGTERM"); } catch {}
    await wait(700);
    fs.rmSync(tmp,{recursive:true,force:true});
  }
})().catch(e => { console.error(e.stack || e); process.exitCode=1; });
