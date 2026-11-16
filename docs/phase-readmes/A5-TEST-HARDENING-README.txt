GM-CRM A5 - Backup and Activity Test Hardening

Scope
- Adds tools/activity-diff-regression.js with focused activity description tests.
- Extends tools/backup-integrity-regression.js with revision-tampering, malformed-payload,
  malformed-checksum and legacy-compatibility checks.
- Registers the activity regression script in tools/run-regression-suite.js.

No application runtime files, database schemas, storage keys, environment variables,
Render configuration, or production data are changed by this patch.

Apply
1. Back up your current project folder.
2. Extract this ZIP into the project root, preserving folder paths and allowing the
   included tools files to replace their existing versions.
3. From the project root, run:
     node tools/run-regression-suite.js
4. Confirm the final line reports 20/20 scripts passed.

Validation performed against the isolated project copy from the supplied GM-CRM archive:
- Backup integrity focused checks: 12/12 passed.
- Activity diff focused checks: 8/8 passed.
- Full regression suite: 20/20 scripts passed.
- Node syntax checks for the changed/new JavaScript files and the existing activity and
  backup modules: passed.

This patch does not change the activity logging implementation or backup verification
implementation. It adds regression coverage and suite registration only.
