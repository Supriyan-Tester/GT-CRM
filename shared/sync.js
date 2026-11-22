/* GM-CRM sync v2: keeps gm_* browser data in step with the backend server.
   Each worker's own record (gm_crm_data_v5) is stored separately on the server, per worker id.
   Worker pages read/write their own record. Admin pages only read the worker chosen on the Attendance page.
   If the server is not reachable the app keeps working locally, as before. */
/* Picture shrinking used by every upload: the picture is resized (longest side 1800 px by default) and saved as a high-quality
   JPEG (quality 85), which looks the same on screen and in print but is usually 5 to 10 times smaller. PDFs are sent as they are.
   If shrinking would not make the file smaller, the original is kept. */
window.GMImg = {
  read: function (file, maxEdge, quality) {
    maxEdge = maxEdge || 1800;
    quality = quality || 0.85;
    function plain() {
      return new Promise(function (ok, no) {
        var fr = new FileReader();
        fr.onerror = function () {
          no(new Error("Could not read that file."));
        };
        fr.onload = function () {
          ok(fr.result);
        };
        fr.readAsDataURL(file);
      });
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type || "")) return plain();
    return new Promise(function (ok) {
      var url = URL.createObjectURL(file),
        img = new Image();
      img.onerror = function () {
        URL.revokeObjectURL(url);
        plain().then(ok, function () {
          ok(null);
        });
      };
      img.onload = function () {
        try {
          var w = img.naturalWidth,
            h = img.naturalHeight,
            k = Math.min(1, maxEdge / Math.max(w, h)),
            cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(w * k));
          cv.height = Math.max(1, Math.round(h * k));
          var cx = cv.getContext("2d");
          cx.fillStyle = "#fff";
          cx.fillRect(0, 0, cv.width, cv.height);
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          cv.toBlob(
            function (b) {
              if (!b || b.size >= file.size) {
                plain().then(ok, function () {
                  ok(null);
                });
                return;
              } // already small: keep the original
              var fr = new FileReader();
              fr.onload = function () {
                ok(fr.result);
              };
              fr.onerror = function () {
                plain().then(ok, function () {
                  ok(null);
                });
              };
              fr.readAsDataURL(b);
            },
            "image/jpeg",
            quality,
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          plain().then(ok, function () {
            ok(null);
          });
        }
      };
      img.src = url;
    });
  },
};

(function () {
  if (!/^https?:$/.test(location.protocol) || window.__gmSync) return;
  window.__gmSync = true;
  var API = location.origin + "/api",
    ls = window.localStorage,
    SP = Storage.prototype;
  var rawSet = SP.setItem,
    rawRem = SP.removeItem,
    rawGet = SP.getItem;
  var BLOB = "gm_crm_data_v5",
    NS = BLOB + "__",
    VIEW = "gm_view_worker";
  var isLogin = /\/login(\.html)?\/?$/.test(location.pathname), // sign-in page: no session yet, so no server polling there
    isAdmin = /\/admin\//.test(location.pathname),
    isWorker = /\/worker\//.test(location.pathname);
  // Signed out or session expired (server answered 401): go back to the sign-in page. The sign-in page itself is public.
  function signedOut() {
    if (!isAdmin && !isWorker) return;
    try {
      sessionStorage.removeItem("gm_admin_session");
    } catch (e) {}
    location.replace("../login.html");
  }
  var DATA_KEY =
    /^(gm_admin_|gm_sales_|gm_crm_data_v5|gm_pins_v1|gm_pintasks_v1|gm_depot_v1|gm_wself_|gm_crew_|gm_loc_|gm_locreq_|gm_view_worker|gm_logged_in)/;
  var REV_KEY = "gmq_rev",
    KREV_KEY = "gmq_krev",
    rev = Number(rawGet.call(ls, REV_KEY)) || 0,
    pending = {},
    written = {},
    // Screen preferences kept only in this browser; the server does not accept them, so never send them.
    localOnly = {
      gm_logged_in: 1,
      gm_pr_cols: 1,
      gm_pr_view: 1,
      gm_last_act: 1,
      gm_vx_fold_v1: 1,
      gm_side_col: 1,
      gm_fav: 1,
      gm_privacy_ok_v1: 1,
    };
  localOnly[VIEW] = 1;
  // Stale-save protection (admin pages). krev[k] = newest server version of a shared record that this browser knows about.
  // readRev[k] = the version of it the page last READ. A save is sent together with that version, and the server refuses it when
  // someone else has saved a newer one in between, so an old open tab or phone can no longer wipe out newer work.
  var PROT =
      /^(gm_admin_v1|gm_admin_workers_v1|gm_admin_wprofile_v1|gm_pintasks_v1|gm_depot_v1|gm_admin_account_v1|gm_admin_products_v1|gm_admin_vehicles_v1|gm_admin_vfuel_v1|gm_admin_vehsync_v1|gm_admin_vservice_v1|gm_admin_ledger_v1|gm_admin_business_v1|gm_admin_settings_v1|gm_admin_attedit_v1)$/,
    krev = (function () { try { return JSON.parse(rawGet.call(ls, KREV_KEY)) || {}; } catch (e) { return {}; } })(),
    readRev = {},
    baseVal = {}, // the value of a shared record as last confirmed by the server; used to merge a late save instead of failing
    hydrated = false, // true once the first server read has finished (until then the page does not know any revision numbers)
    tries = {};
  // A revision number may only move forward. A slow, older server answer must never pull it back (that caused false 'stale' errors).
  function setRev(k, r) {
    if (typeof r !== "number") return;
    if (typeof krev[k] !== "number" || r > krev[k]) {
      krev[k] = r;
      try { rawSet.call(ls, KREV_KEY, JSON.stringify(krev)); } catch (e) {}
    }
  }
  // The version to send with a save: what the page last read, or else the newest the browser knows.
  function baseFor(k) {
    if (typeof readRev[k] === "number") return readRev[k];
    if (typeof krev[k] === "number") return krev[k];
    return null;
  }
  // Employee records are many small independent entries, so a late save can be merged field by field with the server's copy.
  var MERGE = /^(gm_admin_wprofile_v1|gm_admin_workers_v1)$/;
  function same(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  }
  function isObj(x) {
    return x && typeof x === "object" && !Array.isArray(x);
  }
  // Keep every field this page changed (compared with what it started from); take everything else from the server.
  function mergeFields(base, local, server) {
    base = isObj(base) ? base : {};
    local = isObj(local) ? local : {};
    var out = isObj(server) ? JSON.parse(JSON.stringify(server)) : {};
    Object.keys(local).forEach(function (f) {
      if (!same(local[f], base[f])) out[f] = local[f];
    });
    return out;
  }
  // Returns the merged JSON text, or null when the two copies really clash (then the user is asked, as before).
  function mergeShared(k, baseS, localS, serverS) {
    try {
      var b = JSON.parse(baseS), l = JSON.parse(localS), sv = JSON.parse(serverS);
      if (k === "gm_admin_wprofile_v1") {
        if (!isObj(b) || !isObj(l) || !isObj(sv)) return null;
        var out = JSON.parse(JSON.stringify(sv));
        Object.keys(l).forEach(function (id) {
          if (same(l[id], b[id])) return; // this page did not touch this employee
          out[id] = mergeFields(b[id], l[id], sv[id]);
        });
        return JSON.stringify(out);
      }
      if (k === "gm_admin_workers_v1") {
        if (!isObj(b) || !isObj(l) || !isObj(sv)) return null;
        var res = mergeFields(b, l, sv), clash = false;
        var bw = Array.isArray(b.workers) ? b.workers : [], lw = Array.isArray(l.workers) ? l.workers : [], sw = Array.isArray(sv.workers) ? sv.workers : [];
        var byId = function (a) { var m = {}; a.forEach(function (w) { if (w && w.id) m[w.id] = w; }); return m; };
        var bm = byId(bw), sm = byId(sw), list = sw.map(function (w) { return JSON.parse(JSON.stringify(w)); });
        lw.forEach(function (w) {
          if (!w || !w.id) return;
          if (same(w, bm[w.id])) return;
          if (!bm[w.id]) {
            // a new employee added on this page: fine unless another device already used the same id for someone else
            if (sm[w.id]) clash = true;
            else list.push(w);
            return;
          }
          for (var i = 0; i < list.length; i++)
            if (list[i].id === w.id) list[i] = mergeFields(bm[w.id], w, list[i]);
        });
        if (clash) return null;
        res.workers = list;
        return JSON.stringify(res);
      }
    } catch (e) {}
    return null;
  }
  function staleBanner() {
    try {
      if (document.getElementById("gmStale") || !document.body) return;
      var d = document.createElement("div");
      d.id = "gmStale";
      d.setAttribute("role", "alert");
      d.style.cssText =
        "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483600;max-width:min(680px,calc(100vw - 24px));background:#7c2d12;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
      var t = document.createElement("span");
      t.style.cssText = "flex:1 1 260px";
      t.textContent =
        "Another device saved newer data. Your conflicting local changes are preserved on this device but are not synced. Download a copy before choosing whether to discard them.";
      var exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.textContent = "Download local copy";
      exportBtn.style.cssText =
        "border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer";
      exportBtn.onclick = function () {
        try {
          var m = dirtyMap(), out = {};
          Object.keys(m).forEach(function (k) {
            if (m[k] && m[k].conflict)
              out[k] = {
                localValue: rawGet.call(ls, k),
                baseRevision: m[k].base,
                serverRevision: m[k].serverRev,
                capturedAt: new Date(m[k].at || Date.now()).toISOString()
              };
          });
          var blob = new Blob(
            [JSON.stringify({ type: "GM-CRM local conflict copy", exportedAt: new Date().toISOString(), records: out }, null, 2)],
            { type: "application/json" }
          );
          var url = URL.createObjectURL(blob), a = document.createElement("a");
          a.href = url;
          a.download = "gm-crm-local-conflicts-" + Date.now() + ".json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (e) {
          alert("Could not create the local conflict copy. Keep this page open and try again.");
        }
      };
      var discardBtn = document.createElement("button");
      discardBtn.type = "button";
      discardBtn.textContent = "Discard local copy & reload";
      discardBtn.style.cssText =
        "border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer";
      discardBtn.onclick = function () {
        var m = dirtyMap();
        Object.keys(m).forEach(function (k) {
          if (m[k] && m[k].conflict) {
            delete m[k];
            delete pending[k];
            delete written[k];
          }
        });
        dirtySave(m);
        location.reload();
      };
      d.appendChild(t);
      d.appendChild(exportBtn);
      d.appendChild(discardBtn);
      document.body.appendChild(d);
    } catch (e) {}
  }
  function ok(k) {
    return (
      typeof k === "string" &&
      /^gm_[A-Za-z0-9_\-]{1,80}$/.test(k) &&
      !localOnly[k] &&
      k !== BLOB
    );
  }
  // A worker's own record (punch-in, attendance, deliveries) is saved in the background. If the page changes before the save
  // reaches the server (the punch-in screen opens Home 0.6 s later), the unsent copy used to be lost and the next page then
  // loaded the OLD copy from the server over it. This marker lives in localStorage so it survives the page change: the next
  // page keeps this phone's copy and sends it again instead of replacing it. It is not a gm_ key, so it is never synced itself.
  var DIRTY = "gmq_dirty";
  function track(k) {
    return (
      (isWorker && typeof k === "string" && k.indexOf(NS) === 0) ||
      ok(k)
    );
  }
  function dirtyMap() {
    try {
      return JSON.parse(rawGet.call(ls, DIRTY)) || {};
    } catch (e) {
      return {};
    }
  }
  function dirtySave(m) {
    try {
      if (Object.keys(m).length) rawSet.call(ls, DIRTY, JSON.stringify(m));
      else rawRem.call(ls, DIRTY);
    } catch (e) {}
  }
  function markDirty(k) {
    if (!track(k)) return;
    var m = dirtyMap(), previous = m[k];
    // Persist only a small marker, not a second copy of the record. The actual
    // value remains in localStorage; deleted keys are represented by a null read.
    // A stale conflict stays blocked until the user exports or discards that copy.
    if (previous && previous.conflict) {
      previous.at = Date.now();
      m[k] = previous;
    } else {
      m[k] = {
        at: Date.now(),
        base: PROT.test(k) ? baseFor(k) : null
      };
    }
    dirtySave(m);
  }
  function markClean(k) {
    if (!track(k)) return;
    var m = dirtyMap();
    if (k in m) {
      delete m[k];
      dirtySave(m);
    }
  }
  function markConflict(k, base, serverRev) {
    if (!track(k)) return;
    var m = dirtyMap();
    m[k] = {
      at: Date.now(),
      base: typeof base === "number" ? base : null,
      serverRev: typeof serverRev === "number" ? serverRev : null,
      conflict: true
    };
    dirtySave(m);
  }
  function isConflict(k) {
    var m = dirtyMap();
    return !!(m[k] && m[k].conflict);
  }
  function jget(k) {
    try {
      return JSON.parse(rawGet.call(ls, k));
    } catch (e) {
      return null;
    }
  }
  function wid(s) {
    try {
      var o = JSON.parse(s);
      var i = o && o.worker && o.worker.id;
      return i && /^[A-Za-z0-9_\-]{1,60}$/.test(i) ? i : null;
    } catch (e) {
      return null;
    }
  }
  function viewId() {
    var v = rawGet.call(ls, VIEW);
    if (v) return v;
    var w = jget("gm_admin_workers_v1");
    if (w && w.workers && w.workers.length) return w.workers[0].id;
    return "GT-W104";
  }

  // Tells the page (the Routes page uses this) when a save reached the server or failed. dirty = a newer value is still waiting.
  function gmEmit(name, k) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, { detail: { key: k, dirty: k in pending } }),
      );
    } catch (e) {}
  }

  // One request at a time per record, so an older save can never arrive after a newer one
  var inflight = {};
  function send(k, force) {
    if (!(k in pending) || isConflict(k) || (inflight[k] && !force)) return;
    // Right after the page opens, the revision numbers are not known yet. Sending now would be refused as 'revision is missing',
    // so wait for the first server read to finish, then send with the right number.
    if (isAdmin && PROT.test(k) && !hydrated && baseFor(k) === null) {
      window.GMSync.ready.then(function () { send(k); });
      return;
    }
    var v = pending[k],
      b0 = isAdmin && PROT.test(k) ? baseFor(k) : null,
      body = JSON.stringify(b0 !== null ? { v: v, base: b0 } : { v: v }),
      opt = {
        method: v === null ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        keepalive: !!force && body.length < 60000,
      };
    if (v !== null || (isAdmin && PROT.test(k))) opt.body = body;
    inflight[k] = true;
    try {
      fetch(API + "/kv/" + encodeURIComponent(k), opt)
        .then(function (r) {
          inflight[k] = false;
          if (r.ok) {
            r.json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                if (j && typeof j.rev === "number" && PROT.test(k)) {
                  setRev(k, j.rev);
                  readRev[k] = j.rev;
                  baseVal[k] = v;
                  delete tries[k];
                } // the page's copy now equals the server's
                if (pending[k] === v) {
                  delete pending[k];
                  markClean(k);
                } else send(k);
                gmEmit("gm-sync-saved", k);
              });
          } else if (r.status === 401) {
            signedOut();
            gmEmit("gm-sync-failed", k);
          } else if (r.status === 403 || r.status === 413 || r.status === 507) {
            if (pending[k] === v) {
              delete pending[k];
              delete written[k];
              markClean(k);
            }
            gmEmit("gm-sync-failed", k);
          } // this account may not save this item; retrying cannot help
          else if (r.status === 409) {
            r.json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                // The server refused this save. Either someone saved a newer copy first ("stale"), or the data breaks a rule
                // (for example the same worker on two plans). Retrying identical data can never succeed.
                var giveUp = function () {
                  if (pending[k] === v) {
                    delete pending[k];
                    delete written[k];
                    markConflict(k, readRev[k], j && j.rev);
                  }
                  try {
                    window.dispatchEvent(
                      new CustomEvent("gm-sync-rejected", {
                        detail: {
                          key: k,
                          error:
                            (j && j.error) || "The server rejected this change.",
                        },
                      }),
                    );
                  } catch (e) {}
                  if (j && j.code === "stale") staleBanner();
                  rev = 0;
                  poll();
                };
                // Employee records: merge this page's changes into the server's newer copy and save again, with no warning needed.
                if (
                  j && j.code === "stale" && MERGE.test(k) && pending[k] === v &&
                  typeof baseVal[k] === "string" && typeof j.rev === "number" && (tries[k] || 0) < 3
                ) {
                  tries[k] = (tries[k] || 0) + 1;
                  fetch(API + "/state?since=" + (j.rev - 1), { cache: "no-store", credentials: "same-origin" })
                    .then(function (rr) { return rr.ok ? rr.json() : null; })
                    .then(function (st) {
                      var it = st && st.items && st.items[k];
                      var merged = it && typeof it.v === "string" && pending[k] === v ? mergeShared(k, baseVal[k], v, it.v) : null;
                      if (merged === null) return giveUp();
                      setRev(k, it.rev);
                      readRev[k] = it.rev;
                      baseVal[k] = it.v;
                      rawSet.call(ls, k, merged);
                      pending[k] = merged;
                      written[k] = Date.now();
                      send(k);
                      try { window.dispatchEvent(new Event("gm-sync")); } catch (e) {}
                    })
                    .catch(giveUp);
                  return;
                }
                giveUp();
              });
          } else gmEmit("gm-sync-failed", k);
        })
        .catch(function () {
          inflight[k] = false;
          gmEmit("gm-sync-failed", k);
        });
    } catch (e) {
      inflight[k] = false;
    }
  }
  function push(k, v) {
    pending[k] = v;
    written[k] = Date.now();
    markDirty(k);
    send(k);
  }
  window.addEventListener("pagehide", function () {
    for (var k in pending) send(k, true);
  });

  SP.setItem = function (k, v) {
    rawSet.apply(this, arguments);
    if (this !== ls) return;
    v = String(v);
    if (k === BLOB) {
      if (isWorker) {
        var id = wid(v);
        if (id) push(NS + id, v);
      }
    } // only worker pages save a worker record
    else if (ok(k)) push(k, v);
  };
  SP.removeItem = function (k) {
    rawRem.apply(this, arguments);
    if (this === ls && ok(k)) push(k, null);
  };
  SP.getItem = function (k) {
    if (isAdmin && this === ls && PROT.test(k) && typeof krev[k] === "number")
      readRev[k] = krev[k];
    return rawGet.apply(this, arguments);
  };

  // Never let an older server snapshot wipe out a worker's active punch-in or completed shop deliveries on this phone.
  function mergeWorkerBlob(localRaw, serverRaw) {
    try {
      var loc = JSON.parse(localRaw), srv = JSON.parse(serverRaw);
      if (!isObj(loc) || !isObj(srv)) return serverRaw;
      var changed = false;
      // 1. Preserve any attendanceLog entries present locally that are missing on server
      if (isObj(loc.attendanceLog)) {
        if (!isObj(srv.attendanceLog)) srv.attendanceLog = {};
        Object.keys(loc.attendanceLog).forEach(function (m) {
          if (!isObj(loc.attendanceLog[m])) return;
          if (!isObj(srv.attendanceLog[m])) srv.attendanceLog[m] = {};
          Object.keys(loc.attendanceLog[m]).forEach(function (d) {
            var le = loc.attendanceLog[m][d], se = srv.attendanceLog[m][d];
            if (isObj(le) && (!isObj(se) || (le.outTime && le.outTime !== "-" && (!se.outTime || se.outTime === "-")))) {
              srv.attendanceLog[m][d] = le;
              changed = true;
            }
          });
        });
      }
      // 2. Preserve local punch-in / route unlock state if server is still un-punched for the same date
      if (loc.punchedIn && !srv.punchedIn && (!srv.date || loc.date === srv.date)) {
        srv.punchedIn = loc.punchedIn;
        if (loc.punchInTime) srv.punchInTime = loc.punchInTime;
        if (loc.routeUnlocked) srv.routeUnlocked = loc.routeUnlocked;
        if (loc.startKm != null) srv.startKm = loc.startKm;
        if (loc.vehicle) srv.vehicle = loc.vehicle;
        changed = true;
      }
      // 3. Never revert a shop already marked delivered/completed on this phone back to "pending"
      if (Array.isArray(loc.shops) && Array.isArray(srv.shops)) {
        var locByKey = {};
        loc.shops.forEach(function (s, idx) {
          if (!s) return;
          var key = (s.inv || s.code || "") + "|" + idx;
          locByKey[key] = s;
        });
        srv.shops = srv.shops.map(function (s, idx) {
          if (!s) return s;
          var key = (s.inv || s.code || "") + "|" + idx;
          var lsItem = locByKey[key];
          if (lsItem && lsItem.status && lsItem.status !== "pending" && (!s.status || s.status === "pending")) {
            changed = true;
            return lsItem;
          }
          return s;
        });
      }
      return changed ? JSON.stringify(srv) : serverRaw;
    } catch (e) {
      return serverRaw;
    }
  }

  function applyOne(lk, sk, items) {
    if (PROT.test(lk)) setRev(lk, items[sk].rev);
    var v = items[sk].v,
      cur = rawGet.call(ls, lk);
    if (PROT.test(lk) && typeof v === "string") baseVal[lk] = v; // what the server holds now; used as the starting point for a later merge
    if (v === null) {
      if (cur !== null) {
        rawRem.call(ls, lk);
        return true;
      }
    } else {
      if (isWorker && lk === BLOB && typeof cur === "string" && typeof v === "string") {
        var merged = mergeWorkerBlob(cur, v);
        if (merged !== v) {
          v = merged;
          push(sk, v); // re-sync the preserved local progress back up to the server
        }
      }
      if (cur !== v) {
        rawSet.call(ls, lk, v);
        return true;
      }
    }
    return false;
  }
  function apply(items, startedAt) {
    var changed = false;
    var savedDirty = dirtyMap();
    for (var k in items) {
      // A locally edited key remains authoritative until its queued save is
      // accepted or explicitly rejected. Server hydration must not erase it.
      if (
        k in pending ||
        k in savedDirty ||
        (startedAt && (written[k] || 0) >= startedAt)
      ) {
        if (PROT.test(k)) setRev(k, items[k].rev);
        continue;
      }
      if (k.indexOf(NS) === 0) {
        var id = k.slice(NS.length);
        if (isAdmin) {
          if (id !== window.GMSync.view) continue;
          if (items[k].v !== null) window.GMSync.has = true;
        } else if (isWorker) {
          if (id !== wid(rawGet.call(ls, BLOB))) continue;
          // A newly added employee has an empty record on the server. That means "nothing saved yet", not "delete it".
          if (items[k].v === null) continue;
        } else continue;
        if (applyOne(BLOB, k, items)) changed = true;
      } else if (ok(k)) {
        if (applyOne(k, k, items)) changed = true;
      }
    }
    return changed;
  }

  // 1) Render from the local cache immediately, then hydrate from the server asynchronously.
  // Pages already listen for gm-sync and repaint when newer server data arrives.
  function hydrate(items, initial) {
    if (!items || typeof items !== "object") return false;
    var startedAt = Date.now() - 50;

    // Set the selected worker before applying namespaced worker records.
    if (isAdmin) {
      var vid = viewId();
      window.GMSync.view = vid;
      window.GMSync.has = false;
    }

    var changed = apply(items, startedAt);

    // Preserve compatibility with the first backend format, where the worker blob
    // was stored under the un-namespaced gm_crm_data_v5 key.
    if (isAdmin) {
      var legacy = items[BLOB];
      var current = items[NS + window.GMSync.view];
      if (!(current && current.v !== null) && legacy && legacy.v !== null &&
          wid(legacy.v) === window.GMSync.view) {
        if (rawGet.call(ls, BLOB) !== legacy.v) {
          rawSet.call(ls, BLOB, legacy.v);
          changed = true;
        }
        window.GMSync.has = true;
      } else if (current && current.v !== null) {
        window.GMSync.has = true;
      } else {
        rawRem.call(ls, BLOB);
      }
    } else if (isWorker) {
      var cur = rawGet.call(ls, BLOB);
      var id = wid(cur);
      if (id) {
        var mine = items[NS + id];
        if (dirtyMap()[NS + id]) {
          push(NS + id, cur);
        } else if (mine && mine.v !== null && cur !== mine.v) {
          if (applyOne(BLOB, NS + id, items)) changed = true;
        } else if (!mine) {
          push(NS + id, cur);
        }
      }
    }

    // Restore the durable outbox after a reload. The marker survives navigation
    // and browser restarts; the current value is read from localStorage so large
    // CRM records are not duplicated in the outbox.
    var queued = dirtyMap();
    Object.keys(queued).forEach(function (k) {
      if (k.indexOf(NS) === 0) {
        if (!isWorker || k !== NS + wid(rawGet.call(ls, BLOB))) return;
      } else if (!ok(k)) {
        return;
      }
      var entry = queued[k];
      if (entry && entry.conflict) return; // preserve for explicit export/discard
      if (PROT.test(k) && entry && typeof entry.base === "number")
        readRev[k] = entry.base;
      push(k, rawGet.call(ls, k));
    });

    // First-run migration: upload local keys not yet present on the server.
    if (initial) {
      var keys = [];
      for (var i = 0; i < ls.length; i++) keys.push(ls.key(i));
      keys.forEach(function (k) {
        if (ok(k) && !(k in items) && !(k in queued))
          push(k, rawGet.call(ls, k));
      });
    }
    if (changed) {
      try { window.dispatchEvent(new Event("gm-sync")); } catch (e) {}
    }
    return true;
  }

  window.GMSync = {
    view: null,
    has: false,
    isAdmin: isAdmin,
    ready: Promise.resolve(false),
    // Sign-in page only: forget the previous person's data kept in this browser.
    clearLocal: function () {
      var ks = [];
      for (var i = 0; i < ls.length; i++) ks.push(ls.key(i));
      ks.forEach(function (k) {
        if (DATA_KEY.test(k)) rawRem.call(ls, k);
      });
      rawRem.call(ls, DIRTY);
      rawRem.call(ls, REV_KEY);
      rawRem.call(ls, KREV_KEY);
      krev = {};
      rev = 0;
      pending = {};
      written = {};
    },
    // Always asynchronous. Callers that need fresh data before navigation can await it.
    pull: function () {
      return fetch(API + "/state?since=0", { cache: "no-store", credentials: "same-origin" })
        .then(function (r) {
          if (r.status === 401) {
            signedOut();
            throw new Error("Session expired");
          }
          if (!r.ok) throw new Error("Could not load server data (" + r.status + ")");
          return r.json();
        })
        .then(function (j) {
          rev = j.rev || 0;
          try { rawSet.call(ls, REV_KEY, String(rev)); } catch (e) {}
          hydrate(j.items || {}, false);
          return true;
        })
        .catch(function () { return false; });
    }
  };

  // The local cache remains available immediately so existing page scripts can render.
  // The server refresh runs without blocking the browser's main thread.
  // Only fetch full state (?since=0) if localStorage has never synced before; otherwise fetch incremental changes!
  var initialSince = rev > 0 ? rev : 0;
  window.GMSync.ready = isLogin ? Promise.resolve(false) : fetch(API + "/state?since=" + initialSince, {
    cache: "no-store",
    credentials: "same-origin"
  })
    .then(function (r) {
      if (r.status === 401) {
        signedOut();
        throw new Error("Session expired");
      }
      if (!r.ok) throw new Error("Could not load server data (" + r.status + ")");
      return r.json();
    })
    .then(function (r) {
      rev = r.rev || 0;
      try { rawSet.call(ls, REV_KEY, String(rev)); } catch (e) {}
      hydrate(r.items || {}, initialSince === 0);
      hydrated = true;
      return true;
    })
    .catch(function () { hydrated = true; return false; });

  // 2) Keep in step: pick up other devices' changes and retry anything unsent
  function poll() {
    if (isLogin) return;
    for (var k in pending) send(k);
    if (document.hidden) return; // a background tab does not need live updates; it catches up when it is shown again
    var t0 = Date.now() - 50;
    fetch(API + "/state?since=" + rev, { cache: "no-store" })
      .then(function (r) {
        if (r.status === 401) {
          signedOut();
          throw 0;
        }
        return r.json();
      })
      .then(function (r) {
        rev = r.rev;
        try { rawSet.call(ls, REV_KEY, String(rev)); } catch (e) {}
        if (apply(r.items, t0)) {
          try {
            window.dispatchEvent(new Event("gm-sync"));
          } catch (e) {}
        }
      })
      .catch(function () {});
  }
  setInterval(poll, 15000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) poll();
  });
})();