/* General Traders (GM-CRM) - Admin data layer + page shell.
   ALL admin screens read/write through window.GA only. When the backend arrives,
   replace the load()/save() internals and keep the GA function names. */
(function () {
  var WK = "gm_admin_workers_v1",
    SK = "gm_admin_session",
    OLD = "gm_admin_v1";
  // Which modules unlock which page (same table as PAGE_RULES in server.js): '*' anyone, 'full' Admin / Super Admin, 'super' Super Admin only.
  var PAGE_NEEDS = {
    "index.html": "*",
    "profile.html": "*",
    "notifications.html": "*",
    "summary.html": ["sales", "billing", "delivery"],
    "customers.html": ["sales", "billing"],
    "orders.html": ["sales", "billing"],
    "routes.html": ["sales", "delivery"],
    "plan.html": ["delivery"],
    "vehicles.html": ["delivery"],
    "live.html": ["delivery"],
    "problems.html": ["delivery", "helper"],
    "attendance.html": ["helper"],
    "advances.html": ["billing"],
    "products.html": ["inventory", "billing", "sales"],
    "workers.html": "full",
    "activity.html": "full",
    "super.html": "super",
    "users.html": "super",
  };
  var DEF = {
    admins: [{ id: "A1", phone: "8489600833", name: "Bala", role: "Admin" }],
    workers: [],
    leaves: [],
  };

  // Admin accounts: the built-in one, unless it was edited on the Profile page (kept in gm_admin_account_v1, which sync.js shares with the server).
  var AK = "gm_admin_account_v1";
  function admins() {
    try {
      var a = JSON.parse(localStorage.getItem(AK));
      if (Array.isArray(a) && a.length && a[0].phone) return a;
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEF.admins));
  }
  function load() {
    try {
      var r = localStorage.getItem(WK);
      if (r) {
        var d = JSON.parse(r);
        d.admins = admins();
        d.workers.forEach(function (w) {
          if (!w.password && w.pin) {
            w.password = w.pin;
            delete w.pin;
          }
        });
        return d;
      }
    } catch (e) {}
    var f = JSON.parse(JSON.stringify(DEF));
    f.admins = admins();
    return f;
  }
  function save(d) {
    try {
      localStorage.setItem(WK, JSON.stringify(d));
    } catch (e) {}
  }
  var VK = "gm_admin_vehicles_v1";
  function loadV() {
    try {
      var r = JSON.parse(localStorage.getItem(VK));
      if (Array.isArray(r)) return r;
    } catch (e) {}
    return [];
  }
  function saveV(l) {
    try {
      localStorage.setItem(VK, JSON.stringify(l));
    } catch (e) {}
  }
  function checkV(list, v, selfId) {
    if (!v.number || !v.number.trim()) return "Enter the vehicle number.";
    var key = v.number.replace(/\s+/g, "").toUpperCase();
    if (
      list.some(function (x) {
        return x.id !== selfId && x.number.replace(/\s+/g, "") === key;
      })
    )
      return "Another vehicle already has this number.";
    if (v.lastKm !== "" && v.lastKm != null && !(Number(v.lastKm) >= 0))
      return "Last recorded km must be a number.";
    return "";
  }
  var LK = "gm_admin_ledger_v1";
  function loadL() {
    try {
      var r = JSON.parse(localStorage.getItem(LK));
      if (Array.isArray(r)) return r;
    } catch (e) {}
    return [];
  }
  function saveL(l) {
    try {
      localStorage.setItem(LK, JSON.stringify(l));
    } catch (e) {}
  }
  function p(n) {
    return String(n).padStart(2, "0");
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function onLeave(d, id, date) {
    return d.leaves.some(function (l) {
      return l.workerId === id && l.from <= date && date <= l.to;
    });
  }
  function check(d, w, selfId) {
    if (!w.name || !w.name.trim()) return "Enter the employee's name.";
    if (!/^\d{10}$/.test(w.phone || ""))
      return "Mobile number must be 10 digits.";
    if (
      d.workers.some(function (x) {
        return x.phone === w.phone && x.id !== selfId;
      })
    )
      return "Another employee already uses this mobile number.";
    return "";
  }

  window.GA = {
    DEMO_MODE: false, // demo logins and demo data are switched off
    esc: esc,
    today: today,
    // Icon by name; the drawings live in assets/icons.js
    icon: function (n) {
      return GMIcons.svg(n, "icon");
    },
    randomPassword: function () {
      var c = "abcdefghjkmnpqrstuvwxyz23456789",
        o = "";
      for (var i = 0; i < 8; i++) o += c[Math.floor(Math.random() * c.length)];
      return o;
    },

    /* ---- Session ---- */
    // Returns the admin session if this mobile number + password belongs to an admin, otherwise null.
    // The server checks the password (POST /api/login). The sign-in page then calls this to remember who is signed in for this tab.
    setSession: function (s) {
      try {
        sessionStorage.setItem(
          SK,
          JSON.stringify({
            id: s.id,
            name: s.name,
            role: s.role,
            perms: s.perms,
            full: s.full,
            super: s.super,
          }),
        );
      } catch (e) {}
    },
    // Can this signed-in person open this admin page? (Only for showing or hiding menu items. The server decides for real.)
    can: function (page) {
      var s = GA.session() || {},
        r = PAGE_NEEDS[page];
      if (r === undefined) r = "full";
      if (s.super === undefined && s.full === undefined) return r !== "super"; // an older sign-in with no role info: show the normal menu, the server still checks
      if (r === "*") return true;
      if (r === "super") return !!s.super;
      if (r === "full") return !!s.full || !!s.super;
      if (s.full || s.super) return true;
      var m = s.perms || [];
      return r.some(function (x) {
        return m.indexOf(x) > -1;
      });
    },
    session: function () {
      try {
        return JSON.parse(sessionStorage.getItem(SK));
      } catch (e) {
        return null;
      }
    },
    // The signed-in admin's own account (name, mobile, role). The password is never returned.
    account: function () {
      var s = GA.session() || {},
        a =
          admins().filter(function (x) {
            return x.id === s.id;
          })[0] ||
          admins()[0] ||
          {};
      return { id: a.id, name: a.name, phone: a.phone, role: a.role };
    },
    // Change name and mobile number. Returns { ok:true } or { ok:false, error }.
    updateAccount: function (id, name, phone) {
      name = String(name || "").trim();
      phone = String(phone || "")
        .replace(/\D/g, "")
        .slice(-10);
      if (name.length < 2)
        return { ok: false, error: "Enter your name (at least 2 letters)." };
      if (!/^[6-9]\d{9}$/.test(phone))
        return { ok: false, error: "Enter a valid 10-digit mobile number." };
      var L = admins(),
        a = L.filter(function (x) {
          return x.id === id;
        })[0];
      if (!a) return { ok: false, error: "Account not found." };
      if (
        load().workers.some(function (w) {
          return w.phone === phone;
        })
      )
        return {
          ok: false,
          error: "This mobile number is already used by an employee.",
        };
      a.name = name;
      a.phone = phone;
      try {
        localStorage.setItem(AK, JSON.stringify(L));
        var s = GA.session();
        if (s && s.id === id) {
          s.name = name;
          sessionStorage.setItem(SK, JSON.stringify(s));
        }
      } catch (e) {
        return { ok: false, error: "Could not save in this browser." };
      }
      return { ok: true };
    },
    // Change password: needs the current one. Returns { ok:true } or { ok:false, error }.
    changePassword: function (id, current, next) {
      if (String(next || "").length < 8)
        return {
          ok: false,
          error: "The new password must be at least 8 characters.",
        };
      if (next === current)
        return {
          ok: false,
          error: "Choose a password different from the current one.",
        };
      try {
        var x = new XMLHttpRequest();
        x.open("POST", "/api/change-password", false);
        x.setRequestHeader("Content-Type", "application/json");
        x.send(JSON.stringify({ current: current, next: next }));
        var j = {};
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {}
        return x.status === 200
          ? { ok: true }
          : { ok: false, error: j.error || "Could not change the password." };
      } catch (e) {
        return { ok: false, error: "Could not reach the server." };
      }
    },
    // ---- Backup: downloads a full copy of the data as one file (admin only) ----
    backupCard: function () {
      return (
        '<div class="card" id="bkCard"><div class="card-title">Backup</div>' +
        '<p class="pf2-hint">Download a full copy of your data: customers, routes, plans, employees, attendance and settings. Keep the file somewhere safe, for example email it to yourself or save it in Google Drive. Photos and documents are not included.</p>' +
        '<div class="pf2-acts"><button class="btn a-btn" id="bkGo" type="button">Download backup</button>' +
        ((GA.session() || {}).super
          ? '<button class="btn btn-secondary a-btn" id="bkImp" type="button">Import backup</button><input type="file" id="bkFile" accept=".json,application/json" hidden>'
          : "") +
        "</div>" +
        '<div id="bkImpBox" class="pf2-hint" style="display:none;margin-top:12px"></div>' +
        '<div class="pf2-msg" id="bkMsg" role="status"></div></div>'
      );
    },
    bindBackup: function () {
      var go = document.getElementById("bkGo"),
        m = document.getElementById("bkMsg");
      if (!go || !m) return;
      function say(t, kind) {
        m.textContent = t;
        m.className = "pf2-msg" + (kind ? " " + kind : "");
      }
      function shown() {
        try {
          var t = localStorage.getItem("gt_last_backup");
          if (t) {
            var d = new Date(t);
            say(
              "Last backup downloaded on this device: " +
                d.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }) +
                " at " +
                d.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                }) +
                ".",
            );
          }
        } catch (e) {}
      }
      shown();
      go.onclick = function () {
        go.disabled = true;
        say("Preparing your backup...");
        fetch("/api/export", { cache: "no-store", credentials: "same-origin" })
          .then(function (r) {
            if (r.status === 401)
              throw new Error("Your sign-in expired. Sign in again and retry.");
            if (r.status === 403)
              throw new Error("Only an admin can download a backup.");
            if (!r.ok)
              throw new Error(
                "The server could not make the backup. Try again.",
              );
            return r.blob();
          })
          .then(function (b) {
            var n = new Date(),
              hm =
                String(n.getHours()).padStart(2, "0") +
                String(n.getMinutes()).padStart(2, "0"),
              a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "gm-crm-backup-" + today() + "-" + hm + ".json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () {
              URL.revokeObjectURL(a.href);
            }, 4000);
            try {
              localStorage.setItem("gt_last_backup", n.toISOString());
            } catch (e) {}
            say(
              "Backup downloaded (" +
                Math.max(1, Math.round(b.size / 1024)) +
                " KB). Keep the file safe.",
              "ok",
            );
          })
          .catch(function (e) {
            say(
              e && e.message
                ? e.message
                : "Could not download the backup. Check your connection.",
              "err",
            );
          })
          .then(function () {
            go.disabled = false;
          });
      };
    },
    // Import backup (Super Admin): choose a file -> the server checks it -> the person confirms -> data is replaced (a safety copy is kept first)
    bindImport: function () {
      var btn = document.getElementById("bkImp"),
        inp = document.getElementById("bkFile"),
        box = document.getElementById("bkImpBox"),
        m = document.getElementById("bkMsg");
      if (!btn || !inp) return;
      var text = "";
      function say(t, kind) {
        m.textContent = t;
        m.className = "pf2-msg" + (kind ? " " + kind : "");
      }
      function esc(t) {
        return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      }
      function post(q) {
        return fetch("/api/import" + q, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: text,
        }).then(function (r) {
          return r
            .json()
            .catch(function () {
              return {};
            })
            .then(function (j) {
              if (!r.ok)
                throw new Error(
                  j.error ||
                    (r.status === 401
                      ? "Your sign-in expired. Sign in again."
                      : r.status === 403
                        ? "Only the Super Admin can import a backup."
                        : "The server could not read this file."),
                );
              return j;
            });
        });
      }
      function reset() {
        box.style.display = "none";
        box.innerHTML = "";
        text = "";
        inp.value = "";
        btn.disabled = false;
      }
      btn.onclick = function () {
        inp.click();
      };
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        say("Checking the file...");
        btn.disabled = true;
        var rd = new FileReader();
        rd.onerror = function () {
          say("Could not read that file.", "err");
          reset();
        };
        rd.onload = function () {
          text = String(rd.result || "");
          post("?preview=1")
            .then(function (j) {
              say("");
              box.style.display = "block";
              box.innerHTML =
                "<b>" +
                esc(f.name) +
                "</b><br>" +
                j.records +
                " records" +
                (j.exportedAt
                  ? ", saved on " + esc(String(j.exportedAt).slice(0, 10))
                  : "") +
                (j.employees ? ", " + j.employees + " employees" : "") +
                ".<br>" +
                "Importing <b>replaces all current data</b> (customers, routes, plans, employees, settings, activity log). Logins and user accounts are kept. A safety copy of the current data is saved first." +
                (j.removed
                  ? "<br>" +
                    j.removed +
                    " records that exist now are not in this file and will be removed."
                  : "") +
                '<div class="pf2-acts" style="margin-top:10px"><button class="btn a-btn" id="bkOk" type="button">Replace data with this backup</button><button class="btn btn-secondary a-btn" id="bkNo" type="button">Cancel</button></div>';
              document.getElementById("bkNo").onclick = function () {
                reset();
                say("");
              };
              document.getElementById("bkOk").onclick = function () {
                this.disabled = true;
                say("Restoring...");
                post("")
                  .then(function (r) {
                    reset();
                    say(
                      "Backup restored. Safety copy of the old data: " +
                        r.safetyCopy +
                        ". Reload the page.",
                      "ok",
                    );
                    setTimeout(function () {
                      location.reload();
                    }, 2500);
                  })
                  .catch(function (e) {
                    reset();
                    say(e.message, "err");
                  });
              };
            })
            .catch(function (e) {
              reset();
              say(e.message, "err");
            });
        };
        rd.readAsText(f);
      };
    },
    logout: function () {
      try {
        sessionStorage.removeItem(SK);
        localStorage.removeItem("gt-remember-admin");
      } catch (e) {}
      try {
        var x = new XMLHttpRequest();
        x.open("POST", "/api/logout", false);
        x.send();
      } catch (e) {}
      location.href = "../login.html";
    },
    guard: function () {
      if (!GA.session()) {
        location.replace("../login.html");
        throw new Error("Not signed in");
      }
    },

    /* ---- Employees ---- */
    workers: function () {
      var d = load(),
        t = today();
      return d.workers.map(function (w) {
        return Object.assign({}, w, { onLeave: onLeave(d, w.id, t) });
      });
    },
    addWorker: function (w) {
      var d = load(),
        err = check(d, w);
      if ((w.password || "").length < 6)
        err = err || "Password must be at least 6 characters.";
      if (err) return { ok: false, error: err };
      var n =
        d.workers.reduce(function (m, x) {
          return Math.max(m, parseInt(x.id.slice(1), 10) || 0);
        }, 0) + 1;
      var rec = {
        id: "W" + String(n).padStart(3, "0"),
        name: w.name.trim(),
        phone: w.phone,
        password: w.password,
        emergency: (w.emergency || "").trim(),
        active: true,
        created: today(),
      };
      d.workers.push(rec);
      save(d);
      return { ok: true, worker: rec };
    },
    updateWorker: function (id, w) {
      var d = load(),
        err = check(d, w, id);
      if (err) return { ok: false, error: err };
      d.workers.forEach(function (x) {
        if (x.id === id) {
          x.name = w.name.trim();
          x.phone = w.phone;
          x.emergency = (w.emergency || "").trim();
        }
      });
      save(d);
      return { ok: true };
    },
    setPassword: function (id, password) {
      if ((password || "").length < 6)
        return { ok: false, error: "Password must be at least 6 characters." };
      var d = load();
      d.workers.forEach(function (x) {
        if (x.id === id) x.password = password;
      });
      save(d);
      return { ok: true };
    },
    // Employee code (GTD-202610001): GT + role letter + joining year/month + 3-digit running number for that month.
    // Stored in the employee profile (gm_admin_wprofile_v1). The internal id (W001) never changes, so all records stay linked.
    roleLetter: function (role) {
      var r = String(role || "Delivery").toLowerCase(),
        L = {
          "delivery / driver": "D",
          helper: "H",
          sales: "S",
          inventory: "I",
          billing: "B",
          loading: "L",
          admin: "A",
        };
      if (L[r]) return L[r];
      if (/^deliv|driver/.test(r)) return "D";
      return "D";
    },
    empCode: function (id) {
      try {
        var P = JSON.parse(localStorage.getItem("gm_admin_wprofile_v1")) || {};
        return (P[id] && P[id].empCode) || id;
      } catch (e) {
        return id;
      }
    },
    ensureCodes: function () {
      var P,
        ch = false;
      try {
        P = JSON.parse(localStorage.getItem("gm_admin_wprofile_v1")) || {};
      } catch (e) {
        return;
      }
      var ws = load().workers.filter(function (w) {
        return !(P[w.id] && P[w.id].empCode);
      });
      if (!ws.length) return;
      function jd(w) {
        return (P[w.id] && P[w.id].joinDate) || w.created || today();
      }
      ws.sort(function (a, b) {
        return jd(a) < jd(b) ? -1 : jd(a) > jd(b) ? 1 : a.id < b.id ? -1 : 1;
      });
      ws.forEach(function (w) {
        var ds = jd(w),
          m = ds.slice(0, 4) + ds.slice(5, 7),
          n = 0,
          p = P[w.id] || (P[w.id] = {});
        Object.keys(P).forEach(function (k) {
          var c = P[k].empCode,
            x = /^GT[A-Z]-\d{6}(\d+)$/.exec(c || "");
          if (x) n = Math.max(n, parseInt(x[1], 10) || 0);
        });
        p.empCode =
          "GT" +
          GA.roleLetter(p.role) +
          "-" +
          m +
          String(n + 1).padStart(3, "0");
        ch = true;
      });
      if (ch)
        try {
          localStorage.setItem("gm_admin_wprofile_v1", JSON.stringify(P));
        } catch (e) {}
    },
    // "Name (CODE)" for lists and pickers.
    empLabel: function (w) {
      return (w.name || "") + " (" + GA.empCode(w.id) + ")";
    },
    setActive: function (id, on) {
      var d = load();
      d.workers.forEach(function (x) {
        if (x.id === id) x.active = !!on;
      });
      save(d);
    },

    /* ---- Leave ---- */
    leavesOf: function (id) {
      return load()
        .leaves.filter(function (l) {
          return l.workerId === id;
        })
        .sort(function (a, b) {
          return a.from < b.from ? 1 : -1;
        });
    },
    addLeave: function (id, from, to, reason) {
      if (!from || !to)
        return { ok: false, error: "Choose the first and last day of leave." };
      if (to < from)
        return {
          ok: false,
          error: "The last day cannot be before the first day.",
        };
      var d = load();
      d.leaves.push({
        id: "L" + Date.now(),
        workerId: id,
        from: from,
        to: to,
        reason: (reason || "").trim(),
      });
      save(d);
      return { ok: true };
    },
    removeLeave: function (lid) {
      var d = load();
      d.leaves = d.leaves.filter(function (l) {
        return l.id !== lid;
      });
      save(d);
    },

    /* ---- Employee sign-in (used by the shared login page) ---- */
    // Returns { worker, onLeave } for an admin-created employee whose mobile + password match, else null.
    onLeaveOn: function (id, date) {
      return onLeave(load(), id, date);
    },
    findWorker: function (phone, password) {
      var d = load(),
        t = today();
      var w = d.workers.filter(function (x) {
        return x.phone === phone && x.password === password;
      })[0];
      return w ? { worker: w, onLeave: onLeave(d, w.id, t) } : null;
    },

    /* ---- Vehicles ---- */
    vehicles: function () {
      return loadV();
    },
    // A vehicle name or number as a link to its full details page (falls back to plain text when the vehicle is not in the list).
    vehLink: function (label, id) {
      var t = String(label == null ? "" : label),
        L = loadV(),
        v = null,
        i;
      if (id) for (i = 0; i < L.length; i++) if (L[i].id === id) v = L[i];
      if (!v && t)
        for (i = 0; i < L.length; i++)
          if (
            L[i].number &&
            t.toUpperCase().indexOf(String(L[i].number).toUpperCase()) > -1
          ) {
            v = L[i];
            break;
          }
      return v
        ? '<a class="a-vl" href="vehicle.html?id=' +
            encodeURIComponent(v.id) +
            '" title="Open vehicle details">' +
            esc(t) +
            "</a>"
        : esc(t);
    },
    addVehicle: function (v) {
      var list = loadV(),
        err = checkV(list, v);
      if (err) return { ok: false, error: err };
      var n =
        list.reduce(function (m, x) {
          return Math.max(m, parseInt(x.id.slice(1), 10) || 0);
        }, 0) + 1;
      var rec = {
        id: "V" + String(n).padStart(3, "0"),
        number: v.number.trim().toUpperCase(),
        type: (v.type || "").trim(),
        lastKm: Math.round(Number(v.lastKm) || 0),
        note: (v.note || "").trim(),
        active: true,
      };
      list.push(rec);
      saveV(list);
      return { ok: true, vehicle: rec };
    },
    updateVehicle: function (id, v) {
      var list = loadV(),
        err = checkV(list, v, id);
      if (err) return { ok: false, error: err };
      list.forEach(function (x) {
        if (x.id === id) {
          x.number = v.number.trim().toUpperCase();
          x.type = (v.type || "").trim();
          x.lastKm = Math.round(Number(v.lastKm) || 0);
          x.note = (v.note || "").trim();
        }
      });
      saveV(list);
      return { ok: true };
    },
    setVehicleActive: function (id, on) {
      var list = loadV();
      list.forEach(function (x) {
        if (x.id === id) x.active = !!on;
      });
      saveV(list);
    },

    /* ---- Advances and deductions (shown to the employee in the app's Account screen) ---- */
    entries: function (workerId, month) {
      return loadL()
        .filter(function (e) {
          return (
            (!workerId || e.workerId === workerId) &&
            (!month || e.date.slice(0, 7) === month)
          );
        })
        .sort(function (a, b) {
          return a.date < b.date
            ? 1
            : a.date > b.date
              ? -1
              : a.id < b.id
                ? 1
                : -1;
        });
    },
    addEntry: function (e) {
      var amt = Number(e.amount);
      if (!e.workerId) return { ok: false, error: "Choose an employee." };
      if (!e.title || !e.title.trim())
        return {
          ok: false,
          error: 'Enter a title, for example "Festival advance".',
        };
      if (!(amt > 0))
        return { ok: false, error: "Enter an amount above zero." };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || ""))
        return { ok: false, error: "Choose the date." };
      var l = loadL();
      l.push({
        id: "E" + Date.now() + Math.random().toString(36).slice(2, 6),
        workerId: e.workerId,
        type: e.type === "deduction" ? "deduction" : "advance",
        title: e.title.trim(),
        amount: Math.round(amt),
        date: e.date,
        note: (e.note || "").trim(),
      });
      saveL(l);
      return { ok: true };
    },
    removeEntry: function (id) {
      saveL(
        loadL().filter(function (e) {
          return e.id !== id;
        }),
      );
    },

    /* ---- After an employee punches out, the vehicle's last recorded km moves up to the closing km ---- */
    syncVehicleKm: function () {
      try {
        if (!window.GM) return;
        var sh = GM.getShift(),
          w = GM.getWorker();
        if (!sh.punchedOut || !(sh.endKm > 0)) return;
        var plan = (GA.ops.get().plans || {})[today()];
        if (!plan || plan.workerId !== w.id || !plan.vehicleId) return;
        var list = loadV(),
          changed = false;
        list.forEach(function (v) {
          if (v.id === plan.vehicleId && sh.endKm > v.lastKm) {
            v.lastKm = sh.endKm;
            changed = true;
          }
        });
        if (changed) saveV(list);
      } catch (e) {}
    },

    /* ---- Notifications (written by the employee app in mock-data.js, read here) ---- */
    notifs: {
      list: function (o) {
        var l = [];
        try {
          l = JSON.parse(localStorage.getItem("gm_admin_notifs_v1")) || [];
        } catch (e) {}
        o = o || {};
        return l.filter(function (n) {
          return (
            (!o.date || n.date === o.date) &&
            (!o.type || n.type === o.type) &&
            (!o.unread || !n.read)
          );
        });
      },
      unread: function () {
        return GA.notifs.list({ unread: true }).length;
      },
      save: function (l) {
        try {
          localStorage.setItem("gm_admin_notifs_v1", JSON.stringify(l));
        } catch (e) {}
      },
      markAll: function () {
        var l = GA.notifs.list();
        l.forEach(function (n) {
          n.read = true;
        });
        GA.notifs.save(l);
      },
      markRead: function (id) {
        var l = GA.notifs.list();
        l.forEach(function (n) {
          if (n.id === id) n.read = true;
        });
        GA.notifs.save(l);
      },
      clear: function () {
        GA.notifs.save([]);
      },
      ago: function (ts) {
        var m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) return "just now";
        if (m < 60) return m + " min ago";
        var h = Math.round(m / 60);
        if (h < 24) return h + " h ago";
        return new Date(ts).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        });
      },
      meta: function (t) {
        return (
          {
            delivered: ["store", "s", "Delivered"],
            problem: ["alert-triangle", "a", "Problem"],
            cancelled: ["close", "d", "Cancelled"],
            return: ["trash", "i", "Return"],
            route: ["check", "s", "Route done"],
            punchin: ["clock", "p", "Punch in"],
            punchout: ["power", "p", "Punch out"],
            pin: ["store", "s", "Shop location"],
          }[t] || ["bell", "p", "Update"]
        );
      },
    },
    // Runs cb when the employee app (same browser, other tab) writes new data, and every 5 s as a fallback.
    onChange: function (cb) {
      function sig() {
        try {
          return (
            localStorage.getItem("gm_admin_notifs_v1") +
            "|" +
            localStorage.getItem("gm_crm_data_v5")
          );
        } catch (e) {
          return "";
        }
      }
      var last = sig();
      function chk() {
        var n = sig();
        if (n !== last) {
          last = n;
          cb();
        }
      }
      window.addEventListener("storage", chk);
      setInterval(chk, 5000);
    },

    /* ---- Overview numbers (customers and routes still live in the Routes & Customers page store) ---- */
    counts: function () {
      var w = GA.workers(),
        o = {};
      try {
        o = JSON.parse(localStorage.getItem(OLD)) || {};
      } catch (e) {}
      return {
        workers: w.length,
        active: w.filter(function (x) {
          return x.active;
        }).length,
        onLeave: w.filter(function (x) {
          return x.active && x.onLeave;
        }).length,
        customers: (o.customers || []).length,
        routes: (o.routes || []).length,
      };
    },

    /* ---- Page shell: sidebar + top bar. Returns the element to render the page into. ---- */
    mount: function (page, title, opts) {
      opts = opts || {};
      GA.syncVehicleKm();
      GA.ensureCodes();
      var s = GA.session() || {},
        nav = [
          ["index.html", "Home", "home"],
          ["summary.html", "Daily summary", "report"],
          ["workers.html", "Employees", "users"],
          ["vehicles.html", "Vehicles", "truck"],
          ["plan.html", "Daily plan", "calendar"],
          ["routes.html", "Routes", "map"],
          ["customers.html", "Customers", "store"],
          ["orders.html", "Orders", "clipboard-list"],
          ["products.html", "Products", "box"],
          ["attendance.html", "Attendance", "clock"],
          ["advances.html", "Advances", "coin"],
          ["problems.html", "Problems", "alert-triangle"],
          ["live.html", "Live location", "map"],
          ["activity.html", "Activity log", "check"],
          ["super.html", "User overview", "report"],
          ["users.html", "Users & Admins", "key"],
        ];
      nav = nav.filter(function (n) {
        return GA.can(n[0]);
      });
      var links = nav
        .map(function (n) {
          return (
            '<a href="' +
            n[0] +
            '" title="' +
            n[1] +
            '"' +
            (n[0] === page ? ' aria-current="page"' : "") +
            ">" +
            GA.icon(n[2]) +
            "<span>" +
            n[1] +
            "</span></a>"
          );
        })
        .join("");
      document.body.innerHTML =
        '<div class="a-wrap"><aside class="a-side" id="aSide"><div class="a-brand"><img src="../assets/logo.png" alt=""><span>General Traders</span><button class="a-ib a-col" id="aCol" type="button" title="Collapse menu" aria-label="Collapse menu">' +
        GA.icon("panel") +
        '</button></div><nav class="a-nav" aria-label="Main menu">' +
        links +
        "</nav>" +
        '<div class="a-user"><a class="a-me" href="profile.html" title="My profile and depot location"' +
        (page === "profile.html" ? ' aria-current="page"' : "") +
        '><span class="chip c-p">' +
        esc((s.name || "A").charAt(0).toUpperCase()) +
        '</span><div style="flex:1"><b>' +
        esc(s.name) +
        "</b><span>" +
        esc(s.role) +
        '</span></div></a><button class="a-ib d" id="aOut" title="Sign out">' +
        GA.icon("logout") +
        "</button></div></aside>" +
        '<div class="a-main"><div class="a-top"><button class="a-ib a-menu" id="aMenu" title="Menu" aria-label="Open menu">' +
        GA.icon("menu") +
        "</button>" +
        (opts.back
          ? '<a class="a-bk" id="aBack" href="' +
            opts.back[0] +
            '" title="Back to ' +
            esc(opts.back[1]) +
            '">' +
            GA.icon("chevron-left") +
            "<span>" +
            esc(opts.back[1]) +
            "</span></a>"
          : "") +
        "<h1>" +
        esc(title) +
        '</h1><div class="a-acts" id="aActs"></div><span class="a-bellwrap"><button class="a-ib" id="aBell" title="Notifications">' +
        GA.icon("bell") +
        '<i class="a-dot" id="aDot"></i></button><div class="a-pop" id="aPop"></div></span><button class="a-ib" id="themeToggle" title="Light or dark theme">' +
        GA.icon("moon") +
        '</button><span class="a-uw"><button class="a-uchip" id="aUser" type="button" aria-haspopup="menu" aria-expanded="false" title="Account"><span class="chip c-p">' +
        esc((s.name || "A").charAt(0).toUpperCase()) +
        '</span><span class="a-un"><b>' +
        esc(s.name) +
        "</b><small>" +
        esc(s.role) +
        '</small></span><i aria-hidden="true">&#9662;</i></button><div class="a-umenu" id="aUMenu" role="menu"><a role="menuitem" href="profile.html">My profile</a><a role="menuitem" href="profile.html#password">Change password</a><button role="menuitem" type="button" id="aOut2">Sign out</button></div></span></div><div id="aPage"></div></div></div>';
      document.getElementById("aOut").onclick = GA.logout;
      (function () {
        var ub = document.getElementById("aUser"),
          um = document.getElementById("aUMenu");
        if (!ub || !um) return;
        function set(on) {
          um.classList.toggle("show", on);
          ub.setAttribute("aria-expanded", on ? "true" : "false");
        }
        ub.onclick = function (e) {
          e.stopPropagation();
          set(!um.classList.contains("show"));
        };
        document.addEventListener("click", function (e) {
          if (!um.contains(e.target)) set(false);
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape") set(false);
        });
        document.getElementById("aOut2").onclick = GA.logout;
      })();
      var side = document.getElementById("aSide"),
        back = document.createElement("div");
      back.className = "a-back";
      document.body.appendChild(back);
      function setMenu(on) {
        side.classList.toggle("open", on);
        back.classList.toggle("show", on);
      }
      document.getElementById("aMenu").onclick = function () {
        setMenu(!side.classList.contains("open"));
      };
      back.onclick = function () {
        setMenu(false);
      };
      // Inside the menu: collapses it on a computer, closes it on a phone.
      var wrap = document.querySelector(".a-wrap"),
        col = document.getElementById("aCol");
      function wide() {
        return window.innerWidth > 900;
      }
      function setCol(on) {
        wrap.classList.toggle("col", on && wide());
        col.title = col.ariaLabel =
          on && wide()
            ? "Expand menu"
            : wide()
              ? "Collapse menu"
              : "Close menu";
      }
      var isCol = false;
      try {
        isCol = localStorage.getItem("gm_side_col") === "1";
      } catch (e) {}
      setCol(isCol);
      col.onclick = function () {
        if (wide()) {
          isCol = !wrap.classList.contains("col");
          try {
            localStorage.setItem("gm_side_col", isCol ? "1" : "0");
          } catch (e) {}
          setCol(isCol);
        } else setMenu(false);
      };
      window.addEventListener("resize", function () {
        setCol(isCol);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setMenu(false);
      });
      // Tables become stacked cards on phones: copy each column heading onto its cells.
      function labelTables() {
        [].forEach.call(document.querySelectorAll(".a-table"), function (t) {
          var h = [].map.call(t.querySelectorAll("thead th"), function (x) {
            return x.textContent;
          });
          [].forEach.call(t.querySelectorAll("tbody tr"), function (r) {
            [].forEach.call(r.children, function (c, i) {
              if (h[i] && c.getAttribute("data-label") !== h[i])
                c.setAttribute("data-label", h[i]);
            });
          });
        });
      }
      new MutationObserver(labelTables).observe(
        document.getElementById("aPage"),
        { childList: true, subtree: true },
      );
      // Bell: unread badge, dropdown with latest alerts, and a small pop-up when a new alert arrives.
      var dot = document.getElementById("aDot"),
        pop = document.getElementById("aPop"),
        seen = {},
        first = true;
      GA.notifs.list().forEach(function (n) {
        seen[n.id] = 1;
      });
      function bellDraw() {
        var u = GA.notifs.unread(),
          l = GA.notifs.list().slice(0, 8);
        dot.textContent = u > 99 ? "99+" : u;
        dot.style.display = u ? "grid" : "none";
        var navA = document.querySelector(
          '.a-side a[href="notifications.html"]',
        );
        if (navA) {
          var b = navA.querySelector(".a-nb");
          if (!b) {
            b = document.createElement("em");
            b.className = "a-nb";
            navA.appendChild(b);
          }
          b.textContent = u;
          b.style.display = u ? "inline-block" : "none";
        }
        pop.innerHTML =
          '<div class="a-pop-h"><b>Notifications</b><button id="aAll">Mark all read</button></div>' +
          (l.length
            ? l
                .map(function (n) {
                  var m = GA.notifs.meta(n.type);
                  return (
                    '<a class="a-n' +
                    (n.read ? "" : " un") +
                    '" href="notifications.html"><span class="chip c-' +
                    m[1] +
                    '">' +
                    GA.icon(m[0]) +
                    "</span><div><b>" +
                    esc(n.title) +
                    "</b><span>" +
                    esc(n.text) +
                    "</span><small>" +
                    GA.notifs.ago(n.ts) +
                    "</small></div></a>"
                  );
                })
                .join("")
            : '<div class="a-empty"><b>Nothing yet</b>When an employee finishes a shop, reports a problem or returns items, it shows up here.</div>') +
          '<a class="a-pop-f" href="notifications.html">See all</a>';
        var all = document.getElementById("aAll");
        if (all)
          all.onclick = function (e) {
            e.stopPropagation();
            GA.notifs.markAll();
            bellDraw();
          };
      }
      function toast(n) {
        var m = GA.notifs.meta(n.type),
          t = document.createElement("div");
        t.className = "a-toast";
        t.innerHTML =
          '<span class="chip c-' +
          m[1] +
          '">' +
          GA.icon(m[0]) +
          "</span><div><b>" +
          esc(n.title) +
          "</b><span>" +
          esc(n.text) +
          "</span></div>";
        t.onclick = function () {
          location.href = "notifications.html";
        };
        document.body.appendChild(t);
        setTimeout(function () {
          t.classList.add("out");
          setTimeout(function () {
            t.remove();
          }, 400);
        }, 6000);
      }
      function bellCheck() {
        GA.notifs
          .list()
          .slice()
          .reverse()
          .forEach(function (n) {
            if (!seen[n.id]) {
              seen[n.id] = 1;
              if (!first) toast(n);
            }
          });
        first = false;
        bellDraw();
      }
      bellCheck();
      document.getElementById("aBell").onclick = function (e) {
        e.stopPropagation();
        pop.classList.toggle("show");
      };
      document.addEventListener("click", function (e) {
        if (!pop.contains(e.target)) pop.classList.remove("show");
      });
      GA.onChange(bellCheck);
      document.title = title + " - General Traders Admin";
      // Motion layer: entrance flag, cursor spotlight, button ripple, smooth theme switch (CSS lives in admin.css)
      (function () {
        var b = document.body,
          h = document.documentElement;
        if (
          window.matchMedia &&
          matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          return;
        b.classList.add("a-enter");
        setTimeout(function () {
          b.classList.remove("a-enter");
        }, 1200);
        var FX =
          ".gtc-stat,.at-tile,.wk-tile,.vx-tile,.pr-tile,.dp-stat,.a-stat,.dp-plan,.vx-card,.wk-wc,.pr-gc,.gtc-customer-card";
        document.addEventListener(
          "pointermove",
          function (e) {
            var t = e.target.closest && e.target.closest(FX);
            if (!t) return;
            var r = t.getBoundingClientRect();
            t.style.setProperty("--mx", e.clientX - r.left + "px");
            t.style.setProperty("--my", e.clientY - r.top + "px");
          },
          { passive: true },
        );
        document.addEventListener("pointerdown", function (e) {
          var btn = e.target.closest && e.target.closest(".btn");
          if (!btn || btn.disabled) return;
          var r = btn.getBoundingClientRect(),
            d = Math.max(r.width, r.height) * 2,
            s = document.createElement("span");
          s.className = "fx-ripple";
          s.style.cssText =
            "width:" +
            d +
            "px;height:" +
            d +
            "px;left:" +
            (e.clientX - r.left - d / 2) +
            "px;top:" +
            (e.clientY - r.top - d / 2) +
            "px";
          btn.appendChild(s);
          setTimeout(function () {
            if (s.parentNode) s.parentNode.removeChild(s);
          }, 650);
        });
        document.addEventListener("click", function (e) {
          if (e.target.closest && e.target.closest("#themeToggle")) {
            h.classList.add("fx-theming");
            setTimeout(function () {
              h.classList.remove("fx-theming");
            }, 500);
          }
        });
      })();
      var page = document.getElementById("aPage");
      // Any element marked data-act inside the page is lifted into the top bar (right side, beside the bell).
      // Done right after every render, so getElementById / onclick bindings keep working on the lifted buttons.
      var desc = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "innerHTML",
      );
      GA.hoist = function (root) {
        var slot = document.getElementById("aActs");
        if (!slot) return;
        [].slice
          .call((root || page).querySelectorAll("[data-act]"))
          .forEach(function (el) {
            slot.appendChild(el);
          });
      };
      GA.dateNav = function (prevId, inputId, nextId, value, max, label) {
        return (
          '<div class="a-dn" data-act><button type="button" class="a-dnb" id="' +
          prevId +
          '" title="Previous day" aria-label="Previous day">&lsaquo;</button>' +
          '<div class="field vx-datebox"><span aria-hidden="true">' +
          GA.icon("calendar") +
          '</span><input type="date" id="' +
          inputId +
          '" value="' +
          (value || "") +
          '"' +
          (max ? ' max="' + max + '"' : "") +
          ' aria-label="' +
          (label || "Date") +
          '"></div>' +
          '<button type="button" class="a-dnb" id="' +
          nextId +
          '" title="Next day" aria-label="Next day">&rsaquo;</button></div>'
        );
      };
      GA.clearActs = function () {
        var slot = document.getElementById("aActs");
        if (slot) slot.innerHTML = "";
      };
      Object.defineProperty(page, "innerHTML", {
        configurable: true,
        get: function () {
          return desc.get.call(this);
        },
        set: function (v) {
          GA.clearActs();
          desc.set.call(this, v);
          GA.hoist(page);
        },
      });
      return page;
    },
  };
})();

/* ---- Routes, customers and daily plans (shared by plan.html, routes.html, customers.html) ---- */
GA.ops = (function () {
  var KEY = "gm_admin_v1";
  function get() {
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    return s || { customers: [], routes: [], plans: {} };
  }
  function save(S) {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {}
  }
  return {
    get: get,
    save: save,
    // All plans for a date. Older data stored one plan object per date; newer data stores a list.
    plansOn: function (S, d) {
      var p = S && S.plans && S.plans[d];
      return Array.isArray(p) ? p : p ? [p] : [];
    },
    // Same as plansOn, without cancelled plans (those stay in the data as history only).
    activePlansOn: function (S, d) {
      return GA.ops.plansOn(S, d).filter(function (p) {
        return p && p.status !== "cancelled";
      });
    },
    cust: function (S, c) {
      return S.customers.filter(function (x) {
        return x.code === c;
      })[0];
    },
    routeOf: function (S, c) {
      return S.routes.filter(function (r) {
        return r.codes.indexOf(c) > -1;
      })[0];
    },
    rid: function (S, n) {
      return S.routes.filter(function (r) {
        return r.name.toLowerCase() === n.toLowerCase();
      })[0];
    },
    assign: function (S, code, id) {
      S.routes.forEach(function (r) {
        r.codes = r.codes.filter(function (x) {
          return x !== code;
        });
      });
      var r = S.routes.filter(function (x) {
        return x.id === id;
      })[0];
      if (r) r.codes.push(code);
    },
    // The route for an area: found by name (any capitals), or created.
    areaRoute: function (S, area) {
      area = String(area || "").trim();
      if (!area) return null;
      S.routes = S.routes || [];
      var r = S.routes.filter(function (x) {
        return x.name.toLowerCase() === area.toLowerCase();
      })[0];
      if (!r) {
        r = {
          id:
            "r" +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 6),
          name: area,
          codes: [],
        };
        S.routes.push(r);
      }
      return r;
    },
    // Every active shop that has an Area but no route goes on the route named after its Area (made if missing).
    // Shops that were moved or set to "No route" by hand (noRoute / handRoute) are left alone.
    syncRoutes: function (S) {
      S.routes = S.routes || [];
      S.customers = S.customers || [];
      var have = {},
        before = S.routes.length,
        moved = 0;
      S.routes.forEach(function (r) {
        r.codes.forEach(function (c) {
          have[c] = 1;
        });
      });
      S.customers.forEach(function (c) {
        if (!c.area || c.inactive || c.noRoute || c.handRoute || have[c.code])
          return;
        var r = GA.ops.areaRoute(S, c.area);
        if (!r) return;
        r.codes.push(c.code);
        have[c.code] = 1;
        moved++;
      });
      return { moved: moved, made: S.routes.length - before };
    },
    // A shop is locked once the admin sets its route by hand (moved, or taken off its route). Uploads and suggestions never change it.
    isLocked: function (c) {
      return !!(c && (c.noRoute || c.handRoute));
    },
    lockRoute: function (S, code) {
      var c = GA.ops.cust(S, code);
      if (c) c.handRoute = true;
    },
    // Shops with no route whose address, place or area names an existing route. Each suggestion says how sure it is (how):
    //   exact   = the town part of the address is exactly the route name
    //   similar = spelled a little differently (Sarvanampatti / Saravanampatti)
    //   road    = the route name appears only inside a road name ("Karamadai - Sirumugai Road")
    //   near    = no usable address, so the route whose shops are closest on the map (km = distance, sure = clearly closer than any other route)
    // Locked shops, inactive shops and shops that already have a route are never suggested.
    suggestRoutes: function (S) {
      var key = function (s) {
        return (
          " " +
          String(s || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, " ")
            .trim() +
          " "
        );
      };
      var lev = function (a, b) {
        var m = a.length,
          n = b.length,
          d = [],
          i,
          j;
        if (Math.abs(m - n) > 2) return 9;
        for (j = 0; j <= n; j++) d[j] = j;
        for (i = 1; i <= m; i++) {
          var prev = d[0];
          d[0] = i;
          for (j = 1; j <= n; j++) {
            var t = d[j];
            d[j] = Math.min(
              d[j] + 1,
              d[j - 1] + 1,
              prev + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            prev = t;
          }
        }
        return d[n];
      };
      var routes = (S.routes || [])
        .map(function (r) {
          var k = key(r.name);
          return { r: r, k: k, w: k.trim().split(" "), j: k.replace(/ /g, "") };
        })
        .filter(function (x) {
          return x.j.length > 2;
        })
        .sort(function (a, b) {
          return b.k.length - a.k.length;
        });
      var have = {};
      (S.routes || []).forEach(function (r) {
        r.codes.forEach(function (x) {
          have[x] = 1;
        });
      });
      var roadish = /(^| )(ROAD|RD|HIGHWAY|BYPASS|BY PASS|STREET|ST)( |$)/;
      var exactIn = function (seg) {
        for (var i = 0; i < routes.length; i++)
          if (seg.indexOf(routes[i].k) > -1) return routes[i];
        return null;
      };
      var similarIn = function (seg) {
        var sw = seg.trim().split(" ");
        for (var i = 0; i < routes.length; i++) {
          var rt = routes[i],
            len = rt.j.length,
            tol = len >= 8 ? 2 : len >= 5 ? 1 : 0;
          if (!tol) continue;
          for (var s = 0; s + rt.w.length <= sw.length; s++) {
            var cand = sw.slice(s, s + rt.w.length).join("");
            if (lev(cand, rt.j) <= tol) return rt;
          }
        }
        return null;
      };
      var hasPin = function (c) {
        return (
          c.lat != null &&
          c.lng != null &&
          c.lat !== "" &&
          c.lng !== "" &&
          isFinite(+c.lat) &&
          isFinite(+c.lng)
        );
      };
      var km = function (la1, lo1, la2, lo2) {
        var R = 6371,
          rad = Math.PI / 180,
          dLa = (la2 - la1) * rad,
          dLo = (lo2 - lo1) * rad;
        var a =
          Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(la1 * rad) *
            Math.cos(la2 * rad) *
            Math.sin(dLo / 2) *
            Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(a));
      };
      var pts = []; // located shops that are already on a route
      (S.routes || []).forEach(function (r) {
        r.codes.forEach(function (code) {
          var x = GA.ops.cust(S, code);
          if (x && hasPin(x)) pts.push({ r: r, la: +x.lat, lo: +x.lng });
        });
      });
      var nearest = function (c) {
        if (!hasPin(c) || !pts.length) return null;
        var best = {},
          i,
          d; // closest member of each route
        for (i = 0; i < pts.length; i++) {
          d = km(+c.lat, +c.lng, pts[i].la, pts[i].lo);
          if (best[pts[i].r.id] == null || d < best[pts[i].r.id].d)
            best[pts[i].r.id] = { r: pts[i].r, d: d };
        }
        var L = Object.keys(best)
          .map(function (k) {
            return best[k];
          })
          .sort(function (a, b) {
            return a.d - b.d;
          });
        var b1 = L[0],
          b2 = L[1];
        return {
          r: b1.r,
          d: b1.d,
          sure: b1.d <= 3 && (!b2 || b2.d >= b1.d * 1.5),
        };
      };
      var out = [];
      (S.customers || []).forEach(function (c) {
        if (c.inactive || have[c.code] || GA.ops.isLocked(c)) return;
        // The town is written last, so read the address from its last part backwards. Road names are kept for the weakest pass.
        var parts = String(c.address || "")
          .split(/[,\n;]+/)
          .reverse()
          .concat([c.place, c.area]);
        var clean = [],
          roads = [];
        parts.forEach(function (raw) {
          raw = String(raw || "");
          if (!raw.trim()) return;
          var seg = key(raw);
          if (/\s[-\u2013]\s/.test(raw) || roadish.test(seg)) roads.push(seg);
          else clean.push(seg);
        });
        var hit = null,
          how = "",
          i;
        for (i = 0; i < clean.length && !hit; i++) {
          hit = exactIn(clean[i]);
          how = "exact";
        }
        for (i = 0; i < clean.length && !hit; i++) {
          hit = similarIn(clean[i]);
          how = "similar";
        }
        for (i = 0; i < roads.length && !hit; i++) {
          hit = exactIn(roads[i]);
          how = "road";
        }
        if (hit) {
          out.push({
            code: c.code,
            name: c.name,
            address: c.address || c.place || c.area || "",
            routeId: hit.r.id,
            routeName: hit.r.name,
            how: how,
          });
          return;
        }
        var nr = nearest(c);
        if (nr)
          out.push({
            code: c.code,
            name: c.name,
            address: c.address || c.place || c.area || "",
            routeId: nr.r.id,
            routeName: nr.r.name,
            how: "near",
            km: Math.round(nr.d * 10) / 10,
            sure: nr.sure,
          });
      });
      return out;
    },
    // Put the approved shops on their suggested routes. Shops that got a route or were locked meanwhile are skipped.
    applyRouteSuggestions: function (S, list) {
      var n = 0;
      list.forEach(function (s) {
        var c = GA.ops.cust(S, s.code),
          r = (S.routes || []).filter(function (x) {
            return x.id === s.routeId;
          })[0];
        if (
          !c ||
          !r ||
          c.inactive ||
          GA.ops.isLocked(c) ||
          GA.ops.routeOf(S, s.code)
        )
          return;
        r.codes.push(s.code);
        n++;
      });
      return n;
    },
    rows: function (t) {
      var r = t
        .trim()
        .split(/\r?\n/)
        .map(function (l) {
          return l.split(",").map(function (c) {
            return c.trim().replace(/^"|"$/g, "");
          });
        })
        .filter(function (r) {
          return r.some(Boolean);
        });
      if (r.length && /code|invoice|name/i.test(r[0].join())) r.shift();
      return r;
    },
    readFile: function (inp, cb) {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        cb(fr.result);
      };
      fr.readAsText(f);
    },
    rupee: function (n) {
      return "\u20b9" + Number(n || 0).toLocaleString("en-IN");
    },
    demo: function () {
      var n = [
        "Sri Murugan Stores",
        "Lakshmi Traders",
        "Annapoorna Provision",
        "Kumar Super Market",
        "Balaji General Store",
        "Selvam Mart",
        "Ganesh Traders",
        "Devi Departmental",
        "Raja Stores",
        "Meenakshi Provision",
        "Arun Super Bazaar",
        "Vel Murugan Mart",
        "Sakthi Stores",
        "Vignesh Traders",
        "Anbu Provision",
        "Murali Stores",
      ];
      var S = {
        customers: [],
        routes: [
          { id: "r1", name: "Ukkadam", codes: [] },
          { id: "r2", name: "Saravanampatti", codes: [] },
        ],
        plans: {},
      };
      n.forEach(function (x, i) {
        var c = "C" + String(i + 1).padStart(3, "0");
        S.customers.push({
          code: c,
          name: x,
          address:
            (i < 8 ? "Ukkadam" : "Saravanampatti") +
            " area, shop " +
            ((i % 8) + 1),
          phone: "98765" + String(50000 + i),
        });
        S.routes[i < 8 ? 0 : 1].codes.push(c);
      });
      save(S);
      return S;
    },
    demoInvoices:
      "INV-2041,C001,4250,3\nINV-2042,C003,7890,5\nINV-2043,C004,2310,2\nINV-2044,C007,5120,4\nINV-2045,C012,1450,1",
  };
})();
GA.tile = function (cls, icon, n, label) {
  return (
    '<div class="a-stat ' +
    cls +
    '">' +
    (icon ? '<span class="chip">' + GA.icon(icon) + "</span>" : "") +
    "<div><b>" +
    n +
    "</b><span>" +
    label +
    "</span></div></div>"
  );
};

/* GT FINAL HIDE SIDEBAR AVATAR */
(function () {
  function hideGTAvatar() {
    var el = document.getElementById("header-dot");
    if (el) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideGTAvatar);
  } else {
    hideGTAvatar();
  }

  new MutationObserver(hideGTAvatar).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();

/* ---- Idle sign-out: an admin who has not touched the page for 30 minutes is signed out (the server enforces the same limit). ---- */
(function () {
  var LIMIT = 30 * 60e3,
    WARN = 2 * 60e3,
    ACT = "gm_last_act",
    last = Date.now(),
    lastPing = 0,
    lastWrite = 0,
    warnEl = null,
    done = false;
  function onAdminPage() {
    return (
      /\/admin\//.test(location.pathname) &&
      window.GA &&
      GA.session &&
      GA.session()
    );
  }
  // Activity in ANY tab counts, so the last-activity time is shared through localStorage.
  function lastAct() {
    var v = 0;
    try {
      v = +localStorage.getItem(ACT) || 0;
    } catch (e) {}
    return Math.max(last, v);
  }
  function mark() {
    var n = Date.now();
    last = n;
    if (n - lastWrite > 15e3) {
      lastWrite = n;
      try {
        localStorage.setItem(ACT, String(n));
      } catch (e) {}
    }
    if (warnEl) {
      warnEl.remove();
      warnEl = null;
    }
  }
  function signOut() {
    if (done) return;
    done = true;
    try {
      sessionStorage.removeItem("gm_admin_session");
      localStorage.removeItem(ACT);
    } catch (e) {}
    try {
      var x = new XMLHttpRequest();
      x.open("POST", "/api/logout", false);
      x.send();
    } catch (e) {}
    location.href = "../login.html?idle=1";
  }
  function ping() {
    // tells the server the person is really using the page
    lastPing = Date.now();
    fetch("/api/keepalive", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    }).then(
      function (r) {
        if (r.status === 401) signOut();
      },
      function () {},
    );
  }
  function warn(secs) {
    if (!warnEl) {
      warnEl = document.createElement("div");
      warnEl.setAttribute("role", "alert");
      warnEl.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#1f2937;color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;font-size:14px;max-width:92vw";
      warnEl.innerHTML =
        '<span></span><button type="button" style="background:#14b8a6;color:#06201d;border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">Stay signed in</button>';
      warnEl.querySelector("button").onclick = function () {
        mark();
        ping();
      };
      document.body.appendChild(warnEl);
    }
    warnEl.firstChild.textContent =
      "You will be signed out in " +
      Math.max(secs, 0) +
      " seconds because of inactivity.";
  }
  function tick() {
    if (!onAdminPage()) return;
    var now = Date.now(),
      idle = now - lastAct();
    if (idle >= LIMIT) {
      signOut();
      return;
    }
    if (idle >= LIMIT - WARN) {
      warn(Math.ceil((LIMIT - idle) / 1000));
      return;
    }
    if (now - lastPing > 4 * 60e3 && idle < 60e3) ping(); // active in the last minute: keep the server session alive
  }
  function start() {
    if (!onAdminPage()) return;
    ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach(
      function (ev) {
        window.addEventListener(ev, mark, { passive: true, capture: true });
      },
    );
    var mm = 0;
    window.addEventListener(
      "mousemove",
      function () {
        var n = Date.now();
        if (n - mm > 5e3) {
          mm = n;
          mark();
        }
      },
      { passive: true },
    );
    mark();
    lastPing = Date.now();
    setInterval(tick, 5e3);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) tick();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* ---- Role info refresh: a sign-in made before roles existed has no role info in this tab, so ask the server once and redraw the menu. ---- */
(function () {
  function go() {
    if (!/\/admin\//.test(location.pathname) || !window.GA || !GA.session)
      return;
    var s = GA.session();
    if (!s || s.full !== undefined || s.super !== undefined) return;
    try {
      if (sessionStorage.getItem("gm_role_try")) return;
      sessionStorage.setItem("gm_role_try", "1");
    } catch (e) {
      return;
    }
    fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(
        function (m) {
          if (!m || m.role !== "admin" || m.full === undefined) return;
          GA.setSession({
            id: s.id,
            name: m.name || s.name,
            role: m.adminRole || s.role,
            perms: m.perms,
            full: m.full,
            super: m.super,
          });
          location.reload();
        },
        function () {},
      );
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", go);
  else go();
})();
