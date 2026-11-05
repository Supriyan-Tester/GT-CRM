# Changelog – Phase 4

- Hardened static file path validation using path-relative containment instead of string-prefix matching.
- Added real-path resolution to reject symlinks that point outside the application root.
- Added `tools/static-path-regression.js` covering traversal, sibling-prefix and symlink cases.
- Added `SECURITY-AUDIT-PHASE-4.md` documenting the finding, fix and validation boundary.
