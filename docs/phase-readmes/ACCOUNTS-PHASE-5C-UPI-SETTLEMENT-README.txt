GM-CRM ACCOUNTS PHASE 5C — UPI SETTLEMENT & BANK RECONCILIATION

Purpose
- Track UPI collections in UPI_CLEARING until the corresponding bank credit is checked.
- Record a pending settlement with amount, bank UTR/reference, credit date and note.
- Require a different Billing-authorised user to verify the bank statement and confirm.
- On confirmation, post one balanced journal entry: Debit BANK / Credit UPI_CLEARING.
- Permit a pending settlement to be disputed with an audit reason; disputes do not post journal entries.
- Prevent duplicate request keys and duplicate bank references.
- Prevent settlement confirmation beyond the available UPI clearing balance.

Files in this patch
- supabase-accounts-phase-5c-upi-settlement.sql (new additive migration)
- backend/modules/accounts/accounts.routes.js (new UPI settlement endpoints)
- admin/upi-settlements.html (new Billing page)
- admin/accounts.html (link to cash and UPI pages)
- admin/office-cash.html (link to UPI page)
- tools/accounts-upi-settlement-regression.js (new regression)
- tools/run-regression-suite.js (includes Phase 5A/5B/5C regression scripts)

Prerequisites / migration order
1. Apply supabase-accounts-phase-1.sql.
2. Apply supabase-accounts-phase-5a-cash-handover.sql.
3. Apply supabase-accounts-phase-5b-office-cash.sql.
4. Apply supabase-accounts-phase-5c-upi-settlement.sql.
5. Deploy the application patch to staging, then verify role permissions and bank reconciliation with test records.

Operational controls
- Only the existing Billing permission can read, create, confirm or dispute settlement records.
- The person who records a settlement cannot confirm or dispute their own record.
- Confirm only after matching the bank statement credit, UTR/reference and amount. The application does not connect to a bank API and cannot independently verify the bank credit.
- Do not edit or delete posted journal entries manually. Corrections require a separately designed, approved reversal workflow.
- UPI clearing balance is derived from posted journal lines, not from pending settlement requests.
- The migration is additive and does not modify gm_kv or the legacy employee ledger.

Validation performed locally
- Node syntax check for accounts.routes.js.
- Inline JavaScript syntax checks for admin/upi-settlements.html, admin/accounts.html and admin/office-cash.html.
- New UPI settlement regression: 15 assertions passed.
- Full local regression suite: 28/28 scripts passed.

Not performed
- No Supabase migration has been applied.
- No Render deployment, real bank API integration, live bank statement verification, or real financial transaction test has been performed.
- Browser harness checks are not a substitute for a real authenticated browser session against staging.
