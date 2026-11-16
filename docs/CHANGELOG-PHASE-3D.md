# GM-CRM – Phase 3D Backup & Recovery

Baseline: `GM-CRM-phase-3C-multidevice-conflicts.zip`.

## Changes

- New backups include `formatVersion: 1` and a SHA-256 integrity digest covering the database revision, every stored record and the activity log.
- The download export, local daily backup, Supabase daily backup and pre-import safety copy use the same versioned backup envelope.
- Local and Supabase daily backups are read back and verified before being treated as successful. Local backup writes use a temporary file followed by an atomic rename.
- Local daily backups retain the latest 30 date-named snapshots. Supabase daily backups retain the latest 14 snapshots, preserving the existing cloud retention policy.
- Import preview verifies checksums before showing the restore confirmation. Damaged or modified checksummed backups are rejected before live data is changed.
- Legacy GM-CRM backups without a checksum remain import-compatible and are explicitly identified as unchecksummed in the preview.
- Unsupported format versions and invalid integrity metadata are rejected. Record revision values are also checked for safe non-negative integers.
- The pre-import safety copy is written and read-back verified before restore mutation begins. If verification fails, restore does not start.
- The Super Admin preview now displays whether the file's SHA-256 integrity check passed or whether it is a legacy backup.

## Validation

- Backup-integrity regression: 6/6.
- Multi-device conflict regression: 8/8.
- Idempotency regression: 6/6.
- Durable sync outbox regression: 6/6.
- Input validation regression: 5/5.
- XSS rendering regression: 4/4.
- Admin escaping regression: 4/4.
- JavaScript syntax checks passed for all project JavaScript files.
- Inline script syntax checks passed: 53 scripts across 54 HTML files.

## Scope and limitations

- This phase verifies backup-file integrity and the safety-copy write path. It does not constitute a full end-to-end restore drill against a disposable Supabase project or a live Render deployment.
- Uploaded customer photos, product images and vehicle/employee documents are stored separately and are not included in the JSON backup. They still require a separate file-store backup/restore strategy.
- A SHA-256 digest detects accidental corruption and unkeyed modification only when the checksum itself is trusted. It is not a digital signature or protection against an attacker who can rewrite both data and digest.
- Legacy backups have no checksum; they continue through the existing structural validation only.
- The import process retains existing semantics: current Super Admin account data is kept, while other records and activity logs are replaced. Auth files and sessions are not part of the export.
- No production data, `.env`, Supabase project or Render deployment was accessed or modified.

## Deployment guidance

Deploy to a staging copy first. Download a fresh backup before deployment, retain it outside the server, and verify that the preview reports `integrity verified`. Do not use a production restore as a test. Keep the previous source and data snapshot until the staging restore workflow has been exercised.
