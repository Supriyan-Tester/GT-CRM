/* Shop location picker (shared by the delivery page and the Shop pins page).
   GMPin.pick(shopName, cb) opens a full-screen map. It listens to the phone's location (GPS, and WiFi/tower as a fallback
   indoors), shows the position with its accuracy circle, and lets the employee drag the pin onto the shop.
   Save is allowed only when the reading is 20 m or better, or after the employee has placed the pin by hand.
   cb(null) when cancelled; cb({ lat, lng, acc, moved }) when saved. Needs Leaflet (window.L). */
(function () {
  "use strict";
  var GOOD = 20; // metres: a reading this good can be saved without moving the pin
  var css =
    ".gp-bg{position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;font-family:inherit}" +
    ".gp-top{padding:12px 14px;border-bottom:1px solid #e5e7eb}" +
    ".gp-top b{display:block;font-size:15px}" +
    ".gp-top span{font-size:12px;color:#6b7280}" +
    ".gp-map{flex:1;min-height:200px;background:#e5e7eb}" +
    ".gp-bot{padding:12px 14px;border-top:1px solid #e5e7eb;background:#fff}" +
    ".gp-st{font-size:13px;line-height:1.4;margin-bottom:10px}" +
    ".gp-st.ok{color:#047857}.gp-st.warn{color:#b45309}.gp-st.bad{color:#b91c1c}" +
    ".gp-row{display:flex;gap:8px}" +
    ".gp-row button{flex:1;min-height:44px;border-radius:10px;border:1px solid #d1d5db;background:#fff;font-size:14px;font-weight:600}" +
    ".gp-row button.pri{background:#0f766e;color:#fff;border-color:#0f766e}" +
    ".gp-row button:disabled{opacity:.45}" +
    ".gp-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);transform:rotate(-45deg)}" +
    ".gp-pin:after{content:'';position:absolute;left:7px;top:7px;width:10px;height:10px;border-radius:50%;background:#fff}";
  function addCss() {
    if (document.getElementById("gp-css")) return;
    var s = document.createElement("style");
    s.id = "gp-css";
    s.textContent = css;
    document.head.appendChild(s);
  }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function pick(shopName, cb) {
    addCss();
    if (!window.isSecureContext) {
      alert("Location works only on a secure (https) address. Ask the office for the app link.");
      return cb(null);
    }
    if (!navigator.geolocation || typeof L === "undefined") {
      alert("This phone cannot give its location right now.");
      return cb(null);
    }
    var bg = document.createElement("div");
    bg.className = "gp-bg";
    bg.innerHTML =
      '<div class="gp-top"><b>' +
      esc(shopName || "Shop") +
      '</b><span>Stand at the shop. Drag the pin onto the shop if it is not exactly there.</span></div>' +
      '<div class="gp-map" id="gpMap"></div>' +
      '<div class="gp-bot"><div class="gp-st" id="gpSt">Getting your location...</div>' +
      '<div class="gp-row"><button type="button" id="gpX">Cancel</button><button type="button" id="gpR">Use my location again</button>' +
      '<button type="button" class="pri" id="gpS" disabled>Save</button></div></div>';
    document.body.appendChild(bg);
    var st = bg.querySelector("#gpSt"),
      save = bg.querySelector("#gpS"),
      map = L.map(bg.querySelector("#gpMap"), { zoomControl: true }).setView([20.5937, 78.9629], 5),
      marker = null,
      circle = null,
      best = null, // best reading so far: {lat, lng, acc}
      moved = false, // the employee dragged the pin
      cur = null, // where the pin is now
      wids = [],
      closed = false,
      t0 = Date.now(),
      first = true;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    setTimeout(function () {
      map.invalidateSize();
    }, 200);

    function say(t, cls) {
      st.className = "gp-st" + (cls ? " " + cls : "");
      st.textContent = t;
    }
    function refresh() {
      if (!cur) return;
      var ok = moved || cur.acc <= GOOD;
      save.disabled = !ok;
      if (moved) say("Pin placed by you. Check it is on the shop, then tap Save.", "ok");
      else if (cur.acc <= GOOD) say("Good signal (about " + cur.acc + " m). Tap Save.", "ok");
      else
        say(
          "Signal is weak (about " + cur.acc + " m). Drag the pin onto the shop to save, or tap \"Use my location again\" at the shop front.",
          "warn",
        );
    }
    function place(r, recentre) {
      cur = { lat: r.lat, lng: r.lng, acc: r.acc };
      if (!marker) {
        marker = L.marker([r.lat, r.lng], {
          draggable: true,
          icon: L.divIcon({ className: "", html: '<div class="gp-pin"></div>', iconSize: [30, 30], iconAnchor: [4, 30] }),
        }).addTo(map);
        marker.on("dragend", function () {
          var p = marker.getLatLng();
          moved = true;
          cur = { lat: p.lat, lng: p.lng, acc: best ? best.acc : cur.acc };
          circle.setLatLng(p);
          refresh();
        });
        circle = L.circle([r.lat, r.lng], { radius: Math.max(r.acc, 3), weight: 1 }).addTo(map);
      } else {
        marker.setLatLng([r.lat, r.lng]);
        circle.setLatLng([r.lat, r.lng]);
      }
      circle.setRadius(Math.max(r.acc, 3));
      if (recentre) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 19));
      refresh();
    }
    function onFix(pos) {
      if (closed) return;
      var r = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: Math.round(pos.coords.accuracy || 0),
      };
      if (!best || r.acc < best.acc) best = r;
      if (moved) return; // never move a pin the employee has placed
      if (first || r.acc <= (cur ? cur.acc : 1e9)) {
        place(r, first);
        first = false;
      }
    }
    function onErr(e) {
      if (closed || best) return;
      if (e && e.code === 1)
        say("Location is blocked. Allow location for this site in the browser settings, then tap \"Use my location again\".", "bad");
      else if (Date.now() - t0 > 30000)
        say("Could not get your location. Turn on GPS, go to the shop front and tap \"Use my location again\".", "bad");
    }
    function stop() {
      wids.forEach(function (w) {
        try {
          navigator.geolocation.clearWatch(w);
        } catch (e) {}
      });
      wids = [];
    }
    function start() {
      stop();
      t0 = Date.now();
      moved = false;
      best = null;
      first = true;
      say("Getting your location...");
      // GPS (precise, slow indoors) and the network position (WiFi/towers: quick indoors, rougher) together; the better one wins.
      wids.push(navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }));
      wids.push(navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: false, maximumAge: 0, timeout: 30000 }));
    }
    function close(res) {
      if (closed) return;
      closed = true;
      stop();
      try {
        map.remove();
      } catch (e) {}
      bg.remove();
      cb(res);
    }
    bg.querySelector("#gpX").onclick = function () {
      close(null);
    };
    bg.querySelector("#gpR").onclick = start;
    save.onclick = function () {
      if (!cur || save.disabled) return;
      close({ lat: cur.lat, lng: cur.lng, acc: cur.acc, moved: moved });
    };
    start();
  }
  window.GMPin = { pick: pick, GOOD: GOOD };
})();