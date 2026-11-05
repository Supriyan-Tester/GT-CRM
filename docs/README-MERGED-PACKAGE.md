# GM-CRM consolidated package — Phase 4I

This package combines the user's uploaded GM-CRM source archive (`GM-CRM(20261102-121949).zip`) with the source and documentation from `GM-CRM-phase-4I-return-reconciliation.zip`.

## Important data and security notes

- `.env`, `.git`, `node_modules`, and `data/` were intentionally not included.
- Keep your existing `.env` and `data/` folder safe. Do not delete or overwrite them when updating an existing installation.
- For a fresh local setup, copy `.env.example` to `.env` and fill in the correct values. Never commit `.env` or real credentials.
- The archive does not contain customer records, sessions, backups, or uploaded photos from the original ZIP.

## Setup

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and configure the required environment values.
3. Run `npm install`.
4. Run `npm test` for the regression suite.
5. Run `npm start` to start the server.

Use a staging environment and synthetic data for verification before deploying to production.

## Included work

Includes the user's project files plus the Phase 4F sales attendance, Phase 4G sales order workflow, Phase 4H delivery integration, and Phase 4I return reconciliation source files and documentation as present in the supplied Phase 4I archive.
