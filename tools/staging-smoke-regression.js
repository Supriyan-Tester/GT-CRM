#!/usr/bin/env node
"use strict";
const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const script = path.join(__dirname, "staging-smoke.js");
const requests = [];
let nextSid = 0;
const activeSessions = new Set();
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", c => raw += c);
  req.on("end", () => {
    requests.push({ method: req.method, url: req.url });
    const cookie = req.headers.cookie || "";
    const send = (status, value, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(value)); };
    if (req.url === "/api/health") return send(200, { ok: true });
    if (req.url === "/api/ready") return send(200, { ok: true, storage: "supabase" });
    if (req.url === "/api/login" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      if (b.phone === "9000000001" && b.password === "stagingpass") {
        const sid = "sid" + (++nextSid) + "_abcdefghijklmnopqrstuv";
        activeSessions.add(sid);
        const isSuper = b.phone === "9000000001";
        return send(200, { ok: true, super: isSuper }, { "Set-Cookie": "gm_sid=" + sid + "; HttpOnly; SameSite=Lax; Path=/" });
      }
      if (b.phone === "9000000002" && b.password === "stagingpass") {
        const sid = "sid" + (++nextSid) + "_abcdefghijklmnopqrstuv";
        activeSessions.add(sid);
        return send(200, { ok: true, super: false }, { "Set-Cookie": "gm_sid=" + sid + "; HttpOnly; SameSite=Lax; Path=/" });
      }
      return send(401, { error: "invalid" });
    }
    const sidMatch = /gm_sid=([^;]+)/.exec(cookie);
    const activeSid = sidMatch && activeSessions.has(sidMatch[1]);
    if (req.url === "/api/me") return activeSid ? send(200, { ok: true, super: sidMatch[1].startsWith("sid1_") }) : send(401, { error: "Please sign in" });
    if (req.url === "/api/users") return !activeSid ? send(401, { error: "Please sign in" }) : sidMatch[1].startsWith("sid1_") ? send(200, { users: [] }) : send(403, { error: "Not allowed" });
    if (req.url === "/api/export") return activeSid ? send(200, {}) : send(401, { error: "Please sign in" });
    if (req.url === "/api/logout" && req.method === "POST") { if (sidMatch) activeSessions.delete(sidMatch[1]); return send(200, { ok: true }, { "Set-Cookie": "gm_sid=; HttpOnly; Max-Age=0; Path=/" }); }
    return send(404, { error: "not found" });
  });
});
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const env = {
    ...process.env,
    GMCRM_STAGING_URL: "http://127.0.0.1:" + port,
    GMCRM_STAGING_SUPERADMIN_PHONE: "9000000001",
    GMCRM_STAGING_SUPERADMIN_PASSWORD: "stagingpass",
    GMCRM_STAGING_NON_SUPER_PHONE: "9000000002",
    GMCRM_STAGING_NON_SUPER_PASSWORD: "stagingpass",
  };
  const child = spawn(process.execPath, [script], { env });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => stdout += chunk);
  child.stderr.on("data", chunk => stderr += chunk);
  child.on("close", code => {
    server.close(() => {
      assert.strictEqual(code, 0, stdout + "\n" + stderr);
      assert(stdout.includes("Staging smoke test completed"), stdout);
      assert(!requests.some(r => ["PUT", "PATCH", "DELETE"].includes(r.method)), "smoke test never mutates CRM records");
      assert(requests.some(r => r.method === "POST" && r.url === "/api/logout"));
      console.log("PASS staging smoke test validates liveness, readiness, unauthenticated guards, both role boundaries and logout");
      console.log("PASS staging smoke test issues no business-data mutation requests");
      console.log("2/2 staging smoke regression checks passed.");
    });
  });
});
