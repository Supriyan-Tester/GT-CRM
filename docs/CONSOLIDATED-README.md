# GM-CRM — Consolidated Project

This package combines the GM-CRM source from `GM-CRM(20261104-161226).zip` with the completed feature patches listed below.

## Included feature sets

- Existing GM-CRM application and modules from the 4I-era project baseline.
- A4 health/readiness route extraction.
- A5 regression-test hardening.
- A6.4 overnight attendance integration.
- Accounts foundation and customer ledger API/UI.
- Collection evidence upload and collection workflows.
- Phase 5A employee cash custody and cash handover.
- Phase 5B office cash register and deposits.
- Phase 5C UPI clearing and bank settlement reconciliation.
- Phase 5D daily cash closing and variance approval.
- Phase 5E financial-integrity hardening.
- Phase 5F read-only staging preflight diagnostics.

## Run locally

Requirements: Node.js 18 or newer.

1. Copy `.env.example` to `.env`.
2. Fill in the required environment values using your own Supabase project credentials. Never commit `.env`.
3. Install dependencies:
   `npm install`
4. Start the application:
   `npm start`
5. Run local regression checks:
   `npm test`

The project uses the native Node.js HTTP server. Do not replace it with an Express server without a separate migration plan.

## Supabase migration order

Apply these SQL files to a **staging Supabase project first**, in this order:

1. `supabase-accounts-phase-1.sql`
2. `supabase-accounts-phase-5a-cash-handover.sql`
3. `supabase-accounts-phase-5b-office-cash.sql`
4. `supabase-accounts-phase-5c-upi-settlement.sql`
5. `supabase-accounts-phase-5d-daily-closing.sql`
6. `supabase-accounts-phase-5e-integrity-hardening.sql`

After applying the migrations, run `supabase-accounts-phase-5f-staging-preflight.sql` in the Supabase SQL Editor. It is intended as a **read-only diagnostic**; inspect its result sets and resolve all errors before considering deployment.

Phase 5F is not a migration and should not be treated as one. Do not apply these SQL files to production until staging validation and backup/recovery checks are complete.

## Validation performed during package assembly

- `node tools/run-regression-suite.js`: **31/31 regression scripts passed**.
- `node --check` over all JavaScript files: passed.
- Secret/local-data exclusion scan: no `.env`, local `db.json`, SQLite database, spreadsheet, or CSV business-data files found in this package.

## Important validation limits

These checks were run against the consolidated source in an isolated local environment. They do **not** prove that:
- Supabase migrations have been applied successfully.
- PostgreSQL RPCs, advisory locks, grants, or RLS policies work against your actual Supabase project.
- Render deployment or production data has been tested.
- Real bank/UPI statement reconciliation has been integrated.

No live Supabase migration, Render deployment, or production data operation was performed while assembling this package.

## Security and data handling

- `.env`, `.git`, `node_modules`, local `data/`, and business spreadsheets/CSV files were excluded.
- Create a fresh `.env` from `.env.example` on your own machine.
- Keep service-role credentials server-side only.
- Take a verified database and attachment backup before staging migration.
- Never upload real customer or financial data into public repositories or patch archives.

## Package contents

The source remains modular. Accounts routes, services, SQL migrations, UI pages, and regression tests are kept in their respective folders rather than being merged into one oversized source file.
