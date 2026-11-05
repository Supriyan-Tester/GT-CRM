# GM-CRM – Phase 2 Security and Reliability Audit

Baseline: `GM-CRM-security-phase-1.zip` supplied in this conversation.

## Scope and changes

### 1. File-content validation

- Server-side upload decoding now checks the actual file signature for JPEG, PNG, WEBP and PDF content, not just the caller-supplied data-URL MIME type.
- Encoded payload length is checked before allocating the decoded buffer.
- The decoded file must be within the existing 5 MB server limit.
- Existing allowed formats and endpoints are preserved.

### 2. Customer photo format correctness

- Customer photo storage now preserves the actual extension (`.jpg`, `.png`, or `.webp`).
- Reads return the matching MIME type rather than always labelling content as JPEG.
- The photo index recognizes all three supported formats.
- Existing `.jpg` customer photos remain readable.
- Replacing a photo removes stale alternate-format copies; deleting a photo removes all supported extensions.

### 3. Backup import validation

- Backup import now validates every record key against the same `gm_*` key format used by the normal KV API.
- Array-shaped record wrappers are rejected.
- Activity log month keys must be `YYYYMM`, each value must be an array within the existing activity limit, and each event must have string `type` and `text` fields.
- Invalid backup data is rejected during preview before any live data is changed.

### 4. Additional browser security policy

Added non-breaking Content Security Policy directives:

- `base-uri 'self'`
- `object-src 'none'`
- `frame-ancestors 'none'`

No restrictive `script-src`, `style-src`, `img-src` or `connect-src` policy was added because the current application uses inline scripts/styles and external map resources. The existing `X-Frame-Options: DENY` and other security headers remain.

## Validation performed

A disposable local server and isolated data directory were used. The following integration checks passed:

- Initial Super Admin login and forced password change.
- Valid PNG customer photo upload, listing, retrieval with `image/png`, and deletion.
- Rejection of an HTML payload falsely labelled as PNG.
- Rejection of invalid backup record keys.
- Rejection of malformed activity month keys.
- Acceptance of a valid backup preview.
- Presence of the new CSP directives.

The server's JavaScript syntax check passed.

## Important remaining work / limitations

- This is not a completed XSS audit. The source contains many `innerHTML`/HTML-template render paths. Each must be reviewed with its data sources and output context; blanket replacement would risk breaking existing pages. No claim is made that every sink is safe.
- Input validation is distributed across modules. A complete field-by-field validation matrix and negative tests remain outstanding.
- Backup JSON does not package uploaded photos/documents from the separate file store. Those files need a separate backup/restore strategy and restore drill.
- No production database or Supabase project was accessed or modified.
- Browser-based regression testing across all Admin, Sales and Worker flows remains required before deployment.

## Deployment

Apply to a staging copy first. Keep the current live source, `.env`, database and uploaded files backed up. The ZIP excludes `.env`, `data/`, `node_modules/` and `.git/`.
