# GM-CRM Phase 4E – Browser End-to-End Test Harness

## Scope

This phase adds Playwright browser tests for the staging deployment. It does not claim that a remote staging deployment was exercised. The successful-login test is skipped unless a dedicated synthetic staging account is supplied.

## Safety rules

- Use a separate Render staging service and a separate Supabase project.
- Use synthetic test accounts and synthetic records only.
- Never point this suite at `gm-crm.onrender.com` or another production origin.
- Do not place credentials in source files, `.env` committed to Git, screenshots, or test reports.
- The suite does not create, update, or delete CRM business records. A successful login creates a normal staging session.

## Install browser test dependency

```powershell
npm install
npx playwright install chromium
```

## Configure staging target

```powershell
$env:GMCRM_STAGING_URL = "https://YOUR-STAGING-SERVICE.onrender.com"
$env:GMCRM_E2E_PHONE = "SYNTHETIC_TEST_PHONE"
$env:GMCRM_E2E_PASSWORD = "SYNTHETIC_TEST_PASSWORD"
```

`GMCRM_STAGING_URL` must be the staging origin only. The browser config uses this value as its base URL.

## Run tests

```powershell
npm run test:e2e
```

The tests cover desktop/mobile login rendering, horizontal overflow, theme switching, client-side phone validation, browser JavaScript errors, and an optional successful login with the dedicated test account.

Run the API staging smoke suite separately:

```powershell
npm run test:staging
```

## Evidence and remaining work

Playwright writes its report and failure artifacts under its standard `test-results` and `playwright-report` directories. Review failed traces/screenshots before accepting a release. This harness does not yet automate every role's business workflow, map/location permissions, offline queue replay, multi-device conflict resolution, or database restore. Those require provisioned synthetic role accounts and controlled staging fixtures.

A real browser run is only complete when `npm install`, browser installation, `npm run test:e2e`, and `npm run test:staging` have been run against the actual staging service and their output reviewed. No Render or Supabase credentials were available during preparation of this package.
