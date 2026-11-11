GM-CRM ACCOUNTS PHASE 5D — DAILY CASH CLOSING
================================================

Scope
-----
Adds a Billing-only daily cash closing and reconciliation screen. It snapshots:
- Employee cash custody ledger balances and employee-by-employee physical counts.
- Office cash ledger balance and physical office cash count.
- UPI clearing and bank ledger balances as separate accounting-only figures.
- Employee, office and total cash variances.

Approval and financial controls
-------------------------------
- A closing is submitted by one Billing user and must be approved by a different Billing user.
- Pending closings can be disputed by a different Billing user with a reason.
- One non-disputed closing can be active per date. A disputed closing can be replaced.
- Variances are flagged as an investigation; no automatic shortage/excess journal entry is posted.
- UPI clearing and bank are shown separately and are not included in physical cash counts.
- This feature does not alter the customer receivables ledger or gm_admin_ledger_v1.

Files in this patch
-------------------
supabase-accounts-phase-5d-daily-closing.sql
backend/modules/accounts/accounts.routes.js
admin/daily-closing.html
admin/accounts.html
admin/office-cash.html
server.js
tools/accounts-daily-closing-regression.js
tools/run-regression-suite.js

Installation order
------------------
1. Back up the Supabase database and current application files.
2. Confirm Accounts Phase 1 foundation and Phase 5A, 5B and 5C migrations have been reviewed and applied in staging.
3. Apply supabase-accounts-phase-5d-daily-closing.sql in Supabase staging using the SQL editor or approved migration process.
4. Apply the application files in this ZIP, preserving the existing project structure.
5. Run: node tools/accounts-daily-closing-regression.js
6. Run: node tools/run-regression-suite.js
7. Test with two distinct Billing accounts: one submits a closing and another approves or disputes it.
8. Verify employee custody counts, office cash count, UPI clearing and bank balances against source records before production rollout.

Important limitations
---------------------
- No live Supabase migration has been applied by this patch build.
- No Render deployment, bank integration, physical cash verification, or real financial transaction has been performed.
- UPI and bank amounts are ledger balances, not live bank-feed values.
- This closing is an operational snapshot. It does not freeze all concurrent journal activity or replace a formal accounting-period close.
- If a discrepancy is found, investigate and use a separately authorised accounting correction/reversal process. Do not edit journal rows manually.
- Review the SQL migration and test in staging before production use.
