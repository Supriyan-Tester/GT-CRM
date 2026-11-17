"use strict";
// Keeps the new employees / employee_advances tables in step with the old saved records (gm_kv).
// The app still reads and writes gm_kv exactly as before. This only COPIES, in the background, and never throws
// into the app: if the new tables are unreachable it logs one line and tries again on the next save or start-up.
const { buildProjection, KEYS } = require("./employees.projection");

function createEmployeeSync(opts) {
  const URL = String(opts.url || "").replace(/\/+$/, ""),
    KEY = opts.key || "",
    log = opts.log || console;
  const cache = {}; // key -> raw saved value (only the keys we care about)
  const lastSent = new Map(); // "e:<id>" / "a:<id>" -> JSON last written, so unchanged rows are not sent again
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
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`${method} ${path.split("?")[0]} -> ${r.status} ${t.slice(0, 160)}`);
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  function take(rows) {
    let touched = false;
    for (const r of rows || []) {
      if (r && KEYS.includes(r.key)) {
        cache[r.key] = r.v === undefined ? null : r.v;
        touched = true;
      }
    }
    return touched;
  }

  async function existingMap() {
    const out = new Map();
    for (let off = 0; ; off += 1000) {
      const part = await rest("GET", `employees?select=id,legacy_id,removed_at&legacy_id=not.is.null&order=legacy_id&limit=1000&offset=${off}`);
      part.forEach((x) => out.set(x.legacy_id, x));
      if (part.length < 1000) break;
    }
    return out;
  }

  async function run(o) {
    const checkOnly = !!(o && o.checkOnly);
    const rep = { employees: { sent: 0, unchanged: 0, failed: 0 }, advances: { sent: 0, unchanged: 0, failed: 0, deleted: 0 }, deactivated: 0, warnings: [], errors: [] };
    const proj = buildProjection(cache);
    rep.warnings = proj.warnings.slice();
    rep.planned = { employees: proj.employees.length, advances: proj.advances.length };
    if (checkOnly) return rep;

    // people
    for (const e of proj.employees) {
      const body = Object.assign({}, e, { removed_at: null }); // a person who is back in the list is no longer "removed"
      const j = JSON.stringify(body);
      if (lastSent.get("e:" + e.legacy_id) === j) {
        rep.employees.unchanged++;
        continue;
      }
      try {
        await rest("POST", "employees?on_conflict=legacy_id", body, "resolution=merge-duplicates,return=minimal");
        lastSent.set("e:" + e.legacy_id, j);
        rep.employees.sent++;
      } catch (err) {
        rep.employees.failed++;
        rep.errors.push(`Person ${e.legacy_id}: ${err.message}`);
      }
    }

    let existing;
    try {
      existing = await existingMap();
    } catch (err) {
      rep.errors.push("Reading employees: " + err.message);
      return rep;
    }

    // people removed from the old lists: mark, never delete (advances and history may point at them)
    const haveLists = cache.gm_admin_account_v1 != null && cache.gm_admin_workers_v1 != null;
    if (haveLists) {
      const gone = [...existing.values()].filter((x) => !x.removed_at && !proj.sourceIds.has(x.legacy_id));
      if (gone.length > 2 && gone.length > existing.size / 2) {
        rep.warnings.push(`${gone.length} of ${existing.size} people look removed at once, so nothing was marked (the saved lists may be incomplete)`);
      } else {
        for (const g of gone) {
          try {
            await rest("PATCH", `employees?legacy_id=eq.${encodeURIComponent(g.legacy_id)}&removed_at=is.null`, { is_active: false, removed_at: new Date().toISOString() }, "return=minimal");
            lastSent.delete("e:" + g.legacy_id);
            rep.deactivated++;
          } catch (err) {
            rep.errors.push(`Marking ${g.legacy_id} removed: ${err.message}`);
          }
        }
      }
    }

    // advances
    if (cache.gm_admin_ledger_v1 != null) {
      for (const a of proj.advances) {
        const emp = existing.get(a.employee_legacy_id);
        if (!emp) {
          rep.warnings.push(`Advance ${a.legacy_id}: person ${a.employee_legacy_id} is not in the new table, skipped`);
          continue;
        }
        const body = Object.assign({}, a, { employee_id: emp.id });
        delete body.employee_legacy_id;
        const j = JSON.stringify(body);
        if (lastSent.get("a:" + a.legacy_id) === j) {
          rep.advances.unchanged++;
          continue;
        }
        try {
          await rest("POST", "employee_advances?on_conflict=legacy_id", body, "resolution=merge-duplicates,return=minimal");
          lastSent.set("a:" + a.legacy_id, j);
          rep.advances.sent++;
        } catch (err) {
          rep.advances.failed++;
          rep.errors.push(`Advance ${a.legacy_id}: ${err.message}`);
        }
      }
      try {
        const have = [];
        for (let off = 0; ; off += 1000) {
          const part = await rest("GET", `employee_advances?select=legacy_id&legacy_id=not.is.null&order=legacy_id&limit=1000&offset=${off}`);
          part.forEach((x) => have.push(x.legacy_id));
          if (part.length < 1000) break;
        }
        const del = have.filter((id) => !proj.advanceSourceIds.has(id));
        if (del.length > 2 && del.length > have.length / 2) {
          rep.warnings.push(`${del.length} of ${have.length} advances look deleted at once, so nothing was removed`);
        } else {
          for (const id of del) {
            await rest("DELETE", `employee_advances?legacy_id=eq.${encodeURIComponent(id)}`, null, "return=minimal");
            lastSent.delete("a:" + id);
            rep.advances.deleted++;
          }
        }
      } catch (err) {
        rep.errors.push("Removing deleted advances: " + err.message);
      }
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
      const changed = rep.employees.sent + rep.advances.sent + rep.advances.deleted + rep.deactivated;
      if (changed || rep.errors.length || rep.warnings.length)
        log.log(`Employees sync: ${rep.employees.sent} people, ${rep.advances.sent} advances written` +
          (rep.advances.deleted ? `, ${rep.advances.deleted} advances removed` : "") +
          (rep.deactivated ? `, ${rep.deactivated} marked removed` : "") +
          (rep.warnings.length ? `, ${rep.warnings.length} warning(s)` : "") +
          (rep.errors.length ? `, ${rep.errors.length} error(s)` : ""));
      rep.errors.slice(0, 5).forEach((e) => log.error("Employees sync error:", e));
      return rep;
    } catch (err) {
      log.error("Employees sync failed (the app is not affected):", err.message);
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
    timer = setTimeout(runSafely, ms == null ? 1500 : ms);
    if (timer.unref) timer.unref();
  }

  return {
    prime: (rows) => take(rows), // call with every row loaded at start-up
    onSave(rows) { // call with every batch of rows just saved
      if (take(rows)) schedule();
    },
    schedule,
    run,
    runSafely,
  };
}
module.exports = { createEmployeeSync };
