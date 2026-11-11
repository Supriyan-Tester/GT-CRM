#!/usr/bin/env node
"use strict";
// Exercises Sales attendance endpoints against an isolated local server and synthetic employee accounts only.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const http = require("http");
const sourceRoot = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gmcrm-sales-attendance-"));
const app = path.join(tmp, "app");
const port = 19000 + Math.floor(Math.random() * 9000);
const password = "AttendancePass123";
const salt = crypto.randomBytes(16);
const hash = "s1$" + salt.toString("hex") + "$" + crypto.scryptSync(password, salt, 32).toString("hex");
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }
function req(method, pathname, cookie, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers: Object.assign({ "Content-Type": "application/json" }, cookie ? { Cookie: cookie } : {}, data ? { "Content-Length": data.length } : {}) }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let child;
// UI wiring checks: Sales menu, protected page shell, responsive screen and server-backed controls.
const navSource = fs.readFileSync(path.join(sourceRoot, "sales", "sales.js"), "utf8");
const pageSource = fs.readFileSync(path.join(sourceRoot, "sales", "attendance.html"), "utf8");
const uiSource = fs.readFileSync(path.join(sourceRoot, "sales", "attendance.js"), "utf8");
const cssSource = fs.readFileSync(path.join(sourceRoot, "sales", "sales.css"), "utf8");
const { findPunchOutDate, getPendingPunchOut } = require(path.join(sourceRoot, "backend", "modules", "attendance", "attendance.service.js"));
const { handleSalesAttendanceRoute } = require(path.join(sourceRoot, "backend", "modules", "attendance", "attendance.routes.js"));
// Deterministic IST midnight-boundary tests for the production punch-out date resolver.
const beforeMidnight = Date.parse("2026-11-04T14:30:00.000Z"); // 20:00 IST, Nov 4
const afterMidnight = Date.parse("2026-11-04T20:30:00.000Z"); // 02:00 IST, Nov 5
assert.strictEqual(findPunchOutDate({ "2026-11-04": { inAt: beforeMidnight, outAt: null } }, afterMidnight), "2026-11-04", "overnight punch-out closes the previous IST date");
assert.strictEqual(findPunchOutDate({ "2026-11-05": { inAt: afterMidnight - 3600000, outAt: null } }, afterMidnight), "2026-11-05", "today's open attendance takes precedence");
assert.strictEqual(findPunchOutDate({ "2026-11-04": { inAt: beforeMidnight, outAt: afterMidnight - 1000 } }, afterMidnight), null, "completed previous-day attendance cannot be reopened");
assert.strictEqual(findPunchOutDate({ "2026-11-03": { inAt: beforeMidnight - 86400000, outAt: null } }, afterMidnight), null, "stale attendance older than the immediately previous IST day is not closed");
assert.strictEqual(findPunchOutDate({ "2026-11-04": { inAt: afterMidnight - 25 * 3600000, outAt: null } }, afterMidnight), null, "stale open session older than 24 hours is not closed");
const overnightRecord = { inAt: beforeMidnight, outAt: null, inTime: "20:00", outTime: "-", hours: "-", status: "present" };
assert.deepStrictEqual(getPendingPunchOut({ "2026-11-04": overnightRecord }, afterMidnight), { date: "2026-11-04", entry: overnightRecord }, "GET contract can expose an eligible overnight session to the Sales UI");
assert.strictEqual(getPendingPunchOut({ "2026-11-05": { inAt: afterMidnight - 3600000, outAt: null } }, afterMidnight), null, "today's open session is not reported as a previous-day pending session");
assert(navSource.includes('["attendance", "Attendance", "attendance.html", "clock"]'), "Sales menu opens Attendance");
assert(pageSource.includes('src="attendance.js"') && pageSource.includes('src="sales.js"'), "Attendance page uses authenticated Sales shell");
assert(uiSource.includes("/api/sales/attendance") && uiSource.includes('id="saPunch"'), "Attendance UI uses server attendance endpoint and punch action");
assert(uiSource.includes("data.pendingEntry") && uiSource.includes('pending ? "punch-out" : "punch-in"'), "Sales UI offers punch-out for an eligible previous-day session");
assert(uiSource.includes("OVERNIGHT SESSION") && uiSource.includes("previous-day attendance is still open"), "Sales UI clearly labels overnight attendance state");
const attendanceRouteSource = fs.readFileSync(path.join(sourceRoot, "backend", "modules", "attendance", "attendance.routes.js"), "utf8");
assert(attendanceRouteSource.includes("findPunchOutDate(mine, now)"), "Extracted attendance route uses the tested overnight punch-out resolver");
assert(attendanceRouteSource.includes("pendingEntry"), "Attendance GET response exposes an eligible pending overnight entry");
assert(attendanceRouteSource.includes("previous attendance session before punching in again"), "API prevents a new punch-in while an overnight session remains open");
assert(attendanceRouteSource.includes('actorOf(s).name + " punched in", "Punched in at "') && attendanceRouteSource.includes('actorOf(s).name + " punched out", "Punched out"'), "Admin punch notifications put the person's name in the heading and the time in the message");
assert.strictEqual(handleSalesAttendanceRoute({ p: "/api/sales/orders" }), null, "attendance module does not intercept unrelated Sales routes");
assert(cssSource.includes("@media (max-width:640px)") && cssSource.includes(".sa-row"), "Attendance UI includes mobile responsive styling");
(async () => {
  try {
    fs.mkdirSync(app, { recursive: true });
    for (const f of ["server.js", "storage.js", "activity.js", "backup-integrity.js"]) fs.copyFileSync(path.join(sourceRoot, f), path.join(app, f));
    fs.cpSync(path.join(sourceRoot, "backend"), path.join(app, "backend"), { recursive: true });
    fs.cpSync(path.join(sourceRoot, "shared"), path.join(app, "shared"), { recursive: true });
    const accounts = [{ id: "SA1", phone: "9000000001", name: "Test Super Admin", role: "Super Admin", status: "active" }];
    const workers = [
      { id: "W001", phone: "9111111111", name: "Sales One", active: true },
      { id: "W002", phone: "9222222222", name: "Sales Two", active: true },
    ];
    const items = {
      gm_admin_account_v1: accounts,
      gm_admin_workers_v1: { workers, leaves: [] },
      gm_admin_wprofile_v1: { W001: { role: "sales" }, W002: { role: "sales" } },
      gm_crm_data_v5__W001: {},
      gm_crm_data_v5__W002: {},
      gm_admin_settings_v1: { lateAfter: "08:30" },
    };
    writeJson(path.join(app, "data", "db.json"), { rev: Object.keys(items).length, items: Object.fromEntries(Object.entries(items).map(([k,v],i) => [k,{v:JSON.stringify(v),rev:i+1}])), activity: {} });
    writeJson(path.join(app, "data", "auth.json"), { admins: { SA1: { h: hash, must: false } }, workers: { W001: { h: hash }, W002: { h: hash } } });
    const env = { ...process.env, PORT: String(port), NODE_ENV: "test" };
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_BUCKET", "RENDER", "TRUST_PROXY"]) delete env[k];
    child = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
    for (let i=0;i<100;i++) { if (child.exitCode !== null) throw new Error("server exited: " + logs); try { if ((await req("GET", "/api/health")).status === 200) break; } catch {} await wait(100); }
    const login = async phone => {
      const r = await req("POST", "/api/login", null, { phone, password });
      assert.strictEqual(r.status, 200, "synthetic Sales employee login");
      const m = (r.headers["set-cookie"] || []).join(";").match(/gm_sid=[A-Za-z0-9_-]+/);
      assert(m, "session cookie issued"); return m[0];
    };
    const one = await login("9111111111"), two = await login("9222222222");
    const unauthenticated = await req("GET", "/api/sales/attendance");
    assert.strictEqual(unauthenticated.status, 401, "attendance requires an authenticated session");
    const initial = await req("GET", "/api/sales/attendance", one);
    assert.strictEqual(initial.status, 200);
    const month = JSON.parse(initial.body).month;
    const punchOutFirst = await req("POST", "/api/sales/attendance", two, { action: "punch-out" });
    assert.strictEqual(punchOutFirst.status, 409, "cannot punch out before punching in");
    const punchIn = await req("POST", "/api/sales/attendance", one, { action: "punch-in" });
    assert.strictEqual(punchIn.status, 200, "punch in accepted");
    assert.strictEqual(JSON.parse(punchIn.body).entry.status === "present" || JSON.parse(punchIn.body).entry.status === "late", true);
    const duplicateIn = await req("POST", "/api/sales/attendance", one, { action: "punch-in" });
    assert.strictEqual(duplicateIn.status, 409, "duplicate punch in rejected");
    const otherRead = JSON.parse((await req("GET", "/api/sales/attendance", two)).body);
    assert.deepStrictEqual(otherRead.days, {}, "Sales employee cannot read another employee's attendance");
    const concurrentPunchIns = await Promise.all([
      req("POST", "/api/sales/attendance", two, { action: "punch-in" }),
      req("POST", "/api/sales/attendance", two, { action: "punch-in" }),
    ]);
    assert.deepStrictEqual(
      concurrentPunchIns.map((r) => r.status).sort(),
      [200, 409],
      "simultaneous duplicate punch-ins accept exactly one request",
    );
    const concurrentPunchOuts = await Promise.all([
      req("POST", "/api/sales/attendance", two, { action: "punch-out" }),
      req("POST", "/api/sales/attendance", two, { action: "punch-out" }),
    ]);
    assert.deepStrictEqual(
      concurrentPunchOuts.map((r) => r.status).sort(),
      [200, 409],
      "simultaneous duplicate punch-outs accept exactly one request",
    );
    const punchOut = await req("POST", "/api/sales/attendance", one, { action: "punch-out" });
    assert.strictEqual(punchOut.status, 200, "punch out accepted after punch in");
    const duplicateOut = await req("POST", "/api/sales/attendance", one, { action: "punch-out" });
    assert.strictEqual(duplicateOut.status, 409, "duplicate punch out rejected");
    const history = JSON.parse((await req("GET", "/api/sales/attendance?month=" + month, one)).body);
    const today = history.today;
    assert(history.days[today] && history.days[today].outAt, "monthly history includes completed attendance");
    const adminLogin = await req("POST", "/api/login", null, { phone: "9000000001", password });
    const adminCookie = (adminLogin.headers["set-cookie"] || []).join(";").match(/gm_sid=[A-Za-z0-9_-]+/)[0];
    const state = JSON.parse((await req("GET", "/api/state", adminCookie)).body);
    const saved = JSON.parse(state.items["gm_crm_data_v5__W001"].v);
    assert(saved.attendanceLog && saved.attendanceLog[month] && saved.attendanceLog[month][Number(today.slice(8))].outAt, "Sales attendance is mirrored into employee attendance record for office dashboard");
    const ownKeyWrite = await req("PUT", "/api/kv/gm_sales_attendance_v1", one, { v: "{}" });
    assert.strictEqual(ownKeyWrite.status, 403, "Sales cannot bypass dedicated attendance API with generic KV write");
    console.log("PASS Sales attendance: navigation and responsive UI, authentication, sequential and concurrent duplicate protection, own-record isolation, monthly history, admin attendance mirror and KV protection.");
  } finally {
    try { child && child.kill("SIGTERM"); } catch {}
    await wait(700);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });