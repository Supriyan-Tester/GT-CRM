# Phase 4I — Return inspection and supplier reconciliation

## What changed

- Delivery submission now creates a server-owned return record for every order line with a positive returned quantity. The record links to the order, shop, delivery worker, reason, and timestamp.
- Returned units remain pending inspection. The delivery worker cannot choose stock disposition or access the Admin return queue.
- Inventory/Admin users can split each returned line into reusable, supplier-return, and damaged quantities. The split must equal the returned quantity exactly.
- Only the reusable quantity is added to the product's tracked stock. Supplier-return and damaged quantities never increase available stock.
- Inspection is one-time/idempotency protected; repeat inspection is rejected before any stock write.
- Supplier reconciliation tracks dispatch reference/date, company acknowledgement reference/date, replacement received, credit note, refund, and company rejection.
- A supplier replacement is not added to stock merely because it was marked received. Inventory/Admin must separately inspect the received replacement and split it into accepted and damaged quantities. Only accepted units enter stock, and the receipt inspection cannot be replayed.
- All inspection and reconciliation mutations are server-side and activity-logged. Return data is stored under the server-owned `gm_inventory_returns_v1` key, not generic client KV writes.

## New Admin screen

`/admin/returns.html` — Returns & reconciliation. Visible to Admin/Super Admin and Inventory module users. It appears in the Admin navigation for users with Inventory permission.

## API routes

- `GET /api/inventory/returns` — Inventory/Admin only.
- `POST /api/inventory/returns/inspect` — one-time disposition and approved reusable stock adjustment.
- `POST /api/inventory/returns/company` — dispatch, acknowledgement, and company response tracking.
- `POST /api/inventory/returns/replacement-inspect` — separate physical inspection of received replacement units and accepted-stock adjustment.

These routes are session-authenticated. They do not expose the return ledger through `/api/state` or generic `/api/kv` writes.

## Validation and test

Run:

```bash
node tools/returns-reconciliation-regression.js
node tools/sales-order-workflow-regression.js
```

The Phase 4I regression runs against a temporary isolated local database and synthetic accounts. It verifies worker denial, return creation, exact disposition balancing, one-time inspection, reusable-only stock addition, supplier/damaged exclusion from stock, dispatch and acknowledgement references, all four supplier outcomes, separate replacement inspection, and duplicate prevention.

The broader `node tools/run-regression-suite.js` currently reports 15/17 scripts passing on the supplied Phase 4H source package. Two unrelated existing tests fail because this package is missing `tools/attachment-backup.js` (required by `attachment-recovery-regression.js` and `production-readiness-regression.js`). The Phase 4I and Phase 4H workflow tests pass independently.

## Operational note

Tested only with synthetic data on a temporary local server. No production URL, production account, or production data was accessed or changed. Deploy this package to a staging environment first and validate with a small test order before production rollout.
