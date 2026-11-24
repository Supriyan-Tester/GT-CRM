#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const page = fs.readFileSync(path.join(__dirname, "..", "sales", "collect-sheet.html"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "shared", "collect-popup.js"), "utf8");
const checks = [
  [/\/api\/accounts\/collections\/split/.test(page) && /splitPayments\(\)/.test(page), "split payment route is used"],
  [/\/api\/accounts\/evidence/.test(page) && /cpGalleryInput/.test(page) && /cpCameraInput/.test(page), "bill photo upload (camera and gallery) is kept"],
  [/requestKey/.test(page) && /availableToCollect/.test(page), "request key and collectable amount are kept"],
  [/get\("c"\)/.test(page) && /cs-hero/.test(page), "shop code is read from ?c= and the hero card is shown"],
];
checks.forEach(([ok, n]) => { assert.ok(ok, "FAILED: " + n); console.log("PASS " + n); });
console.log("Sales collections UI regression: " + checks.length + " checks passed.");