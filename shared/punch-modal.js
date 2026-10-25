/* Punch In / Punch Out as a popup. Include after mock-data.js.
   Any link to punch-in.html or punch-out.html on the page opens the popup instead. */
(function () {
  var css =
    "" +
    ".pm-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:1000}" +
    ".pm-ov.open{display:flex}" +
    ".pm-box{background:var(--bg);width:100%;max-width:560px;max-height:92vh;border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 30px rgba(0,0,0,.25)}" +
    "@media(min-width:700px){.pm-ov{align-items:center}.pm-box{border-radius:22px;max-height:90vh}}" +
    ".pm-top{display:flex;align-items:center;gap:12px;padding:16px 18px;background:linear-gradient(135deg,var(--t-primary),var(--card));border-bottom:1px solid var(--border)}" +
    ".pm-top h3{font-size:18px;font-weight:700;line-height:1.2}.pm-top p{font-size:12.5px;color:var(--muted);margin-top:2px}.pm-top>div{flex:1;min-width:0}" +
    ".pm-x{width:36px;height:36px;border:0;border-radius:10px;background:var(--card);color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)}" +
    ".pm-x svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}" +
    ".pm-body{padding:16px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}" +
    ".pm-foot{padding:12px 18px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:var(--card);display:flex;flex-direction:column;gap:8px}" +
    ".pm-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px}" +
    ".pm-st{display:flex;align-items:center;gap:10px;font-size:14.5px;font-weight:700;margin-bottom:10px}" +
    ".pm-n{width:24px;height:24px;border-radius:50%;background:var(--primary);color:var(--on-primary);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    ".pm-gps{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--success);background:var(--t-success)}" +
    ".pm-gps b{display:block;font-size:13.5px;color:var(--success)}.pm-gps span.s{display:block;font-size:12px;color:var(--muted);margin-top:1px}.pm-gps .tx{flex:1;min-width:0}" +
    ".pm-gps.warn{border-color:var(--accent);background:var(--t-accent)}.pm-gps.warn b{color:var(--accent)}" +
    ".pm-gps.idle{border-color:var(--border);background:var(--bg)}.pm-gps.idle b{color:var(--muted)}" +
    ".pm-selfie{display:flex;flex-direction:column;align-items:center;gap:8px}" +
    ".pm-circle{width:120px;height:120px;border-radius:50%;border:2.5px dashed var(--primary);background:var(--t-primary);color:var(--primary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;overflow:hidden;font-size:12.5px;font-weight:700}" +
    ".pm-circle svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".pm-circle img{width:100%;height:100%;object-fit:cover;display:none}" +
    ".pm-hint{font-size:12px;color:var(--muted)}" +
    ".pm-veh{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--t-info);border-radius:12px;padding:10px 12px;margin-bottom:12px}" +
    ".pm-veh small{display:block;font-size:12px;color:var(--muted)}.pm-veh strong{font-size:15px}" +
    ".pm-lab{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}" +
    ".pm-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
    ".pm-box2{background:var(--t-info);border-radius:12px;padding:10px 12px}.pm-box2 small{display:block;font-size:12px;color:var(--muted)}.pm-box2 strong{font-size:18px;font-weight:800}" +
    ".pm-driven{margin-top:10px;text-align:center;padding:12px;border-radius:12px;background:linear-gradient(135deg,var(--hero1),var(--hero2));color:var(--on-hero)}" +
    ".pm-driven small{display:block;font-size:11.5px;opacity:.9;text-transform:uppercase;letter-spacing:.04em}.pm-driven strong{font-size:26px;font-weight:800}" +
    ".pm-ret{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}.pm-ret small{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}.pm-ret small.bad{color:var(--danger)}" +
    ".pm-clean{font-size:13px;color:var(--success);font-weight:600;padding:2px 0 10px}" +
    ".pm-check{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1.5px solid var(--border);border-radius:12px;background:var(--bg);cursor:pointer;margin-top:10px}" +
    ".pm-check:first-of-type{margin-top:0}.pm-check input{width:22px;height:22px;accent-color:var(--primary);flex-shrink:0;margin-top:1px}.pm-check b{display:block;font-size:13.5px}.pm-check span{display:block;font-size:12px;color:var(--muted);margin-top:2px}" +
    ".pm-check:has(input:checked){border-color:var(--primary);background:var(--t-primary)}" +
    ".pm-sum{border-radius:16px;padding:14px 16px;color:var(--on-hero);background:linear-gradient(135deg,var(--hero1),var(--hero2))}" +
    ".pm-sum b{font-size:17px;display:block}.pm-sum p{font-size:12.5px;opacity:.9;margin-top:2px}" +
    ".pm-sg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.pm-sg .pm-wide{grid-column:1/-1}.pm-sg div{background:rgba(255,255,255,.15);border-radius:10px;padding:8px 10px;min-width:0}.pm-sg small{display:block;font-size:11px;opacity:.85}.pm-sg strong{font-size:13px;overflow-wrap:anywhere}" +
    ".pm-go{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border:0;border-radius:14px;background:linear-gradient(135deg,var(--hero1),var(--hero2));color:var(--on-hero);font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}" +
    ".pm-go.red{background:var(--danger);color:#fff}.pm-go:disabled{background:var(--border);color:var(--muted);cursor:not-allowed}" +
    ".pm-todo{font-size:12px;color:var(--muted);text-align:center;min-height:16px}" +
    ".pm-wa{display:flex;align-items:center;justify-content:center;height:42px;border-radius:12px;border:1.5px solid #25D366;color:#16A34A;font-weight:700;font-size:13px;text-decoration:none;background:var(--card)}";
  var css2 =
    "" +
    ".pm-body>*{flex-shrink:0}.pm-two>*{min-width:0}.pm-two .field{width:100%}.pm-two .field input{width:100%;min-width:0}" +
    ".pm-shop{border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:10px;background:var(--bg)}" +
    ".pm-shop.bad{border-color:var(--danger);background:var(--t-danger)}" +
    ".pm-sh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:14px}.pm-sh>b{min-width:0;overflow-wrap:anywhere}.pm-sh>span{font-weight:800;white-space:nowrap}" +
    ".pm-tag{font-size:11.5px;font-weight:700;color:var(--danger);background:var(--card);border-radius:999px;padding:3px 10px}" +
    ".pm-li{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px dashed var(--border);font-size:13px}.pm-li b{font-weight:600}.pm-li small{display:block;font-size:12px;color:var(--muted);margin-top:2px}.pm-li em{font-style:normal;font-weight:700;white-space:nowrap}" +
    ".pm-tot{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;background:var(--t-accent);font-size:13.5px;margin:2px 0 4px}.pm-tot b{font-size:17px}" +
    ".pm-fin{text-align:center;padding:36px 12px}.pm-ok{width:72px;height:72px;border-radius:50%;background:var(--t-success);color:var(--success);display:inline-flex;align-items:center;justify-content:center}.pm-ok svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.pm-fin h4{font-size:22px;margin:14px 0 6px}.pm-fin p{font-size:14px;color:var(--muted);line-height:1.5}";
  var st = document.createElement("style");
  st.textContent = css + css2;
  document.head.appendChild(st);

  var ov = document.createElement("div");
  ov.className = "pm-ov";
  ov.innerHTML =
    '<div class="pm-box" role="dialog" aria-modal="true"><div class="pm-top"><div><h3 id="pmT"></h3><p id="pmS"></p></div><button type="button" class="pm-x" id="pmX" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="pm-body" id="pmBody"></div><div class="pm-foot" id="pmFoot"></div></div>';
  document.body.appendChild(ov);
  function $(id) {
    return document.getElementById(id);
  }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function close() {
    ov.classList.remove("open");
    document.body.style.overflow = "";
  }
  $("pmX").onclick = close;
  ov.addEventListener("click", function (e) {
    if (e.target === ov) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  // Depot check (never blocks)
  function depotCheck(box, doneText, W, cb) {
    W = W || {};
    var wh = GM.getWarehouse() || {};
    function set(cls, t, s, b) {
      box.setAttribute("data-ok", cls === "" ? "1" : "");
      box.className = "pm-gps " + cls;
      box.querySelector("b").textContent = t;
      box.querySelector(".s").textContent = s;
      box.querySelector(".badge").textContent = b;
      box.querySelector(".badge").className =
        "badge " +
        (cls === "" ? "b-success" : cls === "warn" ? "b-accent" : "b-muted");
      if (cb) cb();
    }
    if (wh.lat == null) {
      box.setAttribute("data-nodepot", "1");
      set(
        "idle",
        "Depot not set",
        "The office has not saved the depot location yet.",
        W.badU || "Not checked",
      );
      return;
    }
    if (!navigator.geolocation) {
      set(
        "idle",
        W.none || "Location not checked",
        W.noneS || "Location is not available on this device.",
        W.badU || "Unverified",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var R = 6371000,
          r = Math.PI / 180,
          dLat = (wh.lat - pos.coords.latitude) * r,
          dLng = (wh.lng - pos.coords.longitude) * r;
        var a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(pos.coords.latitude * r) *
            Math.cos(wh.lat * r) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        var m = Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))),
          ok = m <= (wh.radiusMeters || 200);
        if (ok)
          set(
            "",
            W.ok || "Location verified: at depot",
            doneText + " (" + m + " m)",
            W.badOk || "At Depot",
          );
        else
          set(
            "warn",
            W.away || "You are away from the depot",
            (m >= 1000 ? (m / 1000).toFixed(1) + " km" : m + " m") +
              " from " +
              (wh.name || "the depot"),
            W.badAway || "Not at depot",
          );
      },
      function () {
        set(
          "idle",
          W.off || "Turn on location",
          W.offS || "Location is needed to verify you are at the depot.",
          W.badU || "Unverified",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  var GPS =
    '<div class="pm-gps idle" id="pmGps"><div class="tx"><b>Checking your location...</b><span class="s">Allow location when your phone asks.</span></div><span class="badge b-muted">Checking</span></div>';

  function openIn() {
    var shift = GM.getShift(),
      lastKm = shift.lastRecordedKm || 0,
      HELPER = (GM.getData() || {}).crewRole === "helper";
    $("pmT").textContent = "Morning Punch In";
    $("pmS").textContent = "Start your day";
    $("pmBody").innerHTML =
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">1</span>Are you at the depot?</div>' +
      GPS +
      "</div>" +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">2</span>Your photo</div><div class="pm-selfie"><label class="pm-circle" for="pmSelfie"><img id="pmImg" alt="Selfie"><span id="pmPrompt" style="display:flex;flex-direction:column;align-items:center;gap:4px"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Take Photo</span></label><input type="file" id="pmSelfie" accept="image/*" capture="user" style="display:none"><span class="pm-hint">Tap the circle to take your photo</span></div></div>' +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">3</span>' +
      (HELPER ? "Vehicle" : "Vehicle &amp; KM") +
      "</div>" +
      '<div class="pm-veh"><div><small>Your vehicle (from office)</small><strong>' +
      esc(shift.assignedVehicle || "No vehicle given yet") +
      '</strong></div><span class="badge ' +
      (shift.assignedVehicle ? "b-info" : "b-muted") +
      '">' +
      (shift.assignedVehicle ? "Ready" : "Waiting") +
      "</span></div>" +
      (HELPER
        ? '<div id="pmKmF" style="display:none"><input type="number" id="pmKm"></div>'
        : '<label class="pm-lab" for="pmKm">Morning KM (look at vehicle meter)</label><div class="field" id="pmKmF"><input type="number" id="pmKm" inputmode="numeric" placeholder="' +
          (lastKm || "Enter KM") +
          '" style="font-weight:700;font-size:18px"></div>') +
      (lastKm && !HELPER
        ? '<div class="pm-hint" style="margin-top:6px">Last evening KM: <b>' +
          lastKm.toLocaleString("en-IN") +
          " km</b></div>"
        : "") +
      '<div class="msg" id="pmMsg"></div></div>';
    $("pmFoot").innerHTML =
      '<button type="button" class="pm-go" id="pmGo" disabled>Punch In - Start Day</button><div class="pm-todo" id="pmTodo"></div>';
    var needDepot = function () {
      var g = $("pmGps");
      return (
        GM.settings().requireDepot &&
        g.getAttribute("data-nodepot") !== "1" &&
        g.getAttribute("data-ok") !== "1"
      );
    };
    depotCheck(
      $("pmGps"),
      "Ready at the depot",
      {
        ok: "You are at the depot",
        away: "You are not at the depot",
        off: "Turn on your location",
        offS: "Please allow location on your phone.",
        none: "Location not checked",
        noneS: "Location is not available on this phone.",
        badOk: "At depot",
        badAway: "Away",
        badU: "Not checked",
      },
      function () {
        setTimeout(function () {
          check();
        }, 0);
      },
    );
    $("pmSelfie").onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function (ev) {
        $("pmImg").src = ev.target.result;
        $("pmImg").style.display = "block";
        $("pmPrompt").style.display = "none";
      };
      rd.readAsDataURL(f);
    };
    function check() {
      var v = parseInt($("pmKm").value, 10),
        msg = $("pmMsg");
      $("pmKmF").classList.remove("err");
      msg.textContent = "";
      msg.style.color = "";
      var ok = HELPER || !isNaN(v);
      if (HELPER) {
        var dh = needDepot();
        $("pmGo").disabled = dh;
        $("pmTodo").textContent = dh ? "Go to the depot to punch in" : "";
        return;
      }
      if (ok && v < lastKm) {
        ok = false;
        $("pmKmF").classList.add("err");
        msg.textContent =
          "Morning KM cannot be less than last evening KM (" +
          lastKm.toLocaleString("en-IN") +
          " km). Please check.";
      } else if (ok && lastKm && v > lastKm + GM.settings().jumpKm) {
        msg.style.color = "var(--accent)";
        msg.textContent =
          "Please check the KM. It is " +
          (v - lastKm) +
          " km more than last evening.";
      }
      var dep = needDepot();
      $("pmGo").disabled = !ok || dep;
      $("pmTodo").textContent = isNaN(v)
        ? "Enter the morning KM to continue"
        : dep
          ? "Go to the depot to punch in"
          : "";
    }
    $("pmKm").oninput = check;
    $("pmGo").onclick = function () {
      var v = parseInt($("pmKm").value, 10),
        now = new Date();
      GM.updateShift({
        punchedIn: true,
        punchInTime: now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        startKm: HELPER ? null : v,
        punchedOut: false,
      });
      this.disabled = true;
      this.textContent = "Done. Opening your route...";
      setTimeout(function () {
        location.href = "home.html";
      }, 600);
    };
    show();
  }

  function openOut() {
    var shift = GM.getShift(),
      shops = GM.getShops() || [],
      returns = GM.getReturns() || [],
      worker = GM.getWorker() || {};
    var HELPER = (GM.getData() || {}).crewRole === "helper";
    var startKm = shift.startKm || shift.lastRecordedKm || 0,
      now = new Date(),
      endTime = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    var done = shops.filter(function (s) {
      return s.status === "delivered";
    }).length;
    var cancelled = shops.filter(function (s) {
      return s.status === "cancelled";
    });
    function rs(n) {
      return (
        "\u20B9" +
        (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }

    // Returned goods, grouped by shop
    var byShop = [],
      idx = {},
      total = 0;
    returns.forEach(function (r) {
      var k = r.shopId || r.shopName;
      if (idx[k] == null) {
        idx[k] = byShop.length;
        byShop.push({ name: r.shopName, items: [], sum: 0 });
      }
      var g = byShop[idx[k]];
      g.items.push(r);
      g.sum += parseFloat(r.deductionAmount) || 0;
      total += parseFloat(r.deductionAmount) || 0;
    });
    var hasGoods = byShop.length > 0 || cancelled.length > 0,
      list = "";
    byShop.forEach(function (g) {
      list +=
        '<div class="pm-shop"><div class="pm-sh"><b>' +
        esc(g.name) +
        "</b><span>" +
        rs(g.sum) +
        "</span></div>" +
        g.items
          .map(function (r) {
            return (
              '<div class="pm-li"><div><b>' +
              esc(r.productName) +
              "</b><small>" +
              esc(r.quantity) +
              (Number(r.quantity) === 1 ? " piece" : " pieces") +
              " &middot; " +
              esc(r.reason) +
              "</small></div><em>" +
              rs(r.deductionAmount) +
              "</em></div>"
            );
          })
          .join("") +
        "</div>";
    });
    cancelled.forEach(function (s) {
      var what =
        s.items && s.items.length
          ? s.items.length + (s.items.length === 1 ? " item" : " items")
          : (s.boxes || 0) + ((s.boxes || 0) === 1 ? " box" : " boxes");
      list +=
        '<div class="pm-shop bad"><div class="pm-sh"><b>' +
        esc(s.name) +
        '</b><span class="pm-tag">Not delivered</span></div><div class="pm-li"><div><b>' +
        what +
        " not delivered</b><small>" +
        esc(s.problemReason || "Shop closed") +
        " &middot; Give back to the office</small></div></div></div>";
    });
    var step = 0;
    function n() {
      step += 1;
      return '<span class="pm-n">' + step + "</span>";
    }

    $("pmT").textContent = "Punch Out";
    $("pmS").textContent = "End your day";
    $("pmBody").innerHTML =
      '<div class="pm-sum"><b>' +
      esc(worker.name || "") +
      "</b><p>" +
      esc(shift.punchInTime || "--") +
      " to " +
      endTime +
      '</p><div class="pm-sg"><div><small>Vehicle</small><strong>' +
      esc(shift.assignedVehicle || "--") +
      "</strong></div><div><small>Delivered</small><strong>" +
      done +
      " of " +
      shops.length +
      " shops</strong></div>" +
      (hasGoods
        ? '<div class="pm-wide"><small>Goods came back</small><strong>' +
          (returns.length
            ? returns.length + (returns.length === 1 ? " item" : " items")
            : "") +
          (returns.length && cancelled.length ? " + " : "") +
          (cancelled.length
            ? cancelled.length +
              (cancelled.length === 1
                ? " shop not delivered"
                : " shops not delivered")
            : "") +
          (total > 0 ? " &middot; " + rs(total) : "") +
          "</strong></div>"
        : "") +
      "</div></div>" +
      '<div class="pm-card"><div class="pm-st">' +
      n() +
      "Are you at the depot?</div>" +
      GPS +
      "</div>" +
      (hasGoods
        ? '<div class="pm-card"><div class="pm-st">' +
          n() +
          'Goods that came back</div><div class="pm-hint" style="margin:-4px 0 10px">Give these goods to the office.</div>' +
          list +
          (total > 0
            ? '<div class="pm-tot"><span>Total to cut from bills</span><b>' +
              rs(total) +
              "</b></div>"
            : "") +
          "</div>"
        : "") +
      '<div class="pm-card"><div class="pm-st">' +
      n() +
      (HELPER ? "Give to office" : "Vehicle KM") +
      "</div>" +
      (HELPER
        ? ""
        : '<div class="pm-two"><div class="pm-box2"><small>Morning KM</small><strong>' +
          startKm.toLocaleString("en-IN") +
          '</strong></div><div><label class="pm-lab" for="pmEnd">Evening KM (now)</label><div class="field" id="pmEndF"><input type="number" id="pmEnd" inputmode="numeric" placeholder="' +
          startKm +
          '" style="font-weight:700;font-size:18px"></div></div></div><div class="msg" id="pmMsg"></div><div class="pm-driven"><small>You drove today</small><strong id="pmDriven">-- km</strong></div>') +
      '<label class="pm-check" style="margin-top:12px"><input type="checkbox" id="pmInv"><div><b>' +
      (hasGoods
        ? "I gave goods, keys and bills to the office"
        : "I gave keys and bills to the office") +
      "</b></div></label></div>";
    $("pmBody").insertAdjacentHTML(
      "beforeend",
      '<a class="pm-wa" id="pmWa" href="#" target="_blank" rel="noopener">Send day report on WhatsApp (optional)</a>',
    );
    $("pmFoot").innerHTML =
      '<button type="button" class="pm-go red" id="pmGo" disabled>Punch Out - End Day</button><div class="pm-todo" id="pmTodo"></div>';
    var needDepotO = function () {
      var g = $("pmGps");
      return (
        GM.settings().requireDepot &&
        g.getAttribute("data-nodepot") !== "1" &&
        g.getAttribute("data-ok") !== "1"
      );
    };
    depotCheck(
      $("pmGps"),
      "Vehicle is back",
      {
        ok: "You are at the depot",
        away: "You are not at the depot",
        off: "Turn on your location",
        offS: "Please allow location on your phone.",
        none: "Location not checked",
        noneS: "Location is not available on this phone.",
        badOk: "At depot",
        badAway: "Away",
        badU: "Not checked",
      },
      function () {
        setTimeout(function () {
          validate();
        }, 0);
      },
    );
    var endEl = $("pmEnd"),
      invEl = $("pmInv");
    function calc() {
      if (HELPER) return true;
      var v = parseInt(endEl.value, 10),
        msg = $("pmMsg");
      $("pmEndF").classList.remove("err");
      msg.textContent = "";
      msg.style.color = "";
      if (isNaN(v)) {
        $("pmDriven").textContent = "-- km";
        return false;
      }
      if (v < startKm) {
        $("pmEndF").classList.add("err");
        msg.textContent =
          "Evening KM cannot be less than morning KM (" +
          startKm.toLocaleString("en-IN") +
          "). Please check.";
        $("pmDriven").textContent = "-- km";
        return false;
      }
      $("pmDriven").textContent = v - startKm + " km";
      if (v - startKm > GM.settings().highKm) {
        msg.style.color = "var(--accent)";
        msg.textContent = v - startKm + " km is a lot. Please check the KM.";
      }
      return true;
    }
    function validate() {
      var ok = calc(),
        todo = [];
      if (!ok) todo.push("enter evening KM");
      if (!invEl.checked) todo.push("tick the box above");
      if (needDepotO()) todo.push("go to the depot");
      $("pmGo").disabled = todo.length > 0;
      $("pmTodo").textContent = todo.length
        ? "Still to do: " + todo.join(", ")
        : "";
      var v = HELPER ? NaN : parseInt(endEl.value, 10);
      $("pmWa").href =
        "https://api.whatsapp.com/send?text=" +
        encodeURIComponent(
          "GM-CRM Day Report - " +
            (worker.name || "") +
            "\nDate: " +
            now.toLocaleDateString("en-IN") +
            "\nVehicle: " +
            (shift.assignedVehicle || "--") +
            (HELPER
              ? ""
              : "\nStart KM: " +
                startKm +
                " | End KM: " +
                (endEl.value || "--") +
                " (Drove: " +
                (isNaN(v) ? "--" : v - startKm) +
                " km)") +
            "\nDelivered: " +
            done +
            " of " +
            shops.length +
            " shops" +
            (total > 0 ? "\nGoods returned: " + rs(total) : ""),
        );
    }
    if (endEl) endEl.oninput = validate;
    invEl.onchange = validate;
    validate();
    $("pmGo").onclick = function () {
      var v = parseInt(endEl ? endEl.value : "", 10);
      GM.updateShift(
        HELPER
          ? {
              punchedOut: true,
              punchOutTime: endTime,
              endKm: null,
              drivenKm: 0,
              handoverCompleted: true,
            }
          : {
              punchedOut: true,
              punchOutTime: endTime,
              endKm: v,
              drivenKm: v - startKm,
              handoverCompleted: true,
            },
      );
      $("pmS").textContent = "Day closed";
      $("pmBody").innerHTML =
        '<div class="pm-fin"><span class="pm-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><h4>Day closed</h4><p>The office has your day report.<br>See you tomorrow, ' +
        esc((worker.name || "").split(" ")[0]) +
        ".</p></div>";
      $("pmFoot").innerHTML = "";
      setTimeout(function () {
        localStorage.removeItem("gm_logged_in");
        location.href = "login.html";
      }, 2500);
    };
    show();
  }
  function show() {
    ov.classList.add("open");
    document.body.style.overflow = "hidden";
    $("pmBody").scrollTop = 0;
  }

  window.PunchModal = { openIn: openIn, openOut: openOut, close: close };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var h = a.getAttribute("href") || "";
    if (/(^|\/)punch-in\.html([?#]|$)/.test(h)) {
      e.preventDefault();
      openIn();
    } else if (/(^|\/)punch-out\.html([?#]|$)/.test(h)) {
      e.preventDefault();
      openOut();
    }
  });
})();
