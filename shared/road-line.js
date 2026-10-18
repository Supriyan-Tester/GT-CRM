/* General Traders - shared road-route helper for every Leaflet map.
   One call turns a list of stops into a line that follows real roads (OpenStreetMap data, OSRM routing):
     RoadLine.draw(layerGroup, [[lat,lng], ...], { color:'#0F766E', weight:4 }, straightLayers, isStale)
   straightLayers (optional) are the straight-line fallbacks already on the map; they are removed once road lines arrive.
   RoadLine.get(latlngs) -> Promise<{km, line, segs, partial}|null> gives the road line and distance. Results are cached per page load.
   Made to survive a busy public server:
     - tries a second routing server if the first one fails, and retries when a server says "slow down"
     - if one stop (for example a wrongly placed pin) cannot be reached by road, only that part stays straight (dashed);
       the rest of the route still follows the roads
     - a failed lookup is retried after a minute instead of staying broken until the page is reloaded
   With no internet at all the straight lines simply stay. */
(function () {
  'use strict';
  var SERVERS = ['https://router.project-osrm.org/route/v1/driving/', 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'],
      CHUNK = 60, MAX = 400, TIMEOUT = 15000, PAR = 2, SPLIT_BUDGET = 40, RETRY_FAIL = 60e3, RETRY_PART = 5 * 60e3;
  var cache = {}, busy = {}, queue = [], running = 0, subs = [], pref = 0;
  function key(lls) { return lls.map(function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5); }).join(';'); }
  function pump() { while (running < PAR && queue.length) { running++; queue.shift()(); } }
  function slot(fn) { return new Promise(function (res) { queue.push(function () { fn().then(res, res).then(function () { running--; pump(); }); }); pump(); }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hav(a, b) { var R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function straightKm(lls) { var k = 0; for (var i = 1; i < lls.length; i++) k += hav(lls[i - 1], lls[i]); return k * 1.25; }   // rough road factor for the parts that stay straight
  // One server, one request. Resolves {ok:true,km,line} | {ok:false,why:'net'|'rate'|'noroute'}
  function ask(si, lls) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    var u = SERVERS[si] + lls.map(function (p) { return p[1].toFixed(6) + ',' + p[0].toFixed(6); }).join(';') + '?overview=full&geometries=geojson&continue_straight=false';
    return fetch(u, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) return { ok: false, why: 'rate' };
      return r.json().then(function (j) {
        var rt = j && j.routes && j.routes[0];
        if (j && j.code === 'Ok' && rt && rt.geometry && rt.geometry.coordinates && rt.geometry.coordinates.length) return { ok: true, km: rt.distance / 1000, line: rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) };
        return { ok: false, why: 'noroute' };
      });
    }).catch(function () { clearTimeout(t); return { ok: false, why: 'net' }; });
  }
  // Tries the servers in turn (the last one that worked first). A 'noroute' answer is final for that request.
  function one(lls) {
    return slot(function () {
      var order = [pref, 1 - pref], i = 0, last = { ok: false, why: 'net' };
      function next(retried) {
        if (i >= order.length) return Promise.resolve(last);
        var si = order[i];
        return ask(si, lls).then(function (r) {
          if (r.ok) { pref = si; return r; }
          last = r;
          if (r.why === 'noroute') return r;
          if (r.why === 'rate' && !retried) return wait(1200).then(function () { return next(true); });
          i++; return next(false);
        });
      }
      return next(false);
    });
  }
  // Route a list of points; if the road lookup is refused because of a bad point, split in halves so only that part stays straight.
  function solve(lls, ctx) {
    return one(lls).then(function (r) {
      if (r.ok) return [{ line: r.line, km: r.km, road: true }];
      if (r.why !== 'noroute' || lls.length <= 2 || ctx.budget <= 0) return [{ line: lls, km: straightKm(lls), road: false }];
      ctx.budget--;
      var mid = Math.floor((lls.length - 1) / 2) || 1;
      return Promise.all([solve(lls.slice(0, mid + 1), ctx), solve(lls.slice(mid), ctx)]).then(function (p) { return p[0].concat(p[1]); });
    });
  }
  function merge(segs) {   // join neighbouring pieces of the same kind
    var out = [];
    segs.forEach(function (s) {
      var l = out[out.length - 1];
      if (l && l.road === s.road) { l.line = l.line.concat(s.line.slice(1)); l.km += s.km; } else out.push({ line: s.line.slice(), km: s.km, road: s.road });
    });
    return out;
  }
  function fresh(c) { if (!c) return false; if (c.ok && !c.partial) return true; return Date.now() - c.t < (c.ok ? RETRY_PART : RETRY_FAIL); }
  function get(lls) {
    var k = key(lls);
    if (fresh(cache[k])) return Promise.resolve(cache[k].ok ? cache[k] : null);
    if (lls.length < 2 || lls.length > MAX || typeof fetch !== 'function') return Promise.resolve(null);
    if (busy[k]) return busy[k];
    var parts = [], ctx = { budget: SPLIT_BUDGET };
    for (var i = 0; i < lls.length - 1; i += CHUNK - 1) parts.push(lls.slice(i, Math.min(lls.length, i + CHUNK)));
    busy[k] = Promise.all(parts.map(function (p) { return solve(p, ctx); })).then(function (rs) {
      delete busy[k];
      var segs = merge([].concat.apply([], rs)), roads = segs.filter(function (s) { return s.road; });
      if (!roads.length) { cache[k] = { ok: false, t: Date.now() }; return null; }
      var km = 0, line = []; segs.forEach(function (s) { km += s.km; line = line.concat(line.length ? s.line.slice(1) : s.line); });
      cache[k] = { ok: true, km: km, line: line, segs: segs, partial: segs.length > 1 || !segs[0].road, t: Date.now() };
      subs.forEach(function (f) { try { f(); } catch (e) {} });
      return cache[k];
    });
    return busy[k];
  }
  function draw(group, lls, style, straight, isStale) {
    return get(lls).then(function (r) {
      if (!r || (isStale && isStale())) return null;
      (straight || []).forEach(function (l) { group.removeLayer(l); });
      var o = { color: '#0F766E', weight: 4, opacity: .9, lineJoin: 'round', lineCap: 'round', interactive: false };
      for (var a in style) o[a] = style[a];
      r.segs.forEach(function (s) {
        var so = {}; for (var a2 in o) so[a2] = o[a2];
        if (!s.road) { so.dashArray = '3 9'; so.weight = Math.max(2.5, o.weight - 1); }
        var pl = L.polyline(s.line, so).addTo(group); if (pl.bringToBack) pl.bringToBack();
      });
      return r;
    });
  }
  window.RoadLine = {
    key: key, get: get, draw: draw,
    peek: function (k) { return cache[k] && cache[k].ok ? cache[k] : null; },
    onLoad: function (f) { subs.push(f); }
  };
})();