#!/usr/bin/env node
"use strict";
// Isolated test: when a person is renamed, every saved copy of the name changes; unrelated names do not.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");

const sourceRoot = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gmcrm-rename-"));
const port = 21000 + Math.floor(Math.random() * 7000);
const password = "RenamePass123";
const salt = crypto.randomBytes(16);
const hash = "s1$" + salt.toString("hex") + "$" + crypto.scryptSync(password, salt, 32).toString("hex");
const wait = ms => new Promise(r => setTimeout(r, ms));
function request(method, pathname, cookie, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method,
      headers: Object.assign({ "Content-Type": "application/json" }, cookie ? { Cookie: cookie } : {}, data ? { "Content-Length": data.length } : {}) },
      res => { const c = []; res.on("data", d => c.push(d)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c).toString() })); });
    req.on("error", reject); if (data) req.write(data); req.end();
  });
}
let child;
(async () => {
  try {
    const app = path.join(tmp, "app");
    fs.mkdirSync(app, { recursive: true });
    for (const f of ["server.js", "storage.js", "activity.js", "backup-integrity.js"]) fs.copyFileSync(path.join(sourceRoot, f), path.join(app, f));
    fs.cpSync(path.join(sourceRoot, "shared"), path.join(app, "shared"), { recursive: true });

    const accounts = [
      { id: "ADM1", phone: "9000000001", name: "Boss Admin", role: "Super Admin", status: "active" }
    ];
    const workers = [
      { id: "SAL1", phone: "9000000002", name: "Sales", active: true }, // a salesperson is an employee; a plain word as a name, like a default account
      { id: "W1", phone: "9000000003", name: "Ravi Kumar", active: true },
      { id: "W2", phone: "9000000004", name: "Twin Name", active: true },
      { id: "W3", phone: "9000000005", name: "Twin Name", active: true } // two people share a name
    ];
    const values = {
      gm_admin_account_v1: accounts,
      gm_admin_workers_v1: { workers, leaves: [] },
      gm_admin_v1: {
        customers: [{ code: "S1", name: "Ravi Kumar Stores", active: true }],
        plans: { "2026-11-01": [{ workerId: "W1", worker: "Ravi Kumar", createdBy: "Boss Admin",
          history: [{ by: "Boss Admin", text: "Plan created for Ravi Kumar on AREA (3 deliveries)." }],
          stops: [{ name: "Ravi Kumar Stores" }] }] }
      },
      gm_sales_orders_v1: [{ id: "SO-1001", rep: "SAL1", repName: "Sales", code: "S1", shop: "Ravi Kumar Stores", status: "placed",
        stages: { processing: { at: 1, by: "Boss Admin" } }, cancelBy: "Boss Admin",
        deliveryAssignment: { workerId: "W1", workerName: "Ravi Kumar", assignedBy: "Boss Admin" },
        deliveryResult: { by: "W1", workerName: "Ravi Kumar" } },
        // renamed before this feature existed: the saved copy is out of date
        { id: "SO-1002", rep: "W1", repName: "Old Stale Name", code: "S1", shop: "Ravi Kumar Stores", status: "placed" }],
      gm_inventory_returns_v1: [{ id: "RET-1", workerId: "W1", workerName: "Ravi Kumar", inspectedBy: "Boss Admin" },
        { id: "RET-2", workerId: "W2", workerName: "Twin Name", inspectedBy: "Twin Name" }],
      gm_admin_notifs_v1: [
        { id: "N1", worker: "Sales", title: "Sales punched in", text: "Sales punched in at 08:52." },
        { id: "N2", worker: "Ravi Kumar", title: "Ravi Kumar punched in", text: "Ravi Kumar delivered 2 items, bill #1." },
        { id: "N3", worker: "Sales", title: "New order SO-1001: Ravi Kumar Stores", text: "Sales took an order for Ravi Kumar Stores: 1 item, Rs 36." }
      ],
      gm_crm_data_v5__W1: { worker: { name: "Ravi Kumar" } },
      gm_loc_W1: { name: "Ravi Kumar", lat: 1 },
      gm_admin_wprofile_v1: { SAL1: { role: "Sales" } },
      gm_admin_settings_v1: { lateAfter: "08:30" }
    };
    const items = {}; let rev = 1;
    for (const [k, v] of Object.entries(values)) items[k] = { v: JSON.stringify(v), rev: rev++ };
    const activity = { "202611": [
      { t: 1, by: "Ravi Kumar", role: "worker", uid: "W1", type: "x", text: "Delivered stop" },
      { t: 2, by: "Boss Admin", role: "admin", uid: "ADM1", type: "plan", text: "Daily plan created: AREA, Ravi Kumar, TN1 on 2026-11-01" },
      { t: 3, by: "Sales", role: "sales", uid: "SAL1", type: "attendance", text: "Sales punched in at 08:52" }
    ] };
    fs.mkdirSync(path.join(app, "data"), { recursive: true });
    fs.writeFileSync(path.join(app, "data", "db.json"), JSON.stringify({ rev, items, activity }));
    fs.writeFileSync(path.join(app, "data", "auth.json"), JSON.stringify({ admins: { ADM1: { h: hash, must: false } }, workers: { W1: { h: hash }, SAL1: { h: hash } } }));
    const env = { ...process.env, PORT: String(port), NODE_ENV: "test" };
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_BUCKET", "RENDER", "TRUST_PROXY"]) delete env[k];
    child = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: "ignore" });
    for (let i = 0; i < 100; i++) { try { if ((await request("GET", "/api/health")).status === 200) break; } catch (_) {} await wait(100); }

    const lg = await request("POST", "/api/login", null, { phone: "9000000001", password });
    assert.strictEqual(lg.status, 200, "admin login: " + lg.body);
    const admin = (lg.headers["set-cookie"] || []).join(";").match(/gm_sid=[A-Za-z0-9_-]+/)[0];
    const state = async () => JSON.parse((await request("GET", "/api/state?since=0", admin)).body);
    const read = (st, k) => JSON.parse(st.items[k].v);

    // 0) a copy saved under an old name is put right when the server starts
    let st0 = await state();
    assert.strictEqual(read(st0, "gm_sales_orders_v1")[1].repName, "Ravi Kumar", "start-up refresh fixes an out-of-date name copy");

    // 1) rename the salesperson (an employee named with a plain word) through the generic save
    let st = await state();
    const emps = read(st, "gm_admin_workers_v1");
    emps.workers.find(w => w.id === "SAL1").name = "Arun Kumar";
    const r1 = await request("PUT", "/api/kv/gm_admin_workers_v1", admin, { v: JSON.stringify(emps), base: st.items.gm_admin_workers_v1.rev });
    assert.strictEqual(r1.status, 200, "Sales rename accepted: " + r1.body);
    st = await state();
    assert.strictEqual(read(st, "gm_admin_wprofile_v1").SAL1.role, "Sales", "the role word Sales is not touched");
    const o = read(st, "gm_sales_orders_v1")[0];
    assert.strictEqual(o.repName, "Arun Kumar", "order keeps the new salesperson name");
    const nt = read(st, "gm_admin_notifs_v1");
    assert.strictEqual(nt[0].worker, "Arun Kumar", "notification person updated");
    assert.strictEqual(nt[0].text, "Arun Kumar punched in at 08:52.", "notification text starts with the new name");
    assert.strictEqual(nt[0].title, "Sales punched in", "the word Sales in a title is a label, not the name, so it stays");
    assert.strictEqual(nt[2].text, "Arun Kumar took an order for Ravi Kumar Stores: 1 item, Rs 36.", "order notification updated, shop name untouched");
    const act = (await request("GET", "/api/activity?month=202611", admin));
    assert.strictEqual(act.status, 200, "activity log readable: " + act.body.slice(0, 200));
    const ev = JSON.parse(act.body).events || [];
    const mine = ev.find(e => e.type === "attendance");
    assert(mine && mine.by === "Arun Kumar", "activity entry shows the new name");
    assert.strictEqual(mine.text, "Sales punched in at 08:52", "plain word in activity text is not rewritten");

    // 1b) rename the admin through the Users screen API: "who did it" copies follow
    const r1b = await request("PUT", "/api/users/ADM1", admin, { name: "Boss Owner", phone: "9000000001", role: "Super Admin", status: "active" });
    assert.strictEqual(r1b.status, 200, "Admin rename accepted: " + r1b.body);
    st = await state();
    const o1b = read(st, "gm_sales_orders_v1")[0];
    assert.strictEqual(o1b.stages.processing.by, "Boss Owner", "stage history shows the new admin name");
    assert.strictEqual(o1b.cancelBy, "Boss Owner", "cancelled-by shows the new admin name");
    assert.strictEqual(o1b.deliveryAssignment.assignedBy, "Boss Owner", "assigned-by shows the new admin name");
    assert.strictEqual(read(st, "gm_admin_v1").plans["2026-11-01"][0].createdBy, "Boss Owner", "plan created-by");

    // 2) rename a delivery employee through the generic save (needs the current revision)
    st = await state();
    const wrec = read(st, "gm_admin_workers_v1");
    wrec.workers.find(w => w.id === "W1").name = "Ravi Shankar";
    const put = await request("PUT", "/api/kv/gm_admin_workers_v1", admin, { v: JSON.stringify(wrec), base: st.items.gm_admin_workers_v1.rev });
    assert.strictEqual(put.status, 200, "employee rename saved: " + put.body);
    st = await state();
    const o2 = read(st, "gm_sales_orders_v1")[0];
    assert.strictEqual(o2.deliveryAssignment.workerName, "Ravi Shankar", "delivery assignment name");
    assert.strictEqual(o2.deliveryResult.workerName, "Ravi Shankar", "delivery result name");
    assert.strictEqual(o2.shop, "Ravi Kumar Stores", "shop name never changes");
    assert.strictEqual(read(st, "gm_admin_v1").customers[0].name, "Ravi Kumar Stores", "customer name never changes");
    const plan = read(st, "gm_admin_v1").plans["2026-11-01"][0];
    assert.strictEqual(plan.worker, "Ravi Shankar", "plan employee name");
    assert.strictEqual(plan.history[0].text, "Plan created for Ravi Shankar on AREA (3 deliveries).", "plan history text");
    assert.strictEqual(plan.stops[0].name, "Ravi Kumar Stores", "stop (shop) name untouched");
    assert.strictEqual(read(st, "gm_inventory_returns_v1")[0].workerName, "Ravi Shankar", "return employee name");
    assert.strictEqual(read(st, "gm_crm_data_v5__W1").worker.name, "Ravi Shankar", "per-employee record name");
    assert.strictEqual(read(st, "gm_loc_W1").name, "Ravi Shankar", "location record name");
    const n2 = read(st, "gm_admin_notifs_v1");
    assert.strictEqual(n2[1].worker, "Ravi Shankar", "notification person");
    assert.strictEqual(n2[1].title, "Ravi Shankar punched in", "notification title");
    assert.strictEqual(n2[1].text, "Ravi Shankar delivered 2 items, bill #1.", "notification text");

    // 3) two people shared a name: id-linked copies change, name-only copies are left alone
    st = await state();
    const w2 = read(st, "gm_admin_workers_v1");
    w2.workers.find(w => w.id === "W2").name = "Twin Renamed";
    const put2 = await request("PUT", "/api/kv/gm_admin_workers_v1", admin, { v: JSON.stringify(w2), base: st.items.gm_admin_workers_v1.rev });
    assert.strictEqual(put2.status, 200, "second rename saved: " + put2.body);
    st = await state();
    const ret = read(st, "gm_inventory_returns_v1")[1];
    assert.strictEqual(ret.workerName, "Twin Renamed", "id-linked copy changes even when the name was shared");
    assert.strictEqual(ret.inspectedBy, "Twin Name", "name-only copy is left alone when the old name was shared");

    // 4) saving without a rename changes nothing else
    st = await state();
    const before = JSON.stringify(read(st, "gm_sales_orders_v1"));
    const same = read(st, "gm_admin_workers_v1");
    const put3 = await request("PUT", "/api/kv/gm_admin_workers_v1", admin, { v: JSON.stringify(Object.assign({}, same, { leaves: [] })), base: st.items.gm_admin_workers_v1.rev });
    assert([200].includes(put3.status), "no-rename save ok: " + put3.body);
    assert.strictEqual(JSON.stringify(read(await state(), "gm_sales_orders_v1")), before, "no rename, no change");

    console.log("PASS Rename propagation: orders, delivery, returns, plans, notifications, per-employee records and activity follow a rename; shop names, plain role words and shared names are protected (30 assertions).");
  } finally {
    try { if (child) child.kill("SIGTERM"); } catch (_) {}
    await wait(300);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });