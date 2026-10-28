/* General Traders - Workers (admin): list, add/edit, details, documents, route assignment.
   Core fields (name, mobile, password, active, leave) still go through GA, exactly as before.
   Everything extra lives in gm_admin_wprofile_v1 (synced like the rest); photo and documents are files on the server (/api/vfile). */
(function () {
  "use strict";
  var GA = window.GA,
    esc = GA.esc,
    pg = GA.mount("workers.html", "Employees"),
    PK = "gm_admin_wprofile_v1",
    WK = "gm_admin_workers_v1",
    PER = 8;
  var MN = [
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
  var DOCS = [
    ["aadhaar", "Aadhaar Card"],
    ["license", "Driving License"],
    ["addrproof", "Address Proof"],
    ["idother", "Other document"],
  ];
  var ROLES = [
    ["D", "Delivery / Driver"],
    ["H", "Helper"],
    ["S", "Sales"],
    ["I", "Inventory"],
    ["B", "Billing"],
    ["L", "Loading"],
    ["A", "Admin"],
  ];
  function rlet(role) {
    var r = String(role || "Delivery");
    if (/^deliv|driver/i.test(r)) return "D";
    for (var i = 0; i < ROLES.length; i++)
      if (
        ROLES[i][1] === r ||
        ROLES[i][1].toLowerCase().indexOf(r.toLowerCase()) === 0
      )
        return ROLES[i][0];
    return "D";
  }
  function rname(role) {
    var l = rlet(role);
    for (var i = 0; i < ROLES.length; i++)
      if (ROLES[i][0] === l) return ROLES[i][1];
    return "Delivery / Driver";
  }
  var S = {
      q: "",
      st: "",
      route: "",
      pgn: 1,
      view: "table",
      tab: "overview",
      cur: null,
      am: "",
      vm: "",
    },
    P = {},
    recs = {},
    F = null;
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
  function loadP() {
    P = jl(PK, {});
  }
  function saveP() {
    try {
      localStorage.setItem(PK, JSON.stringify(P));
    } catch (e) {}
  }
  function prof(id) {
    return P[id] || (P[id] = {});
  }
  function setCreated(id, d) {
    var x = jl(WK, null);
    if (!x || !x.workers) return;
    x.workers.forEach(function (w) {
      if (w.id === id) w.created = d;
    });
    try {
      localStorage.setItem(WK, JSON.stringify(x));
    } catch (e) {}
  }
  function dshort(ds) {
    return ds
      ? +ds.slice(8) + " " + MN[+ds.slice(5, 7) - 1] + " " + ds.slice(0, 4)
      : "-";
  }
  function addDays(ds, n) {
    var d = new Date(ds + "T00:00:00");
    d.setDate(d.getDate() + n);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function workers() {
    return GA.workers();
  }
  // Employee code: GT + role letter + joining year and month + one running number for all employees (GTD-202610003).
  // The internal id (W001) never changes, so attendance, plans and logins keep working; the code is for people to read and track.
  function ym(ds) {
    ds = ds || GA.today();
    return ds.slice(0, 4) + ds.slice(5, 7);
  }
  function nextSeq(month, skipId) {
    var n = 0;
    Object.keys(P).forEach(function (k) {
      var c = P[k].empCode,
        x = /^GT[A-Z]-\d{6}(\d+)$/.exec(c || "");
      if (k !== skipId && x) n = Math.max(n, parseInt(x[1], 10) || 0);
    });
    return n + 1;
  } // one running number for everyone: 001, 002, 003 ... whatever the role or joining month
  function makeCode(role, join, skipId) {
    var m = ym(join);
    return (
      "GT" + rlet(role) + "-" + m + String(nextSeq(m, skipId)).padStart(3, "0")
    );
  }
  function ensureCodes() {
    var ch = false,
      miss = workers().filter(function (w) {
        return !prof(w.id).empCode;
      });
    miss.sort(function (a, b) {
      var ja = prof(a.id).joinDate || a.created || "",
        jb = prof(b.id).joinDate || b.created || "";
      return ja < jb ? -1 : ja > jb ? 1 : a.id < b.id ? -1 : 1;
    });
    miss.forEach(function (w) {
      var p = prof(w.id);
      p.empCode = makeCode(p.role, p.joinDate || w.created, w.id);
      ch = true;
    });
    if (fixDuplicateNumbers()) ch = true;
    if (ch) saveP();
  }
  // Two employees must never share the same running number. If they do (older IDs restarted at 001 every month), the one who joined first
  // keeps the number and each later one gets the smallest unused number. Numbers that are already unique are never changed.
  function fixDuplicateNumbers() {
    var re = /^(GT[A-Z]-\d{6})(\d+)$/,
      ws = workers().slice(),
      taken = {},
      seen = {},
      ch = false;
    ws.sort(function (a, b) {
      var ja = prof(a.id).joinDate || a.created || "",
        jb = prof(b.id).joinDate || b.created || "";
      return ja < jb ? -1 : ja > jb ? 1 : a.id < b.id ? -1 : 1;
    });
    ws.forEach(function (w) {
      var x = re.exec(prof(w.id).empCode || "");
      if (x) taken[parseInt(x[2], 10)] = 1;
    });
    ws.forEach(function (w) {
      var p = prof(w.id),
        x = re.exec(p.empCode || "");
      if (!x) return;
      var n = parseInt(x[2], 10);
      if (!seen[n]) {
        seen[n] = 1;
        return;
      }
      var k = 1;
      while (taken[k]) k++;
      taken[k] = 1;
      seen[k] = 1;
      p.empCode = x[1] + String(k).padStart(3, "0");
      ch = true;
    });
    return ch;
  }
  function code(w) {
    return prof(w.id).empCode || w.id;
  }
  function isRel(w) {
    return !!prof(w.id).relieved;
  }
  function find(id) {
    return workers().filter(function (w) {
      return w.id === id;
    })[0];
  }
  function routes() {
    return jl("gm_admin_v1", {}).routes || [];
  }
  function cur(id) {
    var a = (prof(id).assign || []).filter(function (x) {
      return !x.to;
    });
    return a.length ? a[a.length - 1] : null;
  }
  function stat(w) {
    return isRel(w)
      ? ["b-rl", "Relieved"]
      : !w.active
        ? ["b-in", "Inactive"]
        : w.onLeave
          ? ["b-lv", "On leave"]
          : ["b-ac", "Active"];
  }
  function badge(w) {
    var s = stat(w);
    return '<span class="wk-b ' + s[0] + '">' + s[1] + "</span>";
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
  function fileUrl(id, k, at) {
    return (
      "/api/vfile?v=" + encodeURIComponent(id) + "&k=" + k + "&t=" + (at || 0)
    );
  }
  function av(w, cls) {
    var h = 0;
    String(w.id)
      .split("")
      .forEach(function (c) {
        h += c.charCodeAt(0);
      });
    var ph = (prof(w.id).files || {}).photo;
    return (
      '<span class="wk-av ' +
      (cls || "") +
      '" style="background:' +
      COL[h % COL.length] +
      '">' +
      (ph
        ? '<img src="' +
          fileUrl(w.id, "photo", ph.at) +
          '" alt="" onerror="this.remove()">'
        : "") +
      "" +
      esc((w.name || "?").charAt(0).toUpperCase()) +
      "</span>"
    );
  }
  function loadRecs() {
    return fetch("/api/state?since=0", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(
        function (r) {
          recs = {};
          for (var k in r.items)
            if (k.indexOf("gm_crm_data_v5__") === 0 && r.items[k].v) {
              try {
                recs[k.slice(16)] = JSON.parse(r.items[k].v);
              } catch (e) {}
            }
        },
        function () {},
      );
  }

  // ---------- modal helpers ----------
  function modal(html) {
    var o = $("wkM");
    if (!o) {
      o = document.createElement("div");
      o.id = "wkM";
      o.className = "wk-modal";
      document.body.appendChild(o);
      o.onclick = function (e) {
        if (e.target === o) closeM();
      };
    }
    o.innerHTML = '<div class="wk-box">' + html + "</div>";
  }
  function closeM() {
    var o = $("wkM");
    if (o) o.remove();
  }
  function fgm(label, id, val, extra) {
    return (
      '<label class="wk-lbl" for="' +
      id +
      '">' +
      label +
      '</label><div class="field"><input id="' +
      id +
      '" value="' +
      esc(val || "") +
      '" ' +
      (extra || "") +
      "></div>"
    );
  }
  function btns(ok) {
    return (
      '<div class="wk-err" id="mErr"></div><div class="wk-act"><button class="btn btn-outline" id="mNo">Close</button>' +
      (ok ? '<button class="btn" id="mOk">' + ok + "</button>" : "") +
      "</div>"
    );
  }
  function merr(t) {
    $("mErr").textContent = t;
  }

  // ---------- 1. list ----------
  function list() {
    var all = workers(),
      q = S.q.toLowerCase().trim(),
      cA = 0,
      cL = 0,
      cI = 0,
      cR = 0;
    all.forEach(function (w) {
      if (isRel(w)) cR++;
      else if (!w.active) cI++;
      else if (w.onLeave) cL++;
      else cA++;
    });
    var rows = all.filter(function (w) {
      var s = isRel(w)
          ? "relieved"
          : !w.active
            ? "inactive"
            : w.onLeave
              ? "leave"
              : "active",
        r = cur(w.id);
      if (S.st && s !== S.st) return false;
      if (S.route && (!r || r.route !== S.route)) return false;
      return (
        !q ||
        (w.name + " " + w.id + " " + code(w) + " " + w.phone)
          .toLowerCase()
          .indexOf(q) > -1
      );
    });
    var pages = Math.max(1, Math.ceil(rows.length / PER));
    if (S.pgn > pages) S.pgn = pages;
    var vis =
      S.view === "grid" ? rows : rows.slice((S.pgn - 1) * PER, S.pgn * PER);
    var rts = {};
    all.forEach(function (w) {
      var r = cur(w.id);
      if (r) rts[r.route] = 1;
    });
    var body =
      vis
        .map(function (w, i) {
          var p = prof(w.id),
            r = cur(w.id);
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
            esc(code(w)) +
            "</td><td>+91 " +
            esc(w.phone) +
            "</td><td>" +
            esc(rname(p.role)) +
            "</td><td>" +
            esc(r ? r.route : "-") +
            "</td><td>" +
            badge(w) +
            "</td><td>" +
            dshort(p.joinDate || w.created) +
            '</td><td><span class="wk-menu"><button class="wk-ib" data-m="' +
            esc(w.id) +
            '" title="Actions">&#8943;</button></span></td></tr>'
          );
        })
        .join("") ||
      '<tr><td colspan="9"><div class="wk-empty"><b>' +
        (all.length ? "No employees match" : "No employees yet") +
        "</b>" +
        (all.length
          ? "Try a different search or filter."
          : "Add your first employee. They log in to the app with their mobile number.") +
        "</div></td></tr>";
    function card(w) {
      var r = cur(w.id);
      return (
        '<div class="wk-wc" data-w="' +
        esc(w.id) +
        '">' +
        av(w, "lg") +
        '<div class="m"><b>' +
        esc(w.name) +
        ' <small style="display:inline">(' +
        esc(code(w)) +
        ")</small></b><small>+91 " +
        esc(w.phone) +
        (r ? " &middot; " + esc(r.route) : "") +
        "</small></div>" +
        badge(w) +
        "</div>"
      );
    }
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
    pg.innerHTML =
      '<div class="wk-head"><div><p class="wk-sub" style="margin:0">Manage your employees, assign routes, and track details.</p></div><div class="field a-f" data-act style="width:190px;height:38px"><input type="search" id="fQ" placeholder="Search employee..." aria-label="Search employee name, ID or phone" autocomplete="off" value="' +
      esc(S.q) +
      '"></div><button class="btn" id="bAdd" data-act>+ Add employee</button></div>' +
      '<div class="wk-tiles"><div class="wk-tile t-g"><b>' +
      all.length +
      '</b><span>Total employees</span></div><div class="wk-tile t-i"><b>' +
      cA +
      '</b><span>Active</span></div><div class="wk-tile t-y"><b>' +
      cL +
      '</b><span>On leave today</span></div><div class="wk-tile t-r"><b>' +
      cI +
      '</b><span>Inactive</span></div><div class="wk-tile t-n"><b>' +
      cR +
      "</b><span>Relieved</span></div></div>" +
      '<div class="wk-card"><div class="wk-filters"><div class="field"><select id="fS">' +
      [
        ["", "All status"],
        ["active", "Active"],
        ["leave", "On leave"],
        ["inactive", "Inactive"],
        ["relieved", "Relieved"],
      ]
        .map(function (o) {
          return (
            '<option value="' +
            o[0] +
            '"' +
            (o[0] === S.st ? " selected" : "") +
            ">" +
            o[1] +
            "</option>"
          );
        })
        .join("") +
      '</select></div><div class="field"><select id="fR"><option value="">All routes</option>' +
      Object.keys(rts)
        .sort()
        .map(function (k) {
          return (
            "<option" +
            (k === S.route ? " selected" : "") +
            ' value="' +
            esc(k) +
            '">' +
            esc(k) +
            "</option>"
          );
        })
        .join("") +
      '</select></div><div class="wk-tg"><button data-v="table" class="' +
      (S.view === "table" ? "on" : "") +
      '" title="List">&#9776;</button><button data-v="grid" class="' +
      (S.view === "grid" ? "on" : "") +
      '" title="Cards">&#9638;</button></div></div>' +
      (S.view === "grid"
        ? vis.length
          ? '<div class="wk-grid">' + vis.map(card).join("") + "</div>"
          : '<div class="wk-empty"><b>No employees match</b></div>'
        : '<div class="wk-tblw wk-scroll"><table class="wk-tbl"><thead><tr><th>#</th><th>Name</th><th>Employee ID</th><th>Phone</th><th>Role</th><th>Route</th><th>Status</th><th>Join date</th><th></th></tr></thead><tbody>' +
          body +
          '</tbody></table></div><div class="wk-cards">' +
          (vis.map(card).join("") ||
            '<div class="wk-empty"><b>No employees</b></div>') +
          "</div>" +
          '<div class="wk-pg"><span>Showing ' +
          (rows.length ? (S.pgn - 1) * PER + 1 : 0) +
          "-" +
          Math.min(rows.length, S.pgn * PER) +
          " of " +
          rows.length +
          " employees</span><div>" +
          pb +
          "</div></div>") +
      "</div>";
    $("bAdd").onclick = function () {
      location.hash = "#add";
    };
    $("fQ").oninput = function () {
      S.q = this.value;
      S.pgn = 1;
      var p = this.selectionStart;
      list();
      var e = $("fQ");
      e.focus();
      e.setSelectionRange(p, p);
    };
    $("fS").onchange = function () {
      S.st = this.value;
      S.pgn = 1;
      list();
    };
    $("fR").onchange = function () {
      S.route = this.value;
      S.pgn = 1;
      list();
    };
    [].forEach.call(pg.querySelectorAll("[data-v]"), function (b) {
      b.onclick = function () {
        S.view = b.getAttribute("data-v");
        list();
      };
    });
    [].forEach.call(pg.querySelectorAll("[data-pg]"), function (b) {
      b.onclick = function () {
        S.pgn = +b.getAttribute("data-pg");
        list();
      };
    });
    [].forEach.call(pg.querySelectorAll("[data-w]"), function (el) {
      el.onclick = function (e) {
        if (e.target.closest(".wk-menu")) return;
        location.hash = "#w/" + el.getAttribute("data-w");
      };
    });
    [].forEach.call(pg.querySelectorAll("[data-m]"), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        menu(b, b.getAttribute("data-m"));
      };
    });
  }
  function menu(btn, id) {
    var old = document.querySelector(".wk-pop");
    if (old) {
      old.remove();
    }
    var w = find(id),
      m = document.createElement("div");
    m.className = "wk-pop";
    m.innerHTML =
      '<button data-a="v">View details</button><button data-a="e">Edit employee</button><button data-a="p">Reset password</button><button data-a="d" class="dg">Delete employee</button>' +
      (isRel(w)
        ? '<button data-a="r">Re-join (undo relieved)</button>'
        : '<button data-a="l">Leave</button><button data-a="t" class="' +
          (w.active ? "dg" : "") +
          '">' +
          (w.active ? "Deactivate" : "Activate") +
          '</button><button data-a="x" class="dg">Mark as relieved</button>');
    // Float the menu above the page (fixed, on <body>) so the scrolling table box never clips it or grows a scrollbar
    m.style.position = "fixed";
    m.style.visibility = "hidden";
    document.body.appendChild(m);
    var br = btn.getBoundingClientRect(),
      mh = m.offsetHeight,
      mw = m.offsetWidth;
    var top = br.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, br.top - mh - 4);
    m.style.top = top + "px";
    m.style.left =
      Math.max(8, Math.min(br.right - mw, window.innerWidth - mw - 8)) + "px";
    m.style.right = "auto";
    m.style.visibility = "";
    m.onclick = function (e) {
      e.stopPropagation();
      var a = e.target.getAttribute("data-a");
      if (!a) return;
      m.remove();
      act(a, id);
    };
  }
  document.addEventListener("click", function () {
    var o = document.querySelector(".wk-pop");
    if (o) o.remove();
  });
  window.addEventListener(
    "scroll",
    function () {
      var o = document.querySelector(".wk-pop");
      if (o) o.remove();
    },
    true,
  );
  window.addEventListener("resize", function () {
    var o = document.querySelector(".wk-pop");
    if (o) o.remove();
  });
  function act(a, id) {
    var w = find(id);
    if (a === "v") location.hash = "#w/" + id;
    if (a === "e") location.hash = "#edit/" + id;
    if (a === "p") pwModal(w);
    if (a === "l") leaveModal(w);
    if (a === "x") relModal(w);
    if (a === "r") rejoin(w);
    if (a === "d") {
      if (
        !confirm(
          "Delete " +
            w.name +
            " (" +
            code(w) +
            ") permanently?\n\nThis removes the employee and their login. It cannot be undone.\nOnly an employee with no attendance, plans or advances can be deleted.",
        )
      )
        return;
      fetch("/api/delete-employee", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (r) {
          if (!r.ok) {
            alert(r.j.error || "Could not delete.");
            return;
          }
          toast(w.name + " deleted");
          setTimeout(function () {
            location.reload();
          }, 700);
        })
        .catch(function () {
          alert("Could not reach the server. Nothing was deleted.");
        });
      return;
    }
    if (a === "t") {
      if (
        w.active &&
        !confirm("Deactivate " + w.name + "? They will not be able to log in.")
      )
        return;
      GA.setActive(id, !w.active);
      toast(w.name + (w.active ? " deactivated" : " activated"));
      route();
    }
  }
  function relModal(w) {
    modal(
      "<h2>Mark " +
        esc(w.name) +
        ' as relieved</h2><p class="wk-sub">They leave the company. Their login stops working and they no longer appear in new daily plans. All past attendance, plans and records stay.</p>' +
        fgm("Relieving date", "rD", GA.today(), 'type="date"') +
        fgm("Reason (optional)", "rR", "") +
        btns("Mark as relieved"),
    );
    $("mNo").onclick = closeM;
    $("mOk").onclick = function () {
      var d = $("rD").value;
      if (!d) return merr("Choose the relieving date.");
      var j = prof(w.id).joinDate || w.created || "";
      if (j && d < j)
        return merr(
          "The relieving date cannot be before the join date (" +
            dshort(j) +
            ").",
        );
      var c = cur(w.id);
      if (c) c.to = d;
      prof(w.id).relieved = { date: d, reason: $("rR").value.trim() };
      saveP();
      GA.setActive(w.id, false);
      closeM();
      toast(w.name + " marked as relieved");
      route();
    };
  }
  function rejoin(w) {
    if (
      !confirm(
        "Re-join " + w.name + "? They will become active again and can log in.",
      )
    )
      return;
    var p = prof(w.id);
    delete p.relieved;
    saveP();
    GA.setActive(w.id, true);
    toast(w.name + " is active again");
    route();
  }
  function pwModal(w) {
    modal(
      "<h2>Reset password for " +
        esc(w.name) +
        "</h2>" +
        fgm(
          "New password (at least 6 characters)",
          "kP",
          GA.randomPassword(),
          'maxlength="30" autocomplete="off"',
        ) +
        btns("Save password"),
    );
    $("mNo").onclick = closeM;
    $("mOk").onclick = function () {
      var v = $("kP").value.trim(),
        r = GA.setPassword(w.id, v);
      if (!r.ok) return merr(r.error);
      modal(
        "<h2>Password updated</h2><p>Tell " +
          esc(w.name) +
          ' the new password:</p><div class="wk-pin">' +
          esc(v) +
          "</div>" +
          btns(),
      );
      $("mNo").onclick = closeM;
    };
  }
  function leaveModal(w) {
    var ls = GA.leavesOf(w.id);
    modal(
      "<h2>Leave for " +
        esc(w.name) +
        "</h2>" +
        (ls
          .map(function (l) {
            return (
              '<div class="wk-lv"><span>' +
              esc(l.from) +
              (l.to !== l.from ? " to " + esc(l.to) : "") +
              (l.reason ? " &middot; " + esc(l.reason) : "") +
              '</span><button class="wk-ib" data-l="' +
              l.id +
              '" title="Remove">&times;</button></div>'
            );
          })
          .join("") || '<p class="wk-sub">No leave recorded.</p>') +
        '<div class="wk-row"><div>' +
        fgm("First day", "lF", GA.today(), 'type="date"') +
        "</div><div>" +
        fgm("Last day", "lT", GA.today(), 'type="date"') +
        "</div></div>" +
        fgm("Reason (optional)", "lR", "") +
        btns("Mark leave"),
    );
    $("mNo").onclick = function () {
      closeM();
      route();
    };
    [].forEach.call(document.querySelectorAll("[data-l]"), function (b) {
      b.onclick = function () {
        GA.removeLeave(b.getAttribute("data-l"));
        leaveModal(w);
      };
    });
    $("mOk").onclick = function () {
      var r = GA.addLeave(w.id, $("lF").value, $("lT").value, $("lR").value);
      if (!r.ok) return merr(r.error);
      leaveModal(find(w.id));
    };
  }

  // ---------- 2. add / edit ----------
  function nextCode() {
    return makeCode("Delivery", GA.today());
  }
  function sel(id, opts, val) {
    return (
      '<div class="field"><select id="' +
      id +
      '">' +
      opts
        .map(function (o) {
          o = [].concat(o);
          return (
            '<option value="' +
            esc(o[0]) +
            '"' +
            (o[0] === val ? " selected" : "") +
            ">" +
            esc(o[o.length - 1]) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>"
    );
  }
  function form(id) {
    var w = id ? find(id) : null;
    if (id && !w) {
      location.hash = "#";
      return;
    }
    var p = w ? prof(w.id) : {},
      r = w ? cur(w.id) : null;
    F = {
      id: id,
      photo: null,
      rmPhoto: false,
      pw: id ? "" : GA.randomPassword(),
    };
    var rt = [["", "Select route"]].concat(
      routes().map(function (x) {
        return [x.name];
      }),
    );
    pg.innerHTML =
      '<div class="wk-head"><div><p class="wk-sub" style="margin:0">' +
      (w
        ? "Update " + esc(w.name) + "'s details."
        : "Enter the details to add a new employee.") +
      "</p></div></div>" +
      '<div class="wk-form"><div class="wk-col"><div class="wk-card"><h3>Basic information</h3>' +
      '<div class="wk-row"><div><label class="wk-lbl" for="fN">Full name <em>*</em></label><div class="field"><input id="fN" maxlength="60" value="' +
      esc(w ? w.name : "") +
      '" placeholder="Enter full name"></div></div><div><label class="wk-lbl">Employee ID</label><div class="field"><input id="fCode" value="' +
      esc(w ? code(w) : nextCode()) +
      '" disabled></div></div>' +
      '<div><label class="wk-lbl" for="fP">Phone number <em>*</em> <i>(login)</i></label><div class="wk-pre"><span>+91</span><div class="field"><input id="fP" inputmode="numeric" maxlength="10" value="' +
      esc(w ? w.phone : "") +
      '" placeholder="10-digit mobile"></div></div></div>' +
      '<div><label class="wk-lbl" for="fA">Alternate phone</label><div class="wk-pre"><span>+91</span><div class="field"><input id="fA" inputmode="numeric" maxlength="10" value="' +
      esc(p.altPhone || "") +
      '" placeholder="Alternate number"></div></div></div>' +
      '<div><label class="wk-lbl" for="fDob">Date of birth</label><div class="field"><input id="fDob" type="date" value="' +
      esc(p.dob || "") +
      '" max="' +
      GA.today() +
      '"></div></div><div><label class="wk-lbl" for="fG">Gender</label>' +
      sel(
        "fG",
        [["", "Select gender"], ["Male"], ["Female"], ["Other"]],
        p.gender || "",
      ) +
      "</div>" +
      '<div><label class="wk-lbl" for="fRole">Role <em>*</em></label>' +
      sel(
        "fRole",
        ROLES.filter(function (x) {
          // only the Super Admin can make someone an Admin (the server checks this too)
          var se = GA.session && GA.session();
          return x[0] !== "A" || rlet(p.role) === "A" || !!(se && se.super);
        }).map(function (x) {
          return [x[1]];
        }),
        rname(p.role),
      ) +
      '</div><div><label class="wk-lbl" for="fJ">Join date <em>*</em></label><div class="field"><input id="fJ" type="date" value="' +
      esc(p.joinDate || (w && w.created) || GA.today()) +
      '"></div></div>' +
      '<div><label class="wk-lbl" for="fSt">Status <em>*</em></label>' +
      (w && isRel(w)
        ? '<div class="field"><input value="Relieved on ' +
          esc(dshort(p.relieved.date)) +
          '" disabled></div>'
        : sel(
            "fSt",
            [
              ["active", "Active"],
              ["inactive", "Inactive"],
            ],
            w && !w.active ? "inactive" : "active",
          )) +
      '</div><div><label class="wk-lbl" for="fRt">Assigned route</label>' +
      (w
        ? '<div class="field"><input value="' +
          esc(r ? r.route : "None") +
          '" disabled></div>'
        : sel("fRt", rt, "")) +
      "</div></div>" +
      '<div class="wk-row"><div><label class="wk-lbl" for="fAd">Address</label><div class="field"><textarea id="fAd" rows="3" placeholder="Enter full address">' +
      esc(p.address || "") +
      '</textarea></div></div><div><label class="wk-lbl" for="fNt">Notes <i>(optional)</i></label><div class="field"><textarea id="fNt" rows="3" placeholder="Add any notes...">' +
      esc(p.notes || "") +
      "</textarea></div></div></div>" +
      (w
        ? '<p class="wk-sub" style="margin-top:8px">To change the route, use the Routes tab on the employee page. To change the password use Reset password.</p>'
        : '<label class="wk-lbl" for="fK">Login password <i>(share it with the employee)</i></label><div class="field"><input id="fK" value="' +
          esc(F.pw) +
          '" maxlength="30" autocomplete="off"></div>') +
      '</div></div><div class="wk-col"><div class="wk-card wk-ph"><h3>Profile photo</h3><div id="phv">' +
      (w
        ? av(w, "xl")
        : '<span class="wk-av xl" style="background:#0F766E">+</span>') +
      '</div><p class="wk-sub" style="margin:8px 0">JPG, PNG or WEBP, up to 5 MB</p><input type="file" id="fPh" accept="image/jpeg,image/png,image/webp" hidden><button class="btn" id="bPh" type="button">Upload photo</button><button class="btn btn-outline" id="bPhX" type="button">Remove</button></div>' +
      '<div class="wk-card"><h3>Additional details</h3>' +
      fgm("Emergency contact name", "fEn", p.emName || "") +
      '<label class="wk-lbl" for="fEp">Emergency contact phone</label><div class="wk-pre"><span>+91</span><div class="field"><input id="fEp" inputmode="numeric" maxlength="10" value="' +
      esc(
        p.emPhone ||
          (w && /^\d{10}$/.test(w.emergency || "") ? w.emergency : ""),
      ) +
      '"></div></div>' +
      fgm(
        "Aadhaar / ID number <i>(optional)</i>",
        "fId",
        p.idNumber || "",
        'maxlength="20"',
      ) +
      "</div></div></div>" +
      '<div class="wk-err" id="fErr"></div><div class="wk-act"><a href="#" class="btn btn-outline">Cancel</a><button class="btn" id="fSave">Save employee</button></div>';
    $("bPh").onclick = function () {
      $("fPh").click();
    };
    $("fPh").onchange = function () {
      var f = this.files[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        $("fErr").textContent = "Choose a JPG, PNG or WEBP picture.";
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        $("fErr").textContent = "That picture is larger than 25 MB.";
        return;
      }
      F.photo = f;
      F.rmPhoto = false;
      $("fErr").textContent = "";
      var fr = new FileReader();
      fr.onload = function () {
        $("phv").innerHTML =
          '<span class="wk-av xl"><img src="' + fr.result + '" alt=""></span>';
      };
      fr.readAsDataURL(f);
    };
    $("bPhX").onclick = function () {
      F.photo = null;
      F.rmPhoto = true;
      $("phv").innerHTML = w
        ? '<span class="wk-av xl" style="background:#64748B">' +
          esc(w.name.charAt(0).toUpperCase()) +
          "</span>"
        : '<span class="wk-av xl" style="background:#0F766E">+</span>';
    };
    $("fSave").onclick = function () {
      saveForm(w);
    };
    if (!w) {
      var upd = function () {
        $("fCode").value = makeCode(
          $("fRole").value,
          $("fJ").value || GA.today(),
        );
      };
      $("fRole").onchange = upd;
      $("fJ").onchange = upd;
    }
  }
  function digits(v) {
    return /^\d{10}$/.test(v);
  }
  function saveForm(w) {
    var name = $("fN").value.trim(),
      ph = $("fP").value.trim(),
      alt = $("fA").value.trim(),
      emp = $("fEp").value.trim(),
      join = $("fJ").value,
      dob = $("fDob").value,
      err = "";
    if (!name) err = "Enter the employee's full name.";
    else if (!digits(ph)) err = "Mobile number must be 10 digits.";
    else if (alt && !digits(alt)) err = "Alternate phone must be 10 digits.";
    else if (emp && !digits(emp)) err = "Emergency phone must be 10 digits.";
    else if (!join) err = "Choose the join date.";
    else if (dob && dob > GA.today())
      err = "Date of birth cannot be in the future.";
    if (err) {
      $("fErr").textContent = err;
      return;
    }
    var core = {
        name: name,
        phone: ph,
        emergency: emp || (w && w.emergency) || "",
      },
      r,
      id;
    if (w) {
      r = GA.updateWorker(w.id, core);
      if (!r.ok) {
        $("fErr").textContent = r.error;
        return;
      }
      id = w.id;
    } else {
      core.password = $("fK").value.trim();
      r = GA.addWorker(core);
      if (!r.ok) {
        $("fErr").textContent = r.error;
        return;
      }
      id = r.worker.id;
    }
    setCreated(id, join);
    if (!(w && isRel(w))) GA.setActive(id, $("fSt").value === "active");
    var p = prof(id);
    p.altPhone = alt;
    p.dob = dob;
    p.gender = $("fG").value;
    p.role = $("fRole").value;
    p.joinDate = join;
    if (!p.empCode) p.empCode = makeCode(p.role, join, id);
    p.address = $("fAd").value.trim();
    p.notes = $("fNt").value.trim();
    p.emName = $("fEn").value.trim();
    p.emPhone = emp;
    p.idNumber = $("fId").value.trim();
    if (!w && $("fRt") && $("fRt").value)
      p.assign = [{ route: $("fRt").value, vehicle: "", from: join, to: null }];
    saveP();
    var done = function () {
      if (w) {
        toast("Employee saved");
        location.hash = "#w/" + id;
      } else {
        modal(
          '<h2>Employee added</h2><p class="wk-sub">Employee ID: <b style="color:var(--text)">' +
            esc(p.empCode) +
            "</b></p><p>Give " +
            esc(name) +
            ' these login details:</p><p class="wk-sub">Mobile: <b style="color:var(--text)">' +
            esc(ph) +
            '</b></p><div class="wk-pin">' +
            esc(r.worker.password) +
            "</div>" +
            btns(),
        );
        $("mNo").onclick = function () {
          closeM();
          location.hash = "#w/" + id;
        };
      }
    };
    var pr = Promise.resolve();
    if (F.photo)
      pr = upload(id, "photo", F.photo).then(function (m) {
        prof(id).files = Object.assign({}, prof(id).files, { photo: m });
        saveP();
      });
    else if (F.rmPhoto && (p.files || {}).photo) pr = rmFile(id, "photo");
    pr.then(done, function (e) {
      toast(
        "Saved, but the photo failed: " + ((e && e.message) || "upload error"),
      );
      done();
    });
  }

  // ---------- files (server) ----------
  function upload(id, kind, file) {
    return new Promise(function (ok, no) {
      var fr = {};
      fr.onerror = function () {
        no(new Error("Could not read that file."));
      };
      fr.onload = function () {
        fetch("/api/vfile?v=" + encodeURIComponent(id) + "&k=" + kind, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: fr.result }),
        })
          .then(function (r) {
            return r
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                if (!r.ok) throw new Error(j.error || "Upload failed.");
                return j;
              });
          })
          .then(
            function (j) {
              ok({ name: file.name, size: j.size, mime: j.mime, at: j.at });
            },
            function (e) {
              no(
                e && e.message
                  ? e
                  : new Error("The server could not be reached."),
              );
            },
          );
      };
      GMImg.read(file, kind === "photo" ? 1200 : 2000).then(
        function (d) {
          if (!d) return fr.onerror();
          fr.result = d;
          fr.onload();
        },
        function () {
          fr.onerror();
        },
      );
    });
  }
  function rmFile(id, kind) {
    return fetch("/api/vfile?v=" + encodeURIComponent(id) + "&k=" + kind, {
      method: "DELETE",
    }).then(function (r) {
      if (!r.ok) throw new Error("The server could not remove the file.");
      var f = Object.assign({}, prof(id).files);
      delete f[kind];
      prof(id).files = f;
      saveP();
    });
  }

  // ---------- 3-5. details, documents, routes ----------
  function tile(c, v, l) {
    return (
      '<div class="wk-tile ' +
      c +
      '"><b>' +
      v +
      "</b><span>" +
      l +
      "</span></div>"
    );
  }
  function kv(l, v) {
    return (
      "<div><small>" +
      l +
      "</small><b>" +
      (v === "" || v == null ? "-" : esc(v)) +
      "</b></div>"
    );
  }

  // ---------- attendance + advances inside the employee page ----------
  var AEK = "gm_admin_attedit_v1",
    WD3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function mshift(m, n) {
    var d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function mlabel(m) {
    return (
      [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ][+m.slice(5, 7) - 1] +
      " " +
      m.slice(0, 4)
    );
  }
  function monthBar(id, m) {
    return (
      '<div class="wk-mbar"><button class="wk-ib" data-mv="-1" title="Previous month">&#8249;</button><div class="field"><input type="month" id="' +
      id +
      '" value="' +
      m +
      '"></div><button class="wk-ib" data-mv="1" title="Next month">&#8250;</button></div>'
    );
  }
  function hm(x) {
    return x == null
      ? "-"
      : Math.floor(x / 60) + "h " + String(x % 60).padStart(2, "0") + "m";
  }
  function tmins(t) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(t || "");
    if (!m) return null;
    var h = +m[1];
    if (m[3]) {
      h = h % 12;
      if (/pm/i.test(m[3])) h += 12;
    }
    return h * 60 + +m[2];
  }
  // One day of one employee: the punch record with any admin correction on top, otherwise absent / leave / day off (same rules as the Attendance page).
  function dayOf(w, ds, edits, leaves) {
    var td = GA.today(),
      lg = (recs[w.id] || {}).attendanceLog || {},
      b = (lg[ds.slice(0, 7)] || {})[+ds.slice(8)],
      e = (edits[w.id] || {})[ds];
    var o = { st: null, inT: "-", outT: "-", hrs: null, km: 0 };
    if (b) {
      o.st = b.status;
      o.inT = b.inTime || "-";
      o.outT = b.outTime || "-";
      o.km = Number(b.km) || 0;
      var m = /(\d+)h\s*(\d+)m/.exec(b.hours || "");
      if (m) o.hrs = +m[1] * 60 + +m[2];
    }
    if (e) {
      o.st = e.status;
      o.inT = e.inTime || "-";
      o.outT = e.outTime || "-";
      o.km = Number(e.km) || 0;
      o.hrs = null;
    }
    if (o.hrs == null && o.inT !== "-" && o.outT !== "-") {
      var x = tmins(o.inT),
        y = tmins(o.outT);
      if (x != null && y != null && y >= x) o.hrs = y - x;
    }
    if (!o.st) {
      var dow = new Date(ds + "T00:00:00").getDay(),
        start = w.created || "";
      if (ds > td || (start && ds < start)) o.st = "none";
      else if (dow === 0) o.st = "off";
      else if (
        leaves.some(function (l) {
          return l.from <= ds && ds <= l.to;
        })
      )
        o.st = "leave";
      else if (ds === td && new Date().getHours() < 12) o.st = "pending";
      else o.st = "absent";
    }
    return o;
  }
  var AB = {
    present: ["b-ac", "Present"],
    late: ["b-lv", "Late"],
    absent: ["b-ab", "Absent"],
    leave: ["b-lea", "On leave"],
    off: ["b-of", "Day off"],
    pending: ["b-of", "Not in yet"],
  };
  function attendanceTab(w) {
    var m = S.am,
      edits = (jl(AEK, null) || {}).edits || {},
      lv = GA.leavesOf(w.id),
      n = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(),
      rows = [],
      c = { present: 0, late: 0, absent: 0, leave: 0, off: 0 },
      km = 0,
      mins = 0,
      hd = 0;
    for (var d = n; d >= 1; d--) {
      var ds = m + "-" + String(d).padStart(2, "0"),
        o = dayOf(w, ds, edits, lv);
      if (o.st === "none") continue;
      if (c[o.st] != null) c[o.st]++;
      km += o.km;
      if (o.hrs != null) {
        mins += o.hrs;
        hd++;
      }
      rows.push(
        "<tr><td>" +
          d +
          " " +
          MN[+m.slice(5, 7) - 1] +
          "</td><td>" +
          WD3[new Date(ds + "T00:00:00").getDay()] +
          '</td><td><span class="wk-b ' +
          (AB[o.st] || AB.off)[0] +
          '">' +
          (AB[o.st] || AB.off)[1] +
          "</span></td><td>" +
          esc(o.inT) +
          "</td><td>" +
          esc(o.outT) +
          "</td><td>" +
          (o.hrs == null ? "-" : hm(o.hrs)) +
          "</td><td>" +
          (o.km ? Math.round(o.km * 10) / 10 + " km" : "-") +
          "</td></tr>",
      );
    }
    var att = c.present + c.late;
    return (
      '<div class="wk-card"><h3>Attendance summary <span class="wk-hacts">' +
      monthBar("aM", m) +
      '<a class="btn btn-outline" style="padding:0 12px;min-height:36px;font-weight:600" href="attendance.html#worker/' +
      w.id +
      '">Full attendance page</a></span></h3>' +
      '<div class="wk-tiles" style="margin:14px 0 0">' +
      tile("t-g", att, "Days attended") +
      tile("t-y", c.late, "Days late") +
      tile("t-r", c.absent, "Days absent") +
      tile("t-i", c.leave, "On leave") +
      tile("t-b", Math.round(km * 10) / 10 + " km", "Distance") +
      "</div>" +
      '<p class="wk-sub" style="margin:10px 0 0">' +
      mlabel(m) +
      (hd
        ? " &middot; average " + hm(Math.round(mins / hd)) + " per working day"
        : "") +
      " &middot; " +
      c.off +
      " day" +
      (c.off === 1 ? "" : "s") +
      " off</p></div>" +
      '<div class="wk-card" style="margin-top:16px"><h3>Day by day</h3><div class="wk-scroll"><table class="wk-tbl"><thead><tr><th>Date</th><th>Day</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th><th>Distance</th></tr></thead><tbody>' +
      (rows.join("") ||
        '<tr><td colspan="7"><div class="wk-empty"><b>No records for this month</b></div></td></tr>') +
      "</tbody></table></div></div>"
    );
  }
  function advancesTab(w) {
    var m = S.vm,
      list = GA.entries(w.id, m),
      tot = function (t) {
        return list
          .filter(function (e) {
            return e.type === t;
          })
          .reduce(function (a, e) {
            return a + e.amount;
          }, 0);
      },
      all = GA.entries(w.id, "");
    var adv = tot("advance"),
      ded = tot("deduction");
    return (
      '<div class="wk-card"><h3>Advances &amp; deductions <span class="wk-hacts">' +
      monthBar("vM", m) +
      '<a class="btn btn-outline" style="padding:0 12px;min-height:36px;font-weight:600" href="advances.html">All employees</a><button class="btn" id="bAdv">+ Add entry</button></span></h3>' +
      '<div class="wk-tiles wk-t3" style="margin:14px 0 0">' +
      tile("t-y", GA.ops.rupee(adv), "Advances given") +
      tile("t-r", GA.ops.rupee(ded), "Deductions") +
      tile("t-b", list.length, "Entries this month") +
      "</div></div>" +
      '<div class="wk-card" style="margin-top:16px"><h3>' +
      mlabel(m) +
      '</h3><div class="wk-scroll"><table class="wk-tbl"><thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Amount</th><th></th></tr></thead><tbody>' +
      (list
        .map(function (e) {
          return (
            "<tr><td>" +
            dshort(e.date) +
            "</td><td>" +
            esc(e.title) +
            (e.note
              ? '<div style="color:var(--muted);font-size:12px">' +
                esc(e.note) +
                "</div>"
              : "") +
            '</td><td><span class="wk-b ' +
            (e.type === "advance" ? "b-lv" : "b-cu") +
            '">' +
            (e.type === "advance" ? "Advance" : "Deduction") +
            "</span></td><td><b>" +
            GA.ops.rupee(e.amount) +
            '</b></td><td><button class="wk-ib" data-ed="' +
            e.id +
            '" title="Delete entry">&times;</button></td></tr>'
          );
        })
        .join("") ||
        '<tr><td colspan="5"><div class="wk-empty"><b>No entries in ' +
          mlabel(m) +
          "</b>" +
          (all.length
            ? "Use the arrows to see other months."
            : "Add an advance or a deduction with the button above.") +
          "</div></td></tr>") +
      "</tbody></table></div></div>"
    );
  }
  function advModal(w) {
    modal(
      "<h2>Add entry for " +
        esc(w.name) +
        '</h2><label class="wk-lbl" for="eT">Type</label>' +
        sel(
          "eT",
          [
            ["advance", "Advance (money given)"],
            ["deduction", "Deduction (money cut)"],
          ],
          "advance",
        ) +
        fgm("Title", "eN", "", 'placeholder="e.g. Festival advance"') +
        fgm("Amount (₹)", "eA", "", 'inputmode="numeric"') +
        fgm("Date", "eD", GA.today(), 'type="date"') +
        fgm("Note (optional)", "eO", "") +
        btns("Save entry"),
    );
    $("mNo").onclick = closeM;
    $("mOk").onclick = function () {
      var r = GA.addEntry({
        workerId: w.id,
        type: $("eT").value,
        title: $("eN").value,
        amount: $("eA").value,
        date: $("eD").value,
        note: $("eO").value,
      });
      if (!r.ok) return merr(r.error);
      S.vm = $("eD").value.slice(0, 7);
      closeM();
      toast("Entry saved");
      detail(w.id);
    };
  }
  function detail(id) {
    var w = find(id);
    if (!w) {
      pg.innerHTML =
        '<div class="wk-card"><div class="wk-empty"><b>Employee not found</b><a href="#">Back to employees</a></div></div>';
      return;
    }
    if (S.cur !== id) {
      S.tab = "overview";
      S.cur = id;
      S.am = S.vm = GA.today().slice(0, 7);
    }
    var p = prof(id),
      tabs = [
        ["overview", "Overview"],
        ["attendance", "Attendance"],
        ["routes", "Routes"],
        ["documents", "Documents"],
        ["advances", "Advances"],
        ["notes", "Notes"],
        ["log", "Activity log"],
      ],
      main = "";
    var lg = (recs[id] || {}).attendanceLog || {},
      pr = 0,
      la = 0,
      km = 0;
    Object.keys(lg).forEach(function (mk) {
      Object.keys(lg[mk]).forEach(function (d) {
        var x = lg[mk][d];
        if (x.status === "present") pr++;
        if (x.status === "late") {
          pr++;
          la++;
        }
        km += Number(x.km) || 0;
      });
    });
    var c = cur(id);
    if (S.tab === "overview")
      main =
        '<div class="wk-2"><div class="wk-col"><div class="wk-card"><h3>Basic details</h3><div class="wk-kv">' +
        kv("Full name", w.name) +
        kv("Employee ID", code(w)) +
        (isRel(w)
          ? kv("Relieved on", dshort(p.relieved.date)) +
            kv("Relieving reason", p.relieved.reason)
          : "") +
        kv("Phone", "+91 " + w.phone) +
        kv("Alternate phone", p.altPhone ? "+91 " + p.altPhone : "") +
        kv("Role", rname(p.role)) +
        kv("Join date", dshort(p.joinDate || w.created)) +
        kv("Gender", p.gender) +
        kv("Date of birth", p.dob ? dshort(p.dob) : "") +
        kv("Current route", c ? c.route : "") +
        kv("Aadhaar / ID", p.idNumber) +
        kv("Address", p.address) +
        kv("Notes", p.notes) +
        '</div></div></div><div class="wk-col"><div class="wk-card" style="text-align:center"><h3>Profile photo</h3>' +
        av(w, "xl") +
        '<div style="margin-top:10px"><button class="btn btn-outline" id="bChg">Change photo</button><input type="file" id="fPh" accept="image/jpeg,image/png,image/webp" hidden></div></div><div class="wk-card"><h3>Emergency contact</h3><div class="wk-kv">' +
        kv("Name", p.emName) +
        kv(
          "Phone",
          p.emPhone
            ? "+91 " + p.emPhone
            : /\d/.test(w.emergency || "")
              ? w.emergency
              : "",
        ) +
        "</div></div></div></div>" +
        '<div class="wk-card" style="margin-top:16px"><h3>Quick stats <small style="font-weight:400;color:var(--muted)">from the employee\'s punch records</small></h3><div class="wk-tiles" style="margin:0">' +
        tile("t-g", pr, "Days present") +
        tile("t-y", la, "Days late") +
        tile("t-b", Math.round(km * 10) / 10 + " km", "Total distance") +
        tile(
          "t-i",
          pr ? Math.round((km / pr) * 10) / 10 + " km" : "-",
          "Avg daily km",
        ) +
        "</div></div>";
    else if (S.tab === "attendance") main = attendanceTab(w);
    else if (S.tab === "advances") main = advancesTab(w);
    else if (S.tab === "routes") {
      var hist = (p.assign || []).slice().reverse();
      main =
        '<div class="wk-card"><h3>Current assignment <button class="btn btn-outline" id="bAs">Edit assignment</button></h3><div class="wk-kv">' +
        kv("Assigned route", c ? c.route : "None") +
        kv("Vehicle", c && c.vehicle ? c.vehicle : "") +
        kv("Effective from", c ? dshort(c.from) : "") +
        '</div></div><div class="wk-card" style="margin-top:16px"><h3>Route history</h3><div class="wk-scroll"><table class="wk-tbl"><thead><tr><th>#</th><th>Route</th><th>Vehicle</th><th>From</th><th>To</th></tr></thead><tbody>' +
        (hist
          .map(function (a, i) {
            return (
              "<tr><td>" +
              (i + 1) +
              "</td><td>" +
              esc(a.route) +
              "</td><td>" +
              esc(a.vehicle || "-") +
              "</td><td>" +
              dshort(a.from) +
              "</td><td>" +
              (a.to ? dshort(a.to) : '<span class="wk-b b-cu">Present</span>') +
              "</td></tr>"
            );
          })
          .join("") ||
          '<tr><td colspan="5"><div class="wk-empty"><b>No route assigned yet</b></div></td></tr>') +
        "</tbody></table></div></div>";
    } else if (S.tab === "documents") {
      main =
        '<div class="wk-card"><h3>Documents <button class="btn" id="bUp">+ Upload document</button></h3><p class="wk-sub">JPG, PNG, WEBP or PDF, up to 5 MB each. One file per document type; uploading again replaces it.</p><div class="wk-scroll"><table class="wk-tbl"><thead><tr><th>#</th><th>Document type</th><th>File name</th><th>Uploaded on</th><th></th></tr></thead><tbody>' +
        DOCS.map(function (d, i) {
          var f = (p.files || {})[d[0]];
          return (
            "<tr><td>" +
            (i + 1) +
            "</td><td>" +
            d[1] +
            "</td><td>" +
            (f
              ? esc(f.name)
              : '<span style="color:var(--muted)">Not uploaded</span>') +
            "</td><td>" +
            (f ? dshort(new Date(f.at).toISOString().slice(0, 10)) : "-") +
            "</td><td>" +
            (f
              ? '<a class="btn btn-outline" style="padding:0 10px;min-height:30px" target="_blank" rel="noopener" href="' +
                fileUrl(id, d[0], f.at) +
                '">View</a> <button class="wk-ib" data-rm="' +
                d[0] +
                '" title="Remove">&times;</button>'
              : '<button class="btn btn-outline" style="padding:0 10px;min-height:30px" data-up="' +
                d[0] +
                '">Upload</button>') +
            "</td></tr>"
          );
        }).join("") +
        "</tbody></table></div></div>";
    } else if (S.tab === "log") {
      main =
        '<div class="wk-card"><h3>Activity log</h3><p class="wk-sub">What ' +
        esc(w.name) +
        ' did, and changes made to this employee. Newest first.</p><div class="wk-scroll" id="wkLog"><div class="wk-sub">Loading...</div></div></div>';
    } else if (S.tab === "notes") {
      main =
        '<div class="wk-card wk-nc"><h3>Notes <small id="nCnt">' +
        (p.notes || "").length +
        ' / 1000</small></h3><p class="wk-sub">Private notes about this employee. Only admins can see them.</p><div class="wk-nbox"><textarea id="nT" rows="5" maxlength="1000" placeholder="Write a note, for example: good with customers, prefers morning routes...">' +
        esc(p.notes || "") +
        '</textarea></div><div class="wk-act"><span class="wk-nst" id="nSt">' +
        (p.notes ? "Saved" : "") +
        '</span><button class="btn" id="nS" disabled>Save notes</button></div></div>';
    }
    pg.innerHTML =
      '<div class="wk-head"><span class="wk-menu" data-act><button class="wk-ib" id="dMore" title="More">&#8943;</button></span></div>' +
      '<div class="wk-who wk-hero">' +
      av(w, "xl") +
      '<div class="wk-id"><div class="wk-idrow"><h2>' +
      esc(w.name) +
      "</h2>" +
      badge(w) +
      '</div><div class="wk-meta"><span class="wk-chip">' +
      esc(code(w)) +
      "</span><span>+91 " +
      esc(w.phone) +
      "</span><span>" +
      esc(rname(p.role)) +
      "</span><span>Joined " +
      dshort(p.joinDate || w.created) +
      "</span>" +
      (c && c.route ? "<span>" + esc(c.route) + "</span>" : "") +
      '</div></div></div><div class="wk-tabs">' +
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
        var t = b.getAttribute("data-t");
        S.tab = t;
        detail(id);
      };
    });
    if (S.tab === "log" && $("wkLog")) {
      fetch("/api/activity?worker=" + encodeURIComponent(id), {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Could not load the log. Try again.");
          return r.json();
        })
        .then(function (d) {
          var box = $("wkLog");
          if (!box || S.tab !== "log" || S.cur !== id) return;
          var ev = d.events || [];
          if (!ev.length) {
            box.innerHTML =
              '<div class="wk-sub">Nothing recorded yet for this employee. Older changes made before the log was added are not listed.</div>';
            return;
          }
          var M = [
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
            ],
            z = function (n) {
              return (n < 10 ? "0" : "") + n;
            };
          box.innerHTML =
            '<table class="wk-tbl"><thead><tr><th>When</th><th>By</th><th>What</th></tr></thead><tbody>' +
            ev
              .map(function (e) {
                var t = new Date(e.t + 5.5 * 3600e3);
                return (
                  "<tr><td>" +
                  z(t.getUTCDate()) +
                  " " +
                  M[t.getUTCMonth()] +
                  " " +
                  t.getUTCFullYear() +
                  ", " +
                  z(t.getUTCHours()) +
                  ":" +
                  z(t.getUTCMinutes()) +
                  "</td><td>" +
                  esc(e.by || "-") +
                  "</td><td>" +
                  esc(e.text) +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table>" +
            (d.total > ev.length
              ? '<div class="wk-sub">Showing the latest ' +
                ev.length +
                " of " +
                d.total +
                ".</div>"
              : "");
        })
        .catch(function (e) {
          if ($("wkLog"))
            $("wkLog").innerHTML =
              '<div class="wk-sub">' +
              esc(e.message || "Could not load the log.") +
              "</div>";
        });
    }
    $("dMore").onclick = function (e) {
      e.stopPropagation();
      menu($("dMore"), id);
    };
    if ($("bChg")) {
      $("bChg").onclick = function () {
        $("fPh").click();
      };
      $("fPh").onchange = function () {
        var f = this.files[0];
        if (!f) return;
        if (
          !/^image\/(jpeg|png|webp)$/.test(f.type) ||
          f.size > 25 * 1024 * 1024
        ) {
          toast("Choose a JPG, PNG or WEBP picture up to 25 MB.");
          return;
        }
        upload(id, "photo", f).then(
          function (m) {
            prof(id).files = Object.assign({}, prof(id).files, { photo: m });
            saveP();
            toast("Photo updated");
            detail(id);
          },
          function (e) {
            toast(e.message);
          },
        );
      };
    }
    [].forEach.call(pg.querySelectorAll("[data-mv]"), function (b) {
      b.onclick = function () {
        var k = S.tab === "advances" ? "vm" : "am";
        S[k] = mshift(S[k], +b.getAttribute("data-mv"));
        detail(id);
      };
    });
    if ($("aM"))
      $("aM").onchange = function () {
        if (this.value) {
          S.am = this.value;
          detail(id);
        }
      };
    if ($("vM"))
      $("vM").onchange = function () {
        if (this.value) {
          S.vm = this.value;
          detail(id);
        }
      };
    if ($("bAdv"))
      $("bAdv").onclick = function () {
        advModal(w);
      };
    [].forEach.call(pg.querySelectorAll("[data-ed]"), function (b) {
      b.onclick = function () {
        if (confirm("Delete this entry? The employee will no longer see it.")) {
          GA.removeEntry(b.getAttribute("data-ed"));
          toast("Entry deleted");
          detail(id);
        }
      };
    });
    if ($("bAs"))
      $("bAs").onclick = function () {
        assignModal(w);
      };
    if ($("bUp"))
      $("bUp").onclick = function () {
        docModal(w, "");
      };
    [].forEach.call(pg.querySelectorAll("[data-up]"), function (b) {
      b.onclick = function () {
        docModal(w, b.getAttribute("data-up"));
      };
    });
    [].forEach.call(pg.querySelectorAll("[data-rm]"), function (b) {
      b.onclick = function () {
        if (confirm("Remove this document?"))
          rmFile(id, b.getAttribute("data-rm")).then(
            function () {
              toast("Document removed");
              detail(id);
            },
            function (e) {
              toast(e.message);
            },
          );
      };
    });
    if ($("nS")) {
      var nt = $("nT"),
        saved = nt.value,
        grow = function () {
          nt.style.height = "auto";
          nt.style.height = Math.max(132, nt.scrollHeight + 2) + "px";
        };
      grow();
      nt.oninput = function () {
        grow();
        $("nCnt").textContent = nt.value.length + " / 1000";
        var ch = nt.value.trim() !== saved.trim();
        $("nS").disabled = !ch;
        $("nSt").textContent = ch ? "Unsaved changes" : "Saved";
      };
      $("nS").onclick = function () {
        prof(id).notes = nt.value.trim();
        saved = prof(id).notes;
        saveP();
        $("nS").disabled = true;
        $("nSt").textContent = "Saved";
        toast("Notes saved");
      };
    }
  }
  function docModal(w, kind) {
    modal(
      '<h2>Upload document</h2><label class="wk-lbl" for="dK">Document type</label>' +
        sel(
          "dK",
          DOCS.map(function (d) {
            return [d[0], d[1]];
          }),
          kind || "aadhaar",
        ) +
        '<label class="wk-lbl" for="dF">File</label><div class="field"><input type="file" id="dF" accept="image/jpeg,image/png,image/webp,application/pdf"></div>' +
        btns("Upload"),
    );
    $("mNo").onclick = closeM;
    $("mOk").onclick = function () {
      var f = $("dF").files[0],
        k = $("dK").value;
      if (!f) return merr("Choose a file.");
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type))
        return merr("Choose a JPG, PNG, WEBP or PDF file.");
      if (f.size > (f.type === "application/pdf" ? 5 : 25) * 1024 * 1024)
        return merr(
          "That file is too large (PDF up to 5 MB, pictures up to 25 MB).",
        );
      $("mOk").disabled = true;
      $("mOk").textContent = "Uploading...";
      upload(w.id, k, f).then(
        function (m) {
          prof(w.id).files = Object.assign({}, prof(w.id).files);
          prof(w.id).files[k] = m;
          saveP();
          closeM();
          toast("Document uploaded");
          detail(w.id);
        },
        function (e) {
          $("mOk").disabled = false;
          $("mOk").textContent = "Upload";
          merr(e.message);
        },
      );
    };
  }
  function assignModal(w) {
    var c = cur(w.id),
      rt = routes(),
      vh = GA.vehicles().filter(function (v) {
        return v.active !== false;
      });
    modal(
      '<h2>Edit route assignment</h2><label class="wk-lbl" for="aR">Assigned route</label>' +
        sel(
          "aR",
          [["", "Select route"]].concat(
            rt.map(function (x) {
              return [x.name];
            }),
          ),
          c ? c.route : "",
        ) +
        '<label class="wk-lbl" for="aV">Vehicle <i>(optional)</i></label>' +
        sel(
          "aV",
          [["", "None"]].concat(
            vh.map(function (v) {
              var l = v.number + (v.type ? " (" + v.type + ")" : "");
              return [l];
            }),
          ),
          c ? c.vehicle : "",
        ) +
        fgm("Effective from", "aD", GA.today(), 'type="date"') +
        btns("Save assignment"),
    );
    $("mNo").onclick = closeM;
    $("mOk").onclick = function () {
      var r = $("aR").value,
        v = $("aV").value,
        d = $("aD").value;
      if (!r) return merr("Choose a route.");
      if (!d) return merr("Choose the effective date.");
      var a = prof(w.id).assign || [];
      if (c && d <= c.from)
        return merr(
          "The date must be after " +
            dshort(c.from) +
            " (when the current assignment started).",
        );
      if (c && c.route === r && (c.vehicle || "") === v)
        return merr("Nothing changed.");
      if (c) c.to = addDays(d, -1);
      a.push({ route: r, vehicle: v, from: d, to: null });
      prof(w.id).assign = a;
      saveP();
      closeM();
      toast("Assignment saved");
      detail(w.id);
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
  // Entrance animation plays only when the page/screen changes (first load, hash change), not on every re-render (search, filters, sync)
  var enter = true;
  function route() {
    var a = location.hash.replace(/^#\/?/, "").split("/");
    closeM();
    if (enter) {
      enter = false;
      pg.classList.add("wk-anim");
      clearTimeout(route.t);
      route.t = setTimeout(function () {
        pg.classList.remove("wk-anim");
      }, 1100);
    }
    // Top bar: title + a Back button beside it (same look as the Vehicle details page).
    if (a[0] === "add") topbar("Add employee", ["#", "Employees"]);
    else if (a[0] === "edit" && a[1])
      topbar("Edit employee", ["#w/" + a[1], "Employee details"]);
    else if (a[0] === "w" && a[1])
      topbar("Employee details", ["#", "Employees"]);
    else topbar("Employees", null);
    if (a[0] === "add") form(null);
    else if (a[0] === "edit" && a[1]) form(decodeURIComponent(a[1]));
    else if (a[0] === "w" && a[1]) detail(decodeURIComponent(a[1]));
    else list();
  }
  window.addEventListener("hashchange", function () {
    enter = true;
    route();
    window.scrollTo(0, 0);
  });
  loadP();
  ensureCodes();
  pg.innerHTML = '<div class="wk-empty">Loading employees...</div>';
  loadRecs().then(function () {
    route();
  });
  window.addEventListener("gm-sync", function () {
    if (!$("wkM") && !F) {
      loadP();
      ensureCodes();
      route();
    }
  });
})();
