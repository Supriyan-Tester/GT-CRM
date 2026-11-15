# GM-CRM Project Notes (plain language)

Read this first. Companion file: `MAP.md` (which page uses which CSS/JS, button details, recipes).

## 1. What this app is
A business app for General Traders: sales orders, billing, delivery routes, vehicles, attendance, customers, products, and a big **Accounts** area (collections, cash handover, office cash, UPI settlements, daily closing). Different people log in with different roles and see different pages.

## 2. How it is built (the big picture)
Think of a shop:
- **Pages (HTML in `admin/`, `sales/`, `worker/`)** = the shop counters customers see.
- **CSS (`shared/*.css`)** = the paint and decoration.
- **JS (`shared/*.js`, `sales/*.js`)** = the staff who react when someone presses a button.
- **`server.js`** = the manager at the back. Every save and every login goes through him. He checks who you are and what you may see.
- **Data** = the storeroom. Local mode: a `data/` folder on the computer. Online mode (Render): Supabase database. Passwords are kept separately as scrambled hashes in `data/auth.json`.
- **`backend/modules/`** = extra back-office departments (accounts, attendance, health check). **`sql/`** = database setup scripts, run in order on Supabase.
- **`tools/`** = automatic test scripts. **`docs/`** = history of every phase (what changed and why).

How JS talks to the data: pages call `window.GA` (in `shared/admin.js`). It is the single doorway to data. Pages never touch data directly.

## 3. Folder cheat sheet
| Folder/file | What it is | Touch? |
|---|---|---|
| `admin/*.html` | Admin and office pages | Yes (looks, text) |
| `sales/`, `worker/` | Salesperson and field-worker pages | Yes (looks, text) |
| `shared/*.css` | Styles. `theme.css` loads last and wins | Yes, main place for design |
| `shared/*.js` | Page behaviour | Carefully |
| `shared/admin.js` | Data doorway `window.GA` + page shell | Careful: many pages depend on it |
| `shared/mock-data.js` | Sample/demo data | Rarely |
| `assets/` | Icons, images | Yes |
| `server.js`, `storage.js` | The manager and the saving logic | **Not without help** |
| `backend/modules/` | Accounts, attendance logic | **Not without help** |
| `sql/` | Database scripts | **Never edit old ones; never run on production untested** |
| `tools/`, `tests/` | Automatic checks | Don't delete; update only with the code they check |
| `docs/` | History | Read only |
| `*.bak`, `_backup_before_updates/` | Old copies | Ignore |
| `.env` (you create from `.env.example`) | Secret keys | **Never share or upload** |
| `render.yaml`, `package.json` | Deployment and scripts | Not without help |

## 4. What NOT to touch (and why)
1. **Money logic**: anything in `backend/modules/accounts`, and `sql/*accounts*`. A wrong change can make cash and ledger numbers disagree, and that is hard to repair.
2. **Old SQL files**: they are applied in order (phase 1, 5a … 8a). Editing an old one does not change a database that already ran it. Add a NEW file instead.
3. **Login, roles and `PAGE_RULES`** (`server.js` ~line 924 AND the matching table at the top of `shared/admin.js`). Both lists must match, otherwise a page can be hidden in the browser but still open on the server (security hole), or the reverse.
4. **`window.GA` function names** in `admin.js`. Rename one and many pages break silently.
5. **`.env` and keys**: never paste into chat, GitHub or zips. The Supabase service key can read and write everything.
6. **Element ids and `data-` attributes** (e.g. `id="saveBtn"`, `data-action=...`). JS finds elements by these. Restyling is safe; renaming ids is not. Classes you can restyle freely, but if JS adds or removes a class (e.g. `classList.add("active")`), keep that class name.
7. **Real business data** (`data/`, `db.json`, spreadsheets): never edit by hand, never delete, back up first.
8. **Don't replace the plain Node server with Express.** The project docs say a separate migration plan is needed.
9. **Don't deploy straight to production.** Render runs `npm test` before every deploy, so a failing test blocks the deploy (a good safety net). Use staging first.

## 5. Safe = design changes. Risky = data changes.
| Safe (go ahead) | Risky (ask AI first, test) |
|---|---|
| Colours, sizes, shapes, animation | Renaming ids/classes JS uses |
| Text and labels | Anything with money, stock, attendance |
| Spacing, layout, phone view | Roles, logins, permissions |
| Icons and images | How data is saved or loaded |

## 6. How to make a change (the routine)
1. **Decide** what you want ("Save button on Workers page: bigger, pill shape").
2. **Find** it: Inspect in the browser → class name → look it up in `MAP.md`.
3. **Back up**: copy the file to `filename.bak` (or keep the original zip).
4. **Test live** in Inspect first (change values there; nothing breaks).
5. **Edit** the file with the winning rule. Change one thing at a time.
6. **Refresh** with Ctrl+Shift+R and check desktop, phone width, and dark mode.
7. **Run the tests**: `npm test`. It should say `38/38 scripts passed`. Several tests read the HTML/CSS text of pages (like `admin/accounts.html`, `sales/sales.css`, collections pages), so a layout edit can fail one. If so, the test is telling you what you changed. Ask me and I'll tell you if the test or the change needs fixing.
8. **Send me only the changed files** (as you prefer), or keep a short list of what you changed.

## 7. Running it on your computer
1. Install Node.js 18 or newer.
2. In the project folder: `npm install`
3. Copy `.env.example` to `.env` and fill your own values.
4. `npm start`, then open the address it prints.
5. `npm test` to check nothing is broken.
(Tests passed 38/38 when I ran them on your uploaded copy.)

## 8. Words you will meet
- **RBAC / roles**: who may see what (Super Admin, Admin, Sales, Billing, Inventory, Delivery, Helper).
- **Supabase**: the online database. **Render**: the host where the app runs online.
- **Staging**: a practice copy of the online app. **Production**: the real one people use.
- **Migration**: a SQL script that changes the database structure.
- **RPC**: a function that lives inside the database.
- **RLS**: database rules about who can read which rows.
- **Regression test**: a script that re-checks old features still work.
- **Phase 4I, 5D…**: the numbered stages the project grew through. See `docs/`.

## 9. Moving further (suggested order)
**Step 1 - Make design changes comfortable (now).** Use MAP.md, change a few buttons, learn Inspect.
**Step 2 - Learn one flow end to end.** Pick "Collections": read its page (`admin/collections.html`), its JS, then its docs in `docs/`. Seeing HTML → JS → server → data once makes everything else click.
**Step 3 - Tidy safely.** Remove stale `.bak` files and `_backup_before_updates` once you are sure (keep a zip). Fill `README.md` (currently empty) from `docs/CONSOLIDATED-README.md`.
**Step 4 - Add small features.** Examples: a new filter on a list, a new report column, a new button that exports a table. Ask AI, review changes, run `npm test`.
**Step 5 - Staging checks.** Per the docs, the Supabase migrations and Render deployment have NOT been proven on your real project. Before real use: staging Supabase, run migrations in order, run the phase-5f preflight, backup and recovery test.
**Step 6 - Go live carefully.** Backup, deploy to staging, test with real flows, then production.
**Step 7 - Grow skills for your goals.** You aim to build sites and tools for clients and to work in QA. This project is good practice for both: write test cases for a flow (collections, cash closing), find bugs, and read the `tools/*-regression.js` files to see how automatic tests are written.

## 10. How to work with AI on this project (saves time and tokens)
- Name the page and the thing: "Workers page, Save button".
- Say what you want in plain words and, if possible, the result: "pill shape, 44px high, lifts on hover".
- Ask AI to change only that file and send only that file back.
- Ask "will this affect other pages or tests?" before anything on the "risky" list.
- After each change: Ctrl+Shift+R, then `npm test`.
