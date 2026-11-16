# Changelog – Phase 4G

- Added an isolated HTTP integration test for the Sales-to-office order lifecycle.
- Verified that Sales cannot place orders above tracked available stock.
- Verified valid Sales order placement and idempotent retry using the same request key.
- Verified Delivery role cannot call the office-owned Sales order stage endpoint.
- Verified Admin stage progression must follow Processing → Out for delivery → Delivered.
- Verified repeated stage requests return idempotent success and do not create duplicate orders.
- Added the workflow test to the full regression runner and exposed `npm run test:workflow`.
- No production database, Render service, or live CRM records were accessed or modified.
