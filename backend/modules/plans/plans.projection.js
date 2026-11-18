"use strict";
// Turns the old saved records (gm_kv) for delivery plans (inside gm_admin_v1) and pin tasks (gm_pintasks_v1)
// into rows for the new tables. Pure functions: no database, no network.
const KEYS = ["gm_admin_v1", "gm_pintasks_v1"];

const parse = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch (_) {
    return null;
  }
};
const str = (v) => (v == null ? "" : String(v).trim());
const num = (v, d = 0) => {
  const n = typeof v === "number" ? v : Number(String(v == null ? "" : v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : d;
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const iso = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

function buildPlans(kv) {
  const warnings = [];
  const out = { plans: [], pinTasks: [], warnings, planIds: new Set(), pinIds: new Set() };
  out.present = { plans: false, pins: false };

  const admin = parse(kv.gm_admin_v1);
  if (admin && typeof admin === "object" && admin.plans && typeof admin.plans === "object") {
    out.present.plans = true;
    const seen = new Set();
    for (const date of Object.keys(admin.plans)) {
      if (!isDate(date)) {
        warnings.push(`Plans under "${date}": not a date, skipped`);
        continue;
      }
      const raw = admin.plans[date];
      const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
      list.forEach((p, i) => {
        if (!p || typeof p !== "object") return;
        let id = str(p.id) || (p.builtAt ? "P" + p.builtAt : date + ":" + i);
        if (seen.has(id)) id = date + ":" + id;
        if (seen.has(id)) return void warnings.push(`Plan ${id} appears twice, the second one was skipped`);
        seen.add(id);
        out.planIds.add(id);
        const stops = [];
        (Array.isArray(p.stops) ? p.stops : []).forEach((s, k) => {
          if (!s || typeof s !== "object") return;
          const code = str(s.code);
          if (!code) return void warnings.push(`Plan ${id}: stop ${k + 1} has no shop code, left out`);
          stops.push({
            customer_code: code,
            row: {
              stop_sequence: k + 1,
              invoice_no: str(s.inv),
              invoice_amount: Math.max(0, num(s.amount)),
              delivery_status: "pending",
              note: str(s.note),
              extra: { legacy: s },
            },
          });
        });
        out.plans.push({
          legacy_id: id,
          driver_legacy_id: str(p.workerId),
          helper_legacy_ids: (Array.isArray(p.helpers) ? p.helpers : []).map(str).filter(Boolean),
          vehicle_legacy_id: str(p.vehicleId),
          route_legacy_id: str(p.route),
          stops,
          row: {
            legacy_id: id,
            plan_date: date,
            status: p.status === "cancelled" ? "cancelled" : "active",
            notes: str(p.notes),
            created_at: iso(p.createdAt) || date + "T00:00:00+05:30",
            extra: { legacy: p },
          },
        });
      });
    }
  }

  const pt = parse(kv.gm_pintasks_v1);
  if (pt && typeof pt === "object" && pt.tasks && typeof pt.tasks === "object") {
    out.present.pins = true;
    for (const tid of Object.keys(pt.tasks)) {
      const t = pt.tasks[tid];
      if (!t || typeof t !== "object") continue;
      const code = str(t.code);
      if (!code) {
        warnings.push(`Pin task ${tid}: no shop code, skipped`);
        continue;
      }
      const to = (Array.isArray(t.to) ? t.to : t.to == null || t.to === "" ? [] : [t.to]).map(str).filter(Boolean);
      const targets = to.length ? to : [null];
      for (const emp of targets) {
        const lid = tid + ":" + (emp || "all");
        out.pinIds.add(lid);
        out.pinTasks.push({
          legacy_id: lid,
          customer_code: code,
          emp_legacy_id: emp,
          row: { legacy_id: lid, created_at: iso(t.ts) || "2000-01-01T00:00:00Z", extra: { legacy: t } },
        });
      }
    }
  }
  return out;
}
module.exports = { buildPlans, KEYS };
