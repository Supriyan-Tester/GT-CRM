#!/usr/bin/env node
"use strict";
// Isolated HTTP workflow test: synthetic Sales + Super Admin accounts, local temporary DB only.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const http = require("http");

const sourceRoot = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gmcrm-sales-order-flow-"));
const app = path.join(tmp, "app");
const port = 21000 + Math.floor(Math.random() * 7000);
const password = "WorkflowPass123";
const salt = crypto.randomBytes(16);
const hash = "s1$" + salt.toString("hex") + "$" +
  crypto.scryptSync(password, salt, 32).toString("hex");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
function request(method, pathname, cookie, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1", port, path: pathname, method,
      headers: Object.assign(
        { "Content-Type": "application/json" },
        cookie ? { Cookie: cookie } : {},
        data ? { "Content-Length": data.length } : {}
      )
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let child;

(async () => {
  try {
    const workerOrdersPage = fs.readFileSync(path.join(sourceRoot, "worker", "orders.html"), "utf8");
    const workerHomePage = fs.readFileSync(path.join(sourceRoot, "worker", "home.html"), "utf8");
    const adminOrdersPage = fs.readFileSync(path.join(sourceRoot, "admin", "orders.html"), "utf8");
    assert(workerOrdersPage.includes("/api/worker/orders") && workerOrdersPage.includes("/api/worker/order-result"), "worker assigned-orders page calls dedicated APIs");
    assert(workerHomePage.includes('href="orders.html"'), "Delivery home links to assigned orders");
    assert(adminOrdersPage.includes("/api/salesadmin/assign-delivery") && adminOrdersPage.includes("Delivery Assignment"), "Admin order details exposes delivery assignment");
    assert(adminOrdersPage.includes("Delivery Result"), "Admin order details displays delivery result");
    fs.mkdirSync(app, { recursive: true });
    for (const file of ["server.js", "storage.js", "activity.js", "backup-integrity.js"]) {
      fs.copyFileSync(path.join(sourceRoot, file), path.join(app, file));
    }
    fs.cpSync(path.join(sourceRoot, "backend"), path.join(app, "backend"), { recursive: true });
    fs.cpSync(path.join(sourceRoot, "shared"), path.join(app, "shared"), { recursive: true });

    const accounts = [
      { id: "ADM1", phone: "9000000001", name: "Workflow Admin", role: "Super Admin", status: "active" },
      { id: "SAL1", phone: "9000000002", name: "Workflow Sales", role: "Sales", status: "active" }
    ];
    const workers = [
      { id: "WDEL1", phone: "9000000003", name: "Workflow Delivery", active: true },
      { id: "WDEL2", phone: "9000000004", name: "Unassigned Delivery", active: true }
    ];
    const values = {
      gm_admin_account_v1: accounts,
      gm_admin_workers_v1: { workers, leaves: [] },
      gm_admin_v1: {
        customers: [{ code: "SHOP-01", name: "Synthetic Shop", area: "Test Area", active: true }]
      },
      gm_admin_products_v1: [{
        id: "PROD-01", code: "P001", name: "Synthetic Product",
        unit: "pcs", price: 10, tax: 0, active: true, track: true, stock: 5
      }],
      gm_sales_orders_v1: [],
      gm_admin_settings_v1: { lateAfter: "08:30" }
    };
    const items = {};
    let rev = 1;
    for (const [key, value] of Object.entries(values)) {
      items[key] = { v: JSON.stringify(value), rev: rev++ };
    }
    writeJson(path.join(app, "data", "db.json"), { rev, items, activity: {} });
    writeJson(path.join(app, "data", "auth.json"), {
      admins: { ADM1: { h: hash, must: false }, SAL1: { h: hash, must: false } },
      workers: { WDEL1: { h: hash }, WDEL2: { h: hash } }
    });

    const env = { ...process.env, PORT: String(port), NODE_ENV: "test" };
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_BUCKET", "RENDER", "TRUST_PROXY"]) delete env[key];
    child = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "";
    child.stdout.on("data", data => logs += data);
    child.stderr.on("data", data => logs += data);

    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error("temporary server exited: " + logs);
      try {
        if ((await request("GET", "/api/health")).status === 200) { ready = true; break; }
      } catch (_) {}
      await wait(100);
    }
    assert(ready, "isolated server starts");

    async function login(phone) {
      const result = await request("POST", "/api/login", null, { phone, password });
      assert.strictEqual(result.status, 200, "synthetic account login succeeds for " + phone + ": " + result.body);
      const match = (result.headers["set-cookie"] || []).join(";").match(/gm_sid=[A-Za-z0-9_-]+/);
      assert(match, "session cookie issued");
      return match[0];
    }
    const admin = await login("9000000001");
    const sales = await login("9000000002");
    const delivery = await login("9000000003");
    const otherDelivery = await login("9000000004");

    // Sales must punch in before taking an order.
    const noPunch = await request("POST", "/api/sales/order", sales, {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 1 }], k: "workflow-no-punch-in"
    });
    assert.strictEqual(noPunch.status, 403, "Sales cannot place an order before punching in");
    assert.strictEqual(JSON.parse(noPunch.body).code, "punch_in_required");
    const punchIn = await request("POST", "/api/sales/attendance", sales, { action: "punch-in" });
    assert.strictEqual(punchIn.status, 200, "Sales can punch in: " + punchIn.body);

    // Sales cannot place an order above available tracked stock.
    const oversell = await request("POST", "/api/sales/order", sales, {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 6 }], k: "workflow-overstock"
    });
    assert.strictEqual(oversell.status, 400, "tracked stock prevents overselling");

    // Place an order with a stable request key.
    const payload = {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 2 }],
      k: "workflow-order-001", notes: "Synthetic workflow test"
    };
    const placed = await request("POST", "/api/sales/order", sales, payload);
    assert.strictEqual(placed.status, 200, "Sales can place a valid order: " + placed.body);
    const order = JSON.parse(placed.body).order;
    assert(order && order.id && order.status === "placed", "order is created in placed state");

    // Retry the same request key: it must return the original order.
    const retry = await request("POST", "/api/sales/order", sales, payload);
    assert.strictEqual(retry.status, 200, "same-key retry is accepted");
    assert.strictEqual(JSON.parse(retry.body).order.id, order.id, "retry returns same order id");

    // The position arrives after the order: it is attached once, only to the owner's order.
    const late = await request("POST", "/api/sales/order-location", sales, { id: order.id, lat: 12.9716, lng: 77.5946, acc: 12 });
    assert.strictEqual(late.status, 200, "Sales can attach a position to a just-placed order: " + late.body);
    assert.notStrictEqual(JSON.parse(late.body).skipped, true, "first position is applied");
    const lateAgain = await request("POST", "/api/sales/order-location", sales, { id: order.id, lat: 1, lng: 1, acc: 5 });
    assert.strictEqual(JSON.parse(lateAgain.body).skipped, true, "a position already attached is not overwritten");
    const lateMissing = await request("POST", "/api/sales/order-location", sales, { id: "SO-0", lat: 1, lng: 1 });
    assert.strictEqual(lateMissing.status, 404, "unknown order id is refused");
    // The admin notification and the stored order both carry the late position.
    const afterLoc = await request("GET", "/api/state", admin);
    const locItems = JSON.parse(afterLoc.body).items;
    const locOrder = JSON.parse(locItems["gm_sales_orders_v1"].v).find(x => x && x.id === order.id);
    assert(locOrder.loc && typeof locOrder.loc.lat === "number", "late position is saved on the order");
    const locNote = JSON.parse(locItems["gm_admin_notifs_v1"].v).find(x => x && String(x.title).indexOf("New order " + order.id + ":") === 0);
    assert(locNote && !/Location was not shared/.test(locNote.text), "notification no longer says the location was not shared: " + (locNote && locNote.text));
    assert(locNote.loc && typeof locNote.loc.lat === "number", "notification carries the position for the map link");

    // Delivery role cannot advance office-owned Sales order stages.
    const deniedStage = await request("POST", "/api/salesadmin/stage", delivery, { id: order.id, stage: "processing" });
    assert.strictEqual(deniedStage.status, 403, "Delivery role cannot call office Sales stage API");

    // Admin must progress stages in order.
    const outOfOrder = await request("POST", "/api/salesadmin/stage", admin, { id: order.id, stage: "out" });
    assert.strictEqual(outOfOrder.status, 400, "out-for-delivery cannot skip processing");
    const earlyAssign = await request("POST", "/api/salesadmin/assign-delivery", admin, { orderId: order.id, workerId: "WDEL1" });
    assert.strictEqual(earlyAssign.status, 409, "order cannot be assigned before it is out for delivery");
    const workerAssign = await request("POST", "/api/salesadmin/assign-delivery", delivery, { orderId: order.id, workerId: "WDEL1" });
    assert.strictEqual(workerAssign.status, 403, "delivery worker cannot assign orders");

    const processing = await request("POST", "/api/salesadmin/stage", admin, { id: order.id, stage: "processing" });
    assert.strictEqual(processing.status, 200, "Admin can mark processing");
    const processingRetry = await request("POST", "/api/salesadmin/stage", admin, { id: order.id, stage: "processing" });
    assert.strictEqual(processingRetry.status, 200, "duplicate processing retry is idempotent");
    assert.strictEqual(JSON.parse(processingRetry.body).alreadyApplied, true);

    const out = await request("POST", "/api/salesadmin/stage", admin, { id: order.id, stage: "out" });
    assert.strictEqual(out.status, 200, "Admin can mark out for delivery");
    const beforeAssign = await request("POST", "/api/salesadmin/assign-delivery", admin, { orderId: order.id, workerId: "WDEL1" });
    assert.strictEqual(beforeAssign.status, 200, "Admin can assign an out-for-delivery order");
    const unassignedList = await request("GET", "/api/worker/orders", otherDelivery);
    assert.strictEqual(unassignedList.status, 200, "Delivery worker can request assigned orders");
    assert.strictEqual(JSON.parse(unassignedList.body).orders.length, 0, "worker cannot see another worker's assigned order");
    const deniedResult = await request("POST", "/api/worker/order-result", otherDelivery, {
      orderId: order.id, items: [{ id: "PROD-01", deliveredQty: 2, returnReason: "" }]
    });
    assert.strictEqual(deniedResult.status, 403, "unassigned worker cannot submit delivery result");
    const assignedList = await request("GET", "/api/worker/orders", delivery);
    assert.strictEqual(assignedList.status, 200, "assigned worker can fetch assigned order");
    assert.strictEqual(JSON.parse(assignedList.body).orders[0].id, order.id, "assigned worker sees only assigned order");
    const invalidQty = await request("POST", "/api/worker/order-result", delivery, {
      orderId: order.id, items: [{ id: "PROD-01", deliveredQty: 3, returnReason: "" }]
    });
    assert.strictEqual(invalidQty.status, 400, "worker cannot report delivered quantity above ordered quantity");
    const missingReason = await request("POST", "/api/worker/order-result", delivery, {
      orderId: order.id, items: [{ id: "PROD-01", deliveredQty: 1, returnReason: "" }]
    });
    assert.strictEqual(missingReason.status, 400, "short delivery requires a return reason");
    const deliveryResult = await request("POST", "/api/worker/order-result", delivery, {
      orderId: order.id, items: [{ id: "PROD-01", deliveredQty: 1, returnReason: "Damaged pack" }], note: "Synthetic delivery test"
    });
    assert.strictEqual(deliveryResult.status, 200, "assigned worker can submit a valid delivery result");
    const deliveryRetry = await request("POST", "/api/worker/order-result", delivery, {
      orderId: order.id, items: [{ id: "PROD-01", deliveredQty: 1, returnReason: "Damaged pack" }]
    });
    assert.strictEqual(deliveryRetry.status, 200, "delivery result retry is idempotent");
    assert.strictEqual(JSON.parse(deliveryRetry.body).alreadyApplied, true);
    const noLongerPending = await request("GET", "/api/worker/orders", delivery);
    assert.strictEqual(JSON.parse(noLongerPending.body).orders.length, 0, "completed order is removed from pending worker list");

    // After punching out, a new order needs an after-hours reason; with one it is accepted and flagged.
    const punchOut = await request("POST", "/api/sales/attendance", sales, { action: "punch-out" });
    assert.strictEqual(punchOut.status, 200, "Sales can punch out: " + punchOut.body);
    const afterOut = await request("POST", "/api/sales/order", sales, {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 1 }], k: "workflow-after-punch-out"
    });
    assert.strictEqual(afterOut.status, 403, "after punch-out an order needs a reason");
    assert.strictEqual(JSON.parse(afterOut.body).code, "after_hours_reason");
    const shortReason = await request("POST", "/api/sales/order", sales, {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 1 }], k: "workflow-after-punch-out", afterHours: "x"
    });
    assert.strictEqual(shortReason.status, 403, "a too-short reason is refused");
    const draftAfterOut = await request("POST", "/api/sales/order", sales, {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 1 }], k: "workflow-after-draft", draft: true
    });
    assert.strictEqual(draftAfterOut.status, 200, "drafts never need a reason");
    const ahOrder = await request("POST", "/api/sales/order", sales, {
      code: "SHOP-01", items: [{ id: "PROD-01", qty: 1 }], k: "workflow-after-punch-out", afterHours: "Phone order from customer"
    });
    assert.strictEqual(ahOrder.status, 200, "after-hours order with a reason is accepted: " + ahOrder.body);
    const ahRec = JSON.parse(ahOrder.body).order;
    assert.strictEqual(ahRec.afterHours.reason, "Phone order from customer", "reason is stored on the order");
    assert(ahRec.notes.indexOf("[After hours: Phone order from customer]") === 0, "reason is visible in the order notes");

    // Confirm one order exists and its stage history and delivery result are complete.
    const state = await request("GET", "/api/state", admin);
    assert.strictEqual(state.status, 200, "Admin can read CRM state");
    const stateJson = JSON.parse(state.body);
    const storedOrders = JSON.parse(stateJson.items["gm_sales_orders_v1"].v);
    assert.strictEqual(storedOrders.filter(x => x && x.k === payload.k).length, 1, "only one order persisted for request key");
    const storedOrder = storedOrders.find(x => x && x.id === order.id);
    assert(storedOrder.stages.processing && storedOrder.stages.out && storedOrder.stages.delivered,
      "order contains all three completed stages");
    assert(storedOrder.deliveryAssignment.workerId === "WDEL1", "order stores the selected delivery assignment");
    assert(storedOrder.deliveryResult.items[0].deliveredQty === 1 && storedOrder.deliveryResult.items[0].returnedQty === 1,
      "order stores delivered and returned quantities");

    console.log("PASS Phase 4H delivery integration: order assignment, worker-only visibility, assigned-worker authorization, quantity validation, return-reason validation, delivery result persistence, idempotent retry, and Admin-visible completion (32 assertions).");
  } finally {
    try { if (child) child.kill("SIGTERM"); } catch (_) {}
    await wait(500);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});