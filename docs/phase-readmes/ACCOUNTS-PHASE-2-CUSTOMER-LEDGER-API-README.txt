GM-CRM Accounts & Ledger — Phase 2: Customer Ledger API

This phase connects the Phase 1 Supabase Accounts foundation to authenticated GM-CRM API routes.

Added/updated files
- backend/modules/accounts/accounts.routes.js
- backend/modules/accounts/accounts.domain.js
- server.js
- supabase-accounts-phase-1.sql
- tools/accounts-domain-regression.js
- tools/accounts-routes-regression.js
- tools/run-regression-suite.js

API routes
- GET /api/accounts/customers/:customerCode/invoices
  Returns invoice snapshots, approved payments and calculated outstanding balances.
- POST /api/accounts/opening-invoices
  Billing-permission only. Imports a legacy invoice as an opening receivable through the SQL RPC.
- POST /api/accounts/collections
  Sales and active Delivery employees (or Billing users) can submit invoice allocations. The server reloads invoice balances; the SQL RPC locks invoices and checks pending/approved allocations before recording.
- GET /api/accounts/collections/pending
  Billing-permission only. Lists collections awaiting approval.
- POST /api/accounts/collections/:id/approve
  Billing-permission only. Calls the atomic approval RPC.

Security and accounting notes
- The service-role key remains server-side. Browser clients never call Supabase directly.
- Customer identity is resolved from the existing gm_admin_v1 customer list; client-supplied customer names are ignored.
- Invoice balances are read server-side and revalidated under SQL row locks.
- Pending and approved allocations are considered when accepting a new allocation, preventing multiple pending receipts from reserving more than the invoice balance.
- Sales and Delivery can submit collections; Billing/Admin can import opening invoices and approve collections.
- Existing gm_admin_ledger_v1 remains untouched.
- The collection API expects an evidencePath reference, but dedicated Accounts bill-photo upload and server-side evidence-file existence verification are not part of this phase. Do not expose the collection form to production users until Phase 3 completes that integration.

Validation performed
- node --check server.js
- node --check backend/modules/accounts/accounts.routes.js
- node --check backend/modules/accounts/accounts.domain.js
- node tools/accounts-domain-regression.js
- node tools/accounts-routes-regression.js
- node tools/run-regression-suite.js — 22/22 scripts passed in the isolated development copy.

Not performed
- SQL migration was NOT executed against Supabase/PostgreSQL.
- No live Render/Supabase testing, real employee login, browser UI test or production deployment was performed.
- No customer, invoice, collection, journal or cash records were written to the user's real database.

Apply strategy
1. Back up the project.
2. Merge the files in this patch into the existing project; do not replace the whole project.
3. Review and execute the Accounts SQL migration only in a disposable/staging Supabase project.
4. Configure staging environment variables and run authenticated API tests.
5. Complete Phase 3 evidence upload verification and customer ledger UI before enabling financial collection in production.
