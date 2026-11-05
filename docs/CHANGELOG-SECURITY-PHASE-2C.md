# Changelog – Security Phase 2C

- Added bounded type/length validation for login phone and password fields.
- Removed silent password truncation at login; overlong input is rejected.
- Added type validation for Super Admin account name, phone, and email fields.
- Normalize control characters and whitespace in account display names.
- Added `tools/input-validation-regression.js`.
- Added `SECURITY-AUDIT-PHASE-2C.md` with scope, tests, and remaining limitations.
- No database schema, storage-key format, API response format, role definition, or business workflow was intentionally changed.
