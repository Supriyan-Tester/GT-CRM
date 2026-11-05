# Changelog – Phase 3A

- Added durable dirty markers for all syncable browser `gm_*` records.
- Prevented server hydration from replacing locally queued values.
- Replayed queued saves and deletes after a page reload.
- Preserved protected-record base revisions in the durable marker.
- Added `tools/sync-outbox-regression.js`.
- No API routes, database schema, stored business record formats, or role permissions were changed.
