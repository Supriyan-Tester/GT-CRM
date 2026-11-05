# Changelog – Phase 4B

- Added `tools/rbac-regression.js` to evaluate role/page, module-read, module-write, and default-deny policies from the server's declared rule tables.
- Added explicit role matrix coverage for Super Admin, Admin, Sales, Billing, Inventory, Delivery, and Helper.
- Added guard-presence assertions for privileged account, access, backup, employee, close-day, sales-admin, and static-page routes.
- Added `SECURITY-AUDIT-PHASE-4B.md` documenting verified policy and remaining staging requirements.
- No production database, live Supabase project, or Render deployment was modified.
