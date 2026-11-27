#!/usr/bin/env node
"use strict";
// Public-exposure drill. Runs a disposable copy of the app with synthetic data and checks, WITHOUT logging in, that
//  1. every /api/ route found in server.js and the backend modules is refused (401/403), except a short allowlist of
//     routes that are meant to be public, and
//  2. private files (data, source code, SQL, env, git) cannot be downloaded as static files.
// A new /api route that is accidentally left open makes this test fail until it is fixed or added to PUBLIC_API on purpose.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const sourceRoot = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gmcrm-exposure-"));
const app = path.join(tmp, "app");
const port = 18000 + Math.floor(Math.random() * 10000);

// Routes that are public ON PURPOSE. Anything else must refuse a request that has no login.
// /api/client-log lets a page report a browser error even before sign-in (for example on the login page).
// It only writes one cleaned line to the server log, accepts at most 4 KB, and is limited to 20 calls a minute per address.
const PUBLIC_API = new Set(["/api/health", "/api/ready", "/api/login", "/api/logout", "/api/client-log"]);
// Responses that count as "refused". 405 (wrong method) and 404 on a method the route does not offer are fine too, see below.
const REFUSED = new Set([401, 403]);

function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ hostname: "127.0.0.1", port, path: pathname, method,
      headers: Object.assign({ "Content-Type": "application/json" }, data ? { "Content-Length": data.length } : {}) }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(path.join(sourceRoot, f), "utf8");

// Every literal "/api/..." path in the server and the backend modules. A trailing "/" (prefix match) and regex captures
// get a sample id so the request reaches the route.
function discoverRoutes() {
  const files = ["server.js"];
  (function walk(dir) {
    for (const n of fs.readdirSync(path.join(sourceRoot, dir))) {
      const rel = dir + "/" + n;
      if (fs.statSync(path.join(sourceRoot, rel)).isDirectory()) walk(rel); else if (n.endsWith(".js")) files.push(rel);
    }
  })("backend");
  const found = new Set();
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/["'`](\/api\/[A-Za-z0-9_\-\/.]*)["'`]/g)) found.add(m[1]);
    // routes written as regexes, e.g. /^\/api\/accounts\/customers\/([^/]+)\/statement$/
    for (const m of src.matchAll(/\/\^?(\\\/api\\\/[^/\n]*?)\$?\/i?\.exec/g)) {
      found.add(m[1].replace(/\\\//g, "/").replace(/\(\[[^)]*\][+*]?\)/g, "00000000-0000-4000-8000-000000000000").replace(/\(\[?[^)]*\)/g, "x"));
    }
  }
  return Array.from(found).map((p) => (p.endsWith("/") ? p + "x" : p)).filter((p) => p.length > 5).sort();
}

let child = null;
(async () => {
  try {
    fs.mkdirSync(app, { recursive: true });
    for (const f of ["server.js", "storage.js", "activity.js", "backup-integrity.js"]) fs.copyFileSync(path.join(sourceRoot, f), path.join(app, f));
    for (const d of ["backend", "shared", "admin", "sales", "worker", "assets", "sql", "tools", "docs"]) {
      if (fs.existsSync(path.join(sourceRoot, d))) fs.cpSync(path.join(sourceRoot, d), path.join(app, d), { recursive: true });
    }
    for (const f of ["login.html", "index.html", "package.json", "README.md", "favicon.ico"]) {
      if (fs.existsSync(path.join(sourceRoot, f))) fs.copyFileSync(path.join(sourceRoot, f), path.join(app, f));
    }
    // Synthetic secrets: if any of these can be downloaded, the test fails.
    fs.writeFileSync(path.join(app, ".env"), "SUPABASE_SERVICE_KEY=synthetic-secret-do-not-serve\n");
    fs.mkdirSync(path.join(app, ".git"), { recursive: true });
    fs.writeFileSync(path.join(app, ".git", "config"), "[core]\n\tsynthetic = true\n");
    fs.mkdirSync(path.join(app, "data"), { recursive: true });
    fs.writeFileSync(path.join(app, "data", "db.json"), JSON.stringify({ rev: 1, items: {}, activity: {}, marker: "synthetic-private-data" }));
    fs.writeFileSync(path.join(app, "data", "auth.json"), JSON.stringify({ admins: {}, workers: {}, marker: "synthetic-private-hashes" }));
    fs.writeFileSync(path.join(app, "data", "sessions.json"), JSON.stringify({ marker: "synthetic-sessions" }));
    const env = { ...process.env, PORT: String(port), NODE_ENV: "test" };
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_BUCKET", "RENDER", "TRUST_PROXY"]) delete env[k];
    for (const k of Object.keys(env)) if (/^B2_/.test(k)) delete env[k]; // never let a test reach the real Backblaze bucket
    child = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; child.stdout.on("data", (d) => logs += d); child.stderr.on("data", (d) => logs += d);
    for (let i = 0; ; i++) {
      if (child.exitCode !== null) throw new Error("test server exited: " + logs);
      if (i > 80) throw new Error("test server did not start: " + logs);
      try { if ((await req("GET", "/api/health")).status === 200) break; } catch (_) {}
      await wait(100);
    }

    // 1. Every API route refuses a request with no login.
    const routes = discoverRoutes();
    assert(routes.length >= 40, "route discovery found the API (" + routes.length + " paths)");
    const open = [];
    for (const p of routes) {
      if (PUBLIC_API.has(p)) continue;
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        const r = await req(method, p, method === "GET" || method === "DELETE" ? null : {});
        if (REFUSED.has(r.status)) continue;
        // 404/405 for a method the route does not offer is fine, but it must never be a success, a redirect to data, or a crash.
        if ((r.status === 404 || r.status === 405 || r.status === 400) && !/synthetic-/.test(r.body)) continue;
        open.push(method + " " + p + " -> " + r.status);
      }
    }
    assert.deepStrictEqual(open, [], "These API routes answered a request that had no login:\n  " + open.join("\n  "));
    console.log("PASS " + routes.length + " API paths x 4 methods are refused without a login (public on purpose: " + Array.from(PUBLIC_API).join(", ") + ")");

    // The public routes must not leak data.
    const health = await req("GET", "/api/health");
    assert.strictEqual(health.status, 200);
    assert(!/synthetic-|supabase_service|password|hash/i.test(health.body), "health response carries no secrets");
    const login = await req("POST", "/api/login", { phone: "0000000000", password: "wrong-password" });
    assert(login.status >= 400 && login.status < 500, "wrong login is refused");
    assert(!/synthetic-/.test(login.body), "failed login leaks nothing");
    console.log("PASS public routes leak nothing");

    // 2. Private files cannot be downloaded.
    const privateFiles = [
      "/.env", "/.git/config", "/.git/HEAD", "/data/db.json", "/data/auth.json", "/data/sessions.json", "/data/",
      "/server.js", "/storage.js", "/activity.js", "/backup-integrity.js", "/package.json", "/package-lock.json",
      "/backend/modules/accounts/accounts.routes.js", "/sql/supabase-setup.sql", "/sql/supabase-accounts-phase-1.sql",
      "/tools/run-regression-suite.js", "/docs/", "/README.md", "/render.yaml", "/.github/workflows/ci.yml",
      "/node_modules/", "/MAP.md", "/PROJECT-NOTES.md",
      "/..%2fserver.js", "/%2e%2e/server.js", "/shared/..%2f..%2fdata/db.json", "/shared/../data/db.json", "/%2e%2e%2fdata%2fauth.json",
    ];
    const leaked = [];
    for (const f of privateFiles) {
      let r;
      try { r = await req("GET", f); } catch (e) { continue; }
      const looksPrivate = /synthetic-|SUPABASE_SERVICE_KEY|module\.exports|require\(["']fs|createServer|create table|CREATE TABLE|\[core\]/.test(r.body);
      if (r.status === 200 || looksPrivate) leaked.push(f + " -> " + r.status);
    }
    assert.deepStrictEqual(leaked, [], "These private files can be downloaded:\n  " + leaked.join("\n  "));
    console.log("PASS " + privateFiles.length + " private file paths (data, secrets, source code, SQL, git, path-traversal tricks) are not downloadable");

    // 3. Pages behind a login do not hand their data to a visitor with no session.
    const state = await req("GET", "/api/state");
    assert(REFUSED.has(state.status) && !/synthetic-/.test(state.body), "/api/state needs a login");
    console.log("Public exposure regression: all checks passed in an isolated local server.");
  } finally {
    try { child.kill("SIGTERM"); } catch (_) {}
    await wait(700);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
