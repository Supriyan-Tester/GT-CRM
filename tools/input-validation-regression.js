/* Focused regression checks for the Phase 2C request-validation guards.
   Run with: node tools/input-validation-regression.js
   This test does not start the server or access production data.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

const checks = [
  [
    "login rejects non-string phone/password values",
    /typeof b\.phone !== "string"[\s\S]{0,180}typeof b\.password !== "string"/.test(source),
  ],
  [
    "login bounds phone input length",
    /b\.phone\.length > 32/.test(source),
  ],
  [
    "login bounds password input length without truncating it",
    /b\.password\.length > 200/.test(source) &&
      /pw = b\.password[;,]/.test(source) &&
      !/pw = b\.password\.slice\(0,\s*200\)/.test(source),
  ],
  [
    "user profile rejects non-string name, phone and email",
    /b\.name != null && typeof b\.name !== "string"[\s\S]{0,180}b\.phone != null && typeof b\.phone !== "string"[\s\S]{0,180}b\.email != null && typeof b\.email !== "string"/.test(source),
  ],
  [
    "user display names remove control characters and normalize whitespace",
    /\.replace\(\/\[\\u0000-\\u001F\\u007F\]\/g, " "\)[\s\S]{0,100}\.replace\(\/\\s\+\/g, " "\)/.test(source),
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) failed++;
}
console.log(`${checks.length - failed}/${checks.length} input-validation checks passed.`);
if (failed) process.exitCode = 1;
