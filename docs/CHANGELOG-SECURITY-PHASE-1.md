# Change log – Security Phase 1

- Hardened Admin KV read/write permissions with an explicit allowlist and default-deny behaviour.
- Restricted vehicle, product and customer-photo file operations by module permission.
- Added revision checks for updates and deletes to critical shared records.
- Added Delivery authorization for employee live-location requests.
- Prevented Billing-only users from modifying route assignments.
- Restricted global work-rule editing to full Admin/Super Admin accounts and updated Profile UI accordingly.
- Normalized unknown legacy account roles to Admin during account upgrade.
- Added audit notes in `SECURITY-AUDIT-PHASE-1.md`.
