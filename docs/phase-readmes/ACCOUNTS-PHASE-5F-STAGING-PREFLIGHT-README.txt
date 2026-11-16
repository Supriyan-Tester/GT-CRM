GM-CRM ACCOUNTS PHASE 5F — STAGING PREFLIGHT
=============================================

Purpose
-------
A read-only operational verification pack for Accounts Phases 1–5E.
It does not apply migrations, create business transactions, or change data.

Included
--------
- supabase-accounts-phase-5f-staging-preflight.sql
- tools/accounts-staging-preflight-regression.js
- tools/run-regression-suite.js (updated to include the preflight regression)
- this README

Use
---
1. Apply Accounts Phase 1 and Phase 5A–5E migrations to a NON-PRODUCTION
   Supabase staging project in the documented order.
2. Take a staging database backup/snapshot.
3. Run the SQL file in the Supabase SQL editor using an authorised operator.
4. Review all result sets:
   - all required tables and RPCs must exist;
   - RPCs must not be executable by anon/authenticated and must be executable
     by service_role;
   - unbalanced journals, duplicate cash references, denomination mismatches
     and duplicate active closings must return zero rows;
   - pending workflow counts must be reviewed.
5. Investigate every REVIEW/MISSING row before proceeding.
6. Run node tools/run-regression-suite.js locally.
7. Run the existing staging smoke test with a staging-only base URL and test
   accounts. That smoke test is non-mutating; perform business workflow tests
   separately using disposable staging records.

Limitations
-----------
- SQL diagnostics are read-only.
- Current account balance output is a current ledger snapshot, not a historical
  closing calculation.
- This pack does not itself test PostgreSQL concurrency.
- A passing static regression does not prove live Supabase correctness.
- No credentials are included. Never place service-role keys in source, ZIPs,
  or chat. Do not run this as a substitute for a controlled production audit.
