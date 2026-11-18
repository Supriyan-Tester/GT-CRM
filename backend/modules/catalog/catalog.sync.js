"use strict";
// Keeps the new products / vehicles / fuel / routes / customers tables (and the depot setting) in step with the
// old saved records (gm_kv). The app still reads and writes gm_kv exactly as before. This only COPIES, in the
// background, and never throws into the app: if the new tables are unreachable it logs one line and tries again.
const { buildCatalog, KEYS } = require("./catalog.projection");

const CHUNK = 200;

function createCatalogSync(opts) {
  const URL = String(opts.url || "").replace(/\/+$/, ""),
    KEY = opts.key || "",
    log = opts.log || console;
  const cache = {};
  const lastSent = new Map(); // "<table>:<id>" -> JSON last written, so unchanged rows are not sent again
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

  // Sends only rows that changed since last time, 200 at a time. If a batch is refused, tries its rows one by one
  // so a single bad row cannot hold back the others.
  async function bulk(table, conflict, rows, idOf, stat, rep) {
    const todo = [];
    for (const r of rows) {
      if (lastSent.get(table + ":" + idOf(r)) === JSON.stringify(r)) stat.unchanged++;
      else todo.push(r);
    }
    const prefer = "resolution=merge-duplicates,return=minimal";
    const mark = (r) => lastSent.set(table + ":" + idOf(r), JSON.stringify(r));
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      try {
        await rest("POST", `${table}?on_conflict=${conflict}`, chunk, prefer);
        chunk.forEach(mark);
        stat.sent += chunk.length;
      } catch (_) {
        for (const r of chunk) {
          try {
            await rest("POST", `${table}?on_conflict=${conflict}`, [r], prefer);
            mark(r);
            stat.sent++;
          } catch (e) {
            stat.failed++;
            if (rep.errors.length < 30) rep.errors.push(`${table} ${idOf(r)}: ${e.message}`);
          }
        }
      }
    }
  }

  // Items that disappeared from the old lists are marked removed, never erased.
  async function markRemoved(table, col, sourceSet, listPresent, rep, extraBody) {
    if (!listPresent) return 0;
    const have = await getAll(table, col, `${col}=not.is.null&removed_at=is.null`);
    const gone = have.map((x) => x[col]).filter((id) => !sourceSet.has(id));
    if (gone.length > 2 && gone.length > have.length / 2) {
      rep.warnings.push(`${gone.length} of ${have.length} in ${table} look removed at once, so nothing was marked (the saved list may be incomplete)`);
      return 0;
    }
    let n = 0;
    for (const id of gone) {
      try {
        await rest("PATCH", `${table}?${col}=eq.${encodeURIComponent(id)}&removed_at=is.null`, Object.assign({ is_active: false, removed_at: new Date().toISOString() }, extraBody), "return=minimal");
        // forget what we last sent, so if it comes back it is written again
        for (const k of [...lastSent.keys()]) if (k.startsWith(table + ":") && k.endsWith(":" + id)) lastSent.delete(k);
        n++;
      } catch (e) {
        rep.errors.push(`Marking ${table} ${id} removed: ${e.message}`);
      }
    }
    return n;
  }

  const blank = () => ({ sent: 0, unchanged: 0, failed: 0 });

  async function run(o) {
    const checkOnly = !!(o && o.checkOnly);
    const proj = buildCatalog(cache);
    const rep = {
      products: blank(), vehicles: blank(), fuel: blank(), routes: blank(), customers: blank(),
      depot: false, removed: { products: 0, vehicles: 0, routes: 0, customers: 0, fuel: 0 },
      warnings: proj.warnings.slice(), errors: [],
      planned: { products: proj.products.length, vehicles: proj.vehicles.length, fuel: proj.fuel.length, routes: proj.routes.length, customers: proj.customers.length },
    };
    if (checkOnly) return rep;
    const sourceOf = (k) => proj.sourceIds[k];

    // routes first (customers point at them), then vehicles (fuel points at them)
    await bulk("routes", "legacy_id", proj.routes, (r) => r.legacy_id, rep.routes, rep);
    await bulk("vehicles", "legacy_id", proj.vehicles, (r) => r.legacy_id, rep.vehicles, rep);
    let routeMap = new Map(),
      vehMap = new Map();
    try {
      (await getAll("routes", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => routeMap.set(x.legacy_id, x.id));
      (await getAll("vehicles", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => vehMap.set(x.legacy_id, x.id));
    } catch (e) {
      rep.errors.push("Reading routes/vehicles: " + e.message);
      return rep;
    }

    const fuelRows = [];
    for (const f of proj.fuel) {
      const vid = vehMap.get(f.vehicle_legacy_id);
      if (!vid) {
        rep.warnings.push(`Fuel entry ${f.legacy_id}: vehicle ${f.vehicle_legacy_id} is not in the new table, skipped`);
        continue;
      }
      const row = Object.assign({}, f, { vehicle_id: vid });
      delete row.vehicle_legacy_id;
      fuelRows.push(row);
    }
    await bulk("vehicle_fuel_logs", "legacy_id", fuelRows, (r) => r.legacy_id, rep.fuel, rep);
    await bulk("products", "legacy_id", proj.products, (r) => r.legacy_id, rep.products, rep);

    // who pinned a shop: only if that name is an employee id we already copied
    let empMap = new Map();
    if (proj.customers.some((c) => c.pin_by_legacy_id)) {
      try {
        (await getAll("employees", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => empMap.set(x.legacy_id, x.id));
      } catch (_) {
        /* employees not copied yet: pins are saved without "pinned by" */
      }
    }
    const custRows = proj.customers.map((c) => {
      const row = Object.assign({}, c, { route_id: c.route_legacy_id ? routeMap.get(c.route_legacy_id) || null : null, pin_saved_by: c.pin_by_legacy_id ? empMap.get(c.pin_by_legacy_id) || null : null });
      delete row.route_legacy_id;
      delete row.pin_by_legacy_id;
      return row;
    });
    await bulk("customers", "customer_code", custRows, (r) => r.customer_code, rep.customers, rep);

    if (proj.depot) {
      const j = JSON.stringify(proj.depot);
      if (lastSent.get("depot") !== j) {
        try {
          await rest("PATCH", "system_settings?id=eq.1", proj.depot, "return=minimal");
          lastSent.set("depot", j);
          rep.depot = true;
        } catch (e) {
          rep.errors.push("Depot: " + e.message);
        }
      }
    }

    try {
      rep.removed.products = await markRemoved("products", "legacy_id", sourceOf("products"), proj.present.gm_admin_products_v1, rep);
      rep.removed.vehicles = await markRemoved("vehicles", "legacy_id", sourceOf("vehicles"), proj.present.gm_admin_vehicles_v1, rep);
      rep.removed.routes = await markRemoved("routes", "legacy_id", sourceOf("routes"), proj.present.routes, rep);
      rep.removed.customers = await markRemoved("customers", "customer_code", sourceOf("customers"), proj.present.customers, rep);
      // fuel entries deleted in the app are deleted here too (they are plain log lines)
      if (proj.present.gm_admin_vfuel_v1) {
        const keep = new Set(proj.fuel.map((f) => f.legacy_id));
        const have = (await getAll("vehicle_fuel_logs", "legacy_id", "legacy_id=not.is.null")).map((x) => x.legacy_id);
        const del = have.filter((id) => !keep.has(id));
        if (del.length > 2 && del.length > have.length / 2) rep.warnings.push(`${del.length} of ${have.length} fuel entries look deleted at once, so nothing was removed`);
        else
          for (const id of del) {
            await rest("DELETE", `vehicle_fuel_logs?legacy_id=eq.${encodeURIComponent(id)}`, null, "return=minimal");
            lastSent.delete("vehicle_fuel_logs:" + id);
            rep.removed.fuel++;
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
      const sent = ["products", "vehicles", "fuel", "routes", "customers"].reduce((n, k) => n + rep[k].sent, 0);
      const removed = Object.values(rep.removed).reduce((a, b) => a + b, 0);
      if (sent || removed || rep.errors.length || rep.warnings.length)
        log.log(`Catalog sync: ${sent} rows written` + (removed ? `, ${removed} removed/marked` : "") + (rep.warnings.length ? `, ${rep.warnings.length} warning(s)` : "") + (rep.errors.length ? `, ${rep.errors.length} error(s)` : ""));
      rep.errors.slice(0, 5).forEach((e) => log.error("Catalog sync error:", e));
      return rep;
    } catch (err) {
      log.error("Catalog sync failed (the app is not affected):", err.message);
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
module.exports = { createCatalogSync };
