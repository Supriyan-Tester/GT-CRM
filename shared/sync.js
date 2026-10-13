/* GM-CRM sync v2: keeps gm_* browser data in step with the backend server.
   Each worker's own record (gm_crm_data_v5) is stored separately on the server, per worker id.
   Worker pages read/write their own record. Admin pages only read the worker chosen on the Attendance page.
   If the server is not reachable the app keeps working locally, as before. */
/* Picture shrinking used by every upload: the picture is resized (longest side 1800 px by default) and saved as a high-quality
   JPEG (quality 85), which looks the same on screen and in print but is usually 5 to 10 times smaller. PDFs are sent as they are.
   If shrinking would not make the file smaller, the original is kept. */
window.GMImg = {
  read: function (file, maxEdge, quality) {
    maxEdge = maxEdge || 1800; quality = quality || 0.85;
    function plain() { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onerror = function () { no(new Error('Could not read that file.')); }; fr.onload = function () { ok(fr.result); }; fr.readAsDataURL(file); }); }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type || '')) return plain();
    return new Promise(function (ok) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); plain().then(ok, function () { ok(null); }); };
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, maxEdge / Math.max(w, h)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
          var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          cv.toBlob(function (b) {
            if (!b || b.size >= file.size) { plain().then(ok, function () { ok(null); }); return; }   // already small: keep the original
            var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { plain().then(ok, function () { ok(null); }); }; fr.readAsDataURL(b);
          }, 'image/jpeg', quality);
        } catch (e) { URL.revokeObjectURL(url); plain().then(ok, function () { ok(null); }); }
      };
      img.src = url;
    });
  }
};

(function () {
  if (!/^https?:$/.test(location.protocol) || window.__gmSync) return;
  window.__gmSync = true;
  var API = location.origin + '/api', ls = window.localStorage, SP = Storage.prototype;
  var rawSet = SP.setItem, rawRem = SP.removeItem, rawGet = SP.getItem;
  var BLOB = 'gm_crm_data_v5', NS = BLOB + '__', VIEW = 'gm_view_worker';
  var isAdmin = /\/admin\//.test(location.pathname), isWorker = /\/worker\//.test(location.pathname);
  // Signed out or session expired (server answered 401): go back to the sign-in page. The sign-in page itself is public.
  function signedOut() {
    if (!isAdmin && !isWorker) return;
    try { sessionStorage.removeItem('gm_admin_session'); } catch (e) {}
    location.replace('../login.html');
  }
  var DATA_KEY = /^(gm_admin_|gm_crm_data_v5|gm_pins_v1|gm_pintasks_v1|gm_depot_v1|gm_wself_|gm_view_worker|gm_logged_in)/;
  var rev = 0, pending = {}, written = {}, localOnly = { 'gm_logged_in': 1 }; localOnly[VIEW] = 1;
  function ok(k) { return typeof k === 'string' && /^gm_[A-Za-z0-9_\-]{1,80}$/.test(k) && !localOnly[k] && k !== BLOB; }
  function jget(k) { try { return JSON.parse(rawGet.call(ls, k)); } catch (e) { return null; } }
  function wid(s) { try { var o = JSON.parse(s); var i = o && o.worker && o.worker.id; return (i && /^[A-Za-z0-9_\-]{1,60}$/.test(i)) ? i : null; } catch (e) { return null; } }
  function viewId() {
    var v = rawGet.call(ls, VIEW); if (v) return v;
    var w = jget('gm_admin_workers_v1'); if (w && w.workers && w.workers.length) return w.workers[0].id;
    return 'GT-W104';
  }

  // Tells the page (the Routes page uses this) when a save reached the server or failed. dirty = a newer value is still waiting.
  function gmEmit(name, k) { try { window.dispatchEvent(new CustomEvent(name, { detail: { key: k, dirty: (k in pending) } })); } catch (e) {} }

  // One request at a time per record, so an older save can never arrive after a newer one
  var inflight = {};
  function send(k, force) {
    if (!(k in pending) || (inflight[k] && !force)) return;
    var v = pending[k], body = JSON.stringify({ v: v }), opt = { method: v === null ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json' }, keepalive: !!force && body.length < 60000 };
    if (v !== null) opt.body = body;
    inflight[k] = true;
    try {
      fetch(API + '/kv/' + encodeURIComponent(k), opt).then(function (r) {
        inflight[k] = false;
        if (r.ok) { if (pending[k] === v) delete pending[k]; else send(k); gmEmit('gm-sync-saved', k); }
        else if (r.status === 401) { signedOut(); gmEmit('gm-sync-failed', k); }
        else if (r.status === 403 || r.status === 413 || r.status === 507) { if (pending[k] === v) { delete pending[k]; delete written[k]; } gmEmit('gm-sync-failed', k); }   // this account may not save this item; retrying cannot help
        else if (r.status === 409) {
          // The server refused this save because it breaks a rule (for example the same worker on two plans).
          // Retrying the same data can never succeed, so drop it, take the server's copy back and tell the page why.
          r.json().catch(function () { return {}; }).then(function (j) {
            if (pending[k] === v) { delete pending[k]; delete written[k]; }
            try { window.dispatchEvent(new CustomEvent('gm-sync-rejected', { detail: { key: k, error: (j && j.error) || 'The server rejected this change.' } })); } catch (e) {}
            rev = 0; poll();
          });
        } else gmEmit('gm-sync-failed', k);
      }).catch(function () { inflight[k] = false; gmEmit('gm-sync-failed', k); });
    } catch (e) { inflight[k] = false; }
  }
  function push(k, v) { pending[k] = v; written[k] = Date.now(); send(k); }
  window.addEventListener('pagehide', function () { for (var k in pending) send(k, true); });

  SP.setItem = function (k, v) {
    rawSet.apply(this, arguments);
    if (this !== ls) return;
    v = String(v);
    if (k === BLOB) { if (isWorker) { var id = wid(v); if (id) push(NS + id, v); } }   // only worker pages save a worker record
    else if (ok(k)) push(k, v);
  };
  SP.removeItem = function (k) { rawRem.apply(this, arguments); if (this === ls && ok(k)) push(k, null); };

  function applyOne(lk, sk, items) {
    var v = items[sk].v, cur = rawGet.call(ls, lk);
    if (v === null) { if (cur !== null) { rawRem.call(ls, lk); return true; } }
    else if (cur !== v) { rawSet.call(ls, lk, v); return true; }
    return false;
  }
  function apply(items, startedAt) {
    var changed = false;
    for (var k in items) {
      if (k in pending || (startedAt && (written[k] || 0) >= startedAt)) continue;   // never overwrite a save made after this refresh began
      if (k.indexOf(NS) === 0) {
        var id = k.slice(NS.length);
        if (isAdmin) {
          if (id !== window.GMSync.view) continue;
          if (items[k].v !== null) window.GMSync.has = true;
        } else if (isWorker) { if (id !== wid(rawGet.call(ls, BLOB))) continue; }
        else continue;
        if (applyOne(BLOB, k, items)) changed = true;
      } else if (ok(k)) { if (applyOne(k, k, items)) changed = true; }
    }
    return changed;
  }

  // 1) Before the page's own scripts run: load server data (blocking, once per page)
  try {
    window.GMSync = { view: null, has: false, isAdmin: isAdmin,
      // Sign-in page only: forget the previous person's data kept in this browser, then load what this account may see.
      clearLocal: function () { var ks = []; for (var i = 0; i < ls.length; i++) ks.push(ls.key(i)); ks.forEach(function (k) { if (DATA_KEY.test(k)) rawRem.call(ls, k); }); pending = {}; written = {}; },
      pull: function () { try { var q = new XMLHttpRequest(); q.open('GET', API + '/state?since=0', false); q.send(); if (q.status !== 200) return false; var j = JSON.parse(q.responseText); rev = j.rev; for (var k in j.items) if (ok(k)) applyOne(k, k, j.items); return true; } catch (e) { return false; } } };
    var x = new XMLHttpRequest(); x.open('GET', API + '/state?since=0', false); x.send();
    if (x.status === 401) signedOut();
    if (x.status === 200) {
      var r = JSON.parse(x.responseText); rev = r.rev; var items = r.items;
      for (var k in items) if (ok(k)) applyOne(k, k, items);
      window.GMSync.view = null; window.GMSync.has = false; window.GMSync.isAdmin = isAdmin;
      if (isAdmin) {
        var vid = viewId(), it = items[NS + vid], lg = items[BLOB];
        if (!(it && it.v !== null) && lg && lg.v !== null && wid(lg.v) === vid) it = lg;   // data saved by the first version of the backend
        window.GMSync.view = vid;
        if (it && it.v !== null) { window.GMSync.has = true; rawSet.call(ls, BLOB, it.v); } else rawRem.call(ls, BLOB);
      } else if (isWorker) {
        var cur = rawGet.call(ls, BLOB), id = wid(cur);
        if (id) { var mine = items[NS + id]; if (mine && mine.v !== null) rawSet.call(ls, BLOB, mine.v); else push(NS + id, cur); }
      }
      var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i));
      keys.forEach(function (k) { if (ok(k) && !(k in items)) push(k, rawGet.call(ls, k)); });   // first run: upload what this browser already has
    }
  } catch (e) {}

  // 2) Keep in step: pick up other devices' changes and retry anything unsent
  function poll() {
    for (var k in pending) send(k);
    var t0 = Date.now() - 50;
    fetch(API + '/state?since=' + rev, { cache: 'no-store' }).then(function (r) { if (r.status === 401) { signedOut(); throw 0; } return r.json(); }).then(function (r) {
      rev = r.rev; if (apply(r.items, t0)) { try { window.dispatchEvent(new Event('gm-sync')); } catch (e) {} }
    }).catch(function () {});
  }
  setInterval(poll, 4000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();