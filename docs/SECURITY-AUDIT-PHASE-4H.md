# Phase 4H – Delivery Integration Security Notes

## Authorization boundaries

- Only authenticated admin-side accounts with Sales, Billing, or Delivery access can assign an order.
- Assignment requires an existing active Delivery/Helper/Loading employee and an order already marked Out for delivery.
- Delivery workers can read only orders whose `deliveryAssignment.workerId` equals their authenticated worker ID.
- Delivery workers can submit results only for orders assigned to their own worker ID.
- Generic KV writes cannot mutate `gm_sales_orders_v1`; all order changes remain server-owned.

## Input and state validation

- Every submitted product line must match one order line exactly; duplicate or missing line IDs are rejected.
- Delivered quantity must be numeric and between zero and ordered quantity.
- Any quantity not delivered requires a bounded return reason.
- The server calculates returned quantity; clients cannot submit it independently.
- A result advances the existing delivered stage and is idempotent when retried.
- Completed results cannot be reassigned or replaced through the delivery API.

## Scope and limitations

- This connects Sales orders to a named delivery-app employee. It does not automatically add those orders as stops to a route plan; route planning remains the existing separate workflow.
- The existing shop-visit return workflow remains unchanged. Order-line return results are recorded on the Sales order for Admin review; they are not automatically posted to stock or the financial ledger.
- Staging browser tests and live multi-device tests are still required before production deployment.
