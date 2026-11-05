# GM-CRM Security Audit – Phase 2B (XSS and Input Validation)

## Scope

Reviewed the current source package for dynamic HTML sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, and `srcdoc`), shared escaping helpers, server request-body handling, and file-serving/upload routes.

## Change made

- Hardened `GA.esc()` in `shared/admin.js` to encode apostrophes (`&#39;`) in addition to ampersands, angle brackets, and double quotes. This helper is reused by Admin pages and shared Admin components when rendering user-controlled values into HTML strings.
- Added `tools/security-regression.js` to regression-test the escaping helper against script-tag payloads, all HTML-sensitive delimiters, null, and numeric values.

## Validation

- The repository contains many HTML-string rendering sites. Their existence alone is not proof of XSS; each sink must be assessed based on whether untrusted values reach it and whether the value is escaped for its output context.
- Sales has its own `Sales.esc()` helper which already encodes apostrophes and the other HTML-sensitive delimiters.
- The file upload endpoints perform MIME/signature decoding, extension mapping, size checks, and identifier validation in the current source.
- The API body reader enforces a global/request-specific size ceiling and parses JSON; endpoint-level schema validation remains uneven and should be expanded route by route.

## Remaining work / limitations

- This phase is not a certification that every dynamic HTML sink is XSS-safe. A complete taint review and browser payload test is still required for all Admin, Sales, and Worker screens, especially imported CSV values, remarks, customer/product names, and user-generated links.
- The existing inline-script application architecture limits how restrictive a Content Security Policy can be introduced without a broader nonce/hash migration. The current CSP is a compatibility-oriented baseline, not a complete XSS mitigation.
- Endpoint-level input schemas should be added incrementally with compatibility tests; a blanket sanitizer would risk corrupting legitimate business data.

## Test command

```bash
node tools/security-regression.js
```
