#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const tests = [
  "static-path-regression.js",
  "attachment-recovery-regression.js",
  "backup-integrity-regression.js",
  "production-readiness-regression.js",
  "multi-device-conflict-regression.js",
  "idempotency-regression.js",
  "sync-outbox-regression.js",
  "security-regression.js",
  "input-validation-regression.js",
  "xss-render-regression.js",
  "rbac-regression.js",
  "api-auth-regression.js",
  "sales-attendance-regression.js",
  "sales-order-workflow-regression.js",
  "returns-reconciliation-regression.js",
  "bill-net-amount-regression.js",
  "staging-smoke-regression.js",
  "browser-e2e-regression.js",
];
let failed = 0;
for (const test of tests) {
  console.log("\n=== " + test + " ===");
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: "inherit" });
  if (result.status !== 0) failed++;
}
console.log("\nRegression suite: " + (tests.length - failed) + "/" + tests.length + " scripts passed.");
if (failed) process.exitCode = 1;