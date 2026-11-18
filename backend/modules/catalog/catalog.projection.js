"use strict";
// Turns the old saved records (gm_kv) for products, vehicles, fuel logs, routes, customers and the depot
// into rows for the new GT-CRM tables. Pure functions: no database, no network.

const KEYS = [
  "gm_admin_products_v1", // array of products
  "gm_admin_vehicles_v1", // array of vehicles
  "gm_admin_vfuel_v1", // array of fuel fill-ups
  "gm_admin_v1", // { customers: [...], routes: [{id,name,codes:[customer codes]}], plans: {...} }
  "gm_depot_v1", // { name, address, lat, lng, radiusMeters }
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
const upper = (v) => str(v).toUpperCase();
const num = (v, d = 0) => {
  const n = typeof v === "number" ? v : Number(String(v == null ? "" : v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : d;
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s.slice(0, 10)));
const goodCoord = (lat, lng) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function buildCatalog(kv) {
  const warnings = [];
  const out = { products: [], vehicles: [], fuel: [], routes: [], customers: [], depot: null, warnings };
  const sourceIds = { products: new Set(), vehicles: new Set(), routes: new Set(), customers: new Set() };
  out.sourceIds = sourceIds;
  const present = {}; // which saved lists exist at all (so a missing list is never read as "everything deleted")
  KEYS.forEach((k) => (present[k] = kv[k] !== undefined && kv[k] !== null));
  out.present = present;

  // ---------- products ----------
  const prods = parse(kv.gm_admin_products_v1);
  if (Array.isArray(prods)) {
    const seenId = new Set(),
      seenCode = new Map(),
      seenCodeLower = new Set();
    let clamped = 0;
    prods.forEach((p, i) => {
      if (!p || typeof p !== "object") return;
      const code = str(p.code);
      const legacy = str(p.id) || (code ? "code:" + code : "");
      if (legacy) sourceIds.products.add(legacy);
      if (!code) {
        warnings.push(`Product #${i + 1} (${legacy || "no id"}): no product code, not copied`);
        return;
      }
      if (seenId.has(legacy)) return void warnings.push(`Product ${code}: id ${legacy} appears twice, the second one was skipped`);
      if (seenCode.has(code)) return void warnings.push(`Product code ${code} is used by two products (${seenCode.get(code)} and ${legacy}), the second was skipped`);
      if (seenCodeLower.has(code.toLowerCase())) warnings.push(`Product code ${code} differs from another only by capital letters`);
      seenId.add(legacy);
      seenCode.set(code, legacy);
      seenCodeLower.add(code.toLowerCase());
      const price = num(p.price),
        mrp = num(p.mrp),
        cost = num(p.cost),
        tax = num(p.tax);
      if (price < 0 || mrp < 0 || cost < 0 || tax < 0) clamped++;
      const ratio = Math.round(num(p.ratio));
      const open = num(p.openQty);
      out.products.push({
        legacy_id: legacy,
        product_code: code,
        product_name: str(p.name) || code,
        alias: str(p.alias),
        category: str(p.category),
        hsn_code: str(p.hsn),
        unit: str(p.unit) || "pcs",
        selling_price: Math.max(0, price),
        mrp: Math.max(0, mrp),
        cost_price: Math.max(0, cost),
        tax_percent: Math.min(999, Math.max(0, tax)),
        box_qty: ratio >= 2 ? ratio : null,
        track_stock: open > 0,
        stock_qty: open,
        is_active: p.active !== false,
        extra: { legacy: p },
        removed_at: null,
      });
    });
    if (clamped) warnings.push(`${clamped} product(s) had a negative price/cost/tax, saved as 0`);
  }

  // ---------- vehicles ----------
  const vehs = parse(kv.gm_admin_vehicles_v1);
  const vehLegacy = new Set();
  if (Array.isArray(vehs)) {
    const seenReg = new Set(),
      seenCode = new Set();
    vehs.forEach((v, i) => {
      if (!v || typeof v !== "object") return;
      const legacy = str(v.id) || str(v.code);
      if (legacy) sourceIds.vehicles.add(legacy);
      const reg = upper(v.number);
      if (!reg) return void warnings.push(`Vehicle #${i + 1} (${legacy || "no id"}): no registration number, not copied`);
      const code = upper(v.code || v.id) || "VEH-" + (i + 1);
      if (seenReg.has(reg)) return void warnings.push(`Vehicle ${reg}: registration number appears twice, the second one was skipped`);
      if (seenCode.has(code)) return void warnings.push(`Vehicle ${reg}: code ${code} is used twice, the second one was skipped`);
      seenReg.add(reg);
      seenCode.add(code);
      vehLegacy.add(legacy);
      out.vehicles.push({
        legacy_id: legacy,
        vehicle_code: code,
        registration_no: reg,
        vehicle_name: [str(v.type), str(v.vtype)].filter(Boolean).join(" - ") || reg,
        current_odometer: Math.max(0, Math.round(num(v.lastKm) || num(v.initKm))),
        is_active: v.active !== false && str(v.status).toLowerCase() !== "inactive",
        extra: { legacy: v },
        removed_at: null,
      });
    });
  }

  // ---------- fuel fill-ups ----------
  const fuel = parse(kv.gm_admin_vfuel_v1);
  if (Array.isArray(fuel)) {
    const seen = new Set();
    fuel.forEach((e, i) => {
      if (!e || typeof e !== "object") return;
      const vId = str(e.vehicleId);
      let lid = str(e.id) || `${vId}:${str(e.date)}:${num(e.odometer)}:${i}`;
      if (seen.has(lid)) lid += ":" + i;
      seen.add(lid);
      const litres = num(e.litres),
        total = num(e.total);
      if (!vId || litres <= 0 || total <= 0 || !isDate(e.date))
        return void warnings.push(`Fuel entry ${lid}: needs a vehicle, a date, litres and a total above 0, not copied`);
      out.fuel.push({
        legacy_id: lid,
        vehicle_legacy_id: vId,
        fill_date: str(e.date).slice(0, 10),
        liters: litres,
        total_cost: total,
        odometer_reading: Math.max(0, Math.round(num(e.odometer))),
        note: [str(e.station), str(e.notes)].filter(Boolean).join(" - "),
        extra: { legacy: e },
      });
    });
  }

  // ---------- routes + customers (both live in gm_admin_v1) ----------
  const admin = parse(kv.gm_admin_v1);
  const routeList = admin && Array.isArray(admin.routes) ? admin.routes : null;
  const custList = admin && Array.isArray(admin.customers) ? admin.customers : null;
  present.routes = !!routeList;
  present.customers = !!custList;
  const codeToRoute = new Map(); // customer code (lowercase) -> { route legacy id, position }
  if (routeList) {
    const seenName = new Set(),
      seenCode = new Set();
    routeList.forEach((r, i) => {
      if (!r || typeof r !== "object") return;
      const legacy = str(r.id) || (str(r.name) ? "name:" + str(r.name) : "");
      if (legacy) sourceIds.routes.add(legacy);
      const name = str(r.name);
      if (!name) return void warnings.push(`Route #${i + 1}: no name, not copied`);
      if (seenName.has(name.toLowerCase())) return void warnings.push(`Route "${name}" appears twice, the second one was skipped`);
      let code = upper(r.id) || "RT-" + String(i + 1).padStart(2, "0");
      if (seenCode.has(code)) code = code + "-" + (i + 1);
      seenName.add(name.toLowerCase());
      seenCode.add(code);
      out.routes.push({ legacy_id: legacy, route_code: code, route_name: name, is_active: true, extra: { legacy: r }, removed_at: null });
      (Array.isArray(r.codes) ? r.codes : []).forEach((c, j) => {
        const k = str(c).toLowerCase();
        if (k && !codeToRoute.has(k)) codeToRoute.set(k, { route: legacy, seq: j });
      });
    });
  }
  if (custList) {
    const seen = new Set();
    let badPin = 0;
    custList.forEach((c, i) => {
      if (!c || typeof c !== "object") return;
      const code = str(c.code);
      if (code) sourceIds.customers.add(code);
      if (!code) return void warnings.push(`Customer #${i + 1}: no code, not copied`);
      if (seen.has(code)) return void warnings.push(`Customer code ${code} appears twice, the second one was skipped`);
      seen.add(code);
      const lat = typeof c.lat === "number" ? c.lat : null,
        lng = typeof c.lng === "number" ? c.lng : null;
      const okPin = goodCoord(lat, lng);
      if ((lat !== null || lng !== null) && !okPin) badPin++;
      const rt = codeToRoute.get(code.toLowerCase());
      out.customers.push({
        customer_code: code,
        shop_name: str(c.name) || code,
        phone: str(c.phone),
        address: str(c.address),
        area: str(c.area),
        gstin: str(c.gstin),
        route_legacy_id: rt ? rt.route : null,
        route_sequence: rt ? rt.seq : 0,
        lat: okPin ? lat : null,
        lng: okPin ? lng : null,
        pin_by_legacy_id: str(c.pinBy) || null,
        is_active: c.active !== false,
        extra: { legacy: c },
        removed_at: null,
      });
    });
    if (badPin) warnings.push(`${badPin} customer(s) have a map pin that is not a valid location, saved without a pin`);
  }

  // ---------- depot ----------
  const d = parse(kv.gm_depot_v1);
  if (d && typeof d === "object" && goodCoord(d.lat, d.lng)) out.depot = { depot_lat: d.lat, depot_lng: d.lng, extra: { depot: d } };

  return out;
}

module.exports = { buildCatalog, KEYS };
