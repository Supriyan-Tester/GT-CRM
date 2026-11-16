#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(require.resolve("../server.js"), "utf8");

function objectLiteral(name, setup = "") {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`);
  const match = source.match(re);
  assert(match, `${name} declaration must exist`);
  return vm.runInNewContext(`${setup}\n(${match[1]})`);
}
const PAGE_RULES = objectLiteral("PAGE_RULES");
const KEY_RULES = objectLiteral(
  "KEY_RULES",
  'const ALL_MODULES = ["sales", "billing", "inventory", "delivery", "helper"];',
);
const ADMIN_READ = (() => {
  const start = source.indexOf("const ADMIN_READ = [");
  assert(start >= 0, "ADMIN_READ must exist");
  const end = source.indexOf("\n];", start);
  assert(end > start, "ADMIN_READ must be a closed array");
  return vm.runInNewContext(`const ALL_MODULES = ["sales", "billing", "inventory", "delivery", "helper"]; (${source.slice(start + "const ADMIN_READ = ".length, end + 2)})`);
})();
const accounts = {
  super: { role: "Super Admin", perms: [] },
  admin: { role: "Admin", perms: [] },
  sales: { role: "Sales", perms: ["sales"] },
  billing: { role: "Billing", perms: ["billing"] },
  inventory: { role: "Inventory", perms: ["inventory"] },
  delivery: { role: "Delivery", perms: ["delivery"] },
  helper: { role: "Helper", perms: ["helper"] },
};
function isFull(a) { return a.role === "Super Admin" || a.role === "Admin"; }
function hasAny(a, list) { return isFull(a) || list.some((m) => a.perms.includes(m)); }
function pageAllowed(a, file) {
  if (!a) return false;
  const rule = PAGE_RULES[file] || "full";
  if (rule === "*") return true;
  if (rule === "super") return a.role === "Super Admin";
  if (rule === "full") return isFull(a);
  return hasAny(a, rule);
}
function canAdminRead(a, key) {
  if (isFull(a)) return true;
  for (const [re, allow] of ADMIN_READ) if (re.test(key)) return hasAny(a, allow);
  return false;
}

// Public pages available to any signed-in admin-side account; privileged pages remain restricted.
for (const role of Object.keys(accounts)) {
  assert.strictEqual(pageAllowed(accounts[role], "index.html"), true, `${role} home`);
  assert.strictEqual(pageAllowed(accounts[role], "profile.html"), true, `${role} profile`);
  assert.strictEqual(pageAllowed(accounts[role], "users.html"), role === "super", `${role} users page`);
  assert.strictEqual(pageAllowed(accounts[role], "super.html"), role === "super", `${role} super page`);
  assert.strictEqual(pageAllowed(accounts[role], "workers.html"), role === "super" || role === "admin", `${role} workers page`);
  assert.strictEqual(pageAllowed(accounts[role], "unlisted-sensitive.html"), role === "super" || role === "admin", `${role} unknown page defaults closed`);
}
const pageCases = {
  "customers.html": ["super", "admin", "sales", "billing"],
  "routes.html": ["super", "admin", "sales", "delivery"],
  "attendance.html": ["super", "admin", "helper"],
  "advances.html": ["super", "admin", "billing"],
  "product-edit.html": ["super", "admin", "inventory"],
  "vehicles.html": ["super", "admin", "delivery"],
};
for (const [page, allowed] of Object.entries(pageCases))
  for (const role of Object.keys(accounts))
    assert.strictEqual(pageAllowed(accounts[role], page), allowed.includes(role), `${role} -> ${page}`);

// Verify module-scoped reads and that sensitive/server-owned records are not readable by module users.
const readCases = [
  ["gm_admin_ledger_v1", ["super", "admin", "billing", "helper"]],
  ["gm_admin_products_v1", ["super", "admin", "sales", "billing", "inventory"]],
  ["gm_admin_vehicles_v1", ["super", "admin", "delivery"]],
  ["gm_admin_access_v1", ["super", "admin"]],
  ["gm_admin_business_v1", ["super", "admin"]],
];
for (const [key, allowed] of readCases)
  for (const role of Object.keys(accounts))
    assert.strictEqual(canAdminRead(accounts[role], key), allowed.includes(role), `${role} read ${key}`);

// Explicit write matrix: test actual role-to-module grants from the server allowlist.
const writeCases = [
  ["gm_admin_v1", ["super", "admin", "sales", "billing", "delivery"]],
  ["gm_admin_products_v1", ["super", "admin", "inventory"]],
  ["gm_admin_vehicles_v1", ["super", "admin", "delivery"]],
  ["gm_admin_ledger_v1", ["super", "admin", "billing"]],
  ["gm_admin_attedit_v1", ["super", "admin", "helper"]],
  ["gm_admin_workers_v1", ["super", "admin"]],
  ["gm_admin_notifs_v1", Object.keys(accounts)],
];
for (const [key, allowed] of writeCases) {
  const rule = KEY_RULES[key];
  assert(rule, `${key} must have an explicit write rule`);
  for (const role of Object.keys(accounts)) {
    const actual = rule === "full" ? isFull(accounts[role]) : hasAny(accounts[role], rule);
    assert.strictEqual(actual, allowed.includes(role), `${role} write ${key}`);
  }
}
for (const key of ["gm_admin_access_v1", "gm_sales_orders_v1", "gm_sales_days_v1", "gm_sales_watch_v1", "gm_crm_data_v5__other", "gm_loc_other", "gm_crew_20261102_other", "unrecognized_key"])
  assert.strictEqual(Object.prototype.hasOwnProperty.call(KEY_RULES, key), false, `${key} excluded from generic write allowlist`);

// Guard presence for dedicated high-impact endpoints and page boundaries.
const guards = [
  [/if \(s\.role !== "admin" \|\| !isSuper\(acctOf\(s\)\)\)/, "Super Admin-only export/import/access guard"],
  [/if \(!isSuper\(me\)\)/, "Super Admin-only user management guard"],
  [/if \(s\.role !== "admin" \|\| !isFull\(acctOf\(s\)\)\)/, "full-admin employee deletion guard"],
  [/const g = pageGate\(req, rp\[rp\.length - 1\]\)/, "admin HTML page gate"],
  [/if \(!ss \|\| ss\.role !== "sales"\)/, "sales HTML page gate"],
  [/!canWrite\(s, key\)/, "generic KV write authorization"],
];
for (const [re, label] of guards) {
  assert(re.test(source), `${label} must remain enforced`);
}
assert(source.includes('if (s.role !== "admin" || !hasAny(acctOf(s), ["helper"]))'), "close-day requires Helper module or full admin");
assert(source.includes('if (s.role !== "admin" || !ac || !hasAny(ac, ["sales", "billing"]))'), "sales administration actions require Sales/Billing or full admin");

console.log("RBAC regression passed: role/page matrix, module-read matrix, default-deny keys, and privileged endpoint guard assertions.");
