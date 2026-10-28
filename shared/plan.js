/* General Traders - Daily Plan workspace (three panels: plans, selected plan, route map).
   Customers -> Routes -> Daily plan -> Employee. A daily plan never changes the saved route. */
(function () {
  "use strict";
  var DP = window.DP,
    O = GA.ops,
    esc = DP.esc,
    $ = DP.$,
    R = DP.money;
  var PAGE = 25;
  var st = {
    date: GA.today(),
    selId: "",
    q: "",
    sort: "status",
    showCancelled: false,
    tab: "customers",
    page: 0,
    mob: "plans",
    ready: false,
    err: "",
  };
  var panelMap = null,
    mapSig = "",
    fs = { open: false, map: null, q: "", area: "", sel: 0, planId: "" };
  var noteHtml = "";

  var pg = GA.mount("plan.html", "Daily plan");
  document.title = "Daily Plan - General Traders Admin";
  pg.innerHTML =
    '<div class="dp-head"><div><p>Manage today\'s delivery plans, customer visits, and routes.</p></div>' +
    '<div class="dp-tools"><span class="dp-sync" data-act id="dpSync" role="status"><i></i><span>Saved</span></span>' +
    GA.dateNav("dpPrev", "dpDate", "dpNext", "", "", "Plan date") +
    '<div class="field a-f" data-act style="width:190px;height:38px"><input type="search" id="dpQ" placeholder="Search plan..." aria-label="Search plans, customers, areas and codes" autocomplete="off"></div>' +
    (GA.DEMO_MODE
      ? '<button type="button" class="btn btn-secondary a-btn" id="dpDemo" data-act>Load demo data</button>'
      : "") +
    '<button type="button" class="btn btn-secondary a-btn" id="dpDl" data-act title="Download the bills of this day\'s plans as an Excel file">' +
    DP.icon("download") +
    " Download bills</button>" +
    '<button type="button" class="btn a-btn" id="dpAdd" data-act>' +
    GA.icon("plus") +
    " Add plan</button></div></div>" +
    '<div id="dpBanner"></div><div id="dpNote"></div><div class="dp-stats" id="dpStats" aria-live="polite"></div>' +
    '<div class="a-seg dp-seg" id="dpSeg" role="tablist"><button type="button" data-m="plans" role="tab">Plans</button><button type="button" data-m="detail" role="tab">Details</button><button type="button" data-m="map" role="tab">Map</button></div>' +
    '<section class="dp-panel dp-none" id="dpNone" hidden></section>' +
    '<div class="dp-grid" id="dpGrid" data-m="plans">' +
    '<section class="dp-panel dp-pplans" aria-label="Plans"><div class="dp-ph"><h3 id="dpLT">Today\'s plans</h3></div><div class="dp-list" id="dpList"></div></section>' +
    '<section class="dp-panel dp-pdetail" id="dpDetail" aria-label="Selected plan"></section>' +
    '<section class="dp-panel dp-pmap" aria-label="Route map"><div class="dp-ph"><h3>Route map</h3><button type="button" class="dp-ib bd" id="dpExpand" aria-label="Open the map full screen" title="Full screen">' +
    DP.icon("expand") +
    '</button></div><div class="dp-mapwrap"><div class="dp-map" id="dpMap"></div><div class="dp-mapover" id="dpMapOver" hidden></div></div><div id="dpMsum"></div></section></div>' +
    '<div class="dp-fs" id="dpFs" role="dialog" aria-modal="true" aria-label="Route on map"></div>';

  /* ---------- context used by the dialogs ---------- */
  DP.ctx = {
    date: function () {
      return st.date;
    },
    select: function (id, reset) {
      st.selId = id || "";
      st.page = 0;
      st.tab = "customers";
      if (reset) {
        st.q = "";
        $("dpQ").value = "";
      }
      if (id) st.mob = "detail";
      render(true);
    },
    note: function (html) {
      noteHtml = html;
      drawNote();
    },
    refresh: function () {
      render();
    },
    afterCancel: function (id) {
      if (st.selId === id && !st.showCancelled) st.selId = "";
      render(true);
    },
  };
  function drawNote() {
    $("dpNote").innerHTML = noteHtml
      ? '<div class="dp-banner"><span class="grow">' +
        noteHtml +
        '</span><button type="button" class="dp-ib" id="dpNoteX" aria-label="Dismiss">' +
        DP.icon("close") +
        "</button></div>"
      : "";
    var x = $("dpNoteX");
    if (x)
      x.onclick = function () {
        noteHtml = "";
        drawNote();
      };
  }

  /* ---------- data for the selected date ---------- */
  // Cancelled plans are not shown in the admin view at all (the record stays only so the employee's app gets the cancellation).
  function plans() {
    return DP.plansOn(DP.S, st.date).filter(function (p) {
      return p.status !== "cancelled";
    });
  }
  function isPast() {
    return st.date < GA.today();
  }
  function areaOf(code) {
    var c = DP.cust(DP.S, code);
    return c ? c.area || c.place || "" : "";
  }
  function stopMatch(s, q) {
    return (
      !q ||
      (s.name + " " + s.code + " " + areaOf(s.code)).toLowerCase().indexOf(q) >
        -1
    );
  }
  function planMatch(p, q) {
    return (
      !q ||
      (p.worker + " " + p.routeName + " " + p.vehicle)
        .toLowerCase()
        .indexOf(q) > -1 ||
      p.stops.some(function (s) {
        return stopMatch(s, q);
      })
    );
  }
  function visible() {
    var q = st.q.toLowerCase(),
      L = plans().filter(function (p) {
        return (
          (st.showCancelled || p.status !== "cancelled") && planMatch(p, q)
        );
      });
    var rank = { progress: 0, scheduled: 1, completed: 2, cancelled: 3 };
    L.sort(function (a, b) {
      if (st.sort === "worker") return a.worker.localeCompare(b.worker);
      if (st.sort === "route") return a.routeName.localeCompare(b.routeName);
      if (st.sort === "size")
        return (
          b.stops.length - a.stops.length || a.worker.localeCompare(b.worker)
        );
      return (
        rank[DP.planStatus(a, st.date).key] -
          rank[DP.planStatus(b, st.date).key] ||
        a.worker.localeCompare(b.worker)
      );
    });
    return L;
  }
  function selected() {
    return (
      plans().filter(function (p) {
        return p.id === st.selId;
      })[0] || null
    );
  }

  /* ---------- header: stats, sync, banners ---------- */
  function drawStats() {
    var act = plans().filter(function (p) {
        return p.status !== "cancelled";
      }),
      codes = {},
      done = 0,
      pend = 0,
      miss = 0,
      unk = 0;
    act.forEach(function (p) {
      p.stops.forEach(function (s) {
        codes[s.code || s.name] = 1;
      });
      var c = DP.counts(p, st.date);
      done += c.done;
      pend += c.pending;
      miss += c.missed;
      unk += c.unknown;
    });
    var allUnk = unk && !done && !pend && !miss;
    function T(cls, icon, n, label) {
      return (
        '<div class="dp-stat"><span class="chip ' +
        cls +
        '">' +
        GA.icon(icon) +
        "</span><div><b>" +
        n +
        "</b><span>" +
        label +
        "</span></div></div>"
      );
    }
    $("dpStats").innerHTML =
      T("c-p", "store", Object.keys(codes).length, "Customers in plans") +
      T("c-s", "check", allUnk ? "-" : done, "Completed visits") +
      T("c-a", "clock", allUnk ? "-" : pend, "Pending visits") +
      T("c-d", "alert-triangle", allUnk ? "-" : miss, "Not delivered");
    if (allUnk)
      $("dpStats").lastChild.title =
        "Visit results are only kept for each employee's latest day";
  }
  function drawSync() {
    var el = $("dpSync"),
      s = DP.sync;
    el.className =
      "dp-sync " +
      (s.state === "ok" ? "" : s.state === "warn" ? "warn" : "err");
    el.lastChild.textContent =
      s.state === "ok" ? "Saved" : s.msg || "Saving...";
    el.title = s.msg || "";
  }
  function drawBanner() {
    var h = "";
    if (st.err)
      h +=
        '<div class="dp-banner err"><span class="grow">' +
        esc(st.err) +
        '</span><button type="button" class="btn btn-secondary a-btn" id="dpRetry">Retry</button></div>';
    else if (DP.online === false)
      h +=
        '<div class="dp-banner"><span class="grow">The server is not reachable, so visit status from the employees is not shown. Plans and changes are still kept on this computer.</span><button type="button" class="btn btn-secondary a-btn" id="dpRetry">Retry</button></div>';
    if (isPast())
      h +=
        '<div class="dp-banner"><span class="grow">This date is in the past. Plans are shown for reference and cannot be changed.</span></div>';
    $("dpBanner").innerHTML = h;
    var b = $("dpRetry");
    if (b)
      b.onclick = function () {
        st.err = "";
        boot();
      };
  }

  /* ---------- left: plan cards ---------- */
  function drawList() {
    var L = visible(),
      all = plans(),
      nCan = all.filter(function (p) {
        return p.status === "cancelled";
      }).length;
    $("dpLT").textContent =
      st.date === GA.today()
        ? "Today's plans"
        : "Plans for " + DP.niceDate(st.date, true);
    var h = "";
    if (!st.ready)
      h =
        '<div class="dp-skel"></div><div class="dp-skel"></div><div class="dp-skel"></div>';
    else if (!all.length)
      h =
        '<div class="dp-empty"><b>No plans for this date.</b>' +
        (isPast()
          ? "Nothing was planned for this day."
          : "Add a plan to assign a route to an employee and vehicle.") +
        (isPast()
          ? ""
          : '<br><button type="button" class="btn a-btn" data-add>' +
            GA.icon("plus") +
            " Add plan</button>") +
        "</div>";
    else if (!L.length)
      h =
        '<div class="dp-empty"><b>No matching plans or customers.</b>Try a different search.<br><button type="button" class="btn btn-secondary a-btn" data-clear>Clear filters</button></div>';
    else
      h = L.map(function (p) {
        var s = DP.planStatus(p, st.date),
          c = DP.counts(p, st.date),
          pct = c.total ? Math.round((c.done * 100) / c.total) : 0;
        return (
          '<div class="dp-plan' +
          (p.id === st.selId ? " on" : "") +
          (p.status === "cancelled" ? " off" : "") +
          '" data-id="' +
          esc(p.id) +
          '"><button type="button" class="dp-plan-main" data-sel="' +
          esc(p.id) +
          '" aria-pressed="' +
          (p.id === st.selId) +
          '">' +
          '<span class="dp-plan-top"><b>' +
          esc(p.worker) +
          '</b><span class="badge ' +
          s.cls +
          '">' +
          s.label +
          "</span></span>" +
          '<span class="dp-plan-meta"><span>' +
          GA.icon("map") +
          esc(p.routeName) +
          "</span><span>" +
          GA.icon("truck") +
          esc(p.vehicle) +
          "</span><span>" +
          GA.icon("store") +
          p.stops.length +
          (p.stops.length === 1 ? " customer" : " customers") +
          "</span></span>" +
          (p.status !== "cancelled" && c.done
            ? '<span class="dp-prog" aria-hidden="true"><i style="width:' +
              pct +
              '%"></i></span><span class="dp-plan-meta"><span>' +
              c.done +
              " of " +
              c.total +
              " delivered</span></span>"
            : "") +
          "</button>" +
          '<span class="dp-kebab"><button type="button" class="dp-ib" data-kebab="' +
          esc(p.id) +
          '" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ' +
          esc(p.worker) +
          "'s plan\">" +
          DP.icon("dots-vertical") +
          "</button></span></div>"
        );
      }).join("");
    if (st.ready && nCan)
      h +=
        '<button type="button" class="dp-chip' +
        (st.showCancelled ? " on" : "") +
        '" id="dpShowCan" aria-pressed="' +
        st.showCancelled +
        '" style="align-self:flex-start">' +
        (st.showCancelled ? "Hide" : "Show") +
        " cancelled (" +
        nCan +
        ")</button>";
    $("dpList").innerHTML = h;
  }

  /* ---------- plan menu ---------- */
  function planMenu(btn, p) {
    var can = p.status !== "cancelled" && !isPast(),
      hint = isPast() ? "Past plans cannot be changed" : "";
    var items = [
      {
        label: "View route on map",
        icon: "route",
        run: function () {
          openFs(p.id);
        },
      },
    ];
    if (p.status !== "cancelled")
      items.push(
        {
          label: "Add priority shop",
          icon: "flag",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.priority(p.id);
          },
        },
        {
          label: "Add another route",
          icon: "route",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.addRoute(p.id);
          },
        },
        {
          label: "Add shop with invoice",
          icon: "plus",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.addShop(p.id);
          },
        },
        {
          label: "Change order",
          icon: "swap",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.order(p.id);
          },
        },
        {
          label: "Helpers",
          icon: "users",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.helpers(p.id);
          },
        },
        {
          label: "Change employee",
          icon: "users",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.worker(p.id);
          },
        },
        {
          label: "Change vehicle",
          icon: "truck",
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.vehicle(p.id);
          },
        },
        "hr",
        {
          label: "Delete plan",
          icon: "trash",
          danger: true,
          disabled: !can,
          hint: hint,
          run: function () {
            DP.dlg.cancel(p.id);
          },
        },
      );
    DP.menu(btn, items);
  }

  /* ---------- centre: selected plan ---------- */
  function drawDetail() {
    var box = $("dpDetail"),
      p = selected();
    if (!st.ready) {
      box.innerHTML = '<div class="dp-body"><div class="dp-skel"></div></div>';
      return;
    }
    if (!plans().length) {
      box.innerHTML =
        '<div class="dp-empty"><b>No plans for this date.</b>' +
        (isPast()
          ? ""
          : 'Add a plan to get started.<br><button type="button" class="btn a-btn" data-add>' +
            GA.icon("plus") +
            " Add plan</button>") +
        "</div>";
      return;
    }
    if (!p) {
      box.innerHTML =
        '<div class="dp-empty"><b>Select a plan</b>Choose a plan from the list to view customers, route, and map.</div>';
      return;
    }
    var s = DP.planStatus(p, st.date),
      tabs = [
        ["customers", "Customers"],
        ["route", "Route info"],
        ["bill", "Daily bill"],
        ["notes", "Notes"],
      ];
    box.innerHTML =
      '<div class="dp-ctop"><div style="flex:1;min-width:0"><h3>' +
      esc(p.worker) +
      "'s Plan</h3>" +
      '<div class="dp-meta"><span>' +
      GA.icon("map") +
      esc(p.routeName) +
      " &middot; " +
      p.stops.length +
      (p.stops.length === 1 ? " customer" : " customers") +
      "</span><span>" +
      GA.icon("users") +
      esc(p.worker) +
      (p.helpers && p.helpers.length
        ? " + " + esc(DP.helperNames(p).join(", "))
        : "") +
      "</span><span>" +
      GA.icon("truck") +
      GA.vehLink(p.vehicle, p.vehicleId) +
      '</span><span class="badge ' +
      s.cls +
      '">' +
      s.label +
      "</span></div></div>" +
      '<span class="dp-mw"><button type="button" class="dp-ib bd" data-kebab="' +
      esc(p.id) +
      '" aria-haspopup="menu" aria-expanded="false" aria-label="Plan actions">' +
      DP.icon("dots-vertical") +
      "</button></span></div>" +
      (p.status === "cancelled" && p.cancel
        ? '<div class="dp-cancelled"><b>Cancelled</b> by ' +
          esc(p.cancel.by) +
          " on " +
          esc(DP.when(p.cancel.at)) +
          (p.cancel.reason ? " &middot; " + esc(p.cancel.reason) : "") +
          (p.cancel.note ? "<br>" + esc(p.cancel.note) : "") +
          "</div>"
        : "") +
      '<div class="dp-tabs" role="tablist">' +
      tabs
        .map(function (t) {
          return (
            '<button type="button" class="dp-tab' +
            (st.tab === t[0] ? " on" : "") +
            '" role="tab" aria-selected="' +
            (st.tab === t[0]) +
            '" data-tab="' +
            t[0] +
            '">' +
            t[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="dp-body" id="dpTabBody">' +
      tabBody(p) +
      "</div>";
  }
  function tabBody(p) {
    if (st.tab === "route") return tabRoute(p);
    if (st.tab === "bill") return tabBill(p);
    if (st.tab === "notes") return tabNotes(p);
    return tabCustomers(p);
  }
  var STB = {
    delivered: ["b-success", "Delivered"],
    pending: ["b-accent", "Pending"],
    retry: ["b-danger", "Not delivered"],
    cancelled: ["b-danger", "Cancelled"],
    unknown: ["b-muted", "Not recorded"],
  };
  function tabCustomers(p) {
    var q = st.q.toLowerCase(),
      rows = p.stops
        .map(function (s, i) {
          return { s: s, i: i };
        })
        .filter(function (x) {
          return stopMatch(x.s, q);
        });
    if (!p.stops.length)
      return '<div class="dp-empty"><b>No customers on this plan.</b></div>';
    if (!rows.length)
      return '<div class="dp-empty"><b>No matching plans or customers.</b><button type="button" class="btn btn-secondary a-btn" data-clear>Clear filters</button></div>';
    var pages = Math.ceil(rows.length / PAGE);
    if (st.page >= pages) st.page = pages - 1;
    if (st.page < 0) st.page = 0;
    var showT = p.stops.some(function (s) {
      return s.time;
    });
    var slice = rows.slice(st.page * PAGE, st.page * PAGE + PAGE),
      others = DP.activeOn(DP.S, st.date).filter(function (x) {
        return x.id !== p.id;
      }).length;
    return (
      '<div class="a-scroll"><table class="dp-table"><thead><tr><th>#</th><th>Customer</th><th>Area</th>' +
      (showT ? "<th>Visit time</th>" : "") +
      '<th>Status</th><th><span style="position:absolute;left:-9999px">Actions</span></th></tr></thead><tbody>' +
      slice
        .map(function (x) {
          var s = x.s,
            state = DP.stopState(p, s, st.date),
            b = STB[state] || STB.pending,
            can = state === "pending" && p.status !== "cancelled" && !isPast();
          return (
            '<tr><td><span class="n">' +
            (x.i + 1) +
            '</span></td><td class="c-name"><b>' +
            esc(s.name) +
            "</b>" +
            (s.priority ? '<span class="dp-pri">Priority</span>' : "") +
            (s.carried
              ? ' <span class="badge b-accent">Carried over</span>'
              : "") +
            '<span class="sub">' +
            esc(s.code || "") +
            (s.priority
              ? s.note
                ? " &middot; " + esc(s.note)
                : ""
              : s.inv
                ? " &middot; " + esc(s.inv)
                : "") +
            "</span></td>" +
            '<td class="c-area">' +
            esc(areaOf(s.code) || "-") +
            "</td>" +
            (showT
              ? '<td class="c-time">' + (s.time ? esc(s.time) : "-") + "</td>"
              : "") +
            '<td class="c-st"><span class="badge ' +
            b[0] +
            '">' +
            b[1] +
            "</span></td>" +
            '<td class="c-act">' +
            (can
              ? '<span class="dp-mw"><button type="button" class="dp-ib" data-rowmenu="' +
                esc(s.inv) +
                '" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ' +
                esc(s.name) +
                '" data-others="' +
                others +
                '">' +
                DP.icon("dots-vertical") +
                "</button></span>"
              : "") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>" +
      (pages > 1
        ? '<div class="dp-pg"><span>' +
          (st.page * PAGE + 1) +
          "-" +
          Math.min(rows.length, st.page * PAGE + PAGE) +
          " of " +
          rows.length +
          '</span><div><button type="button" class="btn btn-secondary a-btn" data-pg="-1"' +
          (st.page === 0 ? " disabled" : "") +
          '>Previous</button><button type="button" class="btn btn-secondary a-btn" data-pg="1"' +
          (st.page >= pages - 1 ? " disabled" : "") +
          ">Next</button></div></div>"
        : "")
    );
  }
  function routeFacts(p) {
    var stops = DP.mapStops(DP.S, p, st.date),
      pts = stops.filter(function (x) {
        return x.ll;
      }),
      areas = {},
      order = [];
    stops.forEach(function (x) {
      var a = x.area || "No area";
      if (!(a in areas)) {
        areas[a] = 0;
        order.push(a);
      }
      areas[a]++;
    });
    return {
      stops: stops,
      pts: pts,
      areas: areas,
      order: order,
      km:
        pts.length > 1
          ? DP.lineKm(
              pts.map(function (x) {
                return x.ll;
              }),
            )
          : null,
    };
  }
  function tabRoute(p) {
    var f = routeFacts(p),
      rt = DP.S.routes.filter(function (r) {
        return r.id === p.route;
      })[0],
      nc = null;
    if (p.routeIds && p.routeIds.length > 1) {
      var cs = {};
      p.routeIds.forEach(function (id) {
        var x = DP.S.routes.filter(function (r) {
          return r.id === id;
        })[0];
        if (x)
          x.codes.forEach(function (c) {
            cs[c] = 1;
          });
      });
      nc = Object.keys(cs).length;
    }
    return (
      '<div class="dp-kv"><div><small>Route</small><b>' +
      esc(p.routeName) +
      "</b></div><div><small>Customers on route (saved)</small><b>" +
      (nc != null ? nc : rt ? rt.codes.length : "-") +
      "</b></div><div><small>Stops in this plan</small><b>" +
      p.stops.length +
      "</b></div><div><small>Areas</small><b>" +
      f.order.length +
      "</b></div><div><small>Stops with a map pin</small><b>" +
      f.pts.length +
      " of " +
      p.stops.length +
      "</b></div>" +
      (f.km != null
        ? "<div><small>Straight-line distance</small><b>about " +
          f.km.toFixed(1) +
          " km</b></div>"
        : "") +
      "</div>" +
      (f.km != null
        ? '<p class="mu" style="font-size:12px;margin-bottom:12px">Straight-line distance between stops that have a map pin, in visiting order. It is not road distance and no travel time is estimated.</p>'
        : "") +
      '<b style="font-size:13px">Area sequence</b><div class="dp-areas" style="margin:8px 0 14px">' +
      (f.order.length
        ? f.order
            .map(function (a, i) {
              return (
                '<span class="badge">' +
                (i + 1) +
                ". " +
                esc(a) +
                " (" +
                f.areas[a] +
                ")</span>"
              );
            })
            .join("")
        : '<span class="mu">No areas saved for these customers.</span>') +
      "</div>" +
      '<div class="dp-note-box">Customers were loaded in the saved route order' +
      (p.createdAt ? " on " + esc(DP.when(p.createdAt)) : "") +
      ". Changes made in this plan (priority shops, new order) apply to this day only and never change the route.</div>"
    );
  }
  function tabBill(p) {
    var inv = p.stops.filter(function (s) {
        return !s.priority;
      }),
      pri = p.stops.length - inv.length,
      tot = inv.reduce(function (a, s) {
        return a + (+s.amount || 0);
      }, 0),
      b = p.bill || {};
    return (
      '<div class="dp-kv"><div><small>Source</small><b>' +
      esc(b.fileName || (b.source ? b.source : "Plan invoices")) +
      "</b></div><div><small>Invoices</small><b>" +
      inv.length +
      "</b></div><div><small>Invoice total</small><b>" +
      R(tot) +
      "</b></div></div>" +
      (inv.length
        ? '<div class="a-scroll"><table class="dp-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Amount</th></tr></thead><tbody>' +
          inv
            .map(function (s) {
              return (
                "<tr><td>" +
                esc(s.inv) +
                "</td><td>" +
                esc(s.name) +
                '<span class="sub">' +
                esc(s.code || "") +
                "</span></td><td>" +
                (s.items && s.items.length
                  ? s.items.length + " item" + (s.items.length > 1 ? "s" : "")
                  : esc(s.boxes || 0) + " boxes") +
                "</td><td>" +
                R(s.amount) +
                "</td></tr>" +
                (s.items && s.items.length
                  ? '<tr class="dp-prow"><td colspan="4"><details class="dp-items"><summary>View products</summary><div class="a-scroll"><table class="dp-table dp-ptable"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">MRP</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>' +
                    s.items
                      .map(function (i) {
                        return (
                          "<tr><td>" +
                          esc(i.name) +
                          '</td><td class="r">' +
                          esc(i.qty) +
                          '</td><td class="r">' +
                          (i.mrp > 0 ? R(i.mrp) : "-") +
                          '</td><td class="r">' +
                          R(i.rate) +
                          '</td><td class="r">' +
                          R(i.amt) +
                          "</td></tr>"
                        );
                      })
                      .join("") +
                    "</tbody></table></div></details></td></tr>"
                  : "")
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<div class="dp-empty"><b>No invoices</b></div>') +
      (pri
        ? '<p class="mu" style="font-size:12px;margin-top:10px">' +
          pri +
          " priority visit" +
          (pri > 1 ? "s" : "") +
          " without an invoice not listed.</p>"
        : "")
    );
  }
  function ackText(h) {
    return (h.notify || [])
      .map(function (wid) {
        var r = DP.recs[wid],
          w = DP.workerById(wid),
          nm = w ? w.name : wid;
        if (DP.online === false)
          return nm + ": status unknown (server not reachable)";
        return (
          nm +
          ": " +
          (r && (r.noticeIds || []).indexOf(h.id) > -1
            ? "received by the employee app"
            : "waiting for the employee app to sync")
        );
      })
      .join(" | ");
  }
  function tabNotes(p) {
    var ro = isPast() || p.status === "cancelled",
      hist = (p.history || []).slice().reverse().slice(0, 40);
    return (
      '<label class="dp-lbl" for="dpNotes">Plan notes <em>(for the office, not shown to the employee)</em></label><textarea class="dp-notes" id="dpNotes" maxlength="1000"' +
      (ro ? " readonly" : "") +
      ">" +
      esc(p.notes || "") +
      "</textarea>" +
      (ro
        ? ""
        : '<div class="dp-foot" style="margin-top:8px"><span class="dp-formmsg" id="dpNoteMsg" style="margin:0 auto 0 0"></span><button type="button" class="btn" id="dpSaveNotes">Save notes</button></div>') +
      '<b style="font-size:13px;display:block;margin-top:14px">Activity</b>' +
      (hist.length
        ? '<ul class="dp-hist">' +
          hist
            .map(function (h) {
              return (
                "<li>" +
                esc(h.text) +
                "<small>" +
                esc(h.by || "") +
                " &middot; " +
                esc(DP.when(h.ts)) +
                (h.notify ? "<br>" + esc(ackText(h)) : "") +
                "</small></li>"
              );
            })
            .join("") +
          "</ul>"
        : '<p class="mu" style="font-size:13px;margin-top:6px">No activity recorded for this plan.</p>')
    );
  }

  /* ---------- right: map panel ---------- */
  function drawMapPanel() {
    var p = selected(),
      sum = $("dpMsum");
    if (!st.ready || !p) {
      if (panelMap) {
        panelMap.render([], false);
      }
      $("dpMapOver").hidden = false;
      $("dpMapOver").innerHTML =
        "<div><b>" +
        (st.ready ? "No plan selected" : "Loading...") +
        "</b>" +
        (st.ready ? "Select a plan to see its route." : "") +
        "</div>";
      sum.innerHTML = "";
      return;
    }
    var f = routeFacts(p),
      g = DP.gmapsUrl(f.stops),
      sig =
        p.id +
        "|" +
        p.stops
          .map(function (s) {
            return s.inv;
          })
          .join(",");
    if (!panelMap)
      panelMap = DP.createMap($("dpMap"), $("dpMapOver"), {
        onPick: function () {},
      });
    panelMap.render(f.stops, sig !== mapSig);
    mapSig = sig;
    var top = f.order.slice(0, 6);
    sum.className = "dp-msum";
    sum.innerHTML =
      '<div class="row"><span>Customers</span><b>' +
      p.stops.length +
      '</b></div><div class="row"><span>On the map</span><b>' +
      f.pts.length +
      " of " +
      p.stops.length +
      "</b></div>" +
      (f.km != null
        ? '<div class="row"><span>Straight-line distance</span><b>about ' +
          f.km.toFixed(1) +
          " km</b></div>"
        : "") +
      (top.length
        ? '<div class="dp-areas" style="margin-top:6px">' +
          top
            .map(function (a) {
              return (
                '<span class="badge">' + esc(a) + " " + f.areas[a] + "</span>"
              );
            })
            .join("") +
          (f.order.length > 6
            ? '<span class="mu" style="font-size:12px">+' +
              (f.order.length - 6) +
              " more</span>"
            : "") +
          "</div>"
        : "") +
      (f.pts.length < p.stops.length && f.pts.length
        ? '<p class="mu" style="font-size:12px;margin-top:8px">' +
          (p.stops.length - f.pts.length) +
          " customer" +
          (p.stops.length - f.pts.length === 1 ? " has" : "s have") +
          " no map pin and are not drawn.</p>"
        : "") +
      '<div class="btns"><button type="button" class="btn btn-secondary a-btn" data-fs="' +
      esc(p.id) +
      '">' +
      DP.icon("expand") +
      " View route on map</button>" +
      (g.url
        ? '<a class="btn a-btn" target="_blank" rel="noopener" href="' +
          esc(g.url) +
          '">' +
          DP.icon("external-link") +
          " Open in Google Maps</a>"
        : "") +
      "</div>" +
      (g.url && g.cut
        ? '<p class="mu" style="font-size:12px;margin-top:6px">Google Maps takes about ten stops per link, so this opens the next ' +
          g.n +
          " pending stops.</p>"
        : "");
  }

  /* ---------- full screen map ---------- */
  function openFs(planId) {
    var p = DP.plansOn(DP.S, st.date).filter(function (x) {
      return x.id === planId;
    })[0];
    if (!p) return;
    fs.open = true;
    fs.planId = planId;
    fs.q = "";
    fs.area = "";
    fs.sel = 0;
    fs.prev = document.activeElement;
    var el = $("dpFs");
    el.classList.add("open");
    document.body.style.overflow = "hidden";
    el.innerHTML =
      '<div class="dp-fs-top"><button type="button" class="dp-ib bd" id="fsX" aria-label="Close map">' +
      DP.icon("chevron-left") +
      '</button><h3 id="fsT"></h3><a class="btn a-btn" id="fsG" target="_blank" rel="noopener" hidden>' +
      DP.icon("external-link") +
      " Open in Google Maps</a></div>" +
      '<div class="dp-fs-l"><div class="dp-fs-ctl"><div class="field a-f"><input id="fsQ" type="search" placeholder="Search customers" aria-label="Search customers on this route" autocomplete="off"></div><div class="dp-chips" id="fsAreas"></div></div><div id="fsList"></div></div>' +
      '<div class="dp-fs-c"><div class="dp-map" id="fsMap"></div><div class="dp-mapover" id="fsOver" hidden></div><div class="dp-mapctl"><button type="button" id="fsFit">Fit route</button></div></div>' +
      '<div class="dp-fs-r" id="fsR"></div>';
    $("fsX").onclick = closeFs;
    $("fsQ").oninput = function () {
      fs.q = this.value.trim().toLowerCase();
      fsList();
    };
    $("fsFit").onclick = function () {
      if (fs.map) fs.map.fit();
    };
    $("fsAreas").onclick = function (e) {
      var b = e.target.closest("[data-a]");
      if (!b) return;
      fs.area = fs.area === b.dataset.a ? "" : b.dataset.a;
      fsAreas();
      fsList();
    };
    $("fsList").onclick = function (e) {
      var b = e.target.closest("[data-n]");
      if (!b) return;
      var n = +b.dataset.n;
      fs.sel = n;
      fsList();
      var x = fsData().stops.filter(function (s) {
        return s.n === n;
      })[0];
      if (x && x.ll) fs.map.focus(n);
      else DP.toast(x.name + " has no map location yet.", "warn");
    };
    if (fs.map) {
      fs.map.destroy();
      fs.map = null;
    }
    fs.map = DP.createMap($("fsMap"), $("fsOver"), {
      onPick: function (n) {
        fs.sel = n;
        fsList();
        var b = $("fsList").querySelector('[data-n="' + n + '"]');
        if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest" });
      },
    });
    fsDraw(true);
    $("fsX").focus();
  }
  function fsData() {
    var p = DP.plansOn(DP.S, st.date).filter(function (x) {
      return x.id === fs.planId;
    })[0];
    return p
      ? { p: p, stops: DP.mapStops(DP.S, p, st.date), f: routeFacts(p) }
      : { p: null, stops: [], f: null };
  }
  function fsDraw(fit) {
    var d = fsData();
    if (!d.p) {
      closeFs();
      return;
    }
    var p = d.p,
      g = DP.gmapsUrl(d.stops),
      a = $("fsG");
    $("fsT").textContent = p.worker + "'s route - " + p.routeName;
    if (g.url) {
      a.href = g.url;
      a.hidden = false;
    } else a.hidden = true;
    fsAreas();
    fsList();
    fs.map.render(d.stops, fit);
    var f = d.f,
      w = DP.workerById(p.workerId);
    $("fsR").innerHTML =
      '<h3 style="font-size:15px;margin-bottom:10px">' +
      esc(p.routeName) +
      '</h3><div class="dp-msum" style="padding:0;border:0"><div class="row"><span>Employee</span><b>' +
      esc(p.worker) +
      "</b></div>" +
      (p.helpers && p.helpers.length
        ? '<div class="row"><span>Helpers</span><b>' +
          esc(DP.helperNames(p).join(", ")) +
          "</b></div>"
        : "") +
      '<div class="row"><span>Vehicle</span><b>' +
      GA.vehLink(p.vehicle, p.vehicleId) +
      '</b></div><div class="row"><span>Customers</span><b>' +
      p.stops.length +
      '</b></div><div class="row"><span>On the map</span><b>' +
      f.pts.length +
      " of " +
      p.stops.length +
      "</b></div>" +
      (f.km != null
        ? '<div class="row"><span>Straight-line distance</span><b>about ' +
          f.km.toFixed(1) +
          " km</b></div>"
        : "") +
      "</div>" +
      (f.km != null
        ? '<p class="mu" style="font-size:12px;margin:6px 0">Straight line between pinned stops, not road distance.</p>'
        : "") +
      '<b style="font-size:13px;display:block;margin:12px 0 6px">Areas</b><div class="dp-areas">' +
      (f.order.length
        ? f.order
            .map(function (x) {
              return (
                '<span class="badge">' + esc(x) + " " + f.areas[x] + "</span>"
              );
            })
            .join("")
        : '<span class="mu">None saved</span>') +
      "</div>" +
      '<b style="font-size:13px;display:block;margin:12px 0 6px">Order</b><ol style="margin-left:18px;font-size:12px;color:var(--muted)">' +
      p.stops
        .slice(0, 12)
        .map(function (s) {
          return "<li>" + esc(s.name) + "</li>";
        })
        .join("") +
      (p.stops.length > 12
        ? '<li style="list-style:none">... ' +
          (p.stops.length - 12) +
          " more</li>"
        : "") +
      "</ol>" +
      (g.url && g.cut
        ? '<p class="mu" style="font-size:12px;margin-top:8px">The Google Maps link covers the next ' +
          g.n +
          " pending stops.</p>"
        : "") +
      (f.pts.length < p.stops.length
        ? '<p class="mu" style="font-size:12px;margin-top:8px">' +
          (p.stops.length - f.pts.length) +
          " customer(s) have no saved map location, so the route skips them.</p>"
        : "");
  }
  function fsAreas() {
    var d = fsData();
    if (!d.f) return;
    $("fsAreas").innerHTML =
      d.f.order.length > 1
        ? d.f.order
            .map(function (a) {
              return (
                '<button type="button" class="dp-chip' +
                (fs.area === a ? " on" : "") +
                '" data-a="' +
                esc(a) +
                '" aria-pressed="' +
                (fs.area === a) +
                '">' +
                esc(a) +
                " " +
                d.f.areas[a] +
                "</button>"
              );
            })
            .join("")
        : "";
  }
  function fsList() {
    var d = fsData(),
      L = d.stops.filter(function (s) {
        return (
          (!fs.area || (s.area || "No area") === fs.area) &&
          (!fs.q ||
            (s.name + " " + s.code + " " + s.area).toLowerCase().indexOf(fs.q) >
              -1)
        );
      });
    $("fsList").innerHTML = L.length
      ? L.map(function (s) {
          return (
            '<button type="button" class="dp-stop' +
            (fs.sel === s.n ? " on" : "") +
            '" data-n="' +
            s.n +
            '"><span class="n">' +
            s.n +
            '</span><span style="flex:1;min-width:0"><b>' +
            esc(s.name) +
            "</b>" +
            (s.pri ? '<span class="dp-pri">Priority</span>' : "") +
            "<small>" +
            esc(s.area || "No area") +
            (s.time ? " &middot; " + esc(s.time) : "") +
            (s.ll ? "" : " &middot; no map pin") +
            "</small></span></button>"
          );
        }).join("")
      : '<div class="dp-empty"><b>No matching plans or customers.</b></div>';
  }
  function closeFs() {
    if (!fs.open) return;
    fs.open = false;
    $("dpFs").classList.remove("open");
    document.body.style.overflow = "";
    if (fs.map) {
      fs.map.destroy();
      fs.map = null;
    }
    $("dpFs").innerHTML = "";
    if (fs.prev && document.contains(fs.prev))
      try {
        fs.prev.focus();
      } catch (e) {}
    if (panelMap) panelMap.invalidate();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && fs.open && !DP.dialogOpen() && !DP.menuOpen()) {
      closeFs();
      return;
    }
    if (e.key === "Tab" && fs.open && !DP.dialogOpen()) {
      var f = [].filter.call(
        $("dpFs").querySelectorAll("a[href],button:not([disabled]),input"),
        function (x) {
          return x.offsetParent !== null;
        },
      );
      if (!f.length) return;
      if (!$("dpFs").contains(document.activeElement)) {
        e.preventDefault();
        f[0].focus();
      } else if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });

  /* ---------- render ---------- */
  function render(force) {
    try {
      DP.fresh();
    } catch (e) {
      st.err = "The saved plan data could not be read.";
      st.ready = true;
    }
    var p = selected();
    if (!p && st.selId) st.selId = "";
    if (!st.selId && st.ready && !st.err) {
      var V = visible();
      if (V.length) {
        st.selId = V[0].id;
        st.page = 0;
        st.tab = "customers";
      }
    }
    if ($("dpDate").value !== st.date) {
      $("dpDate").value = st.date;
      $("dpDate").dispatchEvent(new Event("input", { bubbles: true }));
    }
    $("dpAdd").disabled = isPast();
    $("dpAdd").title = isPast() ? "Plans cannot be added to a past date" : "";
    var seg = $("dpSeg").querySelectorAll("button");
    [].forEach.call(seg, function (b) {
      b.classList.toggle("on", b.dataset.m === st.mob);
      b.setAttribute("aria-selected", b.dataset.m === st.mob);
    });
    $("dpGrid").dataset.m = st.mob;
    var none = st.ready && !st.err && !plans().length,
      wasNone = !$("dpNone").hidden;
    $("dpNone").hidden = !none;
    $("dpGrid").hidden = none;
    $("dpSeg").style.display = none ? "none" : "";
    if (none)
      $("dpNone").innerHTML =
        '<div class="dp-empty"><b>No plans for ' +
        (st.date === GA.today() ? "today" : "this date") +
        "</b>" +
        (isPast()
          ? "Plans cannot be added to a past date."
          : 'Add a plan to assign a route to an employee and vehicle.<br><button type="button" class="btn a-btn" data-add>' +
            GA.icon("plus") +
            " Add plan</button>") +
        "</div>";
    drawBanner();
    drawStats();
    drawList();
    drawDetail();
    drawMapPanel();
    drawSync();
    if (fs.open) fsDraw(false);
    if (st.mob === "map" && panelMap) panelMap.invalidate();
    if (wasNone && !none && panelMap)
      setTimeout(function () {
        panelMap.invalidate();
      }, 50);
  }

  /* ---------- events ---------- */
  var root = $("dpGrid");
  document.addEventListener("click", function (e) {
    var t = e.target;
    var sel = t.closest("[data-sel]");
    if (sel) {
      st.selId = sel.dataset.sel;
      st.page = 0;
      st.tab = "customers";
      st.mob = "detail";
      render();
      return;
    }
    var kb = t.closest("[data-kebab]");
    if (kb) {
      var p = plans().filter(function (x) {
        return x.id === kb.dataset.kebab;
      })[0];
      if (p) planMenu(kb, p);
      return;
    }
    var rm = t.closest("[data-rowmenu]");
    if (rm) {
      var pl = selected(),
        inv = rm.dataset.rowmenu,
        n = +rm.dataset.others;
      DP.menu(rm, [
        {
          label: "Move to another plan",
          icon: "swap",
          disabled: !n,
          hint: n ? "" : "There is no other active plan on this date",
          run: function () {
            DP.dlg.moveStop(pl.id, inv);
          },
        },
        {
          label: "Remove from plan",
          icon: "trash",
          danger: true,
          run: function () {
            DP.dlg.removeStop(pl.id, inv);
          },
        },
      ]);
      return;
    }
    var tab = t.closest("[data-tab]");
    if (tab) {
      st.tab = tab.dataset.tab;
      render();
      return;
    }
    var pgb = t.closest("[data-pg]");
    if (pgb) {
      st.page += +pgb.dataset.pg;
      render();
      return;
    }
    if (t.closest("[data-add]")) {
      DP.dlg.addPlan();
      return;
    }
    if (t.closest("[data-clear]")) {
      st.q = "";
      $("dpQ").value = "";
      render();
      return;
    }
    var fb = t.closest("[data-fs]");
    if (fb) {
      openFs(fb.dataset.fs);
      return;
    }
    if (t.closest("#dpShowCan")) {
      st.showCancelled = !st.showCancelled;
      render();
      return;
    }
    if (t.closest("#dpSaveNotes")) {
      saveNotes();
      return;
    }
  });
  $("dpAdd").onclick = function () {
    DP.dlg.addPlan();
  };
  /* Download the bills of this date's plans (same columns as the Optech sales register, plus employee, route and status). */
  $("dpDl").onclick = function () {
    var L = plans(),
      rows = [
        [
          "Bill No",
          "Date",
          "Party Name",
          "GSTIN",
          "Item Name",
          "MRP Rate",
          "Qty",
          "Rate",
          "Rate+Tax",
          "GST %",
          "Tot Amt",
          "Employee",
          "Route",
          "Vehicle",
          "Delivery status",
        ],
      ],
      dd = st.date.split("-").reverse().join("/"),
      r2 = function (n) {
        return Math.round((Number(n) || 0) * 100) / 100;
      },
      n = 0,
      tot = 0;
    L.forEach(function (p) {
      p.stops.forEach(function (s) {
        var c = DP.cust(DP.S, s.code) || {},
          party = s.name || c.name || s.code || "",
          stt = DP.stopState(p, s, st.date),
          st2 = stt ? stt.charAt(0).toUpperCase() + stt.slice(1) : "",
          tail = [p.worker || "", p.routeName || "", p.vehicle || "", st2],
          first = true;
        n++;
        tot += Number(s.amount) || 0;
        function head() {
          var h = first
            ? [String(s.inv || ""), dd, party, c.gstin || ""]
            : ["", "", "", ""];
          first = false;
          return h;
        }
        if (s.items && s.items.length)
          s.items.forEach(function (i) {
            var q = Number(i.qty) || 0,
              a = Number(i.amt) > 0 ? Number(i.amt) : q * (Number(i.rate) || 0),
              g = Number(i.gst) || 0,
              incl = q ? a / q : Number(i.rate) || 0,
              ex =
                Number(i.ex) > 0 && q ? Number(i.ex) / q : incl / (1 + g / 100);
            rows.push(
              head().concat(
                [i.name || "", r2(i.mrp), q, r2(ex), r2(incl), g, r2(a)],
                tail,
              ),
            );
          });
        else
          rows.push(
            head().concat(
              [
                "(item list not available)",
                "",
                Number(s.boxes) || "",
                "",
                "",
                "",
                r2(s.amount),
              ],
              tail,
            ),
          );
      });
    });
    if (!n) {
      DP.toast("There are no bills in this day's plans.", "warn");
      return;
    }
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Total",
      r2(tot),
      "",
      "",
      "",
      "",
    ]);
    var blob = XLSXLite.build([
      {
        name: "Plan bills",
        rows: rows,
        widths: [10, 12, 34, 18, 40, 10, 8, 10, 10, 8, 12, 18, 22, 14, 14],
        filter: true,
      },
    ]);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "plan-bills-" + st.date + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  $("dpExpand").onclick = function () {
    var p = selected();
    if (p) openFs(p.id);
    else DP.toast("Select a plan first.", "warn");
  };
  $("dpSeg").onclick = function (e) {
    var b = e.target.closest("button[data-m]");
    if (!b) return;
    st.mob = b.dataset.m;
    render();
  };
  var qt = null;
  $("dpQ").oninput = function () {
    var v = this.value.trim();
    clearTimeout(qt);
    qt = setTimeout(function () {
      st.q = v;
      st.page = 0;
      drawList();
      drawDetail();
    }, 120);
  };
  function setDate(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    st.date = d;
    st.selId = "";
    st.page = 0;
    noteHtml = "";
    drawNote();
    render();
    loadAndRender();
  }
  $("dpDate").onchange = function () {
    setDate(this.value || GA.today());
  };
  $("dpPrev").onclick = function () {
    setDate(DP.addDays(st.date, -1));
  };
  $("dpNext").onclick = function () {
    setDate(DP.addDays(st.date, 1));
  };
  if ($("dpDemo"))
    $("dpDemo").onclick = function () {
      DP.dialog({
        title: "Replace current data with demo data?",
        html: '<div class="dp-banner err">All customers, routes and plans will be replaced by sample data, on this computer and on the server. This cannot be undone.</div><div class="dp-foot"><button type="button" class="btn btn-secondary" data-no>Cancel</button><button type="button" class="btn btn-danger" data-ok>Replace with demo data</button></div>',
        onOpen: function (api) {
          api.q("[data-no]").onclick = function () {
            api.close();
          };
          api.q("[data-ok]").onclick = function () {
            api.close();
            O.demo();
            DP.prefill = O.demoInvoices;
            st.selId = "";
            render(true);
            DP.dlg.addPlan();
          };
        },
      });
    };
  function saveNotes() {
    var p = selected();
    if (!p) return;
    var v = $("dpNotes").value,
      id = p.id,
      exp = p.builtAt,
      b = $("dpSaveNotes");
    b.disabled = true;
    DP.commit(function (S) {
      var q = DP.plansOn(S, st.date).filter(function (x) {
        return x.id === id;
      })[0];
      if (!q) return { ok: false, error: "Plan not found." };
      q.notes = v.trim();
      return { ok: true };
    }).then(function (res) {
      b.disabled = false;
      var m = $("dpNoteMsg");
      if (m) {
        m.style.color = res.ok ? "var(--success)" : "var(--danger)";
        m.textContent = res.ok
          ? res.server === "saved" || res.server === "local"
            ? "Notes saved."
            : "Saved on this computer. Waiting for the server."
          : res.error;
      }
    });
  }

  /* ---------- loading and refreshing ---------- */
  function idle() {
    return (
      !DP.dialogOpen() &&
      !DP.menuOpen() &&
      !(document.activeElement && document.activeElement.id === "dpNotes")
    );
  }
  // Redraw only when the data really changed, so an open product list, scroll position or tab is not reset every few seconds.
  var lastSig = "";
  function sig() {
    try {
      return JSON.stringify([plans(), DP.recs, st.ready, st.err]);
    } catch (e) {
      return String(Date.now());
    }
  }
  function loadAndRender() {
    return DP.loadRecs().then(function () {
      if (idle()) {
        var g = sig();
        if (g !== lastSig) {
          lastSig = g;
          render();
        }
      } else drawBanner();
    });
  }
  function boot() {
    st.ready = false;
    render();
    try {
      DP.fresh();
    } catch (e) {
      st.err =
        "The saved plan data could not be read. " + ((e && e.message) || "");
      st.ready = true;
      render();
      return;
    }
    DP.loadRecs().then(function () {
      st.ready = true;
      st.err = "";
      render();
    });
  }
  window.addEventListener("dp-sync-state", drawSync);
  window.addEventListener("gm-sync", function () {
    if (idle()) {
      try {
        DP.fresh();
      } catch (e) {}
      var g = sig();
      if (g !== lastSig) {
        lastSig = g;
        render();
      }
    }
  });
  setInterval(function () {
    if (!document.hidden) loadAndRender();
  }, 6000);
  boot();
})();
