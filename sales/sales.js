/* General Traders - Sales panel shell (menu, header, sign-out, price list loading).
   A Sales person only ever gets: their own name, and the price list (name, code, unit, price, MRP, GST). Nothing is copied into
   this browser's storage; the list is loaded fresh from the server each time. */
(function () {
  var S = (window.Sales = {});
  // Icons are drawn in assets/icons.js and picked here by name
  S.ic = function (n) {
    return GMIcons.svg(n);
  };
  // Page buttons (Prev 1 2 3 ... Next) inside el. Hidden when everything fits on one page.
  S.pager = function (el, total, page, per, go) {
    var pages = Math.max(1, Math.ceil(total / per));
    if (pages <= 1) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    var list = [];
    for (var i = 1; i <= pages; i++)
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i);
      else if (list[list.length - 1] !== "...") list.push("...");
    function b(label, p, cls, off) {
      return (
        '<button type="button" class="pg ' +
        (cls || "") +
        '"' +
        (off ? " disabled" : ' data-p="' + p + '"') +
        ">" +
        label +
        "</button>"
      );
    }
    el.hidden = false;
    el.innerHTML =
      b(S.ic("chevron-left"), page - 1, "", page <= 1) +
      list
        .map(function (x) {
          return x === "..."
            ? '<span class="pgdots">…</span>'
            : b(x, x, x === page ? "on" : "");
        })
        .join("") +
      b(S.ic("chevron-right"), page + 1, "", page >= pages);
    [].forEach.call(el.querySelectorAll("button[data-p]"), function (btn) {
      btn.onclick = function () {
        go(+btn.getAttribute("data-p"));
      };
    });
  };
  S.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  };
  S.rupee = function (n) {
    n = Number(n);
    return n > 0
      ? "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : "-";
  };

  // Products sold by the kilo are typed in grams (500 = half a kilo); the order keeps the quantity in kilos.
  S.isKg = function (p) {
    return !!p && /^kgs?$/i.test(String(p.unit || "").trim());
  };
  // kilo products show as typed ("0.5 Kg", "1.1 Kg"); other units show the plain number
  S.qty = function (i) {
    var q = Number(i && i.qty) || 0;
    if (!S.isKg(i)) return String(q);
    return +q.toFixed(3) + " Kg";
  };
  S.money = function (n) {
    return (
      "₹" +
      (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })
    );
  };
  // today's date in India (yyyy-mm-dd), so the day changes at midnight there whatever the phone's clock zone is
  S.today = function () {
    return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  };
  S.time = function (t) {
    return new Date(t).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  };
  S.dateLabel = function (d) {
    var p = String(d).split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString(
      "en-IN",
      {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      },
    );
  };
  S.toast = function (msg, bad) {
    var t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.classList.add("out");
      setTimeout(function () {
        t.remove();
      }, 300);
    }, 2600);
  };
  S.init = function (n) {
    var p = String(n || "?")
      .trim()
      .split(/\s+/);
    return (
      (p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")
    ).toUpperCase();
  };
  S.navLink = function (c) {
    if (c && c.lat && c.lng)
      return (
        "https://www.google.com/maps/dir/?api=1&destination=" +
        c.lat +
        "," +
        c.lng
      );
    return c && c.address
      ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(c.address)
      : "";
  };
  // Same-origin calls to the Sales server API. A signed-out answer sends the person to the login page.
  S.api = function (url, data) {
    var o = { cache: "no-store" };
    if (data) {
      o.method = "POST";
      o.headers = { "Content-Type": "application/json" };
      o.body = JSON.stringify(data);
    }
    return fetch(url, o).then(function (r) {
      if (r.status === 401) {
        toLogin();
        throw new Error("signed out");
      }
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status);
        return j;
      });
    });
  };
  // Stock label for a product: p.stock is a number when stock is tracked, otherwise null (nothing to show).
  S.stockHtml = function (p) {
    if (!p || p.stock == null) return "";
    return p.stock <= 0
      ? '<span class="stk out">Out of stock</span>'
      : '<span class="stk">' +
          p.stock.toLocaleString("en-IN") +
          (p.unit ? " " + S.esc(p.unit) : "") +
          (p.boxQty && p.stock >= p.boxQty
            ? " (" + Math.floor(p.stock / p.boxQty) + " box)"
            : "") +
          " in stock</span>";
  };
  S.watch = function (id, on) {
    return S.api("/api/sales/watch", { id: id, on: on });
  };
  // The phone's position (needed to mark a visit or place an order near the shop).
  S.locate = function () {
    return new Promise(function (ok, no) {
      if (!navigator.geolocation)
        return no(new Error("This phone cannot share its location."));
      navigator.geolocation.getCurrentPosition(
        function (p) {
          ok({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            acc: Math.round(p.coords.accuracy || 0),
          });
        },
        function (e) {
          no(
            new Error(
              e && e.code === 1
                ? "Location is blocked. Allow location for this page in your browser settings, then try again."
                : e && e.code === 3
                  ? "Could not get your location in time. Try again outside the shop."
                  : "Could not get your location. Turn on GPS and try again.",
            ),
          );
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  };
  // Best-effort position for the admin's "where it happened": never blocks. Gives {} if the phone does not share it in a few seconds.
  S.locateSoft = function () {
    return new Promise(function (ok) {
      var done = false;
      function fin(v) {
        if (!done) {
          done = true;
          ok(v);
        }
      }
      setTimeout(function () {
        fin({ err: "timeout" });
      }, 6000);
      if (!navigator.geolocation) return fin({ err: "unsupported" });
      navigator.geolocation.getCurrentPosition(
        function (p) {
          fin({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            acc: Math.round(p.coords.accuracy || 0),
          });
        },
        function (e) {
          // why no position, so the office can see the reason
          fin({
            err:
              e && e.code === 1
                ? "denied"
                : e && e.code === 3
                  ? "timeout"
                  : "unavailable",
          });
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
      );
    });
  };
  var REASONS = [
    "Shop closed",
    "Not interested",
    "Out of stock with customer",
    "Will order next time",
    "Customer not available",
    "Other",
  ];
  // "Mark visited, no order": asks the reason and saves. The phone's position is recorded for the admin when it is shared.
  S.visitSheet = function (shop, done) {
    var bg = document.createElement("div");
    bg.className = "sheet-bg on";
    bg.innerHTML =
      '<div class="sheet" role="dialog" aria-label="Mark as visited"><h3>Mark as Visited (No Order)</h3><p class="note" style="padding:0 8px 8px">' +
      S.esc(shop.name) +
      '. You must be at the shop. Your location is saved with this visit and the office is told.</p><div class="rsn" id="rsn"><b>Reason for no order <em style="color:var(--red)">*</em></b>' +
      REASONS.map(function (r, i) {
        return (
          '<label><input type="radio" name="rs" value="' +
          S.esc(r) +
          '"> ' +
          S.esc(r) +
          "</label>"
        );
      }).join("") +
      '</div><label class="note" for="vn" style="display:block;padding:10px 8px 4px">Notes (optional, needed for Other)</label><textarea class="notes" id="vn" maxlength="300" placeholder="Add notes…"></textarea>' +
      '<div class="verr" id="verr" role="alert"></div><div class="rowh" style="padding-top:10px"><button class="btn line grow" id="vc" type="button">Cancel</button><button class="btn teal grow" id="vg" type="button">' +
      S.ic("check") +
      "Mark as Visited</button></div></div>";
    document.body.appendChild(bg);
    function close() {
      bg.remove();
    }
    bg.onclick = function (e) {
      if (e.target === bg) close();
    };
    bg.querySelector("#vc").onclick = close;
    var go = bg.querySelector("#vg"),
      err = bg.querySelector("#verr");
    go.onclick = function () {
      var r = bg.querySelector('input[name="rs"]:checked'),
        note = bg.querySelector("#vn").value.trim();
      err.textContent = "";
      if (!r) return (err.textContent = "Choose the reason for no order.");
      if (r.value === "Other" && note.length < 3)
        return (err.textContent = "Write a short note for Other.");
      go.disabled = true;
      go.textContent = "Saving…";
      S.locateSoft()
        .then(function (loc) {
          return S.api("/api/sales/visit", {
            code: shop.code,
            status: "no_order",
            reason: r.value,
            note: note,
            lat: loc.lat,
            lng: loc.lng,
            acc: loc.acc,
            lerr: loc.err,
          });
        })
        .then(function (j) {
          close();
          S.toast("Marked visited. The office has been told.");
          if (done) done(j);
        })
        .catch(function (e) {
          go.disabled = false;
          go.innerHTML = S.ic("check") + "Mark as Visited";
          err.textContent = e.message || "Could not save. Try again.";
        });
    };
  };
  var CANCEL_WHY = [
    "Wrong shop",
    "Wrong items or quantity",
    "Wrong price",
    "Customer changed mind",
    "Other",
  ];
  // Cancel a placed order (allowed for a short time after placing it). done(order) is called after it is cancelled.
  S.cancelSheet = function (o, done) {
    var bg = document.createElement("div");
    bg.className = "sheet-bg on";
    bg.innerHTML =
      '<div class="sheet" role="dialog" aria-label="Cancel order"><h3>Cancel order #' +
      S.esc(o.id) +
      '?</h3><p class="note" style="padding:0 8px 8px">' +
      S.esc(o.shop) +
      ". The order stays in your list as Cancelled and the office is told.</p>" +
      '<div class="rsn"><b>Why? <em style="color:var(--red)">*</em></b>' +
      CANCEL_WHY.map(function (r) {
        return (
          '<label><input type="radio" name="cw" value="' +
          S.esc(r) +
          '"> ' +
          S.esc(r) +
          "</label>"
        );
      }).join("") +
      '</div><label class="note" for="cn" style="display:block;padding:10px 8px 4px">Notes (needed for Other)</label><textarea class="notes" id="cn" maxlength="300"></textarea>' +
      '<div class="verr" id="cerr" role="alert"></div><div class="rowh" style="padding-top:10px"><button class="btn line grow" id="cx" type="button">Keep order</button><button class="btn grow" id="cg" type="button" style="background:var(--red)">Cancel order</button></div></div>';
    document.body.appendChild(bg);
    function close() {
      bg.remove();
    }
    bg.onclick = function (e) {
      if (e.target === bg) close();
    };
    bg.querySelector("#cx").onclick = close;
    var go = bg.querySelector("#cg"),
      err = bg.querySelector("#cerr");
    go.onclick = function () {
      var r = bg.querySelector('input[name="cw"]:checked'),
        note = bg.querySelector("#cn").value.trim();
      err.textContent = "";
      if (!r) return (err.textContent = "Choose why you are cancelling.");
      if (r.value === "Other" && note.length < 3)
        return (err.textContent = "Write a short note for Other.");
      go.disabled = true;
      S.api("/api/sales/cancel", {
        id: o.id,
        reason: r.value + (note ? ": " + note : ""),
      })
        .then(function (j) {
          close();
          S.toast("Order cancelled. The office has been told.");
          if (done) done(j.order);
        })
        .catch(function (e) {
          go.disabled = false;
          err.textContent = e.message;
        });
    };
  };
  // Where the back arrow on a shop goes: today's Route page when a route is selected for today, otherwise My Customers.
  // m = the result of S.mine(), d = the result of S.data() (used to ignore a route that no longer exists).
  S.from = function () {
    var f = new URLSearchParams(location.search).get("from");
    return f === "route" || f === "customers" ? f : "";
  };
  S.fromQ = function () {
    var f = S.from();
    return f ? "&from=" + f : "";
  };
  S.backTo = function (m, d) {
    var f = S.from();
    if (f === "route") return { href: "route.html", label: "Route" };
    if (f === "customers") return { href: "customers.html", label: "Customers" };
    var ok =
      m &&
      m.route &&
      m.date === m.today &&
      (!d ||
        !d.routes ||
        d.routes.some(function (x) {
          return x.id === m.route;
        }));
    return ok
      ? { href: "route.html", label: "Route" }
      : { href: "customers.html", label: "Customers" };
  };
  S.mine = function (date) {
    return S.api(
      "/api/sales/mine" + (date ? "?date=" + encodeURIComponent(date) : ""),
    );
  };

  // light / dark: same saved choice ("gt-theme") the rest of the app uses
  function theme() {
    var t = null;
    try {
      t = localStorage.getItem("gt-theme");
    } catch (e) {}
    if (t !== "dark" && t !== "light")
      t =
        window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    return t;
  }
  document.documentElement.setAttribute("data-theme", theme());
  function flip() {
    var t =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("gt-theme", t);
    } catch (e) {}
    var b = document.getElementById("themeBtn");
    if (b) b.innerHTML = S.ic(t === "dark" ? "sun" : "moon");
  }

  var NAV = [
    ["home", "Home", "home.html", "home"],
    ["customers", "My Customers", "customers.html", "users"],
    ["orders", "Orders", "orders.html", "clipboard-list"],
    ["products", "Products", "products.html", "box"],
    ["payments", "Payments", "", "credit-card"],
    ["route", "My Route", "route.html", "route"],
    ["attendance", "Attendance", "", "clock"],
    ["reports", "Reports", "", "chart"],
  ];
  // phone bottom bar; everything else is under "More"
  var BN = [
    ["home", "Home", "home.html", "home"],
    ["customers", "Customers", "customers.html", "users"],
    ["orders", "Orders", "orders.html", "clipboard-list"],
    ["route", "Route", "route.html", "route"],
  ];
  // pages that sit under a menu item (the shop page and the order page belong to My Customers)
  var PARENT = { shop: "customers", order: "customers" };
  function initials(n) {
    var p = String(n || "?")
      .trim()
      .split(/\s+/);
    return (
      (p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")
    ).toUpperCase();
  }
  S.logout = function () {
    fetch("/api/logout", { method: "POST" }).then(go, go);
    function go() {
      location.replace("../login.html");
    }
  };
  function toLogin() {
    location.replace("../login.html");
  }
  S.json = function (url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        toLogin();
        throw new Error("signed out");
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  };
  // One load gives the price list, the shops and the routes: {products:[{id, code, name, alias, category, unit, price, mrp, tax}],
  // customers:[{code, name, address, phone, area, lat, lng, gstin}], routes:[{id, name, codes}]}
  var _data = null;
  S.data = function () {
    if (!_data) {
      _data = S.json("/api/state?since=0").then(function (j) {
        var it = (j && j.items) || {};
        function read(k) {
          try {
            return JSON.parse((it[k] && it[k].v) || "null");
          } catch (e) {
            return null;
          }
        }
        var P = read("gm_admin_products_v1"),
          A = read("gm_admin_v1") || {};
        return {
          products: Array.isArray(P) ? P : [],
          customers: Array.isArray(A.customers) ? A.customers : [],
          routes: Array.isArray(A.routes) ? A.routes : [],
        };
      });
      _data.catch(function () {
        _data = null;
      });
    }
    return _data;
  };
  S.products = function () {
    return S.data().then(function (d) {
      return d.products;
    });
  };

  /* S.start(page, build): checks the sign-in, draws the menu and header, then calls build(user, titleEl, mainEl). */
  S.start = function (page, build) {
    S.json("/api/me")
      .then(function (me) {
        if (!me || !me.ok || me.role !== "sales" || me.must) return toLogin();
        draw(me, page, build);
      })
      .catch(function () {
        /* offline or signed out: S.json already redirected when signed out */
        var m = document.getElementById("app");
        if (m && !m.children.length)
          m.innerHTML =
            '<div class="page"><div class="card empty"><b>Could not reach the server</b><span>Check your connection and refresh.</span></div></div>';
      });
  };
  function draw(me, page, build) {
    var name = me.name || "Sales",
      ini = initials(name);
    var menu = NAV.map(function (n) {
      var on = n[0] === (PARENT[page] || page),
        inner = S.ic(n[3]) + "<span>" + n[1] + "</span>";
      return n[2]
        ? '<a class="mi' +
            (on ? " on" : "") +
            '" href="' +
            n[2] +
            '"' +
            (on ? ' aria-current="page"' : "") +
            ">" +
            inner +
            "</a>"
        : '<span class="mi soon" aria-disabled="true">' +
            inner +
            '<span class="tag">Soon</span></span>';
    }).join("");
    var more = NAV.filter(function (n) {
      return !BN.some(function (b) {
        return b[0] === n[0];
      });
    })
      .map(function (n) {
        var inner = S.ic(n[3]) + "<span>" + n[1] + "</span>";
        return n[2]
          ? '<a class="mi' +
              (n[0] === page ? " on" : "") +
              '" href="' +
              n[2] +
              '">' +
              inner +
              "</a>"
          : '<span class="mi soon">' +
              inner +
              '<span class="tag">Soon</span></span>';
      })
      .join("");
    var t = document.documentElement.getAttribute("data-theme");
    document.getElementById("app").innerHTML =
      '<div class="shell">' +
      '<aside class="side"><div class="brand"><div class="logo"><img src="../assets/icon-192.png" alt="General Traders" /></div><div><b>General Traders</b><small>Sales Panel</small></div></div>' +
      '<nav class="menu" aria-label="Sales menu">' +
      menu +
      "</nav>" +
      '<div class="me"><div class="av">' +
      S.esc(ini) +
      "</div><div><b>" +
      S.esc(name) +
      "</b><small>Sales Person</small></div></div>" +
      '<button class="out" type="button" id="outBtn">' +
      S.ic("logout") +
      "<span>Logout</span></button></aside>" +
      '<div class="content"><header class="top"><div class="logo"><img src="../assets/icon-192.png" alt="General Traders" /></div><div class="hello" id="hello"></div>' +
      '<button class="ibtn" id="themeBtn" type="button" aria-label="Switch light or dark">' +
      S.ic(t === "dark" ? "sun" : "moon") +
      "</button>" +
      '<div class="av" aria-hidden="true">' +
      S.esc(ini) +
      "</div></header>" +
      '<main class="page" id="main"></main></div>' +
      '<nav class="bnav" aria-label="Sales menu">' +
      BN.map(function (n) {
        return (
          '<a href="' +
          n[2] +
          '" class="' +
          (n[0] === (PARENT[page] || page) ? "on" : "") +
          '">' +
          S.ic(n[3]) +
          "<span>" +
          n[1] +
          "</span></a>"
        );
      }).join("") +
      '<button type="button" id="moreBtn">' +
      S.ic("dots-horizontal") +
      "<span>More</span></button></nav>" +
      '<div class="sheet-bg" id="sheetBg"><div class="sheet" role="dialog" aria-label="More"><h3>More</h3>' +
      more +
      '<button class="out" type="button" id="outBtn2">' +
      S.ic("logout") +
      "<span>Logout</span></button></div></div></div>";
    document.getElementById("themeBtn").onclick = flip;
    document.getElementById("outBtn").onclick = S.logout;
    document.getElementById("outBtn2").onclick = S.logout;
    var bg = document.getElementById("sheetBg");
    document.getElementById("moreBtn").onclick = function () {
      bg.classList.add("on");
    };
    bg.onclick = function (e) {
      if (e.target === bg) bg.classList.remove("on");
    };
    build(
      me,
      document.getElementById("hello"),
      document.getElementById("main"),
    );
  }
})();