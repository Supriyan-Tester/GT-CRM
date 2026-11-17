"use strict";
// Turns the old saved records (gm_kv) into rows for the new employees / employee_advances tables.
// Pure functions: no database, no network. Reads only what it is given.

const NO_PASSWORD = "!no-password"; // the table needs a value; real logins still use the saved hash in gm_kv until we switch reads

const KEYS = [
  "gm_admin_account_v1", // admin logins (Super Admin / Admin)
  "gm_admin_workers_v1", // { workers: [...], leaves: [...] }
  "gm_admin_wprofile_v1", // { <workerId>: profile }
  "gm_admin_ledger_v1", // advances
  "gm_admin_consent_v1", // { <id>: { at, v } } privacy consent
  "_auth", // { admins: { id: {h,last,must} }, workers: { id: {h} } }
];

const parse = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch (_) {
    return null;
  }
};
const digits10 = (p) => {
  const d = String(p == null ? "" : p).replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : null;
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s.slice(0, 10)));
const day = (s) => String(s).slice(0, 10);
const iso = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
};
const str = (v) => (v == null ? "" : String(v).trim());
const upper = (v) => str(v).toUpperCase();

function roleOf(raw, fallback) {
  const t = str(raw).toLowerCase();
  if (t.includes("super")) return "super_admin";
  if (t === "admin" || t.includes("admin")) return "admin";
  if (t.includes("sales")) return "sales";
  if (t.includes("bill")) return "billing";
  if (t.includes("invent") || t.includes("godown")) return "inventory";
  if (t.includes("help")) return "helper";
  if (t.includes("load")) return "loading";
  if (t.includes("deliver") || t.includes("driver")) return "delivery";
  return fallback;
}

function clean(o) {
  Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
  return o;
}

// kv: { key: rawValue } for any of KEYS (missing keys are fine). Returns { employees, advances, warnings }.
function buildProjection(kv) {
  const warnings = [];
  const accounts = Array.isArray(parse(kv.gm_admin_account_v1)) ? parse(kv.gm_admin_account_v1) : [];
  const wrap = parse(kv.gm_admin_workers_v1) || {};
  const workers = Array.isArray(wrap.workers) ? wrap.workers : [];
  const profiles = parse(kv.gm_admin_wprofile_v1) || {};
  const ledger = Array.isArray(parse(kv.gm_admin_ledger_v1)) ? parse(kv.gm_admin_ledger_v1) : [];
  const consent = parse(kv.gm_admin_consent_v1) || {};
  const auth = parse(kv._auth) || {};
  const authAdmins = auth.admins || {},
    authWorkers = auth.workers || {};

  const employees = [];
  const seenPhone = new Map(),
    seenCode = new Map(),
    seenId = new Set();

  function accept(row, who) {
    if (seenId.has(row.legacy_id)) {
      warnings.push(`${who}: id ${row.legacy_id} appears twice, the second one was skipped`);
      return;
    }
    if (seenPhone.has(row.phone)) {
      warnings.push(`${who}: phone is the same as ${seenPhone.get(row.phone)}, skipped (each phone can belong to one person)`);
      return;
    }
    if (seenCode.has(row.employee_code)) {
      warnings.push(`${who}: employee code ${row.employee_code} is the same as ${seenCode.get(row.employee_code)}, skipped`);
      return;
    }
    seenId.add(row.legacy_id);
    seenPhone.set(row.phone, row.legacy_id);
    seenCode.set(row.employee_code, row.legacy_id);
    employees.push(row);
  }

  function common(id, authRec) {
    const out = {};
    out.password_hash = authRec && typeof authRec.h === "string" && authRec.h ? authRec.h : NO_PASSWORD;
    if (out.password_hash === NO_PASSWORD) warnings.push(`${id}: no saved password hash`);
    out.must_change_password = !!(authRec && authRec.must);
    const last = authRec && authRec.last ? iso(authRec.last) : null;
    if (last) out.last_login_at = last;
    const c = consent[id];
    const cAt = c && c.at ? iso(c.at) : null;
    if (cAt) out.privacy_consent_at = cAt;
    return out;
  }

  for (const a of accounts) {
    if (!a || a.id == null) continue;
    const id = str(a.id);
    const phone = digits10(a.phone);
    if (!phone) {
      warnings.push(`Admin ${id}: phone is missing or not 10 digits, not copied`);
      continue;
    }
    const row = clean({
      legacy_id: id,
      employee_code: upper(id),
      full_name: str(a.name) || "Admin",
      phone,
      email: str(a.email),
      role: roleOf(a.role, "admin"),
      module_permissions: Array.isArray(a.perms) ? a.perms.map(String) : [],
      is_active: a.status !== "inactive",
      ...common(id, authAdmins[id]),
      extra: { legacy: { account: a } },
    });
    accept(row, `Admin ${id}`);
  }

  for (const w of workers) {
    if (!w || w.id == null) continue;
    const id = str(w.id);
    const p = profiles[id] && typeof profiles[id] === "object" ? profiles[id] : {};
    const phone = digits10(w.phone);
    if (!phone) {
      warnings.push(`Worker ${id}: phone is missing or not 10 digits, not copied`);
      continue;
    }
    const joined = isDate(p.joinDate) ? day(p.joinDate) : isDate(w.created) ? day(w.created) : undefined;
    const sal = p.salary === "" || p.salary == null ? NaN : Number(p.salary);
    const row = clean({
      legacy_id: id,
      employee_code: upper(p.empCode || id),
      full_name: str(w.name) || "Employee",
      phone,
      alt_phone: digits10(p.altPhone) || "",
      emergency_name: str(p.emName),
      emergency_phone: digits10(p.emPhone) || digits10(w.emergency) || "",
      gender: str(p.gender),
      date_of_birth: isDate(p.dob) ? day(p.dob) : undefined,
      address: str(p.address),
      id_number: str(p.idNumber),
      monthly_salary: Number.isFinite(sal) && sal >= 0 ? sal : undefined,
      notes: str(p.notes),
      role: roleOf(p.role, "delivery"),
      is_active: w.active !== false,
      joined_date: joined,
      relieved_date: isDate(p.relieved) ? day(p.relieved) : undefined,
      ...common(id, authWorkers[id]),
      extra: { legacy: { worker: w, profile: profiles[id] || null } },
    });
    accept(row, `Worker ${id}`);
  }

  // Advances / repayments (the old "ledger")
  const advances = [];
  const seenAdv = new Set();
  ledger.forEach((e, i) => {
    if (!e || typeof e !== "object") return;
    const empLegacy = str(e.workerId);
    const amount = Math.abs(Number(e.amount));
    if (!empLegacy || !Number.isFinite(amount) || amount <= 0) {
      warnings.push(`Ledger entry ${e && e.id != null ? e.id : "#" + (i + 1)}: missing person or amount, not copied`);
      return;
    }
    let lid = e.id != null && str(e.id) ? str(e.id) : `${empLegacy}:${str(e.date)}:${amount}:${i}`;
    if (seenAdv.has(lid)) lid = lid + ":" + i;
    seenAdv.add(lid);
    const t = str(e.type).toLowerCase();
    advances.push(
      clean({
        legacy_id: lid,
        employee_legacy_id: empLegacy,
        entry_type: t === "repayment" ? "repayment" : t === "deduction" ? "deduction" : "advance",
        amount,
        entry_date: isDate(e.date) ? day(e.date) : undefined,
        note: [str(e.title), str(e.note)].filter(Boolean).join(" - "),
      }),
    );
  });

  const sourceIds = new Set([...accounts, ...workers].filter((x) => x && x.id != null).map((x) => str(x.id)));
  const advanceSourceIds = new Set(advances.map((a) => a.legacy_id));
  return { employees, advances, warnings, sourceIds, advanceSourceIds };
}

module.exports = { buildProjection, KEYS, NO_PASSWORD, roleOf, digits10 };
