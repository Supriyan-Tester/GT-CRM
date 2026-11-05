# GM-CRM – Phase 1 Security and Data-Integrity Audit

Audit baseline: `GM-CRM-async-sync-optimized.zip` supplied in this conversation.

## Scope reviewed

- `server.js` – authentication, sessions, role/module permissions, KV API, backup endpoints and file endpoints.
- `storage.js` and `supabase-setup.sql` – local/Supabase persistence and bucket configuration.
- `shared/sync.js` – browser/server synchronization and revision handling.
- `admin/profile.html` – work-rule controls affected by the permission changes.

This was a source-code review plus local integration testing. It was not a penetration test of a deployed production environment or a full audit of every UI rendering sink.

## Changes applied

### 1. Default-deny storage permissions

- Replaced the implicit allow for unknown Admin KV keys with an explicit allowlist.
- Unknown keys are now denied for both reads and writes by restricted Admin-side accounts.
- Kept dedicated server-managed records out of generic KV writes (access, consent, Sales transactions, location pings and crew records).
- Added an explicit Delivery-authorized exception for `gm_locreq_<employeeId>` so the Live Location page can request a location refresh for an existing employee.
- Preserved the supported legacy `gm_crm_data_v5` migration key for full Admin accounts.

### 2. Role validation

- Full access is now limited to the explicit `Super Admin` and `Admin` roles.
- Unknown legacy role values are normalized to `Admin` during account upgrade so existing legitimate accounts are not unexpectedly locked out.

### 3. File endpoint authorization

- Vehicle/worker file management through `/api/vfile` now requires full Admin or Delivery module access for Admin-side sessions.
- Product image uploads/deletes through `/api/pfile` require Inventory access.
- Product image reads remain available to Sales, Billing and Inventory users, and to Sales sessions.
- Customer photo management through `/api/photo` is limited to full Admin or Sales/Billing module access.

### 4. Shared-record conflict protection

- Expanded revision protection to important shared records: products, vehicles, fuel, vehicle service, vehicle sync, ledger, business details, work settings and attendance edits, in addition to the existing protected records.
- Existing protected records now require the exact revision returned by the last server read. Missing or stale revisions return HTTP 409 with `code: "stale"`.
- Protected deletes now carry and validate a revision too.
- Same-value retries remain idempotent.
- Updated `shared/sync.js` to include revision data for protected writes and deletes.

### 5. Field-level permission correction

- Billing-only users may update customer data but cannot change route assignments unless they also have Sales or Delivery access.
- Delivery permission remains required for plan changes.

### 6. Work-rule administration

- Global employee work rules are now editable only by full Admin/Super Admin accounts.
- The Profile page disables those controls and removes Save/Reset actions for restricted Admin-side employees, while keeping the rules visible.

## Validation performed

- `node --check` passed for 30 project JavaScript files.
- `node --check` passed for the bundled Leaflet JavaScript.
- 53 inline JavaScript blocks across 54 HTML files passed syntax checks.
- 32 local API integration assertions passed, covering:
  - Super Admin login and password change;
  - unknown-key write denial and restricted-user read denial;
  - Inventory, Billing and Sales employee sessions;
  - module-specific product, vehicle and customer-photo file access;
  - protected PUT and DELETE revision enforcement;
  - Billing route-edit restrictions;
  - Delivery-authorized live-location requests;
  - Sales product-image read access without upload permission.
- Integration tests used a disposable local data directory. That temporary test database and test server were removed after testing.

## Remaining audit work (not represented as fixed)

1. Review all dynamic `innerHTML`/HTML-template rendering paths for user-controlled data and confirm context-appropriate escaping.
2. Add and validate a Content Security Policy. This needs careful rollout because the app currently uses inline scripts/styles and external map resources.
3. Exercise backup export/import/restore against a separate test dataset and verify record counts, attachments and post-restore login.
4. Review file-content MIME sniffing and malformed/oversized request handling.
5. Review login throttling under restarts and multi-instance deployment; current counters are process-local.
6. Run browser-level regression tests for every role and the worker mobile flows against a staging dataset.

## Deployment note

Apply this package to a staging copy first and retain the current production database and `.env` separately. The package does not include production `data/`, `.env`, `node_modules/` or Git history. Do not overwrite the live data directory with this source package.
