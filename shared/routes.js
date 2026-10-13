/* General Traders (GM-CRM) - Routes page: searchable route selector, List / Cards / Map views, drag-and-drop visiting order.
   Data: GA.ops (store gm_admin_v1). The visiting order of a route is the order of route.codes.
   Every change is written with GA.ops.save(), which shared/sync.js sends to the server (PUT /api/kv/gm_admin_v1).
   Loaded by admin/routes.html after shared/admin.js. */
(function () {
  'use strict';
  GA.guard();
  var O = GA.ops, esc = GA.esc, KEY = 'gm_admin_v1', ALL = '__all', LIST_PS = 50, CARD_PS = 12, MAP_MORE = 100;
  /* GM-ROUTES-PAGE-SIZE-FIX-v1 */
  var listPageSize = 50, cardPageSize = 12;
  var LIST_PAGE_SIZES = [25, 50, 100, 200], CARD_PAGE_SIZES = [12, 24, 48, 96];
  var LEAFLET_JS = '../shared/vendor/leaflet/leaflet.js', LEAFLET_CSS = '../shared/vendor/leaflet/leaflet.css';
  function $(i) { return document.getElementById(i); }
  function qs(s, el) { return (el || document).querySelector(s); }
  function qsa(s, el) { return [].slice.call((el || document).querySelectorAll(s)); }
  function enc(s) { return encodeURIComponent(String(s)); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }

  /* ---------- Icons (same style as GA.icon) ---------- */
  var I = {
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="5.5" r="1.7"/><circle cx="15" cy="5.5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18.5" r="1.7"/><circle cx="15" cy="18.5" r="1.7"/></g>',
    dots: '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></g>',
    eye: '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    top: '<path d="M5 4h14"/><path d="M12 20V9"/><path d="M6 14l6-6 6 6"/>',
    up: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
    bottom: '<path d="M5 20h14"/><path d="M12 4v11"/><path d="M6 10l6 6 6-6"/>',
    swap: '<path d="M4 7h14l-3-3"/><path d="M20 17H6l3 3"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    print: '<path d="M6 9V3h12v6"/><path d="M6 18H4v-7h16v7h-2"/><path d="M7 14h10v7H7z"/>',
    merge: '<path d="M6 4v5a6 6 0 0 0 6 6h6"/><path d="M15 11l4 4-4 4"/><path d="M6 20V9"/>',
    store: '<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };
  function ic(n, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + I[n] + '</svg>'; }

  /* ---------- State ---------- */
  var S, byCode = {}, added = {}, ver = 0, memo = { k: null, v: null }, smemo = { k: null, v: null };
  var cur = null, view = 'list', q = '', sortBy = 'order', pgCards = 1, pgList = 1, mapShown = MAP_MORE;
  var selCode = null, flashCode = null, stale = { list: 1, cards: 1, map: 1 }, mapFit = true, storeError = '';
  var PALETTE = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#DB2777', '#059669', '#DC2626', '#0891B2'];

  function load() {
    var s = null;
    try { s = O.get(); } catch (e) { s = null; }
    if (!s || !Array.isArray(s.routes) || !Array.isArray(s.customers)) throw new Error('Route data could not be read');
    s.routes.forEach(function (r) { if (!Array.isArray(r.codes)) r.codes = []; });
    S = s; reindex();
  }
  function reindex() {
    byCode = {}; added = {};
    S.customers.forEach(function (c, i) { var k = 'k' + c.code; if (!(k in byCode)) { byCode[k] = c; added[k] = i; } });
    ver++;
  }
  function cust(code) { return byCode['k' + code]; }
  function routeById(id) { for (var i = 0; i < S.routes.length; i++) if (S.routes[i].id === id) return S.routes[i]; return null; }
  function route() { return cur === ALL ? null : routeById(cur); }
  function coord(c) {
    if (!c || c.lat == null || c.lng == null || c.lat === '' || c.lng === '') return null;
    var la = +c.lat, lo = +c.lng;
    if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    return [la, lo];
  }
  function photoOf(c) {
    var p = c && (c.photo || c.image || c.img);
    if (typeof p !== 'string') return '';
    p = p.trim();
    return /^(https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,|\.{1,2}\/|\/(?!\/))/i.test(p) ? p : '';
  }
  function telOf(c) { return String((c && c.phone) || '').replace(/[^\d+]/g, ''); }
  function totalShops() { return S.routes.reduce(function (a, r) { return a + r.codes.length; }, 0); }
  function az(a, b) { return String(a.name).localeCompare(String(b.name)); }

  function mk(code, r, i) { var c = cust(code); return { code: code, r: r, i: i, n: i + 1, c: c || { code: code, name: code, missing: true } }; }
  function baseItems() {
    var out = [];
    if (cur === ALL) S.routes.forEach(function (r) { r.codes.forEach(function (code, i) { out.push(mk(code, r, i)); }); });
    else { var r = route(); if (r) r.codes.forEach(function (code, i) { out.push(mk(code, r, i)); }); }
    return out;
  }
  // The shops shown on screen: search + display sort. Display sorting never changes the saved visiting order.
  function viewItems() {
    var k = ver + '|' + cur + '|' + q + '|' + sortBy;
    if (memo.k === k) return memo.v;
    var L = baseItems(), needle = q.toLowerCase(), digits = q.replace(/\D/g, '');
    if (q) L = L.filter(function (x) {
      var c = x.c, hay = (c.name + ' ' + x.code + ' ' + (c.address || '') + ' ' + (c.place || '') + ' ' + (c.phone || '') + ' ' + (c.phone2 || '') + (cur === ALL ? ' ' + x.r.name : '')).toLowerCase();
      if (hay.indexOf(needle) > -1) return true;
      return digits.length >= 3 && (String(c.phone || '') + String(c.phone2 || '')).replace(/\D/g, '').indexOf(digits) > -1;
    });
    if (sortBy === 'az') L = L.slice().sort(function (a, b) { return String(a.c.name).localeCompare(String(b.c.name)); });
    else if (sortBy === 'za') L = L.slice().sort(function (a, b) { return String(b.c.name).localeCompare(String(a.c.name)); });
    else if (sortBy === 'new') L = L.slice().sort(function (a, b) { return (added['k' + b.code] || 0) - (added['k' + a.code] || 0); });
    else if (sortBy === 'old') L = L.slice().sort(function (a, b) { return (added['k' + a.code] || 0) - (added['k' + b.code] || 0); });
    memo = { k: k, v: L }; return L;
  }
  function stats() {
    var k = ver + '|' + cur;
    if (smemo.k === k) return smemo.v;
    var L = baseItems(), s = { n: L.length, phone: 0, pin: 0, off: 0, areas: {}, na: 0 };
    L.forEach(function (x) { var c = x.c; if (c.phone) s.phone++; if (coord(c)) s.pin++; if (c.inactive) s.off++; if (c.area) { if (!s.areas[c.area]) s.na++; s.areas[c.area] = (s.areas[c.area] || 0) + 1; } });
    smemo = { k: k, v: s }; return s;
  }
  function areaLabel(s) {
    if (!s.na) return '-';
    var top = Object.keys(s.areas).sort(function (a, b) { return s.areas[b] - s.areas[a]; })[0];
    return s.na === 1 ? top : top + ' +' + (s.na - 1) + ' more';
  }
  function canDrag() { return cur !== ALL && sortBy === 'order' && !q && !!route(); }

  /* ---------- Saving: GA.ops.save -> shared/sync.js -> server ---------- */
  var sync = { state: 'idle', t: null, msg: '' };
  function persistLocal() {
    try { O.save(S); return localStorage.getItem(KEY) === JSON.stringify(S); } catch (e) { return false; }
  }
  // Runs fn on the latest saved data, then saves. Returns true when the change was saved on this device.
  function commitOp(fn, o) {
    o = o || {};
    try { load(); } catch (e) { toast('Could not read the route data. Reload the page.', 'err'); showFatal(e); return false; }
    var r;
    try { r = fn(); } catch (e) { console.error(e); r = false; }
    if (r === false) { if (o.noop) toast(o.noop, 'info'); renderAll(); return false; }
    if (!persistLocal()) {
      try { load(); } catch (e) {}
      renderAll();
      toast((o.fail || 'The change could not be saved.') + ' This browser could not store the data.', 'err');
      return false;
    }
    reindex(); stale = { list: 1, cards: 1, map: 1 };
    if (o.flash) flashCode = o.flash;
    if (o.after) { try { o.after(); } catch (e) { console.error(e); } }
    renderAll();
    track(o.ok || '');
    return true;
  }
  function setSync(state) {
    sync.state = state;
    var el = $('rtSync'), ban = $('rtBanner'); if (!el) return;
    var map = {
      idle: ['', ''],
      saving: ['<span class="rt-spin" aria-hidden="true"></span>Saving\u2026', ''],
      saved: [ic('check') + 'All changes saved', 'saved'],
      offline: [ic('alert') + 'Not saved to the server yet', 'warn'],
      local: [ic('alert') + 'Saved on this device only', 'warn']
    }, m = map[state] || map.idle;
    el.innerHTML = m[0]; el.className = 'rt-sync ' + m[1];
    var bad = state === 'offline' || state === 'local';
    ban.hidden = !bad;
    if (bad) {
      ban.className = 'rt-banner noprint';
      ban.innerHTML = ic('alert') + '<span>' + (state === 'offline'
        ? 'The server cannot be reached. Your change is kept on this device and is sent again automatically every few seconds.'
        : 'Server sync is not running (open the app from the General Traders server address). Changes are kept on this device only.') + '</span>';
    }
  }
  function track(msg) {
    if (!window.__gmSync) { setSync('local'); if (msg) toast(msg + ' (this device only)', 'warn'); return; }
    sync.msg = msg; setSync('saving');
    clearTimeout(sync.t);
    sync.t = setTimeout(function () {
      if (sync.state === 'saving') { setSync('offline'); toast('Saved on this device. The server is not answering, so it will keep trying.', 'warn'); sync.msg = ''; }
    }, 7000);
  }
  window.addEventListener('gm-sync-saved', function (e) {
    var d = e.detail || {}; if (d.key !== KEY || d.dirty) return;
    clearTimeout(sync.t);
    var was = sync.state; setSync('saved');
    if (sync.msg) { toast(sync.msg, 'ok'); sync.msg = ''; }
    else if (was === 'offline') toast('Back online. Your changes are saved to the server.', 'ok');
    if (window.__rtLate && !dnd && !kb) { window.__rtLate = false; refreshFromStore(); }
  });
  window.addEventListener('gm-sync-failed', function (e) {
    var d = e.detail || {}; if (d.key !== KEY) return;
    if (sync.state === 'saving' || sync.state === 'saved' || sync.state === 'offline') { clearTimeout(sync.t); setSync('offline'); }
  });
  // Changes made on another device or tab arrive through sync.js.
  var busyDrag = false;
  window.addEventListener('gm-sync', function () {
    if (busyDrag || dnd || kb || sync.state === 'saving') { window.__rtLate = true; return; }
    refreshFromStore();
  });
  function refreshFromStore() {
    try { load(); } catch (e) { return; }
    if (cur !== ALL && !route()) cur = ALL;
    stale = { list: 1, cards: 1, map: 1 }; renderAll();
  }

  /* ---------- Toasts, live announcements, dialogs ---------- */
  function say(t) { var l = $('rtLive'); if (!l) return; l.textContent = ''; setTimeout(function () { l.textContent = t; }, 30); }
  function toast(msg, kind, action) {
    var host = $('rtToasts'); if (!host) return;
    var t = document.createElement('div'), k = kind || 'info';
    t.className = 'rt-toast ' + k; t.setAttribute('role', k === 'err' ? 'alert' : 'status');
    t.innerHTML = '<span class="rt-t-i">' + ic(k === 'ok' ? 'check' : k === 'info' ? 'info' : 'alert') + '</span><span class="rt-t-m">' + esc(msg) + '</span>' +
      (action ? '<button type="button" class="rt-t-a">' + esc(action.label) + '</button>' : '') + '<button type="button" class="rt-t-x" aria-label="Dismiss">' + ic('x') + '</button>';
    function gone() { if (t.parentNode) t.parentNode.removeChild(t); }
    qs('.rt-t-x', t).onclick = gone;
    if (action) qs('.rt-t-a', t).onclick = function () { gone(); action.fn(); };
    while (host.children.length >= 3) host.removeChild(host.firstChild);
    host.appendChild(t); setTimeout(gone, k === 'err' ? 9000 : action ? 8000 : 4500);
  }
  var modalFrom = null;
  function openModal(html) {
    modalFrom = document.activeElement;
    $('mc').innerHTML = '<div class="modal-handle"></div>' + html; $('mo').classList.add('active');
  }
  function closeModal() {
    $('mo').classList.remove('active'); $('mc').innerHTML = '';
    if (modalFrom && modalFrom.focus && document.contains(modalFrom)) { try { modalFrom.focus(); } catch (e) {} }
    modalFrom = null;
  }
  function confirmBox(o, yes) {
    openModal('<div class="card-title" role="heading" aria-level="2">' + esc(o.title) + '</div><p class="mu" style="margin:0 0 16px;font-size:14px;line-height:1.5">' + o.text + '</p>' +
      '<div class="btn-group"><button type="button" class="btn btn-secondary a-btn" id="cfNo">Cancel</button><button type="button" class="btn a-btn' + (o.danger ? ' btn-danger' : '') + '" id="cfOk">' + esc(o.ok) + '</button></div>');
    $('cfNo').onclick = closeModal; $('cfOk').onclick = function () { closeModal(); yes(); }; $('cfNo').focus();
  }
  function showFatal(e) {
    console.error(e);
    var v = $('rtViews'); if (!v) return;
    v.innerHTML = '<div class="rt-empty"><div class="ei">' + ic('alert') + '</div><b>The routes could not be loaded</b>' + esc(e && e.message ? e.message : 'Unknown error') + '<br><button class="btn a-btn" type="button" onclick="location.reload()">Reload page</button></div>';
  }

  /* ---------- Page shell ---------- */
  var pg = GA.mount('routes.html', 'Routes');
  pg.innerHTML =
    '<div class="rt rt-screen" id="rt">' +
    '<div class="rt-bar noprint">' +
      '<div class="rt-selwrap"><button type="button" class="rt-sel" id="rtSel" aria-haspopup="listbox" aria-expanded="false" aria-controls="rtPop"></button>' +
        '<div class="rt-pop" id="rtPop" hidden role="dialog" aria-label="Choose a route"><div class="rt-pop-h"><div class="rt-pop-handle"></div><div class="field a-f">' + ic('search') +
          '<input id="rtSelQ" type="text" role="combobox" aria-expanded="true" aria-controls="rtOpts" aria-autocomplete="list" aria-label="Search routes" placeholder="Search routes" autocomplete="off" spellcheck="false"></div></div>' +
          '<ul class="rt-opts" id="rtOpts" role="listbox" aria-label="Routes"></ul><div class="rt-pop-f" id="rtPopF"></div></div></div>' +
      '<div class="a-seg rt-views" role="group" aria-label="Choose a view">' +
        '<button type="button" data-v="cards" aria-pressed="false">' + ic('grid') + 'Cards</button>' +
        '<button type="button" data-v="list" aria-pressed="false">' + ic('list') + 'List</button>' +
        '<button type="button" data-v="map" aria-pressed="false">' + ic('map') + 'Map</button></div>' +
      '<span class="rt-sync" id="rtSync" role="status" aria-live="polite"></span>' +
    '</div>' +
    '<div class="rt-banner noprint" id="rtBanner" hidden role="alert"></div>' +
    '<div class="card rt-head" id="rtHead"></div>' +
    '<div class="card rt-main" id="rtMain">' +
      '<div class="field a-f noprint" id="rtQBox" data-act style="width:190px;height:38px"><input type="search" id="rtQ" placeholder="Search shop..." aria-label="Search shop name, code or phone" autocomplete="off"></div>' + '<div class="rt-tools noprint" id="rtTools">' +
                '<div class="field a-f rt-sort"><select id="rtSort" aria-label="Sort shops"><option value="order">Sort: Visiting order</option><option value="az">Sort: A to Z</option><option value="za">Sort: Z to A</option><option value="new">Sort: Newest added</option><option value="old">Sort: Oldest added</option></select></div>' +
        '<span class="rt-hint" id="rtHint"></span></div>' +
      '<div id="rtViews"><section id="vList" hidden></section><section id="vCards" hidden></section>' +
        '<section id="vMap" hidden><div class="rt-mapwrap"><aside class="rt-maplist" id="rtMapList" aria-label="Shops on this route"></aside>' +
        '<div class="rt-mapbox"><div id="rtMap" role="application" aria-label="Map of shops on this route"></div><div class="rt-map-over" id="rtMapOver" hidden></div>' +
        '<div class="rt-map-tools"><button type="button" id="rtFit" aria-label="Fit map to all markers">' + ic('fit') + 'Fit all</button></div></div></div></section></div>' +
    '</div>' +
    '<div class="noprint rt-foot"><button class="r-demo" id="demo" type="button">Load demo data</button></div></div>' +
    '<div class="rt-print" id="rtPrint"></div>' +
    '<div class="modal-overlay a-c" id="mo"><div class="modal-sheet" id="mc" role="dialog" aria-modal="true"></div></div>' +
    '<div class="rt-menu" id="rtMenu" role="menu" hidden></div><div class="rt-scrim" id="rtScrim" hidden></div><div class="rt-sheet" id="rtSheet" role="dialog" aria-modal="true" hidden></div>' +
    '<div class="rt-toasts" id="rtToasts"></div><div class="rt-sr" id="rtLive" role="status" aria-live="polite"></div>' +
    '<div class="rt-sr" id="rtDndHelp">Drag to change the visiting order, or press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel. The action menu also has Move to top, up, down and bottom.</div>';

  /* ---------- Route selector (searchable dropdown) ---------- */
  var selOpen = false, selActive = 0, selList = [];
  function isSmall() { return window.matchMedia && window.matchMedia('(max-width:640px)').matches; }
  function renderSelBtn() {
    var b = $('rtSel'), r = route(), none = !S.routes.length;
    var name = none ? 'No routes yet' : cur === ALL ? 'All routes' : (r ? r.name : 'Choose a route');
    var n = cur === ALL ? totalShops() : r ? r.codes.length : 0;
    b.disabled = none;
    b.innerHTML = ic('pin', 'pin') + '<span class="rt-sel-name">' + esc(name) + '</span>' + (none ? '' : '<span class="rt-sel-n">(' + plural(n, 'shop') + ')</span>') + ic('chev', 'chev');
    b.setAttribute('aria-label', 'Route: ' + name + (none ? '' : ', ' + plural(n, 'shop') + '. Change route'));
  }
  function selFilter() {
    var f = $('rtSelQ').value.trim().toLowerCase(), L = [];
    if (!f || 'all routes'.indexOf(f) > -1) L.push({ id: ALL, name: 'All routes', n: totalShops(), all: true });
    S.routes.slice().sort(az).forEach(function (r) { if (!f || r.name.toLowerCase().indexOf(f) > -1) L.push({ id: r.id, name: r.name, n: r.codes.length }); });
    selList = L;
    var at = -1; L.forEach(function (x, i) { if (x.id === cur) at = i; });
    if (selActive >= L.length) selActive = 0;
    return at;
  }
  function selDraw(scroll) {
    var ul = $('rtOpts');
    ul.innerHTML = selList.length ? selList.map(function (x, i) {
      return '<li role="option" id="rtO' + i + '" class="rt-opt' + (x.all ? ' all' : '') + (i === selActive ? ' act' : '') + '" aria-selected="' + (x.id === cur) + '" data-id="' + esc(x.id) + '">' +
        '<span class="rt-o-name">' + esc(x.name) + '</span>' + (!x.all && x.n <= 1 ? '<span class="rt-o-low" title="Only ' + plural(x.n, 'shop') + '"></span>' : '') +
        '<span class="rt-o-n">' + plural(x.n, 'shop') + '</span><span class="rt-o-ck">' + (x.id === cur ? ic('check') : '') + '</span></li>';
    }).join('') : '<li class="rt-opt" role="presentation" style="cursor:default;color:var(--muted)">No route matches \u201c' + esc($('rtSelQ').value.trim()) + '\u201d.</li>';
    $('rtSelQ').setAttribute('aria-activedescendant', selList.length ? 'rtO' + selActive : '');
    $('rtPopF').textContent = plural(S.routes.length, 'route') + ' \u00b7 ' + plural(totalShops(), 'shop');
    if (scroll) { var el = $('rtO' + selActive); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
  }
  function openSel() {
    if (selOpen || !S.routes.length) return;
    selOpen = true; $('rtSelQ').value = ''; var at = selFilter(); selActive = at > -1 ? at : 0;
    $('rtPop').hidden = false; $('rtSel').setAttribute('aria-expanded', 'true');
    if (isSmall()) { $('rtScrim').hidden = false; document.body.style.overflow = 'hidden'; }
    selDraw(true); setTimeout(function () { $('rtSelQ').focus(); }, 0);
  }
  function closeSel(back) {
    if (!selOpen) return;
    selOpen = false; $('rtPop').hidden = true; $('rtSel').setAttribute('aria-expanded', 'false');
    if (!menuOpen) { $('rtScrim').hidden = true; document.body.style.overflow = ''; }
    if (back) $('rtSel').focus();
  }
  function chooseRoute(id) { closeSel(true); if (id === cur) return; setRoute(id); }
  $('rtSel').onclick = function () { selOpen ? closeSel(true) : openSel(); };
  $('rtSelQ').oninput = function () { selActive = 0; selFilter(); selDraw(true); };
  $('rtSelQ').onkeydown = function (e) {
    var k = e.key, n = selList.length;
    if (k === 'ArrowDown') { e.preventDefault(); if (n) { selActive = (selActive + 1) % n; selDraw(true); } }
    else if (k === 'ArrowUp') { e.preventDefault(); if (n) { selActive = (selActive - 1 + n) % n; selDraw(true); } }
    else if (k === 'Home') { e.preventDefault(); selActive = 0; selDraw(true); }
    else if (k === 'End') { e.preventDefault(); selActive = Math.max(0, n - 1); selDraw(true); }
    else if (k === 'Enter') { e.preventDefault(); if (selList[selActive]) chooseRoute(selList[selActive].id); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSel(true); }
    else if (k === 'Tab') closeSel(false);
  };
  $('rtOpts').onclick = function (e) { var li = e.target.closest('.rt-opt[data-id]'); if (li) chooseRoute(li.dataset.id); };
  $('rtOpts').onmousemove = function (e) { var li = e.target.closest('.rt-opt[data-id]'); if (!li) return; var i = +li.id.slice(3); if (i !== selActive) { var o = qs('.rt-opt.act', $('rtOpts')); if (o) o.classList.remove('act'); selActive = i; li.classList.add('act'); $('rtSelQ').setAttribute('aria-activedescendant', li.id); } };
  document.addEventListener('mousedown', function (e) { if (selOpen && !e.target.closest('.rt-selwrap')) closeSel(false); });
  $('rtScrim').onclick = function () { if (selOpen) closeSel(true); if (menuOpen) closeMenu(true); };

  function setRoute(id) {
    cur = id; q = ''; pgCards = 1; pgList = 1; mapShown = MAP_MORE; selCode = null; mapFit = true;
    $('rtQ').value = ''; stale = { list: 1, cards: 1, map: 1 };
    renderAll(); writeHash(); say('Showing ' + (id === ALL ? 'all routes' : (route() ? route().name : '')));
  }
  function setView(v) {
    view = v; writeHash(); renderAll();
    if (v === 'map') showMap();
  }
  qsa('.rt-views button').forEach(function (b) { b.onclick = function () { setView(b.dataset.v); }; });

  /* ---------- Heading, tools ---------- */
  function renderHead() {
    var s = stats(), all = cur === ALL, r = route(), n = s.n, none = !S.routes.length, h = $('rtHead'); var qb = $('rtQBox');
    if (none) {
      GA.clearActs(); if (qb) $('aActs').appendChild(qb);
      h.innerHTML = '<div class="rt-empty"><div class="ei">' + ic('route') + '</div><b>No routes yet</b>Create a route and choose the shops that belong on it, or give customers an Area on the Customers page.<br>' +
        '<button class="btn a-btn" id="addB" type="button">' + ic('plus') + ' Add route</button></div>';
      $('addB').onclick = openAdd; return;
    }
    GA.clearActs(); if (qb) $('aActs').appendChild(qb);
    h.innerHTML =
      '<div class="rt-top"><div style="flex:1;min-width:200px"><h2>' + (all ? 'All routes' : esc(r ? r.name : '')) + '</h2>' +
      '<div class="rt-sub">' + (all ? 'Every shop that is on a route. Open one route to change its visiting order.' : 'Shops in visiting order.') + '</div></div>' +
      '<div class="rt-acts noprint" data-act><button type="button" class="btn btn-secondary a-btn" id="prn">' + ic('print') + ' Print</button>' +
      (all ? '' : '<button type="button" class="btn btn-secondary a-btn" id="mgB">' + ic('merge') + ' Merge into...</button>') +
      '<button type="button" class="btn a-btn" id="addB">' + ic('plus') + ' Add route</button>' +
      (all ? '' : '<button type="button" class="btn btn-danger a-btn" id="rDel">' + ic('trash') + ' Delete route</button>') + '</div></div>' +
      '<div class="rt-merge noprint" id="mgP"><span class="mu">Move all shops from this route into</span><div class="field a-f" style="width:220px;max-width:100%"><select id="mgS" aria-label="Route to merge into"></select></div><button type="button" class="btn a-btn" id="mgOk">Merge</button><button type="button" class="btn btn-secondary a-btn" id="mgNo">Cancel</button></div>' +
      '<div class="rt-figs">' + ((!all && r && String(areaLabel(s)).toLowerCase() === String(r.name).toLowerCase()) ? '' : '<div><b>' + esc(areaLabel(s)) + '</b>Area</div>') + '<div><b>' + n + '</b>Total shops</div><div class="' + (s.phone < n ? 'w' : '') + '"><b>' + s.phone + '</b>With phone</div><div class="' + (s.pin < n ? 'w' : '') + '"><b>' + s.pin + '</b>With map pin</div><div><b>' + s.off + '</b>Inactive</div></div>';
    GA.hoist(h);
    $('prn').onclick = doPrint; $('addB').onclick = openAdd;
    if (!all) {
      $('rDel').onclick = delRoute;
      $('mgB').onclick = function () {
        var o = S.routes.filter(function (x) { return x !== r; }).sort(az);
        if (!o.length) { toast('Add another route first, then merge into it.', 'info'); return; }
        $('mgS').innerHTML = o.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join(''); $('mgP').style.display = 'flex'; $('mgS').focus();
      };
      $('mgNo').onclick = function () { $('mgP').style.display = 'none'; };
      $('mgOk').onclick = doMerge;
    }
  }
  function renderTools() {
    var L = viewItems(), base = stats().n, drag = canDrag(), h = $('rtHint');
    $('rtTools').style.display = (!S.routes.length || (!base && !q)) ? 'none' : ''; $('rtQBox').style.display = $('rtTools').style.display;
    $('rtSort').value = sortBy;
    var t = '';
    if (view === 'list' && cur !== ALL) t = drag ? 'Drag the \u283f handle to change the visiting order. Changes are saved automatically.' : 'Reordering by drag is paused while searching or sorting. Clear the search and sort by Visiting order to drag.';
    else if (view === 'map') t = 'The map always shows the whole route. Numbers are the visiting order.';
    else if (q || sortBy !== 'order') t = 'Display only. The saved visiting order is not changed.';
    h.textContent = t;
    if (q || sortBy !== 'order') h.textContent = (t ? t + ' ' : '') + plural(L.length, 'shop') + ' shown.';
  }
  var qTimer = null;
  $('rtQ').oninput = function () {
    var v = this.value.trim(); clearTimeout(qTimer);
    qTimer = setTimeout(function () { q = v; pgCards = 1; pgList = 1; mapShown = MAP_MORE; stale = { list: 1, cards: 1, map: 1 }; renderAll(); }, 160);
  };
  $('rtSort').onchange = function () { sortBy = this.value; pgCards = 1; pgList = 1; mapShown = MAP_MORE; stale = { list: 1, cards: 1, map: 1 }; renderAll(); };

  /* ---------- Shared bits ---------- */
  function emptyState(L) {
    var base = stats().n;
    if (!base) return '<div class="rt-empty"><div class="ei">' + ic('store') + '</div><b>' + (cur === ALL ? 'No shops on routes yet' : 'No shops on this route') + '</b>Use Add route to pick shops, or give customers an Area on the Customers page.</div>';
    if (!L.length) return '<div class="rt-empty"><div class="ei">' + ic('search') + '</div><b>No shop matches \u201c' + esc(q) + '\u201d</b>Try a different name, code or phone number.<br><button type="button" class="btn btn-secondary a-btn" data-act="clearq">Clear search</button></div>';
    return '';
  }
  function mapChip(c) { return coord(c) ? '<span class="rt-chip pin">' + ic('pin') + 'On map</span>' : '<span class="rt-chip nopin">No map pin</span>'; }
  function phoneHtml(c) { var t = telOf(c); return t ? '<a class="rt-tel" href="tel:' + esc(t) + '" aria-label="Call ' + esc(c.name) + '">' + esc(c.phone) + '</a>' : '<span class="rt-none">No phone</span>'; }
  function pageList(total, page, size) {
    var pages = Math.max(1, Math.ceil(total / size)), p = Math.min(Math.max(1, page), pages);
    return { pages: pages, p: p, from: (p - 1) * size, to: Math.min(total, p * size) };
  }
  /* GM-ROUTES-PAGER-FIX-v1 */
  function pagerHtml(total, P, kind) {
    var isCards = kind === 'cards';
    var size = isCards ? cardPageSize : listPageSize;
    var choices = isCards ? CARD_PAGE_SIZES : LIST_PAGE_SIZES;
    var sizeOptions = choices.map(function (n) {
      return '<option value="' + n + '"' + (n === size ? ' selected' : '') + '>' + n + '</option>';
    }).join('');

    var pages = Math.max(1, Math.ceil(total / size));
    var p = Math.min(Math.max(1, P.p), pages);
    var from = total ? ((p - 1) * size + 1) : 0;
    var to = Math.min(total, p * size);

    var nums = [], i;
    for (i = 1; i <= pages; i++) {
      if (pages <= 7 || i === 1 || i === pages || Math.abs(i - p) <= 1) nums.push(i);
    }

    var out = '', last = 0;
    nums.forEach(function (n) {
      if (last && n - last > 1) out += '<span class="gap far" aria-hidden="true">…</span>';
      out += '<button type="button" data-pg="' + n + '"' +
        ' class="' + (Math.abs(n - p) > 1 && n !== 1 && n !== pages ? 'far' : '') + '"' +
        (n === p ? ' aria-current="page"' : '') +
        ' aria-label="Page ' + n + '">' + n + '</button>';
      last = n;
    });

    return '<nav class="rt-pager noprint" aria-label="' + (isCards ? 'Shop cards' : 'Shop list') +
      ' pages" data-kind="' + kind + '">' +
      '<span class="rt-pg-info">Showing ' + from + '–' + to + ' of ' + total + '</span>' +
      '<label class="rt-page-size">Shops per page' +
      '<select data-pagesize="' + kind + '" aria-label="Shops per page">' + sizeOptions + '</select>' +
      '</label>' +
      '<div class="rt-pg">' +
      '<button type="button" data-pg="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + '>Previous</button>' +
      out +
      '<button type="button" data-pg="' + (p + 1) + '"' + (p >= pages ? ' disabled' : '') + '>Next</button>' +
      '</div></nav>';
  }

  /* ---------- List view ---------- */
  function renderList() {
    var el = $('vList'), L = viewItems(), all = cur === ALL, e = emptyState(L);
    if (e) { el.innerHTML = e; return; }
    var P = pageList(L.length, pgList, listPageSize); pgList = P.p;
    var part = L.slice(P.from, P.to), drag = canDrag(), rows = part.map(function (x) {
      var c = x.c, nm = String(c.name), addr = c.address || c.place || '';
      return '<div class="rt-row' + (c.inactive ? ' is-inactive' : '') + '" role="row" data-code="' + esc(x.code) + '" data-i="' + x.i + '">' +
        '<div class="rt-c-n" role="cell"><span class="n" aria-label="Visit order">' + x.n + '</span></div>' +
        '<div class="rt-c-g" role="cell"><button type="button" class="rt-grip" data-act="grip" aria-describedby="rtDndHelp" aria-disabled="' + (!drag) + '" aria-label="Reorder ' + esc(nm) + ', position ' + x.n + ' of ' + (all ? x.r.codes.length : L.length) + '" title="' + (drag ? 'Drag to reorder' : 'Clear search and sort by Visiting order to drag') + '">' + ic('grip') + '</button></div>' +
        '<div class="rt-c-s" role="cell"><b class="rt-name">' + esc(nm) + '</b>' + (c.inactive ? ' <span class="badge b-danger">Inactive</span>' : '') + (c.missing ? ' <span class="badge b-accent">Not in Customers</span>' : '') + (addr ? '<span class="rt-addr" title="' + esc(addr) + '">' + esc(addr) + '</span>' : '') + '</div>' +
        '<div class="rt-meta"><div class="rt-c-c" role="cell"><span class="badge b-info">' + esc(x.code) + '</span></div>' +
        (all ? '<div class="rt-c-r" role="cell">' + esc(x.r.name) + '</div>' : '') +
        '<div class="rt-c-p" role="cell">' + phoneHtml(c) + '</div>' +
        '<div class="rt-c-m" role="cell">' + (coord(c) ? '<a class="rt-maplink" href="#" data-act="onmap" data-code="' + esc(x.code) + '" title="Show on the map">View on map</a>' : '<span class="rt-chip nopin">No map pin</span>') + '</div></div>' +
        '<div class="rt-c-a" role="cell"><button type="button" class="rt-dots" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ' + esc(nm) + '" title="Actions">' + ic('dots') + '</button></div></div>';
    }).join('');
    el.innerHTML = '<div class="rt-list' + (all ? ' all' : '') + '" role="table" aria-label="Shops on ' + (all ? 'all routes' : esc(route().name)) + ', in ' + (sortBy === 'order' ? 'visiting order' : 'display order') + '">' +
      '<div class="rt-lh" role="row"><div role="columnheader">Order</div><div role="columnheader"><span class="rt-sr">Drag handle</span></div><div role="columnheader">Shop</div><div role="columnheader">Code</div>' + (all ? '<div role="columnheader">Route</div>' : '') + '<div role="columnheader">Phone</div><div role="columnheader">Map</div><div role="columnheader" style="text-align:right"><span class="rt-sr">Actions</span></div></div>' +
      '<div class="rt-rows" id="rtRows" role="rowgroup">' + rows + '</div></div>' + pagerHtml(L.length, P, 'list');
  }

  /* ---------- Cards view ---------- */
  function renderCards() {
    var el = $('vCards'), L = viewItems(), e = emptyState(L);
    if (e) { el.innerHTML = e; return; }
    var P = pageList(L.length, pgCards, cardPageSize); pgCards = P.p;
    el.innerHTML = '<div class="rt-grid" role="list">' + L.slice(P.from, P.to).map(function (x) {
      var c = x.c, ph = photoOf(c), nm = String(c.name);
      return '<article class="rt-cx' + (c.inactive ? ' is-inactive' : '') + '" role="listitem" data-code="' + esc(x.code) + '"><div class="rt-ph">' +
        (ph ? '<img src="' + esc(ph) + '" alt="Photo of ' + esc(nm) + '" loading="lazy" decoding="async">' : '') +
        '<div class="rt-noph"' + (ph ? ' hidden' : '') + '>' + ic('store') + '<small>No photo</small></div>' +
        '<span class="rt-ord" title="Visiting order">' + x.n + '</span>' +
        '<button type="button" class="rt-dots" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ' + esc(nm) + '" title="Actions">' + ic('dots') + '</button></div>' +
        '<div class="rt-cb"><h3 class="rt-cn" title="' + esc(nm) + '">' + esc(nm) + '</h3>' +
        '<div class="rt-cm"><span class="badge b-info">' + esc(x.code) + '</span>' + (c.inactive ? '<span class="badge b-danger">Inactive</span>' : '') + (cur === ALL ? '<span class="badge b-muted">' + esc(x.r.name) + '</span>' : '') + '</div>' +
        '<div class="rt-cl">' + phoneHtml(c) + mapChip(c) + '</div></div></article>';
    }).join('') + '</div>' + pagerHtml(L.length, P, 'cards');
  }
  // A photo that fails to load falls back to the placeholder.
  document.addEventListener('error', function (e) {
    var t = e.target; if (!t || t.tagName !== 'IMG' || !t.closest('.rt-ph')) return;
    var ph = t.parentNode.querySelector('.rt-noph'); t.style.display = 'none'; if (ph) ph.hidden = false;
  }, true);

  /* ---------- Map view (Leaflet + OpenStreetMap) ---------- */
  var M = { map: null, group: null, markers: {}, tiles: null, fails: 0, loading: false, cbs: [], ro: null }, mapFocus = null;
  function loadLeaflet(ok, fail) {
    if (window.L && L.map) return ok();
    M.cbs.push([ok, fail]);
    if (M.loading) return;
    M.loading = true;
    if (!qs('link[data-leaflet]')) { var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.setAttribute('data-leaflet', '1'); document.head.appendChild(css); }
    var s = document.createElement('script'); s.src = LEAFLET_JS; s.async = true;
    s.onload = function () { M.loading = false; var l = M.cbs; M.cbs = []; l.forEach(function (c) { c[0](); }); };
    s.onerror = function () { M.loading = false; if (s.parentNode) s.parentNode.removeChild(s); var l = M.cbs; M.cbs = []; l.forEach(function (c) { c[1](); }); };
    document.head.appendChild(s);
  }
  function initMap() {
    M.map = L.map('rtMap', { zoomControl: true, worldCopyJump: true, minZoom: 2 }).setView([20.5937, 78.9629], 4);
    M.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(M.map);
    M.tiles.on('tileerror', function () { M.fails++; if (M.fails === 4) toast('Map tiles could not be loaded. Check the internet connection. Markers and the route line still work.', 'warn'); });
    M.tiles.on('tileload', function () { M.fails = 0; });
    L.control.scale({ imperial: false }).addTo(M.map);
    M.group = L.layerGroup().addTo(M.map);
    if (window.ResizeObserver) { var t = null; M.ro = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { if (M.map && view === 'map') M.map.invalidateSize(); }, 80); }); M.ro.observe($('rtMap')); }
  }
  function mapOver(html) { var o = $('rtMapOver'); if (!html) { o.hidden = true; o.innerHTML = ''; return; } o.innerHTML = html; o.hidden = false; }
  function showMap() {
    if (view !== 'map') return;
    if (!M.map) mapOver('<span class="rt-spin" aria-hidden="true"></span><br>Loading map\u2026');
    loadLeaflet(function () {
      if (view !== 'map') return;
      if (!M.map) initMap();
      requestAnimationFrame(function () {
        if (!M.map) return;
        M.map.invalidateSize(); refreshMap(mapFit); mapFit = false;
        if (mapFocus) { var c = mapFocus; mapFocus = null; focusShop(c); }
      });
    }, function () {
      mapOver('<b>The map could not be loaded</b>The map files did not load. The shop list on the left still works.<br><button type="button" class="btn a-btn" id="mapRetry" style="margin-top:12px">Try again</button>');
      var b = $('mapRetry'); if (b) b.onclick = showMap;
    });
  }
  function refreshMap(fit) {
    if (!M.map) return;
    M.group.clearLayers(); M.markers = {};
    var items = baseItems(), byRoute = {}, order = [], pts = [], ri = {};
    S.routes.forEach(function (r, i) { ri[r.id] = i; });
    items.forEach(function (x) {
      var ll = coord(x.c); if (!ll) return;
      if (!byRoute[x.r.id]) { byRoute[x.r.id] = []; order.push(x.r.id); }
      byRoute[x.r.id].push({ x: x, ll: ll }); pts.push(ll);
    });
    var many = pts.length > 400;
    order.forEach(function (rid) {
      var arr = byRoute[rid], color = cur === ALL ? PALETTE[ri[rid] % PALETTE.length] : PALETTE[0];
      for (var k = 1; k < arr.length; k++) {
        var gap = arr[k].x.n - arr[k - 1].x.n > 1;   // a shop without a pin sits between these two stops
        L.polyline([arr[k - 1].ll, arr[k].ll], { color: color, weight: 3.5, opacity: .85, dashArray: gap ? '3 9' : null, lineCap: 'round', interactive: false }).addTo(M.group);
      }
    });
    order.forEach(function (rid) {
      var color = cur === ALL ? PALETTE[ri[rid] % PALETTE.length] : PALETTE[0];
      byRoute[rid].forEach(function (p) { addMarker(p, color, many); });
    });
    var base = stats().n;
    if (!pts.length) {
      mapOver(!base ? '<b>No shops to show</b>This route has no shops yet.' : '<b>No shops with a map pin</b>None of the ' + plural(base, 'shop') + ' on this route has a location yet. Add a location pin to a shop on the Customers page and it will appear here.');
      M.map.setView([20.5937, 78.9629], 4);
    } else {
      mapOver('');
      if (fit) fitMap(pts);
    }
    if (selCode) markSelected(selCode);
  }
  function fitMap(pts) {
    pts = pts || Object.keys(M.markers).map(function (k) { return M.markers[k].getLatLng(); });
    if (!pts.length) return;
    if (pts.length === 1) M.map.setView(pts[0], 15); else M.map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 16 });
  }
  function addMarker(p, color, many) {
    var x = p.x, c = x.c, m;
    if (many) m = L.circleMarker(p.ll, { radius: 6, color: '#fff', weight: 2, fillColor: c.inactive ? '#64748B' : color, fillOpacity: 1 });
    else m = L.marker(p.ll, {
      icon: L.divIcon({ className: 'rt-pinwrap', html: '<span class="rt-pin' + (x.n > 99 ? ' big' : '') + (c.inactive ? ' off' : '') + '" style="--pc:' + color + '">' + x.n + '</span>', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -17] }),
      title: x.n + '. ' + c.name, alt: 'Stop ' + x.n + ': ' + c.name, keyboard: true, riseOnHover: true
    });
    m.bindPopup(function () { return popupHtml(x); }, { maxWidth: 260, minWidth: 220, autoPanPadding: [30, 30] });
    m.on('click', function () { markSelected(x.code); });
    m.addTo(M.group); M.markers[x.code] = m;
  }
  function popupHtml(x) {
    var c = x.c, ph = photoOf(c), ll = coord(c), nm = String(c.name);
    return '<div class="rt-pp">' + (ph ? '<div class="rt-ph"><img src="' + esc(ph) + '" alt="Photo of ' + esc(nm) + '" loading="lazy" decoding="async"><div class="rt-noph" hidden>' + ic('store') + '<small>No photo</small></div></div>' : '') +
      '<div class="rt-pp-b"><b>' + esc(nm) + '</b><span class="mu">' + esc(x.code) + ' \u00b7 Stop ' + x.n + ' \u00b7 ' + esc(x.r.name) + '</span>' + (c.address ? '<span class="mu">' + esc(c.address) + '</span>' : '') +
      '<div>' + phoneHtml(c) + '</div><div class="rt-pp-r">' +
      (ll ? '<a class="pri" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + ll[0] + ',' + ll[1] + '">Directions</a><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + ll[0] + '&mlon=' + ll[1] + '#map=18/' + ll[0] + '/' + ll[1] + '">OpenStreetMap</a>' : '') +
      (c.missing ? '' : '<a href="customers.html?code=' + enc(x.code) + '">View shop</a>') +
      '<button type="button" data-act="menu" data-code="' + esc(x.code) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ' + esc(nm) + '">' + ic('dots') + '</button></div></div></div>';
  }
  function markSelected(code) {
    var old = M.markers[selCode];
    if (old && old.getElement && old.getElement()) { var o = qs('.rt-pin', old.getElement()); if (o) o.classList.remove('sel'); }
    selCode = code;
    var m = M.markers[code];
    if (m && m.getElement && m.getElement()) { var n = qs('.rt-pin', m.getElement()); if (n) n.classList.add('sel'); }
    qsa('.rt-ml', $('rtMapList')).forEach(function (el) {
      var on = el.dataset.code === code; el.classList.toggle('sel', on);
      if (on && el.scrollIntoView) { var p = $('rtMapList'), r = el.getBoundingClientRect(), pr = p.getBoundingClientRect(); if (r.top < pr.top || r.bottom > pr.bottom) { if (!isSmall()) p.scrollTop += (r.top - pr.top) - pr.height / 2 + r.height / 2; } }
    });
  }
  function focusShop(code) {
    var it = baseItems().filter(function (x) { return x.code === code; })[0];
    markSelected(code);
    var m = M.markers[code];
    if (m && M.map) {
      M.map.setView(m.getLatLng(), Math.max(M.map.getZoom(), 15), { animate: true });
      m.openPopup();
      if (isSmall()) { var b = qs('.rt-mapbox'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    } else if (it) {
      toast(it.c.name + ' has no map pin yet. Edit the shop to add a location.', 'info', { label: 'Edit shop', fn: function () { location.href = 'customers.html?code=' + enc(code) + '&edit=1'; } });
    }
  }
  function renderMapList() {
    var el = $('rtMapList'), L2 = viewItems(), e = emptyState(L2);
    if (e) { el.innerHTML = e; return; }
    el.innerHTML = L2.slice(0, mapShown).map(function (x) {
      var c = x.c, pinned = !!coord(c);
      return '<div class="rt-ml' + (x.code === selCode ? ' sel' : '') + '" data-code="' + esc(x.code) + '"><button type="button" class="rt-ml-main" data-act="mlpick" data-code="' + esc(x.code) + '"><span class="n">' + x.n + '</span><span class="rt-ml-t"><b>' + esc(c.name) + '</b><span>' + esc(x.code) + ' \u00b7 ' + (pinned ? 'On map' : 'No map pin') + (c.inactive ? ' \u00b7 Inactive' : '') + (cur === ALL ? ' \u00b7 ' + esc(x.r.name) : '') + '</span></span></button>' +
        '<button type="button" class="rt-dots" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ' + esc(c.name) + '" title="Actions">' + ic('dots') + '</button></div>';
    }).join('') + (L2.length > mapShown ? '<button type="button" class="btn btn-secondary a-btn rt-more" data-act="more">Show more (' + (L2.length - mapShown) + ' left)</button>' : '');
  }
  $('rtFit').onclick = function () { if (M.map) { var n = Object.keys(M.markers).length; if (!n) toast('No shop on this route has a map pin yet.', 'info'); else fitMap(); } };
  window.addEventListener('pagehide', function () { if (M.ro) M.ro.disconnect(); if (M.map) { M.map.remove(); M.map = null; } });

  /* ---------- Action menu (desktop popover / mobile bottom sheet) ---------- */
  var menuOpen = null, refocus = null;
  function itemOf(btn) {
    var host = btn.closest('[data-code]'); if (!host) return null;
    var code = host.dataset.code, L2 = baseItems();
    for (var i = 0; i < L2.length; i++) if (L2[i].code === code) return L2[i];
    return null;
  }
  function menuGroups(x) {
    var c = x.c, single = cur !== ALL, n = x.r.codes.length, g = [], tel = telOf(c), E = enc(x.code);
    if (!c.missing) g.push({ label: 'Shop', items: [{ id: 'view', label: 'View shop', icon: 'eye', href: 'customers.html?code=' + E }, { id: 'edit', label: 'Edit shop', icon: 'edit', href: 'customers.html?code=' + E + '&edit=1' }] });
    if (single) g.push({ label: 'Reorder', items: [
      { id: 'top', label: 'Move to top', icon: 'top', off: x.i === 0 }, { id: 'up', label: 'Move up', icon: 'up', off: x.i === 0 },
      { id: 'down', label: 'Move down', icon: 'down', off: x.i === n - 1 }, { id: 'bottom', label: 'Move to bottom', icon: 'bottom', off: x.i === n - 1 }] });
    if (S.routes.length > 1) g.push({ label: 'Route', items: [{ id: 'moveRoute', label: 'Move to another route', icon: 'swap' }] });
    var loc = []; if (coord(c)) loc.push({ id: 'onmap', label: 'Open on map', icon: 'pin' }); if (tel) loc.push({ id: 'call', label: 'Call shop', icon: 'phone', href: 'tel:' + tel });
    if (loc.length) g.push({ label: 'Location', items: loc });
    if (!c.missing) g.push({ label: 'Status', items: [c.inactive ? { id: 'active', label: 'Mark active', icon: 'check' } : { id: 'inactive', label: 'Mark inactive', icon: 'ban' }] });
    g.push({ label: 'Danger', items: [{ id: 'remove', label: 'Remove from route', icon: 'trash', danger: true }] });
    return g;
  }
  function menuHtml(groups) {
    return groups.map(function (g) {
      return '<div class="rt-mg" role="group" aria-label="' + esc(g.label) + '"><div class="rt-ml-h" aria-hidden="true">' + esc(g.label) + '</div>' + g.items.map(function (it) {
        var cls = 'rt-mi' + (it.danger ? ' danger' : ''), inner = ic(it.icon) + '<span>' + esc(it.label) + '</span>';
        return it.href && !it.off ? '<a role="menuitem" class="' + cls + '" href="' + esc(it.href) + '" data-m="' + it.id + '">' + inner + '</a>'
          : '<button type="button" role="menuitem" class="' + cls + '" data-m="' + it.id + '"' + (it.off ? ' aria-disabled="true"' : '') + '>' + inner + '</button>';
      }).join('') + '</div>';
    }).join('');
  }
  function openMenu(btn) {
    closeMenu(false); closeSel(false);
    var x = itemOf(btn); if (!x) return;
    var html = menuHtml(menuGroups(x)), small = isSmall();
    menuOpen = { btn: btn, x: x, small: small }; btn.setAttribute('aria-expanded', 'true');
    if (small) {
      $('rtSheet').innerHTML = '<div class="rt-sh-handle"></div><div class="rt-sh-t"><div><b>' + esc(x.c.name) + '</b><span>' + esc(x.code) + ' \u00b7 Stop ' + x.n + ' \u00b7 ' + esc(x.r.name) + '</span></div><button type="button" class="rt-dots" data-m="close" aria-label="Close menu">' + ic('x') + '</button></div>' + html;
      $('rtSheet').hidden = false; $('rtScrim').hidden = false; document.body.style.overflow = 'hidden';
    } else {
      var m = $('rtMenu'); m.innerHTML = html; m.style.visibility = 'hidden'; m.hidden = false;
      var r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      var left = Math.min(Math.max(8, r.right - mw), vw - mw - 8), top = r.bottom + 6;
      if (top + mh > vh - 8) top = Math.max(8, r.top - mh - 6);
      m.style.left = left + 'px'; m.style.top = top + 'px'; m.style.visibility = '';
    }
    var f = qs('.rt-mi:not([aria-disabled="true"])', small ? $('rtSheet') : $('rtMenu')); if (f) f.focus();
  }
  function closeMenu(back) {
    if (!menuOpen) return;
    var b = menuOpen.btn; menuOpen = null;
    $('rtMenu').hidden = true; $('rtSheet').hidden = true; $('rtMenu').innerHTML = ''; $('rtSheet').innerHTML = '';
    if (!selOpen) { $('rtScrim').hidden = true; document.body.style.overflow = ''; }
    if (b) { b.setAttribute('aria-expanded', 'false'); if (back && document.contains(b)) { try { b.focus(); } catch (e) {} } }
  }
  function menuClick(e) {
    var it = e.target.closest('[data-m]'); if (!it || !menuOpen) return;
    if (it.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    var id = it.dataset.m, x = menuOpen.x;
    if (id === 'close') { closeMenu(true); return; }
    if (it.tagName === 'A') { closeMenu(false); return; }   // real links (view, edit, call) navigate by themselves
    e.preventDefault(); closeMenu(false); runAction(id, x);
  }
  function menuKey(e) {
    var host = menuOpen && menuOpen.small ? $('rtSheet') : $('rtMenu'), items = qsa('.rt-mi:not([aria-disabled="true"])', host), i = items.indexOf(document.activeElement), k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (k === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (k === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (k === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (k === 'Tab') closeMenu(true);
  }
  $('rtMenu').onclick = menuClick; $('rtSheet').onclick = menuClick; $('rtMenu').onkeydown = menuKey; $('rtSheet').onkeydown = menuKey;
  document.addEventListener('pointerdown', function (e) {
    if (menuOpen && !e.target.closest('#rtMenu,#rtSheet,[data-act="menu"]')) closeMenu(false);
    if (selOpen && !e.target.closest('.rt-selwrap')) closeSel(false);
  }, true);
  window.addEventListener('scroll', function (e) { if (menuOpen && !menuOpen.small && !(e.target.closest && e.target.closest('#rtMenu'))) closeMenu(false); }, true);
  window.addEventListener('resize', function () { if (menuOpen && !menuOpen.small) closeMenu(false); });

  /* ---------- Shop actions (all saved through GA.ops.save) ---------- */
  function runAction(id, x) {
    refocus = { code: x.code, sel: '[data-act="menu"]' };
    if (id === 'top') moveTo(x.r.id, x.code, 0);
    else if (id === 'up') moveTo(x.r.id, x.code, x.i - 1);
    else if (id === 'down') moveTo(x.r.id, x.code, x.i + 1);
    else if (id === 'bottom') moveTo(x.r.id, x.code, 1e9);
    else if (id === 'moveRoute') openRoutePicker(x);
    else if (id === 'onmap') focusOnMap(x.code);
    else if (id === 'inactive') setActive(x, false);
    else if (id === 'active') setActive(x, true);
    else if (id === 'remove') removeFrom(x);
  }
  function moveTo(rid, code, dest, how) {
    var info = {}, o = { fail: 'The new order was not saved.', flash: code, noop: null };
    o.after = function () { if (view === 'list' && canDrag()) pgList = Math.floor(info.to / LIST_PS) + 1; };
    return commitOp(function () {
      var r = routeById(rid); if (!r) return false;
      var i = r.codes.indexOf(code); if (i < 0) return false;
      dest = Math.max(0, Math.min(r.codes.length - 1, dest)); if (dest === i) return false;
      r.codes.splice(i, 1); r.codes.splice(dest, 0, code); info.to = dest;
      var c = cust(code), nm = c ? c.name : code;
      o.ok = nm + ' is now stop ' + (dest + 1) + ' of ' + r.codes.length + '. Order saved.';
      say(nm + ' moved to position ' + (dest + 1) + ' of ' + r.codes.length);
      return true;
    }, o);
  }
  function setActive(x, on) {
    var code = x.code;
    commitOp(function () {
      var c = O.cust(S, code); if (!c) return false;
      if (on) delete c.inactive; else c.inactive = true;
      return true;
    }, { ok: x.c.name + (on ? ' is active again.' : ' marked inactive. It will not appear in Daily plan.'), fail: 'The status was not changed.' });
  }
  function removeFrom(x) {
    confirmBox({ title: 'Remove from route?', text: 'Remove <b>' + esc(x.c.name) + '</b> from <b>' + esc(x.r.name) + '</b>?<br>The shop stays in Customers.', ok: 'Remove from route', danger: true }, function () {
      var rid = x.r.id, code = x.code;
      commitOp(function () {
        var r = routeById(rid), i = r ? r.codes.indexOf(code) : -1; if (i < 0) return false;
        r.codes.splice(i, 1); var c = O.cust(S, code); if (c) c.noRoute = true; return true;
      }, { ok: x.c.name + ' removed from ' + x.r.name + '.', fail: 'The shop was not removed.', after: function () { if (selCode === code) selCode = null; } });
    });
  }
  function openRoutePicker(x) {
    var others = S.routes.filter(function (r) { return r.id !== x.r.id; }).sort(az);
    openModal('<div class="card-title" role="heading" aria-level="2">Move to another route</div><p class="mu" style="margin:0 0 12px;font-size:13.5px">Move <b>' + esc(x.c.name) + '</b> from <b>' + esc(x.r.name) + '</b>. It is added at the end of the other route\u2019s visiting order.</p>' +
      '<div class="field a-f" style="margin-bottom:10px">' + ic('search').replace('class="icon"', 'class="icon" style="margin-left:12px;color:var(--muted)"') + '<input id="pkQ" type="search" placeholder="Search routes" aria-label="Search routes" autocomplete="off" style="font-size:16px"></div>' +
      '<div class="rt-pick" id="pkList" role="list"></div><div class="btn-group" style="margin-top:14px"><button type="button" class="btn btn-secondary a-btn" id="pkNo">Cancel</button></div>');
    function draw() {
      var f = $('pkQ').value.trim().toLowerCase(), L2 = others.filter(function (r) { return !f || r.name.toLowerCase().indexOf(f) > -1; });
      $('pkList').innerHTML = L2.map(function (r) { return '<button type="button" class="rt-pk" role="listitem" data-id="' + esc(r.id) + '"><span><b>' + esc(r.name) + '</b></span><span class="mu" style="flex:none;font-size:12.5px">' + plural(r.codes.length, 'shop') + '</span></button>'; }).join('') || '<div class="rt-empty" style="padding:20px"><b>No route matches</b></div>';
    }
    draw(); $('pkQ').oninput = draw; $('pkNo').onclick = closeModal; $('pkQ').focus();
    $('pkList').onclick = function (e) {
      var b = e.target.closest('[data-id]'); if (!b) return;
      var toId = b.dataset.id, to = routeById(toId), code = x.code, fromId = x.r.id; closeModal();
      commitOp(function () {
        var t = routeById(toId), f = routeById(fromId); if (!t || !f || t === f || f.codes.indexOf(code) < 0) return false;
        O.assign(S, code, toId); var c = O.cust(S, code); if (c) delete c.noRoute; return true;
      }, { ok: x.c.name + ' moved to ' + to.name + '. Saved.', fail: 'The shop was not moved.', after: function () { if (selCode === code) selCode = null; } });
    };
  }
  function focusOnMap(code) { selCode = code; mapFocus = code; mapFit = false; view = 'map'; writeHash(); renderAll(); showMap(); }

  /* ---------- Route actions (merge, delete, add) ---------- */
  function doMerge() {
    var r = route(), tid = $('mgS').value, t = routeById(tid); if (!r || !t) return;
    confirmBox({ title: 'Merge routes?', text: 'Move <b>' + plural(r.codes.length, 'shop') + '</b> from <b>' + esc(r.name) + '</b> into <b>' + esc(t.name) + '</b>? The route ' + esc(r.name) + ' will be removed.', ok: 'Merge', danger: false }, function () {
      var rid = r.id, tnm = t.name;
      commitOp(function () {
        var a = routeById(rid), b = routeById(tid); if (!a || !b) return false;
        a.codes.forEach(function (code) { if (b.codes.indexOf(code) < 0) b.codes.push(code); });
        S.routes = S.routes.filter(function (z) { return z !== a; }); return true;
      }, { ok: 'Merged into ' + tnm + '.', fail: 'The routes were not merged.', after: function () { cur = tid; q = ''; $('rtQ').value = ''; pgCards = 1; pgList = 1; mapFit = true; writeHash(); } });
    });
  }
  function delRoute() {
    var r = route(); if (!r) return;
    var rid = r.id, nm = r.name;
    confirmBox({ title: 'Delete route ' + nm + '?', text: 'Delete the route <b>' + esc(nm) + '</b>? Its ' + plural(r.codes.length, 'shop') + ' stay in Customers, without a route.', ok: 'Delete route', danger: true }, function () {
      commitOp(function () {
        var a = routeById(rid); if (!a) return false;
        a.codes.forEach(function (code) { var c = O.cust(S, code); if (c) c.noRoute = true; });
        S.routes = S.routes.filter(function (z) { return z !== a; }); return true;
      }, { ok: 'Route ' + nm + ' deleted.', fail: 'The route was not deleted.', after: function () { cur = ALL; q = ''; $('rtQ').value = ''; pgCards = 1; pgList = 1; mapFit = true; writeHash(); } });
    });
  }
  function openAdd() {
    var pick = {}, rmap = {}, shown = [];
    S.routes.forEach(function (r) { r.codes.forEach(function (c) { rmap[c] = r.name; }); });
    openModal('<div class="card-title" role="heading" aria-level="2">Add route</div>' +
      '<div class="a-fg"><label for="aN">Route name</label><div class="field a-f"><input id="aN" placeholder="e.g. Ukkadam" autocomplete="off"></div></div>' +
      '<div class="a-fg"><label for="aQ">Shops on this route</label><div class="field a-f"><input id="aQ" placeholder="Search shop name, code, area or phone" autocomplete="off"></div></div>' +
      '<div class="a-split" style="margin-bottom:6px"><span class="mu grow" id="aInfo" style="font-size:12px"></span><button class="r-demo" id="aAll" type="button">Select all shown</button><button class="r-demo" id="aClr" type="button">Clear</button></div>' +
      '<div class="rt-pick" id="aList"></div><div class="msg" id="aMsg" style="margin:8px 0" role="status"></div>' +
      '<div class="btn-group"><button class="btn btn-secondary a-btn" id="aNo" type="button">Cancel</button><button class="btn a-btn" id="aOk" type="button">Create route</button></div>');
    $('aN').focus();
    function info() { var k = Object.keys(pick).length, moved = Object.keys(pick).filter(function (c) { return rmap[c]; }).length; $('aInfo').textContent = k + ' selected' + (moved ? ', ' + moved + ' will move from their current route' : ''); $('aOk').textContent = k ? 'Create route with ' + k + ' shops' : 'Create route'; }
    function draw() {
      var f = $('aQ').value.trim().toLowerCase();
      var all = S.customers.filter(function (c) { return !c.inactive && (!f || [c.name, c.code, c.area, c.phone].join(' ').toLowerCase().indexOf(f) > -1); });
      shown = all.slice(0, 60);
      $('aList').innerHTML = shown.map(function (c) {
        return '<label class="rt-pk"><input type="checkbox" data-c="' + esc(c.code) + '"' + (pick[c.code] ? ' checked' : '') + '><span><b>' + esc(c.name) + '</b> <span class="badge b-info" style="display:inline">' + esc(c.code) + '</span><div class="mu" style="font-size:12px">' + (rmap[c.code] ? 'On ' + esc(rmap[c.code]) : 'No route') + '</div></span></label>';
      }).join('') + (all.length > 60 ? '<div class="mu" style="padding:10px 12px;font-size:12px">Showing 60 of ' + all.length + ' shops. Type in the search box to narrow the list.</div>' : '') || '<div class="rt-empty" style="padding:20px"><b>No shop matches</b>Try another name, code or area.</div>';
      qsa('[data-c]', $('aList')).forEach(function (b) { b.onchange = function () { if (b.checked) pick[b.dataset.c] = 1; else delete pick[b.dataset.c]; info(); }; });
    }
    $('aQ').oninput = draw;
    $('aAll').onclick = function () { shown.forEach(function (c) { pick[c.code] = 1; }); draw(); info(); };
    $('aClr').onclick = function () { pick = {}; draw(); info(); };
    $('aNo').onclick = closeModal;
    $('aOk').onclick = function () {
      var nm = $('aN').value.trim(), m = $('aMsg'); m.textContent = ''; m.className = 'msg';
      if (!nm) { m.textContent = 'Type a route name first.'; $('aN').focus(); return; }
      if (O.rid(S, nm)) { m.textContent = 'A route named ' + nm + ' already exists.'; return; }
      var codes = Object.keys(pick);
      function create() {
        var id = 'r' + Date.now();
        var done = commitOp(function () {
          if (O.rid(S, nm)) return false;
          var r = { id: id, name: nm, codes: [] }; S.routes.push(r);
          codes.forEach(function (c) { O.assign(S, c, r.id); var x = O.cust(S, c); if (x) delete x.noRoute; });
          return true;
        }, { ok: 'Route ' + nm + ' added with ' + plural(codes.length, 'shop') + '.', fail: 'The route was not created.', after: function () { cur = id; q = ''; $('rtQ').value = ''; pgCards = 1; pgList = 1; mapFit = true; writeHash(); } });
        if (done) closeModal();
      }
      if (!codes.length) { closeModal(); confirmBox({ title: 'Create an empty route?', text: 'Create <b>' + esc(nm) + '</b> with no shops?', ok: 'Create route' }, create); } else create();
    };
    draw(); info();
  }

  /* ---------- Drag and drop (pointer events, works with mouse, pen and touch) ---------- */
  var dnd = null, kb = null;
  function hintDrag() { toast('Drag is available when one route is open, sorted by Visiting order, with no search. You can also use the \u2022\u2022\u2022 menu.', 'info'); }
  function dndStart(e, grip) {
    if (grip.getAttribute('aria-disabled') === 'true') { hintDrag(); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var row = grip.closest('.rt-row'); if (!row || dnd) return;
    e.preventDefault(); closeMenu(false);
    var list = $('rtRows'), rows = qsa('.rt-row', list), rect = row.getBoundingClientRect();
    var ghost = row.cloneNode(true), tag = document.createElement('span'), line = document.createElement('div');
    ghost.className = 'rt-row rt-ghost'; ghost.removeAttribute('data-code'); ghost.style.width = rect.width + 'px'; ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px';
    qsa('[aria-label],[title],[data-act],[href]', ghost).forEach(function (n) { n.removeAttribute('aria-label'); n.removeAttribute('title'); n.removeAttribute('data-act'); n.removeAttribute('href'); });
    tag.className = 'rt-ghost-tag'; tag.textContent = 'Moving'; ghost.appendChild(tag); ghost.setAttribute('aria-hidden', 'true');
    line.className = 'rt-dropline'; list.appendChild(line);
    document.body.appendChild(ghost); row.classList.add('is-dragging'); document.body.classList.add('rt-dnd');
    var src = rows.indexOf(row);
    dnd = { code: row.dataset.code, row: row, rows: rows, src: src, dest: src, ghost: ghost, tag: tag, line: line, list: list, offY: e.clientY - rect.top, y: e.clientY, id: e.pointerId, grip: grip, raf: 0, base: +rows[0].dataset.i };
    try { grip.setPointerCapture(e.pointerId); } catch (x) {}
    grip.addEventListener('pointermove', dndMove); grip.addEventListener('pointerup', dndUp); grip.addEventListener('pointercancel', dndCancel); grip.addEventListener('lostpointercapture', dndCancel);
    document.addEventListener('keydown', dndKey, true);
    dndFrame();
  }
  function dndMove(e) { if (dnd) dnd.y = e.clientY; }
  function dndFrame() {
    var d = dnd; if (!d) return;
    var y = d.y, vh = window.innerHeight, edge = 72, sp = 0;
    d.ghost.style.top = (y - d.offY) + 'px';
    if (y < edge) sp = -Math.ceil((edge - y) / 4); else if (y > vh - edge) sp = Math.ceil((y - (vh - edge)) / 4);
    if (sp) window.scrollBy(0, sp);
    var ins = d.rows.length, k, rc;
    for (k = 0; k < d.rows.length; k++) { rc = d.rows[k].getBoundingClientRect(); if (y < rc.top + rc.height / 2) { ins = k; break; } }
    d.dest = ins > d.src ? ins - 1 : ins;
    var lr = d.list.getBoundingClientRect(), top = ins === 0 ? d.rows[0].getBoundingClientRect().top - lr.top : d.rows[ins - 1].getBoundingClientRect().bottom - lr.top;
    d.line.style.transform = 'translateY(' + (top - 1) + 'px)';
    d.line.classList.toggle('same', d.dest === d.src);
    d.tag.textContent = d.dest === d.src ? 'Same place' : 'To stop ' + (d.base + d.dest + 1);
    d.raf = requestAnimationFrame(dndFrame);
  }
  function dndUp() { dndEnd(true); }
  function dndCancel() { dndEnd(false); }
  function dndKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dndEnd(false); } }
  function dndEnd(commit) {
    var d = dnd; if (!d) return; dnd = null;
    cancelAnimationFrame(d.raf);
    d.grip.removeEventListener('pointermove', dndMove); d.grip.removeEventListener('pointerup', dndUp); d.grip.removeEventListener('pointercancel', dndCancel); d.grip.removeEventListener('lostpointercapture', dndCancel);
    try { d.grip.releasePointerCapture(d.id); } catch (x) {}
    document.removeEventListener('keydown', dndKey, true);
    if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    if (d.line.parentNode) d.line.parentNode.removeChild(d.line);
    d.row.classList.remove('is-dragging'); document.body.classList.remove('rt-dnd');
    if (commit && d.dest !== d.src) { refocus = { code: d.code, sel: '[data-act="grip"]' }; moveTo(cur, d.code, d.base + d.dest); }
    else if (window.__rtLate) { window.__rtLate = false; refreshFromStore(); }
  }
  // Keyboard drag: Space picks up, arrows move, Space drops, Escape cancels.
  function kbKey(e, grip) {
    var row = grip.closest('.rt-row'), k = e.key; if (!row) return;
    var list = row.parentNode, nm = (cust(row.dataset.code) || {}).name || row.dataset.code;
    function renumber() { qsa('.rt-row', list).forEach(function (r, i) { var n = qs('.n', r); if (n) n.textContent = kb.base + i + 1; }); }
    function idx() { return qsa('.rt-row', list).indexOf(row); }
    if (!kb) {
      if (k === ' ' || k === 'Enter') {
        e.preventDefault(); if (grip.getAttribute('aria-disabled') === 'true') { hintDrag(); return; }
        kb = { code: row.dataset.code, row: row, grip: grip, base: +qsa('.rt-row', list)[0].dataset.i, start: idx(), before: row.nextSibling };
        row.classList.add('is-grabbed'); grip.setAttribute('aria-pressed', 'true');
        say('Picked up ' + nm + ', position ' + (kb.base + kb.start + 1) + '. Use the up and down arrow keys to move, Space to drop, Escape to cancel.');
      }
      return;
    }
    if (kb.row !== row) return;
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Home' || k === 'End') {
      e.preventDefault();
      var rows = qsa('.rt-row', list), i = rows.indexOf(row), j = k === 'ArrowUp' ? i - 1 : k === 'ArrowDown' ? i + 1 : k === 'Home' ? 0 : rows.length - 1;
      if (j < 0 || j >= rows.length || j === i) return;
      if (j < i) list.insertBefore(row, rows[j]); else list.insertBefore(row, rows[j].nextSibling);
      renumber(); grip.focus(); say('Position ' + (kb.base + j + 1) + ' of ' + (list.querySelectorAll('.rt-row').length + kb.base));
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault(); var to = kb.base + idx(), d = kb; kbEnd(false);
      if (to !== d.base + d.start) { refocus = { code: d.code, sel: '[data-act="grip"]' }; moveTo(cur, d.code, to); }
    } else if (k === 'Escape') { e.preventDefault(); kbEnd(true); say('Move cancelled'); }
    else if (k === 'Tab') kbEnd(true);
  }
  function kbEnd(restore) {
    var d = kb; if (!d) return; kb = null;
    d.row.classList.remove('is-grabbed'); d.grip.removeAttribute('aria-pressed');
    if (restore) { d.row.parentNode.insertBefore(d.row, d.before); qsa('.rt-row', d.row.parentNode).forEach(function (r, i) { var n = qs('.n', r); if (n) n.textContent = d.base + i + 1; }); }
    if (window.__rtLate) { window.__rtLate = false; refreshFromStore(); }
  }

  /* ---------- Print ---------- */
  function fillPrint() {
    var r = route(), all = cur === ALL, L2 = baseItems(), now = new Date();
    $('rtPrint').innerHTML = '<h2>General Traders \u2013 ' + (all ? 'All routes' : esc(r ? r.name : '')) + '</h2><p>' + plural(L2.length, 'shop') + ' \u00b7 printed ' + esc(now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })) + ' \u00b7 shops in visiting order</p>' +
      '<table><thead><tr><th>#</th><th>Shop</th><th>Code</th>' + (all ? '<th>Route</th>' : '') + '<th>Phone</th><th>Address</th><th>Map pin</th></tr></thead><tbody>' +
      L2.map(function (x) { var c = x.c; return '<tr><td>' + x.n + '</td><td>' + esc(c.name) + (c.inactive ? ' (inactive)' : '') + '</td><td>' + esc(x.code) + '</td>' + (all ? '<td>' + esc(x.r.name) + '</td>' : '') + '<td>' + esc(c.phone || '') + '</td><td>' + esc(c.address || c.place || '') + '</td><td>' + (coord(c) ? 'Yes' : 'No') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function doPrint() { fillPrint(); window.print(); }
  window.addEventListener('beforeprint', fillPrint);

  /* ---------- Render loop ---------- */
  function renderAll() {
    if (!S) return;
    if (cur !== ALL && !route()) cur = ALL;
    renderSelBtn(); renderHead(); renderTools();
    $('rtMain').style.display = S.routes.length ? '' : 'none';
    qsa('.rt-views button').forEach(function (b) { var on = b.dataset.v === view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('vList').hidden = view !== 'list'; $('vCards').hidden = view !== 'cards'; $('vMap').hidden = view !== 'map';
    if (view === 'list' && stale.list) { renderList(); stale.list = 0; }
    else if (view === 'cards' && stale.cards) { renderCards(); stale.cards = 0; }
    else if (view === 'map' && stale.map) { renderMapList(); stale.map = 0; if (M.map) refreshMap(mapFit); }
    var el = null;
    if (flashCode) {
      var code = flashCode; flashCode = null;
      var host = view === 'list' ? $('vList') : view === 'cards' ? $('vCards') : $('rtMapList');
      el = qsa('[data-code]', host).filter(function (n) { return n.dataset.code === code; })[0];
      if (el) {
        el.classList.add('rt-flash'); setTimeout(function () { el.classList.remove('rt-flash'); }, 1700);
        var rc = el.getBoundingClientRect(); if (rc.top < 70 || rc.bottom > window.innerHeight - 20) el.scrollIntoView({ block: 'center' });
      }
    }
    if (refocus) {
      var rf = refocus; refocus = null;
      if (!document.activeElement || document.activeElement === document.body) {
        var h2 = qsa('[data-code]', view === 'list' ? $('vList') : view === 'cards' ? $('vCards') : $('rtMapList')).filter(function (n) { return n.dataset.code === rf.code; })[0];
        var f = h2 && qs(rf.sel, h2); if (f) { try { f.focus({ preventScroll: true }); } catch (x) {} }
      }
    }
  }

  /* ---------- Events ---------- */
  var views = $('rtViews');
  /* GM-ROUTES-PAGE-SIZE-EVENT-v1 */
  views.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-pagesize]');
    if (!sel) return;

    var kind = sel.getAttribute('data-pagesize');
    var n = parseInt(sel.value, 10);
    if (!isFinite(n) || n <= 0) return;

    if (kind === 'cards') {
      if (CARD_PAGE_SIZES.indexOf(n) === -1) return;
      cardPageSize = n;
      pgCards = 1;
    } else {
      if (LIST_PAGE_SIZES.indexOf(n) === -1) return;
      listPageSize = n;
      pgList = 1;
    }

    stale = { list: 1, cards: 1, map: 1 };
    renderAll();
    say('Showing ' + n + ' shops per page');
  });

  views.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    if (a) {
      var act = a.dataset.act;
      if (act === 'menu') { e.preventDefault(); if (menuOpen && menuOpen.btn === a) closeMenu(true); else openMenu(a); return; }
      if (act === 'onmap') { e.preventDefault(); focusOnMap(a.dataset.code); return; }
      if (act === 'mlpick') { if (view === 'map') focusShop(a.dataset.code); return; }
      if (act === 'more') { mapShown += MAP_MORE; stale.map = 1; renderAll(); return; }
      if (act === 'clearq') { q = ''; $('rtQ').value = ''; stale = { list: 1, cards: 1, map: 1 }; renderAll(); $('rtQ').focus(); return; }
      if (act === 'grip') { if (a.getAttribute('aria-disabled') === 'true') hintDrag(); return; }
    }
    var p = e.target.closest('[data-pg]');
    if (p && !p.disabled) {
      var nav = p.closest('.rt-pager'), kind = nav && nav.dataset.kind, n = +p.dataset.pg;
      if (kind === 'cards') pgCards = n; else pgList = n;
      stale = { list: 1, cards: 1, map: 1 }; renderAll();
      var sec = kind === 'cards' ? $('vCards') : $('vList'), top = sec.getBoundingClientRect().top;
      if (top < 0) window.scrollBy(0, top - 80);
      say('Page ' + n);
    }
  });
  views.addEventListener('pointerdown', function (e) { var g = e.target.closest('.rt-grip'); if (g && view === 'list') dndStart(e, g); });
  views.addEventListener('keydown', function (e) { var g = e.target.closest && e.target.closest('.rt-grip'); if (g && view === 'list') kbKey(e, g); });
  views.addEventListener('focusout', function (e) { if (kb && e.target === kb.grip) { setTimeout(function () { if (kb && document.activeElement !== kb.grip) kbEnd(true); }, 0); } });
  views.addEventListener('dragstart', function (e) { e.preventDefault(); });
  $('mo').onclick = function (e) { if (e.target === this) closeModal(); };
  $('mo').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = qsa('button:not([disabled]),input:not([disabled]),select,a[href],[tabindex]:not([tabindex="-1"])', $('mc')).filter(function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if ($('mo').classList.contains('active')) closeModal(); else if (menuOpen) closeMenu(true); else if (selOpen) closeSel(true);
  });
  $('demo').onclick = function () {
    function go() { S = O.demo(); load(); cur = S.routes[0].id; q = ''; $('rtQ').value = ''; pgCards = 1; pgList = 1; mapFit = true; stale = { list: 1, cards: 1, map: 1 }; renderAll(); writeHash(); track('Demo data loaded.'); }
    if (S.customers.length) confirmBox({ title: 'Replace current data with demo data?', text: 'All customers, routes and plans will be replaced by sample data, on this device and on the server. This cannot be undone.', ok: 'Replace with demo data', danger: true }, go); else go();
  };
  var mq = window.matchMedia && window.matchMedia('(max-width:640px)');
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { closeMenu(false); closeSel(false); });

  /* ---------- URL state (route and view only, never data) ---------- */
  function writeHash() { try { history.replaceState(null, '', location.pathname + location.search + '#r=' + enc(cur || '') + '&v=' + view); } catch (e) {} }
  function readHash() { var m = {}; location.hash.replace(/^#/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) { try { m[kv[0]] = decodeURIComponent(kv[1] || ''); } catch (e) {} } }); return m; }

  /* ---------- Start ---------- */
  try {
    load();
    var sr = O.syncRoutes(S);   // same as before: shops with an Area but no route go on the route named after the Area
    if (sr.moved) { persistLocal(); reindex(); track(''); }
    var h = readHash();
    view = (h.v === 'cards' || h.v === 'map' || h.v === 'list') ? h.v : 'list';
    cur = h.r === ALL ? ALL : (h.r && routeById(h.r)) ? h.r : ALL;
    renderAll(); writeHash();
    if (view === 'map') showMap();
    if (window.__gmSync && sync.state === 'idle') setSync('idle');
  } catch (e) { showFatal(e); }
})();