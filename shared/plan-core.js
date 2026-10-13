/* General Traders - Daily Plan: shared helpers (data access, saving, dialogs, menus, searchable picker, toasts).
   Loads after admin.js. Everything is saved through GA.ops.save -> shared/sync.js -> server, the same path the Routes and Customers pages use. */
(function () {
  'use strict';
  var O = GA.ops, esc = GA.esc, KEY = 'gm_admin_v1';
  var DP = window.DP = { esc: esc };
  var $ = DP.$ = function (id) { return document.getElementById(id); };

  /* ---------- icons (the shared set plus the few this page needs) ---------- */
  var IC = {
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 8h4"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 14l4-5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>'
  };
  DP.icon = function (n) { return IC[n] ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>' : GA.icon(n); };

  /* ---------- small helpers ---------- */
  DP.actor = function () { var s = GA.session(); return (s && s.name) || 'Admin'; };
  DP.uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  DP.money = function (n) { return O.rupee(Math.round(Number(n) || 0)); };
  DP.niceDate = function (d, short) { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', short ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }); };
  DP.when = function (ts) { return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
  DP.addDays = function (d, n) { var x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  DP.nk = function (n) { return String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  DP.coord = function (c) {
    if (!c || c.lat == null || c.lng == null || c.lat === '' || c.lng === '') return null;
    var la = +c.lat, lo = +c.lng;
    return (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) ? [la, lo] : null;
  };

  // Nearest-route ordering from the stored map pins. Straight-line distance only (no roads, no traffic).
  // Starts at the first pinned item, always goes to the closest unvisited pinned item, then tidies the path with 2-opt.
  // Items without a pin are not guessed: they keep their relative order and go after the pinned ones.
  DP.nearestOrder = function (items, getPt, M) {
    function hav(a, b) { var R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
    var pin = [], no = [];
    items.forEach(function (it) { var pt = getPt(it); if (pt) pin.push({ it: it, pt: pt, i: pin.length }); else no.push(it); });
    if (M && (M.length !== pin.length)) M = null;
    function dd(a, b) { return M ? (M[a.i][b.i] + M[b.i][a.i]) / 2 / 1000 : hav(a.pt, b.pt); }   // road matrix is in metres; kept symmetric
    if (pin.length < 3) return { items: pin.map(function (x) { return x.it; }).concat(no), pinned: pin.length, total: items.length, km: null, changed: false };
    var left = pin.slice(), path = [left.shift()];
    while (left.length) { var last = path[path.length - 1], bi = 0, bd = Infinity; left.forEach(function (x, i) { var d = dd(last, x); if (d < bd) { bd = d; bi = i; } }); path.push(left.splice(bi, 1)[0]); }
    var improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (var i = 1; i < path.length - 1; i++) for (var j = i + 1; j < path.length; j++) {
        var before = dd(path[i - 1], path[i]) + (j + 1 < path.length ? dd(path[j], path[j + 1]) : 0), after = dd(path[i - 1], path[j]) + (j + 1 < path.length ? dd(path[i], path[j + 1]) : 0);
        if (after + 1e-9 < before) { var seg = path.slice(i, j + 1).reverse(); path = path.slice(0, i).concat(seg, path.slice(j + 1)); improved = true; }
      }
    }
    var km = 0; for (var k = 1; k < path.length; k++) km += dd(path[k - 1], path[k]);
    var outItems = path.map(function (x) { return x.it; }).concat(no), changed = outItems.some(function (x, i) { return x !== items[i]; });
    return { items: outItems, pinned: pin.length, total: items.length, km: km, changed: changed, method: M ? 'road' : 'line' };
  };

  // Road distances from the public OSRM demo server (OpenStreetMap data). Needs internet; returns null when it cannot be reached.
  // Only the saved map pins (latitude/longitude) of the shops are sent. Limit: 100 pins per request on the demo server.
  DP.roadMatrix = function (pts) {
    if (!pts || pts.length < 3 || pts.length > 100 || typeof fetch !== 'function') return Promise.resolve(null);
    var url = 'https://router.project-osrm.org/table/v1/driving/' + pts.map(function (p) { return p[1].toFixed(6) + ',' + p[0].toFixed(6); }).join(';') + '?annotations=distance';
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(function (j) {
      var M = j && j.distances; if (!M || M.length !== pts.length) return null;
      for (var a = 0; a < M.length; a++) for (var b = 0; b < M.length; b++) if (typeof M[a][b] !== 'number') return null;   // a pin that is off the road network
      return M;
    }).catch(function () { clearTimeout(t); return null; });
  };
  // Same as nearestOrder but tries road distances first and falls back to straight-line. Resolves with the result (result.method says which).
  DP.nearestOrderRoad = function (items, getPt) {
    var pts = []; items.forEach(function (it) { var p = getPt(it); if (p) pts.push(p); });
    return DP.roadMatrix(pts).then(function (M) { var r = DP.nearestOrder(items, getPt, M); r.roadTried = pts.length >= 3; return r; });
  };

  /* ---------- data ---------- */
  DP.S = null;
  DP.fresh = function () {
    var S = O.get(); S.plans = S.plans || {}; S.customers = S.customers || []; S.routes = S.routes || [];
    S.routes.forEach(function (r) { if (!Array.isArray(r.codes)) r.codes = []; });
    if (O.syncRoutes(S).moved) O.save(S);
    DP.S = S; return S;
  };
  // All plans on a date (cancelled ones included, kept as history). Plans from older versions get a stable id.
  DP.plansOn = function (S, d) { var L = O.plansOn(S, d); L.forEach(function (p, i) { if (!p.id) p.id = 'P' + (p.builtAt || i); if (!Array.isArray(p.stops)) p.stops = []; }); return L; };
  DP.activeOn = function (S, d) { return DP.plansOn(S, d).filter(function (p) { return p.status !== 'cancelled'; }); };
  DP.cust = function (S, code) { return O.cust(S, code); };
  DP.workerById = function (id) { return GA.workers().filter(function (w) { return w.id === id; })[0]; };
  DP.vehicleById = function (id) { return GA.vehicles().filter(function (v) { return v.id === id; })[0]; };

  // What the employees' phones report. Used for plan status and visit status.
  DP.recs = {}; DP.online = null; DP.recsAt = 0;
  var NS = 'gm_crm_data_v5__';
  DP.loadRecs = function () {
    return fetch('/api/state?since=0', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); }).then(function (r) {
      var o = {}; for (var k in r.items) if (k.indexOf(NS) === 0 && r.items[k].v !== null) { try { o[k.slice(NS.length)] = JSON.parse(r.items[k].v); } catch (e) {} }
      DP.recs = o; DP.online = true; DP.recsAt = Date.now();
    }).catch(function () { DP.online = false; });
  };
  DP.rec = function (wid, date) { var r = DP.recs[wid]; return (r && r.appliedPlan && r.appliedPlan.indexOf(date + ':') === 0) ? r : null; };
  DP.started = function (p, date) { var r = DP.rec(p.workerId, date); return !!(r && r.shift && r.shift.punchedIn); };
  DP.closed = function (p, date) { var r = DP.rec(p.workerId, date); return !!(r && r.shift && r.shift.punchedOut); };
  // pending | delivered | retry | cancelled | unknown (a past day whose employee record has moved on)
  DP.stopState = function (p, s, date) {
    var r = DP.rec(p.workerId, date);
    if (!r) return date < GA.today() ? 'unknown' : 'pending';
    var x = (r.shops || []).filter(function (q) { return q.billNo === s.inv; })[0];
    return x ? x.status : 'pending';
  };
  DP.planStatus = function (p, date) {
    if (p.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled', cls: 'b-danger' };
    if (DP.closed(p, date)) return { key: 'completed', label: 'Completed', cls: 'b-muted' };
    if (DP.started(p, date)) return { key: 'progress', label: 'In Progress', cls: 'b-success' };
    return { key: 'scheduled', label: 'Scheduled', cls: 'b-info' };
  };
  DP.counts = function (p, date) {
    var c = { total: p.stops.length, done: 0, pending: 0, missed: 0, unknown: 0 };
    p.stops.forEach(function (s) { var st = DP.stopState(p, s, date); if (st === 'delivered') c.done++; else if (st === 'retry' || st === 'cancelled') c.missed++; else if (st === 'unknown') c.unknown++; else c.pending++; });
    return c;
  };

  /* ---------- assignment rules (the server enforces the same ones) ---------- */
  DP.workerBusy = function (S, date, wid, exceptId) { return DP.activeOn(S, date).filter(function (p) { return p.id !== exceptId && p.workerId === wid; })[0] || null; };
  DP.vehicleBusy = function (S, date, vid, exceptId) { return DP.activeOn(S, date).filter(function (p) { return p.id !== exceptId && p.vehicleId === vid; })[0] || null; };
  DP.invTaken = function (S, date, exceptId) { var t = {}; DP.activeOn(S, date).forEach(function (p) { if (p.id !== exceptId) p.stops.forEach(function (s) { t[s.inv] = p; }); }); return t; };

  DP.history = function (p, type, text, o) {
    o = o || {}; p.history = p.history || [];
    var h = { id: DP.uid('H'), ts: Date.now(), by: DP.actor(), type: type, text: text };
    if (o.notify && o.notify.length) { h.notify = o.notify; if (o.workerText) h.workerText = o.workerText; }
    p.history.push(h); p.builtAt = Date.now() > (p.builtAt || 0) ? Date.now() : (p.builtAt || 0) + 1;
    return h;
  };

  /* ---------- saving ---------- */
  var syncState = { state: 'ok', msg: '' };
  DP.sync = syncState;
  function setSync(st, msg) { syncState.state = st; syncState.msg = msg || ''; try { window.dispatchEvent(new Event('dp-sync-state')); } catch (e) {} }
  window.addEventListener('gm-sync-saved', function (e) { if (e.detail && e.detail.key === KEY && !e.detail.dirty) setSync('ok'); });
  window.addEventListener('gm-sync-failed', function (e) { if (e.detail && e.detail.key === KEY) setSync('err', 'Server not reachable. Changes are kept on this computer and will be sent again automatically.'); });
  window.addEventListener('gm-sync-rejected', function (e) { if (e.detail && e.detail.key === KEY) setSync('ok'); });

  function waitServer() {
    return new Promise(function (resolve) {
      if (!window.GMSync) return resolve({ state: 'local' });   // no backend (file opened directly)
      var done = false, t;
      function fin(v) { if (done) return; done = true; clearTimeout(t); window.removeEventListener('gm-sync-saved', ok); window.removeEventListener('gm-sync-failed', bad); window.removeEventListener('gm-sync-rejected', rej); resolve(v); }
      function ok(e) { if (e.detail && e.detail.key === KEY && !e.detail.dirty) fin({ state: 'saved' }); }
      function bad(e) { if (e.detail && e.detail.key === KEY) fin({ state: 'failed' }); }
      function rej(e) { if (e.detail && e.detail.key === KEY) fin({ state: 'rejected', error: e.detail.error }); }
      window.addEventListener('gm-sync-saved', ok); window.addEventListener('gm-sync-failed', bad); window.addEventListener('gm-sync-rejected', rej);
      t = setTimeout(function () { fin({ state: 'pending' }); }, 8000);
    });
  }
  // Runs mut(S) on the newest data, saves it, and resolves once the server has answered.
  // mut returns { ok:true, ... } or { ok:false, error }. Nothing is reported as saved unless it really was written.
  DP.commit = function (mut) {
    var S;
    try { S = DP.fresh(); } catch (e) { return Promise.resolve({ ok: false, error: 'The saved data could not be read. Reload the page.' }); }
    var r;
    try { r = mut(S); } catch (e) { return Promise.resolve({ ok: false, error: 'Something went wrong: ' + (e && e.message || e) }); }
    if (!r || !r.ok) return Promise.resolve(r || { ok: false, error: 'Nothing was changed.' });
    var w = waitServer();
    try { O.save(S); if (localStorage.getItem(KEY) !== JSON.stringify(S)) throw new Error('mismatch'); }
    catch (e) { return Promise.resolve({ ok: false, error: 'The change could not be saved on this computer (storage may be full).' }); }
    setSync('warn', 'Saving...');
    return w.then(function (s) {
      r.server = s.state;
      if (s.state === 'rejected') { DP.fresh(); setSync('ok'); return { ok: false, error: s.error || 'The server rejected this change.' }; }
      if (s.state === 'failed') setSync('err', 'Server not reachable. Changes are kept on this computer and will be sent again automatically.');
      else if (s.state === 'pending') setSync('warn', 'Still sending to the server...');
      else setSync('ok');
      return r;
    });
  };
  // Any plan change must start from the plan the user was looking at
  DP.stale = function (p, expect) { return !p || (expect != null && (p.builtAt || 0) !== expect); };
  DP.STALE_MSG = 'This plan was changed on another screen while you were editing. It has been reloaded. Please check it and try again.';

  /* ---------- toasts ---------- */
  DP.toast = function (msg, kind, action) {
    var box = $('dpToasts');
    if (!box) { box = document.createElement('div'); box.id = 'dpToasts'; box.className = 'dp-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'dp-toast ' + (kind || 'ok');
    t.innerHTML = '<span class="dp-toast-i">' + DP.icon(kind === 'err' ? 'alert' : kind === 'warn' ? 'alert' : 'check') + '</span><span class="dp-toast-t">' + esc(msg) + '</span>' + (action ? '<button type="button" class="dp-toast-a">' + esc(action.label) + '</button>' : '') + '<button type="button" class="dp-toast-x" aria-label="Dismiss">' + DP.icon('x') + '</button>';
    box.appendChild(t);
    function kill() { if (t.parentNode) t.parentNode.removeChild(t); }
    t.querySelector('.dp-toast-x').onclick = kill;
    if (action) t.querySelector('.dp-toast-a').onclick = function () { kill(); action.run(); };
    setTimeout(kill, kind === 'ok' ? 4500 : 9000);
  };

  /* ---------- dialog ---------- */
  var openDialogs = 0; DP.dialogOpen = function () { return openDialogs > 0; };
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  DP.dialog = function (o) {
    var prev = document.activeElement, ov = document.createElement('div'), id = DP.uid('dpd');
    ov.className = 'modal-overlay a-c dp-ov';
    ov.innerHTML = '<div class="modal-sheet dp-dlg' + (o.wide ? ' wide' : '') + (o.cls ? ' ' + o.cls : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + 't">' +
      '<div class="dp-dh"><h3 id="' + id + 't">' + esc(o.title) + '</h3><button type="button" class="dp-ib" data-x aria-label="Close dialog">' + DP.icon('x') + '</button></div>' +
      (o.sub ? '<p class="sub">' + o.sub + '</p>' : '') + '<div data-body>' + o.html + '</div></div>';
    document.body.appendChild(ov); openDialogs++;
    var sheet = ov.firstChild, api = { root: sheet, busy: false, q: function (s) { return sheet.querySelector(s); }, qa: function (s) { return [].slice.call(sheet.querySelectorAll(s)); } };
    requestAnimationFrame(function () { ov.classList.add('active'); });
    var closed = false;
    api.close = function (force) {
      if (closed || (api.busy && !force)) return; closed = true; openDialogs--;
      document.removeEventListener('keydown', key, true); ov.classList.remove('active');
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 180);
      if (prev && prev.focus && document.contains(prev)) { try { prev.focus(); } catch (e) {} }
      if (o.onClose) o.onClose();
    };
    function key(e) {
      if (e.key === 'Escape') { if (document.querySelector('.dp-pk-l')) return; e.stopPropagation(); api.close(); return; }
      if (e.key !== 'Tab') return;
      var f = [].filter.call(sheet.querySelectorAll(FOCUSABLE), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', key, true);
    var downOnOverlay = false;
    ov.addEventListener('mousedown', function (e) { downOnOverlay = e.target === ov; });
    ov.addEventListener('click', function (e) { if (e.target === ov && downOnOverlay) api.close(); });
    sheet.querySelector('[data-x]').onclick = function () { api.close(); };
    if (o.onOpen) o.onOpen(api);
    setTimeout(function () { var f = o.focus ? sheet.querySelector(o.focus) : null; (f || sheet.querySelector('input:not([type=hidden]),select,textarea,button:not([data-x])') || sheet.querySelector('[data-x]')).focus(); }, 60);
    return api;
  };
  // Confirmation helper for small yes/no steps
  DP.setBusy = function (api, btn, on, label) {
    api.busy = on; if (!btn) return;
    btn.disabled = on; if (label != null) { if (on) { btn._t = btn.textContent; btn.textContent = label; } else if (btn._t) btn.textContent = btn._t; }
  };

  /* ---------- popup menu (position:fixed so scrolling lists never clip it) ---------- */
  var curMenu = null;
  DP.closeMenu = function () { if (curMenu) { var m = curMenu; curMenu = null; m.el.remove(); document.removeEventListener('mousedown', m.out, true); document.removeEventListener('keydown', m.key, true); window.removeEventListener('resize', m.close); if (m.btn) { m.btn.setAttribute('aria-expanded', 'false'); if (m.refocus) m.btn.focus(); } } };
  DP.menuOpen = function () { return !!curMenu; };
  DP.menu = function (btn, items) {
    if (curMenu && curMenu.btn === btn) { DP.closeMenu(); return; }
    DP.closeMenu();
    var el = document.createElement('div'); el.className = 'dp-menu'; el.setAttribute('role', 'menu'); el.style.position = 'fixed'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.visibility = 'hidden';
    el.innerHTML = items.map(function (it, i) {
      if (it === 'hr') return '<hr>';
      return '<button type="button" role="menuitem" data-i="' + i + '" class="' + (it.danger ? 'd' : '') + '"' + (it.disabled ? ' disabled' : '') + (it.hint ? ' title="' + esc(it.hint) + '"' : '') + '>' + DP.icon(it.icon || 'dots') + '<span>' + esc(it.label) + '</span></button>';
    }).join('');
    document.body.appendChild(el);
    var r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    var left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8), top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.visibility = '';
    btn.setAttribute('aria-expanded', 'true');
    var m = curMenu = { el: el, btn: btn, refocus: true };
    m.close = function () { DP.closeMenu(); };
    m.out = function (e) { if (!el.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { m.refocus = false; DP.closeMenu(); } };
    m.key = function (e) {
      var bs = [].slice.call(el.querySelectorAll('button:not([disabled])')), i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); DP.closeMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
      else if (e.key === 'Tab') { m.refocus = false; DP.closeMenu(); }
    };
    document.addEventListener('mousedown', m.out, true); document.addEventListener('keydown', m.key, true); window.addEventListener('resize', m.close);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]'); if (!b || b.disabled) return;
      var it = items[+b.dataset.i]; m.refocus = false; DP.closeMenu(); if (it && it.run) it.run();
    });
    var first = el.querySelector('button:not([disabled])'); if (first) first.focus();
  };

  /* ---------- searchable, themed picker ----------
     options: [{ value, label, sub, disabled, reason }]  (an array, or a function returning one)  */
  DP.picker = function (host, cfg) {
    var id = DP.uid('pk'), opts = [], sel = cfg.value || '', open = false, act = -1, shown = [];
    host.classList.add('dp-pk');
    host.innerHTML = '<input class="dp-pk-in" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + '" autocomplete="off" spellcheck="false" placeholder="' + esc(cfg.placeholder || 'Search...') + '"' + (cfg.label ? ' aria-label="' + esc(cfg.label) + '"' : '') + '>';
    var inp = host.firstChild, list = null;
    if (cfg.labelledBy) { inp.removeAttribute('aria-label'); inp.setAttribute('aria-labelledby', cfg.labelledBy); }
    function all() { return typeof cfg.options === 'function' ? cfg.options() : (cfg.options || []); }
    function byVal(v) { return opts.filter(function (o) { return o.value === v; })[0]; }
    function labelOf(o) { return o ? o.label : ''; }
    function refreshOpts() { opts = all(); }
    function setText() { var o = byVal(sel); inp.value = o ? labelOf(o) : ''; }
    function filtered() {
      var q = inp.dataset.typing === '1' ? inp.value.trim().toLowerCase() : '';
      var out = !q ? opts : opts.filter(function (o) { return (o.label + ' ' + (o.sub || '') + ' ' + (o.search || '')).toLowerCase().indexOf(q) > -1; });
      return out;
    }
    function draw() {
      if (!list) return;
      var f = filtered(), cap = cfg.limit || 50; shown = f.slice(0, cap);
      list.innerHTML = shown.length ? shown.map(function (o, i) {
        return '<button type="button" role="option" tabindex="-1" id="' + id + 'o' + i + '" class="dp-pk-o' + (i === act ? ' act' : '') + '" data-i="' + i + '" aria-selected="' + (o.value === sel) + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '><span>' + esc(o.label) + '</span>' + (o.sub || (o.disabled && o.reason) ? '<small>' + esc(o.disabled && o.reason ? o.reason : o.sub) + '</small>' : '') + '</button>';
      }).join('') + (f.length > cap ? '<div class="dp-pk-e">Showing ' + cap + ' of ' + f.length + '. Type to narrow the list.</div>' : '') : '<div class="dp-pk-e">' + esc(cfg.empty || 'Nothing matches.') + '</div>';
      if (act >= 0 && shown[act]) inp.setAttribute('aria-activedescendant', id + 'o' + act); else inp.removeAttribute('aria-activedescendant');
    }
    function place() {
      if (!list) return; var r = inp.getBoundingClientRect(), below = window.innerHeight - r.bottom, h = Math.min(260, list.scrollHeight || 260);
      list.style.position = 'fixed'; list.style.left = r.left + 'px'; list.style.width = r.width + 'px';
      if (below < Math.min(h, 200) + 12 && r.top > below) { list.style.top = 'auto'; list.style.bottom = (window.innerHeight - r.top + 4) + 'px'; } else { list.style.bottom = 'auto'; list.style.top = (r.bottom + 4) + 'px'; }
    }
    function openList() {
      if (open || inp.disabled) return; refreshOpts(); open = true; act = -1;
      list = document.createElement('div'); list.className = 'dp-pk-l'; list.id = id; list.setAttribute('role', 'listbox'); document.body.appendChild(list);
      inp.setAttribute('aria-expanded', 'true'); draw(); place();
      list.addEventListener('mousedown', function (e) { e.preventDefault(); });
      list.addEventListener('click', function (e) { var b = e.target.closest('.dp-pk-o'); if (b) pick(+b.dataset.i); });
      window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
    }
    function closeList() {
      if (!open) return; open = false; inp.setAttribute('aria-expanded', 'false'); inp.dataset.typing = '0';
      if (list) { list.remove(); list = null; } window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); setText();
    }
    function pick(i) {
      var o = shown[i]; if (!o || o.disabled) return;
      sel = o.value; closeList(); setText(); inp.classList.remove('bad'); if (cfg.onChange) cfg.onChange(sel, o);
    }
    inp.addEventListener('focus', function () { openList(); inp.select(); });
    inp.addEventListener('click', function () { openList(); });
    inp.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== inp) closeList(); }, 120); });
    inp.addEventListener('input', function () { inp.dataset.typing = '1'; openList(); act = 0; draw(); place(); if (!inp.value.trim() && sel && cfg.clearable) { sel = ''; if (cfg.onChange) cfg.onChange('', null); } });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!open) { openList(); return; }
        var n = shown.length; if (!n) return; act = (act + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; draw();
        var el = list.querySelector('.act'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { if (open && act >= 0) { e.preventDefault(); pick(act); } else if (open && shown.length === 1) { e.preventDefault(); pick(0); } }
      else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); closeList(); } }
      else if (e.key === 'Tab') closeList();
    });
    refreshOpts(); setText();
    return {
      get: function () { return sel; },
      set: function (v) { sel = v || ''; refreshOpts(); setText(); },
      refresh: function () { refreshOpts(); if (!byVal(sel)) sel = ''; setText(); if (open) draw(); },
      invalid: function (on) { inp.classList.toggle('bad', !!on); inp.setAttribute('aria-invalid', on ? 'true' : 'false'); },
      focus: function () { inp.focus(); },
      input: inp, destroy: function () { closeList(); }
    };
  };
})();
