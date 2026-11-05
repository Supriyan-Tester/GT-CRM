# Changelog – Phase 3B

- Kept existing Sales order request-key duplicate detection.
- Made repeated order-stage requests idempotent after a stage has already been applied.
- Duplicate stage retries no longer write another revision or duplicate the activity event.
- Added `tools/idempotency-regression.js`.
- No database schema, API route, role permission, or business workflow changed.
