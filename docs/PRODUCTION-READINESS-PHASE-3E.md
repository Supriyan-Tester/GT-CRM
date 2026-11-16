# GM-CRM – Phase 3E Production Readiness & Recovery

## Changes in this phase

- Added `GET /api/ready` as a dependency-aware readiness probe. In Supabase mode it pings `gm_kv` and returns HTTP 503 when that dependency is unavailable. `/api/health` remains a liveness probe so a temporary database outage does not cause Render restart loops.
- Added `tools/attachment-backup.js` to export all indexed vehicle (`v/`), product (`p/`) and customer photo (`c/`) files into a separate archive with a manifest, file sizes and SHA-256 hashes.
- Added archive verification and an isolated restore command. Restore requires a new or empty target data directory and writes only to that directory; it does not upload to Supabase or overwrite the running app's data.
- Added `tools/attachment-recovery-regression.js`, which creates fixture files in a temporary directory, archives them, verifies hashes, restores to an isolated directory and checks corruption/path-traversal rejection.

## Backup and recovery runbook

### 1. Export database records

Sign in as Super Admin and use the existing **Export Backup** action. Store the JSON backup outside the app server and outside the same machine as the primary data.

### 2. Export attachments

Run from a trusted machine with the project files. In Supabase mode, provide the Supabase URL and service-role key only in the shell environment (never in a browser, committed file, or screenshot):

```powershell
$env:SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
$env:SUPABASE_SERVICE_KEY="YOUR-SERVICE-ROLE-KEY"
node tools/attachment-backup.js create .\gm-crm-attachments-2026-11-02
node tools/attachment-backup.js verify .\gm-crm-attachments-2026-11-02
```

For local mode, omit the two Supabase variables. The script reads `data/vehicle-files`, `data/product-files`, and `data/photos`.

### 3. Test attachment recovery safely

```powershell
node tools/attachment-backup.js restore .\gm-crm-attachments-2026-11-02 .\recovery-drill-data
```

The target must be new or empty. This creates a local copy under `vehicle-files`, `product-files`, and `photos`. Compare the restored files and keep this drill isolated from the live server.

### 4. Test database recovery safely

- First use the Admin import preview (`preview=1`) and inspect the record count, removal count and employee count.
- Perform an import only against a disposable staging database, never as an initial production test.
- Confirm login, customer, route, product, order, payment and attendance data after restore.
- Verify the pre-import safety backup exists and has a valid checksum before considering the drill complete.

## Deployment checks

- Render `healthCheckPath` remains `/api/health` (liveness). External monitoring can check `/api/ready` to detect Supabase dependency failures.
- Confirm Render has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` configured. The service-role key must remain server-side and must not be committed.
- Confirm Supabase SQL setup has created `public.gm_kv` and the private `gm-files` storage bucket.
- Confirm the bucket contains the `v/`, `p/`, `c/` and `backups/` object prefixes as applicable.
- Keep database JSON backups and attachment archives in a separate, access-controlled location with retention appropriate to the business.
- A Render local filesystem is not durable across all service lifecycle events on the free plan. Use Supabase storage for persistent production files and data.

## Scope and limitations

- The attachment archive covers the indexed `v/`, `p/`, and `c/` objects. It intentionally excludes the `backups/` object prefix to avoid recursively archiving database backup files.
- The restore command restores attachment files to an isolated local data directory only. It does not write to Supabase or alter production data.
- Database restore still uses the existing Super Admin import flow. This phase does not claim a live Supabase restore drill or production deployment test.
- SHA-256 detects accidental corruption; it is not a keyed signature. Protect archive storage and credentials with access controls.
- No Render deployment, Supabase project, or production records were contacted or modified during these checks.
