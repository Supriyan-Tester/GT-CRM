/* Regression checks for unsafe HTML attribute interpolation.
   Run with: node tools/xss-render-regression.js
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const source = fs.readFileSync(path.join(__dirname, "..", "admin", "orders.html"), "utf8");

const classMatch = source.match(/function statusClass\(value\) \{[\s\S]*?\n      \}/);
assert(classMatch, "safe statusClass helper must exist");
assert(/hasOwnProperty\.call\(LABEL, key\)/.test(classMatch[0]), "status class must use own-property allowlist");
assert(/"unknown"/.test(classMatch[0]), "unknown statuses must use inert class");
const labelMatch = source.match(/function statusLabel\(value\) \{[\s\S]*?\n      \}/);
assert(labelMatch, "safe statusLabel helper must exist");
assert(/esc\(key \|\| "Unknown"\)/.test(labelMatch[0]), "unknown status label must be escaped");

const LABEL = { placed: "Confirmed", draft: "Draft", cancelled: "Cancelled" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const statusClass = vm.runInNewContext(classMatch[0] + "\nstatusClass", { LABEL });
const statusLabel = vm.runInNewContext(labelMatch[0] + "\nstatusLabel", { LABEL, esc });

assert.strictEqual(statusClass("placed"), "placed");
assert.strictEqual(statusClass("draft"), "draft");
assert.strictEqual(statusClass("cancelled"), "cancelled");
assert.strictEqual(statusClass('placed" onmouseover="alert(1)'), "unknown");
assert.strictEqual(statusClass("__proto__"), "unknown");
assert.strictEqual(statusLabel('<img src=x onerror=alert(1)>'), "&lt;img src=x onerror=alert(1)&gt;");

assert(!/class="om-st ['"]\s*\+\s*o\.status/.test(source), "raw order status class interpolation remains");
assert.strictEqual((source.match(/statusClass\(o\.status\)/g) || []).length, 5, "all five order status badges must use safe class helper");
assert.strictEqual((source.match(/statusLabel\(o\.status\)/g) || []).length, 5, "all five order status badges must use safe label helper");

console.log("PASS order CSS class is allowlisted");
console.log("PASS hostile and prototype-like statuses use inert class");
console.log("PASS unknown status text is escaped");
console.log("PASS all five order status badges use safe helpers");
console.log("4/4 XSS rendering regression checks passed.");
