#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const spec = fs.readFileSync(path.join(root, 'tests/e2e/login.spec.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');
const pkg = require(path.join(root, 'package.json'));
const checks = [
  ['desktop/mobile browser coverage', /1365/.test(spec) && /390/.test(spec)],
  ['horizontal overflow assertion', /scrollWidth > window\.innerWidth/.test(spec)],
  ['theme toggle coverage', /Dark theme/.test(spec) && /Light theme/.test(spec)],
  ['client-side validation coverage', /valid 10-digit mobile number/.test(spec)],
  ['credential-gated staging login', /GMCRM_E2E_PHONE/.test(spec) && /GMCRM_E2E_PASSWORD/.test(spec)],
  ['staging-only base URL configuration', /GMCRM_STAGING_URL/.test(config)],
  ['Playwright test dependency documented', Boolean(pkg.devDependencies && pkg.devDependencies['@playwright/test'])],
  ['E2E npm script configured', Boolean(pkg.scripts && pkg.scripts['test:e2e'])],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failed++;
}
console.log(`\nBrowser E2E harness regression: ${checks.length - failed}/${checks.length}`);
if (failed) process.exitCode = 1;
