// GM-CRM activity log: turns "what was saved before" and "what is being saved now" into short plain sentences.
// It only reads the two versions and returns a list of { type, text }. It never changes any data, and the server calls it inside try/catch,
// so a problem here can never stop a save.
'use strict';

const SHOW = 5;   // up to this many items are listed one by one; more than that become one summary line

function jp(s) { if (s && typeof s === 'object') return s; try { return JSON.parse(s); } catch (e) { return null; } }
function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? [x] : []); }
function same(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
function blank(v) { return v == null || v === '' || v === false; }
function mapBy(list, keyFn) { const m = new Map(); (Array.isArray(list) ? list : []).forEach(o => { if (!o || typeof o !== 'object') return; const k = keyFn(o); if (k != null && k !== '') m.set(String(k), o); }); return m; }
function listDiff(oldL, newL, keyFn) {
  const o = mapBy(oldL, keyFn), n = mapBy(newL, keyFn), added = [], removed = [], both = [];
  n.forEach((v, k) => { if (!o.has(k)) added.push(v); else both.push([o.get(k), v]); });
  o.forEach((v, k) => { if (!n.has(k)) removed.push(v); });
  return { added, removed, both };
}
function eg(items, label) { const f = items.slice(0, 3).map(label).join(', '); return f ? ' (for example ' + f + (items.length > 3 ? ', ...' : '') + ')' : ''; }
// "Customer added: X" for a few, or one line "Added 120 customers (for example ...)" for many.
function group(type, noun, verb, items, label, out) {
  if (!items.length) return;
  if (items.length <= SHOW) items.forEach(it => out.push({ type, text: cap(noun) + ' ' + verb + ': ' + label(it) }));
  else out.push({ type, text: cap(verb) + ' ' + items.length + ' ' + noun + 's' + eg(items, label) });
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// Changed items: [[old, new]] with a function that says which fields changed.
function changes(type, noun, pairs, fieldsFn, label, out) {
  const hit = [];
  pairs.forEach(([o, n]) => { const f = fieldsFn(o, n); if (f.length) hit.push({ n, f }); });
  if (!hit.length) return;
  if (hit.length <= SHOW) hit.forEach(h => out.push({ type, text: cap(noun) + ' ' + label(h.n) + ': ' + h.f.join(', ') + ' changed' }));
  else out.push({ type, text: 'Edited ' + hit.length + ' ' + noun + 's' + eg(hit.map(h => h.n), label) });
}
function fieldsChanged(o, n, spec) { const out = []; Object.keys(spec).forEach(k => { if (!same(o[k], n[k]) && !(blank(o[k]) && blank(n[k]))) out.push(spec[k]); }); return out; }

// ---------- customers, routes, daily plans (gm_admin_v1) ----------
const CUST = { name: 'name', area: 'area', phone: 'phone', phone2: 'second phone', address: 'address', gstin: 'GST number', mapLink: 'map link', regn: 'registration', inactive: 'status' };
function custLabel(c) { return (c.name || 'Unnamed') + ' (' + (c.code || '?') + ')'; }
function planLabel(p, date) { return (p.routeName || p.route || 'route') + ', ' + (p.worker || p.workerId || 'no employee') + (p.vehicle ? ', ' + p.vehicle : '') + ' on ' + date; }
function diffAdmin(oldV, newV) {
  const out = [], o = jp(oldV) || {}, n = jp(newV) || {};
  // customers
  const cd = listDiff(o.customers, n.customers, c => c.code);
  group('customer', 'customer', 'added', cd.added, custLabel, out);
  group('customer', 'customer', 'deleted', cd.removed, custLabel, out);
  const pins = [];
  changes('customer', 'customer', cd.both, (a, b) => {
    const f = fieldsChanged(a, b, CUST);
    if (!same(a.lat, b.lat) || !same(a.lng, b.lng)) { if (!blank(b.lat) && !blank(b.lng)) { if (b.pinBy && blank(a.lat)) pins.push(b); else f.push('map location'); } else f.push('map location removed'); }
    return f;
  }, custLabel, out);
  group('customer', 'shop location', 'saved', pins, p => custLabel(p) + (p.pinBy ? ' by ' + p.pinBy : ''), out);
  // routes
  const rd = listDiff(o.routes, n.routes, r => r.id);
  group('route', 'route', 'added', rd.added, r => r.name || r.id, out);
  group('route', 'route', 'deleted', rd.removed, r => r.name || r.id, out);
  changes('route', 'route', rd.both, (a, b) => {
    const f = []; if (a.name !== b.name) f.push('renamed from ' + a.name);
    const x = arr(a.codes).length, y = arr(b.codes).length; if (x !== y) f.push('shops ' + x + ' to ' + y); else if (!same(a.codes, b.codes)) f.push('shops changed');
    return f;
  }, r => r.name || r.id, out);
  // daily plans
  const dates = new Set(Object.keys(o.plans || {}).concat(Object.keys(n.plans || {})));
  const pAdd = [], pDel = [], pCh = [];
  dates.forEach(d => {
    const pd = listDiff(arr((o.plans || {})[d]), arr((n.plans || {})[d]), p => p.id);
    pd.added.forEach(p => pAdd.push([p, d])); pd.removed.forEach(p => pDel.push([p, d]));
    pd.both.forEach(([a, b]) => {
      const f = [];
      if (a.workerId !== b.workerId) f.push('employee ' + (a.worker || a.workerId || 'none') + ' to ' + (b.worker || b.workerId || 'none'));
      if (a.route !== b.route) f.push('route ' + (a.routeName || a.route) + ' to ' + (b.routeName || b.route));
      if (a.vehicleId !== b.vehicleId) f.push('vehicle ' + (a.vehicle || 'none') + ' to ' + (b.vehicle || 'none'));
      const x = arr(a.stops).length, y = arr(b.stops).length; if (x !== y) f.push('stops ' + x + ' to ' + y);
      if (f.length) pCh.push([b, d, f]);
    });
  });
  const pl = ([p, d]) => planLabel(p, d);
  if (pAdd.length <= SHOW) pAdd.forEach(x => out.push({ type: 'plan', text: 'Daily plan created: ' + pl(x) })); else out.push({ type: 'plan', text: 'Created ' + pAdd.length + ' daily plans' });
  if (pDel.length <= SHOW) pDel.forEach(x => out.push({ type: 'plan', text: 'Daily plan deleted: ' + pl(x) })); else out.push({ type: 'plan', text: 'Deleted ' + pDel.length + ' daily plans' });
  if (pCh.length <= SHOW) pCh.forEach(([p, d, f]) => out.push({ type: 'plan', text: 'Daily plan changed (' + planLabel(p, d) + '): ' + f.join(', ') })); else out.push({ type: 'plan', text: 'Changed ' + pCh.length + ' daily plans' });
  return out;
}

// ---------- employees (gm_admin_workers_v1) ----------
const WRK = { name: 'name', phone: 'phone', emergency: 'emergency phone' };
function wLabel(w) { return (w.name || 'Unnamed') + ' (' + (w.id || '?') + ')'; }
function diffWorkers(oldV, newV, incomingRaw) {
  const out = [], o = jp(oldV) || {}, n = jp(newV) || {}, inc = jp(incomingRaw) || {};
  const wd = listDiff(o.workers, n.workers, w => w.id);
  group('employee', 'employee', 'added', wd.added, wLabel, out);
  group('employee', 'employee', 'deleted', wd.removed, wLabel, out);
  wd.both.forEach(([a, b]) => {
    const f = fieldsChanged(a, b, WRK);
    if (a.active !== b.active) out.push({ type: 'employee', text: 'Employee ' + wLabel(b) + (b.active === false ? ' set inactive' : ' set active') });
    if (f.length) out.push({ type: 'employee', text: 'Employee ' + wLabel(b) + ': ' + f.join(', ') + ' changed' });
  });
  // The server never keeps passwords in the saved value; a password in what is being saved means one was set or reset.
  const added = new Set(wd.added.map(w => w.id));
  arr(inc.workers).forEach(w => { if (w && w.id && (w.password || w.pin)) out.push({ type: 'employee', dedupe: true, text: added.has(w.id) ? 'Login password set for new employee ' + wLabel(w) : 'Password set or reset for ' + wLabel(w) }); });
  const ld = listDiff(o.leaves, n.leaves, l => l.id || (l.workerId + '|' + l.from + '|' + l.to));
  const nm = id => { const w = arr(n.workers).concat(arr(o.workers)).find(x => x && x.id === id); return w ? w.name : id; };
  const lv = l => nm(l.workerId) + ' (' + (l.from || '?') + (l.to && l.to !== l.from ? ' to ' + l.to : '') + ')';
  group('employee', 'leave', 'added', ld.added, lv, out);
  group('employee', 'leave', 'removed', ld.removed, lv, out);
  return out;
}

// ---------- employee profiles (gm_admin_wprofile_v1) ----------
const PRF = { role: 'role', joinDate: 'join date', dob: 'date of birth', gender: 'gender', address: 'address', altPhone: 'alternate phone', emName: 'emergency contact name', emPhone: 'emergency contact phone', idNumber: 'ID number', empCode: 'employee ID', notes: 'notes' };
function diffProfiles(oldV, newV, ctx) {
  const out = [], o = jp(oldV) || {}, n = jp(newV) || {};
  Object.keys(n).forEach(id => {
    const a = o[id], b = n[id]; if (!b || typeof b !== 'object') return;
    const who = (ctx.workerName(id) || id) + ' (' + id + ')';
    if (!a) return;   // a brand new profile belongs to a newly added employee, already reported
    if (blank(a.relieved) && !blank(b.relieved)) out.push({ type: 'employee', text: 'Employee ' + who + ' marked as relieved' + (b.relieved.date ? ' on ' + b.relieved.date : '') });
    if (!blank(a.relieved) && blank(b.relieved)) out.push({ type: 'employee', text: 'Employee ' + who + ' re-joined (relieved status removed)' });
    const f = fieldsChanged(a, b, PRF);
    if (!same(a.files, b.files)) f.push('photo or documents');
    if (!same(a.assign, b.assign)) { const last = arr(b.assign).slice(-1)[0]; f.push(last && last.route ? 'route assigned: ' + last.route : 'route assignment'); }
    if (f.length) out.push({ type: 'employee', text: 'Employee ' + who + ': ' + f.join(', ') + ' changed' });
  });
  return out;
}

// ---------- shop-location tasks, depot, vehicles, products ----------
function diffPinTasks(oldV, newV, ctx) {
  const out = [], o = (jp(oldV) || {}).tasks || {}, n = (jp(newV) || {}).tasks || {};
  const add = Object.keys(n).filter(k => !(k in o)), del = Object.keys(o).filter(k => !(k in n));
  if (add.length) {
    const to = new Set(); add.forEach(k => { const t = n[k] && n[k].to; (Array.isArray(t) ? t : (t ? [t] : ['all'])).forEach(x => to.add(x)); });
    const who = Array.from(to).map(x => x === 'all' ? 'all employees' : (ctx.workerName(x) || x)).join(', ');
    out.push({ type: 'shop', text: 'Sent ' + add.length + ' shop location' + (add.length > 1 ? 's' : '') + ' to ' + who });
  }
  if (del.length) out.push({ type: 'shop', text: 'Removed ' + del.length + ' shop location' + (del.length > 1 ? 's' : '') + ' from the employee lists' });
  return out;
}
function diffDepot(oldV, newV) {
  const o = jp(oldV), n = jp(newV);
  if (!n || (n.lat == null && n.lng == null)) return o ? [{ type: 'settings', text: 'Depot location removed' }] : [];
  if (!o || !same([o.lat, o.lng, o.name, o.radius, o.address], [n.lat, n.lng, n.name, n.radius, n.address])) return [{ type: 'settings', text: 'Depot location ' + (o ? 'changed' : 'set') + (n.name ? ': ' + n.name : '') }];
  return [];
}
const VEH = { number: 'number', type: 'type', vtype: 'vehicle type', body: 'body', fuel: 'fuel', transmission: 'transmission', status: 'status', active: 'active', note: 'note' };
function diffVehicles(oldV, newV) {
  const out = [], o = jp(oldV), n = jp(newV), d = listDiff(Array.isArray(o) ? o : [], Array.isArray(n) ? n : [], v => v.id);
  const lab = v => v.number || v.id;
  group('vehicle', 'vehicle', 'added', d.added, lab, out); group('vehicle', 'vehicle', 'deleted', d.removed, lab, out);
  changes('vehicle', 'vehicle', d.both, (a, b) => fieldsChanged(a, b, VEH), lab, out);
  return out;
}
const PRD = { name: 'name', price: 'price', cost: 'cost', mrp: 'MRP', category: 'category', unit: 'unit', hsn: 'HSN', tax: 'tax' };
function diffProducts(oldV, newV) {
  const out = [], o = jp(oldV), n = jp(newV), d = listDiff(Array.isArray(o) ? o : [], Array.isArray(n) ? n : [], p => p.id);
  const lab = p => (p.name || 'Unnamed') + (p.code ? ' (' + p.code + ')' : '');
  group('product', 'product', 'added', d.added, lab, out); group('product', 'product', 'deleted', d.removed, lab, out);
  changes('product', 'product', d.both, (a, b) => fieldsChanged(a, b, PRD), lab, out);
  return out;
}
function diffAccounts(oldV, newV) {
  const o = jp(oldV), n = jp(newV); if (!Array.isArray(n)) return [];
  const d = listDiff(Array.isArray(o) ? o : [], n, a => a.id), out = [];
  group('settings', 'admin account', 'added', d.added, a => a.name || a.id, out); group('settings', 'admin account', 'deleted', d.removed, a => a.name || a.id, out);
  changes('settings', 'admin account', d.both, (a, b) => fieldsChanged(a, b, { name: 'name', phone: 'mobile number', role: 'role' }), a => a.name || a.id, out);
  return out;
}

// key = the saved record's name; oldV / newV = its value before and after (newV already has passwords removed); incomingRaw = what the page sent.
function diff(key, oldV, newV, incomingRaw, ctx) {
  ctx = ctx || { workerName: id => id };
  switch (key) {
    case 'gm_admin_v1': return diffAdmin(oldV, newV);
    case 'gm_admin_workers_v1': return diffWorkers(oldV, newV, incomingRaw);
    case 'gm_admin_wprofile_v1': return diffProfiles(oldV, newV, ctx);
    case 'gm_pintasks_v1': return diffPinTasks(oldV, newV, ctx);
    case 'gm_depot_v1': return diffDepot(oldV, newV);
    case 'gm_admin_vehicles_v1': return diffVehicles(oldV, newV);
    case 'gm_admin_products_v1': return diffProducts(oldV, newV);
    case 'gm_admin_account_v1': return diffAccounts(oldV, newV);
    default: return [];
  }
}
module.exports = { diff };