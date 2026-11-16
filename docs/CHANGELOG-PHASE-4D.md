# Changelog — Phase 4D

- Added a separate `render.staging.yaml` blueprint with an independent service identity and independently configured Supabase secrets.
- Added `tools/staging-smoke.js`, a read-only remote staging smoke test with optional Super Admin and non-Super-Admin test accounts.
- Added `tools/staging-smoke-regression.js` to exercise the remote smoke runner against a disposable mock HTTP server.
- Added `tools/run-regression-suite.js` and npm scripts `test` / `test:staging`.
- Added GitHub Actions CI to run the regression suite on pushes and pull requests.
- Added `STAGING-DEPLOYMENT-PHASE-4D.md` with isolation, staging, manual acceptance, go/no-go and rollback instructions.
- No production service, production Supabase project, customer data, or live deployment was accessed or modified.
