#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const r = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const server = r("server.js"), sales = r("sales/sales.js"), users = r("admin/users.html");
const checks = [
  [/function salesMenuOf\(id\)/.test(server) && /pg:set/.test(server), "server stores a per-employee Sales menu with a saved marker"],
  [/menu:\s*s\.role === "sales"/.test(server), "/api/me tells a Sales session which pages it may show"],
  [/role === "Sales"[\s\S]{0,200}SALES_PAGES\.filter/.test(server), "Access save accepts Sales page choices and ignores unknown pages"],
  [/SALES_COLLECT_PAGES\.indexOf\(x\) > -1\s*\)\s*\?\s*\["sales"\]/.test(server), "ticking a collection page grants the collections permission, none removes it"],
  [/NAVF/.test(sales) && /BNF/.test(sales) && /window\.location\.replace\("home\.html"\)/.test(sales), "Sales menu hides switched-off pages and sends direct visits home"],
  [/data-edit/.test(users) && /editSalesAccess/.test(users) && /data-pg=/.test(users), "Users page has an Edit popup with a checkbox per Sales page"],
];
checks.forEach(([ok, n]) => { assert.ok(ok, "FAILED: " + n); console.log("PASS " + n); });
console.log("Sales menu access regression: " + checks.length + " checks passed.");
