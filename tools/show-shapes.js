"use strict";
// Prints the STRUCTURE of saved records in the new Supabase gm_kv: field names, types and counts.
//   node tools/show-shapes.js                      -> products, vehicles, customers, orders, plans (the defaults below)
//   node tools/show-shapes.js gm_depot_v1 gm_x_*   -> any keys you name; a name ending in * means "every key starting with this"
// It never prints names, phone numbers, emails, passwords or any other personal value.
// Only short fixed-choice fields (role, status, type, active ...) show their values, because those are not personal.
// 
try {
  process.loadEnvFile();
} catch (_) {}

const DEFAULT_KEYS = [
  "gm_admin_products_v1",
  "gm_admin_vehicles_v1",
  "gm_admin_vfuel_v1",
  "gm_admin_vservice_v1",
  "gm_admin_vehsync_v1",
  "gm_admin_v1",
  "gm_depot_v1",
  "gm_pintasks_v1",
  "gm_sales_days_v1",
  "gm_sales_orders_v1",
  "gm_inventory_returns_v1",
  "gm_crm_data_v5__*",
  "gm_pins_v1_*",
];
const SHOW_VALUE = /^(role|status|type|active|must|kind|portal|state|relieved|perms|unit|tax|taxPct|category|source|method|mode|visit|result|stage|paid|payment|priority)$/i;
const SECRET = /^(h|hash|password|pass|pwd|token|sid|salt)$/i;
const idLike = (k) => /^[A-Za-z]{0,4}-?\d{1,6}$/.test(k) || /^[0-9a-f-]{16,}$/i.test(k);

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
// merge many objects into one "field -> {types, example values for safe fields}"
function fieldsOf(list) {
  const f = {};
  for (const o of list) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    for (const [k, v] of Object.entries(o)) {
      const e = (f[k] = f[k] || { n: 0, types: new Set(), vals: new Set() });
      e.n++;
      e.types.add(typeOf(v));
      if (SHOW_VALUE.test(k) && !SECRET.test(k)) {
        if (Array.isArray(v)) v.slice(0, 12).forEach((x) => e.vals.add(String(x).slice(0, 24)));
        else if (typeof v !== "object") e.vals.add(String(v).slice(0, 24));
      }
    }
  }
  return f;
}
function printFields(f, total, pad) {
  for (const k of Object.keys(f).sort()) {
    const e = f[k];
    const vals = e.vals.size ? "  values: " + [...e.vals].slice(0, 12).join(" | ") : "";
    console.log(`${pad}${k}  (${[...e.types].join("/")}, in ${e.n}/${total})${vals}`);
  }
}
function describe(v, pad, depth = 0) {
  const t = typeOf(v);
  if (depth > 4) return void console.log(`${pad}(deeper levels not shown)`);
  if (t === "array") {
    console.log(`${pad}array of ${v.length}`);
    const objs = v.filter((x) => x && typeof x === "object");
    if (objs.length) printFields(fieldsOf(objs), objs.length, pad + "  ");
    else if (v.length) console.log(`${pad}  items are ${typeOf(v[0])}`);
  } else if (t === "object") {
    const ks = Object.keys(v);
    const ids = ks.filter(idLike);
    if (ids.length && ids.length >= ks.length / 2) {
      console.log(`${pad}object with ${ks.length} entries keyed by id; each entry:`);
      const vals = ids.map((k) => v[k]);
      if (vals.every((x) => x && typeof x === "object" && !Array.isArray(x))) printFields(fieldsOf(vals), vals.length, pad + "  ");
      else console.log(`${pad}  values are ${typeOf(vals[0])}`);
    } else {
      console.log(`${pad}object with fields:`);
      for (const k of ks.sort()) {
        const x = v[k];
        const tt = typeOf(x);
        console.log(`${pad}  ${k}  (${tt}${tt === "array" ? ", " + x.length + " items" : ""})`);
        if (tt === "array" || (tt === "object" && Object.keys(x).length)) describe(x, pad + "    ", depth + 1);
      }
    }
  } else console.log(`${pad}${t}`);
}

(async () => {
  const url = (process.env.SUPABASE_URL || "").trim(),
    key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env");
    process.exit(1);
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_KEYS;
  const exact = wanted.filter((k) => !k.endsWith("*"));
  const prefixes = wanted.filter((k) => k.endsWith("*")).map((k) => k.slice(0, -1));
  const { data: allRows, error } = await db.from("gm_kv").select("key,v");
  if (error) {
    console.error("Stopped:", error.message || JSON.stringify(error));
    process.exit(1);
  }
  const all = allRows || [];
  console.log("Key names in gm_kv (" + all.length + "), ids shortened:");
  console.log("  " + all.map((r) => r.key.replace(/(__|_)[A-Za-z]?\d{2,}.*$/, "$1<id>")).filter((x, i, a) => a.indexOf(x) === i).sort().join("\n  "));
  const byKey = new Map(all.map((r) => [r.key, r.v]));
  const show = (title, v) => {
    console.log("\n=== " + title + " ===");
    describe(v, "  ");
  };
  const parseOrNull = (raw) => {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return undefined;
    }
  };
  for (const k of exact) {
    if (!byKey.has(k)) {
      console.log("\n=== " + k + " ===\n  (not present)");
      continue;
    }
    const v = parseOrNull(byKey.get(k));
    if (v === undefined) console.log("\n=== " + k + " ===\n  (not JSON)");
    else show(k, v);
  }
  for (const pre of prefixes) {
    const keys = all.map((r) => r.key).filter((k) => k.startsWith(pre));
    console.log("\n=== " + pre + "* (" + keys.length + " keys) ===");
    if (!keys.length) {
      console.log("  (none)");
      continue;
    }
    // describe the key with the most content, plus how the others differ in field names
    const parsed = keys.map((k) => parseOrNull(byKey.get(k))).filter((x) => x && typeof x === "object");
    parsed.sort((x, y) => JSON.stringify(y).length - JSON.stringify(x).length);
    if (parsed.length) {
      console.log("  (largest one shown)");
      describe(parsed[0], "  ");
    }
  }
})();
