GM-CRM Accounts & Ledger — Phase 3: Customer Ledger UI

Added
- admin/accounts.html: new Accounts & Ledger screen using the existing General Traders theme, admin page shell, responsive layout and shared navigation.
- Customer selector populated from the existing CRM customer collection.
- Invoice-wise ledger table: invoice number/date, opening-vs-CRM source, original amount, approved paid amount and outstanding balance.
- Pending collection review list with collector, method, amount and received time.
- The approval action is deliberately disabled until invoice-specific bill-photo evidence can be uploaded, retrieved and verified in the review UI. Do not bypass this guard.
- Accounts page is registered in shared/admin.js navigation and client permission map, and server.js PAGE_RULES. Billing permission required.
- tools/accounts-ui-regression.js and registration in tools/run-regression-suite.js.

Validation
- Inline JavaScript syntax check passed.
- node --check server.js and shared/admin.js passed.
- Accounts domain, routes and UI regression tests passed.
- Full regression suite: 23/23 scripts passed.

Limitations
- This is an Admin/Billing customer ledger and pending review screen only.
- No collection approval is enabled because evidence upload/retrieval and evidence verification are not yet integrated.
- No Sales/Delivery collection form is exposed.
- Opening-invoice import UI and photo upload are not yet implemented.
- No Supabase migration was run, no live records were created, and no Render deployment was performed.

Apply
- Back up the current project.
- Merge the four files in this patch into the same relative paths.
- Run: node tools/run-regression-suite.js
- The screen requires the Phase 1 SQL migration to be applied in a disposable/staging Supabase project and Phase 2 API patch to be present. It should not be enabled for live financial use until evidence handling is complete.
