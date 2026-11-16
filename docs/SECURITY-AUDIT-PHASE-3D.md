# GM-CRM – Phase 3D Backup & Recovery Audit

## Findings addressed

1. **No backup integrity metadata.** Exported and automatic JSON backups previously had no checksum. A damaged file could still be structurally valid and proceed to preview. New format-versioned backups now carry a SHA-256 digest over `rev`, `items` and `activity`; preview rejects a mismatch.
2. **Safety-copy write was not verified.** Import previously wrote the pre-import snapshot and immediately proceeded. The updated path reads the snapshot back and verifies both bytes and digest before any restore mutation starts.
3. **Automatic backup writes were not verified.** Local and Supabase daily backups now receive read-back verification. Local writes use a temporary file and rename after verification.
4. **Local backup retention was unbounded.** Date-named local daily snapshots now retain the latest 30; Supabase retention remains 14.

## Validation evidence

The `tools/backup-integrity-regression.js` suite verifies successful digest generation, detection of altered record data, detection of altered activity data, backward compatibility for legacy backups, rejection of unsupported integrity metadata, and wiring of server/UI safeguards.

The prior Phase 3C and security regression suites were rerun and passed. All project JavaScript files and 53 inline scripts across 54 HTML files passed syntax checks.

## Residual risks / work not claimed

- The complete import/restore endpoint has not been exercised against an isolated disposable Supabase project or production-like Render instance in this phase. The regression suite tests the integrity module and static wiring; it is not a live restore drill.
- JSON backups do not include files in the separate Supabase/local file store (customer photos, product images, vehicle and employee documents).
- SHA-256 here is an integrity checksum, not a keyed MAC or digital signature. An attacker able to alter both the backup and digest can recompute it.
- Legacy backups remain accepted without a checksum for compatibility, subject to existing structural validation.
- No production environment was contacted or modified.
