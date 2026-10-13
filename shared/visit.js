/* GM-VISIT: how long the employee spends at each shop.
   Needs mock-data.js loaded first. Everything is saved in the employee's own record (visitLog, one entry per shop visit, per day),
   so it syncs to the server like the rest and the admin Daily summary can read it.

   One visit = arrived (GPS or "I've reached" button) -> delivered / problem (the lap) -> left (GPS or "I've left" button).
   If the employee never says they left and GPS cannot tell, the time after delivery is stored as "not recorded", never guessed. */
(function () {
  if (!window.GM || window.GMVisit) return;
  var KEY = 'gm_crm_data_v5', ARRIVE = 150, LEAVE = 250, MAXACC = 200, KEEP_DAYS = 62;
  function p2(n) { return String(n).padStart(2, '0'); }
  function dkey(t) { t = t || new Date(); return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()); }

  function mutate(fn) {
    var d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d) return null;
    d.visitLog = d.visitLog || {};
    var k = dkey(); d.visitLog[k] = d.visitLog[k] || {};
    var out = fn(d.visitLog[k]);
    var keys = Object.keys(d.visitLog).sort(); while (keys.length > KEEP_DAYS) delete d.visitLog[keys.shift()];
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
    return out;
  }
  function today() { var d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; } return (d && d.visitLog && d.visitLog[dkey()]) || {}; }
  function latest(day, shopId) { var best = null; Object.keys(day).forEach(function (k) { var v = day[k]; if (v.shopId === shopId && (!best || (v.openedAt || 0) >= (best.openedAt || 0))) best = v; }); return best; }

  // A visit that has been arrived at and not closed yet
  function openOf(day) { var o = null; Object.keys(day).forEach(function (k) { var v = day[k]; if (v.arrivedAt && !v.closed && (!o || v.arrivedAt > o.arrivedAt)) o = v; }); return o; }
  function close(v, how, now) {
    if (v.doneAt && (how === 'gps' || how === 'manual')) { v.leftAt = now; v.leaveHow = how; }
    else { v.leftAt = null; v.leaveHow = 'unknown'; }   // no real signal that the employee left, so no time is invented
    v.closed = true;
  }

  function dist(a, b) {
    var R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + p2(m) : p2(m)) + ':' + p2(s % 60);
  }
  function clock(ts) { return ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-'; }

  var V = window.GMVisit = {
    ARRIVE: ARRIVE, LEAVE: LEAVE, dist: dist, fmt: fmt, clock: clock, today: today,
    get: function (shopId) { return latest(today(), shopId); },
    open: function () { return openOf(today()); },

    // The employee reached the shop (how = 'gps' or 'manual'). Any other shop still open is closed first.
    arrive: function (shop, how, info) {
      return mutate(function (day) {
        var cur = latest(day, shop.id);
        if (cur && !cur.closed && cur.arrivedAt) return cur;
        var now = Date.now();
        Object.keys(day).forEach(function (k) { if (day[k].arrivedAt && !day[k].closed) close(day[k], 'next', now); });
        if (cur && !cur.arrivedAt && !cur.closed) { cur.arrivedAt = now; cur.arriveHow = how; cur.arriveDist = info && info.dist; return cur; }   // delivered before arrival was noted
        var id = shop.id + (cur ? '#' + (Object.keys(day).length + 1) : '');
        return (day[id] = { shopId: shop.id, shopName: shop.name, code: shop.code || '', billNo: shop.billNo || '', openedAt: now, arrivedAt: now, arriveHow: how, arriveDist: info && info.dist });
      });
    },
    // Delivered / retry / cancelled: the lap. outcome = 'delivered' | 'retry' | 'cancelled'
    done: function (shop, outcome) {
      return mutate(function (day) {
        var now = Date.now(), cur = latest(day, shop.id);
        if (!cur || cur.doneAt) cur = day[shop.id + (cur ? '#' + (Object.keys(day).length + 1) : '')] = { shopId: shop.id, shopName: shop.name, code: shop.code || '', billNo: shop.billNo || '', openedAt: now };
        cur.doneAt = now; cur.outcome = outcome;
        if (!cur.arrivedAt) cur.closed = true;   // never arrived on record, so there is nothing to time after delivery
        return cur;
      });
    },
    // The employee left the shop (how = 'gps' or 'manual')
    leave: function (how) { return mutate(function (day) { var v = openOf(day); if (v) close(v, how || 'manual', Date.now()); return v; }); },
    closeAll: function (how) { mutate(function (day) { var now = Date.now(); Object.keys(day).forEach(function (k) { if (day[k].arrivedAt && !day[k].closed) close(day[k], how, now); }); }); },

    // ---- live GPS. One watcher shared by the page. cb gets { lat, lng, acc, t } on every usable fix.
    last: null,
    watch: function (cb) {
      if (cb) V._cbs.push(cb);
      if (V._id != null || !navigator.geolocation) return !!navigator.geolocation;
      V._id = navigator.geolocation.watchPosition(function (pos) {
        if (pos.coords.accuracy > MAXACC) return;
        var f = V.last = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() };
        autoLeave(f);
        V._cbs.forEach(function (c) { try { c(f); } catch (e) {} });
      }, function (err) { V._cbs.forEach(function (c) { try { c(null, err); } catch (e) {} }); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
      return true;
    },
    unwatch: function () { if (V._id != null && navigator.geolocation) navigator.geolocation.clearWatch(V._id); V._id = null; V._cbs = []; },
    _cbs: [], _id: null
  };

  // After delivery: two fixes in a row clearly away from the shop = the employee has left
  var away = 0;
  function autoLeave(f) {
    var v = V.open(); if (!v || !v.doneAt) { away = 0; return; }
    var s = GM.getShop(v.shopId), pin = s && GM.shopPin(s); if (!pin) return;
    if (dist(f, pin) > LEAVE) { away += f.acc <= 50 ? 2 : 1; if (away >= 2) { away = 0; V.leave('gps'); } } else away = 0;   // one clear fix, or two weaker ones
  }

  // "Leaving <shop>" bar: shows the time since delivery until the employee leaves. Put it at the top of a page.
  V.strip = function (el) {
    if (!el) return;
    function paint() {
      var v = V.open();
      if (!v || !v.doneAt) { el.innerHTML = ''; el.style.display = 'none'; return; }
      if (!el._watch) { el._watch = 1; V.watch(); }
      el.style.display = 'flex';
      var txt = 'Still at <b>' + String(v.shopName || 'the shop').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</b> · ' + fmt(Date.now() - v.doneAt) + ' since ' + (v.outcome === 'delivered' ? 'delivery' : 'the problem');
      if (el._txt !== txt) { el._txt = txt; el.innerHTML = '<span class="gv-s-t">' + txt + '</span><button type="button" class="gv-s-b">I’ve left</button>'; el.querySelector('button').onclick = function () { V.leave('manual'); paint(); }; }
      else el.firstChild.innerHTML = txt;
    }
    el.className = (el.className ? el.className + ' ' : '') + 'gv-strip';
    paint(); setInterval(paint, 1000);
  };
  var css = document.createElement('style');
  css.textContent = '.gv-strip{display:none;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:10px 12px;border-radius:12px;background:var(--t-accent,#FEF3C7);border:1px solid var(--accent,#F59E0B);font-size:13px}' +
    '.gv-s-t{min-width:0}.gv-s-b{flex:0 0 auto;height:34px;padding:0 14px;border-radius:9px;border:0;background:var(--primary,#0F766E);color:var(--on-primary,#fff);font:inherit;font-weight:700;cursor:pointer}';
  document.head.appendChild(css);

  // Punching out ends any visit that is still open
  var prev = GM.updateShift;
  GM.updateShift = function (u) { try { if (u && u.punchedOut === true) V.closeAll('punchout'); } catch (e) {} return prev.apply(GM, arguments); };
})();