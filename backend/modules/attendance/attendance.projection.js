"use strict";
// Turns the old saved records (gm_kv) for attendance (each employee's own record + the office's corrections),
// leaves and admin notifications into rows for the new tables. Pure functions: no database, no network.
const KEYS = ["gm_admin_attedit_v1", "gm_admin_workers_v1", "gm_admin_notifs_v1"];
const PREFIX = "gm_crm_data_v5__";
const wanted = (key) => KEYS.includes(key) || String(key).startsWith(PREFIX);

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
const isDate = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-30
};
const p2 = (n) => String(n).padStart(2, "0");
const iso = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const goodCoord = (lat, lng) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
// "09:05 AM" / "9:05" / "-"  ->  timestamp on that India date
function stamp(date, t) {
  const m = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(t || ""));
  if (!m) return null;
  let h = +m[1];
  if (m[3]) {
    h = h % 12;
    if (/p/i.test(m[3])) h += 12;
  }
  if (h > 23 || +m[2] > 59) return null;
  return `${date}T${p2(h)}:${m[2]}:00+05:30`;
}
const STATUS = ["present", "late", "half_day", "absent"];

function buildAttendance(kv) {
  const warnings = [];
  const out = { attendance: [], leaves: [], notifications: [], warnings, leaveIds: new Set(), present: {} };
  KEYS.forEach((k) => (out.present[k] = kv[k] !== undefined && kv[k] !== null));

  const editsRoot = parse(kv.gm_admin_attedit_v1);
  const edits = editsRoot && typeof editsRoot === "object" && editsRoot.edits && typeof editsRoot.edits === "object" ? editsRoot.edits : {};
  const seen = new Set();
  let leaveMarked = 0;
  const entry = (emp, date, b, e) => {
    const k = emp + "|" + date;
    if (seen.has(k)) return;
    seen.add(k);
    let status = e ? str(e.status) : str(b && b.status);
    let note = e ? str(e.remarks) : "";
    if (e && !STATUS.includes(status)) {
      // office marked the day as leave / day off / none: it is not a working day
      leaveMarked++;
      note = (note ? note + " - " : "") + "Marked as " + (status || "none") + " by office";
      status = "absent";
    } else if (!STATUS.includes(status)) status = "present";
    const inT = e ? e.inTime : b && b.inTime,
      outT = e ? e.outTime : b && b.outTime;
    let sk = b && b.startKm != null && b.startKm !== "" ? Math.max(0, Math.round(num(b.startKm, NaN))) : null,
      ek = b && b.endKm != null && b.endKm !== "" ? Math.max(0, Math.round(num(b.endKm, NaN))) : null;
    if (!Number.isFinite(sk)) sk = null;
    if (!Number.isFinite(ek)) ek = null;
    if (sk != null && ek != null && ek < sk) {
      warnings.push(`Attendance ${emp} ${date}: end km (${ek}) is less than start km (${sk}), end km left blank`);
      ek = null;
    }
    out.attendance.push({
      emp_legacy_id: emp,
      vehicle_label: str((e && e.vehicle) || (b && b.vehicle)),
      row: {
        attendance_date: date,
        status,
        punch_in_at: stamp(date, inT),
        punch_out_at: stamp(date, outT),
        start_km: sk,
        end_km: ek,
        driven_km: Math.max(0, Math.round(num(e ? e.km : b && b.km))),
        is_closed_by_office: !!(e || (b && b.closedByOffice)),
        office_edit_note: note,
        extra: { legacy: b || null, edit: e || null },
      },
    });
  };

  for (const key of Object.keys(kv)) {
    if (!String(key).startsWith(PREFIX)) continue;
    const emp = key.slice(PREFIX.length);
    const rec = parse(kv[key]);
    if (!emp || !rec || typeof rec !== "object") continue;
    const log = rec.attendanceLog && typeof rec.attendanceLog === "object" ? rec.attendanceLog : {};
    for (const mk of Object.keys(log)) {
      const month = log[mk];
      if (!/^\d{4}-\d{2}$/.test(mk) || !month || typeof month !== "object") continue;
      for (const dk of Object.keys(month)) {
        const b = month[dk];
        if (!b || typeof b !== "object") continue;
        const date = mk + "-" + p2(+dk);
        if (!isDate(date)) {
          warnings.push(`Attendance ${emp}: "${mk}/${dk}" is not a real date, skipped`);
          continue;
        }
        entry(emp, date, b, (edits[emp] || {})[date] || null);
      }
    }
  }
  // corrections for days the employee has no record of at all
  for (const emp of Object.keys(edits)) {
    const days = edits[emp];
    if (!days || typeof days !== "object") continue;
    for (const date of Object.keys(days)) {
      if (!isDate(date) || !days[date] || typeof days[date] !== "object") continue;
      entry(emp, date, null, days[date]);
    }
  }
  if (leaveMarked) warnings.push(`${leaveMarked} day(s) the office marked as leave/day off are saved as "absent" with a note (the new table has no leave status per day)`);

  // ---------- leaves ----------
  const wd = parse(kv.gm_admin_workers_v1);
  out.leavesPresent = !!(wd && Array.isArray(wd.leaves));
  if (wd && Array.isArray(wd.leaves)) {
    const seenL = new Set();
    wd.leaves.forEach((l, i) => {
      if (!l || typeof l !== "object") return;
      const id = str(l.id) || `leave:${str(l.workerId)}:${str(l.from)}:${i}`;
      out.leaveIds.add(id);
      if (seenL.has(id)) return void warnings.push(`Leave ${id} appears twice, the second one was skipped`);
      seenL.add(id);
      if (!str(l.workerId) || !isDate(str(l.from)) || !isDate(str(l.to)) || str(l.to) < str(l.from))
        return void warnings.push(`Leave ${id}: needs an employee and valid dates (last day not before first day), skipped`);
      out.leaves.push({
        emp_legacy_id: str(l.workerId),
        row: { legacy_id: id, start_date: str(l.from), end_date: str(l.to), reason: str(l.reason), status: "approved", extra: { legacy: l } },
      });
    });
  }

  // ---------- admin notifications ----------
  const nl = parse(kv.gm_admin_notifs_v1);
  if (Array.isArray(nl)) {
    const seenN = new Set();
    nl.forEach((n, i) => {
      if (!n || typeof n !== "object") return;
      const id = str(n.id);
      if (!id) return void warnings.push(`Notification #${i + 1}: no id, skipped`);
      if (seenN.has(id)) return;
      seenN.add(id);
      const loc = n.loc && typeof n.loc === "object" ? n.loc : null;
      const okLoc = loc && goodCoord(loc.lat, loc.lng);
      out.notifications.push({
        emp_legacy_id: str(n.wid) || null,
        row: {
          legacy_id: id,
          notification_type: str(n.type) || "info",
          title: str(n.title) || "(no title)",
          message: str(n.text),
          employee_name_snapshot: str(n.worker),
          lat: okLoc ? loc.lat : null,
          lng: okLoc ? loc.lng : null,
          accuracy_meters: okLoc ? Math.max(0, Math.round(num(loc.acc))) : null,
          is_read: !!n.read,
          created_at: iso(n.ts) || (isDate(str(n.date)) ? str(n.date) + "T00:00:00+05:30" : "2000-01-01T00:00:00Z"),
          extra: { legacy: n },
        },
      });
    });
  }
  return out;
}
module.exports = { buildAttendance, KEYS, PREFIX, wanted };
