# GM-CRM Phase 3B – Duplicate Order and Delivery Update Protection

## Scope
This phase hardens retry behavior for Sales order creation and order-stage updates. It does not change the database schema, order IDs, business workflow, role permissions, or API routes.

## Existing protection confirmed
The Sales order endpoint already accepts a request key (`b.k`). Before creating a new order, it searches for an order with the same key belonging to the same Sales user and returns that existing order. The Sales order form sends this key and retains it when a placement attempt fails on the current page. This behavior was retained.

## Gap fixed
The Admin order-stage endpoint previously rejected a repeated stage request after the first request had been committed. This is ambiguous to the browser when the original response is lost: the server may have updated the order even though the client sees a network error.

## Change
- If the requested stage is already present on an order, the endpoint now returns HTTP 200 with `{ ok: true, alreadyApplied: true }`.
- The retry exits before writing a new database revision or adding another activity event.
- Invalid stages and out-of-sequence transitions remain rejected.
- Cancelled/non-placed orders remain ineligible for stage changes.

## Validation
Run:
- `node tools/idempotency-regression.js`
- `node tools/sync-outbox-regression.js`
- `node tools/security-regression.js`
- `node tools/input-validation-regression.js`
- `node tools/xss-render-regression.js`

These are source-level regression checks. They do not replace concurrent HTTP integration tests or a browser test against a staging database.

## Remaining limitations
- The Sales order request key is generated in the order page runtime. It is retained for retries on that page, but it is not a durable browser-persisted checkout token across a full page reload.
- The server runs as a single Node process in the current architecture. A future multi-instance deployment should use database-enforced unique idempotency keys/transactions rather than relying on in-process sequencing.
- This phase does not add idempotency keys to unrelated inventory, payment, attendance, or customer operations.
- Backup restoration and multi-device conflict testing remain outstanding.
