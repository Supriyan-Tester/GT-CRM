/* General Traders - Users & Admins module (shared helpers for super.html, users.html and user-edit.html).
   Loads after admin.js and plan-core.js. All user data comes from the server (/api/users, Super Admin only). */
(function () {
  var US = (window.US = {}),
    esc = function (s) {
      return GA.esc(s);
    };

  // Role list, colour per role, and the module each role starts with. (The server keeps the same lists.)
  // Only these two are accounts. Everyone else (Sales, Billing, Inventory, Delivery, Helper) is added on the Employees page.
  US.ROLES = ["Super Admin", "Admin"];
  US.COLOR = {
    "Super Admin": "#DC2626",
    Admin: "#2563EB",
    Sales: "#7C3AED",
    Billing: "#D97706",
    Inventory: "#0F766E",
    Delivery: "#0284C7",
    Helper: "#DB2777",
  };
  US.MODULES = [
    ["sales", "Sales"],
    ["billing", "Billing"],
    ["inventory", "Inventory"],
    ["delivery", "Delivery"],
    ["helper", "Helper"],
  ];
  US.ROLE_MOD = {
    Sales: "sales",
    Billing: "billing",
    Inventory: "inventory",
    Delivery: "delivery",
    Helper: "helper",
  };
  US.isFullRole = function (r) {
    return r === "Super Admin" || r === "Admin";
  };

  US.role = function (r) {
    return (
      '<span class="us-role" style="--rc:' +
      (US.COLOR[r] || "#64748B") +
      '">' +
      esc(r) +
      "</span>"
    );
  };
  US.status = function (st) {
    var t =
      { active: "Active", inactive: "Inactive", pending: "Pending" }[st] || st;
    return '<span class="us-st ' + esc(st) + '">' + t + "</span>";
  };
  US.avatar = function (u) {
    return (
      '<span class="us-av" style="--rc:' +
      (US.COLOR[u.role] || "#64748B") +
      '">' +
      esc(
        String(u.name || "?")
          .trim()
          .charAt(0)
          .toUpperCase(),
      ) +
      "</span>"
    );
  };
  US.phone = function (p) {
    p = String(p || "");
    return p.length === 10 ? p.slice(0, 5) + " " + p.slice(5) : p;
  };
  var MON = [
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
  US.when = function (t) {
    if (!t) return '<span class="mu">-</span>';
    var d = new Date(t),
      h = d.getHours(),
      ap = h >= 12 ? "PM" : "AM",
      h12 = h % 12 || 12,
      m = String(d.getMinutes()).padStart(2, "0");
    return (
      d.getDate() +
      " " +
      MON[d.getMonth()] +
      " " +
      d.getFullYear() +
      ", " +
      String(h12).padStart(2, "0") +
      ":" +
      m +
      " " +
      ap
    );
  };
  US.ago = function (t) {
    var s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min" + (m > 1 ? "s" : "") + " ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + " hour" + (h > 1 ? "s" : "") + " ago";
    var d = Math.round(h / 24);
    return d + " day" + (d > 1 ? "s" : "") + " ago";
  };

  // Talks to the server. Resolves { ok, status, data }.
  US.api = function (method, url, body) {
    var o = {
      method: method,
      cache: "no-store",
      credentials: "same-origin",
      headers: {},
    };
    if (body !== undefined) {
      o.headers["Content-Type"] = "application/json";
      o.body = JSON.stringify(body);
    }
    return fetch(url, o).then(
      function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (j) {
            return { ok: r.ok, status: r.status, data: j || {} };
          });
      },
      function () {
        return {
          ok: false,
          status: 0,
          data: { error: "The server could not be reached." },
        };
      },
    );
  };
  US.users = function () {
    return US.api("GET", "/api/users").then(function (r) {
      if (r.ok) return r.data;
      var e = new Error(
        r.status === 403
          ? "Only the Super Admin can open this page."
          : r.status === 401
            ? "Please sign in again."
            : r.data.error || "Could not load the users. Try again.",
      );
      e.status = r.status;
      throw e;
    });
  };

  // Shows a temporary password once, with Copy and WhatsApp buttons. o = { title, name, phone, password, intro }
  US.showCredentials = function (o, onClose) {
    var txt =
      "General Traders login\nMobile: " +
      o.phone +
      "\nTemporary password: " +
      o.password +
      "\nYou will be asked to choose your own password when you sign in.";
    var d = DP.dialog({
      title: o.title,
      onClose: onClose,
      html:
        '<p style="font-size:14px">' +
        esc(o.intro || "") +
        '</p><div class="us-cred"><span>Name</span><b style="letter-spacing:0;font-size:15px">' +
        esc(o.name) +
        "</b><span>Mobile</span><b>" +
        esc(US.phone(o.phone)) +
        '</b><span>Temporary password</span><b id="usPw">' +
        esc(o.password) +
        "</b></div>" +
        '<p class="mu" style="font-size:13px">This password is shown only now. The user must choose their own password at first sign-in.</p>' +
        '<div class="us-dlg-acts"><button type="button" class="btn btn-secondary" data-copy>Copy login details</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/91' +
        esc(o.phone) +
        "?text=" +
        encodeURIComponent(txt) +
        '">Send on WhatsApp</a><button type="button" class="btn btn-secondary" data-ok>Done</button></div>',
    });
    d.q("[data-ok]").onclick = function () {
      d.close();
    };
    d.q("[data-copy]").onclick = function () {
      var b = this,
        done = function () {
          b.textContent = "Copied";
        };
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(txt).then(done, function () {
          fallback();
        });
      else fallback();
      function fallback() {
        var t = document.createElement("textarea");
        t.value = txt;
        document.body.appendChild(t);
        t.select();
        try {
          document.execCommand("copy");
          done();
        } catch (e) {}
        t.remove();
      }
    };
    return d;
  };

  // Resets a user's password after asking, then shows the new temporary one.
  US.resetPassword = function (u, after) {
    var d = DP.dialog({
      title: "Reset password?",
      html:
        '<p style="font-size:14px">A new temporary password will be created for <b>' +
        esc(u.name) +
        '</b>. Their old password stops working and they are signed out.</p><div class="us-dlg-acts"><button type="button" class="btn btn-secondary" data-no>Cancel</button><button type="button" class="btn" data-yes>Reset password</button></div>',
    });
    d.q("[data-no]").onclick = function () {
      d.close();
    };
    d.q("[data-yes]").onclick = function () {
      var b = this;
      b.disabled = true;
      b.textContent = "Resetting...";
      US.api("POST", "/api/users/" + encodeURIComponent(u.id) + "/reset").then(
        function (r) {
          d.close();
          if (!r.ok) {
            DP.toast(r.data.error || "Could not reset the password.", "err");
            return;
          }
          US.showCredentials(
            {
              title: "Password reset",
              name: u.name,
              phone: u.phone,
              password: r.data.tempPassword,
              intro: "Give this new temporary password to the user.",
            },
            after,
          );
        },
      );
    };
  };

  // Turns a user on or off after asking. Calls done(newUser) on success.
  US.setActive = function (u, makeActive, done) {
    var d = DP.dialog({
      title: makeActive ? "Activate user?" : "Deactivate user?",
      html:
        '<p style="font-size:14px">' +
        (makeActive
          ? "<b>" + esc(u.name) + "</b> will be able to sign in again."
          : "<b>" +
            esc(u.name) +
            "</b> will be signed out and will not be able to sign in until you activate the account again. Their history stays.") +
        '</p><div class="us-dlg-acts"><button type="button" class="btn btn-secondary" data-no>Cancel</button><button type="button" class="btn' +
        (makeActive ? "" : " btn-danger") +
        '" data-yes>' +
        (makeActive ? "Activate" : "Deactivate") +
        "</button></div>",
    });
    d.q("[data-no]").onclick = function () {
      d.close();
    };
    d.q("[data-yes]").onclick = function () {
      var b = this;
      b.disabled = true;
      US.api("PUT", "/api/users/" + encodeURIComponent(u.id), {
        status: makeActive ? "active" : "inactive",
      }).then(function (r) {
        d.close();
        if (!r.ok) {
          DP.toast(r.data.error || "Could not change the status.", "err");
          return;
        }
        DP.toast(u.name + (makeActive ? " activated." : " deactivated."), "ok");
        if (done) done(r.data.user);
      });
    };
  };
})();
