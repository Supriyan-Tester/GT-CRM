"use strict";
// Copies sales orders (with lines), shop visits and returns from the saved records (gm_kv)
// into the new GT-CRM tables, with a plain report. Re-runnable.
//   node tools/sync-sales.js --check   shows what WOULD be copied and any problems; changes nothing
//   node tools/sync-sales.js           copies them
// Reads only the NEW Supabase in .env. Prints no names, phones or prices.
try {
  process.loadEnvFile();
} catch (_) {}
const { createSalesSync } = require("../backend/modules/sales/sales.sync");
const { KEYS } = require("../backend/modules/sales/sales.projection");

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
  const sync = createSalesSync({ url, key });
  sync.prime(rows);
  const rep = await sync.run({ checkOnly });
  const p = rep.planned;
  console.log(`\nTo copy: ${p.orders} orders (${p.items} lines), ${p.visits} shop visits, ${p.returns} returns`);
  if (!checkOnly) {
    for (const k of ["orders", "items", "visits", "returns", "returnItems"]) console.log(`  ${k}: written ${rep[k].sent}, failed ${rep[k].failed}`);
    console.log(`  deleted drafts removed: ${rep.removed.drafts}`);
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
