"use strict";
// Copies products, vehicles, fuel entries, routes, customers and the depot location from the saved records (gm_kv)
// into the new GT-CRM tables, with a plain report. Re-runnable.
//   node tools/sync-catalog.js --check   shows what WOULD be copied and any problems; changes nothing
//   node tools/sync-catalog.js           copies them
// Reads only the NEW Supabase in .env. Prints no names, phones or prices.
try {
  process.loadEnvFile();
} catch (_) {}
const { createCatalogSync } = require("../backend/modules/catalog/catalog.sync");
const { KEYS } = require("../backend/modules/catalog/catalog.projection");

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
  const sync = createCatalogSync({ url, key });
  sync.prime(rows);
  const rep = await sync.run({ checkOnly });
  const p = rep.planned;
  console.log(`\nTo copy: ${p.products} products, ${p.vehicles} vehicles, ${p.fuel} fuel entries, ${p.routes} routes, ${p.customers} customers`);
  if (!checkOnly) {
    for (const k of ["products", "vehicles", "fuel", "routes", "customers"]) console.log(`  ${k}: written ${rep[k].sent}, failed ${rep[k].failed}`);
    console.log(`  depot location updated: ${rep.depot ? "yes" : "no"}   marked removed: ${JSON.stringify(rep.removed)}`);
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
