# GM-CRM Security Audit – Phase 2C (Input Validation)

## Scope
This phase applies narrow request validation to authentication and Super Admin account-profile inputs. It does not attempt to sanitize every CRM field globally: doing so could corrupt legitimate customer names, addresses, remarks, product descriptions, CSV imports, or other business data.

## Changes
- `/api/login` now rejects non-string phone/password values, phone inputs longer than 32 characters, and passwords longer than 200 characters.
- Login no longer silently truncates a submitted password to 200 characters before checking it. Oversized values are rejected explicitly.
- `/api/users` rejects non-string `name`, `phone`, and `email` values instead of coercing arbitrary objects or arrays to strings.
- Admin account display names have control characters removed and whitespace normalized before storage. Existing HTML escaping remains responsible for output-context encoding; stored business text is not HTML-encoded.

## Regression coverage
Run:
```bash
node tools/security-regression.js
node tools/input-validation-regression.js
```
The focused input-validation test verifies the request guards and control-character normalization.

## Validation performed
- `node --check` passed for all 33 JavaScript files.
- Inline script syntax checks passed for all 53 inline scripts across HTML pages.
- Existing shared HTML-escaping regression tests passed (4 cases).
- New input-validation regression tests passed (5 cases).
- ZIP integrity check passed.

## XSS review status
A source inventory currently finds 420 `.innerHTML` assignments, 2 `.outerHTML` assignments, 4 `insertAdjacentHTML` calls, and 1 `document.write` call across JavaScript/HTML source. These are sink counts, not confirmed vulnerabilities. Each must be traced to its data source and output context before changing it. A blanket replacement would risk breaking existing UI rendering and is intentionally not performed in this phase.

## Not yet verified
- Full authenticated browser regression for Admin, Sales, Billing, Inventory, Delivery, and Worker flows.
- Live Supabase integration and multi-device data consistency.
- Complete source-to-sink taint analysis for every dynamic HTML render.
- Backup restore against a separate test database.
- API schema coverage for every business endpoint.

## Compatibility notes
No database schema, storage-key format, API response format, role definition, or business workflow was intentionally changed. The validation is limited to login input bounds and Super Admin account-profile fields.
