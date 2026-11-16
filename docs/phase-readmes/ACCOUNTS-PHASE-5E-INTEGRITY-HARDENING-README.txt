GM-CRM ACCOUNTS PHASE 5E — FINANCIAL INTEGRITY HARDENING
=========================================================

Purpose
-------
This additive migration hardens the combined Accounts Phase 5A–5D workflows.
It addresses three integration findings:

1. Employee custody lock mismatch:
   - Phase 5A handover confirmation previously locked hashtext(employee_id).
   - Phase 5B office deposit confirmation locked
     hashtext('gm_accounts_employee_cash:' || employee_id).
   - Phase 5E replaces the Phase 5A confirmation RPC to use the exact same
     canonical lock key as Phase 5B. Concurrent cash debits for the same
     employee are therefore serialized by PostgreSQL transaction locks.

2. Office deposit denomination validation:
   - Requires exactly six denomination entries.
   - Requires the exact set 500, 200, 100, 50, 20 and 10.
   - Rejects duplicate denomination rows and invalid/negative piece counts.
   - Requires the denomination sum to equal the declared amount.
   - The existing primary key (movement_id, denomination) remains an
     independent database-level duplicate guard.

3. Date-aware daily closing:
   - Expected employee custody, office cash, UPI clearing and bank balances
     include journal entries posted before midnight at the end of the selected
     business date in Asia/Kolkata.
   - Future closing dates are rejected.
   - Historical dates are supported as date-scoped snapshots.
   - No automatic shortage/excess journal adjustment is created.

Files
-----
supabase-accounts-phase-5e-integrity-hardening.sql
tools/accounts-integrity-hardening-regression.js
tools/run-regression-suite.js
ACCOUNTS-PHASE-5E-INTEGRITY-HARDENING-README.txt

Migration order
---------------
Apply the following in Supabase STAGING, in this order:

1. supabase-accounts-phase-1.sql
2. supabase-accounts-phase-5a-cash-handover.sql
3. supabase-accounts-phase-5b-office-cash.sql
4. supabase-accounts-phase-5c-upi-settlement.sql
5. supabase-accounts-phase-5d-daily-closing.sql
6. supabase-accounts-phase-5e-integrity-hardening.sql

Apply the already supplied Accounts Phase 2/3/4 application patches and
Phase 5A–5D application patches as documented in their own READMEs. Phase 5E
does not add a frontend page or change existing route contracts; it replaces
database RPC definitions with hardened versions.

Validation performed
--------------------
- Complete local regression suite: 30/30 scripts passed.
- Phase 5E focused regression: 23 assertions passed.
- This is static/source regression validation only.
- No PostgreSQL server was available for executing the migration in this
  environment; SQL has not been applied to Supabase.
- No Render deployment, live bank verification, or production transaction
  test has been performed.

Staging verification checklist
------------------------------
1. Apply migrations in the exact order above to a staging database.
2. Confirm two simultaneous employee cash debits cannot overdraw custody:
   run a handover confirmation and an office deposit confirmation for the
   same sender at the same time, with combined amounts above available cash.
   Exactly one should succeed; the other should fail for insufficient balance.
3. Submit office denomination data with a duplicate denomination and a
   missing denomination; both must be rejected.
4. Submit a valid six-denomination deposit; verify it is accepted.
5. Create a closing for a prior business date and verify entries posted after
   23:59:59 IST on that date are excluded from expected balances.
6. Attempt a future-date closing; it must be rejected.
7. Verify a closing remains a snapshot and no automatic variance adjustment
   is posted.
8. Verify all RPCs remain executable only through the trusted service-role
   backend, never directly from anon/authenticated clients.

Operational caution
-------------------
Do not apply directly to production before staging verification and a database
backup. Phase 5E changes existing function definitions but does not rewrite
historical journal rows. Ensure the backend continues to authenticate users,
enforce role/employee identity, and call RPCs with the service-role client.
