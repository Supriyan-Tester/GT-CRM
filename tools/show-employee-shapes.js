"use strict";
// Prints the STRUCTURE of the employee-related records in the new Supabase gm_kv: field names, types and counts.
// It never prints names, phone numbers, emails, passwords or any other personal value.
// Only short fixed-choice fields (role, status, type, active ...) show their values, because those are not personal.
// Run:  node tools/show-employee-shapes.js
try {
  process.loadEnvFile();
} catch (_) {}

const KEYS = [
  "gm_admin_account_v1",
  "gm_admin_workers_v1",
  "gm_admin_wprofile_v1",
  "gm_admin_access_v1",
  "gm_admin_attedit_v1",
  "gm_admin_ledger_v1",
  "gm_admin_consent_v1",
  "gm_sales_attendance_v1",
  "_auth",
  "_sessions",
];
const SHOW_VALUE = /^(role|status|type|active|must|kind|portal|state|relieved|perms|leaveType|entryType)$/i;
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
function describe(v, pad) {
  const t = typeOf(v);
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
        if (tt === "array" || (tt === "object" && Object.keys(x).length)) describe(x, pad + "    ");
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
  const { data, error } = await db.from("gm_kv").select("key,v").in("key", KEYS);
  if (error) {
    console.error("Stopped:", error.message || JSON.stringify(error));
    process.exit(1);
  }
  const byKey = new Map(data.map((r) => [r.key, r.v]));
  const all = (await db.from("gm_kv").select("key")).data || [];
  console.log("All key names in gm_kv (" + all.length + "), ids shortened:");
  console.log("  " + all.map((r) => r.key.replace(/(__|_)[A-Za-z]?\d{2,}.*$/, "$1<id>")).filter((x, i, a) => a.indexOf(x) === i).sort().join("\n  "));
  for (const k of KEYS) {
    console.log("\n=== " + k + " ===");
    if (!byKey.has(k)) {
      console.log("  (not present)");
      continue;
    }
    let v;
    try {
      v = JSON.parse(byKey.get(k));
    } catch (e) {
      console.log("  (not JSON)");
      continue;
    }
    describe(v, "  ");
  }
})();
