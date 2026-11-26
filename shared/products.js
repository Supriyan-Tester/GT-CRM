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
      '"' +
      (im ? ' data-zoom="' + esc(p.id) + '" title="Click to enlarge"' : "") +
      ">" +
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
      if (
        d.boxQty !== "" &&
        d.boxQty != null &&
        (isNaN(n(d.boxQty)) || n(d.boxQty) < 1 || n(d.boxQty) % 1)
      )
        e.boxQty = "Pieces per box must be a whole number, 1 or more.";
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

  /* ---------- crop a picture before it is added ---------- */
  (function () {
    var css = document.createElement("style");
    css.textContent =
      ".pr-th[data-zoom]{cursor:zoom-in}" +
      ".pz-bd{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".pz-bd img{max-width:92vw;max-height:86vh;object-fit:contain;border-radius:10px;background:#fff}" +
      ".pz-x,.pz-nv{position:absolute;border:0;border-radius:50%;width:42px;height:42px;background:rgba(255,255,255,.9);color:#111;font:700 22px/1 system-ui;cursor:pointer}" +
      ".pz-x{top:14px;right:14px}.pz-nv.l{left:14px}.pz-nv.r{right:14px}" +
      ".pc-bd{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px}" +
      ".pc-box{background:var(--card,#fff);color:var(--text,#111);border-radius:14px;max-width:96vw;width:640px;max-height:96vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}" +
      ".pc-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line,#e6eaf0)}" +
      ".pc-h b{margin-right:auto;font-size:16px}" +
      ".pc-h button,.pc-f button{border:1px solid var(--line,#d5dbe3);background:transparent;color:inherit;border-radius:8px;padding:7px 12px;font:600 13px system-ui;cursor:pointer}" +
      ".pc-h button.on{background:var(--primary,#0f766e);border-color:var(--primary,#0f766e);color:#fff}" +
      ".pc-s{padding:14px;display:flex;justify-content:center;align-items:center;overflow:auto;background:rgba(0,0,0,.06)}" +
      ".pc-w{position:relative;line-height:0;touch-action:none;user-select:none}" +
      ".pc-w img{display:block;max-width:100%;max-height:60vh;-webkit-user-drag:none}" +
      ".pc-c{position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;touch-action:none}" +
      ".pc-c i{position:absolute;width:22px;height:22px;background:#fff;border:2px solid var(--primary,#0f766e);border-radius:50%;touch-action:none}" +
      ".pc-c i.nw{left:-11px;top:-11px;cursor:nwse-resize}.pc-c i.ne{right:-11px;top:-11px;cursor:nesw-resize}" +
      ".pc-c i.sw{left:-11px;bottom:-11px;cursor:nesw-resize}.pc-c i.se{right:-11px;bottom:-11px;cursor:nwse-resize}" +
      ".pc-f{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--line,#e6eaf0)}" +
      ".pc-f button.go{background:var(--primary,#0f766e);border-color:var(--primary,#0f766e);color:#fff}";
    document.head.appendChild(css);
  })();

  // Opens a crop window. Resolves with the cropped File, the original File ("Use original"), or null (Cancel).
  PR.crop = function (file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file),
        im = new Image(),
        bd,
        done = false;
      function finish(v) {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey);
        if (bd) bd.remove();
        URL.revokeObjectURL(url);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape") finish(null);
      }
      im.onerror = function () {
        finish(file); // cannot preview it: add as it is
      };
      im.onload = function () {
        bd = document.createElement("div");
        bd.className = "pc-bd";
        bd.innerHTML =
          '<div class="pc-box" role="dialog" aria-label="Crop image"><div class="pc-h"><b>Crop image</b>' +
          '<button type="button" data-a="1:1" class="on">Square</button><button type="button" data-a="4:3">4:3</button><button type="button" data-a="3:4">3:4</button><button type="button" data-a="0">Free</button></div>' +
          '<div class="pc-s"><div class="pc-w"><img alt=""><div class="pc-c"><i class="nw" data-h="nw"></i><i class="ne" data-h="ne"></i><i class="sw" data-h="sw"></i><i class="se" data-h="se"></i></div></div></div>' +
          '<div class="pc-f"><button type="button" data-x="cancel">Cancel</button><button type="button" data-x="orig">Use original</button><button type="button" class="go" data-x="ok">Crop &amp; add</button></div></div>';
        document.body.appendChild(bd);
        document.addEventListener("keydown", onKey);
        var img = bd.querySelector("img"),
          wrap = bd.querySelector(".pc-w"),
          box = bd.querySelector(".pc-c"),
          asp = 1,
          R = { x: 0, y: 0, w: 0, h: 0 },
          dw = 0,
          dh = 0;
        img.src = url;
        function paint() {
          box.style.left = R.x + "px";
          box.style.top = R.y + "px";
          box.style.width = R.w + "px";
          box.style.height = R.h + "px";
        }
        function reset() {
          dw = img.clientWidth;
          dh = img.clientHeight;
          var w = dw * 0.9,
            h = dh * 0.9;
          if (asp) {
            if (w / h > asp) w = h * asp;
            else h = w / asp;
          }
          R = { x: (dw - w) / 2, y: (dh - h) / 2, w: w, h: h };
          paint();
        }
        if (img.complete && img.clientWidth) reset();
        else img.onload = reset;
        window.addEventListener("resize", reset);
        bd.addEventListener("click", function (e) {
          if (e.target === bd) return finish(null);
          var a = e.target.closest("[data-a]");
          if (a) {
            [].forEach.call(bd.querySelectorAll("[data-a]"), function (b) {
              b.classList.toggle("on", b === a);
            });
            var p = a.dataset.a.split(":");
            asp = p.length > 1 ? +p[0] / +p[1] : 0;
            reset();
            return;
          }
          var x = e.target.closest("[data-x]");
          if (!x) return;
          if (x.dataset.x === "cancel") finish(null);
          else if (x.dataset.x === "orig") finish(file);
          else out();
        });
        // drag the box to move it, drag a corner to resize it
        var drag = null;
        function pt(e) {
          var r = wrap.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        box.addEventListener("pointerdown", function (e) {
          var h = e.target.dataset && e.target.dataset.h,
            p = pt(e);
          drag = h
            ? {
                h: h,
                ax: h.indexOf("w") > -1 ? R.x + R.w : R.x,
                ay: h.indexOf("n") > -1 ? R.y + R.h : R.y,
                dx: h.indexOf("e") > -1 ? 1 : -1,
                dy: h.indexOf("s") > -1 ? 1 : -1,
              }
            : { m: 1, ox: p.x - R.x, oy: p.y - R.y };
          try {
            box.setPointerCapture(e.pointerId);
          } catch (x) {}
          e.preventDefault();
        });
        box.addEventListener("pointermove", function (e) {
          if (!drag) return;
          var p = pt(e);
          if (drag.m) {
            R.x = Math.max(0, Math.min(dw - R.w, p.x - drag.ox));
            R.y = Math.max(0, Math.min(dh - R.h, p.y - drag.oy));
          } else {
            var maxW = drag.dx > 0 ? dw - drag.ax : drag.ax,
              maxH = drag.dy > 0 ? dh - drag.ay : drag.ay,
              w = Math.max(24, Math.min(maxW, drag.dx * (p.x - drag.ax))),
              h = Math.max(24, Math.min(maxH, drag.dy * (p.y - drag.ay)));
            if (asp) {
              h = w / asp;
              if (h > maxH) {
                h = maxH;
                w = h * asp;
              }
            }
            R.w = w;
            R.h = h;
            R.x = drag.dx > 0 ? drag.ax : drag.ax - w;
            R.y = drag.dy > 0 ? drag.ay : drag.ay - h;
          }
          paint();
        });
        function end() {
          drag = null;
        }
        box.addEventListener("pointerup", end);
        box.addEventListener("pointercancel", end);
        function out() {
          var sx = im.naturalWidth / dw,
            sy = im.naturalHeight / dh,
            cw = Math.round(R.w * sx),
            ch = Math.round(R.h * sy),
            k = Math.min(1, 1600 / Math.max(cw, ch)),
            c = document.createElement("canvas"),
            png = /png$/i.test(file.type) || /\.png$/i.test(file.name);
          c.width = Math.max(1, Math.round(cw * k));
          c.height = Math.max(1, Math.round(ch * k));
          var g = c.getContext("2d");
          if (!png) {
            g.fillStyle = "#fff";
            g.fillRect(0, 0, c.width, c.height);
          }
          g.drawImage(im, R.x * sx, R.y * sy, cw, ch, 0, 0, c.width, c.height);
          c.toBlob(
            function (b) {
              if (!b) return finish(file);
              var base = String(file.name || "picture").replace(/\.[^.]+$/, "");
              finish(
                new File([b], base + (png ? ".png" : ".jpg"), {
                  type: png ? "image/png" : "image/jpeg",
                }),
              );
            },
            png ? "image/png" : "image/jpeg",
            0.92,
          );
        }
      };
      im.src = url;
    });
  };

  /* ---------- click a product picture to see it bigger ---------- */
  PR.zoom = function (p, start) {
    var list = ((p && p.imgs) || []).filter(Boolean),
      n = Math.min(Math.max(0, start || 0), Math.max(0, list.length - 1));
    if (!list.length) return;
    var bd = document.createElement("div");
    bd.className = "pz-bd";
    function show() {
      bd.innerHTML =
        '<img alt="' +
        esc(p.name || "") +
        '" src="' +
        PR.imgUrl(p, list[n]) +
        '"><button type="button" class="pz-x" aria-label="Close">&times;</button>' +
        (list.length > 1
          ? '<button type="button" class="pz-nv l" aria-label="Previous">&lsaquo;</button><button type="button" class="pz-nv r" aria-label="Next">&rsaquo;</button>'
          : "");
    }
    function close() {
      document.removeEventListener("keydown", key, true);
      bd.remove();
    }
    function key(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else if (list.length > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        n = (n + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length;
        show();
      }
    }
    bd.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b && b.classList.contains("pz-nv")) {
        n = (n + (b.classList.contains("r") ? 1 : list.length - 1)) % list.length;
        show();
      } else if (!e.target.closest("img")) close();
    });
    document.addEventListener("keydown", key, true);
    show();
    document.body.appendChild(bd);
  };
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target.closest && e.target.closest(".pr-th[data-zoom]");
      if (!t) return;
      var p = PR.load().filter(function (x) {
        return String(x.id) === t.getAttribute("data-zoom");
      })[0];
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      PR.zoom(p, 0);
    },
    true,
  );

})();