"use strict";
// Turns the old saved records (gm_kv) for sales orders, shop visits and returns into rows for the new GT-CRM
// tables. Pure functions: no database, no network. Ids of customers / products / employees are matched later
// (by the sync) using their old codes, so this only carries the old codes.

const KEYS = [
  "gm_sales_orders_v1", // array of orders
  "gm_sales_days_v1", // { <rep id>: { <yyyy-mm-dd>: { route, visits: { <shop code>: {...} } } } }
  "gm_inventory_returns_v1", // array of returns (created when a delivery comes back with returned goods)
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
const istDay = (ms) => new Date(Number(ms) + 5.5 * 3600e3).toISOString().slice(0, 10);
const goodCoord = (lat, lng) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const COMPANY_STATUS = ["not_applicable", "awaiting_dispatch", "dispatched", "acknowledged", "replacement_received", "credit_note_issued", "refund_received", "rejected_by_company"];
const RETURN_STATUS = ["pending_inspection", "company_return_pending", "reconciliation_complete", "closed"];

function buildSales(kv) {
  const warnings = [];
  const out = { orders: [], visits: [], returns: [], warnings };
  const present = {};
  KEYS.forEach((k) => (present[k] = kv[k] !== undefined && kv[k] !== null));
  out.present = present;
  out.orderNos = new Set();

  // ---------- orders ----------
  const list = parse(kv.gm_sales_orders_v1);
  if (Array.isArray(list)) {
    const seenNo = new Set(),
      seenKey = new Set();
    list.forEach((o, i) => {
      if (!o || typeof o !== "object") return;
      const no = str(o.id);
      if (no) out.orderNos.add(no);
      if (!no) return void warnings.push(`Order #${i + 1}: no order number, not copied`);
      if (seenNo.has(no)) return void warnings.push(`Order ${no} appears twice, the second one was skipped`);
      seenNo.add(no);
      const st = o.stages && typeof o.stages === "object" ? o.stages : {};
      const da = o.deliveryAssignment && typeof o.deliveryAssignment === "object" ? o.deliveryAssignment : null;
      let status = str(o.status);
      if (status === "cancelled") status = "cancelled";
      else if (status === "draft") status = "draft";
      else if (st.delivered) status = "delivered";
      else if (st.out) status = "out_for_delivery";
      else if (da) status = "processing";
      else status = "placed";
      const dr = o.deliveryResult && Array.isArray(o.deliveryResult.items) ? o.deliveryResult.items : [];
      const resById = new Map(dr.map((x) => [str(x.id), x]));
      const seenProd = new Set();
      const items = [];
      (Array.isArray(o.items) ? o.items : []).forEach((it) => {
        if (!it || typeof it !== "object") return;
        const pid = str(it.id);
        const qty = num(it.qty);
        if (!pid || qty <= 0) return void warnings.push(`Order ${no}: a line without a product or quantity was left out`);
        if (seenProd.has(pid)) return void warnings.push(`Order ${no}: product ${pid} appears twice, the second line was left out`);
        seenProd.add(pid);
        const res = resById.get(pid);
        const price = Math.max(0, num(it.price));
        items.push({
          product_legacy_id: pid,
          product_name_snapshot: str(it.name) || pid,
          unit_snapshot: str(it.unit) || "pcs",
          unit_price: price,
          tax_percent: Math.min(999, Math.max(0, num(it.tax))),
          ordered_qty: qty,
          delivered_qty: res ? Math.max(0, num(res.deliveredQty)) : null,
          returned_qty: res ? Math.max(0, num(res.returnedQty)) : 0,
          return_reason: res ? str(res.returnReason) : "",
          line_total: Math.max(0, num(it.amount, price * qty)),
          extra: { legacy: it },
        });
      });
      const loc = o.loc && typeof o.loc === "object" ? o.loc : {};
      const okLoc = goodCoord(loc.lat, loc.lng);
      let key = str(o.k) || null;
      if (key) {
        if (seenKey.has(key)) key = null;
        else seenKey.add(key);
      }
      const subtotal = Math.max(0, num(o.subtotal));
      const discount = Math.max(0, num(o.discount));
      const date = isDate(str(o.date)) ? str(o.date) : o.t ? istDay(o.t) : null;
      if (!date) return void warnings.push(`Order ${no}: no date, not copied`);
      const ah = o.afterHours && typeof o.afterHours === "object" ? o.afterHours : null;
      out.orders.push({
        order_no: no,
        request_key: key,
        customer_code: str(o.code),
        rep_legacy_id: str(o.rep),
        delivery_legacy_id: da ? str(da.workerId) || null : null,
        replaces_no: str(o.replaces) || null,
        row: {
          order_no: no,
          request_key: key,
          order_date: date,
          status,
          subtotal,
          discount,
          total_amount: Math.max(0, num(o.total, subtotal - discount)),
          notes: str(o.notes),
          is_after_hours: !!ah,
          after_hours_reason: ah ? str(ah.reason) : "",
          order_lat: okLoc ? loc.lat : null,
          order_lng: okLoc ? loc.lng : null,
          distance_from_shop_meters: okLoc && Number.isFinite(Number(loc.dist)) ? Math.round(Number(loc.dist)) : null,
          assigned_at: da ? iso(da.assignedAt) : null,
          delivered_at: st.delivered ? iso(st.delivered.at) : null,
          cancelled_at: status === "cancelled" ? iso(o.cancelAt) : null,
          cancel_reason: status === "cancelled" ? str(o.cancelReason) : "",
          created_at: iso(o.t) || date + "T00:00:00+05:30",
          extra: { legacy: o },
        },
        items,
      });
    });
  }

  // ---------- shop visits ----------
  const days = parse(kv.gm_sales_days_v1);
  if (days && typeof days === "object" && !Array.isArray(days)) {
    const seen = new Set();
    for (const rep of Object.keys(days)) {
      const byDate = days[rep];
      if (!byDate || typeof byDate !== "object") continue;
      for (const date of Object.keys(byDate)) {
        const day = byDate[date];
        if (!isDate(date) || !day || typeof day !== "object" || !day.visits || typeof day.visits !== "object") continue;
        for (const code of Object.keys(day.visits)) {
          const v = day.visits[code];
          if (!v || typeof v !== "object") continue;
          const k = rep + "|" + code + "|" + date;
          if (seen.has(k)) continue;
          seen.add(k);
          const okLoc = goodCoord(v.lat, v.lng);
          out.visits.push({
            rep_legacy_id: rep,
            customer_code: code,
            order_no: str(v.o) || null,
            row: {
              visit_date: date,
              visit_status: v.s === "no_order" ? "no_order" : "ordered",
              no_order_reason: v.s === "no_order" ? str(v.reason) : "",
              note: str(v.note),
              lat: okLoc ? v.lat : null,
              lng: okLoc ? v.lng : null,
              distance_meters: okLoc && Number.isFinite(Number(v.dist)) ? Math.round(Number(v.dist)) : null,
              visited_at: iso(v.t) || date + "T00:00:00+05:30",
              extra: { legacy: v },
            },
          });
        }
      }
    }
  }

  // ---------- returns ----------
  const rets = parse(kv.gm_inventory_returns_v1);
  if (Array.isArray(rets)) {
    const seen = new Set();
    rets.forEach((r, i) => {
      if (!r || typeof r !== "object") return;
      const code = str(r.id);
      if (!code) return void warnings.push(`Return #${i + 1}: no id, not copied`);
      if (seen.has(code)) return void warnings.push(`Return ${code} appears twice, the second one was skipped`);
      seen.add(code);
      const seenProd = new Set();
      const items = [];
      (Array.isArray(r.items) ? r.items : []).forEach((it) => {
        if (!it || typeof it !== "object") return;
        const pid = str(it.productId);
        const q = num(it.returnedQty);
        if (!pid || q <= 0 || seenProd.has(pid)) return void warnings.push(`Return ${code}: a line without a product/quantity (or repeated) was left out`);
        seenProd.add(pid);
        items.push({
          product_legacy_id: pid,
          returned_qty: q,
          return_reason: str(it.returnReason),
          restock_qty: Math.max(0, num(it.restockQty)),
          company_qty: Math.max(0, num(it.companyQty)),
          damaged_qty: Math.max(0, num(it.damagedQty)),
          supplier_name: str(it.companyName),
          company_status: COMPANY_STATUS.includes(it.companyStatus) ? it.companyStatus : "not_applicable",
          dispatch_ref: str(it.dispatchRef),
          company_response_ref: str(it.companyResponseRef) || str(it.acknowledgementRef),
          company_amount: it.companyAmount == null || it.companyAmount === "" ? null : Math.max(0, num(it.companyAmount)),
          replacement_received_qty: it.replacementReceivedQty == null ? null : Math.max(0, num(it.replacementReceivedQty)),
          replacement_accepted_qty: it.replacementStockAcceptedQty == null ? null : Math.max(0, num(it.replacementStockAcceptedQty)),
          inspection_note: str(it.inspectionNote),
          extra: { legacy: it },
        });
      });
      out.returns.push({
        return_code: code,
        order_no: str(r.orderId),
        worker_legacy_id: str(r.workerId),
        items,
        row: {
          return_code: code,
          status: RETURN_STATUS.includes(r.status) ? r.status : "pending_inspection",
          note: str(r.note),
          inspected_at: iso(r.inspectedAt),
          created_at: iso(r.createdAt) || "2000-01-01T00:00:00Z",
          extra: { legacy: r },
        },
      });
    });
  }
  return out;
}

module.exports = { buildSales, KEYS };
