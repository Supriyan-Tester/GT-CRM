GM-CRM Accounts & Ledger — Phase 4: Evidence Upload and Collection Workflow

BASELINE
Apply this patch on top of the cumulative GM-CRM source containing:
- A4 health route extraction
- A5 regression hardening
- A6.4 attendance integration
- Accounts Phase 2 Customer Ledger API
- Accounts Phase 3 Customer Ledger UI

FILES
- backend/modules/accounts/accounts.routes.js
- server.js
- storage.js
- admin/accounts.html
- sales/sales.js
- sales/collections.html (new)
- worker/collections.html (new)
- worker/orders.html
- tools/accounts-ui-regression.js
- tools/accounts-evidence-regression.js (new)
- tools/accounts-evidence-api-regression.js (new)
- tools/run-regression-suite.js
- ACCOUNTS-PHASE-4-EVIDENCE-COLLECTION-README.txt

IMPLEMENTED
1. Evidence upload endpoint: POST /api/accounts/evidence
   - accepts JPG, PNG and WEBP only
   - validates MIME/data signature
   - maximum 5 MB
   - stores under accounts/evidence/<uuid>.<ext>
2. Authenticated evidence read endpoint: GET /api/accounts/evidence/<uuid>
   - only returns evidence linked to an invoice/collection
   - Billing can review all linked evidence
   - Sales/Delivery can read evidence only for their own submitted collections
3. Opening invoice form in Admin Accounts page:
   - customer, invoice number/date, original amount, current outstanding, bill photo
   - API rejects unuploaded/unrecognized evidence paths
4. Sales Collections page:
   - selects customers with Accounts invoices
   - selects one or more invoices
   - validates amount against available-to-collect balance
   - requires a separate photo for every invoice allocation
   - records collection as pending approval
5. Delivery Collections page:
   - only exposes customers associated with that worker's assigned delivery orders
   - allows collection for active assigned deliveries and recently completed deliveries (7-day window)
   - requires per-invoice bill photo
6. Admin approval:
   - pending collection shows invoice allocation details and evidence links/previews
   - requires explicit evidence-review confirmation before enabling approval
   - approval calls the atomic SQL RPC
7. Storage:
   - adds accounts evidence folder to local and Supabase file indexing
   - local file storage maps accounts/ to data/accounts/

API / ACCOUNTING SAFETY
- Pending collections do not reduce customer receivables.
- Cash custody is recorded at receipt; approval allocates against receivables.
- Cash, UPI clearing and bank transfer remain distinct.
- The existing gm_admin_ledger_v1 is untouched.
- Evidence paths are generated server-side; client cannot choose arbitrary storage paths.
- The collection RPC remains responsible for invoice row locks, allocation limits and idempotency.

VALIDATION
- node --check server.js
- node --check storage.js
- node --check backend/modules/accounts/accounts.routes.js
- inline scripts in admin/accounts.html, sales/collections.html and worker/collections.html passed node --check
- node tools/accounts-evidence-api-regression.js — 8 assertions passed
- node tools/run-regression-suite.js — 25/25 scripts passed in isolated local source

NOT PERFORMED
- No Supabase migration or live database write was performed.
- No Render deployment was performed.
- No real staff login, live storage bucket upload, or device/browser end-to-end test was performed.
- Automated browser E2E regression verifies the harness/configuration, not the new screens against a live browser session.

BEFORE PRODUCTION
1. Apply the reviewed Accounts SQL migration to a disposable/staging Supabase project.
2. Confirm the configured Supabase Storage bucket (default gm-files) accepts service-role writes to accounts/evidence/.
3. Test upload, invoice creation, collection submission, evidence retrieval and Admin approval with synthetic staff.
4. Test duplicate submissions and simultaneous collection attempts.
5. Verify local backup/restore includes data/accounts/ evidence files.
6. Review Delivery's 7-day completed-order collection window with the business owner.
7. Only then consider production migration/deployment.

PATCH APPLICATION
Back up the project first. Merge these files into the existing project; do not replace the whole project with this patch.
