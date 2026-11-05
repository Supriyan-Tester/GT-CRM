# GM-CRM Security Audit – Phase 2D (Dynamic HTML Rendering)

## Confirmed issue

The Admin Orders screen interpolated `o.status` directly into the CSS class attribute in four order-status badge renderers. Order status is persisted business data and may be introduced through imports, backups, old clients, or malformed records. A crafted value containing quotes and attribute markup could break out of the class attribute and inject HTML attributes.

## Fix

- Added `statusClass(value)` to allow only the explicitly supported order states: `placed`, `draft`, and `cancelled`.
- Unknown or malformed states now receive the inert CSS class `unknown`.
- Added `statusLabel(value)` so unknown state text is escaped before display.
- Updated all five Admin Orders status badges (list, detail panel, overview, and compact detail header) to use the safe helpers.
- No order status values are modified in storage. Existing business records remain intact; unknown values are displayed safely rather than being silently rewritten.

## Regression tests

Run:
```bash
node tools/xss-render-regression.js
```

The test checks that raw `o.status` is not interpolated into an HTML class attribute, the CSS class is allowlisted, and fallback text is escaped.

## Validation performed

- JavaScript syntax checks across all project JS files.
- Inline script syntax checks across HTML pages.
- Existing HTML escaping regression tests.
- Input validation regression tests from Phase 2C.
- New XSS rendering regression tests.
- ZIP integrity check.

## Remaining review scope

A full taint analysis of every HTML sink is not complete. A source inventory still contains many rendering sinks; counts are not vulnerability counts. The next review should focus on data imported from CSV/backup, customer and product data, user-generated notes/remarks, file metadata, and URL/attribute contexts. Do not apply blanket escaping or HTML sanitization to stored business data: output encoding must match the exact context (text, attribute, URL, CSS, or script).

## Compatibility

No database schema, API contract, role definition, storage key, order lifecycle, or order data format was changed. The patch affects only the CSS class and display label used by order status badges.
