# Changelog – Phase 3C

- Confirmed server/client optimistic-concurrency protected-key lists match (15 records).
- Preserved stale local values after HTTP 409 conflicts.
- Prevented conflicted values from being automatically retried or replayed.
- Added JSON export of local conflicted records.
- Added an explicit discard-and-reload action.
- Added `tools/multi-device-conflict-regression.js`.
- No database schema or API contract changed.
