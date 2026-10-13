# Put GM-CRM live: Supabase (data) + Render (server)

## 1. Supabase (free)
1. supabase.com -> New project (choose the region nearest you; save the database password).
2. SQL Editor -> New query -> paste everything from `supabase-setup.sql` -> Run.
3. Project Settings -> API: copy the **Project URL** and the **service_role** key.
   The service_role key is a SECRET. Never put it in GitHub or in any page. It goes only into Render (step 3).

## 2. Copy your current data up (once, on your PC)
In the GM-CRM folder (Node 18 or newer), in PowerShell:

    $env:SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
    $env:SUPABASE_SERVICE_KEY="YOUR-SERVICE-ROLE-KEY"
    node server.js --migrate

It uploads your records, logins, pictures and documents. If it prints a temporary admin
password, write it down: you sign in with it first and then choose your own.

## 3. GitHub, then Render
1. Push the project to a PRIVATE GitHub repo (`.gitignore` keeps `data/` and `Test Files/` out).
2. render.com -> New -> Blueprint (or Web Service) -> pick the repo. `render.yaml` sets the rest.
3. In Render -> Environment add: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (same values as step 2).
4. Open the https link Render gives you and sign in.

## 4. Keep it awake (free plan)
Add a free monitor (for example UptimeRobot) that opens `https://YOUR-APP.onrender.com/api/health` every 5 to 10 minutes.

## Commands
- `node server.js` runs it on your PC with data in the `data` folder (no Supabase settings = local mode).
- `node server.js --reset-admin` makes a new temporary admin password.
- `node server.js --migrate` copies local data to Supabase.