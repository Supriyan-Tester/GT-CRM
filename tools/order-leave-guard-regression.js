#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const page = fs.readFileSync(path.join(__dirname, "..", "sales", "order.html"), "utf8");
const checks = [
  [/S\.confirm = function/.test(fs.readFileSync(path.join(__dirname, "..", "sales", "sales.js"), "utf8")), "sales.js defines the shared Sales.confirm popup the pages call"],
  [/function askLeave\(/.test(page) && /Leave this order\?/.test(page), "custom leave popup exists"],
  [/Back to order/.test(page) && /yes: "Leave"/.test(page), "popup offers Back to order and Leave"],
  [!/\bconfirm\(|\bprompt\(|\balert\(/.test(page.replace(/Sales\.confirm\(/g, "")), "order page uses no browser confirm/prompt/alert boxes"],
  [/Remove all items\?/.test(page) && /Keep items/.test(page), "Remove all items uses the in-app popup"],
  [/function unsaved\(\)[\s\S]{0,120}!placed[\s\S]{0,60}Object\.keys\(cart\)\.length > 0/.test(page), "popup only applies to an unplaced order with items"],
  [/addEventListener\(\s*"click"[\s\S]{0,500}askLeave/.test(page), "in-app links ask before leaving"],
  [/addEventListener\("popstate"/.test(page) && /history\.pushState/.test(page), "browser/phone Back button is caught"],
  [/addEventListener\("beforeunload"[\s\S]{0,120}unsaved\(\)/.test(page), "tab close/refresh keeps the browser fallback only when unsaved"],
];
checks.forEach(([ok, n]) => { assert.ok(ok, "FAILED: " + n); console.log("PASS " + n); });
console.log("Order leave-guard regression: " + checks.length + " checks passed.");