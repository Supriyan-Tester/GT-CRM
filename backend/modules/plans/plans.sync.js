"use strict";
// Keeps the new delivery_plans / delivery_plan_stops / customer_pin_tasks tables in step with the
// old saved records (gm_kv) The app still reads and writes gm_kv exactly as before. This only COPIES, in the
// background, and never throws into the app: if the new tables are unreachable it logs one line and tries again.
// Needs employees, customers, routes and vehicles to be copied first (they are matched by their old codes).
const { buildPlans, KEYS } = require("./plans.projection");

const CHUNK = 100;
const q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';

function createPlansSync(opts) {
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
      if (r && KEYS.includes(r.key)) {
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

  async function maps() {
    const emp = new Map(), cust = new Map(), veh = new Map(), route = new Map();
    (await getAll("employees", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => emp.set(x.legacy_id, x.id));
    (await getAll("customers", "id,customer_code,lat")).forEach((x) => cust.set(x.customer_code, { id: x.id, pinned: x.lat != null }));
    (await getAll("vehicles", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => veh.set(x.legacy_id, x.id));
    (await getAll("routes", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => route.set(x.legacy_id, x.id));
    return { emp, cust, veh, route };
  }

  async function run(o) {
    const checkOnly = !!(o && o.checkOnly);
    const proj = buildPlans(cache);
    const rep = {
      plans: blank(), stops: blank(), pins: blank(),
      removed: { plans: 0, pins: 0 },
      warnings: proj.warnings.slice(), errors: [],
      planned: { plans: proj.plans.length, stops: proj.plans.reduce((n, p) => n + p.stops.length, 0), pins: proj.pinTasks.length },
    };
    let m;
    try {
      m = await maps();
    } catch (e) {
      rep.errors.push("Reading employees/customers/routes/vehicles: " + e.message);
      return rep;
    }

    // ---------- plans ----------
    const planRows = [];
    for (const p of proj.plans) {
      const drv = m.emp.get(p.driver_legacy_id);
      if (!drv) {
        rep.warnings.push(`Plan ${p.legacy_id} (${p.row.plan_date}): driver ${p.driver_legacy_id || "(none)"} is not in the new employees table, skipped`);
        continue;
      }
      const helpers = [];
      for (const h of p.helper_legacy_ids) {
        if (m.emp.get(h)) helpers.push(m.emp.get(h));
        else rep.warnings.push(`Plan ${p.legacy_id}: helper ${h} is not in the new employees table, left out`);
      }
      const row = Object.assign({}, p.row, {
        driver_employee_id: drv,
        helper_employee_ids: helpers,
        vehicle_id: p.vehicle_legacy_id ? m.veh.get(p.vehicle_legacy_id) || null : null,
        route_id: p.route_legacy_id ? m.route.get(p.route_legacy_id) || null : null,
      });
      const stops = [];
      for (const s of p.stops) {
        const c = m.cust.get(s.customer_code);
        if (!c) {
          rep.warnings.push(`Plan ${p.legacy_id}: shop ${s.customer_code} is not in the new customers table, that stop was left out`);
          continue;
        }
        stops.push(Object.assign({}, s.row, { customer_id: c.id }));
      }
      const sig = J([row, stops]);
      if (lastSent.get("plan:" + p.legacy_id) === sig) {
        rep.plans.unchanged++;
        continue;
      }
      planRows.push({ sig, row, stops });
    }
    if (checkOnly) {
      rep.planned.unmatchedPlans = proj.plans.length - planRows.length - rep.plans.unchanged;
      const bad = proj.pinTasks.filter((t) => !m.cust.get(t.customer_code) || (t.emp_legacy_id && !m.emp.get(t.emp_legacy_id))).length;
      if (bad) rep.warnings.push(`${bad} pin task(s) cannot be matched to a shop or employee in the new tables`);
      return rep;
    }
    const saved = await upsert("delivery_plans", "legacy_id", planRows.map((x) => x.row), (r) => r.legacy_id, rep.plans, rep);
    const okId = new Set(saved.map((r) => r.legacy_id));
    let idMap = new Map();
    try {
      (await getAll("delivery_plans", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => idMap.set(x.legacy_id, x.id));
    } catch (e) {
      rep.errors.push("Reading delivery_plans: " + e.message);
      return rep;
    }
    const changed = planRows.filter((x) => okId.has(x.row.legacy_id) && idMap.has(x.row.legacy_id));
    for (let i = 0; i < changed.length; i += 50) {
      const part = changed.slice(i, i + 50);
      const failed = new Set();
      try {
        await rest("DELETE", `delivery_plan_stops?plan_id=in.(${part.map((x) => idMap.get(x.row.legacy_id)).join(",")})`, null, "return=minimal");
      } catch (e) {
        rep.errors.push("Clearing old stops: " + e.message);
        continue;
      }
      const lines = [];
      for (const x of part) for (const s of x.stops) lines.push({ no: x.row.legacy_id, row: Object.assign({}, s, { plan_id: idMap.get(x.row.legacy_id) }) });
      for (let j = 0; j < lines.length; j += 200) {
        const ch = lines.slice(j, j + 200);
        try {
          await rest("POST", "delivery_plan_stops", ch.map((l) => l.row), "return=minimal");
          rep.stops.sent += ch.length;
        } catch (_) {
          for (const l of ch) {
            try {
              await rest("POST", "delivery_plan_stops", [l.row], "return=minimal");
              rep.stops.sent++;
            } catch (e) {
              rep.stops.failed++;
              failed.add(l.no);
              if (rep.errors.length < 30) rep.errors.push(`delivery_plan_stops ${l.no}: ${e.message}`);
            }
          }
        }
      }
      for (const x of part) if (!failed.has(x.row.legacy_id)) lastSent.set("plan:" + x.row.legacy_id, x.sig);
    }

    // ---------- pin tasks ----------
    const pinRows = [];
    for (const t of proj.pinTasks) {
      const c = m.cust.get(t.customer_code);
      if (!c) {
        rep.warnings.push(`Pin task ${t.legacy_id}: shop ${t.customer_code} is not in the new customers table, skipped`);
        continue;
      }
      let emp = null;
      if (t.emp_legacy_id) {
        emp = m.emp.get(t.emp_legacy_id);
        if (!emp) {
          rep.warnings.push(`Pin task ${t.legacy_id}: employee ${t.emp_legacy_id} is not in the new employees table, skipped`);
          continue;
        }
      }
      // done once the shop has a map pin
      const row = Object.assign({}, t.row, { customer_id: c.id, assigned_to_employee_id: emp, status: c.pinned ? "completed" : "pending" });
      const sig = J(row);
      if (lastSent.get("pin:" + t.legacy_id) === sig) {
        rep.pins.unchanged++;
        continue;
      }
      pinRows.push({ sig, row });
    }
    const savedPins = await upsert("customer_pin_tasks", "legacy_id", pinRows.map((x) => x.row), (r) => r.legacy_id, rep.pins, rep);
    const okPin = new Set(savedPins);
    pinRows.forEach((x) => okPin.has(x.row) && lastSent.set("pin:" + x.row.legacy_id, x.sig));

    // ---------- things deleted in the app: marked, never erased ----------
    try {
      if (proj.present.plans) {
        const have = await getAll("delivery_plans", "legacy_id", "legacy_id=not.is.null&status=neq.cancelled");
        const gone = have.map((x) => x.legacy_id).filter((id) => !proj.planIds.has(id));
        if (gone.length > 2 && gone.length > have.length / 2) rep.warnings.push(`${gone.length} of ${have.length} plans look removed at once, so nothing was changed`);
        else
          for (const id of gone) {
            await rest("PATCH", `delivery_plans?legacy_id=eq.${encodeURIComponent(id)}`, { status: "cancelled" }, "return=minimal");
            lastSent.delete("plan:" + id);
            rep.removed.plans++;
          }
      }
      if (proj.present.pins) {
        const have = await getAll("customer_pin_tasks", "legacy_id", "legacy_id=not.is.null&status=eq.pending");
        const gone = have.map((x) => x.legacy_id).filter((id) => !proj.pinIds.has(id));
        if (gone.length > 2 && gone.length > have.length / 2) rep.warnings.push(`${gone.length} of ${have.length} pin tasks look removed at once, so nothing was changed`);
        else
          for (const id of gone) {
            await rest("PATCH", `customer_pin_tasks?legacy_id=eq.${encodeURIComponent(id)}`, { status: "completed", completed_at: new Date().toISOString() }, "return=minimal");
            lastSent.delete("pin:" + id);
            rep.removed.pins++;
          }
      }
    } catch (e) {
      rep.errors.push("Checking for removed items: " + e.message);
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
      const sent = rep.plans.sent + rep.stops.sent + rep.pins.sent;
      if (sent || rep.errors.length || rep.warnings.length)
        log.log(`Plans sync: ${sent} rows written` + (rep.warnings.length ? `, ${rep.warnings.length} warning(s)` : "") + (rep.errors.length ? `, ${rep.errors.length} error(s)` : ""));
      rep.errors.slice(0, 5).forEach((e) => log.error("Plans sync error:", e));
      return rep;
    } catch (err) {
      log.error("Plans sync failed (the app is not affected):", err.message);
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
module.exports = { createPlansSync };
