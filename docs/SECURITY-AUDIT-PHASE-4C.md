# GM-CRM – Phase 4C API Authorization Integration Test

## Result

The API authorization integration suite passed against a disposable local copy of the application. It launched the real `server.js`, created synthetic accounts for all seven roles, authenticated each role over HTTP, and exercised the server's real authorization middleware and API handlers.

## What was tested

1. **Authentication:** Super Admin, Admin, Sales, Billing, Inventory, Delivery, and Helper each signed in and received a session cookie.
2. **Privileged endpoints:** account management, access management, export, and import were denied to non-Super-Admin accounts. Activity access was allowed to Super Admin/Admin and denied to module roles.
3. **Module writes:** Billing and Inventory employee sessions could write only their respective permitted shared records; module users were denied unrelated records. Admin retained full shared-record write access.
4. **Worker isolation:** Delivery and Helper sessions were denied generic shared vehicle/attendance writes and could write only their own employee CRM record, not another employee's record.
5. **Server-owned records:** no role could change `gm_admin_access_v1` through the generic KV endpoint.
6. **Read filtering:** Sales/Billing/Inventory/Delivery/Helper responses did not expose the private business record; Super Admin could read it.
7. **Sales isolation:** Sales sessions were denied account/activity administration and generic shared-record writes.
8. **Session lifecycle:** changing an account's role revoked its existing session; the new login received the new role. Deactivation revoked the current session and blocked subsequent login.

## Run

```bash
node tools/api-auth-regression.js
```

The test copies only the server runtime files into an operating-system temporary directory, writes synthetic database/auth fixtures, and starts a local server on a temporary port. The harness explicitly removes `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`, `RENDER`, and `TRUST_PROXY` from the child process environment. It shuts down the test server and deletes the temporary directory on completion.

## Findings / clarifications

- The actual API enforces different storage boundaries for employee sessions and admin-side sessions. Delivery and Helper employees use worker sessions and are restricted to their own employee records through generic KV writes; their day-to-day delivery/attendance operations must use their dedicated endpoints. This is now explicitly covered by the HTTP integration suite.
- The source-level Phase 4B `KEY_RULES` matrix describes module policy for admin-side sessions; it should not be interpreted as a direct generic-KV grant for worker-side Delivery/Helper sessions.
- No authorization bypass was reproduced in this synthetic local HTTP drill.

## Limitations

- This is a local integration test using synthetic accounts and data, not a test of the deployed Render service or the user's Supabase project.
- It does not prove every business-specific API action is correct, nor does it replace a staging penetration test, browser UI test, or two-device test.
- Production credentials, live data, and production services were not accessed or modified.
