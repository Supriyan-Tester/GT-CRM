#!/usr/bin/env node
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const tests = [
  "health-routes-regression.js",
  "static-path-regression.js",
  "attachment-recovery-regression.js",
  "backup-integrity-regression.js",
  "activity-diff-regression.js",
  "production-readiness-regression.js",
  "multi-device-conflict-regression.js",
  "employee-save-409-regression.js",
  "idempotency-regression.js",
  "sync-outbox-regression.js",
  "security-regression.js",
  "input-validation-regression.js",
  "xss-render-regression.js",
  "rbac-regression.js",
  "api-auth-regression.js",
  "public-exposure-regression.js",
  "sales-attendance-regression.js",
  "sales-order-workflow-regression.js",
  "returns-reconciliation-regression.js",
  "accounts-domain-regression.js",
  "accounts-routes-regression.js",
  "accounts-ui-regression.js",
  "accounts-evidence-regression.js",
  "accounts-evidence-api-regression.js",
  "accounts-cash-handover-regression.js",
  "accounts-office-cash-regression.js",
  "accounts-upi-settlement-regression.js",
  "accounts-daily-closing-regression.js",
  "accounts-cash-closing-regression.js",
  "order-leave-guard-regression.js",
  "no-code-fence-regression.js",
  "login-spinner-regression.js",
  "sales-menu-access-regression.js",
  "sales-collections-ui-regression.js",
  "signin-spinner-regression.js",
  "accounts-integrity-hardening-regression.js",
  "accounts-staging-preflight-regression.js",
  "accounts-dashboard-regression.js",
  "accounts-collections-regression.js",
  "accounts-statement-regression.js",
  "accounts-reports-regression.js",
  "accounts-correction-regression.js",
  "accounts-split-regression.js",
  "bill-net-amount-regression.js",
  "staging-smoke-regression.js",
  "browser-e2e-regression.js",
];
let failed = 0;
const failedNames = [];
for (const test of tests) {
  console.log("\n=== " + test + " ===");
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: "inherit" });
  if (result.status !== 0) {
    failed++;
    failedNames.push(test + " (exit " + (result.status === null ? "signal " + result.signal : result.status) + (result.error ? ", " + result.error.message : "") + ")");
  }
}
console.log("\nRegression suite: " + (tests.length - failed) + "/" + tests.length + " scripts passed.");
// Listed at the very end so the last lines of a build log say exactly which scripts failed.
if (failedNames.length) console.log("FAILED SCRIPTS:\n  - " + failedNames.join("\n  - "));
if (failed) process.exitCode = 1;