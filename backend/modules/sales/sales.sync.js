"use strict";
// Keeps the new sales_orders / sales_order_items / sales_shop_visits / product_returns tables in step with the
// old saved records (gm_kv). The app still reads and writes gm_kv exactly as before. This only COPIES, in the
// background, and never throws into the app: if the new tables are unreachable it logs one line and tries again.
// Needs employees, customers and products to be copied first (they are matched by their old codes).
const { buildSales, KEYS } = require("./sales.projection");

const CHUNK = 100;
const q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';

function createSalesSync(opts) {
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

  async function run(o) {
    const checkOnly = !!(o && o.checkOnly);
    const proj = buildSales(cache);
    const rep = {
      orders: blank(), items: blank(), visits: blank(), returns: blank(), returnItems: blank(),
      removed: { drafts: 0 },
      warnings: proj.warnings.slice(), errors: [],
      planned: { orders: proj.orders.length, items: proj.orders.reduce((n, x) => n + x.items.length, 0), visits: proj.visits.length, returns: proj.returns.length },
    };
    if (checkOnly) {
      // also say how many could not be matched, without writing anything
      try {
        const m = await maps(rep, proj);
        countUnmatched(proj, m, rep);
      } catch (e) {
        rep.errors.push("Reading employees/customers/products: " + e.message);
      }
      return rep;
    }
    let m;
    try {
      m = await maps(rep, proj);
    } catch (e) {
      rep.errors.push("Reading employees/customers/products: " + e.message);
      return rep;
    }
    const skipped = new Set();

    // ---------- orders ----------
    const orderRows = [];
    for (const od of proj.orders) {
      const cust = m.cust.get(od.customer_code),
        emp = m.emp.get(od.rep_legacy_id);
      if (!cust) {
        rep.warnings.push(`Order ${od.order_no}: shop ${od.customer_code || "(none)"} is not in the new customers table, skipped`);
        skipped.add(od.order_no);
        continue;
      }
      if (!emp) {
        rep.warnings.push(`Order ${od.order_no}: salesperson ${od.rep_legacy_id || "(none)"} is not in the new employees table, skipped`);
        skipped.add(od.order_no);
        continue;
      }
      const key = od.order_no;
      const sig = J([od.row, od.items, cust, emp, m.emp.get(od.delivery_legacy_id) || null]);
      if (lastSent.get("order:" + key) === sig) {
        rep.orders.unchanged++;
        continue;
      }
      orderRows.push({
        sig,
        od,
        row: Object.assign({}, od.row, {
          customer_id: cust,
          sales_employee_id: emp,
          assigned_delivery_employee_id: od.delivery_legacy_id ? m.emp.get(od.delivery_legacy_id) || null : null,
        }),
      });
    }
    const savedOrders = await upsert("sales_orders", "order_no", orderRows.map((x) => x.row), (r) => r.order_no, rep.orders, rep);
    const okNo = new Set(savedOrders.map((r) => r.order_no));

    // ids of all orders now in the new table (items, visits, returns, "replaces" all need them)
    let orderMap = new Map();
    try {
      (await getAll("sales_orders", "id,order_no,customer_id")).forEach((x) => orderMap.set(x.order_no, x));
    } catch (e) {
      rep.errors.push("Reading sales_orders: " + e.message);
      return rep;
    }

    // lines: for each order that changed, replace its lines (an edited draft may have fewer lines than before)
    const changed = orderRows.filter((x) => okNo.has(x.row.order_no) && orderMap.has(x.row.order_no));
    const lineFail = new Set();
    for (let i = 0; i < changed.length; i += CHUNK) {
      const part = changed.slice(i, i + CHUNK);
      const ids = part.map((x) => orderMap.get(x.row.order_no).id);
      try {
        await rest("DELETE", `sales_order_items?order_id=in.(${ids.join(",")})`, null, "return=minimal");
      } catch (e) {
        rep.errors.push("Clearing old lines: " + e.message);
        part.forEach((x) => lineFail.add(x.row.order_no));
        continue;
      }
      const lines = [];
      for (const x of part) {
        const oid = orderMap.get(x.row.order_no).id;
        for (const it of x.od.items) {
          const pid = m.prod.get(it.product_legacy_id);
          if (!pid) {
            rep.warnings.push(`Order ${x.row.order_no}: product ${it.product_legacy_id} is not in the new products table, that line was left out`);
            continue;
          }
          const row = Object.assign({}, it, { order_id: oid, product_id: pid });
          delete row.product_legacy_id;
          lines.push({ no: x.row.order_no, row });
        }
      }
      for (let j = 0; j < lines.length; j += CHUNK) {
        const ch = lines.slice(j, j + CHUNK);
        const prefer = "resolution=merge-duplicates,return=minimal";
        try {
          await rest("POST", "sales_order_items?on_conflict=order_id,product_id", ch.map((l) => l.row), prefer);
          rep.items.sent += ch.length;
        } catch (_) {
          for (const l of ch) {
            try {
              await rest("POST", "sales_order_items?on_conflict=order_id,product_id", [l.row], prefer);
              rep.items.sent++;
            } catch (e) {
              rep.items.failed++;
              lineFail.add(l.no);
              if (rep.errors.length < 30) rep.errors.push(`sales_order_items ${l.no}: ${e.message}`);
            }
          }
        }
      }
    }
    for (const x of changed) if (!lineFail.has(x.row.order_no)) lastSent.set("order:" + x.row.order_no, x.sig);

    // "replaces" (a corrected order that replaces a cancelled one) points at another order
    for (const x of changed) {
      if (!x.od.replaces_no) continue;
      const target = orderMap.get(x.od.replaces_no);
      if (!target) continue;
      try {
        await rest("PATCH", `sales_orders?order_no=eq.${encodeURIComponent(x.row.order_no)}`, { replaces_order_id: target.id }, "return=minimal");
      } catch (e) {
        rep.errors.push(`Order ${x.row.order_no} replaces: ${e.message}`);
      }
    }

    // ---------- shop visits ----------
    const visitRows = [];
    let visitSkipped = 0;
    for (const v of proj.visits) {
      const cust = m.cust.get(v.customer_code),
        emp = m.emp.get(v.rep_legacy_id);
      if (!cust || !emp) {
        visitSkipped++;
        continue;
      }
      const ord = v.order_no && orderMap.get(v.order_no) ? orderMap.get(v.order_no).id : null;
      const key = emp + "|" + cust + "|" + v.row.visit_date;
      const row = Object.assign({}, v.row, { sales_employee_id: emp, customer_id: cust, order_id: ord });
      const sig = J(row);
      if (lastSent.get("visit:" + key) === sig) {
        rep.visits.unchanged++;
        continue;
      }
      visitRows.push({ key, sig, row });
    }
    if (visitSkipped) rep.warnings.push(`${visitSkipped} shop visit(s) could not be matched to a shop or salesperson in the new tables, skipped`);
    const savedVisits = await upsert("sales_shop_visits", "sales_employee_id,customer_id,visit_date", visitRows.map((x) => x.row), (r) => r.visit_date + " " + r.customer_id, rep.visits, rep);
    const okVisit = new Set(savedVisits);
    visitRows.forEach((x) => okVisit.has(x.row) && lastSent.set("visit:" + x.key, x.sig));

    // ---------- returns ----------
    const retRows = [];
    for (const r of proj.returns) {
      const ord = orderMap.get(r.order_no),
        emp = m.emp.get(r.worker_legacy_id);
      if (!ord) {
        rep.warnings.push(`Return ${r.return_code}: order ${r.order_no || "(none)"} is not in the new orders table, skipped`);
        continue;
      }
      if (!emp) {
        rep.warnings.push(`Return ${r.return_code}: employee ${r.worker_legacy_id || "(none)"} is not in the new employees table, skipped`);
        continue;
      }
      const sig = J([r.row, r.items, ord.id, emp]);
      if (lastSent.get("return:" + r.return_code) === sig) {
        rep.returns.unchanged++;
        continue;
      }
      retRows.push({ sig, r, row: Object.assign({}, r.row, { order_id: ord.id, customer_id: ord.customer_id, recorded_by_employee_id: emp }) });
    }
    const savedRet = await upsert("product_returns", "return_code", retRows.map((x) => x.row), (r) => r.return_code, rep.returns, rep);
    const okRet = new Set(savedRet.map((x) => x.return_code));
    let retMap = new Map();
    if (retRows.length) {
      try {
        (await getAll("product_returns", "id,return_code")).forEach((x) => retMap.set(x.return_code, x.id));
      } catch (e) {
        rep.errors.push("Reading product_returns: " + e.message);
        return rep;
      }
    }
    for (const x of retRows) {
      if (!okRet.has(x.row.return_code) || !retMap.has(x.row.return_code)) continue;
      const rid = retMap.get(x.row.return_code);
      const lines = [];
      for (const it of x.r.items) {
        const pid = m.prod.get(it.product_legacy_id);
        if (!pid) {
          rep.warnings.push(`Return ${x.row.return_code}: product ${it.product_legacy_id} is not in the new products table, that line was left out`);
          continue;
        }
        const row = Object.assign({}, it, { return_id: rid, product_id: pid });
        delete row.product_legacy_id;
        lines.push(row);
      }
      let bad = false;
      if (lines.length) {
        try {
          await rest("POST", "product_return_items?on_conflict=return_id,product_id", lines, "resolution=merge-duplicates,return=minimal");
          rep.returnItems.sent += lines.length;
        } catch (e) {
          bad = true;
          rep.returnItems.failed += lines.length;
          if (rep.errors.length < 30) rep.errors.push(`product_return_items ${x.row.return_code}: ${e.message}`);
        }
      }
      if (!bad) lastSent.set("return:" + x.row.return_code, x.sig);
    }

    // ---------- drafts that were deleted in the app ----------
    try {
      if (proj.present.gm_sales_orders_v1) {
        const have = (await getAll("sales_orders", "order_no", "status=eq.draft")).map((x) => x.order_no);
        const gone = have.filter((no) => !proj.orderNos.has(no));
        if (gone.length > 2 && gone.length > have.length / 2) rep.warnings.push(`${gone.length} of ${have.length} draft orders look deleted at once, so nothing was removed`);
        else
          for (const no of gone) {
            await rest("DELETE", `sales_orders?order_no=eq.${encodeURIComponent(no)}&status=eq.draft`, null, "return=minimal");
            lastSent.delete("order:" + no);
            rep.removed.drafts++;
          }
      }
    } catch (e) {
      rep.errors.push("Checking for removed drafts: " + e.message);
    }
    return rep;
  }

  async function maps(rep, proj) {
    const emp = new Map(),
      cust = new Map(),
      prod = new Map();
    (await getAll("employees", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => emp.set(x.legacy_id, x.id));
    (await getAll("customers", "id,customer_code")).forEach((x) => cust.set(x.customer_code, x.id));
    (await getAll("products", "id,legacy_id", "legacy_id=not.is.null")).forEach((x) => prod.set(x.legacy_id, x.id));
    return { emp, cust, prod };
  }
  function countUnmatched(proj, m, rep) {
    const bad = (a, f) => a.filter(f).length;
    const o = bad(proj.orders, (x) => !m.cust.get(x.customer_code) || !m.emp.get(x.rep_legacy_id));
    const v = bad(proj.visits, (x) => !m.cust.get(x.customer_code) || !m.emp.get(x.rep_legacy_id));
    if (o) rep.warnings.push(`${o} order(s) cannot be matched to a shop or salesperson in the new tables`);
    if (v) rep.warnings.push(`${v} shop visit(s) cannot be matched to a shop or salesperson in the new tables`);
    const lines = proj.orders.reduce((n, x) => n + x.items.filter((i) => !m.prod.get(i.product_legacy_id)).length, 0);
    if (lines) rep.warnings.push(`${lines} order line(s) point at products that are not in the new products table`);
  }

  async function runSafely() {
    if (running) {
      again = true;
      return null;
    }
    running = true;
    try {
      const rep = await run();
      const sent = rep.orders.sent + rep.items.sent + rep.visits.sent + rep.returns.sent + rep.returnItems.sent;
      if (sent || rep.errors.length || rep.warnings.length)
        log.log(`Sales sync: ${sent} rows written` + (rep.warnings.length ? `, ${rep.warnings.length} warning(s)` : "") + (rep.errors.length ? `, ${rep.errors.length} error(s)` : ""));
      rep.errors.slice(0, 5).forEach((e) => log.error("Sales sync error:", e));
      return rep;
    } catch (err) {
      log.error("Sales sync failed (the app is not affected):", err.message);
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
module.exports = { createSalesSync };
