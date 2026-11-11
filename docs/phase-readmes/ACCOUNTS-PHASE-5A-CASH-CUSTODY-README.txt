GM-CRM — ACCOUNTS PHASE 5A: EMPLOYEE CASH CUSTODY & HANDOVER

SCOPE
- Adds an employee-to-employee physical cash handover workflow.
- Captures denomination counts for ₹500, ₹200, ₹100, ₹50, ₹20 and ₹10.
- Validates that denomination total equals the declared handover amount.
- Handover remains pending until the named recipient confirms receipt.
- Recipient may dispute a pending handover with a mandatory reason.
- Confirmed transfers post balanced double-entry lines between the sender's and recipient's EMPLOYEE_CASH_CUSTODY accounts.
- Sender balance is checked at confirmation; sender confirmations are serialized with a transaction advisory lock to prevent concurrent over-transfer.
- Adds Sales and Delivery cash-handover pages and API routes.

FILES
- supabase-accounts-phase-5a-cash-handover.sql (new additive migration)
- backend/modules/accounts/accounts.routes.js
- server.js
- sales/cash-handover.html (new)
- worker/cash-handover.html (new)
- sales/sales.js
- tools/accounts-cash-handover-regression.js (new)
- tools/run-regression-suite.js

INSTALLATION
1. Back up the staging database and current application version.
2. Apply the existing Accounts foundation migration first if it has not already been applied.
3. Review supabase-accounts-phase-5a-cash-handover.sql with the database owner, then apply it to Supabase STAGING only.
4. Deploy the application patch to a staging environment.
5. Test using two active employee accounts: sender records exact denominations; recipient confirms; sender and recipient balances update; recipient disputes a second handover; disputed movement creates no custody journal transfer.
6. Verify employee roles and recipient list before production rollout.
7. Apply the reviewed migration to production only after staging sign-off and a fresh backup.

IMPORTANT LIMITATIONS
- This patch does not apply the SQL migration, access Supabase, or deploy to Render.
- The regression suite validates static contracts and JavaScript syntax. It does not execute PostgreSQL functions against a live database or perform real browser/device E2E.
- Phase 5B office cash receipt/register, Phase 5C UPI settlement, and Phase 5D daily closing/reconciliation are not included.
- Cash handover pages are accessible to signed-in Sales and Delivery collection roles; server-side authorization is authoritative.
- Existing customer receivables, collection approval workflow, employee advances and legacy gm_admin_ledger_v1 are not repurposed.

VALIDATION
- node --check backend/modules/accounts/accounts.routes.js
- node --check server.js
- node --check sales/sales.js
- node tools/accounts-cash-handover-regression.js (18 assertions)
- node tools/run-regression-suite.js (26/26 scripts passed in isolated project copy)

Apply only after reviewing the migration and testing the workflow in staging.
