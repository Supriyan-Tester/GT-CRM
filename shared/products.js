/* General Traders - Products module (list + add/edit wizard). Loads after admin.js and plan-core.js. */
(function () {
  var KEY = "gm_admin_products_v1",
    PR = (window.PR = {}),
    esc = function (s) {
      return GA.esc(s);
    };
  PR.KEY = KEY;
  PR.UNITS = [
    "g",
    "kg",
    "ml",
    "l",
    "pcs",
    "box",
    "packet",
    "bottle",
    "jar",
    "tin",
  ];
  PR.TAX = ["0", "5", "12", "18", "28"];
  PR.MAXIMG = 4;
  PR.rupee = function (n) {
    return n
      ? "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : "-";
  };
  PR.num = function (n) {
    return Number(n || 0).toLocaleString("en-IN");
  };
  PR.load = function () {
    var l = [];
    try {
      l = JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) {}
    return Array.isArray(l) ? l : [];
  };
  PR.uid = function () {
    return (
      "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    );
  };
  PR.isOn = function (p) {
    return p.active !== false;
  };
  PR.nk = function (s) {
    return String(s || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  };
  PR.nextCode = function (L) {
    var m = 0;
    L.forEach(function (p) {
      var x = /^P(\d+)$/i.exec(p.code);
      if (x) m = Math.max(m, +x[1]);
    });
    return "P" + String(m + 1).padStart(4, "0");
  };
  PR.cats = function (L) {
    var s = {};
    L.forEach(function (p) {
      if (p.category) s[p.category] = 1;
    });
    return Object.keys(s).sort(function (a, b) {
      return a.localeCompare(b);
    });
  };
  PR.subs = function (L, cat) {
    var s = {};
    L.forEach(function (p) {
      if (p.sub && (!cat || p.category === cat)) s[p.sub] = 1;
    });
    return Object.keys(s).sort();
  };
  PR.brands = function (L) {
    var s = {};
    L.forEach(function (p) {
      if (p.brand) s[p.brand] = 1;
    });
    return Object.keys(s).sort();
  };
  PR.low = function (p) {
    return !!(
      p.track &&
      p.stock !== "" &&
      p.stock != null &&
      p.low !== "" &&
      p.low != null &&
      Number(p.stock) <= Number(p.low)
    );
  };
  PR.qs = function (k) {
    try {
      return new URLSearchParams(location.search).get(k) || "";
    } catch (e) {
      return "";
    }
  };

  /* Saves the list and resolves only when the server has answered (same rule as plans and vehicles). */
  PR.save = function (list) {
    return new Promise(function (resolve) {
      var done = false,
        t;
      function fin(r) {
        if (done) return;
        done = true;
        clearTimeout(t);
        window.removeEventListener("gm-sync-saved", ok);
        window.removeEventListener("gm-sync-failed", bad);
        window.removeEventListener("gm-sync-rejected", rej);
        resolve(r);
      }
      function ok(e) {
        if (e.detail && e.detail.key === KEY)
          fin({ ok: true, server: "saved" });
      }
      function bad(e) {
        if (e.detail && e.detail.key === KEY)
          fin({ ok: true, server: "failed" });
      }
      function rej(e) {
        if (e.detail && e.detail.key === KEY)
          fin({
            ok: false,
            error: e.detail.error || "The server rejected this change.",
          });
      }
      window.addEventListener("gm-sync-saved", ok);
      window.addEventListener("gm-sync-failed", bad);
      window.addEventListener("gm-sync-rejected", rej);
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
        if (localStorage.getItem(KEY) !== JSON.stringify(list))
          throw new Error("x");
      } catch (e) {
        fin({
          ok: false,
          error: "Could not save. The browser storage is full.",
        });
        return;
      }
      t = setTimeout(function () {
        fin({ ok: true, server: "pending" });
      }, 8000);
    });
  };

  /* ---------- derived values ---------- */
  function nn(v) {
    return v === "" || v == null || isNaN(Number(v)) ? null : Number(v);
  }
  // Margin is worked out from the two prices, never stored. Percent is on cost (price 36, cost 32 -> 12.5%), the way the item list shows it.
  PR.margin = function (p) {
    var pr = nn(p.price),
      c = nn(p.cost);
    if (!pr || c == null || c <= 0) return null;
    return {
      amt: Math.round((pr - c) * 100) / 100,
      pct: Math.round(((pr - c) / c) * 1000) / 10,
    };
  };
  PR.LOWM = 5;
  PR.taxLabel = function (p) {
    return p.tax === "" || p.tax == null
      ? ""
      : String(p.tax) === "0"
        ? "Exempt"
        : p.tax + "%";
  };
  // Fast / slow moving from the Avg Sales numbers: top fifth = fast, bottom fifth of those that sell = slow.
  PR.speedMap = function (L) {
    var v = L.map(function (p) {
        return nn(p.avg);
      })
        .filter(function (x) {
          return x != null && x > 0;
        })
        .sort(function (a, b) {
          return a - b;
        }),
      hi = v[Math.floor(v.length * 0.8)],
      lo = v[Math.floor(v.length * 0.2)];
    return function (p) {
      var a = nn(p.avg);
      if (a == null || !v.length) return "";
      if (a >= hi && v.length >= 5) return "fast";
      if (a <= lo && v.length >= 5) return "slow";
      return "";
    };
  };
  PR.packText = function (p) {
    var r = nn(p.ratio);
    return p.subUnit && r && r > 0 && p.subUnit !== p.unit
      ? "1 " + p.unit + " = " + r + " " + p.subUnit
      : "";
  };

  /* ---------- pictures (server: /api/pfile) ---------- */
  PR.imgUrl = function (p, im) {
    return (
      "/api/pfile?p=" +
      encodeURIComponent(p.id) +
      "&i=" +
      im.i +
      "&t=" +
      (im.at || 0)
    );
  };
  PR.thumb = function (p, cls) {
    var im = p && p.id && p.imgs && p.imgs[0];
    return (
      '<span class="pr-th ' +
      (cls || "") +
      '">' +
      (im
        ? '<img src="' + PR.imgUrl(p, im) + '" alt="" loading="lazy">'
        : '<span class="pr-th-i">' + GA.icon("box") + "</span>") +
      "</span>"
    );
  };
  PR.checkImg = function (f) {
    if (!f) return "Choose a picture.";
    if (!(
      /^image\/(jpeg|png|webp)$/.test(f.type) ||
      /\.(jpe?g|png|webp)$/i.test(f.name)
    ))
      return "Choose a JPG, PNG or WEBP picture.";
    if (f.size > 25 * 1024 * 1024) return "That picture is larger than 25 MB.";
    return "";
  };
  PR.upload = function (pid, slot, file) {
    return new Promise(function (resolve, reject) {
      var fr = {};
      fr.onerror = function () {
        reject(new Error("Could not read that picture."));
      };
      fr.onload = function () {
        fetch("/api/pfile?p=" + encodeURIComponent(pid) + "&i=" + slot, {
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
          .then(function (j) {
            resolve({ i: slot, name: file.name, size: j.size, at: j.at });
          })
          .catch(function (e) {
            reject(
              e && e.message
                ? e
                : new Error("The server could not be reached."),
            );
          });
      };
      GMImg.read(file, 1600).then(
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
  };
  PR.dropImg = function (pid, slot) {
    return fetch("/api/pfile?p=" + encodeURIComponent(pid) + "&i=" + slot, {
      method: "DELETE",
    }).then(function (r) {
      if (!r.ok) throw new Error("The server could not remove the picture.");
    });
  };
  PR.dropAll = function (p) {
    return Promise.all(
      (p.imgs || []).map(function (im) {
        return PR.dropImg(p.id, im.i).catch(function () {});
      }),
    );
  };

  /* ---------- checks (same rules in the list import and the wizard) ---------- */
  function n(v) {
    return v === "" || v == null ? NaN : Number(String(v).replace(/,/g, ""));
  }
  PR.check = function (d, L, self, step) {
    var e = {},
      o;
    // "Is this row the product being edited?" PR.load() builds new objects on every call, so comparing objects (x !== self) never matched
    // and an edited product was reported as a duplicate of itself. Compare the product's id (or code) instead.
    function isSelf(x) {
      return (
        !!self &&
        (x === self ||
          (x.id && self.id ? x.id === self.id : x.code === self.code))
      );
    }
    if (step == null || step === 0) {
      if (!String(d.code || "").trim()) e.code = "Enter a product code.";
      else if (
        (o = L.filter(function (x) {
          return (
            !isSelf(x) &&
            String(x.code).toUpperCase() === String(d.code).trim().toUpperCase()
          );
        })[0])
      )
        e.code = "This code is already used by " + o.name + ".";
      if (!String(d.name || "").trim()) e.name = "Enter the product name.";
      else if (
        (o = L.filter(function (x) {
          return !isSelf(x) && PR.nk(x.name) === PR.nk(d.name);
        })[0])
      )
        e.name = "A product with this name already exists (" + o.code + ").";
      if (!String(d.category || "").trim())
        e.category = "Choose or type a category.";
      if (!String(d.unit || "").trim()) e.unit = "Choose or type a unit.";
    }
    if (step == null || step === 1) {
      if (
        d.price === "" ||
        d.price == null ||
        isNaN(n(d.price)) ||
        n(d.price) <= 0
      )
        e.price = "Enter the selling price (more than 0).";
      if (
        d.cost !== "" &&
        d.cost != null &&
        (isNaN(n(d.cost)) || n(d.cost) < 0)
      )
        e.cost = "Purchase price must be a number.";
      if (d.mrp !== "" && d.mrp != null && (isNaN(n(d.mrp)) || n(d.mrp) < 0))
        e.mrp = "MRP must be a number.";
      if (
        d.ratio !== "" &&
        d.ratio != null &&
        (isNaN(n(d.ratio)) || n(d.ratio) <= 0)
      )
        e.ratio = "Pack ratio must be more than 0.";
      ["openQty", "openVal", "avg"].forEach(function (k) {
        if (d[k] !== "" && d[k] != null && (isNaN(n(d[k])) || n(d[k]) < 0))
          e[k] = "Must be 0 or more.";
      });
      if (d.track) {
        if (
          d.stock !== "" &&
          d.stock != null &&
          (isNaN(n(d.stock)) || n(d.stock) < 0)
        )
          e.stock = "Stock must be 0 or more.";
        if (d.low !== "" && d.low != null && (isNaN(n(d.low)) || n(d.low) < 0))
          e.low = "Alert level must be 0 or more.";
      }
    }
    if (step == null || step === 2) {
      if (d.hsn && !/^\d{4,8}$/.test(String(d.hsn).trim()))
        e.hsn = "HSN code is 4 to 8 digits.";
      if (d.barcode && !/^[A-Za-z0-9\-]{4,20}$/.test(String(d.barcode).trim()))
        e.barcode = "Barcode is 4 to 20 letters or digits.";
      if (
        d.expMonths !== "" &&
        d.expMonths != null &&
        (isNaN(n(d.expMonths)) || n(d.expMonths) < 1 || n(d.expMonths) > 120)
      )
        e.expMonths = "Enter months from 1 to 120.";
      if (
        d.weight !== "" &&
        d.weight != null &&
        (isNaN(n(d.weight)) || n(d.weight) < 0)
      )
        e.weight = "Weight must be a number.";
    }
    return e;
  };
  PR.loss = function (d) {
    return (
      d.cost !== "" &&
      d.cost != null &&
      n(d.cost) > n(d.price) &&
      n(d.price) > 0
    );
  };
  PR.hasErr = function (e) {
    return Object.keys(e).length > 0;
  };
})();
