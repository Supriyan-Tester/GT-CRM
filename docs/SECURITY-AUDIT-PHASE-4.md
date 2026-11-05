# GM-CRM – Phase 4 Security Audit

## Confirmed issue fixed

The static-file handler previously used `file.startsWith(ROOT)` to decide whether a normalized path was inside the application directory. String-prefix checks are not a safe directory-boundary test: a sibling path such as `/app-private` begins with `/app`. Encoded path separators can also become traversal segments after URL decoding. The handler now uses `path.relative()` boundary validation and resolves symlinks with `fs.realpathSync()` before serving a file. Resolved symlink targets outside the application root are rejected.

## Regression coverage

`node tools/static-path-regression.js` checks normal in-root files, root itself, parent traversal, sibling-prefix traversal and symlink escape handling. The test also asserts the server uses the hardened helper.

## Audit scope and limits

This phase is a source-level review and regression test, not a penetration test. Authentication and authorization still require role-by-role testing against a staging deployment. No live Render service, Supabase project, or production record was accessed or changed.
