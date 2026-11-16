# GM-CRM Phase 3A – Durable Browser Sync Queue

## Scope
This phase addresses one confirmed reliability gap in the existing browser-to-server synchronization layer. It does not replace localStorage, introduce IndexedDB, change the API, or alter CRM business workflows.

## Finding
Before this change, the browser kept unsent values in an in-memory `pending` object. A small `gmq_dirty` marker was persisted only for worker records. If a non-worker `gm_*` save failed while offline and the page/browser was closed, the in-memory queue was lost. On the next load, server hydration could overwrite the locally saved value with the older server value.

## Change
- Persist a compact dirty marker for every syncable `gm_*` key, including deletions.
- Keep the actual record in its existing localStorage key; do not duplicate potentially large CRM JSON into a second queue.
- During hydration, do not overwrite keys with a durable dirty marker.
- Replay queued keys after server hydration, including deletion requests.
- Preserve the base server revision for protected admin records so stale-write protection remains active after reload.
- Clear the marker after an accepted save or an explicit permanent rejection, following the existing error-handling policy.
- Keep compatibility with the older numeric `gmq_dirty` timestamps: they still act as dirty markers, but have no stored base revision.

## Validation
Run:
- `node tools/sync-outbox-regression.js`
- `node tools/security-regression.js`
- `node tools/input-validation-regression.js`
- `node tools/xss-render-regression.js`

The regression script checks the queue persistence, hydration guard, replay path, migration interaction, and marker cleanup. These are source-level checks, not a full browser/offline simulation.

## Not included / not yet verified
- IndexedDB migration.
- Multi-tab coordination (BroadcastChannel/Web Locks).
- End-to-end offline/online browser testing.
- Idempotency keys for order/delivery creation endpoints.
- Full backup restore drill against a disposable database.
- Live production testing.

## Operational caution
Test this build in a staging copy with a disposable account before production. In particular, simulate a failed network save, close/reopen the page, reconnect, and verify the queued value reaches the server without overwriting a newer protected record.
