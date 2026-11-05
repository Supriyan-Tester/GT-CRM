# Phase 4D — Staging Deployment & End-to-End Smoke Test

## Scope and status

This phase prepares a separate staging deployment and a non-destructive remote smoke test. It does **not** deploy anything automatically, connect to production, migrate production data, or restore into a live database. A real staging deployment requires the project owner's Render and Supabase access.

## 1. Create an isolated staging environment

1. Create a dedicated Supabase project for staging. Do not reuse the production project URL, service-role key, storage bucket, customer records, or production backup.
2. Run `supabase-setup.sql` in the staging project's SQL editor.
3. In Render, create a **separate** web service/Blueprint using `render.staging.yaml` and a dedicated staging branch. Name it `gm-crm-staging`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to the staging project's values only. Set `SUPABASE_BUCKET` only if a separate staging bucket has been created. Never copy production secrets into a staging service.
5. Use synthetic accounts and synthetic CRM records only. Create a Super Admin test account and a separate non-Super-Admin account. Set passwords directly in the secret environment or create them through the app's secured admin workflow; never commit them.
6. Wait for the Render deployment to finish. Check `/api/health` and `/api/ready` manually. The Render health check intentionally remains on `/api/health` (liveness); `/api/ready` is the dependency/readiness probe.

## 2. Local regression checks

Node.js 20 is recommended.

```powershell
npm test
```

This runs the existing security, backup, recovery, sync, idempotency, RBAC and local HTTP authorization tests, plus the staging smoke-script regression. It uses synthetic fixtures and a disposable local server; it does not use Supabase credentials.

## 3. Non-destructive remote staging smoke test

In PowerShell, set the staging origin and test account credentials in the current shell. These values are not printed by the script.

```powershell
$env:GMCRM_STAGING_URL = "https://YOUR-STAGING-SERVICE.onrender.com"
$env:GMCRM_STAGING_SUPERADMIN_PHONE = "TEST_SUPER_ADMIN_PHONE"
$env:GMCRM_STAGING_SUPERADMIN_PASSWORD = "TEST_SUPER_ADMIN_PASSWORD"
$env:GMCRM_STAGING_NON_SUPER_PHONE = "TEST_ADMIN_OR_OTHER_ROLE_PHONE"
$env:GMCRM_STAGING_NON_SUPER_PASSWORD = "TEST_ADMIN_OR_OTHER_ROLE_PASSWORD"
npm run test:staging
```

The script checks liveness, storage readiness, unauthenticated rejection, Super Admin access to user administration, denial for a non-Super-Admin account, and logout/session invalidation. The authenticated checks are skipped if the corresponding test credentials are omitted. It does not create, update, delete, import, or export business records. It does send login and logout requests, so use staging-only accounts.

## 4. Browser and multi-device acceptance checklist

Complete these manually in staging using synthetic records:

- [ ] Login and logout work on desktop and mobile browsers.
- [ ] Each role sees only its permitted navigation and pages.
- [ ] Direct API requests enforce the same role restrictions as the UI.
- [ ] A disabled account cannot log in; changing a role invalidates the old session.
- [ ] Sales cannot read or mutate restricted financial/admin data.
- [ ] Delivery and Helper accounts cannot read or write another employee's private record.
- [ ] Two browsers editing the same protected record trigger a visible conflict; local data can be downloaded before the server version is loaded.
- [ ] Offline edits survive reload and retry when connectivity returns.
- [ ] Duplicate order submission and repeated delivery-stage submission do not create duplicate effects.
- [ ] A database backup verifies; a corrupted backup is rejected; restore is rehearsed only in a disposable staging project.
- [ ] Attachment archive verification and restore target a separate empty test directory/bucket.
- [ ] No production customer, employee, financial or authentication data appears in staging.

## 5. Go/no-go criteria

Do not deploy this candidate to production until all checklist items are completed, the staging backup restore has been demonstrated, and a fresh verified production backup exists. Record the deployment commit, staging URL, test date, test operator, and any failed cases. A passing local test suite is not evidence that the live Render/Supabase deployment has passed.

## 6. Rollback

Keep the previous production deployment and its verified backup available. If staging passes but production deployment later fails, roll back the Render deployment to the previous known-good release. Do not run database restore as a first-line rollback unless the failure is confirmed to involve persisted data and the restore has been rehearsed on a disposable copy.
