"use strict";
// Copies attendance (employee punches + office corrections), leaves and admin notifications from the saved records (gm_kv)
// into the new GT-CRM tables, with a plain report. Re-runnable.
//   node tools/sync-attendance.js --check   shows what WOULD be copied and any problems; changes nothing
//   node tools/sync-attendance.js           copies them
// Reads only the NEW Supabase in .env. Prints no names, phones or prices.
try {
  process.loadEnvFile();
} catch (_) {}
const { createAttendanceSync } = require("../backend/modules/attendance/attendance.sync");
const { KEYS, PREFIX } = require("../backend/modules/attendance/attendance.projection");

async function main() {
  const url = (process.env.SUPABASE_URL || "").trim(),
    key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env");
  const checkOnly = process.argv.includes("--check");
  const hdr = { apikey: key, Authorization: "Bearer " + key };
  const base = url.replace(/\/+$/, "") + "/rest/v1/gm_kv?select=key,v";
  const get = async (qs) => {
    const r = await fetch(base + qs, { headers: hdr });
    if (!r.ok) throw new Error(`Reading gm_kv: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.json();
  };
  const rows = [
    ...(await get("&key=in." + encodeURIComponent("(" + KEYS.map((k) => '"' + k + '"').join(",") + ")"))),
    ...(await get("&key=like." + encodeURIComponent(PREFIX + "*"))),
  ];
  console.log(`Found saved records: ${rows.length} (${rows.filter((x) => x.key.startsWith(PREFIX)).length} employee records)`);
  const sync = createAttendanceSync({ url, key });
  sync.prime(rows);
  const rep = await sync.run({ checkOnly });
  const p = rep.planned;
  console.log(`\nTo copy: ${p.attendance} attendance days, ${p.leaves} leaves, ${p.notifications} notifications`);
  if (!checkOnly) {
    for (const k of ["attendance", "leaves", "notifications"]) console.log(`  ${k}: written ${rep[k].sent}, failed ${rep[k].failed}`);
    console.log(`  leaves removed because deleted in the app: ${rep.removed.leaves}`);
  }
  if (rep.warnings.length) {
    console.log("\nThings to look at" + (rep.warnings.length > 25 ? " (first 25 of " + rep.warnings.length + ")" : "") + ":");
    rep.warnings.slice(0, 25).forEach((w) => console.log("  - " + w));
  }
  if (rep.errors.length) {
    console.log("\nErrors:");
    rep.errors.slice(0, 25).forEach((e) => console.log("  - " + e));
  }
  console.log(!rep.errors.length ? (checkOnly ? "\nCheck finished. Nothing was changed." : "\nDone.") : "\nNOT FINISHED CLEANLY.");
  process.exitCode = rep.errors.length ? 2 : 0;
}
main().catch((e) => {
  console.error("Stopped:", e.message);
  process.exitCode = 1;
});
