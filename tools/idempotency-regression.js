#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const orderPage = fs.readFileSync(path.join(__dirname, "..", "sales", "order.html"), "utf8");
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: !!condition });
}
const orderStart = server.indexOf('if (p === "/api/sales/order")');
const orderEnd = server.indexOf('return send(res, 404, { error: "Not found" });', orderStart);
const orderRoute = server.slice(orderStart, orderEnd);
const stageStart = server.indexOf('if (p === "/api/salesadmin/stage"');
const stageEnd = server.indexOf('// ---- Super Admin permanently deletes a Sales order', stageStart);
const stageRoute = server.slice(stageStart, stageEnd);

check("order endpoint looks up an existing request key before creating a new order",
  /if \(b\.k && !old\)[\s\S]*?o\.k === String\(b\.k\)[\s\S]*?return send\(res, 200, \{ ok: true, order: dup \}\)/.test(orderRoute));
check("order request key is sent by the sales order form",
  /k:\s*key/.test(orderPage));
check("order request key is retained when a placement attempt fails",
  /\.catch\(function \(e\)/.test(orderPage) &&
  /key\s*=\s*"k"/.test(orderPage));
check("repeating an already-applied delivery stage returns success",
  /if \(o\.stages\[st\]\)\s*return send\(res,\s*200,\s*\{\s*ok:\s*true,\s*alreadyApplied:\s*true\s*\}\)/.test(stageRoute));
check("duplicate stage retry exits before revision write and activity logging",
  (() => {
    const i = stageRoute.indexOf("if (o.stages[st])");
    const j = stageRoute.indexOf("setItem(", i);
    const k = stageRoute.indexOf("logEvents(", i);
    return i >= 0 && j > i && k > i &&
      stageRoute.slice(i, j).includes("return send(res, 200");
  })());
check("stage order validation still rejects out-of-sequence transitions",
  /if \(next !== st\)[\s\S]*?Next step for this order/.test(stageRoute));
checks.forEach(x => console.log((x.ok ? "PASS " : "FAIL ") + x.name));
const failed = checks.filter(x => !x.ok);
console.log(`${checks.length - failed.length}/${checks.length} duplicate-prevention checks passed.`);
if (failed.length) process.exit(1);
