# Changelog – Security Phase 2D

- Fixed confirmed HTML attribute injection risk in Admin Orders status badges.
- Added an allowlist for status CSS classes (`placed`, `draft`, `cancelled`); unknown values use `unknown`.
- Added escaped fallback labels for unknown order status values.
- Updated all five Admin Orders status badge renderers.
- Added `tools/xss-render-regression.js`.
- Added `SECURITY-AUDIT-PHASE-2D.md`.
- No stored order data, database schema, API contract, or business workflow was changed.
