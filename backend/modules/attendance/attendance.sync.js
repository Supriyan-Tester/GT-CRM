"use strict";
// Keeps the new employee_attendance / employee_leaves / notifications tables in step with the
// old saved records (gm_kv) The app still reads and writes gm_kv exactly as before. This only COPIES, in the
// background, and never throws into the app: if the new tables are unreachable it logs one line and tries again.
// Needs employees and vehicles to be copied first (they are matched by their old codes).
const { buildAttendance, wanted } = require("./attendance.projection");

const CHUNK = 100;
const q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';

function createAttendanceSync(opts) {
  const URL = String(opts.url || "").replace(/\/+$/, ""),
    KEY = opts.key || "",
    log = opts.log || console;
  const cache = {};
  const lastSent = new Map();
  let running = false,
    again = false,
    timer = null;

  async function rest(method, path, body, prefer) {
    const r = await fetch(URL + "/rest/v1/" + path, {
      method,
      headers: Object.assign(
        { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
        prefer ? { Prefer: prefer } : {},
      ),
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`${method} ${path.split("?")[0]} -> ${r.status} ${t.slice(0, 160)}`);
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }
  async function getAll(table, select, filter) {
    const out = [];
    for (let off = 0; ; off += 1000) {
      const part = await rest("GET", `${table}?select=${select}${filter ? "&" + filter : ""}&limit=1000&offset=${off}`);
      out.push(...part);
      if (part.length < 1000) break;
    }
    return out;
  }
  function take(rows) {
    let touched = false;
    for (const r of rows || []) {
      if (r && wanted(r.key)) {
        cache[r.key] = r.v === undefined ? null : r.v;
        touched = true;
      }
    }
    return touched;
  }

  // upsert in batches; if a batch is refused, try its rows one by one. Returns the rows that were saved.
  async function upsert(table, conflict, rows, idOf, stat, rep) {
    const saved = [];
    const prefer = "resolution=merge-duplicates,return=minimal";
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      try {
        await rest("POST", `${table}?on_conflict=${conflict}`, chunk, prefer);
        saved.push(...chunk);
        stat.sent += chunk.length;
      } catch (_) {
        for (const r of chunk) {
          try {
            await rest("POST", `${table}?on_conflict=${conflict}`, [r], prefer);
            saved.push(r);
            stat.sent++;
          } catch (e) {
            stat.failed++;
            if (rep.errors.length < 30) rep.errors.push(`${table} ${idOf(r)}: ${e.message}`);
          }
        }
      }
    }
    return saved;
  }

  const blank = () => ({ sent: 0, unchanged: 0, failed: 0 });
  const J = (x) => JSON.stringify(x);
  const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  async function run(o) {
    const checkOnly = !!(o && o.checkOnly);
    const proj = buildAttendance(cache);
    const rep = {
      attendance: blank(), leaves: blank(), notifications: blank(),
      removed: { leaves: 0 },
      warnings: proj.warnings.slice(), errors: [],
      planned: { attendance: proj.attendance.length, leaves: proj.leaves.length, notifications: proj.notifications.length },
    };
    let emp = new Map(),
      veh = [];
    try {
      (await getAll("employees", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => emp.set(x.legacy_id, x.id));
      veh = (await getAll("vehicles", "id,registration_no")).map((v) => ({ id: v.id, reg: norm(v.registration_no) })).filter((v) => v.reg);
    } catch (e) {
      rep.errors.push("Reading employees/vehicles: " + e.message);
      return rep;
    }
    const vehOf = (label) => {
      const l = norm(label);
      if (!l) return null;
      const f = veh.filter((v) => l.includes(v.reg));
      return f.length === 1 ? f[0].id : null;
    };
    const missing = new Set();
    const pending = [];
    // ---------- attendance ----------
    const attRows = [];
    for (const a of proj.attendance) {
      const id = emp.get(a.emp_legacy_id);
      if (!id) {
        missing.add(a.emp_legacy_id);
        continue;
      }
      const row = Object.assign({}, a.row, { employee_id: id, vehicle_id: vehOf(a.vehicle_label) });
      const key = id + "|" + row.attendance_date;
      const sig = J(row);
      if (lastSent.get("att:" + key) === sig) {
        rep.attendance.unchanged++;
        continue;
      }
      attRows.push({ key, sig, row });
    }
    // ---------- leaves ----------
    const leaveRows = [];
    for (const l of proj.leaves) {
      const id = emp.get(l.emp_legacy_id);
      if (!id) {
        missing.add(l.emp_legacy_id);
        continue;
      }
      const row = Object.assign({}, l.row, { employee_id: id });
      const sig = J(row);
      if (lastSent.get("leave:" + row.legacy_id) === sig) {
        rep.leaves.unchanged++;
        continue;
      }
      leaveRows.push({ sig, row });
    }
    // ---------- notifications ----------
    const notRows = [];
    for (const n of proj.notifications) {
      const id = n.emp_legacy_id ? emp.get(n.emp_legacy_id) || null : null;
      const row = Object.assign({}, n.row, { employee_id: id });
      const sig = J(row);
      if (lastSent.get("note:" + row.legacy_id) === sig) {
        rep.notifications.unchanged++;
        continue;
      }
      notRows.push({ sig, row });
    }
    if (missing.size) rep.warnings.push(`Employee(s) not in the new employees table, their attendance/leaves were skipped: ${[...missing].slice(0, 10).join(", ")}`);
    if (checkOnly) return rep;

    const sa = await upsert("employee_attendance", "employee_id,attendance_date", attRows.map((x) => x.row), (r) => r.attendance_date + " " + r.employee_id, rep.attendance, rep);
    const okA = new Set(sa);
    attRows.forEach((x) => okA.has(x.row) && lastSent.set("att:" + x.key, x.sig));
    const sl = await upsert("employee_leaves", "legacy_id", leaveRows.map((x) => x.row), (r) => r.legacy_id, rep.leaves, rep);
    const okL = new Set(sl);
    leaveRows.forEach((x) => okL.has(x.row) && lastSent.set("leave:" + x.row.legacy_id, x.sig));
    const sn = await upsert("notifications", "legacy_id", notRows.map((x) => x.row), (r) => r.legacy_id, rep.notifications, rep);
    const okN = new Set(sn);
    notRows.forEach((x) => okN.has(x.row) && lastSent.set("note:" + x.row.legacy_id, x.sig));

    // leaves removed in the app are removed here (attendance and notifications are history: never removed)
    try {
      if (proj.leavesPresent) {
        const have = (await getAll("employee_leaves", "legacy_id", "legacy_id=not.is.null")).map((x) => x.legacy_id);
        const gone = have.filter((id) => !proj.leaveIds.has(id));
        if (gone.length > 2 && gone.length > have.length / 2) rep.warnings.push(`${gone.length} of ${have.length} leaves look removed at once, so nothing was removed`);
        else
          for (const id of gone) {
            await rest("DELETE", `employee_leaves?legacy_id=eq.${encodeURIComponent(id)}`, null, "return=minimal");
            lastSent.delete("leave:" + id);
            rep.removed.leaves++;
          }
      }
    } catch (e) {
      rep.errors.push("Checking for removed leaves: " + e.message);
    }
    return rep;
  }

  async function runSafely() {
    if (running) {
      again = true;
      return null;
    }
    running = true;
    try {
      const rep = await run();
      const sent = rep.attendance.sent + rep.leaves.sent + rep.notifications.sent;
      if (sent || rep.errors.length || rep.warnings.length)
        log.log(`Attendance sync: ${sent} rows written` + (rep.warnings.length ? `, ${rep.warnings.length} warning(s)` : "") + (rep.errors.length ? `, ${rep.errors.length} error(s)` : ""));
      rep.errors.slice(0, 5).forEach((e) => log.error("Attendance sync error:", e));
      return rep;
    } catch (err) {
      log.error("Attendance sync failed (the app is not affected):", err.message);
      return null;
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule(3000);
      }
    }
  }
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(runSafely, ms == null ? 2500 : ms);
    if (timer.unref) timer.unref();
  }
  return {
    prime: (rows) => take(rows),
    onSave(rows) {
      if (take(rows)) schedule();
    },
    schedule,
    run,
    runSafely,
  };
}
module.exports = { createAttendanceSync };
