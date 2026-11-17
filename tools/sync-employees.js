"use strict";
// One-time (and re-runnable) copy of employees, logins' details and advances from the saved records (gm_kv)
// into the new employees / employee_advances tables, with a plain report.
//   node tools/sync-employees.js --check   shows what WOULD be copied and any problems; changes nothing
//   node tools/sync-employees.js           copies them
// Reads only the NEW Supabase in .env (SUPABASE_URL / SUPABASE_SERVICE_KEY). Prints no names, phones or hashes.
try {
  process.loadEnvFile();
} catch (_) {}
const { createEmployeeSync } = require("../backend/modules/employees/employees.sync");
const { KEYS } = require("../backend/modules/employees/employees.projection");

async function main() {
  const url = (process.env.SUPABASE_URL || "").trim(),
    key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env");
  const checkOnly = process.argv.includes("--check");
  const q = "(" + KEYS.map((k) => '"' + k + '"').join(",") + ")";
  const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/gm_kv?select=key,v&key=in.${encodeURIComponent(q)}`, {
    headers: { apikey: key, Authorization: "Bearer " + key },
  });
  if (!r.ok) throw new Error(`Reading gm_kv: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const rows = await r.json();
  console.log("Found saved records for:", rows.map((x) => x.key).join(", ") || "(none)");
  const sync = createEmployeeSync({ url, key });
  sync.prime(rows);
  const rep = await sync.run({ checkOnly });
  console.log(`\nPeople to copy: ${rep.planned.employees}   Advances to copy: ${rep.planned.advances}`);
  if (!checkOnly) {
    console.log(`Written: ${rep.employees.sent} people, ${rep.advances.sent} advances` +
      ` (failed: ${rep.employees.failed + rep.advances.failed}, marked removed: ${rep.deactivated}, advances removed: ${rep.advances.deleted})`);
  }
  if (rep.warnings.length) {
    console.log("\nThings to look at:");
    rep.warnings.forEach((w) => console.log("  - " + w));
  }
  if (rep.errors.length) {
    console.log("\nErrors:");
    rep.errors.forEach((e) => console.log("  - " + e));
  }
  console.log(!rep.errors.length ? (checkOnly ? "\nCheck finished. Nothing was changed." : "\nDone.") : "\nNOT FINISHED CLEANLY.");
  process.exitCode = rep.errors.length ? 2 : 0; // let the process end by itself (force-quitting can crash on Windows)
}
main().catch((e) => {
  console.error("Stopped:", e.message);
  process.exitCode = 1;
});