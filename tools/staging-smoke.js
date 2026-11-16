#!/usr/bin/env node
"use strict";

// Non-destructive staging smoke test. It only reads readiness/auth state and logs out.
// It never creates, edits, deletes, imports or exports CRM records.
const base = process.env.GMCRM_STAGING_URL;
const superPhone = process.env.GMCRM_STAGING_SUPERADMIN_PHONE;
const superPassword = process.env.GMCRM_STAGING_SUPERADMIN_PASSWORD;
const userPhone = process.env.GMCRM_STAGING_NON_SUPER_PHONE;
const userPassword = process.env.GMCRM_STAGING_NON_SUPER_PASSWORD;

function fail(message) {
  console.error("FAIL " + message);
  process.exitCode = 1;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log("PASS " + message);
}
function pair(a, b, label) {
  if (!!a !== !!b) throw new Error(label + " phone and password must be supplied together");
}
async function request(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  const raw = await response.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  return { status: response.status, headers: response.headers, json, raw };
}
function cookieOf(response) {
  const header = response.headers.get("set-cookie") || "";
  const match = /(?:^|[,; ]+)gm_sid=([A-Za-z0-9_-]{20,80})/.exec(header);
  return match ? "gm_sid=" + match[1] : "";
}
async function login(phone, password, label) {
  const response = await request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  assert(response.status === 200 && response.json && response.json.ok === true, label + " login succeeds");
  const cookie = cookieOf(response);
  assert(!!cookie, label + " receives an HttpOnly session cookie");
  return { cookie, payload: response.json };
}

(async () => {
  try {
    if (!base) throw new Error("Set GMCRM_STAGING_URL to the staging base URL");
    const parsed = new URL(base);
    if (!/^https:$/.test(parsed.protocol) && !["localhost", "127.0.0.1"].includes(parsed.hostname))
      throw new Error("Staging URL must use HTTPS (HTTP is allowed only for localhost tests)");
    if (parsed.pathname !== "/" || parsed.search || parsed.hash)
      throw new Error("GMCRM_STAGING_URL must be the origin only, without a path/query/hash");
    pair(superPhone, superPassword, "Super Admin staging account");
    pair(userPhone, userPassword, "Non-Super-Admin staging account");

    let response = await request("/api/health");
    assert(response.status === 200 && response.json && response.json.ok === true, "application liveness endpoint returns 200");
    response = await request("/api/ready");
    assert(response.status === 200 && response.json && response.json.ok === true, "storage readiness endpoint returns 200");

    for (const endpoint of ["/api/me", "/api/users", "/api/export"]) {
      response = await request(endpoint);
      assert(response.status === 401, "unauthenticated request is rejected: " + endpoint);
    }

    if (superPhone) {
      const session = await login(superPhone, superPassword, "Super Admin");
      assert(session.payload.super === true, "staging account has Super Admin privilege");
      response = await request("/api/me", { headers: { Cookie: session.cookie } });
      assert(response.status === 200 && response.json && response.json.super === true, "authenticated session identity is verified");
      response = await request("/api/users", { headers: { Cookie: session.cookie } });
      assert(response.status === 200, "Super Admin can access user administration");
      response = await request("/api/logout", { method: "POST", headers: { Cookie: session.cookie } });
      assert(response.status === 200, "Super Admin staging session logs out");
      response = await request("/api/me", { headers: { Cookie: session.cookie } });
      assert(response.status === 401, "logged-out session is invalidated");
    } else {
      console.log("SKIP authenticated Super Admin checks (staging credentials not supplied)");
    }

    if (userPhone) {
      const session = await login(userPhone, userPassword, "Non-Super-Admin");
      assert(session.payload.super !== true, "second test account is not Super Admin");
      response = await request("/api/users", { headers: { Cookie: session.cookie } });
      assert(response.status === 403, "non-Super-Admin cannot access user administration");
      response = await request("/api/logout", { method: "POST", headers: { Cookie: session.cookie } });
      assert(response.status === 200, "non-Super-Admin staging session logs out");
    } else {
      console.log("SKIP non-Super-Admin authorization check (optional staging credentials not supplied)");
    }

    console.log("Staging smoke test completed. No CRM business records were changed.");
  } catch (error) {
    fail(error && error.message ? error.message : String(error));
  }
})();
