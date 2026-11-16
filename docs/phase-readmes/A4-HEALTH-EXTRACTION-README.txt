GM-CRM A4 - Health/readiness route extraction

This patch was implemented and tested against an isolated extraction of the supplied GM-CRM archive.
It does not modify your original ZIP, deployed Render application, or Supabase data.

Files in this patch (paths are relative to the GM-CRM project root):
- server.js
- backend/modules/health/health.routes.js (new)
- tools/health-routes-regression.js (new)
- tools/run-regression-suite.js
- tools/production-readiness-regression.js
- tools/api-auth-regression.js
- tools/sales-attendance-regression.js
- tools/sales-order-workflow-regression.js
- tools/returns-reconciliation-regression.js

Apply by backing up your current project, then copying these files into the matching paths.
Do not copy this patch into a running production directory without first testing locally.

Verification performed in isolated project copy:
- Node syntax checks: passed
- Focused health route regression: 10/10 passed
- Full regression suite: 19/19 scripts passed
- API authorization and workflow integration tests used disposable local servers and synthetic data.
- No production Supabase connection or deployment was used.

After applying locally:
1. Run: node --check server.js
2. Run: node tools/run-regression-suite.js
3. Start locally with: node server.js
4. Check GET /api/health and GET /api/ready.
5. Only deploy after your own local verification and explicit deployment decision.
