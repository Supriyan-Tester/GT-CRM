GM-CRM Accounts & Ledger — Phase 1 Foundation

Scope delivered
- Additive Supabase schema for invoice-wise customer receivables, collections, invoice allocations, immutable journal entries/lines, cash custody movements and denomination counts.
- RPC for importing legacy handwritten invoices as opening receivables. The balancing credit is OPENING_BALANCE_EQUITY, not sales revenue.
- RPC for recording a collection with invoice-specific evidence. It records employee cash custody immediately for physical cash and posts the receipt against COLLECTION_SUSPENSE; it does not reduce customer receivables.
- Admin approval RPC locks the collection and relevant invoices, rechecks outstanding amounts, and transfers the approved amount from COLLECTION_SUSPENSE to CUSTOMER_RECEIVABLE. Repeated approval is idempotent.
- Pure Node domain validation uses integer paise and checks invoice/customer ownership, allocation limits, evidence, and balanced journal lines.

Files
- backend/modules/accounts/accounts.domain.js
- tools/accounts-domain-regression.js
- supabase-accounts-phase-1.sql
- tools/run-regression-suite.js (registers the new test)

Important safety notes
- This is an isolated development patch. It has NOT been applied to Supabase, Render, or the user's live project.
- SQL was not executed against a PostgreSQL instance in this environment. Review and run it in a disposable Supabase/staging project first.
- No UI or server endpoints are connected yet. The next phase must add authenticated server-side RPC access, customer/invoice screens, evidence upload integration, approval screens, and role-specific permissions.
- The existing gm_admin_ledger_v1 employee advances/deductions key is untouched.
- Existing gm_kv records, orders, customer records, and employee records are untouched.
- Existing UI theme and navigation have not been changed.

Validation
- node tools/accounts-domain-regression.js
- node --check backend/modules/accounts/accounts.domain.js
- Full regression suite to be run against the isolated working copy before distributing the patch.

Apply strategy
1. Back up the current project.
2. Merge the patch files; do not replace the whole project with this patch.
3. Do not run the SQL against production until staging tests and a reviewed migration plan are complete.
