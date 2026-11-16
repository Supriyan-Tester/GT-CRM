# GM-CRM – Phase 4B RBAC Verification

## Scope

This phase adds a repeatable source-level role-based access control regression suite. It evaluates the server's actual `PAGE_RULES`, `KEY_RULES`, and `ADMIN_READ` declarations, then checks role/page, module-read, module-write, and default-deny expectations for Super Admin, Admin, Sales, Billing, Inventory, Delivery, and Helper accounts.

## Verified policy matrix

- **Super Admin:** all admin pages, all modules, user/account administration, access management, and backup export/import.
- **Admin:** full CRM pages and module data, but not Super Admin-only user/account, access-management, or backup operations.
- **Sales:** Sales/customer/route/product-price scope; no generic shared-record writes. Sales transaction operations remain on dedicated `/api/sales/*` routes.
- **Billing:** customer, sales, product/billing and ledger scope; cannot modify delivery routes/plans or inventory-only records.
- **Inventory:** product and inventory scope; cannot access billing ledger, delivery vehicles, or user administration.
- **Delivery:** routes, plans, vehicles, and delivery scope; cannot access billing ledger or inventory-only editing.
- **Helper:** attendance/employee-support scope; cannot access user administration, inventory, or delivery vehicle administration.

## Default-deny checks

Unknown page names default to full-admin access. Unknown shared-record keys are absent from the generic write allowlist. Access control, sales transaction records, employee-specific CRM records, location pings, and crew records are not writable through the generic KV allowlist and remain behind dedicated server-side handling.

## Endpoint guard assertions

The regression suite asserts the presence of Super Admin checks for account/access/backup operations, full-admin checks for employee deletion, module checks for close-day and sales administration actions, and server-side HTML page gates for admin and Sales pages.

## Run

```bash
node tools/rbac-regression.js
```

## Limits

This is source-level policy verification, not a live HTTP authorization test. It does not create test accounts, log into Render, or call Supabase. The next staging step should exercise each role with real sessions and assert HTTP 200/302/403 outcomes for every protected endpoint, including negative cross-user access attempts. No production data or credentials were accessed or changed.
