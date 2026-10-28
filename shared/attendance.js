/* General Traders - Attendance dashboard (admin). Reads every employee's own record from the server (read only)
   and keeps admin corrections in a separate key (gm_admin_attedit_v1), so an employee's real punch data is never overwritten. */
(function () {
  "use strict";
  var GA = window.GA,
    esc = GA.esc,
    pg = GA.mount("attendance.html", "Attendance");
  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    MN = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
  var LATE = (window.GM && GM.LATE_AFTER) || "08:30",
    EK = "gm_admin_attedit_v1",
    PER = 8;
  var DB = {
    workers: [],
    rec: {},
    plans: {},
    routes: [],
    customers: [],
    vehicles: [],
    edits: { edits: {}, log: [] },
  };
  var S = {
    date: GA.today(),
    pgn: 1,
    f: { q: "", st: "", route: "", veh: "" },
    mon: GA.today().slice(0, 7),
    tab: "overview",
    rt: {
      from: GA.today().slice(0, 8) + "01",
      to: GA.today(),
      type: "daily",
      worker: "",
      route: "",
    },
  };
  var $ = function (i) {
    return document.getElementById(i);
  };
  function jl(k, d) {
    try {
      var r = JSON.parse(localStorage.getItem(k));
      return r == null ? d : r;
    } catch (e) {
      return d;
    }
  }
  function p2(n) {
    return String(n).padStart(2, "0");
  }
  function mins(s) {
    var m = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(s || ""));
    if (!m) return null;
    var h = +m[1];
    if (m[3]) {
      h = h % 12;
      if (/p/i.test(m[3])) h += 12;
    }
    return h * 60 + +m[2];
  }
  function hm(n) {
    return n == null ? "-" : Math.floor(n / 60) + "h " + p2(n % 60) + "m";
  }
  function t12(s) {
    var n = mins(s);
    if (n == null) return "-";
    var h = Math.floor(n / 60);
    return p2(h % 12 || 12) + ":" + p2(n % 60) + " " + (h >= 12 ? "PM" : "AM");
  }
  function t24(s) {
    var n = mins(s);
    return n == null ? "" : p2(Math.floor(n / 60)) + ":" + p2(n % 60);
  }
  function dlabel(ds) {
    var d = new Date(ds + "T00:00:00");
    return (
      WD[d.getDay()] +
      ", " +
      d.getDate() +
      " " +
      MN[d.getMonth()] +
      " " +
      d.getFullYear()
    );
  }
  function dshort(ds) {
    return +ds.slice(8) + " " + MN[+ds.slice(5, 7) - 1] + " " + ds.slice(0, 4);
  }
  function addDays(ds, n) {
    var d = new Date(ds + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }
  function toast(t) {
    var e = document.createElement("div");
    e.className = "a-toast";
    e.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:99;padding:12px 16px";
    e.textContent = t;
    document.body.appendChild(e);
    setTimeout(function () {
      e.remove();
    }, 2600);
  }
  var COL = [
    "#0F766E",
    "#2563EB",
    "#7C3AED",
    "#DB2777",
    "#D97706",
    "#0891B2",
    "#65A30D",
    "#DC2626",
  ];
  function av(w) {
    var h = 0;
    String(w.id)
      .split("")
      .forEach(function (c) {
        h += c.charCodeAt(0);
      });
    return (
      '<span class="at-av" style="background:' +
      COL[h % COL.length] +
      '">' +
      esc((w.name || "?").charAt(0).toUpperCase()) +
      "</span>"
    );
  }

  // ---------- data ----------
  function build(items) {
    DB.workers = GA.workers().filter(function (w) {
      return w.active !== false;
    });
    var adm = jl("gm_admin_v1", {});
    DB.plans = adm.plans || {};
    DB.routes = adm.routes || [];
    DB.customers = adm.customers || [];
    DB.vehicles = jl("gm_admin_vehicles_v1", []).filter(function (v) {
      return v.active !== false;
    });
    var ed = jl(EK, null);
    DB.edits = ed && ed.edits ? ed : { edits: {}, log: [] };
    DB.rec = {};
    DB.workers.forEach(function (w) {
      var it = items && items["gm_crm_data_v5__" + w.id],
        r = null;
      try {
        if (it && it.v) r = JSON.parse(it.v);
      } catch (e) {}
      if (!r) {
        var cur = jl("gm_crm_data_v5", null);
        if (cur && cur.worker && cur.worker.id === w.id) r = cur;
      }
      DB.rec[w.id] = r || {};
    });
  }
  function load() {
    return fetch("/api/state?since=0", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(
        function (r) {
          return r.items;
        },
        function () {
          return null;
        },
      )
      .then(build);
  }
  function routeOf(wid, ds) {
    var l = (DB.plans[ds] || []).filter(function (p) {
      return p.workerId === wid && p.status !== "cancelled";
    });
    return l.length
      ? l
          .map(function (p) {
            return p.routeName;
          })
          .join(", ")
      : "";
  }
  function planOf(wid, ds) {
    return (DB.plans[ds] || []).filter(function (p) {
      return p.workerId === wid && p.status !== "cancelled";
    });
  }
  function onLeave(wid, ds) {
    return GA.leavesOf(wid).some(function (l) {
      return l.from <= ds && ds <= l.to;
    });
  }
  function hrsOf(txt, a, b) {
    var m = /(\d+)h\s*(\d+)m/.exec(txt || "");
    if (m) return +m[1] * 60 + +m[2];
    var x = mins(a),
      y = mins(b);
    return x != null && y != null && y >= x ? y - x : null;
  }
  // One day of one worker: the employee's own punch record, with any admin correction applied on top.
  function dayRec(w, ds) {
    var td = GA.today(),
      lg = (DB.rec[w.id] || {}).attendanceLog || {},
      b = (lg[ds.slice(0, 7)] || {})[+ds.slice(8)],
      e = (DB.edits.edits[w.id] || {})[ds];
    var o = {
      st: null,
      inT: "-",
      outT: "-",
      hrs: null,
      km: 0,
      vehicle: "",
      remarks: "",
      edited: false,
      startKm: null,
      endKm: null,
    };
    if (b) {
      o.startKm = b.startKm == null ? null : b.startKm;
      o.endKm = b.endKm == null ? null : b.endKm;
      o.st = b.status;
      o.inT = b.inTime || "-";
      o.outT = b.outTime || "-";
      o.hrs = hrsOf(b.hours, o.inT, o.outT);
      o.km = Number(b.km) || 0;
      o.vehicle = b.vehicle || "";
    }
    if (e) {
      o.edited = true;
      o.st = e.status;
      o.inT = e.inTime || "-";
      o.outT = e.outTime || "-";
      o.hrs = hrsOf("", o.inT, o.outT);
      o.km = Number(e.km) || 0;
      o.vehicle = e.vehicle || o.vehicle;
      o.remarks = e.remarks || "";
    }
    if (!o.st) {
      var dow = new Date(ds + "T00:00:00").getDay(),
        start = w.created || "";
      if (ds > td || (start && ds < start)) o.st = "none";
      else if (dow === 0) o.st = "off";
      else if (onLeave(w.id, ds)) o.st = "leave";
      else if (ds === td && new Date().getHours() < 12) o.st = "pending";
      else o.st = "absent";
    }
    o.route = (e && e.route) || routeOf(w.id, ds);
    if (!o.vehicle) {
      var pl = planOf(w.id, ds)[0];
      if (pl) o.vehicle = pl.vehicle || "";
    }
    return o;
  }
  var BADGE = {
    present: ["b-pr", "Present"],
    late: ["b-la", "Late"],
    absent: ["b-ab", "Absent"],
    leave: ["b-lv", "On leave"],
    off: ["b-of", "Day off"],
    pending: ["b-pe", "Not in yet"],
    none: ["b-of", "-"],
  };
  function badge(o) {
    var b = BADGE[o.st] || BADGE.none;
    return (
      '<span class="at-b ' +
      b[0] +
      '">' +
      b[1] +
      "</span>" +
      (o.edited
        ? '<span class="at-ed" title="Corrected by admin">edited</span>'
        : "")
    );
  }
  function attended(o) {
    return o.st === "present" || o.st === "late";
  }
  function dlcsv(name, rows) {
    var t =
      "\ufeff" +
      rows
        .map(function (r) {
          return r
            .map(function (c) {
              c = String(c == null ? "" : c);
              return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
            })
            .join(",");
        })
        .join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([t], { type: "text/csv;charset=utf-8" }),
    );
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- 1. overview ----------
  function dateBar() {
    return GA.dateNav("dPrev", "dIn", "dNext", S.date, GA.today());
  }
  function bindDate(fn) {
    $("dIn").onchange = function () {
      if (this.value) {
        S.date = this.value > GA.today() ? GA.today() : this.value;
        S.pgn = 1;
        fn();
      }
    };
    $("dPrev").onclick = function () {
      S.date = addDays(S.date, -1);
      S.pgn = 1;
      fn();
    };
    $("dNext").onclick = function () {
      if (S.date < GA.today()) {
        S.date = addDays(S.date, 1);
        S.pgn = 1;
        fn();
      }
    };
  }
  function donut(p, a, l, v, total) {
    var segs = [
        [p, "#16A34A"],
        [a, "#DC2626"],
        [l, "#F59E0B"],
        [v, "#2563EB"],
      ],
      R = 52,
      C = 2 * Math.PI * R,
      off = 0,
      out = "";
    if (total)
      segs.forEach(function (s) {
        if (!s[0]) return;
        var len = (C * s[0]) / total;
        out +=
          '<circle r="' +
          R +
          '" cx="70" cy="70" fill="none" stroke="' +
          s[1] +
          '" stroke-width="16" stroke-dasharray="' +
          len +
          " " +
          (C - len) +
          '" stroke-dashoffset="' +
          -off +
          '" transform="rotate(-90 70 70)"/>';
        off += len;
      });
    return (
      '<svg width="140" height="140" viewBox="0 0 140 140"><circle r="' +
      R +
      '" cx="70" cy="70" fill="none" stroke="var(--border)" stroke-width="16"/>' +
      out +
      '<text x="70" y="68" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">' +
      (p + l) +
      "/" +
      total +
      '</text><text x="70" y="86" text-anchor="middle" font-size="11" fill="var(--muted)">Present</text></svg>'
    );
  }
  function overview() {
    var all = DB.workers.map(function (w) {
        return { w: w, d: dayRec(w, S.date) };
      }),
      total = all.length;
    var cp = all.filter(function (x) {
        return x.d.st === "present";
      }).length,
      cl = all.filter(function (x) {
        return x.d.st === "late";
      }).length;
    var ca = all.filter(function (x) {
        return x.d.st === "absent";
      }).length,
      cv = all.filter(function (x) {
        return x.d.st === "leave";
      }).length;
    var km = all.reduce(function (a, x) {
        return a + x.d.km;
      }, 0),
      pct = total ? Math.round(((cp + cl) * 1000) / total) / 10 : 0;
    var f = S.f,
      q = f.q.toLowerCase();
    var vehs = {},
      routes = {};
    all.forEach(function (x) {
      if (x.d.vehicle) vehs[x.d.vehicle] = 1;
      if (x.d.route) routes[x.d.route] = 1;
    });
    var rows = all.filter(function (x) {
      if (q && (x.w.name + " " + x.w.id).toLowerCase().indexOf(q) < 0)
        return false;
      if (
        f.st &&
        x.d.st !== f.st &&
        !(f.st === "present" && x.d.st === "late" && false)
      )
        return false;
      if (f.route && x.d.route !== f.route) return false;
      if (f.veh && x.d.vehicle !== f.veh) return false;
      return true;
    });
    var pages = Math.max(1, Math.ceil(rows.length / PER));
    if (S.pgn > pages) S.pgn = pages;
    var vis = rows.slice((S.pgn - 1) * PER, S.pgn * PER);
    function opts(o, cur, all_) {
      return (
        '<option value="">' +
        all_ +
        "</option>" +
        Object.keys(o)
          .sort()
          .map(function (k) {
            return (
              "<option" +
              (k === cur ? " selected" : "") +
              ' value="' +
              esc(k) +
              '">' +
              esc(k) +
              "</option>"
            );
          })
          .join("")
      );
    }
    var stOpts = [
      ["", "All status"],
      ["present", "Present"],
      ["late", "Late"],
      ["absent", "Absent"],
      ["leave", "On leave"],
      ["off", "Day off"],
      ["pending", "Not in yet"],
    ];
    var body =
      vis
        .map(function (x, i) {
          var d = x.d,
            w = x.w;
          return (
            '<tr class="cl" data-w="' +
            esc(w.id) +
            '"><td>' +
            ((S.pgn - 1) * PER + i + 1) +
            "</td><td>" +
            av(w) +
            "<b>" +
            esc(w.name) +
            "</b></td><td>" +
            esc(GA.empCode(w.id)) +
            "</td><td>" +
            badge(d) +
            "</td><td>" +
            t12(d.inT) +
            "</td><td>" +
            t12(d.outT) +
            "</td><td>" +
            hm(d.hrs) +
            "</td><td>" +
            (d.km ? d.km + " km" : "-") +
            "</td><td>" +
            esc(d.route || "-") +
            '</td><td><span class="at-menu"><button class="at-ib" data-m="' +
            esc(w.id) +
            '" title="Actions">&#8943;</button></span></td></tr>'
          );
        })
        .join("") ||
      '<tr><td colspan="10"><div class="at-empty"><b>No employees match</b>Change the filters or add employees on the Employees page.</div></td></tr>';
    var pb = "";
    for (var i = 1; i <= pages; i++)
      pb +=
        '<button class="' +
        (i === S.pgn ? "on" : "") +
        '" data-pg="' +
        i +
        '">' +
        i +
        "</button>";
    var plans = (DB.plans[S.date] || []).filter(function (p) {
      return p.status !== "cancelled";
    });
    var rts =
      plans
        .map(function (p) {
          var w = DB.workers.filter(function (x) {
              return x.id === p.workerId;
            })[0],
            d = w ? dayRec(w, S.date) : { st: "none" };
          return (
            '<div class="at-rt"><div><b>' +
            esc(p.routeName) +
            "</b><small>" +
            esc(p.worker || "") +
            " &middot; " +
            (p.stops || []).length +
            " stops</small></div>" +
            badge(d) +
            "</div>"
          );
        })
        .join("") ||
      '<div class="at-empty">No routes planned for this day.</div>';
    var ev = [];
    all.forEach(function (x) {
      if (mins(x.d.inT) != null)
        ev.push({
          t: mins(x.d.inT),
          c: "#16A34A",
          a: x.w.name + " checked in",
          b: t12(x.d.inT),
        });
      if (mins(x.d.outT) != null)
        ev.push({
          t: mins(x.d.outT),
          c: "#2563EB",
          a: x.w.name + " checked out",
          b: t12(x.d.outT) + (x.d.km ? " &middot; " + x.d.km + " km" : ""),
        });
    });
    ev.sort(function (a, b) {
      return b.t - a.t;
    });
    var evh =
      ev
        .slice(0, 6)
        .map(function (e) {
          return (
            '<div class="at-ev"><span class="at-dot" style="background:' +
            e.c +
            '"></span><div>' +
            esc(e.a) +
            "<small>" +
            e.b +
            "</small></div></div>"
          );
        })
        .join("") || '<div class="at-empty">No check-ins yet.</div>';
    pg.innerHTML =
      '<div class="at-head"><div><p class="at-sub" style="margin:0">Track employee attendance, working hours and kilometres.</p></div><span class="sp"></span>' +
      dateBar() +
      '<div class="field a-f" data-act style="width:190px;height:38px"><input type="search" id="fQ" placeholder="Search employee..." aria-label="Search employee name or code" autocomplete="off" value="' +
      esc(f.q) +
      '"></div>' +
      '<button class="btn btn-secondary a-btn at-noprint" id="bRep" data-act>Reports</button><button class="btn btn-secondary a-btn at-noprint" id="bMark" data-act>Mark attendance</button><button class="btn a-btn at-noprint" id="bExp" data-act>Export report</button></div>' +
      '<div class="at-tiles"><div class="at-tile t-g"><b>' +
      (cp + cl) +
      " / " +
      total +
      "</b><span>Present</span><i>" +
      pct +
      '%</i></div><div class="at-tile t-r"><b>' +
      ca +
      " / " +
      total +
      "</b><span>Absent</span><i>" +
      (total ? Math.round((ca * 1000) / total) / 10 : 0) +
      '%</i></div><div class="at-tile t-y"><b>' +
      cl +
      "</b><span>Late (after " +
      t12(LATE) +
      ")</span><i>" +
      (total ? Math.round((cl * 1000) / total) / 10 : 0) +
      '%</i></div><div class="at-tile t-b"><b>' +
      Math.round(km * 10) / 10 +
      " km</b><span>Total distance</span></div></div>" +
      '<div class="at" style="margin-top:16px"><div class="at-card"><div class="at-filters"><div class="field"><select id="fS">' +
      stOpts
        .map(function (o) {
          return (
            '<option value="' +
            o[0] +
            '"' +
            (o[0] === f.st ? " selected" : "") +
            ">" +
            o[1] +
            "</option>"
          );
        })
        .join("") +
      '</select></div><div class="field"><select id="fR">' +
      opts(routes, f.route, "All routes") +
      '</select></div><div class="field"><select id="fV">' +
      opts(vehs, f.veh, "All vehicles") +
      "</select></div></div>" +
      '<div class="at-scroll"><table class="at-tbl"><thead><tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Status</th><th>Check in</th><th>Check out</th><th>Working hours</th><th>Kilometres</th><th>Route</th><th></th></tr></thead><tbody>' +
      body +
      "</tbody></table></div>" +
      '<div class="at-pg"><span>Showing ' +
      (rows.length ? (S.pgn - 1) * PER + 1 : 0) +
      "-" +
      Math.min(rows.length, S.pgn * PER) +
      " of " +
      rows.length +
      " employees</span><div>" +
      pb +
      "</div></div></div>" +
      '<div class="at-col"><div class="at-card"><h3>Attendance overview</h3><div class="at-donut">' +
      donut(cp, ca, cl, cv, total) +
      '<div class="at-leg"><span><i style="background:#16A34A"></i>Present ' +
      cp +
      '</span><span><i style="background:#DC2626"></i>Absent ' +
      ca +
      '</span><span><i style="background:#F59E0B"></i>Late ' +
      cl +
      "</span>" +
      (cv
        ? '<span><i style="background:#2563EB"></i>On leave ' + cv + "</span>"
        : "") +
      "</div></div></div>" +
      '<div class="at-card"><h3>Routes on ' +
      esc(dshort(S.date)) +
      "</h3>" +
      rts +
      '</div><div class="at-card"><h3>Quick activity</h3>' +
      evh +
      "</div></div></div>";
    bindDate(overview);
    $("fQ").oninput = function () {
      S.f.q = this.value;
      S.pgn = 1;
      var pos = this.selectionStart;
      overview();
      var e = $("fQ");
      e.focus();
      e.setSelectionRange(pos, pos);
    };
    $("fS").onchange = function () {
      S.f.st = this.value;
      S.pgn = 1;
      overview();
    };
    $("fR").onchange = function () {
      S.f.route = this.value;
      S.pgn = 1;
      overview();
    };
    $("fV").onchange = function () {
      S.f.veh = this.value;
      S.pgn = 1;
      overview();
    };
    $("bRep").onclick = function () {
      location.hash = "#report";
    };
    $("bMark").onclick = function () {
      openEdit("", S.date);
    };
    $("bExp").onclick = function () {
      dlcsv(
        "attendance-" + S.date + ".csv",
        [
          [
            "Date",
            "Employee",
            "Employee ID",
            "Status",
            "Check in",
            "Check out",
            "Working hours",
            "Km",
            "Route",
            "Vehicle",
          ],
        ].concat(
          rows.map(function (x) {
            var b = BADGE[x.d.st] || BADGE.none;
            return [
              S.date,
              x.w.name,
              GA.empCode(x.w.id),
              b[1],
              t12(x.d.inT),
              t12(x.d.outT),
              hm(x.d.hrs),
              x.d.km,
              x.d.route,
              x.d.vehicle,
            ];
          }),
        ),
      );
    };
    [].forEach.call(pg.querySelectorAll("[data-pg]"), function (b) {
      b.onclick = function () {
        S.pgn = +b.getAttribute("data-pg");
        overview();
      };
    });
    [].forEach.call(pg.querySelectorAll("tr.cl"), function (tr) {
      tr.onclick = function (e) {
        if (e.target.closest(".at-menu")) return;
        location.hash = "#worker/" + tr.getAttribute("data-w");
      };
    });
    [].forEach.call(pg.querySelectorAll("[data-m]"), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        menu(b, b.getAttribute("data-m"));
      };
    });
  }
  function menu(btn, wid) {
    var old = document.querySelector(".at-pop");
    if (old) old.remove();
    var m = document.createElement("div");
    m.className = "at-pop";
    m.innerHTML =
      '<button data-a="v">View details</button><button data-a="e">Edit attendance</button><button data-a="l">Location history</button>';
    btn.parentNode.appendChild(m);
    m.onclick = function (e) {
      var a = e.target.getAttribute("data-a");
      m.remove();
      if (a === "v") location.hash = "#worker/" + wid;
      if (a === "e") openEdit(wid, S.date);
      if (a === "l") location.hash = "#location/" + wid;
    };
  }
  document.addEventListener("click", function () {
    var o = document.querySelector(".at-pop");
    if (o) o.remove();
  });

  // ---------- 2. employee details ----------
  function monthDays(mk) {
    var y = +mk.slice(0, 4),
      m = +mk.slice(5),
      last = new Date(y, m, 0).getDate(),
      td = GA.today(),
      out = [];
    for (var d = 1; d <= last; d++) {
      var ds = mk + "-" + p2(d);
      if (ds <= td) out.push(ds);
    }
    return out;
  }
  function monthStats(w, mk) {
    var days = monthDays(mk).map(function (ds) {
        return { ds: ds, d: dayRec(w, ds) };
      }),
      c = { pr: 0, ab: 0, la: 0, lv: 0, km: 0, hs: [], days: days };
    days.forEach(function (x) {
      var s = x.d.st;
      if (s === "present") c.pr++;
      if (s === "late") {
        c.la++;
        c.pr++;
      }
      if (s === "absent") c.ab++;
      if (s === "leave") c.lv++;
      c.km += x.d.km;
      if (x.d.hrs != null) c.hs.push(x.d.hrs);
    });
    c.avg = c.hs.length
      ? Math.round(
          c.hs.reduce(function (a, b) {
            return a + b;
          }, 0) / c.hs.length,
        )
      : null;
    return c;
  }
  function tile(cls, v, l) {
    return (
      '<div class="at-tile ' +
      cls +
      '"><b>' +
      v +
      "</b><span>" +
      l +
      "</span></div>"
    );
  }
  function worker(wid) {
    var w = DB.workers.filter(function (x) {
      return x.id === wid;
    })[0];
    if (!w) {
      pg.innerHTML =
        '<div class="at-card"><div class="at-empty"><b>Employee not found</b></div></div>';
      return;
    }
    var c = monthStats(w, S.mon),
      t = dayRec(w, GA.today()),
      td = GA.today();
    var mons = [];
    var st = (w.created || td).slice(0, 7);
    for (
      var d = new Date(td.slice(0, 7) + "-01T00:00:00");
      ;
      d.setMonth(d.getMonth() - 1)
    ) {
      var k = d.getFullYear() + "-" + p2(d.getMonth() + 1);
      mons.push(k);
      if (k <= st || mons.length > 24) break;
    }
    if (mons.indexOf(S.mon) < 0) mons.push(S.mon);
    var tabs = [
      ["overview", "Overview"],
      ["history", "Attendance history"],
      ["routes", "Routes"],
    ];
    var max = Math.max.apply(
      null,
      c.days
        .map(function (x) {
          return x.d.hrs || 0;
        })
        .concat([1]),
    );
    var bars = c.days
      .map(function (x) {
        var s = x.d.st,
          col =
            s === "present"
              ? "#16A34A"
              : s === "late"
                ? "#F59E0B"
                : s === "absent"
                  ? "#DC2626"
                  : "var(--border)";
        return (
          '<div title="' +
          dshort(x.ds) +
          ": " +
          (BADGE[s] || BADGE.none)[1] +
          (x.d.hrs ? ", " + hm(x.d.hrs) : "") +
          '" style="height:' +
          Math.max(
            4,
            ((x.d.hrs || (s === "absent" ? max * 0.25 : 0)) * 100) / max,
          ) +
          "%;background:" +
          col +
          '"></div>'
        );
      })
      .join("");
    var rc = {};
    c.days.forEach(function (x) {
      if (x.d.route)
        x.d.route.split(", ").forEach(function (r) {
          rc[r] = (rc[r] || 0) + 1;
        });
    });
    var rlist =
      Object.keys(rc)
        .sort(function (a, b) {
          return rc[b] - rc[a];
        })
        .map(function (r) {
          return (
            '<div class="at-rt"><b>' +
            esc(r) +
            "</b><small>" +
            rc[r] +
            " day" +
            (rc[r] > 1 ? "s" : "") +
            "</small></div>"
          );
        })
        .join("") ||
      '<div class="at-empty">No routes planned this month.</div>';
    function trs(list) {
      return (
        list
          .map(function (x) {
            var d = x.d;
            if (d.st === "none") return "";
            return (
              "<tr><td>" +
              dshort(x.ds) +
              ' <span style="color:var(--muted)">' +
              WD[new Date(x.ds + "T00:00:00").getDay()] +
              "</span></td><td>" +
              t12(d.inT) +
              "</td><td>" +
              t12(d.outT) +
              "</td><td>" +
              hm(d.hrs) +
              "</td><td>" +
              (d.km || "-") +
              '</td><td class="at-rtc">' +
              esc(d.route || "-") +
              "</td><td>" +
              badge(d) +
              '</td><td><button class="at-ib" data-e="' +
              x.ds +
              '" title="Edit">&#9998;</button></td></tr>'
            );
          })
          .join("") ||
        '<tr><td colspan="8"><div class="at-empty"><b>No records</b></div></td></tr>'
      );
    }
    var head =
      "<tr><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Km</th><th>Route</th><th>Status</th><th></th></tr>";
    var rev = c.days.slice().reverse(),
      main;
    if (S.tab === "overview")
      main =
        '<div class="at-2"><div class="at-card"><h3>Recent attendance</h3><div class="at-scroll"><table class="at-tbl"><thead>' +
        head +
        "</thead><tbody>" +
        trs(rev.slice(0, 10)) +
        '</tbody></table></div></div><div class="at-col"><div class="at-card"><h3>This month</h3><div class="at-bars">' +
        bars +
        '</div><div class="at-leg" style="display:flex;gap:12px;margin-top:8px"><span><i style="background:#16A34A"></i>Present ' +
        (c.pr - c.la) +
        '</span><span><i style="background:#DC2626"></i>Absent ' +
        c.ab +
        '</span><span><i style="background:#F59E0B"></i>Late ' +
        c.la +
        '</span></div></div><div class="at-card"><h3>Assigned routes</h3>' +
        rlist +
        "</div></div></div>";
    else if (S.tab === "history")
      main =
        '<div class="at-card"><h3>Daily record <span class="at-filters" style="margin:0"><span class="field" style="margin:0"><select id="wMon">' +
        mons
          .map(function (k) {
            return (
              '<option value="' +
              k +
              '"' +
              (k === S.mon ? " selected" : "") +
              ">" +
              MN[+k.slice(5) - 1] +
              " " +
              k.slice(0, 4) +
              "</option>"
            );
          })
          .join("") +
        '</select></span></span></h3><div class="at-scroll"><table class="at-tbl"><thead>' +
        head +
        "</thead><tbody>" +
        trs(rev) +
        "</tbody></table></div></div>";
    else
      main =
        '<div class="at-card"><h3>Routes in ' +
        MN[+S.mon.slice(5) - 1] +
        " " +
        S.mon.slice(0, 4) +
        "</h3>" +
        rlist +
        "</div>";
    pg.innerHTML =
      '<div class="at-head at-noprint"><button class="btn btn-secondary a-btn" id="wLoc" data-act>Location history</button><button class="btn" id="wMark" data-act>Mark / edit attendance</button></div>' +
      '<div class="at-who at-hero">' +
      av(w) +
      '<div class="at-id"><div class="at-idrow"><h2>' +
      esc(w.name) +
      "</h2>" +
      badge(t) +
      '</div><div class="at-meta"><span class="at-chip">' +
      esc(GA.empCode(w.id)) +
      "</span>" +
      (w.phone ? "<span>+91 " + esc(w.phone) + "</span>" : "") +
      "</div></div></div>" +
      '<div class="at-tiles" style="margin-bottom:14px">' +
      tile("t-g", c.pr, "Days present") +
      tile("t-r", c.ab, "Days absent") +
      tile("t-y", c.la, "Days late") +
      tile(
        "t-b",
        hm(c.avg) + " / " + Math.round(c.km * 10) / 10 + " km",
        "Avg working hours / total distance",
      ) +
      "</div>" +
      '<div class="at-tabs">' +
      tabs
        .map(function (t) {
          return (
            '<button data-t="' +
            t[0] +
            '" class="' +
            (S.tab === t[0] ? "on" : "") +
            '">' +
            t[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      main;
    [].forEach.call(pg.querySelectorAll("[data-t]"), function (b) {
      b.onclick = function () {
        S.tab = b.getAttribute("data-t");
        worker(wid);
      };
    });
    [].forEach.call(pg.querySelectorAll("[data-e]"), function (b) {
      b.onclick = function () {
        openEdit(wid, b.getAttribute("data-e"));
      };
    });
    if ($("wMon"))
      $("wMon").onchange = function () {
        S.mon = this.value;
        worker(wid);
      };
    $("wLoc").onclick = function () {
      location.hash = "#location/" + wid;
    };
    $("wMark").onclick = function () {
      openEdit(wid, td);
    };
  }

  // ---------- 3. mark / edit attendance (admin correction) ----------
  var M = null;
  function openEdit(wid, ds) {
    if (!DB.workers.length) {
      toast("Add an employee first on the Employees page.");
      return;
    }
    M = { wid: wid || DB.workers[0].id, ds: ds || GA.today(), st: null };
    var ov = document.createElement("div");
    ov.className = "at-modal";
    ov.id = "atM";
    document.body.appendChild(ov);
    ov.onclick = function (e) {
      if (e.target === ov) closeEdit();
    };
    fillEdit();
  }
  function closeEdit() {
    var o = $("atM");
    if (o) o.remove();
    M = null;
  }
  function fillEdit() {
    var w = DB.workers.filter(function (x) {
        return x.id === M.wid;
      })[0],
      d = dayRec(w, M.ds),
      e = (DB.edits.edits[w.id] || {})[M.ds];
    var pre = M.st
      ? M
      : {
          st:
            e || ["present", "late", "leave"].indexOf(d.st) >= 0
              ? d.st
              : "present",
        }; // an empty or absent day opens as Present so the admin can fill it in
    var inV = M.keep ? M.inV : t24(d.inT),
      outV = M.keep ? M.outV : t24(d.outT),
      km = M.keep ? M.km : d.km || "",
      rt = M.keep ? M.rt : d.route,
      vh = M.keep ? M.vh : d.vehicle,
      rm = M.keep ? M.rm : d.remarks,
      ek = M.keep ? M.ek : d.endKm || "",
      sk2 = M.keep ? M.sk2 : d.startKm || "";
    M.sk = d.startKm;
    M.st = pre.st;
    M.keep = false;
    var wopts = DB.workers
      .map(function (x) {
        return (
          '<option value="' +
          esc(x.id) +
          '"' +
          (x.id === M.wid ? " selected" : "") +
          ">" +
          esc(x.name) +
          " (" +
          esc(x.id) +
          ")</option>"
        );
      })
      .join("");
    var ropts =
      '<option value="">None</option>' +
      DB.routes
        .map(function (r) {
          return (
            "<option" +
            (r.name === rt ? " selected" : "") +
            ' value="' +
            esc(r.name) +
            '">' +
            esc(r.name) +
            "</option>"
          );
        })
        .join("");
    var vopts =
      '<option value="">None</option>' +
      DB.vehicles
        .map(function (v) {
          var l = v.number + (v.type ? " (" + v.type + ")" : "");
          return (
            "<option" +
            (v.number === vh || l === vh ? " selected" : "") +
            ' value="' +
            esc(l) +
            '">' +
            esc(l) +
            "</option>"
          );
        })
        .join("");
    var side = DB.workers
      .map(function (x) {
        var o = dayRec(x, M.ds);
        return (
          '<div class="at-rt"><div><b>' +
          esc(x.name) +
          "</b><small>" +
          (attended(o) ? t12(o.inT) + " - " + t12(o.outT) : "&nbsp;") +
          "</small></div>" +
          badge(o) +
          "</div>"
        );
      })
      .join("");
    var times = M.st === "present" || M.st === "late";
    $("atM").innerHTML =
      '<div class="at-box"><div style="display:flex;justify-content:space-between"><div><h2>Mark attendance</h2><p class="at-sub">Update attendance for an employee. Corrections are kept separately and logged.</p></div><button class="at-ib" id="mX">&times;</button></div><div class="at" style="grid-template-columns:minmax(0,1fr) 300px">' +
      '<div class="at-card"><div class="row"><div><label class="at-lbl">Employee</label><div class="field"><select id="mW">' +
      wopts +
      '</select></div></div><div><label class="at-lbl">Date</label><div class="field"><input type="date" id="mD" value="' +
      M.ds +
      '" max="' +
      GA.today() +
      '"></div></div></div>' +
      '<label class="at-lbl">Attendance status</label><div class="at-seg">' +
      [
        ["present", "Present"],
        ["late", "Late"],
        ["absent", "Absent"],
        ["leave", "On leave"],
      ]
        .map(function (s) {
          return (
            '<button type="button" data-s="' +
            s[0] +
            '" class="' +
            (M.st === s[0] ? "on" : "") +
            '">' +
            s[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="row"' +
      (times ? "" : ' style="opacity:.45"') +
      '><div><label class="at-lbl">Check in time</label><div class="field"><input type="time" id="mIn" value="' +
      inV +
      '"' +
      (times ? "" : " disabled") +
      '></div></div><div><label class="at-lbl">Check out time</label><div class="field"><input type="time" id="mOut" value="' +
      outV +
      '"' +
      (times ? "" : " disabled") +
      "></div></div></div>" +
      '<div class="row"><div><label class="at-lbl">Route (optional)</label><div class="field"><select id="mRt">' +
      ropts +
      '</select></div></div><div><label class="at-lbl">Vehicle (optional)</label><div class="field"><select id="mVh">' +
      vopts +
      "</select></div></div></div>" +
      '<label class="at-lbl">Kilometres (optional)</label><div class="field"><input type="number" min="0" step="0.1" id="mKm" value="' +
      esc(km) +
      '"></div>' +
      '<label class="at-lbl">Start km, odometer (optional)</label><div class="field"><input type="number" min="0" step="1" id="mSk" placeholder="Opening odometer reading" value="' +
      esc(sk2) +
      '"' +
      (times ? "" : " disabled") +
      '></div>' +
      '<label class="at-lbl">End km, odometer (optional)</label><div class="field"><input type="number" min="0" step="1" id="mEk" placeholder="Closing odometer reading" value="' +
      esc(ek) +
      '"' +
      (times ? "" : " disabled") +
      '></div><p class="at-sub" style="margin:4px 0 10px">' +
      (d.startKm != null ? "Start km was " + esc(d.startKm) + ". " : "") +
      "Change the start km if it was entered wrongly; the day's distance is recalculated. Add an end km when the employee forgot to punch out: it closes the day in their record, so Vehicles shows it as returned and the odometer moves up. An end km needs a check-out time.</p>" +
      '<label class="at-lbl">Remarks (optional)</label><div class="field"><textarea id="mRm" rows="2" placeholder="Add any remarks...">' +
      esc(rm) +
      '</textarea></div><div class="at-err" id="mErr"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
      (e
        ? '<button class="btn btn-outline" id="mReset" style="margin-right:auto">Remove my correction</button>'
        : "") +
      '<button class="btn btn-outline" id="mCan">Cancel</button><button class="btn" id="mSave">Save attendance</button></div></div>' +
      '<div class="at-card"><h3>Attendance on ' +
      esc(dshort(M.ds)) +
      "</h3>" +
      side +
      '<p class="at-sub" style="margin-top:10px">Edit attendance only with proper authorization. Changes are logged.</p></div></div></div>';
    function keep() {
      M.keep = true;
      M.inV = $("mIn").value;
      M.outV = $("mOut").value;
      M.km = $("mKm").value;
      M.rt = $("mRt").value;
      M.vh = $("mVh").value;
      M.rm = $("mRm").value;
      M.ek = $("mEk") ? $("mEk").value : "";
      M.sk2 = $("mSk") ? $("mSk").value : "";
    }
    $("mX").onclick = $("mCan").onclick = closeEdit;
    $("mW").onchange = function () {
      M.wid = this.value;
      fillEdit();
    };
    $("mD").onchange = function () {
      if (this.value) {
        M.ds = this.value > GA.today() ? GA.today() : this.value;
        M.st = null;
        fillEdit();
      }
    };
    [].forEach.call(document.querySelectorAll("[data-s]"), function (b) {
      b.onclick = function () {
        keep();
        M.st = b.getAttribute("data-s");
        fillEdit();
      };
    });
    $("mSave").onclick = function () {
      keep();
      saveEdit(w);
    };
    if ($("mReset"))
      $("mReset").onclick = function () {
        delete DB.edits.edits[w.id][M.ds];
        logEdit(w, "Removed correction for " + M.ds);
        persist();
        closeEdit();
        toast("Correction removed");
        route();
      };
  }
  function logEdit(w, text) {
    var s = GA.session() || {};
    DB.edits.log.push({
      ts: Date.now(),
      by: s.name || "Admin",
      wid: w.id,
      text: text,
    });
    DB.edits.log = DB.edits.log.slice(-300);
  }
  function persist() {
    try {
      localStorage.setItem(EK, JSON.stringify(DB.edits));
    } catch (e) {}
  }
  function saveEdit(w) {
    var st = M.st,
      inV = M.inV,
      outV = M.outV,
      km = M.km === "" ? 0 : Number(M.km),
      err = "";
    if (M.ds > GA.today()) err = "You cannot mark a future date.";
    else if ((st === "present" || st === "late") && !inV)
      err = "Enter the check-in time.";
    else if (outV && inV && mins(outV) < mins(inV))
      err = "Check-out must be after check-in.";
    else if (!(km >= 0)) err = "Kilometres must be zero or more.";
    if (err) {
      $("mErr").textContent = err;
      return;
    }
    var times = st === "present" || st === "late";
    var ek = M.ek === "" || M.ek == null ? 0 : Number(M.ek),
      sk = M.sk2 === "" || M.sk2 == null ? 0 : Number(M.sk2),
      skChanged = sk > 0 && sk !== Number(M.sk);
    if (times && (ek < 0 || sk < 0 || ek !== ek || sk !== sk)) {
      $("mErr").textContent = "Start km and end km must be zero or more.";
      return;
    }
    if (times && ek > 0 && sk > 0 && ek < sk) {
      $("mErr").textContent = "End km cannot be less than the start km.";
      return;
    }
    if (times && (ek > 0 || skChanged)) {
      if (ek > 0 && !outV) {
        $("mErr").textContent = "Enter the check-out time to close the day with an end km.";
        return;
      }
      $("mSave").disabled = true;
      $("mErr").textContent = "";
      fetch("/api/close-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: w.id,
          date: M.ds,
          endKm: ek > 0 ? ek : undefined,
          startKm: sk > 0 ? sk : undefined,
          outTime: outV ? t12(outV) : undefined,
          inTime: t12(inV),
          km: km,
          vehicle: M.vh,
        }),
      })
        .then(function (r) {
          return r.json().then(
            function (j) {
              return { ok: r.ok, j: j || {} };
            },
            function () {
              return { ok: false, j: {} };
            },
          );
        })
        .then(
          function (x) {
            if (!x.ok) {
              $("mSave").disabled = false;
              $("mErr").textContent =
                x.j.error || "Could not close the day. Try again.";
              return;
            }
            // keep this page's copy of the employee's record in step with the server
            var rr = (DB.rec[w.id] = DB.rec[w.id] || {});
            rr.attendanceLog = rr.attendanceLog || {};
            rr.attendanceLog[M.ds.slice(0, 7)] =
              rr.attendanceLog[M.ds.slice(0, 7)] || {};
            rr.attendanceLog[M.ds.slice(0, 7)][+M.ds.slice(8)] = x.j.entry;
            finishEdit(w, st, inV, outV, x.j.entry && x.j.entry.km != null ? Number(x.j.entry.km) : km, times, ek, skChanged ? sk : 0);
          },
          function () {
            $("mSave").disabled = false;
            $("mErr").textContent = "No connection. Try again.";
          },
        );
      return;
    }
    finishEdit(w, st, inV, outV, km, times, 0);
  }
  function finishEdit(w, st, inV, outV, km, times, ek, sk) {
    if (st === "present" && mins(inV) > mins(LATE)) st = "late"; // checked in after the late time
    DB.edits.edits[w.id] = DB.edits.edits[w.id] || {};
    DB.edits.edits[w.id][M.ds] = {
      status: st,
      inTime: times ? t12(inV) : "-",
      outTime: times && outV ? t12(outV) : "-",
      km: times ? km : 0,
      route: M.rt,
      vehicle: M.vh,
      remarks: M.rm.trim(),
    };
    logEdit(
      w,
      "Set " +
        w.name +
        " " +
        M.ds +
        " to " +
        (BADGE[st] || BADGE.none)[1] +
        (times ? " (" + t12(inV) + (outV ? " - " + t12(outV) : "") + ")" : "") +
        (sk > 0 ? ", start km " + sk : "") +
        (ek > 0 ? ", end km " + ek : ""),
    );
    persist();
    closeEdit();
    toast("Attendance saved for " + w.name);
    route();
  }

  // ---------- 4. location history (planned route + punch times; the app does not record GPS) ----------
  var leafletLoading = null;
  function leaflet() {
    if (window.L && L.map) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    return (leafletLoading = new Promise(function (ok, no) {
      var c = document.createElement("link");
      c.rel = "stylesheet";
      c.href = "../shared/vendor/leaflet/leaflet.css";
      document.head.appendChild(c);
      var s = document.createElement("script");
      s.src = "../shared/vendor/leaflet/leaflet.js";
      s.onload = ok;
      s.onerror = function () {
        leafletLoading = null;
        no();
      };
      document.head.appendChild(s);
    }));
  }
  var lmap = null;
  function location_(wid) {
    var w =
      DB.workers.filter(function (x) {
        return x.id === wid;
      })[0] || DB.workers[0];
    if (!w) {
      pg.innerHTML =
        '<div class="at-card"><div class="at-empty"><b>No employees yet</b></div></div>';
      return;
    }
    var ds = S.date,
      d = dayRec(w, ds),
      plans = planOf(w.id, ds),
      stops = [];
    plans.forEach(function (p) {
      (p.stops || []).forEach(function (s) {
        var c =
          DB.customers.filter(function (x) {
            return x.code === s.code;
          })[0] || {};
        stops.push({
          name: s.name,
          code: s.code,
          addr: s.address || c.address || "",
          ll:
            typeof c.lat === "number" && typeof c.lng === "number"
              ? [c.lat, c.lng]
              : null,
        });
      });
    });
    var wopts = DB.workers
      .map(function (x) {
        return (
          '<option value="' +
          esc(x.id) +
          '"' +
          (x.id === w.id ? " selected" : "") +
          ">" +
          esc(x.name) +
          " (" +
          esc(x.id) +
          ")</option>"
        );
      })
      .join("");
    var rows = [
      [
        "Check in",
        t12(d.inT) + (d.vehicle ? " &middot; " + esc(d.vehicle) : ""),
        attended(d) ? "Punched in" : (BADGE[d.st] || BADGE.none)[1],
      ],
    ]
      .concat(
        stops.map(function (s, i) {
          return [
            "Stop " + (i + 1),
            esc(s.name) +
              (s.addr
                ? '<br><small style="color:var(--muted)">' +
                  esc(s.addr) +
                  "</small>"
                : ""),
            s.ll ? "Planned" : "No map pin",
          ];
        }),
      )
      .concat([
        ["Check out", t12(d.outT), mins(d.outT) != null ? "Punched out" : "-"],
      ]);
    pg.innerHTML =
      '<div class="at-head at-noprint"><span class="sp"></span><div class="field" data-act style="margin:0;min-width:210px"><select id="lW">' +
      wopts +
      "</select></div>" +
      dateBar() +
      "</div>" +
      '<div class="at-note">The app does not record live GPS. This map shows the <b>planned route</b> for the day (real roads between shops that have a map pin) and the employee\'s punch times and km.</div>' +
      '<div class="at-tiles" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">' +
      tile("t-b", (d.km || 0) + " km", "Total distance") +
      tile("t-g", hm(d.hrs), "Working hours") +
      tile("t-y", stops.length, "Planned stops") +
      "</div>" +
      '<div class="at-card" style="margin-bottom:14px">' +
      (stops.some(function (s) {
        return s.ll;
      })
        ? '<div id="lMap" class="at-map"></div>'
        : '<div class="at-empty"><b>No route to show</b>No route is planned for this employee on this day, or its shops have no map pin.</div>') +
      "</div>" +
      '<div class="at-card"><h3>Timeline</h3><div class="at-scroll"><table class="at-tbl"><thead><tr><th>#</th><th>Event</th><th>Details</th><th>Status</th></tr></thead><tbody>' +
      rows
        .map(function (r, i) {
          return (
            "<tr><td>" +
            (i + 1) +
            "</td><td>" +
            r[0] +
            '</td><td style="white-space:normal">' +
            r[1] +
            "</td><td>" +
            r[2] +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div></div>";
    $("lW").onchange = function () {
      location.hash = "#location/" + this.value;
    };
    bindDate(function () {
      location_(w.id);
    });
    var pts = stops.filter(function (s) {
      return s.ll;
    });
    if (pts.length && $("lMap"))
      leaflet().then(
        function () {
          if (lmap) {
            lmap.remove();
            lmap = null;
          }
          if (!$("lMap")) return;
          lmap = L.map("lMap");
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
          }).addTo(lmap);
          var g = L.layerGroup().addTo(lmap),
            ll = pts.map(function (s) {
              return s.ll;
            }),
            line = [];
          if (ll.length > 1)
            line.push(
              L.polyline(ll, {
                color: "#0F766E",
                weight: 3,
                dashArray: "4 8",
              }).addTo(g),
            );
          pts.forEach(function (s, i) {
            L.marker(s.ll, {
              icon: L.divIcon({
                className: "",
                html:
                  '<span style="display:flex;width:26px;height:26px;border-radius:50%;background:#0F766E;color:#fff;font-weight:700;font-size:12px;align-items:center;justify-content:center;border:2px solid #fff">' +
                  (i + 1) +
                  "</span>",
                iconSize: [26, 26],
                iconAnchor: [13, 13],
              }),
            })
              .bindPopup(esc(s.name))
              .addTo(g);
          });
          lmap.fitBounds(L.latLngBounds(ll), {
            padding: [30, 30],
            maxZoom: 15,
          });
          if (window.RoadLine && ll.length > 1)
            RoadLine.draw(
              g,
              ll,
              { color: "#0F766E", weight: 4 },
              line,
              function () {
                return !lmap;
              },
            );
        },
        function () {
          if ($("lMap"))
            $("lMap").innerHTML =
              '<div class="at-empty">The map could not be loaded.</div>';
        },
      );
  }

  // ---------- 5. reports ----------
  function report() {
    var r = S.rt,
      from = r.from,
      to = r.to > GA.today() ? GA.today() : r.to;
    var ws = DB.workers.filter(function (w) {
        return !r.worker || w.id === r.worker;
      }),
      recs = [],
      span = 0;
    for (var ds = from; ds <= to && span < 93; ds = addDays(ds, 1), span++)
      ws.forEach(function (w) {
        var d = dayRec(w, ds);
        if (d.st === "none" || d.st === "off" || d.st === "pending") return;
        if (r.route && d.route !== r.route) return;
        recs.push({ ds: ds, w: w, d: d });
      });
    var cp = recs.filter(function (x) {
        return x.d.st === "present";
      }).length,
      cl = recs.filter(function (x) {
        return x.d.st === "late";
      }).length,
      ca = recs.filter(function (x) {
        return x.d.st === "absent";
      }).length;
    var hs = recs
        .filter(function (x) {
          return x.d.hrs != null;
        })
        .map(function (x) {
          return x.d.hrs;
        }),
      avg = hs.length
        ? Math.round(
            hs.reduce(function (a, b) {
              return a + b;
            }, 0) / hs.length,
          )
        : null;
    var head, lines, csvRows;
    if (r.type === "daily") {
      head = [
        "Date",
        "Employee",
        "Status",
        "Check in",
        "Check out",
        "Hours",
        "Km",
        "Route",
      ];
      lines = recs
        .slice()
        .sort(function (a, b) {
          return a.ds < b.ds
            ? 1
            : a.ds > b.ds
              ? -1
              : a.w.name < b.w.name
                ? -1
                : 1;
        })
        .map(function (x) {
          return [
            dshort(x.ds),
            x.w.name + " (" + x.w.id + ")",
            (BADGE[x.d.st] || BADGE.none)[1],
            t12(x.d.inT),
            t12(x.d.outT),
            hm(x.d.hrs),
            x.d.km || "-",
            x.d.route || "-",
          ];
        });
    } else {
      var g = {};
      recs.forEach(function (x) {
        var k = x.w.id + (r.type === "monthly" ? "|" + x.ds.slice(0, 7) : "");
        var o = (g[k] = g[k] || {
          w: x.w,
          m: x.ds.slice(0, 7),
          pr: 0,
          la: 0,
          ab: 0,
          lv: 0,
          km: 0,
          h: 0,
          hn: 0,
        });
        if (x.d.st === "present") o.pr++;
        if (x.d.st === "late") o.la++;
        if (x.d.st === "absent") o.ab++;
        if (x.d.st === "leave") o.lv++;
        o.km += x.d.km;
        if (x.d.hrs != null) {
          o.h += x.d.hrs;
          o.hn++;
        }
      });
      head = [
        r.type === "monthly" ? "Month" : "Period",
        "Employee",
        "Present",
        "Late",
        "Absent",
        "Leave",
        "Total hours",
        "Avg hours/day",
        "Km",
      ];
      lines = Object.keys(g)
        .sort()
        .map(function (k) {
          var o = g[k];
          return [
            r.type === "monthly"
              ? MN[+o.m.slice(5) - 1] + " " + o.m.slice(0, 4)
              : dshort(from) + " - " + dshort(to),
            o.w.name + " (" + GA.empCode(o.w.id) + ")",
            o.pr,
            o.la,
            o.ab,
            o.lv,
            hm(o.h),
            o.hn ? hm(Math.round(o.h / o.hn)) : "-",
            Math.round(o.km * 10) / 10,
          ];
        });
    }
    var ropts =
      '<option value="">All routes</option>' +
      DB.routes
        .map(function (x) {
          return (
            "<option" +
            (x.name === r.route ? " selected" : "") +
            ' value="' +
            esc(x.name) +
            '">' +
            esc(x.name) +
            "</option>"
          );
        })
        .join("");
    var wopts =
      '<option value="">All employees</option>' +
      DB.workers
        .map(function (x) {
          return (
            "<option" +
            (x.id === r.worker ? " selected" : "") +
            ' value="' +
            esc(x.id) +
            '">' +
            esc(x.name) +
            " (" +
            esc(GA.empCode(x.id)) +
            ")</option>"
          );
        })
        .join("");
    pg.innerHTML =
      '<p class="at-sub at-noprint">View and export employee attendance history. Sundays are left out; today appears only after noon if not punched in.</p>' +
      '<div class="at-card at-noprint" style="margin-bottom:14px"><div class="at-filters"><div class="field"><input type="date" id="rF" value="' +
      from +
      '" max="' +
      GA.today() +
      '"></div><div class="field"><input type="date" id="rT" value="' +
      to +
      '" max="' +
      GA.today() +
      '"></div><div class="field"><select id="rW">' +
      wopts +
      '</select></div><div class="field"><select id="rR">' +
      ropts +
      '</select></div></div><div class="at-tabs" style="margin:0">' +
      [
        ["daily", "Daily report"],
        ["monthly", "Monthly report"],
        ["worker", "Employee wise"],
      ]
        .map(function (t) {
          return (
            '<button data-ty="' +
            t[0] +
            '" class="' +
            (r.type === t[0] ? "on" : "") +
            '">' +
            t[1] +
            "</button>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="at-tiles" style="margin-bottom:14px">' +
      tile("t-g", cp + cl, "Present") +
      tile("t-r", ca, "Absent") +
      tile("t-y", cl, "Late") +
      tile("t-b", hm(avg), "Avg working hours") +
      "</div>" +
      '<div class="at-card"><div class="at-scroll"><table class="at-tbl"><thead><tr>' +
      head
        .map(function (h) {
          return "<th>" + h + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>" +
      (lines
        .slice(0, 400)
        .map(function (l) {
          return (
            "<tr>" +
            l
              .map(function (c) {
                return "<td>" + esc(c) + "</td>";
              })
              .join("") +
            "</tr>"
          );
        })
        .join("") ||
        '<tr><td colspan="' +
          head.length +
          '"><div class="at-empty"><b>No records in this range</b></div></td></tr>') +
      "</tbody></table></div>" +
      '<div class="at-pg"><span>' +
      lines.length +
      " record" +
      (lines.length === 1 ? "" : "s") +
      (lines.length > 400 ? " (first 400 shown, export has all)" : "") +
      (to > addDays(from, 92) ? " &middot; range limited to 93 days" : "") +
      '</span><div class="at-noprint"><button style="padding:0 12px" id="rPdf">Export PDF</button><button style="padding:0 12px" id="rCsv">Export Excel (CSV)</button></div></div></div>';
    $("rF").onchange = function () {
      if (this.value) {
        S.rt.from = this.value;
        if (S.rt.to < this.value) S.rt.to = this.value;
        report();
      }
    };
    $("rT").onchange = function () {
      if (this.value) {
        S.rt.to = this.value;
        if (S.rt.from > this.value) S.rt.from = this.value;
        report();
      }
    };
    $("rW").onchange = function () {
      S.rt.worker = this.value;
      report();
    };
    $("rR").onchange = function () {
      S.rt.route = this.value;
      report();
    };
    [].forEach.call(pg.querySelectorAll("[data-ty]"), function (b) {
      b.onclick = function () {
        S.rt.type = b.getAttribute("data-ty");
        report();
      };
    });
    $("rCsv").onclick = function () {
      dlcsv(
        "attendance-" + r.type + "-" + from + "-to-" + to + ".csv",
        [head].concat(lines),
      );
    };
    $("rPdf").onclick = function () {
      window.print();
    };
  }

  // ---------- router ----------
  function topbar(title, back) {
    var h = document.querySelector(".a-top h1"),
      b = document.getElementById("aBack");
    if (!h) return;
    h.textContent = title;
    document.title = "General Traders - " + title;
    if (!back) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement("a");
      b.className = "a-bk";
      b.id = "aBack";
      h.parentNode.insertBefore(b, h);
    }
    b.href = back[0];
    b.title = "Back to " + back[1];
    b.innerHTML = GA.icon("chevron-left") + "<span>" + back[1] + "</span>";
  }
  function route() {
    if (lmap) {
      lmap.remove();
      lmap = null;
    }
    var h = location.hash.replace(/^#\/?/, ""),
      a = h.split("/");
    // Top bar: title + a Back button beside it (same look as the Vehicle details page).
    if (a[0] === "worker" && a[1])
      topbar("Employee attendance", ["#", "Attendance"]);
    else if (a[0] === "location")
      topbar(
        "Location history",
        a[1] ? ["#worker/" + a[1], "Employee"] : ["#", "Attendance"],
      );
    else if (a[0] === "report")
      topbar("Attendance reports", ["#", "Attendance"]);
    else topbar("Attendance", null);
    if (a[0] === "worker" && a[1]) {
      if (S.cur !== a[1]) S.tab = "overview";
      S.cur = a[1];
      worker(decodeURIComponent(a[1]));
    } else if (a[0] === "location") location_(decodeURIComponent(a[1] || ""));
    else if (a[0] === "report") report();
    else overview();
  }
  window.addEventListener("hashchange", function () {
    closeEdit();
    route();
    window.scrollTo(0, 0);
  });
  setInterval(function () {
    if ($("atM") || document.hidden) return;
    load().then(function () {
      if (!$("atM") && !document.activeElement.matches("input,select,textarea"))
        route();
    });
  }, 30000);
  pg.innerHTML = '<div class="at-empty">Loading attendance...</div>';
  load().then(route);
})();