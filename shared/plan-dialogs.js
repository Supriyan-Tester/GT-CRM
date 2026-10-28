/* General Traders - Daily Plan: the workflows that change a plan (add plan, priority shop, change order, employee, vehicle, cancel, ...).
   Every change is made on the newest saved data, checked again there, and reported as done only after it was saved. */
(function () {
  "use strict";
  var DP = window.DP,
    O = GA.ops,
    esc = DP.esc,
    R = DP.money;
  DP.dlg = {};
  var MAX_FILE = 5 * 1024 * 1024;

  function planIn(S, date, id) {
    return DP.plansOn(S, date).filter(function (p) {
      return p.id === id;
    })[0];
  }
  function pastBlock() {
    if (DP.ctx.date() < GA.today()) {
      DP.toast("This date is in the past, so its plans are view only.", "warn");
      return true;
    }
    return false;
  }
  function errMsg(api, m) {
    var e = api.q("[data-msg]");
    if (e) {
      e.textContent = m || "";
    }
  }
  // Result of a save, in plain words. The change itself is never reported unless it was written.
  function afterSave(res, okText, workerName) {
    if (res.server === "failed" || res.server === "pending") {
      DP.toast(
        okText +
          " Saved on this computer, but the server has not confirmed it yet" +
          (workerName
            ? ", so " + workerName + "'s phone will not see it until it does"
            : "") +
          ". It will keep retrying.",
        "warn",
        {
          label: "Retry now",
          run: function () {
            DP.commit(function () {
              return { ok: true };
            }).then(function (r) {
              DP.toast(
                r.ok && r.server === "saved"
                  ? "Sent to the server."
                  : r.ok
                    ? "Still not confirmed. Check the connection."
                    : r.error,
                r.ok && r.server === "saved" ? "ok" : "warn",
              );
            });
          },
        },
      );
    } else
      DP.toast(
        okText +
          (workerName
            ? " It reaches " +
              workerName +
              "'s phone the next time the app syncs."
            : ""),
        "ok",
      );
  }
  DP.afterSave = afterSave;
  function ctxLine(p, extra) {
    return (
      '<div class="dp-ctx"><div><span>Route</span> <b>' +
      esc(p.routeName) +
      "</b></div><div><span>Employee</span> <b>" +
      esc(p.worker) +
      "</b></div><div><span>Vehicle</span> <b>" +
      esc(p.vehicle) +
      "</b></div>" +
      (extra || "") +
      "</div>"
    );
  }
  function footer(cancelLabel, okLabel, danger) {
    return (
      '<div class="dp-foot"><button type="button" class="btn btn-secondary" data-no>' +
      esc(cancelLabel) +
      '</button><button type="button" class="btn' +
      (danger ? " btn-danger" : "") +
      '" data-ok>' +
      esc(okLabel) +
      "</button></div>"
    );
  }
  function guardPlan(id) {
    var S = DP.fresh(),
      p = planIn(S, DP.ctx.date(), id);
    if (!p) {
      DP.toast("That plan no longer exists.", "err");
      return null;
    }
    if (p.status === "cancelled") {
      DP.toast("That plan is cancelled.", "warn");
      return null;
    }
    return p;
  }

  /* ======================= Add plan ======================= */
  DP.dlg.addPlan = function () {
    if (pastBlock()) return;
    var date = DP.ctx.date(),
      S = DP.fresh();
    var st = {
      helpers: [],
      order: "route",
      id: DP.uid("P"),
      bills: null,
      fileName: "",
      rows: [],
      carryOff: {},
      busy: false,
      rk: 0,
      more: [],
    };
    st.rows.push(blank());
    var rp = null,
      wp = null,
      vp = null,
      rowPk = {};
    function blank() {
      return { k: ++st.rk, code: "", inv: "", amount: "", boxes: "" };
    }
    var step = 0,
      STEPS = [
        [
          "Plan Details",
          "Select the route (you can add more than one), employee and vehicle for this daily plan.",
        ],
        [
          "Invoice / Shops",
          "Upload the daily bill or enter invoices for this route.",
        ],
        ["Review", "Check the details before creating the daily plan."],
        ["Create", ""],
      ];
    var api = DP.dialog({
      title: "Add Daily Plan",
      wide: true,
      cls: "dpw-dlg",
      html:
        '<div class="dpw"><aside class="dpw-side"><span class="dpw-logo">' +
        GA.icon("calendar") +
        '</span><h3 class="dpw-t">Add Daily Plan</h3><p class="dpw-d">Create a daily plan to manage deliveries, track invoices and assign an employee, vehicle and route.</p><ol class="dpw-steps" id="apSteps"></ol>' +
        '<div class="dpw-tip"><b>Tip</b>A daily plan helps you assign work, track deliveries and manage invoices on the day.</div></aside>' +
        '<section class="dpw-main"><header class="dpw-h"><div><h3 id="apHT"></h3><p id="apHS"></p></div><span class="dpw-date">' +
        GA.icon("calendar") +
        " " +
        esc(DP.niceDate(date)) +
        "</span></header>" +
        '<div class="dpw-pane" data-p="0"><div class="a-fg"><label class="dp-lbl" id="apRL">Route <b class="dpw-req">*</b></label><div id="apRoute"></div><div id="apMore"></div></div><div id="apPrev"></div>' +
        '<div class="dp-two"><div class="a-fg"><label class="dp-lbl" id="apWL">Employee <b class="dpw-req">*</b></label><div id="apWork"></div></div><div class="a-fg"><label class="dp-lbl" id="apVL">Vehicle <b class="dpw-req">*</b></label><div id="apVeh"></div></div></div>' +
        '<div class="a-fg"><label class="dp-lbl">Helpers <em>(optional: riding along with the driver)</em></label><div id="apHelp" class="dp-helpers"></div></div>' +
        '<div class="a-fg"><label class="dp-lbl" for="apNotes">Plan notes <em>(optional, for the office)</em></label><textarea class="a-ta" id="apNotes" maxlength="300" rows="3" placeholder="Example: Priority, cover new customers in this area"></textarea></div></div>' +
        '<div class="dpw-pane" data-p="1" hidden><div id="apCarry"></div><div class="a-fg"><label class="dp-lbl" for="apFile">Upload Optech invoice file <em>(.xlsx)</em></label><div class="dpw-drop"><span>' +
        DP.icon("upload") +
        '</span><b>Choose the daily bill file</b><small>Supports Optech .xlsx files (also .csv or .txt lists)</small><em class="dpw-pick">Choose File</em><input class="a-file" type="file" id="apFile" accept=".xlsx,.csv,.txt" aria-label="Choose the daily bill file"></div><div class="mu" id="apFileInfo" style="font-size:13px;margin-top:8px" aria-live="polite"></div></div>' +
        '<details class="dp-man" id="apMan" open><summary>Or enter invoices manually</summary><div id="apRows"></div></details></div>' +
        '<div class="dpw-pane" data-p="2" hidden><div id="apReview"></div></div>' +
        '<div class="dpw-pane" data-p="3" hidden><div id="apDone"></div></div>' +
        '<div class="dp-formmsg" data-msg role="alert"></div><div class="dp-foot dpw-foot"><button type="button" class="btn btn-secondary" data-no>Cancel</button><button type="button" class="btn" data-ok>Next</button></div></section></div>',
      onOpen: function (a) {
        api = a;
        init(a);
      },
    });
    function show(n) {
      step = n;
      var q = function (x) {
        return api.q(x);
      };
      api.qa(".dpw-pane").forEach(function (p) {
        p.hidden = +p.dataset.p !== n;
      });
      q("#apSteps").innerHTML = STEPS.map(function (x, i) {
        return (
          '<li class="' +
          (i === n ? "on" : i < n || n === 3 ? "done" : "") +
          '"' +
          (i === n ? ' aria-current="step"' : "") +
          "><i>" +
          (i < n || n === 3 ? "&#10003;" : i + 1) +
          "</i><span>" +
          x[0] +
          "</span></li>"
        );
      }).join("");
      q(".dpw-h").hidden = n === 3;
      if (n < 3) {
        q("#apHT").textContent =
          n === 1
            ? "Add Invoice / Select Shops"
            : n === 2
              ? "Review Plan"
              : "Plan Details";
        q("#apHS").textContent = STEPS[n][1];
      }
      q("[data-no]").textContent =
        n === 0 ? "Cancel" : n === 3 ? "Create Another Plan" : "Back";
      q("[data-ok]").textContent =
        n === 2 ? "Create Daily Plan" : n === 3 ? "View Daily Plan" : "Next";
      errMsg(api, "");
      var sh = api.root;
      if (sh && sh.scrollTo) sh.scrollTo(0, 0);
    }
    function reviewStops() {
      S = DP.fresh();
      var r = routeOf(),
        out = [],
        left = 0;
      if (!r) return { list: out, left: 0 };
      var taken = DP.invTaken(S, date),
        inv = {},
        idx = custIdx();
      carryList()
        .filter(function (s) {
          return !st.carryOff[s.inv];
        })
        .forEach(function (s) {
          if (taken[s.inv]) return;
          taken[s.inv] = 1;
          out.push({
            code: s.code,
            name: s.name,
            inv: s.inv,
            amount: +s.amount || 0,
            items: s.items ? s.items.length : 0,
            tag: "Carried over",
          });
        });
      st.rows.filter(rowStarted).forEach(function (x) {
        var i = x.inv.trim();
        if (!x.code || r.codes.indexOf(x.code) < 0 || taken[i]) return;
        taken[i] = 1;
        (inv[x.code] = inv[x.code] || []).push({
          inv: i,
          amount: Number(x.amount) || 0,
          items: 0,
        });
      });
      (st.bills || []).forEach(function (b) {
        var code = idx[DP.nk(b.party)];
        if (!code || taken[b.inv] || r.codes.indexOf(code) < 0) {
          left++;
          return;
        }
        taken[b.inv] = 1;
        (inv[code] = inv[code] || []).push({
          inv: b.inv,
          amount: b.amount,
          items: (b.items || []).length,
        });
      });
      r.codes.forEach(function (code) {
        (inv[code] || []).forEach(function (i) {
          var c = DP.cust(S, code) || { name: code };
          out.push({
            code: code,
            name: c.name,
            inv: i.inv,
            amount: i.amount,
            items: i.items,
          });
        });
      });
      var res = { list: out, left: left, near: null };
      if (st.order === "nearest") {
        var fixed = out.filter(function (x) {
            return x.tag;
          }),
          rest = out.filter(function (x) {
            return !x.tag;
          });
        var gp = function (x) {
            return DP.coord(DP.cust(S, x.code));
          },
          key = rest
            .map(function (x) {
              return x.code;
            })
            .join("|"),
          c = st.road && st.road.key === key ? st.road : null;
        var n = DP.nearestOrder(rest, gp, c && c.M ? c.M : null);
        res.near = n;
        res.list = fixed.concat(n.items);
        res.road = !c ? "new" : c.M ? "ok" : c.done ? "failed" : "pending";
        if (!c) {
          st.road = { key: key };
          DP.roadMatrix(rest.map(gp).filter(Boolean)).then(function (M) {
            st.road = { key: key, M: M, done: true };
            if (step === 2 && st.order === "nearest")
              buildReview(reviewStops());
          });
        }
        st.finalOrder = res.list.map(function (x) {
          return x.inv;
        });
      }
      return res;
    }
    function step0() {
      S = DP.fresh();
      if (!routeOf()) {
        errMsg(
          api,
          "Choose a route. Add one on the Routes page if the list is empty.",
        );
        rp.focus();
        return false;
      }
      if (!wp.get()) {
        errMsg(api, "Choose an employee.");
        wp.focus();
        return false;
      }
      if (!vp.get()) {
        errMsg(api, "Choose a vehicle.");
        vp.focus();
        return false;
      }
      return true;
    }
    function step1() {
      var v = validateRows();
      if (v.bad) {
        api.q("#apMan").open = true;
        errMsg(
          api,
          "Fix the " +
            v.bad +
            " highlighted invoice row" +
            (v.bad > 1 ? "s" : "") +
            " (or delete them).",
        );
        return false;
      }
      var rv = reviewStops();
      if (!rv.list.length) {
        errMsg(
          api,
          st.bills && st.bills.length
            ? "No bills in this file belong to the shops on this route. Choose another route."
            : "Nothing to add. Upload the daily bill, enter invoices, or tick the carried-over shops.",
        );
        return false;
      }
      buildReview(rv);
      return true;
    }
    function buildReview(rv) {
      var r = routeOf(),
        w = DP.workerById(wp.get()) || {},
        vh = DP.vehicleById(vp.get()) || {},
        tot = rv.list.reduce(function (a, s) {
          return a + s.amount;
        }, 0),
        notes = api.q("#apNotes").value.trim();
      function box(ic, l, v, sub) {
        return (
          '<div class="dpw-sum"><span>' +
          ic +
          "</span><div><small>" +
          l +
          "</small><b>" +
          esc(v) +
          "</b>" +
          (sub ? "<em>" + esc(sub) + "</em>" : "") +
          "</div></div>"
        );
      }
      DP.$("apReview").innerHTML =
        '<div class="dpw-sums">' +
        box(GA.icon("calendar"), "Date", DP.niceDate(date)) +
        box(DP.icon("route"), "Route", r.name, r.codes.length + " customers") +
        box(GA.icon("users"), "Employee", w.name || "", w.phone || "") +
        box(GA.icon("truck"), "Vehicle", vh.number || "", vh.type || "") +
        box(
          DP.icon("document"),
          "Invoice file",
          st.fileName || "Manual entry",
          st.bills ? st.bills.length + " bills in file" : "",
        ) +
        box(DP.icon("note"), "Notes", notes || "None") +
        "</div>" +
        (rv.left
          ? '<div class="dp-banner">' +
            rv.left +
            " bill" +
            (rv.left > 1 ? "s" : "") +
            " in the file are not for this route (or already planned) and will be left out.</div>"
          : "") +
        '<div class="dpw-ord" role="radiogroup" aria-label="Order of shops"><label class="' +
        (st.order === "route" ? "on" : "") +
        '"><input type="radio" name="apOrd" value="route"' +
        (st.order === "route" ? " checked" : "") +
        '><b>Saved route order</b><small>Follow the order saved on the route</small></label><label class="' +
        (st.order === "nearest" ? "on" : "") +
        '"><input type="radio" name="apOrd" value="nearest"' +
        (st.order === "nearest" ? " checked" : "") +
        "><b>Nearest route (by road)</b><small>Closest next shop first, using road distances from the map pins</small></label></div>" +
        (rv.near
          ? '<div class="dp-note-box">' +
            (rv.near.km == null
              ? "Too few shops have a map pin (" +
                rv.near.pinned +
                " of " +
                rv.near.total +
                "), so the saved route order is kept."
              : rv.near.pinned +
                " of " +
                rv.near.total +
                " shops have a map pin. " +
                (rv.near.method === "road"
                  ? "Ordered by <b>road distance</b> (about " +
                    rv.near.km.toFixed(1) +
                    " km of driving between the shops)."
                  : rv.road === "failed"
                    ? "The road service could not be reached, so this is ordered by <b>straight-line</b> distance (about " +
                      rv.near.km.toFixed(1) +
                      " km). Check the internet connection and choose the option again to retry."
                    : "Calculating road distances... this order is straight-line for now and will update.") +
                (rv.near.total - rv.near.pinned
                  ? " " +
                    (rv.near.total - rv.near.pinned) +
                    " without a pin are placed at the end in route order."
                  : "")) +
            "</div>"
          : "") +
        '<h4 class="dpw-sh">Shops &amp; invoices (' +
        rv.list.length +
        ')</h4><div class="a-scroll"><table class="dp-table dpw-rt"><thead><tr><th>#</th><th>Code</th><th>Shop</th><th>Invoice</th><th class="r">Items</th><th class="r">Amount</th></tr></thead><tbody>' +
        rv.list
          .map(function (s, i) {
            return (
              "<tr><td>" +
              (i + 1) +
              "</td><td>" +
              esc(s.code) +
              "</td><td>" +
              esc(s.name) +
              (s.tag
                ? ' <span class="badge b-accent">' + s.tag + "</span>"
                : "") +
              "</td><td>" +
              esc(s.inv) +
              '</td><td class="r">' +
              (s.items || "-") +
              '</td><td class="r">' +
              R(s.amount) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>" +
        '<div class="dp-tot"><span class="mu">' +
        (st.order === "nearest"
          ? "Starts at the first shop of the route, then goes to the nearest next shop. You can still change the order after creating the plan."
          : "Customers are loaded in the saved route order. You can reorder them from the plan after creating it.") +
        "</span><span>Total <b>" +
        R(tot) +
        "</b></span></div>";
    }
    function showDone(p) {
      var w = DP.workerById(p.workerId) || {};
      DP.$("apDone").innerHTML =
        '<div class="dpw-ok"><span class="dpw-okic">' +
        GA.icon("check") +
        "</span><h3>Daily Plan Created Successfully!</h3><p>The plan has been created for " +
        esc(p.worker) +
        ". It reaches their app the next time it syncs.</p></div>" +
        '<dl class="dpw-kv"><div><dt>Plan ID</dt><dd>' +
        esc(String(p.id).toUpperCase()) +
        "</dd></div><div><dt>Date</dt><dd>" +
        esc(DP.niceDate(date)) +
        "</dd></div><div><dt>Route</dt><dd>" +
        esc(p.routeName) +
        "</dd></div><div><dt>Employee</dt><dd>" +
        esc(p.worker) +
        "</dd></div><div><dt>Vehicle</dt><dd>" +
        esc(p.vehicleLabel || p.vehicle) +
        "</dd></div><div><dt>Total shops</dt><dd>" +
        p.stops.length +
        "</dd></div><div><dt>Total invoice amount</dt><dd>" +
        R(p.bill ? p.bill.total : 0) +
        "</dd></div></dl>";
      show(3);
    }
    function routeOptions() {
      return S.routes
        .slice()
        .sort(function (a, b) {
          return a.name.localeCompare(b.name);
        })
        .map(function (r) {
          return {
            value: r.id,
            label: r.name,
            sub:
              r.codes.length + " customer" + (r.codes.length === 1 ? "" : "s"),
          };
        });
    }
    // One or more routes in a plan. With more than one, the shops of all of them are joined in the order the routes were picked.
    function mergeRoutes(list, ids) {
      var rs = ids.map(function (id) {
        return list.filter(function (r) {
          return r.id === id;
        })[0];
      });
      if (
        !rs.length ||
        rs.some(function (r) {
          return !r;
        })
      )
        return null;
      var codes = [];
      rs.forEach(function (r) {
        r.codes.forEach(function (c) {
          if (codes.indexOf(c) < 0) codes.push(c);
        });
      });
      return {
        id: rs[0].id,
        ids: ids.slice(),
        name: rs
          .map(function (r) {
            return r.name;
          })
          .join(" + "),
        codes: codes,
      };
    }
    function routeIds() {
      return rp && rp.get()
        ? [rp.get()].concat(
            st.more.filter(function (i) {
              return i !== rp.get();
            }),
          )
        : [];
    }
    function routeOf() {
      return mergeRoutes(S.routes, routeIds());
    }
    function drawMore() {
      var host = DP.$("apMore");
      if (!host) return;
      var first = rp.get();
      if (!first) {
        host.innerHTML = "";
        return;
      }
      host.innerHTML =
        (st.more.length
          ? '<div class="dp-chips" style="margin-top:8px">' +
            st.more
              .map(function (id) {
                var r = S.routes.filter(function (x) {
                  return x.id === id;
                })[0];
                return r
                  ? '<span class="dp-chip on">' +
                      esc(r.name) +
                      ' <button type="button" data-rm="' +
                      esc(id) +
                      '" aria-label="Remove route ' +
                      esc(r.name) +
                      '" style="border:0;background:none;color:inherit;cursor:pointer;font-weight:800">&times;</button></span>'
                  : "";
              })
              .join("") +
            "</div>"
          : "") + '<div style="margin-top:8px"><div id="apMoreP"></div></div>';
      var mp = DP.picker(DP.$("apMoreP"), {
        label: "Add another route",
        placeholder: "+ Add another route (optional)",
        empty: "No other route.",
        options: function () {
          var used = routeIds();
          return routeOptions().filter(function (o) {
            return used.indexOf(o.value) < 0;
          });
        },
        onChange: function (v) {
          if (v) {
            st.more.push(v);
            drawMore();
            preview();
            renderRows();
            billInfo();
          }
        },
      });
      host.querySelectorAll("[data-rm]").forEach(function (b) {
        b.onclick = function () {
          st.more = st.more.filter(function (i) {
            return i !== b.dataset.rm;
          });
          drawMore();
          preview();
          renderRows();
          billInfo();
        };
      });
    }
    function init(api) {
      rp = DP.picker(api.q("#apRoute"), {
        labelledBy: "apRL",
        placeholder: S.routes.length ? "Search routes..." : "No routes yet",
        options: routeOptions,
        empty: "No route matches.",
        onChange: function () {
          st.more = st.more.filter(function (i) {
            return i !== rp.get();
          });
          drawMore();
          preview();
          renderRows();
          billInfo();
          api.q("[data-msg]").textContent = "";
        },
      });
      wp = DP.picker(api.q("#apWork"), {
        labelledBy: "apWL",
        placeholder: "Search employees...",
        empty: "No employee matches.",
        onChange: function (v) {
          st.helpers = DP.lastHelpers(DP.fresh(), v, date);
          drawHelp();
        },
        options: function () {
          var S2 = DP.fresh();
          return GA.workers()
            .filter(function (w) {
              return w.active;
            })
            .map(function (w) {
              var b = DP.workerBusy(S2, date, w.id),
                lv = GA.onLeaveOn(w.id, date);
              return {
                value: w.id,
                label: w.name,
                sub: GA.empCode(w.id) + (w.phone ? " \u00b7 " + w.phone : ""),
                disabled: !!(b || lv),
                reason: lv
                  ? "On leave on this date"
                  : b
                    ? "Already has a plan (" + b.routeName + ")"
                    : "",
              };
            });
        },
      });
      vp = DP.picker(api.q("#apVeh"), {
        labelledBy: "apVL",
        placeholder: "Search vehicles...",
        empty: "No vehicle matches.",
        options: function () {
          var S2 = DP.fresh();
          return GA.vehicles()
            .filter(function (v) {
              return v.active;
            })
            .map(function (v) {
              var b = DP.vehicleBusy(S2, date, v.id);
              return {
                value: v.id,
                label: v.number + (v.type ? " (" + v.type + ")" : ""),
                disabled: !!b,
                reason: b ? "In use by " + b.worker : "",
              };
            });
        },
      });
      function drawHelp() {
        DP.helperBox(
          DP.$("apHelp"),
          date,
          wp.get(),
          st.helpers,
          null,
          function (L) {
            st.helpers = L;
          },
        );
      }
      drawHelp();
      if (!S.routes.length)
        errMsg(
          api,
          "There are no routes yet. Add one on the Routes page first.",
        );
      show(0);
      api.q("#apReview").addEventListener("change", function (e) {
        if (e.target.name === "apOrd") {
          st.order = e.target.value;
          if (st.road && st.road.done && !st.road.M) st.road = null;
          buildReview(reviewStops());
        }
      });
      api.q("[data-no]").onclick = function () {
        if (step === 0) api.close();
        else if (step === 3) {
          api.close(true);
          DP.dlg.addPlan();
        } else show(step - 1);
      };
      api.q("[data-ok]").onclick = function () {
        if (step === 0) {
          if (step0()) show(1);
        } else if (step === 1) {
          if (step1()) show(2);
        } else if (step === 2) create(api);
        else api.close(true);
      };
      api.q("#apFile").onchange = function () {
        onFile(api, this);
      };
      var rows = api.q("#apRows");
      rows.addEventListener("input", function (e) {
        var tr = e.target.closest("tr[data-k]");
        if (!tr) return;
        var row = rowByK(+tr.dataset.k),
          f = e.target.dataset.f;
        if (row && f) {
          row[f] = e.target.value;
          e.target.classList.remove("bad");
          updTotal();
        }
      });
      rows.addEventListener("click", function (e) {
        var b = e.target.closest("[data-del]");
        if (b) {
          var k = +b.dataset.del;
          st.rows = st.rows.filter(function (r) {
            return r.k !== k;
          });
          if (!st.rows.length) st.rows.push(blank());
          renderRows();
          return;
        }
        if (e.target.closest("[data-addrow]")) {
          st.rows.push(blank());
          renderRows();
          var last = rows.querySelector(
            'tr[data-k]:last-child input[data-f="inv"]',
          );
          if (last) last.focus();
        }
        if (e.target.closest("[data-paste]")) pasteRows(api);
      });
      renderRows();
      drawCarry(api);
      if (DP.prefill) {
        loadText(DP.prefill);
        DP.prefill = "";
        api.q("#apMan").open = true;
      }
    }
    function rowByK(k) {
      return st.rows.filter(function (r) {
        return r.k === k;
      })[0];
    }

    /* route preview: only facts that are stored; no invented distances or times */
    function preview() {
      var el = DP.$("apPrev"),
        r = routeOf();
      if (!el) return;
      if (!r) {
        el.innerHTML = "";
        return;
      }
      var cs = r.codes.map(function (c) {
          return DP.cust(S, c) || { code: c, name: c };
        }),
        areas = [],
        pins = 0;
      cs.forEach(function (c) {
        var a = c.area || c.place;
        if (a && areas.indexOf(a) < 0) areas.push(a);
        if (DP.coord(c)) pins++;
      });
      el.innerHTML =
        '<div class="dp-preview"><div class="kv"><span><b>' +
        cs.length +
        "</b> customers</span><span><b>" +
        areas.length +
        "</b> area" +
        (areas.length === 1 ? "" : "s") +
        "</span><span><b>" +
        pins +
        "</b> with a map pin</span></div>" +
        (areas.length
          ? '<div class="mu">Area sequence: ' +
            esc(areas.slice(0, 8).join(" > ")) +
            (areas.length > 8 ? " ... +" + (areas.length - 8) + " more" : "") +
            "</div>"
          : "") +
        (cs.length
          ? '<div style="margin-top:8px"><b>First ' +
            Math.min(5, cs.length) +
            " of " +
            cs.length +
            ":</b><ol>" +
            cs
              .slice(0, 5)
              .map(function (c) {
                return (
                  "<li>" +
                  esc(c.name) +
                  ' <span class="mu">' +
                  esc(c.code) +
                  "</span></li>"
                );
              })
              .join("") +
            "</ol></div>"
          : '<div class="mu">This route has no customers yet.</div>') +
        '<div class="mu" style="margin-top:8px">Customers with an invoice are loaded in this saved route order. The route itself is never changed by a daily plan.</div></div>';
    }

    /* manual invoices */
    function routeCustOptions() {
      var r = routeOf();
      if (!r) return [];
      return r.codes.map(function (c) {
        var x = DP.cust(S, c) || { name: c };
        return {
          value: c,
          label: x.name,
          sub: c + (x.area ? " - " + x.area : ""),
          search: c,
        };
      });
    }
    function renderRows() {
      var box = DP.$("apRows");
      if (!box) return;
      Object.keys(rowPk).forEach(function (k) {
        rowPk[k].destroy();
      });
      rowPk = {};
      box.innerHTML =
        '<table class="dp-mt"><thead><tr><th class="num">#</th><th>Customer</th><th>Invoice no.</th><th>Amount</th><th>Boxes</th><th><span class="sr-only" style="position:absolute;left:-9999px">Actions</span></th></tr></thead><tbody>' +
        st.rows
          .map(function (r, i) {
            return (
              '<tr data-k="' +
              r.k +
              '"><td class="num">' +
              (i + 1) +
              '</td><td class="cu"><div data-pk></div></td><td><input data-f="inv" aria-label="Invoice number, row ' +
              (i + 1) +
              '" value="' +
              esc(r.inv) +
              '" placeholder="INV-2041" autocomplete="off"></td>' +
              '<td><input data-f="amount" aria-label="Amount, row ' +
              (i + 1) +
              '" inputmode="decimal" value="' +
              esc(r.amount) +
              '" placeholder="0"></td><td><input data-f="boxes" aria-label="Boxes, row ' +
              (i + 1) +
              '" inputmode="numeric" value="' +
              esc(r.boxes) +
              '" placeholder="0"></td>' +
              '<td><button type="button" class="dp-ib bd" data-del="' +
              r.k +
              '" aria-label="Delete invoice row ' +
              (i + 1) +
              '">' +
              GA.icon("trash") +
              '</button></td></tr><tr data-e="' +
              r.k +
              '" hidden><td></td><td colspan="5" class="dp-err"></td></tr>'
            );
          })
          .join("") +
        '</tbody></table><div class="dp-tot"><span><button type="button" class="btn btn-secondary a-btn" data-addrow>' +
        GA.icon("plus") +
        ' Add another invoice</button> <button type="button" class="btn btn-secondary a-btn" data-paste>Paste rows</button></span><span>Total <b id="apTot"></b></span></div>' +
        '<div class="mu" style="font-size:12px;margin-top:6px">Customers are limited to the selected route(s). Boxes is optional.</div>';
      st.rows.forEach(function (r) {
        var host = box.querySelector('tr[data-k="' + r.k + '"] [data-pk]');
        rowPk[r.k] = DP.picker(host, {
          label: "Customer, row " + (st.rows.indexOf(r) + 1),
          placeholder: routeOf() ? "Choose customer" : "Choose a route first",
          options: routeCustOptions,
          value:
            routeOf() && routeOf().codes.indexOf(r.code) > -1 ? r.code : "",
          empty: "No customer on this route matches.",
          onChange: function (v) {
            r.code = v;
            clearRowErr(r.k);
          },
        });
        if (routeOf() && routeOf().codes.indexOf(r.code) < 0)
          r.code = r.code && !routeOf() ? r.code : r.code ? "" : r.code;
      });
      updTotal();
    }
    function clearRowErr(k) {
      var e = api.q('tr[data-e="' + k + '"]');
      if (e) e.hidden = true;
    }
    function updTotal() {
      var t = 0;
      st.rows.forEach(function (r) {
        var a = Number(r.amount);
        if (r.amount !== "" && isFinite(a)) t += a;
      });
      var el = DP.$("apTot");
      if (el) el.textContent = R(t);
    }
    function rowStarted(r) {
      return !!(
        r.code ||
        r.inv.trim() ||
        String(r.amount).trim() ||
        String(r.boxes).trim()
      );
    }
    // returns { good: [row...], bad: n } and paints inline messages
    function validateRows() {
      var seen = {},
        taken = DP.invTaken(DP.fresh(), date),
        rt = routeOf(),
        good = [],
        bad = 0;
      st.rows.forEach(function (r) {
        var msg = "",
          fld = {};
        if (!rowStarted(r)) return;
        var inv = r.inv.trim(),
          amt = String(r.amount).trim(),
          bx = String(r.boxes).trim();
        if (!r.code) {
          msg = "Choose the customer.";
          fld.code = 1;
        } else if (rt && rt.codes.indexOf(r.code) < 0) {
          msg = "This customer is not on the selected route.";
          fld.code = 1;
        } else if (!inv) {
          msg = "Enter the invoice number.";
          fld.inv = 1;
        } else if (seen[inv]) {
          msg = "Invoice " + inv + " appears twice in this list.";
          fld.inv = 1;
        } else if (taken[inv]) {
          msg = "Invoice " + inv + " is already in a plan for this date.";
          fld.inv = 1;
        } else if (amt === "" || !isFinite(Number(amt)) || Number(amt) < 0) {
          msg = "Enter a valid amount (0 or more).";
          fld.amount = 1;
        } else if (bx !== "" && (!isFinite(Number(bx)) || Number(bx) < 0)) {
          msg = "Boxes must be a number (0 or more).";
          fld.boxes = 1;
        }
        if (inv) seen[inv] = 1;
        var tr = api.q('tr[data-k="' + r.k + '"]'),
          er = api.q('tr[data-e="' + r.k + '"]');
        [].forEach.call(tr.querySelectorAll("input"), function (i) {
          i.classList.toggle("bad", !!fld[i.dataset.f]);
        });
        if (rowPk[r.k]) rowPk[r.k].invalid(!!fld.code);
        er.hidden = !msg;
        er.lastChild.textContent = msg;
        if (msg) bad++;
        else good.push(r);
      });
      return { good: good, bad: bad };
    }
    function pasteRows(api) {
      var d = DP.dialog({
        title: "Paste invoice rows",
        sub: "One invoice per line: <b>invoice, customer code, amount, boxes</b>",
        html:
          '<textarea class="a-ta" id="pcsv" placeholder="INV-2041,C001,4250,3"></textarea><div class="dp-formmsg" data-msg></div>' +
          footer("Cancel", "Add rows"),
        onOpen: function (d) {
          d.q("[data-no]").onclick = function () {
            d.close();
          };
          d.q("[data-ok]").onclick = function () {
            var n = loadText(d.q("#pcsv").value);
            if (!n) {
              d.q("[data-msg]").textContent =
                "No rows found. Use: invoice, customer code, amount, boxes.";
              return;
            }
            d.close();
            api.q("#apMan").open = true;
          };
        },
      });
    }
    function loadText(t) {
      var rows = O.rows(String(t || "")).filter(function (x) {
        return x[1];
      });
      if (!rows.length) return 0;
      var cur = st.rows.filter(rowStarted);
      rows.forEach(function (x) {
        cur.push({
          k: ++st.rk,
          inv: x[0] || "",
          code: x[1] || "",
          amount: x[2] || "",
          boxes: x[3] || "",
        });
      });
      st.rows = cur;
      renderRows();
      return rows.length;
    }

    /* daily bill file (Optech .xlsx is parsed by the existing XLSXLite reader, unchanged) */
    function custIdx() {
      var m = {};
      S.customers.forEach(function (c) {
        if (c.inactive) return;
        var k = DP.nk(c.name);
        if (k && !m[k]) m[k] = c.code;
      });
      return m;
    }
    function billInfo() {
      var el = DP.$("apFileInfo");
      if (!el) return;
      if (!st.bills || !st.bills.length) {
        return;
      }
      var idx = custIdx(),
        taken = DP.invTaken(DP.fresh(), date),
        r = routeOf(),
        onr = 0,
        planned = 0,
        no = {},
        tot = 0;
      st.bills.forEach(function (b) {
        tot += b.amount;
        var code = idx[DP.nk(b.party)];
        if (taken[b.inv]) {
          planned++;
          return;
        }
        if (!code) {
          no[b.party] = 1;
          return;
        }
        if (r && r.codes.indexOf(code) > -1) onr++;
      });
      var nn = Object.keys(no).length;
      el.innerHTML =
        "<b>" +
        esc(st.fileName) +
        "</b> &middot; <b>" +
        st.bills.length +
        " bills</b> (" +
        R(tot) +
        ") &middot; <b>" +
        onr +
        "</b> on this route" +
        (planned ? " &middot; " + planned + " already planned" : "") +
        (nn
          ? "<br>&#9888; " +
            nn +
            " shop" +
            (nn > 1 ? "s" : "") +
            " not in Customers: " +
            esc(Object.keys(no).slice(0, 4).join(", ")) +
            (nn > 4 ? " and " + (nn - 4) + " more" : "") +
            ". Import this bill on the Customers page to add them."
          : "");
    }
    function onFile(api, inp) {
      var f = inp.files[0],
        el = DP.$("apFileInfo");
      if (!f) {
        st.bills = null;
        st.fileName = "";
        el.textContent = "";
        return;
      }
      if (!/\.(xlsx|csv|txt)$/i.test(f.name)) {
        st.bills = null;
        st.fileName = "";
        inp.value = "";
        el.innerHTML =
          '<span class="dp-err">Choose an Optech .xlsx file (or a .csv / .txt list of invoices).</span>';
        return;
      }
      if (f.size > MAX_FILE) {
        st.bills = null;
        st.fileName = "";
        inp.value = "";
        el.innerHTML =
          '<span class="dp-err">That file is larger than 5 MB.</span>';
        return;
      }
      S = DP.fresh();
      var isX = /\.xlsx$/i.test(f.name),
        fr = new FileReader();
      el.textContent = "Reading " + f.name + "...";
      fr.onerror = function () {
        el.innerHTML = '<span class="dp-err">Could not read that file.</span>';
      };
      fr.onload = function () {
        if (!isX) {
          st.bills = null;
          st.fileName = f.name;
          var n = loadText(String(fr.result));
          el.innerHTML = n
            ? "<b>" +
              esc(f.name) +
              "</b>: " +
              n +
              " invoice row" +
              (n === 1 ? "" : "s") +
              " added to the manual list."
            : '<span class="dp-err">No invoice rows found in that file.</span>';
          if (n) api.q("#apMan").open = true;
          return;
        }
        XLSXLite.parse(fr.result)
          .then(function (rows) {
            var B = XLSXLite.bill(rows);
            if (!B)
              throw new Error(
                "This is not an Optech daily bill file (no Bill No and Party Name columns).",
              );
            if (!B.bills.length)
              throw new Error("No bills found in this file.");
            st.bills = B.bills;
            st.fileName = f.name;
            billInfo();
          })
          .catch(function (e) {
            st.bills = null;
            st.fileName = "";
            el.innerHTML =
              '<span class="dp-err">' +
              esc(String((e && e.message) || e)) +
              "</span>";
          });
      };
      if (isX) fr.readAsArrayBuffer(f);
      else fr.readAsText(f);
    }

    /* shops that could not be delivered on an earlier day (existing behaviour) */
    function carryList() {
      var best = null,
        out = [],
        taken = DP.invTaken(DP.fresh(), date);
      Object.keys(DP.recs).forEach(function (id) {
        var a = DP.recs[id].appliedPlan;
        if (!a) return;
        var d = a.split(":")[0];
        if (d < date && /^\d{4}-/.test(d) && (!best || d > best)) best = d;
      });
      if (!best) return out;
      Object.keys(DP.recs).forEach(function (id) {
        var r = DP.recs[id];
        if (!r.appliedPlan || r.appliedPlan.split(":")[0] !== best) return;
        (r.shops || []).forEach(function (s) {
          if (s.status === "retry" && !taken[s.billNo]) {
            var w = DP.workerById(id);
            out.push({
              code: s.code || "",
              name: s.name,
              address: s.address === "-" ? "" : s.address || "",
              inv: s.billNo,
              amount: s.billAmount,
              boxes: s.boxes,
              items: s.items,
              from: w ? w.name : id,
              day: best,
            });
          }
        });
      });
      return out;
    }
    function drawCarry(api) {
      var c = carryList(),
        el = DP.$("apCarry");
      if (!el) return;
      el.innerHTML = c.length
        ? '<div class="dp-co"><b>' +
          c.length +
          " shop" +
          (c.length > 1 ? "s" : "") +
          " could not be delivered earlier.</b> Tick the ones to deliver first in this plan." +
          c
            .map(function (s) {
              return (
                '<label><input type="checkbox" data-co="' +
                esc(s.inv) +
                '"' +
                (st.carryOff[s.inv] ? "" : " checked") +
                "><span><b>" +
                esc(s.name) +
                "</b> &middot; " +
                esc(s.inv) +
                " &middot; " +
                R(s.amount) +
                " &middot; " +
                (s.items && s.items.length
                  ? s.items.length + " items"
                  : esc(s.boxes) + " box(es)") +
                '<br><span class="mu">' +
                esc(s.from) +
                ", " +
                esc(s.day) +
                "</span></span></label>"
              );
            })
            .join("") +
          "</div>"
        : "";
      el.onchange = function (e) {
        var k = e.target.getAttribute("data-co");
        if (k) st.carryOff[k] = !e.target.checked;
      };
    }

    /* create */
    function create(api) {
      if (st.busy) return;
      errMsg(api, "");
      var btn = api.q("[data-ok]");
      S = DP.fresh();
      var r = routeOf(),
        wid = wp.get(),
        vid = vp.get();
      if (!r) {
        errMsg(
          api,
          "Choose a route. Add one on the Routes page if the list is empty.",
        );
        rp.focus();
        return;
      }
      if (!wid) {
        errMsg(api, "Choose an employee.");
        wp.focus();
        return;
      }
      if (!vid) {
        errMsg(api, "Choose a vehicle.");
        vp.focus();
        return;
      }
      var v = validateRows();
      if (v.bad) {
        api.q("#apMan").open = true;
        errMsg(
          api,
          "Fix the " +
            v.bad +
            " highlighted invoice row" +
            (v.bad > 1 ? "s" : "") +
            " (or delete them).",
        );
        return;
      }
      var carry = carryList().filter(function (s) {
        return !st.carryOff[s.inv];
      });
      DP.setBusy(api, btn, true, "Creating...");
      st.busy = true;
      var out = {};
      DP.commit(function (S2) {
        var L = DP.plansOn(S2, date);
        if (
          L.some(function (p) {
            return p.id === st.id;
          })
        ) {
          out.already = true;
          return { ok: true };
        } // a repeated click or retry never makes a second plan
        var route = mergeRoutes(S2.routes, r.ids),
          w = DP.workerById(wid),
          vh = DP.vehicleById(vid);
        if (!route)
          return { ok: false, error: "One of the routes no longer exists." };
        if (!w || !w.active)
          return { ok: false, error: "That employee is not available." };
        if (GA.onLeaveOn(wid, date))
          return { ok: false, error: w.name + " is on leave on this date." };
        if (!vh || !vh.active)
          return { ok: false, error: "That vehicle is not available." };
        var bw = DP.workerBusy(S2, date, wid),
          bv = DP.vehicleBusy(S2, date, vid);
        if (bw)
          return {
            ok: false,
            error:
              w.name +
              " already has a plan on this date (" +
              bw.routeName +
              ").",
          };
        var hs = [],
          hbad = "";
        st.helpers.forEach(function (hid) {
          var hw = DP.workerById(hid);
          if (!hw || !hw.active || hid === wid || hbad) return;
          if (GA.onLeaveOn(hid, date))
            hbad = hw.name + " (helper) is on leave on this date.";
          else if (DP.workerBusy(S2, date, hid))
            hbad = hw.name + " (helper) already has a plan on this date.";
          else hs.push(hid);
        });
        if (hbad) return { ok: false, error: hbad };
        if (bv)
          return {
            ok: false,
            error:
              "Vehicle " +
              vh.number +
              " is already used by " +
              bv.worker +
              " on this date.",
          };
        var plan = {
          id: st.id,
          route: route.id,
          routeName: route.name,
          routeIds: route.ids.length > 1 ? route.ids : undefined,
          vehicleId: vh.id,
          vehicle: vh.number,
          vehicleLabel: vh.number + (vh.type ? " (" + vh.type + ")" : ""),
          vehicleKm: vh.lastKm,
          workerId: w.id,
          worker: w.name,
          helpers: hs,
          builtAt: Date.now(),
          stops: [],
          createdBy: DP.actor(),
          createdAt: Date.now(),
        };
        var nt = api.q("#apNotes").value.trim();
        if (nt) plan.notes = nt;
        var taken = DP.invTaken(S2, date),
          inv = {},
          extra = [],
          dup = [],
          noCust = {};
        carry.forEach(function (s) {
          if (taken[s.inv]) return;
          taken[s.inv] = 1;
          plan.stops.push({
            code: s.code,
            name: s.name,
            address: s.address,
            inv: s.inv,
            amount: s.amount,
            boxes: s.boxes,
            items: s.items,
            carried: true,
          });
        });
        st.rows.filter(rowStarted).forEach(function (x) {
          var code = x.code,
            i = x.inv.trim();
          if (!code) return;
          if (taken[i]) {
            dup.push(i);
            return;
          }
          if (route.codes.indexOf(code) > -1) {
            taken[i] = 1;
            (inv[code] = inv[code] || []).push({
              inv: i,
              amount: Number(x.amount),
              boxes: String(x.boxes).trim() === "" ? 0 : Number(x.boxes),
            });
          } else extra.push([i, code]);
        });
        var idx = {};
        S2.customers.forEach(function (c) {
          if (c.inactive) return;
          var k = DP.nk(c.name);
          if (k && !idx[k]) idx[k] = c.code;
        });
        (st.bills || []).forEach(function (b) {
          if (taken[b.inv]) {
            if (
              !inv[idx[DP.nk(b.party)]] ||
              !inv[idx[DP.nk(b.party)]].some(function (q) {
                return q.inv === b.inv;
              })
            )
              dup.push(b.inv);
            return;
          }
          var code = idx[DP.nk(b.party)];
          if (!code) {
            noCust[b.party] = 1;
            return;
          }
          if (route.codes.indexOf(code) > -1) {
            taken[b.inv] = 1;
            (inv[code] = inv[code] || []).push({
              inv: b.inv,
              amount: b.amount,
              boxes: b.qty,
              items: b.items,
            });
          } else extra.push([b.inv, code, b.party]);
        });
        // customers come out in the saved route order
        route.codes.forEach(function (code) {
          (inv[code] || []).forEach(function (i) {
            var c = DP.cust(S2, code) || { name: code };
            plan.stops.push({
              code: code,
              name: c.name,
              address: c.address || "",
              inv: i.inv,
              amount: i.amount,
              boxes: i.boxes,
              items: i.items,
            });
          });
        });
        if (!plan.stops.length)
          return {
            ok: false,
            error:
              st.bills && st.bills.length
                ? "No bills in this file belong to the shops on this route. Choose another route."
                : "Nothing to add. Choose the daily bill, enter invoices, or tick the carried-over shops.",
          };
        var tot = plan.stops.reduce(function (a, s) {
          return a + (+s.amount || 0);
        }, 0);
        plan.bill = {
          source: st.bills
            ? st.rows.some(rowStarted)
              ? "file + manual"
              : "file"
            : "manual",
          fileName: st.fileName || "",
          total: tot,
          count: plan.stops.length,
        };
        if (st.order === "nearest") {
          var fx = plan.stops.filter(function (x) {
              return x.carried;
            }),
            rs = plan.stops.filter(function (x) {
              return !x.carried;
            });
          var pos = {};
          (st.finalOrder || []).forEach(function (v, k) {
            pos[v] = k;
          });
          rs = rs
            .map(function (x, k) {
              return { x: x, k: k, o: x.inv in pos ? pos[x.inv] : 1e9 };
            })
            .sort(function (a, b) {
              return a.o - b.o || a.k - b.k;
            })
            .map(function (z) {
              return z.x;
            });
          plan.stops = fx.concat(rs);
          plan.orderMode = "nearest";
        }
        plan.origOrder = plan.stops.map(function (s) {
          return s.inv;
        });
        DP.history(
          plan,
          "created",
          "Plan created for " +
            w.name +
            (hs.length
              ? " with helper" +
                (hs.length > 1 ? "s " : " ") +
                hs
                  .map(function (i) {
                    return (DP.workerById(i) || {}).name || i;
                  })
                  .join(", ")
              : "") +
            " on " +
            route.name +
            " (" +
            plan.stops.length +
            " deliveries).",
        );
        L = L.slice();
        L.push(plan);
        S2.plans[date] = L;
        out.plan = plan;
        out.extra = extra;
        out.dup = dup;
        out.noCust = Object.keys(noCust);
        return { ok: true };
      }).then(function (res) {
        DP.setBusy(api, btn, false, "");
        st.busy = false;
        if (!res.ok) {
          errMsg(api, res.error);
          return;
        }
        var p = out.plan;
        if (out.already) {
          api.close(true);
          DP.ctx.select(st.id, true);
          return;
        }
        DP.ctx.select(p.id, true);
        var warn = [];
        if (out.extra.length)
          warn.push(
            out.extra.length + " invoice(s) not on this route were left out",
          );
        if (out.dup.length)
          warn.push(
            out.dup.length +
              " invoice(s) skipped because they are already planned (" +
              out.dup.slice(0, 5).join(", ") +
              ")",
          );
        if (out.noCust.length)
          warn.push(
            out.noCust.length + " bill party name(s) are not in Customers",
          );
        afterSave(
          res,
          "Plan created for " +
            p.worker +
            ": " +
            p.stops.length +
            " deliveries.",
        );
        if (warn.length) DP.ctx.note("&#9888; " + esc(warn.join(". ")) + ".");
        showDone(p);
      });
    }
  };

  /* ======================= Priority shop ======================= */
  DP.dlg.priority = function (planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      pk;
    DP.dialog({
      title: "Add priority shop",
      sub: "Added to this plan only. The saved route is not changed.",
      html:
        ctxLine(p0) +
        '<div class="a-fg"><label class="dp-lbl" id="prL">Customer</label><div id="prC"></div><div class="mu" style="font-size:12px;margin-top:6px">Shop not listed? Add it on the <a href="customers.html">Customers page</a> first.</div></div>' +
        '<div class="dp-two"><div class="a-fg"><label class="dp-lbl" for="prT">Visit time <em>(optional)</em></label><div class="field a-f"><input type="time" id="prT"></div></div>' +
        '<div class="a-fg"><label class="dp-lbl" for="prP">Place in the plan</label><div class="field a-f"><select id="prP"><option value="next">Next stop (before the other pending shops)</option><option value="end">At the end of the plan</option></select></div></div></div>' +
        '<div class="a-fg"><label class="dp-lbl" for="prN">Note <em>(optional, shown to the employee)</em></label><div class="field a-f" style="height:auto"><textarea id="prN" rows="2" maxlength="200" style="padding:10px 12px;resize:vertical"></textarea></div></div>' +
        '<div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Cancel", "Add priority shop"),
      onOpen: function (api) {
        var S = DP.fresh();
        pk = DP.picker(api.q("#prC"), {
          labelledBy: "prL",
          placeholder: "Search by name, code, area or phone...",
          empty: "No customer matches.",
          options: function () {
            return S.customers
              .filter(function (c) {
                return !c.inactive;
              })
              .map(function (c) {
                return {
                  value: c.code,
                  label: c.name,
                  sub:
                    c.code +
                    (c.area || c.place ? " - " + (c.area || c.place) : ""),
                  search: [c.code, c.phone, c.address].join(" "),
                };
              });
          },
        });
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          var code = pk.get();
          errMsg(api, "");
          if (!code) {
            pk.invalid(true);
            errMsg(api, "Choose the customer to add.");
            pk.focus();
            return;
          }
          var btn = api.q("[data-ok]"),
            time = api.q("#prT").value,
            note = api.q("#prN").value.trim(),
            pos = api.q("#prP").value,
            out = {};
          DP.setBusy(api, btn, true, "Adding...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var c = DP.cust(S2, code);
            if (!c || c.inactive)
              return { ok: false, error: "That customer is not available." };
            if (
              p.stops.some(function (s) {
                return s.code === code;
              })
            )
              return {
                ok: false,
                error: c.name + " is already a stop on this plan.",
              };
            var other = DP.activeOn(S2, date).filter(function (q) {
              return (
                q.id !== p.id &&
                q.stops.some(function (s) {
                  return s.code === code;
                })
              );
            })[0];
            if (other)
              return {
                ok: false,
                error:
                  c.name +
                  " is already on " +
                  other.worker +
                  "'s plan for this date. Move that stop instead.",
              };
            var stop = {
              code: code,
              name: c.name,
              address: c.address || "",
              inv: "PRI-" + Date.now().toString(36).toUpperCase().slice(-6),
              amount: 0,
              boxes: 0,
              items: [],
              priority: true,
              time: time || "",
              note: note,
              addedAt: Date.now(),
              addedBy: DP.actor(),
            };
            var at = p.stops.length;
            if (pos === "next") {
              for (var i = 0; i < p.stops.length; i++)
                if (DP.stopState(p, p.stops[i], date) === "pending") {
                  at = i;
                  break;
                }
            }
            p.stops.splice(at, 0, stop);
            out.name = c.name;
            out.worker = p.worker;
            out.workerId = p.workerId;
            DP.history(
              p,
              "priority",
              "Priority shop added: " +
                c.name +
                " (" +
                code +
                ")" +
                (time ? " at " + time : "") +
                (note ? " - " + note : ""),
              {
                notify: DP.crew(p),
                workerText:
                  "Priority shop added to your route: " +
                  c.name +
                  (time ? ", around " + time : "") +
                  (note ? ". " + note : "") +
                  ".",
              },
            );
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(res, out.name + " added as a priority shop.", out.worker);
          });
        };
      },
    });
  };

  /* ======================= Add another route to an existing plan ======================= */
  // Pick a route that is not in the plan yet, then type the invoice for each customer that has one. Customers left blank are skipped.
  DP.dlg.addRoute = function (planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      pk,
      S = DP.fresh(),
      cur = null;
    var inPlan = p0.routeIds && p0.routeIds.length ? p0.routeIds : [p0.route];
    DP.dialog({
      title: "Add another route",
      sub: "Adds the shops of one more route to this plan. The saved route is not changed.",
      wide: true,
      html:
        ctxLine(p0) +
        '<div class="a-fg"><label class="dp-lbl" id="arL">Route</label><div id="arR"></div></div><div id="arRows" style="max-height:50vh;overflow:auto"></div><div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Cancel", "Add route to plan"),
      onOpen: function (api) {
        pk = DP.picker(api.q("#arR"), {
          labelledBy: "arL",
          placeholder: "Search routes...",
          empty: "No other route.",
          options: function () {
            return S.routes
              .filter(function (r) {
                return inPlan.indexOf(r.id) < 0;
              })
              .sort(function (a, b) {
                return a.name.localeCompare(b.name);
              })
              .map(function (r) {
                return {
                  value: r.id,
                  label: r.name,
                  sub:
                    r.codes.length +
                    " customer" +
                    (r.codes.length === 1 ? "" : "s"),
                };
              });
          },
          onChange: function (id) {
            cur = S.routes.filter(function (r) {
              return r.id === id;
            })[0];
            draw();
          },
        });
        function draw() {
          var h = api.q("#arRows");
          if (!cur) {
            h.innerHTML = "";
            return;
          }
          h.innerHTML = cur.codes.length
            ? '<table class="dp-table"><thead><tr><th>Customer</th><th>Invoice no.</th><th>Amount</th><th>Boxes</th></tr></thead><tbody>' +
              cur.codes
                .map(function (c, i) {
                  var x = DP.cust(S, c) || { name: c };
                  return (
                    '<tr data-i="' +
                    i +
                    '"><td><b>' +
                    esc(x.name) +
                    '</b><br><span class="mu">' +
                    esc(c) +
                    '</span></td><td><div class="field a-f"><input data-f="inv" autocomplete="off"></div></td><td><div class="field a-f"><input data-f="amt" inputmode="decimal"></div></td><td><div class="field a-f"><input data-f="bx" inputmode="numeric"></div></td></tr>'
                  );
                })
                .join("") +
              '</tbody></table><div class="mu" style="font-size:12px;margin-top:6px">Fill in only the customers that have an invoice today. Boxes is optional.</div>'
            : '<div class="mu">This route has no customers.</div>';
        }
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          errMsg(api, "");
          if (!cur) {
            errMsg(api, "Choose a route.");
            pk.focus();
            return;
          }
          var rows = [],
            bad = "";
          [].forEach.call(api.qa("#arRows tr[data-i]"), function (tr) {
            var inv = tr.querySelector("[data-f=inv]").value.trim(),
              amt = tr.querySelector("[data-f=amt]").value.trim(),
              bx = tr.querySelector("[data-f=bx]").value.trim();
            if (!inv && !amt && !bx) return;
            var code = cur.codes[+tr.dataset.i];
            if (
              !inv ||
              amt === "" ||
              !(Number(amt) >= 0) ||
              (bx !== "" && !(Number(bx) >= 0))
            ) {
              bad =
                bad ||
                "Check the invoice number and amount for " +
                  ((DP.cust(S, code) || {}).name || code) +
                  ".";
              return;
            }
            rows.push({
              code: code,
              inv: inv,
              amt: Number(amt),
              bx: bx === "" ? 0 : Number(bx),
            });
          });
          if (bad) {
            errMsg(api, bad);
            return;
          }
          if (!rows.length) {
            errMsg(api, "Enter at least one invoice for this route.");
            return;
          }
          var seen = {};
          for (var i = 0; i < rows.length; i++) {
            if (seen[rows[i].inv]) {
              errMsg(api, "Invoice " + rows[i].inv + " is typed twice.");
              return;
            }
            seen[rows[i].inv] = 1;
          }
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Adding...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var rt = S2.routes.filter(function (r) {
              return r.id === cur.id;
            })[0];
            if (!rt)
              return { ok: false, error: "That route no longer exists." };
            var ids = p.routeIds && p.routeIds.length ? p.routeIds : [p.route];
            if (ids.indexOf(rt.id) > -1)
              return { ok: false, error: "This route is already in the plan." };
            var taken = DP.invTaken(S2, date);
            for (var k = 0; k < rows.length; k++)
              if (taken[rows[k].inv])
                return {
                  ok: false,
                  error:
                    "Invoice " +
                    rows[k].inv +
                    " is already in a plan for this date.",
                };
            rows.forEach(function (r) {
              var c = DP.cust(S2, r.code) || { name: r.code };
              p.stops.push({
                code: r.code,
                name: c.name,
                address: c.address || "",
                inv: r.inv,
                amount: r.amt,
                boxes: r.bx,
              });
            });
            p.routeIds = ids.concat([rt.id]);
            p.routeName = p.routeName + " + " + rt.name;
            DP.history(
              p,
              "addroute",
              "Route added: " + rt.name + " (" + rows.length + " deliveries).",
              {
                notify: DP.crew(p),
                workerText:
                  "Another route was added to your plan: " +
                  rt.name +
                  " (" +
                  rows.length +
                  " stops).",
              },
            );
            out.worker = p.worker;
            out.name = rt.name;
            out.n = rows.length;
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(
              res,
              out.name + " added (" + out.n + " shops).",
              out.worker,
            );
          });
        };
      },
    });
  };

  /* ======================= Add shop with an invoice (existing feature) ======================= */
  DP.dlg.addShop = function (planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      pk;
    DP.dialog({
      title: "Add shop with invoice",
      sub: "Adds one delivery to this plan.",
      html:
        ctxLine(p0) +
        '<div class="a-fg"><label class="dp-lbl" id="asL">Shop</label><div id="asC"></div></div>' +
        '<div class="dp-two"><div class="a-fg"><label class="dp-lbl" for="asI">Invoice no.</label><div class="field a-f"><input id="asI" autocomplete="off"></div></div><div class="a-fg"><label class="dp-lbl" for="asA">Amount</label><div class="field a-f"><input id="asA" inputmode="decimal"></div></div></div>' +
        '<div class="a-fg" style="max-width:50%"><label class="dp-lbl" for="asB">Boxes</label><div class="field a-f"><input id="asB" inputmode="numeric"></div></div><div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Cancel", "Add shop"),
      onOpen: function (api) {
        var S = DP.fresh();
        pk = DP.picker(api.q("#asC"), {
          labelledBy: "asL",
          placeholder: "Search shops...",
          empty: "No shop matches.",
          options: function () {
            return S.customers
              .filter(function (c) {
                return !c.inactive;
              })
              .map(function (c) {
                return {
                  value: c.code,
                  label: c.name,
                  sub: c.code + (c.area ? " - " + c.area : ""),
                  search: c.code,
                };
              });
          },
        });
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          errMsg(api, "");
          var code = pk.get(),
            inv = api.q("#asI").value.trim(),
            amt = api.q("#asA").value.trim(),
            bx = Number(api.q("#asB").value);
          if (!code || !inv || amt === "" || !(Number(amt) >= 0) || !(bx > 0)) {
            errMsg(
              api,
              "Choose the shop and enter the invoice number, amount and boxes (above 0).",
            );
            return;
          }
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Adding...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var c = DP.cust(S2, code);
            if (!c) return { ok: false, error: "That shop was not found." };
            if (DP.invTaken(S2, date)[inv])
              return {
                ok: false,
                error:
                  "Invoice " + inv + " is already in a plan for this date.",
              };
            p.stops.push({
              code: code,
              name: c.name,
              address: c.address || "",
              inv: inv,
              amount: Number(amt),
              boxes: bx,
            });
            DP.history(
              p,
              "addshop",
              "Shop added: " + c.name + ", invoice " + inv + ".",
              {
                notify: DP.crew(p),
                workerText:
                  "A delivery was added to your route: " +
                  c.name +
                  " (invoice " +
                  inv +
                  ").",
              },
            );
            out.worker = p.worker;
            out.name = c.name;
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(res, out.name + " added to the plan.", out.worker);
          });
        };
      },
    });
  };

  /* ======================= Change order ======================= */
  DP.dlg.order = function (planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt;
    var order = p0.stops.map(function (s) {
        return s.inv;
      }),
      info = {},
      locked = {};
    p0.stops.forEach(function (s) {
      info[s.inv] = s;
      locked[s.inv] = DP.stopState(p0, s, date) !== "pending";
    });
    var orig = order.slice(),
      filter = "",
      dragInv = null;
    var api = DP.dialog({
      title: "Change order",
      wide: true,
      sub: "Drag a shop, or use the arrows, to change the visiting order.",
      html:
        ctxLine(p0) +
        '<div class="dp-note-box">Changes apply only to today\'s plan. The master route will not be modified.</div>' +
        '<div class="field a-f" style="margin-bottom:10px"><input id="ordQ" placeholder="Find a shop in this plan" aria-label="Find a shop in this plan" autocomplete="off"></div>' +
        '<ul class="dp-ord" id="ordL" aria-label="Visiting order"></ul><div class="mu" style="font-size:12px;margin-top:6px">Shops already visited are locked in place.</div>' +
        '<div class="dp-formmsg" data-msg role="alert" aria-live="polite"></div><div class="dp-foot">' +
        (p0.origOrder
          ? '<button type="button" class="btn btn-secondary" data-reset style="margin-right:auto">Reset to original order</button>'
          : "") +
        '<button type="button" class="btn btn-secondary" data-near>' +
        DP.icon("route") +
        ' Reorder by route</button><button type="button" class="btn btn-secondary" data-no>Cancel</button><button type="button" class="btn" data-ok>Save order</button></div>',
      onOpen: function (api) {
        var ul = api.q("#ordL");
        function movable() {
          return order.filter(function (i) {
            return !locked[i];
          });
        }
        function place(newMov) {
          var k = 0;
          order = order.map(function (i) {
            return locked[i] ? i : newMov[k++];
          });
        }
        function move(inv, dir) {
          var m = movable(),
            i = m.indexOf(inv),
            j = i + dir;
          if (i < 0 || j < 0 || j >= m.length) return;
          var t = m[i];
          m[i] = m[j];
          m[j] = t;
          place(m);
          draw(inv);
          announce(
            "Moved " + info[inv].name + " to stop " + (order.indexOf(inv) + 1),
          );
        }
        function announce(t) {
          api.q("[data-msg]").style.color = "var(--muted)";
          api.q("[data-msg]").textContent = t;
        }
        function draw(focusInv, btn) {
          var q = filter.toLowerCase(),
            mv = movable();
          ul.innerHTML =
            order
              .map(function (inv, i) {
                var s = info[inv],
                  lk = locked[inv];
                if (q && (s.name + " " + s.code).toLowerCase().indexOf(q) < 0)
                  return "";
                var mi = mv.indexOf(inv);
                return (
                  '<li data-inv="' +
                  esc(inv) +
                  '"' +
                  (lk ? ' class="lock"' : ' draggable="true"') +
                  '><span class="grip" aria-hidden="true">' +
                  (lk ? "" : DP.icon("grip")) +
                  '</span><span class="n">' +
                  (i + 1) +
                  '</span><span class="nm"><b>' +
                  esc(s.name) +
                  (s.priority ? '<span class="dp-pri">Priority</span>' : "") +
                  "</b><small>" +
                  esc(s.code || "") +
                  " &middot; " +
                  esc(s.inv) +
                  (lk ? " &middot; already visited" : "") +
                  "</small></span>" +
                  (lk
                    ? ""
                    : '<button type="button" class="dp-ib bd" data-mv="-1" aria-label="Move ' +
                      esc(s.name) +
                      ' up"' +
                      (mi === 0 ? " disabled" : "") +
                      ">" +
                      DP.icon("chevron-up") +
                      '</button><button type="button" class="dp-ib bd" data-mv="1" aria-label="Move ' +
                      esc(s.name) +
                      ' down"' +
                      (mi === mv.length - 1 ? " disabled" : "") +
                      ">" +
                      DP.icon("chevron-down") +
                      "</button>") +
                  "</li>"
                );
              })
              .join("") ||
            '<li class="lock"><span class="nm">No shop matches.</span></li>';
          if (focusInv) {
            var b = ul.querySelector(
              'li[data-inv="' +
                (window.CSS && CSS.escape ? CSS.escape(focusInv) : focusInv) +
                '"] [data-mv="' +
                (btn || 0) +
                '"]',
            );
            var li = ul.querySelector(
              'li[data-inv="' +
                (window.CSS && CSS.escape ? CSS.escape(focusInv) : focusInv) +
                '"]',
            );
            var t =
              b && !b.disabled
                ? b
                : li && li.querySelector("button:not([disabled])");
            if (t) t.focus();
          }
        }
        ul.addEventListener("click", function (e) {
          var b = e.target.closest("[data-mv]");
          if (!b) return;
          var li = b.closest("li");
          move(li.dataset.inv, +b.dataset.mv);
          var again = ul.querySelector(
            'li[data-inv="' +
              (window.CSS && CSS.escape
                ? CSS.escape(li.dataset.inv)
                : li.dataset.inv) +
              '"] [data-mv="' +
              b.dataset.mv +
              '"]',
          );
          if (again && !again.disabled) again.focus();
        });
        ul.addEventListener("dragstart", function (e) {
          var li = e.target.closest("li[data-inv]");
          if (!li || locked[li.dataset.inv]) {
            e.preventDefault();
            return;
          }
          dragInv = li.dataset.inv;
          li.classList.add("drag");
          try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", dragInv);
          } catch (x) {}
        });
        ul.addEventListener("dragend", function () {
          dragInv = null;
          [].forEach.call(ul.children, function (l) {
            l.classList.remove("drag", "over");
          });
        });
        ul.addEventListener("dragover", function (e) {
          var li = e.target.closest("li[data-inv]");
          if (!li || !dragInv || locked[li.dataset.inv]) return;
          e.preventDefault();
          [].forEach.call(ul.children, function (l) {
            l.classList.toggle("over", l === li);
          });
        });
        ul.addEventListener("drop", function (e) {
          var li = e.target.closest("li[data-inv]");
          if (
            !li ||
            !dragInv ||
            locked[li.dataset.inv] ||
            li.dataset.inv === dragInv
          )
            return;
          e.preventDefault();
          var m = movable(),
            from = m.indexOf(dragInv),
            to = m.indexOf(li.dataset.inv);
          m.splice(from, 1);
          m.splice(to, 0, dragInv);
          place(m);
          var d = dragInv;
          dragInv = null;
          draw();
          announce(
            "Moved " + info[d].name + " to stop " + (order.indexOf(d) + 1),
          );
        });
        api.q("#ordQ").addEventListener("input", function () {
          filter = this.value.trim();
          draw();
        });
        api.q("[data-near]").onclick = function () {
          var S3 = DP.fresh(),
            m = movable(),
            btn = this;
          btn.disabled = true;
          announce("Calculating road distances...");
          DP.nearestOrderRoad(m, function (inv) {
            return DP.coord(DP.cust(S3, info[inv].code));
          }).then(function (r) {
            btn.disabled = false;
            if (r.km == null) {
              announce(
                "Not enough shops have a map pin (" +
                  r.pinned +
                  " of " +
                  r.total +
                  ") to order by route.",
              );
              return;
            }
            place(r.items);
            draw();
            announce(
              "Ordered by nearest route using " +
                r.pinned +
                " map pins: " +
                (r.method === "road"
                  ? "road distance, about " + r.km.toFixed(1) + " km of driving"
                  : "straight-line distance, about " +
                    r.km.toFixed(1) +
                    " km (the road service could not be reached)") +
                (r.total - r.pinned
                  ? "; " +
                    (r.total - r.pinned) +
                    " without a pin are at the end"
                  : "") +
                ". Press Save order to keep it.",
            );
          });
        };
        var rs = api.q("[data-reset]");
        if (rs)
          rs.onclick = function () {
            var pos = {};
            p0.origOrder.forEach(function (i, k) {
              pos[i] = k;
            });
            var m = movable();
            m = m
              .map(function (i, k) {
                return {
                  i: i,
                  k: k,
                  o: i in pos ? pos[i] : info[i].priority ? -1 : 1e9,
                };
              })
              .sort(function (a, b) {
                return a.o - b.o || a.k - b.k;
              })
              .map(function (x) {
                return x.i;
              });
            place(m);
            draw();
            announce(
              "Order reset to the original route order. Press Save order to keep it.",
            );
          };
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          var moved = order.filter(function (i, k) {
            return i !== orig[k];
          }).length;
          if (!moved) {
            api.q("[data-msg]").style.color = "var(--muted)";
            api.q("[data-msg]").textContent = "The order has not changed.";
            return;
          }
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Saving...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var cur = p.stops
                .map(function (s) {
                  return s.inv;
                })
                .sort()
                .join("|"),
              nw = order.slice().sort().join("|");
            if (cur !== nw)
              return {
                ok: false,
                error:
                  "The shops on this plan changed. Reopen Change order and try again.",
              };
            var by = {};
            p.stops.forEach(function (s) {
              by[s.inv] = s;
            });
            p.stops = order.map(function (i) {
              return by[i];
            });
            out.worker = p.worker;
            DP.history(
              p,
              "order",
              "Visit order changed (" +
                moved +
                " stops moved). Route order unchanged.",
              {
                notify: DP.crew(p),
                workerText:
                  "The order of your stops for today was changed. Check your route.",
              },
            );
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              api.q("[data-msg]").style.color = "";
              errMsg(api, res.error);
              if (res.error === DP.STALE_MSG) DP.ctx.refresh();
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(res, "Visit order saved for today's plan.", out.worker);
          });
        };
        draw();
      },
    });
  };

  /* ======================= Change employee / vehicle ======================= */
  function changeAssign(kind, planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      isW = kind === "worker",
      pk,
      S = DP.fresh();
    var title = isW ? "Change employee" : "Change vehicle",
      curName = isW ? p0.worker : p0.vehicle;
    var lockMsg = DP.started(p0, date)
      ? isW
        ? "The employee has already started this plan, so the employee can no longer be changed."
        : "The employee has already started this plan, so the vehicle can no longer be changed."
      : "";
    DP.dialog({
      title: title,
      sub: "For this plan only. The route, customers and invoices stay as they are.",
      html:
        ctxLine(p0) +
        (lockMsg
          ? '<div class="dp-banner">' +
            esc(lockMsg) +
            "</div>" +
            '<div class="dp-foot"><button type="button" class="btn btn-secondary" data-no>Close</button></div>'
          : '<div class="a-fg"><label class="dp-lbl" id="caL">' +
            (isW ? "Replacement employee" : "Replacement vehicle") +
            '</label><div id="caP"></div></div><div id="caConf"></div><div class="dp-formmsg" data-msg role="alert"></div>' +
            footer("Cancel", title)),
      onOpen: function (api) {
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        if (lockMsg) return;
        function opts() {
          var S2 = DP.fresh();
          if (isW)
            return GA.workers()
              .filter(function (w) {
                return w.active && w.id !== p0.workerId;
              })
              .map(function (w) {
                var b = DP.workerBusy(S2, date, w.id, p0.id),
                  lv = GA.onLeaveOn(w.id, date);
                return {
                  value: w.id,
                  label: w.name,
                  sub: GA.empCode(w.id) + (w.phone ? " \u00b7 " + w.phone : ""),
                  disabled: !!(b || lv),
                  reason: lv
                    ? "On leave on this date"
                    : b
                      ? "Already has a plan (" + b.routeName + ")"
                      : "",
                };
              });
          return GA.vehicles()
            .filter(function (v) {
              return v.active && v.id !== p0.vehicleId;
            })
            .map(function (v) {
              var b = DP.vehicleBusy(S2, date, v.id, p0.id);
              return {
                value: v.id,
                label: v.number + (v.type ? " (" + v.type + ")" : ""),
                disabled: !!b,
                reason: b ? "In use by " + b.worker : "",
              };
            });
        }
        pk = DP.picker(api.q("#caP"), {
          labelledBy: "caL",
          placeholder: isW ? "Search employees..." : "Search vehicles...",
          empty: "Nobody else is available.",
          options: opts,
          onChange: function (v, o) {
            api.q("#caConf").innerHTML =
              '<div class="dp-note-box"><b>' +
              esc(curName) +
              "</b> &rarr; <b>" +
              esc(o.label) +
              "</b><br>" +
              (isW
                ? "Today's plan will be given to " +
                  esc(o.label) +
                  ". " +
                  esc(p0.worker) +
                  " will no longer see it."
                : "Today's plan will use vehicle " + esc(o.label) + ".") +
              "</div>";
            errMsg(api, "");
          },
        });
        api.q("[data-ok]").onclick = function () {
          var id = pk.get();
          if (!id) {
            pk.invalid(true);
            errMsg(api, "Choose a replacement.");
            pk.focus();
            return;
          }
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Saving...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            if (isW) {
              var w = DP.workerById(id);
              if (!w || !w.active)
                return { ok: false, error: "That employee is not available." };
              if (GA.onLeaveOn(id, date))
                return {
                  ok: false,
                  error: w.name + " is on leave on this date.",
                };
              var b = DP.workerBusy(S2, date, id, p.id);
              if (b)
                return {
                  ok: false,
                  error:
                    w.name +
                    " already has a plan on this date (" +
                    b.routeName +
                    ").",
                };
              if (Array.isArray(p.helpers))
                p.helpers = p.helpers.filter(function (x) {
                  return x !== w.id;
                });
              var oldId = p.workerId,
                oldName = p.worker;
              p.workerId = w.id;
              p.worker = w.name;
              out.worker = w.name;
              var h = DP.history(
                p,
                "worker",
                "Employee changed from " + oldName + " to " + w.name + ".",
                {
                  notify: DP.crew(p)
                    .concat([oldId])
                    .filter(function (x, i, a) {
                      return a.indexOf(x) === i;
                    }),
                },
              );
              h.workerTexts = {};
              h.workerTexts[oldId] =
                "Your plan for " +
                p.routeName +
                " today was given to " +
                w.name +
                ".";
              h.workerTexts[w.id] =
                "You were assigned " +
                p.routeName +
                " for today (" +
                p.stops.length +
                " stops).";
            } else {
              var v = DP.vehicleById(id);
              if (!v || !v.active)
                return { ok: false, error: "That vehicle is not available." };
              var bv = DP.vehicleBusy(S2, date, id, p.id);
              if (bv)
                return {
                  ok: false,
                  error:
                    "Vehicle " +
                    v.number +
                    " is already used by " +
                    bv.worker +
                    " on this date.",
                };
              var oldV = p.vehicle;
              p.vehicleId = v.id;
              p.vehicle = v.number;
              p.vehicleLabel = v.number + (v.type ? " (" + v.type + ")" : "");
              p.vehicleKm = v.lastKm;
              out.worker = p.worker;
              DP.history(
                p,
                "vehicle",
                "Vehicle changed from " + oldV + " to " + v.number + ".",
                {
                  notify: DP.crew(p),
                  workerText: "Your vehicle for today is now " + v.number + ".",
                },
              );
            }
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              if (res.error === DP.STALE_MSG) DP.ctx.refresh();
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(
              res,
              isW ? "Employee changed." : "Vehicle changed.",
              isW ? null : out.worker,
            );
          });
        };
      },
    });
  }
  /* ======================= Helpers (riding along with the driver) ======================= */
  // Tick-list of people who can ride along. host = element, sel = chosen ids, planId = plan being edited (so its own helpers are not "busy").
  DP.helperBox = function (host, date, driverId, sel, planId, onChange) {
    if (!host) return;
    var S2 = DP.fresh(),
      L = GA.workers().filter(function (w) {
        return w.active && w.id !== driverId;
      });
    if (!L.length) {
      host.innerHTML = '<span class="mu">No other employees.</span>';
      return;
    }
    host.innerHTML = L.map(function (w) {
      var b = DP.workerBusy(S2, date, w.id, planId),
        lv = GA.onLeaveOn(w.id, date),
        off = !!(b || lv),
        on = sel.indexOf(w.id) > -1 && !off;
      return (
        '<label class="dp-hl' +
        (off ? " off" : "") +
        '"><input type="checkbox" value="' +
        esc(w.id) +
        '"' +
        (on ? " checked" : "") +
        (off ? " disabled" : "") +
        "><span><b>" +
        esc(w.name) +
        "</b><small>" +
        esc(GA.empCode(w.id)) +
        (lv
          ? " &middot; On leave"
          : b
            ? " &middot; Already on a plan (" + esc(b.routeName) + ")"
            : "") +
        "</small></span></label>"
      );
    }).join("");
    onChange(
      sel.filter(function (id) {
        var b = DP.workerBusy(S2, date, id, planId);
        return !b && !GA.onLeaveOn(id, date);
      }),
    );
    host.onchange = function () {
      onChange(
        [].map.call(host.querySelectorAll("input:checked"), function (i) {
          return i.value;
        }),
      );
    };
  };
  function helpersDlg(planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      chosen = (p0.helpers || []).slice();
    DP.dialog({
      title: "Helpers",
      sub:
        "People riding along with " +
        p0.worker +
        ". They see the same route and can mark deliveries too.",
      html:
        ctxLine(p0) +
        '<div id="hpBox" class="dp-helpers"></div><div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Cancel", "Save helpers"),
      onOpen: function (api) {
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        DP.helperBox(
          api.q("#hpBox"),
          date,
          p0.workerId,
          chosen,
          p0.id,
          function (L) {
            chosen = L;
          },
        );
        api.q("[data-ok]").onclick = function () {
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Saving...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var before = (p.helpers || []).slice(),
              added = chosen.filter(function (x) {
                return before.indexOf(x) < 0;
              }),
              removed = before.filter(function (x) {
                return chosen.indexOf(x) < 0;
              });
            for (var i = 0; i < added.length; i++) {
              var w = DP.workerById(added[i]);
              if (!w || !w.active)
                return { ok: false, error: "That helper is not available." };
              if (GA.onLeaveOn(w.id, date))
                return {
                  ok: false,
                  error: w.name + " is on leave on this date.",
                };
              if (DP.workerBusy(S2, date, w.id, p.id))
                return {
                  ok: false,
                  error: w.name + " already has a plan on this date.",
                };
            }
            if (!added.length && !removed.length) {
              out.same = true;
              return { ok: true };
            }
            var nm = function (id) {
              return (DP.workerById(id) || {}).name || id;
            };
            p.helpers = chosen.slice();
            var h = DP.history(
              p,
              "helpers",
              "Helpers changed: " +
                (p.helpers.length ? p.helpers.map(nm).join(", ") : "none") +
                ".",
              { notify: DP.crew(p).concat(removed) },
            );
            h.workerTexts = {};
            added.forEach(function (id) {
              h.workerTexts[id] =
                "You are a helper on " +
                p.routeName +
                " today with " +
                p.worker +
                " (" +
                p.stops.length +
                " stops).";
            });
            removed.forEach(function (id) {
              h.workerTexts[id] =
                "You are no longer a helper on " + p.routeName + " today.";
            });
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              if (res.error === DP.STALE_MSG) DP.ctx.refresh();
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            if (out.same) DP.toast("No change.", "ok");
            else afterSave(res, "Helpers saved.", "the crew");
          });
        };
      },
    });
  }
  DP.dlg.helpers = helpersDlg;
  DP.dlg.worker = function (id) {
    changeAssign("worker", id);
  };
  DP.dlg.vehicle = function (id) {
    changeAssign("vehicle", id);
  };

  /* ======================= Delete a plan =======================
     The plan is removed completely (nothing is kept and no message is sent). The employee's app notices the plan is gone the next
     time it syncs and quietly drops the unfinished shops. Route and customers are never touched. */
  DP.dlg.cancel = function (planId) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      c = DP.counts(p0, date),
      isToday = date === GA.today();
    var block = DP.closed(p0, date)
      ? "This employee has already closed the day, so the plan cannot be deleted."
      : c.done
        ? c.done +
          " deliver" +
          (c.done === 1 ? "y has" : "ies have") +
          " already been completed on this plan, so it cannot be deleted."
        : "";
    DP.dialog({
      title: isToday
        ? "Delete today's plan for " + p0.worker + "?"
        : "Delete the plan for " +
          p0.worker +
          " on " +
          DP.niceDate(date, true) +
          "?",
      html:
        ctxLine(p0) +
        (block
          ? '<div class="dp-banner err">' +
            esc(block) +
            '</div><div class="dp-foot"><button type="button" class="btn btn-secondary" data-no>Close</button></div>'
          : (DP.started(p0, date)
              ? '<div class="dp-banner">' +
                esc(p0.worker) +
                " has already started. Their unfinished shops will be removed from their app.</div>"
              : "") +
            '<div class="mu" style="font-size:13px;margin:4px 0 10px">The plan is deleted completely. ' +
            esc(p0.worker) +
            ' is not sent a message; the shops simply disappear from their app. The route, the customers and the bills are not changed, so the bills can be planned again.</div><div class="dp-formmsg" data-msg role="alert"></div>' +
            footer("Keep plan", "Delete plan", true)),
      onOpen: function (api) {
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        if (block) return;
        api.q("[data-ok]").onclick = function () {
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Deleting...");
          DP.commit(function (S2) {
            var L = (S2.plans || {})[date],
              arr = Array.isArray(L) ? L : L ? [L] : [],
              p = arr.filter(function (x) {
                return x.id === planId;
              })[0];
            if (!p) return { ok: false, error: "That plan no longer exists." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            out.worker = p.worker;
            out.id = p.id;
            S2.plans[date] = arr.filter(function (x) {
              return x.id !== planId;
            });
            if (!S2.plans[date].length) delete S2.plans[date];
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              if (res.error === DP.STALE_MSG) DP.ctx.refresh();
              return;
            }
            api.close(true);
            DP.ctx.afterCancel(out.id);
            afterSave(res, "Plan deleted for " + out.worker + ".", out.worker);
          });
        };
      },
    });
  };

  /* ======================= Delete a cancelled plan ======================= */
  DP.dlg.remove = function (planId) {
    var date = DP.ctx.date(),
      p0 = planIn(DP.fresh(), date, planId);
    if (!p0) {
      DP.toast("That plan no longer exists.", "err");
      return;
    }
    if (p0.status !== "cancelled") {
      DP.toast(
        "Only a cancelled plan can be deleted. Cancel it first.",
        "warn",
      );
      return;
    }
    DP.dialog({
      title: "Delete the cancelled plan for " + p0.worker + "?",
      html:
        ctxLine(p0) +
        '<div class="dp-banner err">This permanently removes the plan and its history from ' +
        DP.niceDate(date, true) +
        '. It cannot be undone. The route and its customers are not changed.</div><div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Keep it", "Delete plan", true),
      onOpen: function (api) {
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Deleting...");
          DP.commit(function (S2) {
            var L = (S2.plans || {})[date] || [],
              p = L.filter(function (x) {
                return x.id === planId;
              })[0];
            if (!p) return { ok: false, error: "That plan no longer exists." };
            if (p.status !== "cancelled")
              return {
                ok: false,
                error: "Only a cancelled plan can be deleted.",
              };
            out.worker = p.worker;
            S2.plans[date] = L.filter(function (x) {
              return x.id !== planId;
            });
            if (!S2.plans[date].length) delete S2.plans[date];
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              return;
            }
            api.close(true);
            DP.ctx.afterCancel(planId);
            afterSave(
              res,
              "Cancelled plan for " + out.worker + " deleted.",
              out.worker,
            );
          });
        };
      },
    });
  };

  /* ======================= Move / remove a stop ======================= */
  DP.dlg.moveStop = function (planId, inv) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      S = DP.fresh(),
      others = DP.activeOn(S, date).filter(function (p) {
        return p.id !== planId;
      }),
      stop = p0.stops.filter(function (s) {
        return s.inv === inv;
      })[0];
    if (!stop) return;
    DP.dialog({
      title: "Move to another plan",
      sub: esc(stop.name) + " &middot; invoice " + esc(inv),
      html:
        '<div class="a-fg"><label class="dp-lbl" for="mvT">Move to</label><div class="field a-f"><select id="mvT">' +
        others
          .map(function (o) {
            return (
              '<option value="' +
              esc(o.id) +
              '">' +
              esc(o.worker + " - " + o.routeName) +
              "</option>"
            );
          })
          .join("") +
        '</select></div></div><div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Cancel", "Move shop"),
      onOpen: function (api) {
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          var to = api.q("#mvT").value,
            btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Moving...");
          DP.commit(function (S2) {
            var a = planIn(S2, date, planId),
              b = planIn(S2, date, to);
            if (!a || !b || b.status === "cancelled")
              return {
                ok: false,
                error: "One of the plans is no longer active.",
              };
            if (DP.stale(a, expect)) {
              expect = a.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var i = a.stops.findIndex(function (s) {
              return s.inv === inv;
            });
            if (i < 0)
              return {
                ok: false,
                error: "That shop is no longer on this plan.",
              };
            if (DP.stopState(a, a.stops[i], date) !== "pending")
              return {
                ok: false,
                error: "That shop has already been visited.",
              };
            var st = a.stops.splice(i, 1)[0];
            b.stops.push(st);
            out.to = b.worker;
            out.from = a.worker;
            DP.history(
              a,
              "move",
              st.name + " moved to " + b.worker + "'s plan.",
              {
                notify: DP.crew(a),
                workerText: st.name + " was moved to another employee.",
              },
            );
            DP.history(
              b,
              "move",
              st.name + " moved here from " + a.worker + "'s plan.",
              {
                notify: DP.crew(b),
                workerText: st.name + " was added to your route.",
              },
            );
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              if (res.error === DP.STALE_MSG) DP.ctx.refresh();
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(res, stop.name + " moved to " + out.to + "'s plan.");
          });
        };
      },
    });
  };
  DP.dlg.removeStop = function (planId, inv) {
    if (pastBlock()) return;
    var p0 = guardPlan(planId);
    if (!p0) return;
    var date = DP.ctx.date(),
      expect = p0.builtAt,
      stop = p0.stops.filter(function (s) {
        return s.inv === inv;
      })[0];
    if (!stop) return;
    DP.dialog({
      title: "Remove from plan?",
      sub: esc(stop.name) + " &middot; invoice " + esc(inv),
      html:
        '<div class="dp-note-box">This removes the delivery from today\'s plan only. The customer stays on the route.</div><div class="dp-formmsg" data-msg role="alert"></div>' +
        footer("Keep shop", "Remove from plan", true),
      onOpen: function (api) {
        api.q("[data-no]").onclick = function () {
          api.close();
        };
        api.q("[data-ok]").onclick = function () {
          var btn = api.q("[data-ok]"),
            out = {};
          DP.setBusy(api, btn, true, "Removing...");
          DP.commit(function (S2) {
            var p = planIn(S2, date, planId);
            if (!p || p.status === "cancelled")
              return { ok: false, error: "This plan is no longer active." };
            if (DP.stale(p, expect)) {
              expect = p.builtAt;
              return { ok: false, error: DP.STALE_MSG };
            }
            var i = p.stops.findIndex(function (s) {
              return s.inv === inv;
            });
            if (i < 0)
              return {
                ok: false,
                error: "That shop is no longer on this plan.",
              };
            if (DP.stopState(p, p.stops[i], date) !== "pending")
              return {
                ok: false,
                error:
                  "That shop has already been visited, so it cannot be removed.",
              };
            if (p.stops.length === 1)
              return {
                ok: false,
                error:
                  "A plan needs at least one shop. Cancel the route instead.",
              };
            p.stops.splice(i, 1);
            out.worker = p.worker;
            DP.history(
              p,
              "remove",
              stop.name + " (invoice " + inv + ") removed from the plan.",
              {
                notify: DP.crew(p),
                workerText: stop.name + " was removed from your route.",
              },
            );
            return { ok: true };
          }).then(function (res) {
            DP.setBusy(api, btn, false, "");
            if (!res.ok) {
              errMsg(api, res.error);
              if (res.error === DP.STALE_MSG) DP.ctx.refresh();
              return;
            }
            api.close(true);
            DP.ctx.refresh();
            afterSave(res, stop.name + " removed from the plan.", out.worker);
          });
        };
      },
    });
  };
})();
