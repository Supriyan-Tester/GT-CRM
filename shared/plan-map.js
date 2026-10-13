/* General Traders - Daily Plan: map (Leaflet + OpenStreetMap, the same vendored library the Routes page uses).
   Only real stored customer coordinates are drawn. A shop without a pin is never given an invented position. */
(function () {
  'use strict';
  var DP = window.DP, esc = DP.esc;
  var LEAFLET_JS = '../shared/vendor/leaflet/leaflet.js', LEAFLET_CSS = '../shared/vendor/leaflet/leaflet.css';
  var loading = false, cbs = [];
  function loadLeaflet(ok, fail) {
    if (window.L && L.map) return ok();
    cbs.push([ok, fail]); if (loading) return; loading = true;
    if (!document.querySelector('link[data-leaflet]')) { var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.setAttribute('data-leaflet', '1'); document.head.appendChild(css); }
    var s = document.createElement('script'); s.src = LEAFLET_JS; s.async = true;
    s.onload = function () { loading = false; var l = cbs; cbs = []; l.forEach(function (c) { c[0](); }); };
    s.onerror = function () { loading = false; if (s.parentNode) s.parentNode.removeChild(s); var l = cbs; cbs = []; l.forEach(function (c) { c[1](); }); };
    document.head.appendChild(s);
  }

  // Straight-line distance between consecutive pinned stops. It is NOT road distance and is always labelled that way.
  function km(a, b) {
    var R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  DP.lineKm = function (pts) { var t = 0; for (var i = 1; i < pts.length; i++) t += km(pts[i - 1], pts[i]); return t; };


  // Road routes come from the shared shared/road-line.js (RoadLine), so every map uses the same code.
  DP.kmKey = function (lls) { return RoadLine.key(lls); };
  DP.roadFor = function (lls) { return RoadLine.get(lls); };
  RoadLine.onLoad(function () { DP.updateKm(); });
  // Distance text shown in the plan panels: road distance once known, otherwise the straight line.
  DP.kmText = function (kind, key, straight) {
    var c = RoadLine.peek(key), road = !!c;
    if (kind === 'L') return road ? 'Road distance' : 'Straight-line distance';
    if (kind === 'V') return 'about ' + (road ? c.km : straight).toFixed(1) + ' km';
    return road ? 'Driving distance by road (OpenStreetMap), in visiting order. No travel time is estimated.' : 'Straight-line distance between stops that have a map pin, in visiting order. It is not road distance and no travel time is estimated.';
  };
  DP.kmAttr = function (kind, key) { return ' data-dpk="' + kind + '|' + key + '"'; };
  DP.updateKm = function () {
    var els = document.querySelectorAll('[data-dpk]');
    for (var i = 0; i < els.length; i++) {
      var a = els[i].getAttribute('data-dpk').split('|'), c = RoadLine.peek(a[1]);
      if (c) els[i].textContent = DP.kmText(a[0], a[1], c.km);
    }
  };

  // stops: [{ n, name, code, ll:[lat,lng]|null, pri, state }]  in visiting order
  DP.mapStops = function (S, p, date) {
    return p.stops.map(function (s, i) {
      var c = DP.cust(S, s.code) || {};
      return { n: i + 1, name: s.name, code: s.code, inv: s.inv, ll: DP.coord(c), pri: !!s.priority, state: DP.stopState(p, s, date), area: c.area || c.place || '', time: s.time || '', address: s.address || c.address || '' };
    });
  };

  // Google Maps accepts roughly ten stops in one link, so the link covers the next ten pending stops that have a pin.
  DP.gmapsUrl = function (stops) {
    var pts = stops.filter(function (x) { return x.ll && x.state !== 'delivered' && x.state !== 'cancelled'; });
    if (!pts.length) pts = stops.filter(function (x) { return x.ll; });
    var cut = pts.length > 10; pts = pts.slice(0, 10);
    if (!pts.length) return { url: '', cut: false, n: 0 };
    function ll(x) { return x.ll[0] + ',' + x.ll[1]; }
    var u = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + ll(pts[pts.length - 1]);
    if (pts.length > 1) u += '&origin=' + ll(pts[0]);
    if (pts.length > 2) u += '&waypoints=' + pts.slice(1, -1).map(ll).join('%7C');
    return { url: u, cut: cut, n: pts.length };
  };

  DP.createMap = function (el, overEl, opts) {
    opts = opts || {};
    var M = { map: null, group: null, markers: {}, tiles: null, fails: 0, stops: [], ro: null, destroyed: false, onPick: opts.onPick };
    function over(html) { if (!overEl) return; if (!html) { overEl.hidden = true; overEl.innerHTML = ''; } else { overEl.innerHTML = html; overEl.hidden = false; } }
    function init() {
      M.map = L.map(el, { zoomControl: true, minZoom: 2 }).setView([11.0, 77.0], 8);
      M.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(M.map);
      M.tiles.on('tileerror', function () { M.fails++; if (M.fails === 4) DP.toast('Map background could not be loaded. Check the internet connection. Stops and the route line still work.', 'warn'); });
      M.tiles.on('tileload', function () { M.fails = 0; });
      M.group = L.layerGroup().addTo(M.map);
      if (window.ResizeObserver) { var t = null; M.ro = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { if (M.map && !M.destroyed) M.map.invalidateSize(); }, 80); }); M.ro.observe(el); }
    }
    function draw(fit) {
      if (!M.map) return;
      M.group.clearLayers(); M.markers = {};
      var pts = [], last = null, lastN = 0, straight = [], id = M.drawId = (M.drawId || 0) + 1;
      M.stops.forEach(function (x) {
        if (!x.ll) return;
        if (last) straight.push(L.polyline([last, x.ll], { color: '#0F766E', weight: 3.5, opacity: .85, dashArray: x.n - lastN > 1 ? '3 9' : null, interactive: false }).addTo(M.group));
        last = x.ll; lastN = x.n; pts.push(x.ll);
        var cls = 'dp-pin' + (x.pri ? ' pri' : x.state === 'delivered' ? ' done' : '');
        var m = L.marker(x.ll, { icon: L.divIcon({ className: 'dp-pinwrap', html: '<span class="' + cls + '">' + x.n + '</span>', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] }), title: x.n + '. ' + x.name, alt: 'Stop ' + x.n + ': ' + x.name, keyboard: true });
        m.bindPopup('<b>' + x.n + '. ' + esc(x.name) + '</b>' + (x.pri ? ' <span class="dp-pri">Priority</span>' : '') + '<br><span style="color:#64748B">' + esc(x.code || '') + (x.address ? ' &middot; ' + esc(x.address) : '') + '</span><br><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + x.ll[0] + ',' + x.ll[1] + '">Directions</a>');
        m.on('click', function () { if (M.onPick) M.onPick(x.n); });
        m.addTo(M.group); M.markers[x.n] = m;
      });
      var total = M.stops.length;
      if (!pts.length) {
        over(!total ? '<div><b>No customers on this plan</b>There is nothing to show on the map.</div>' : '<div><b>Map routing is not available yet</b>None of the ' + total + ' customers has a saved map location. The customer list and route details still work. Add a location pin to each shop on the Customers page and the route will appear here.</div>');
      } else {
        over(''); if (fit) fit_(pts);
        if (pts.length > 1) RoadLine.draw(M.group, pts, { color: '#0F766E', weight: 4 }, straight, function () { return M.destroyed || !M.map || M.drawId !== id; });
      }
    }
    function fit_(pts) {
      pts = pts || M.stops.filter(function (x) { return x.ll; }).map(function (x) { return x.ll; });
      if (!pts.length || !M.map) return;
      if (pts.length === 1) M.map.setView(pts[0], 15); else M.map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
    }
    M.render = function (stops, fit) {
      M.stops = stops;
      if (M.map) { M.map.invalidateSize(); draw(fit !== false); return; }
      over('<div><span style="display:inline-block;width:18px;height:18px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:dpSpin 1s linear infinite"></span><br>Loading map...</div>');
      loadLeaflet(function () {
        if (M.destroyed) return; if (!M.map) init();
        requestAnimationFrame(function () { if (M.destroyed || !M.map) return; M.map.invalidateSize(); draw(true); });
      }, function () {
        over('<div><b>The map could not be loaded</b>The map files did not load. The customer list still works.<br><button type="button" class="btn a-btn" data-retry style="margin-top:12px">Try again</button></div>');
        var b = overEl && overEl.querySelector('[data-retry]'); if (b) b.onclick = function () { M.render(M.stops, true); };
      });
    };
    M.fit = function () { fit_(); };
    M.invalidate = function () { if (M.map) M.map.invalidateSize(); };
    M.focus = function (n) {
      var m = M.markers[n]; if (!m || !M.map) return;
      M.map.setView(m.getLatLng(), Math.max(M.map.getZoom(), 15), { animate: true }); m.openPopup();
    };
    M.destroy = function () { M.destroyed = true; if (M.ro) M.ro.disconnect(); if (M.map) { M.map.remove(); M.map = null; } };
    return M;
  };
})();
