# Changelog – Security Phase 2B

- Hardened the shared Admin HTML escaping helper to encode apostrophes as well as the other HTML-sensitive characters.
- Added `tools/security-regression.js` with focused regression cases for the shared escaping helper.
- Added `SECURITY-AUDIT-PHASE-2B.md` documenting the XSS/input-validation review, validation performed, and remaining limitations.
- No database schema, API contract, business workflow, or existing feature was intentionally changed in this phase.
