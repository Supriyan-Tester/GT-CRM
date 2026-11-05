# Phase 4G – Sales-to-Office Order Workflow Verification

## Scope

This phase adds an isolated HTTP integration regression for the existing Sales order and office order-stage APIs. It does not create a second order-management interface or alter the existing Admin attendance module.

## Verified workflow

1. Synthetic Sales account authenticates.
2. Sales cannot place an order above tracked available stock.
3. Sales places a valid order for a synthetic shop and product.
4. Repeating the same order request key returns the original order ID.
5. Delivery role is denied access to the office-owned Sales stage endpoint.
6. Admin cannot skip the Processing stage.
7. Admin advances the order through Processing, Out for delivery, and Delivered.
8. Repeated stage requests return idempotent success.
9. Admin state contains exactly one order for the request key with all three stage records.

## Test isolation

The regression creates a temporary project copy and local temporary JSON database with synthetic users, shop and product. It starts a local Node server on a random high port and removes the temporary directory after the test. No Render URL, production credentials, Supabase project, or production business data is used.

## Limitations

- This is API-level integration coverage, not a real browser/device workflow.
- It verifies the office-owned stage transitions, not physical delivery app scanning or inventory deduction.
- Live staging verification remains pending.
