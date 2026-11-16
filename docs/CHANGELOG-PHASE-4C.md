# Changelog – Phase 4C

- Added `tools/api-auth-regression.js`, an HTTP integration suite that boots a disposable copy of the real server with synthetic role accounts and fixture data.
- Verified login/session issuance for Super Admin, Admin, Sales, Billing, Inventory, Delivery, and Helper.
- Exercised real API guards for user/access administration, backup export/import, activity access, module-scoped KV writes, server-owned keys, state filtering, and Sales restrictions.
- Verified Delivery/Helper worker sessions can write their own employee record but cannot write another employee's record or admin-owned shared records through generic KV.
- Verified account role changes and deactivation revoke sessions and inactive accounts cannot sign in.
- Explicitly removed Supabase credentials and Render/proxy flags from the test child environment; test data lives only in a disposable temporary directory.
- Added `SECURITY-AUDIT-PHASE-4C.md` with results, run instructions, clarifications and limitations.
- No production database, live Supabase project, or Render deployment was accessed or modified.
