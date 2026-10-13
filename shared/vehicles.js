/* General Traders - Vehicles: shared data layer, derived numbers, charts and small components.
   Vehicles stay in gm_admin_vehicles_v1 (same records the Daily plan uses); fuel and service records get their own keys.
   Everything is saved through localStorage -> shared/sync.js -> server, like the rest of the admin pages. */
(function () {
  'use strict';
  var esc = GA.esc, VK = 'gm_admin_vehicles_v1', FK = 'gm_admin_vfuel_v1', SK = 'gm_admin_vservice_v1', NS = 'gm_crm_data_v5__', OSYNC = 'gm_admin_vehsync_v1';
  var VX = window.VX = { esc: esc };

  /* ---------- storage ---------- */
  function jr(k) { try { var r = JSON.parse(localStorage.getItem(k)); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
  function jw(k, a) { try { var s = JSON.stringify(a); localStorage.setItem(k, s); return localStorage.getItem(k) === s; } catch (e) { return false; } }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  VX.uid = uid;
  function actor() { var s = GA.session(); return (s && s.name) || 'Admin'; }

  /* ---------- formatting ---------- */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  VX.date = function (d, short) { if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return '-'; var x = new Date(d.slice(0, 10) + 'T00:00:00'); return x.getDate() + ' ' + MON[x.getMonth()] + (short ? '' : ' ' + x.getFullYear()); };
  VX.dateLong = function (d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  VX.num = function (n, dp) { n = Number(n); return isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: dp == null ? 0 : dp, minimumFractionDigits: dp == null ? 0 : dp }) : '-'; };
  VX.money = function (n, dp) { return '₹' + VX.num(n, dp == null ? 0 : dp); };
  VX.addDays = function (d, n) { var x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  VX.daysBetween = function (a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); };
  VX.monthKey = function (d) { return String(d).slice(0, 7); };
  VX.monthName = function (mk) { var p = mk.split('-'); return MON[+p[1] - 1] + ' ' + p[0]; };
  VX.today = GA.today;
  VX.relDays = function (n) { return n === 0 ? 'today' : n > 0 ? 'in ' + n + ' day' + (n === 1 ? '' : 's') : Math.abs(n) + ' day' + (n === -1 ? '' : 's') + ' ago'; };

  /* ---------- vehicles ---------- */
  var ST = { active: ['Active', 'b-success'], repair: ['In service / repair', 'b-accent'], inactive: ['Inactive', 'b-danger'] };
  VX.ST = ST;
  function norm(v) { return Object.assign({}, v, { status: v.status === 'repair' ? 'repair' : (v.active ? 'active' : 'inactive'), code: v.code || v.id }); }
  VX.vehicles = function () { return GA.vehicles().map(norm); };
  VX.vehicle = function (id) { return VX.vehicles().filter(function (v) { return v.id === id; })[0] || null; };
  VX.badge = function (st) { var b = ST[st] || ST.inactive; return '<span class="badge ' + b[1] + '">' + b[0] + '</span>'; };
  VX.checkCode = function (code, selfId) {
    code = String(code || '').trim().toUpperCase(); if (!code) return 'Enter the internal code.';
    if (!/^[A-Z0-9 _-]{1,20}$/.test(code)) return 'Use letters, numbers, dash or underscore (up to 20).';
    if (VX.vehicles().some(function (v) { return v.id !== selfId && String(v.code).toUpperCase() === code; })) return 'Another vehicle already uses this code.';
    return '';
  };
  // Change fields of a vehicle record in place (other pages' fields are kept) and note it in the vehicle's activity.
  VX.patch = function (id, fields, text) {
    var L = jr(VK), r = L.filter(function (x) { return x.id === id; })[0]; if (!r) return false;
    Object.assign(r, fields);
    if (text) { r.history = (r.history || []); r.history.push({ ts: Date.now(), by: actor(), text: text }); if (r.history.length > 100) r.history = r.history.slice(-100); }
    return jw(VK, L);
  };
  var EXTRA = ['code', 'vtype', 'body', 'fuel', 'transmission', 'color', 'regDate', 'ownerType', 'owner', 'rcNo', 'insNo', 'insExpiry', 'permitNo', 'permitExpiry', 'fitExpiry', 'purchaseDate', 'purchaseAmount'];
  function extras(d) { var o = {}; EXTRA.forEach(function (k) { if (d[k] !== undefined) o[k] = typeof d[k] === 'string' ? d[k].trim() : d[k]; }); if (o.purchaseAmount !== undefined) o.purchaseAmount = o.purchaseAmount === '' ? '' : Number(o.purchaseAmount); return o; }
  VX.add = function (d) {
    var r = GA.addVehicle({ number: d.number, type: d.type, lastKm: d.lastKm, note: d.note });
    if (!r.ok) return r;
    var id = r.vehicle.id, st = d.status || 'active', f = extras(d);
    f.code = (f.code || id).toUpperCase(); f.created = GA.today(); f.initKm = Math.round(Number(d.lastKm) || 0); f.status = st; f.active = st === 'active';
    f.history = [{ ts: Date.now(), by: actor(), text: 'Vehicle created' }];
    if (!VX.patch(id, f)) return { ok: false, error: 'The vehicle could not be saved on this computer.' };
    return { ok: true, vehicle: VX.vehicle(id) };
  };
  VX.update = function (id, d) {
    var old = VX.vehicle(id); if (!old) return { ok: false, error: 'Vehicle not found.' };
    var r = GA.updateVehicle(id, { number: d.number, type: d.type, lastKm: d.lastKm, note: d.note });
    if (!r.ok) return r;
    var f = extras(d), st = d.status || old.status; f.status = st; f.active = st === 'active';
    var txt = st !== old.status ? 'Vehicle marked as ' + (ST[st] || ST.inactive)[0].toLowerCase() : 'Vehicle details updated';
    if (!VX.patch(id, f, txt)) return { ok: false, error: 'The vehicle could not be saved on this computer.' };
    return { ok: true, vehicle: VX.vehicle(id) };
  };
  VX.setStatus = function (id, st) { return VX.patch(id, { status: st, active: st === 'active' }, 'Vehicle marked as ' + (ST[st] || ST.inactive)[0].toLowerCase()); };
  // The odometer only moves up through this (service / fuel / trip entries); the edit form can still correct it by hand.
  VX.raiseOdometer = function (id, km, why) { var v = VX.vehicle(id); if (!v || !(km > v.lastKm)) return false; return VX.patch(id, { lastKm: Math.round(km) }, 'Odometer updated to ' + VX.num(km) + ' km (' + why + ')'); };

  /* ---------- photo and documents (server: /api/vfile) ---------- */
  VX.DOCS = [['rc', 'Registration Certificate (RC)', 'Upload RC copy'], ['insurance', 'Insurance Certificate', 'Upload insurance copy'], ['permit', 'Permit', 'Upload permit copy'], ['fitness', 'Fitness Certificate (optional)', 'Upload fitness certificate'], ['other', 'Other Document (optional)', 'Upload any other document']];
  VX.fileUrl = function (id, kind, at) { return '/api/vfile?v=' + encodeURIComponent(id) + '&k=' + kind + '&t=' + (at || 0); };
  VX.checkFile = function (f, kind) {
    if (!f) return 'Choose a file.';
    var ok = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type) || /\.(jpe?g|png|webp|pdf)$/i.test(f.name);
    if (!ok) return kind === 'photo' ? 'Choose a JPG, PNG or WEBP picture.' : 'Choose a JPG, PNG, WEBP or PDF file.';
    if (kind === 'photo' && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return 'The vehicle photo must be a picture, not a PDF.';
    if (f.size > (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? 5 : 25) * 1024 * 1024) return 'That file is too large (PDF up to 5 MB, pictures up to 25 MB).';
    return '';
  };
  VX.upload = function (id, kind, file) {
    return new Promise(function (resolve, reject) {
      var fr = {}; fr.onerror = function () { reject(new Error('Could not read that file.')); };
      fr.onload = function () {
        fetch('/api/vfile?v=' + encodeURIComponent(id) + '&k=' + kind, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: fr.result }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Upload failed.'); return j; }); })
          .then(function (j) { resolve({ name: file.name, size: j.size, mime: j.mime, at: j.at }); }).catch(function (e) { reject(e && e.message ? e : new Error('The server could not be reached.')); });
      };
      GMImg.read(file, kind === 'photo' ? 1600 : 2000).then(function (d) { if (!d) return fr.onerror(); fr.result = d; fr.onload(); }, function () { fr.onerror(); });
    });
  };
  VX.saveFileMeta = function (id, kind, meta) {
    var v = VX.vehicle(id), files = Object.assign({}, v && v.files || {}); if (meta) files[kind] = meta; else delete files[kind];
    var label = kind === 'photo' ? 'photo' : (VX.DOCS.filter(function (d) { return d[0] === kind; })[0] || [0, kind])[1];
    return VX.patch(id, { files: files }, (meta ? 'Uploaded ' : 'Removed ') + label);
  };
  VX.removeFile = function (id, kind) { return fetch('/api/vfile?v=' + encodeURIComponent(id) + '&k=' + kind, { method: 'DELETE' }).then(function (r) { if (!r.ok) throw new Error('The server could not remove the file.'); VX.saveFileMeta(id, kind, null); }); };
  VX.photo = function (v, cls) {
    var m = v && v.files && v.files.photo;
    return '<span class="vx-ph ' + (cls || '') + '">' + (m ? '<img src="' + VX.fileUrl(v.id, 'photo', m.at) + '" alt="Photo of ' + esc(v.number) + '" onerror="this.style.display=\'none\';this.nextSibling.hidden=false">' : '') + '<span class="vx-ph-i"' + (m ? ' hidden' : '') + '>' + GA.icon('truck') + '</span></span>';
  };

  /* ---------- fuel records ---------- */
  VX.fuelAll = function (vid) {
    var L = jr(FK).filter(function (e) { return !vid || e.vehicleId === vid; });
    L.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.odometer - b.odometer); });
    var prev = null;   // mileage = km since the previous entry / litres filled now (full-tank method)
    L.forEach(function (e) {
      if (vid && prev && e.odometer > prev.odometer && e.litres > 0) e.mileage = (e.odometer - prev.odometer) / e.litres; else e.mileage = null;
      prev = e;
    });
    return L;
  };
  VX.checkFuel = function (e, selfId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return 'Choose the date.';
    if (e.date > GA.today()) return 'The date cannot be in the future.';
    if (!(e.odometer >= 0) || e.odometerRaw === '') return 'Enter the odometer reading (km).';
    if (!(e.litres > 0)) return 'Enter the litres (above 0).';
    if (!(e.rate > 0)) return 'Enter the cost per litre (above 0).';
    var L = VX.fuelAll(e.vehicleId).filter(function (x) { return x.id !== selfId; }), before = null, after = null;
    L.forEach(function (x) { if (x.date < e.date || (x.date === e.date && x.odometer <= e.odometer)) before = x; else if (!after) after = x; });
    if (before && e.odometer < before.odometer) return 'Odometer is lower than the earlier entry (' + VX.num(before.odometer) + ' km on ' + VX.date(before.date) + ').';
    if (after && e.odometer > after.odometer) return 'Odometer is higher than the later entry (' + VX.num(after.odometer) + ' km on ' + VX.date(after.date) + ').';
    return '';
  };
  VX.saveFuel = function (e) {
    var L = jr(FK), rec = { id: e.id || uid('F'), vehicleId: e.vehicleId, date: e.date, odometer: Math.round(e.odometer), litres: Math.round(e.litres * 100) / 100, rate: Math.round(e.rate * 100) / 100, station: (e.station || '').trim(), notes: (e.notes || '').trim() };
    rec.total = Math.round(rec.litres * rec.rate * 100) / 100;
    var i = L.findIndex(function (x) { return x.id === rec.id; }); if (i < 0) L.push(rec); else L[i] = rec;
    if (!jw(FK, L)) return null;
    VX.raiseOdometer(rec.vehicleId, rec.odometer, 'fuel entry'); return rec;
  };
  VX.removeFuel = function (id) { return jw(FK, jr(FK).filter(function (x) { return x.id !== id; })); };

  /* ---------- service and repair records ---------- */
  VX.services = function (vid) { return jr(SK).filter(function (e) { return !vid || e.vehicleId === vid; }); };
  VX.SERVICE_TYPES = ['General Service', 'Engine Oil Change', 'Tyre Inspection', 'Tyre Replacement', 'Brake Check', 'Battery', 'Clutch / Gearbox', 'Other'];
  VX.saveService = function (e) {
    var L = jr(SK), rec = Object.assign({ id: uid('S'), createdAt: Date.now(), createdBy: actor() }, L.filter(function (x) { return x.id === e.id; })[0] || {}, e);
    var i = L.findIndex(function (x) { return x.id === rec.id; }); if (i < 0) L.push(rec); else L[i] = rec;
    if (!jw(SK, L)) return null;
    if (rec.status === 'done' && rec.odometer > 0) VX.raiseOdometer(rec.vehicleId, rec.odometer, rec.kind === 'repair' ? 'repair' : 'service');
    return rec;
  };
  VX.removeService = function (id) { return jw(SK, jr(SK).filter(function (x) { return x.id !== id; })); };
  VX.isOverdue = function (s, v) {
    if (s.status === 'done') return false;
    return !!((s.scheduledDate && s.scheduledDate < GA.today()) || (s.dueKm > 0 && v && v.lastKm >= s.dueKm));
  };
  // Reminders: scheduled services plus document expiries, soonest first
  VX.reminders = function (v) {
    var t = GA.today(), out = [];
    VX.services(v.id).filter(function (s) { return s.status !== 'done'; }).forEach(function (s) {
      if (s.scheduledDate) out.push({ days: VX.daysBetween(t, s.scheduledDate), title: s.type + (s.scheduledDate < t ? ' overdue' : ' due ' + VX.relDays(VX.daysBetween(t, s.scheduledDate))), sub: VX.date(s.scheduledDate) + (s.dueKm ? ' · ' + VX.num(s.dueKm) + ' km' : ''), kind: 'service' });
      else if (s.dueKm) out.push({ days: 9999, title: s.type + ' at ' + VX.num(s.dueKm) + ' km', sub: Math.max(0, s.dueKm - v.lastKm) + ' km to go', kind: 'service' });
    });
    [['insExpiry', 'Insurance'], ['permitExpiry', 'Permit'], ['fitExpiry', 'Fitness certificate']].forEach(function (x) {
      if (!v[x[0]]) return; var d = VX.daysBetween(t, v[x[0]]);
      out.push({ days: d, title: x[1] + (d < 0 ? ' expired ' + Math.abs(d) + ' days ago' : ' expires ' + VX.relDays(d)), sub: VX.date(v[x[0]]), kind: 'doc' });
    });
    return out.sort(function (a, b) { return a.days - b.days; });
  };

  /* ---------- usage and assignments (from the Daily plan and the employees' attendance) ---------- */
  VX.recs = {}; VX.online = null;
  VX.loadRecs = function () {
    return fetch('/api/state?since=0', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (r) {
      var o = {}; for (var k in r.items) if (k.indexOf(NS) === 0 && r.items[k].v !== null) { try { o[k.slice(NS.length)] = JSON.parse(r.items[k].v); } catch (e) {} }
      VX.recs = o; VX.online = true;
    }).catch(function () { VX.online = false; });
  };
  VX.wname = function (id) { var w = GA.workers().filter(function (x) { return x.id === id; })[0]; return w ? w.name : id; };
  // every logged day that used this vehicle (the attendance log stores "NUMBER (type)")
  VX.uses = function (v) {
    var key = v.number.replace(/\s+/g, '').toUpperCase(), out = [];
    Object.keys(VX.recs).forEach(function (id) {
      var L = VX.recs[id].attendanceLog || {};
      Object.keys(L).forEach(function (mk) { Object.keys(L[mk]).forEach(function (d) {
        var e = L[mk][d]; if (e && String(e.vehicle || '').replace(/\s+/g, '').toUpperCase().indexOf(key) === 0) out.push({ date: mk + '-' + String(d).padStart(2, '0'), wid: id, e: e });
      }); });
    });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  };
  // every day a plan used this vehicle (cancelled plans are kept but marked)
  VX.planDays = function (v) {
    var S = GA.ops.get(), out = [];
    Object.keys(S.plans || {}).forEach(function (d) { GA.ops.plansOn(S, d).forEach(function (p) { if (p && p.vehicleId === v.id) out.push({ date: d, plan: p, cancelled: p.status === 'cancelled' }); }); });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  };
  VX.avail = function (v, date) {
    if (v.status === 'repair') return { key: 'repair', label: 'In service / repair', sub: 'Not available for assignment', cls: 'warn' };
    if (v.status === 'inactive') return { key: 'inactive', label: 'Inactive', sub: 'Not in service', cls: 'off' };
    var pd = VX.planDays(v).filter(function (x) { return x.date === date && !x.cancelled; })[0], u = VX.uses(v).filter(function (x) { return x.date === date; })[0];
    if (u) { var closed = u.e.outTime && u.e.outTime !== '-'; return { key: closed ? 'returned' : 'road', label: closed ? 'Returned' : 'On the road', sub: VX.wname(u.wid) + ' · ' + (u.e.km || 0) + ' km', cls: closed ? 'ok' : 'busy', worker: VX.wname(u.wid) }; }
    if (pd) return { key: 'assigned', label: 'Assigned', sub: (pd.plan.worker || VX.wname(pd.plan.workerId)) + ' · ' + pd.plan.routeName, cls: 'busy', worker: pd.plan.worker };
    return { key: 'free', label: 'Available', sub: date === GA.today() ? 'Can be assigned for today' : 'Free on ' + VX.date(date), cls: 'ok' };
  };
  // When an employee closes the day the odometer moves up to the closing km (once per closing, so a manual correction sticks)
  VX.syncOdometers = function () {
    var done = {}; try { done = JSON.parse(localStorage.getItem(OSYNC)) || {}; } catch (e) {}
    var changed = false;
    GA.vehicles().forEach(function (v) {
      var u = VX.uses(v).filter(function (x) { return x.e.endKm > 0; })[0]; if (!u) return;
      var tok = u.date + ':' + u.wid + ':' + u.e.endKm; if (done[v.id] === tok) return;
      done[v.id] = tok; changed = true;
      if (u.e.endKm > v.lastKm) GA.updateVehicle(v.id, { number: v.number, type: v.type, lastKm: String(u.e.endKm), note: v.note });
    });
    if (changed) try { localStorage.setItem(OSYNC, JSON.stringify(done)); } catch (e) {}
  };
  VX.monthUsage = function (v, mk) {
    var u = VX.uses(v).filter(function (x) { return VX.monthKey(x.date) === mk; }), km = 0; u.forEach(function (x) { km += x.e.km || 0; });
    var fuel = VX.fuelAll(v.id).filter(function (e) { return VX.monthKey(e.date) === mk; }), L = 0; fuel.forEach(function (e) { L += e.litres; });
    var asg = VX.planDays(v).filter(function (x) { return VX.monthKey(x.date) === mk && !x.cancelled; }).length;
    return { km: km, days: u.length, litres: L, assignments: asg };
  };
  // Odometer readings from every source, oldest first
  VX.odoEvents = function (v) {
    var ev = [];
    if (v.created && v.initKm >= 0) ev.push({ date: v.created, km: v.initKm, source: 'Initial' });
    VX.fuelAll(v.id).forEach(function (e) { ev.push({ date: e.date, km: e.odometer, source: 'Fuel' }); });
    VX.services(v.id).forEach(function (s) { if (s.status === 'done' && s.odometer > 0) ev.push({ date: s.doneDate || String(new Date(s.createdAt).toISOString()).slice(0, 10), km: s.odometer, source: s.kind === 'repair' ? 'Repair' : 'Service' }); });
    VX.uses(v).forEach(function (x) { if (x.e.endKm > 0) ev.push({ date: x.date, km: x.e.endKm, source: 'Trip' }); });
    ev.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km; });
    var prev = null; ev.forEach(function (e) { e.added = prev ? e.km - prev.km : null; prev = e; });
    return ev;
  };
  VX.activity = function (v) {
    var out = [];
    (v.history || []).forEach(function (h) { out.push({ ts: h.ts, text: h.text, tone: /marked as (inactive|in service)/.test(h.text) ? 'warn' : 'neutral' }); });
    VX.fuelAll(v.id).forEach(function (e) { out.push({ ts: new Date(e.date + 'T12:00:00').getTime(), text: 'Fuel record added: ' + VX.num(e.litres, 1) + ' L', tone: 'ok' }); });
    VX.services(v.id).forEach(function (s) { if (s.status === 'done') out.push({ ts: new Date((s.doneDate || GA.today()) + 'T12:00:00').getTime(), text: (s.kind === 'repair' ? 'Repair completed: ' : 'Service completed: ') + s.type, tone: 'ok' }); });
    VX.uses(v).slice(0, 10).forEach(function (x) { if (x.e.outTime && x.e.outTime !== '-') out.push({ ts: new Date(x.date + 'T18:00:00').getTime(), text: 'Trip completed by ' + VX.wname(x.wid) + ' (' + (x.e.km || 0) + ' km)', tone: 'ok' }); });
    return out.sort(function (a, b) { return b.ts - a.ts; });
  };

  /* ---------- charts: one measure per chart, single series, hover tooltips, table view ---------- */
  function nice(max) {
    if (!(max > 0)) return { top: 4, step: 1 };
    var s0 = max / 4, p = Math.pow(10, Math.floor(Math.log10(s0))), n = s0 / p, step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    return { top: Math.ceil(max / step - 1e-9) * step, step: step };
  }
  function shortNum(n) { return n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace('.0', '') + 'k' : VX.num(n, n % 1 ? 1 : 0); }
  function frame(o) {
    var W = 640, H = o.h || 220, L = 46, R = 12, T = 10, B = 26, pw = W - L - R, ph = H - T - B, mx = 0;
    o.data.forEach(function (d) { if (d.value != null && d.value > mx) mx = d.value; });
    var sc = nice(mx), n = o.data.length, y = function (v) { return T + ph - (v / sc.top) * ph; };
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vx-svg" role="img" aria-label="' + esc(o.label) + '">';
    for (var t = 0; t <= sc.top + 1e-9; t += sc.step) { var yy = y(t); g += '<line class="vx-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="vx-ax" x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + shortNum(t) + (o.unit && t === sc.top ? ' ' + esc(o.unit) : '') + '</text>'; }
    var every = Math.max(1, Math.ceil(n / 8));
    o.data.forEach(function (d, i) { if (i % every === 0 || i === n - 1 && n < 9) g += '<text class="vx-ax" x="' + (L + pw * (i + .5) / n) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(d.label) + '</text>'; });
    return { g: g, W: W, H: H, L: L, T: T, pw: pw, ph: ph, y: y, n: n, base: T + ph };
  }
  function tableView(o) {
    return '<details class="vx-tv"><summary>View as table</summary><table class="vx-tvt"><thead><tr><th>' + esc(o.xName || 'Date') + '</th><th>' + esc(o.yName || 'Value') + '</th></tr></thead><tbody>' + o.data.map(function (d) { return '<tr><td>' + esc(d.full || d.label) + '</td><td>' + (d.value == null ? '-' : esc(d.text || VX.num(d.value, 1))) + '</td></tr>'; }).join('') + '</tbody></table></details>';
  }
  VX.empty = function (msg, sub) { return '<div class="vx-empty"><b>' + esc(msg) + '</b>' + (sub ? esc(sub) : '') + '</div>'; };
  VX.barChart = function (o) {
    if (!o.data.length || !o.data.some(function (d) { return d.value > 0; })) return VX.empty(o.empty || 'No data yet', o.emptySub);
    var f = frame(o), bw = Math.min(24, f.pw / f.n * .6), s = f.g;
    o.data.forEach(function (d, i) {
      var cx = f.L + f.pw * (i + .5) / f.n, x0 = cx - bw / 2, x1 = cx + bw / 2, yv = f.y(d.value || 0), h = f.base - yv, r = Math.min(4, h);
      if (h > 0) s += '<path class="vx-bar" d="M' + x0 + ',' + f.base + ' V' + (yv + r) + ' Q' + x0 + ',' + yv + ' ' + (x0 + r) + ',' + yv + ' H' + (x1 - r) + ' Q' + x1 + ',' + yv + ' ' + x1 + ',' + (yv + r) + ' V' + f.base + ' Z"/>';
      s += '<rect class="vx-hit" x="' + (cx - f.pw / f.n / 2) + '" y="' + f.T + '" width="' + (f.pw / f.n) + '" height="' + f.ph + '" data-tip="' + esc((d.full || d.label) + ': ' + (d.text || VX.num(d.value, 1))) + '" tabindex="0" aria-label="' + esc((d.full || d.label) + ': ' + (d.text || VX.num(d.value, 1))) + '"/>';
    });
    return '<div class="vx-chart">' + s + '</svg></div>' + tableView(o);
  };
  VX.lineChart = function (o) {
    var pts = o.data.filter(function (d) { return d.value != null; });
    if (pts.length < 2) return VX.empty(o.empty || 'Not enough data yet', o.emptySub);
    var f = frame(o), xs = function (i) { return f.L + f.pw * (i + .5) / f.n; }, d = '', first = null, last = null, s = f.g;
    o.data.forEach(function (p, i) { if (p.value == null) return; var x = xs(i), y = f.y(p.value); d += (d ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); if (!first) first = [x, y]; last = [x, y]; });
    if (o.area !== false) s += '<path class="vx-area" d="' + d + ' L' + last[0] + ',' + f.base + ' L' + first[0] + ',' + f.base + ' Z"/>';
    s += '<path class="vx-line" d="' + d + '"/>';
    o.data.forEach(function (p, i) {
      if (p.value == null) return; var x = xs(i), y = f.y(p.value), show = f.n <= 24 || i === o.data.length - 1;
      if (show) s += '<circle class="vx-dot" cx="' + x + '" cy="' + y + '" r="4"/>';
      s += '<rect class="vx-hit" x="' + (x - f.pw / f.n / 2) + '" y="' + f.T + '" width="' + (f.pw / f.n) + '" height="' + f.ph + '" data-tip="' + esc((p.full || p.label) + ': ' + (p.text || VX.num(p.value, 1))) + '" tabindex="0" aria-label="' + esc((p.full || p.label) + ': ' + (p.text || VX.num(p.value, 1))) + '"/>';
    });
    return '<div class="vx-chart">' + s + '</svg></div>' + tableView(o);
  };
  // one shared tooltip for every chart on the page
  VX.initTips = function () {
    var tip = document.createElement('div'); tip.className = 'vx-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip);
    function show(el, x, y) { tip.textContent = el.getAttribute('data-tip'); tip.hidden = false; var w = tip.offsetWidth; tip.style.left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8) + 'px'; tip.style.top = Math.max(8, y - tip.offsetHeight - 10) + 'px'; }
    document.addEventListener('mousemove', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el, e.clientX, e.clientY); else tip.hidden = true; });
    document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) { var r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top + 30); } });
    document.addEventListener('focusout', function () { tip.hidden = true; });
    document.addEventListener('scroll', function () { tip.hidden = true; }, true);
  };

  /* ---------- page pieces ---------- */
  VX.qs = function (k) { return new URLSearchParams(location.search).get(k); };
  VX.link = function (page, id, d) { return page + '?' + (id ? 'id=' + encodeURIComponent(id) : '') + (d && d !== GA.today() ? (id ? '&' : '') + 'd=' + d : ''); };
  VX.viewDate = function () { var d = VX.qs('d'); return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : GA.today(); };
  VX.back = function (href, label) { return '<a class="vx-back" href="' + href + '">' + DP.icon('left') + ' ' + esc(label) + '</a>'; };
  VX.dateBox = function (id, d) { return '<div class="field vx-datebox" data-act><span aria-hidden="true">' + GA.icon('cal') + '</span><input type="date" id="' + id + '" value="' + d + '" aria-label="Date"></div>'; };
  VX.specs = function (v) {
    function s(icon, val, label) { return '<div class="vx-spec"><span class="vx-spec-i">' + GA.icon(icon) + '</span><div><b>' + esc(val || '-') + '</b><small>' + label + '</small></div></div>'; }
    var last = VX.uses(v)[0];
    return s('box', v.fuel, 'Fuel type') + s('power', v.transmission, 'Transmission') + s('truck', v.body, 'Body type') + s('clock', VX.num(v.lastKm) + ' km', 'Odometer') + s('cal', last ? VX.date(last.date) : 'Not used yet', 'Last used');
  };
  VX.banner = function (v, right) {
    return '<div class="card vx-banner">' + VX.photo(v, 'lg') + '<div class="vx-banner-m"><div class="vx-title"><h2>' + esc(v.number) + '</h2>' + VX.badge(v.status) + '</div><div class="mu">' + esc(v.code) + (v.type ? ' · ' + esc(v.type) : '') + '</div><div class="vx-specs">' + VX.specs(v) + '</div></div>' + (right || '') + '</div>';
  };
  VX.csv = function (rows, name) {
    var t = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();