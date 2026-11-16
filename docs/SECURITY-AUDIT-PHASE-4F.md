# Phase 4F – Sales Attendance

## Scope

Added a self-service attendance feature to the Sales panel. Sales staff can punch in, punch out, and review their own monthly attendance. The server is authoritative for date and time; the browser cannot submit a time or employee ID to alter an attendance record.

## Implementation

- `sales/attendance.html` and `sales/attendance.js` provide the attendance page.
- The Sales navigation's previously disabled Attendance item now opens the page.
- `POST /api/sales/attendance` accepts only `punch-in` and `punch-out` actions.
- `GET /api/sales/attendance?month=YYYY-MM` returns only the authenticated Sales user's records.
- Attendance is stored in the server-owned `gm_sales_attendance_v1` key. Generic KV writes remain denied.
- Employee-based Sales sessions also mirror the record into their own `gm_crm_data_v5__<employeeId>.attendanceLog`, which is the data source used by the existing office Attendance dashboard.
- Punch-in and punch-out are logged in the activity log and create an office notification.
- Duplicate punch-in, punch-out without an open shift, and duplicate punch-out are rejected with HTTP 409.
- The server retains up to 90 days of per-user Sales attendance.

## Security boundaries

- The session determines the employee ID; request bodies cannot select another employee.
- Sales can only retrieve their own attendance history.
- Sales cannot modify the server-owned attendance key through `/api/kv`.
- Times and dates are generated on the server in India Standard Time.
- No GPS or location permission is required for attendance.

## Existing office attendance

For Sales users who sign in as employee records (`s.emp`), attendance is mirrored into the employee attendance log. The existing office Attendance dashboard already reads each active employee's `attendanceLog`, so those Sales entries appear there without granting Sales employees access to the office dashboard.

Standalone legacy Sales accounts that are not employee records still receive self-service attendance history, but are not represented in the employee roster/dashboard. They should be converted to employee records if office-wide attendance reporting is required.

## Verification

`node tools/sales-attendance-regression.js` starts an isolated local server with synthetic Sales employees and verifies navigation/UI wiring, punch-in/out, duplicate protection, own-record isolation, monthly history, employee-record mirroring, and generic-KV protection.

No production URL, production credentials, or production database is used by this test.
