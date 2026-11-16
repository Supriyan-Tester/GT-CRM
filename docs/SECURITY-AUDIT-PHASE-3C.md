# GM-CRM Phase 3C – Multi-Device Conflict Protection

## Existing controls confirmed
- The browser and server already maintain matching protected-record lists (15 keys).
- Protected records use optimistic concurrency: the browser sends the revision it read, and the server rejects a stale write with HTTP 409.
- The server accepts an identical value as an idempotent retry.
- The browser tracks per-record revisions and displays a stale-data warning.

## Gap addressed
Previously, when the server rejected a stale write with HTTP 409, the browser removed its dirty marker and immediately polled the server. The subsequent hydration could overwrite the browser's unsaved local value. This made a conflict warning insufficient to guarantee that the user's local work remained recoverable.

## Changes
- A stale-write response now creates a durable conflict marker containing the base revision and latest server revision.
- The actual local record remains in its existing localStorage key; the marker does not duplicate large CRM records.
- Conflicted keys are excluded from automatic retry and queued replay after reload.
- Server hydration continues to skip locally dirty/conflicted keys.
- The warning now offers **Download local copy** to export the conflicting local records as JSON.
- The warning also offers **Discard local copy & reload**, which explicitly removes only conflict markers and reloads the latest server version.
- Editing a conflicted record does not silently clear the conflict state or resume automatic syncing.
- Added a regression check that client/server protected-record lists remain identical.

## Validation
Run:
- `node tools/multi-device-conflict-regression.js`
- `node tools/idempotency-regression.js`
- `node tools/sync-outbox-regression.js`
- `node tools/security-regression.js`
- `node tools/input-validation-regression.js`
- `node tools/xss-render-regression.js`

These checks inspect the code paths and syntax. A true two-device browser test against a staging server is still required.

## Operational workflow for a conflict
1. Stop editing the conflicted record on the device showing the warning.
2. Select **Download local copy** to preserve the unsynced version.
3. Compare the downloaded JSON with the latest server version from another device.
4. Apply the required changes manually in the CRM after reloading the server version.
5. Do not manually upload the conflict JSON as a full database backup.

## Not included
- Automatic field-level merge. CRM records contain nested arrays and role-specific data; blindly merging them can corrupt related records.
- Cross-tab locking or BroadcastChannel coordination.
- Database transactions/unique constraints for multi-instance deployments.
- Live production or two-device browser testing.
