# GM-CRM: Commands Cheat Sheet

Run everything from the project folder (`D:\Projects\GM-CRM`). Needs Node 18 or newer.

## Run the server

| Command | What it does |
|---|---|
| `node server.js` or `npm start` | Starts the server. With no Supabase variables set it runs in **local mode** (data stored in `data/`). |
| `node --env-file=.env server.js` | Starts the server and loads settings from `.env`. If `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, it runs in **cloud mode**. |
| `node server.js --reset-admin` | Resets the main admin login, prints a temporary password, then exits. Use it if you are locked out. |
| `node server.js --migrate` | Copies local `data/` up to Supabase. Needs the Supabase variables. **Overwrites cloud data. Back up first.** |

Stop the server with **Ctrl+C**. Default address: `http://localhost:3000/` (change with `PORT` in `.env`).

## Local mode vs cloud mode

- **Local mode:** comment out these lines in `.env` (put `#` in front):
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`.
  Data is stored in the `data/` folder. No internet needed.
  **Cash & Accounts pages (Collections, Ledger, Reports, Cash closing, Sales collections and cash handover) do not work in local mode.** They need Supabase.
- **Cloud mode:** fill in the three Supabase values in `.env`.
- `.env.example` shows every setting. Never commit `.env` or share the service key.

## Check the Supabase connection

If the server says `Could not start: fetch failed`, run this in PowerShell:

```powershell
node --env-file=.env -e "fetch(process.env.SUPABASE_URL+'/rest/v1/',{headers:{apikey:process.env.SUPABASE_SERVICE_KEY}}).then(r=>console.log('reached, status',r.status)).catch(e=>console.log('failed:',e.cause&&e.cause.code||e.message))"
```

| Result | Meaning |
|---|---|
| `failed: ENOTFOUND` | Wrong URL, project paused or deleted, or DNS problem. |
| `failed: ETIMEDOUT` / `ECONNREFUSED` | Network, VPN or firewall is blocking it. |
| `reached, status 200` or `401` | Connection works. Check the key, or retry. |

## Tests

| Command | What it does |
|---|---|
| `npm test` | Runs all regression scripts (44). |
| `node tools/<name>.js` | Runs one script, e.g. `node tools/login-spinner-regression.js`. |
| `npm run test:workflow` | Sales order and delivery workflow test. |
| `npm run test:returns` | Returns reconciliation test. |
| `npm run test:staging` | Smoke test against a staging site (needs `GMCRM_STAGING_*` in `.env`). |
| `npm run test:e2e` | Browser tests with Playwright (needs `npm install` and staging login values). |

## Setup and maintenance

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies. Run once on a fresh copy. |
| `npx prettier --write <file>` | Formats a file. |
| Command |	Effect |
|---|---|
| `npx prettier --check .` |	Lists the files that aren’t formatted and changes nothing.
|`npx prettier --write` | path\to\file	Formats one file, for example one you just edited.
| `npx prettier --write "admin/*.html"` |	Formats one folder or file pattern. Run npm test afterwards.
| `node tools/build-icons.js` | Rebuilds `assets/icons/sprite.svg` from the single icon files. Run after adding or swapping an icon. |
| `node tools/attachment-backup.js` | Backs up and verifies uploaded attachments. Check the top of the file for its options before using it. |
| `node --check server.js` | Checks a file for syntax errors without running it. |
| `node -v` | Shows your Node version. |

## Employee and access notes

- Delete an employee: Admin, then Employees. If they have history, a second "Delete anyway?" popup appears.
- Give a Sales employee collection access: Users & Admins, then Employee access, tick **Collections & cash handover**, then Save. They may need to sign out and in again.
- Other docs are in the `docs/` folder (for example `SUPABASE-SETUP.md`).