/* General Traders - shared road-route helper for every Leaflet map.
   One call turns a list of stops into a line that follows real roads (OSRM public server, OpenStreetMap data):
     RoadLine.draw(layerGroup, [[lat,lng], ...], { color:'#0F766E', weight:4 }, straightLayers, isStale)
   straightLayers (optional) are the straight-line fallbacks already on the map; they are removed only when the road line arrives.
   If there is no internet, the server is slow, or it fails, the straight lines simply stay. Nothing else to configure.
   RoadLine.get(latlngs) -> Promise<{km, line}|null> gives just the road distance. Results are cached per page load. */
(function () {
  'use strict';
  var URL = 'https://router.project-osrm.org/route/v1/driving/', CHUNK = 90, MAX = 400, TIMEOUT = 10000, PAR = 2;
  var cache = {}, busy = {}, queue = [], running = 0, subs = [];
  function key(lls) { return lls.map(function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5); }).join(';'); }
  function pump() {
    while (running < PAR && queue.length) { running++; queue.shift()(); }
  }
  function slot(fn) { return new Promise(function (res) { queue.push(function () { fn().then(res, res).then(function () { running--; pump(); }); }); pump(); }); }
  function one(lls) {            // one OSRM request, <= CHUNK points
    return slot(function () {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
      var u = URL + lls.map(function (p) { return p[1].toFixed(6) + ',' + p[0].toFixed(6); }).join(';') + '?overview=full&geometries=geojson&continue_straight=false';
      return fetch(u, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw 0; return r.json(); }).then(function (j) {
        var rt = j && j.routes && j.routes[0];
        if (!rt || !rt.geometry || !rt.geometry.coordinates || !rt.geometry.coordinates.length) throw 0;
        return { km: rt.distance / 1000, line: rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) };
      }).catch(function () { clearTimeout(t); return null; });
    });
  }
  function get(lls) {
    var k = key(lls);
    if (cache[k]) return Promise.resolve(cache[k].ok ? cache[k] : null);
    if (lls.length < 2 || lls.length > MAX || typeof fetch !== 'function') return Promise.resolve(null);
    if (busy[k]) return busy[k];
    var parts = [];
    for (var i = 0; i < lls.length - 1; i += CHUNK - 1) parts.push(lls.slice(i, Math.min(lls.length, i + CHUNK)));
    busy[k] = Promise.all(parts.map(one)).then(function (rs) {
      delete busy[k];
      if (rs.some(function (r) { return !r; })) { cache[k] = { ok: false }; return null; }
      var km = 0, line = []; rs.forEach(function (r) { km += r.km; line = line.concat(r.line); });
      cache[k] = { ok: true, km: km, line: line };
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
      var pl = L.polyline(r.line, o).addTo(group); if (pl.bringToBack) pl.bringToBack();
      return r;
    });
  }
  window.RoadLine = {
    key: key, get: get, draw: draw,
    peek: function (k) { return cache[k] && cache[k].ok ? cache[k] : null; },
    onLoad: function (f) { subs.push(f); }
  };
})();
