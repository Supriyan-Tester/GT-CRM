# Change Log – Security Phase 2

- Validate uploaded file signatures for JPEG, PNG, WEBP and PDF files.
- Reject oversized encoded file payloads before decoding.
- Preserve customer photo file extensions and serve the correct MIME type.
- Continue supporting existing legacy `.jpg` customer photos.
- Remove stale alternate customer-photo formats on replacement and delete.
- Validate backup record keys and activity log structure before preview/import.
- Add safe CSP directives for base URI, embedded objects and framing.
- Add `SECURITY-AUDIT-PHASE-2.md` with scope, tests and remaining limitations.

No production data, `.env`, Supabase credentials or live database were changed.
