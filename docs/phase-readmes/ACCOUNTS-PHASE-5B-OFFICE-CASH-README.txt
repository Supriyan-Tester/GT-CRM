GM-CRM ACCOUNTS PHASE 5B — OFFICE CASH REGISTER & DEPOSITS

SCOPE
- Employee submits physical cash deposit with six denomination counts.
- Denomination total must equal declared amount.
- Deposit remains pending and does not alter either ledger until Billing verifies it.
- Billing confirms physical receipt; SQL RPC checks employee custody balance under an advisory lock.
- Confirmation posts balanced journal lines: credit employee custody, debit office cash.
- Office register displays confirmed balance, pending deposits and receipt history.
- Uses existing cash movement, denomination and journal tables. No new ledger table.

FILES
- supabase-accounts-phase-5b-office-cash.sql (additive migration)
- backend/modules/accounts/accounts.routes.js
- server.js (billing page rule)
- sales/office-deposit.html and worker/office-deposit.html
- admin/office-cash.html
- tools/accounts-office-cash-regression.js and suite hook

INSTALL
1. Back up staging DB and application.
2. Apply Accounts Phase 1, then Phase 5A migration, then this Phase 5B migration in staging.
3. Deploy patch to staging.
4. Test with employee A holding cash and a separate Billing account: submit deposit; confirm it is pending and office balance unchanged; Billing verifies and confirms; employee custody decreases and office cash increases by same amount.
5. Test invalid denominations, duplicate request key, insufficient custody, unauthorized confirm, repeated confirm and disputed/invalid status.
6. Only after staging sign-off and backup, consider production migration/deployment.

LIMITATIONS
- SQL was not executed against a live Supabase instance. No Render deployment, live financial transaction test, or real browser/device E2E was performed. Regression checks are static contract assertions and syntax checks.
- Office cash register is a cash balance from posted journal lines; this phase does not yet include UPI settlement or daily close.
- Billing confirmation is the accounting control; physical verification remains an operational responsibility.
