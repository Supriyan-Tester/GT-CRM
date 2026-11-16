/* Sales self-service attendance. Punch times are generated and validated by the server. */
(function () {
  "use strict";
  Sales.start("attendance", function (me, hello, main) {
    hello.innerHTML =
      "<h1>Attendance</h1><p>Record your workday and review your attendance history.</p>";
    var month = Sales.today().slice(0, 7),
      data = null,
      busy = false;
    function el(id) { return document.getElementById(id); }
    function esc(v) { return Sales.esc(v == null ? "" : v); }
    function monthShift(value, step) {
      var p = value.split("-");
      var d = new Date(Date.UTC(+p[0], +p[1] - 1 + step, 1));
      return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
    }
    function monthName(value) {
      var p = value.split("-");
      return new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    }
    function timeLabel(v) {
      if (!v || v === "-") return "—";
      var p = String(v).split(":");
      var d = new Date(Date.UTC(2020, 0, 1, +p[0], +p[1]));
      return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
    }
    function statusLabel(e) {
      if (!e) return "No record";
      return e.outAt ? "Completed" : "Working";
    }
    function render() {
      var today = data.todayEntry,
        pending = data.pendingEntry,
        active = today || (pending && pending.entry) || null,
        activeDate = pending && !today ? pending.date : data.today,
        overnight = !!(pending && !today),
        state = !active ? "Not punched in" : active.outAt ? "Day completed" : overnight ? "Overnight session · punch out" : "Currently working",
        cls = !active ? "sa-neutral" : active.outAt ? "sa-done" : "sa-live",
        days = Object.keys(data.days || {}).sort().reverse(),
        present = days.filter(function (d) { return data.days[d].status === "present"; }).length,
        late = days.filter(function (d) { return data.days[d].status === "late"; }).length,
        totalMins = days.reduce(function (n, d) {
          var e = data.days[d], m = /^(\d+)h\s*(\d+)m$/.exec(e.hours || "");
          return n + (m ? +m[1] * 60 + +m[2] : 0);
        }, 0),
        action = !today ? (pending ? "punch-out" : "punch-in") : today.outAt ? "" : "punch-out",
        actionText = action === "punch-in" ? "Punch In" : "Punch Out";
      main.innerHTML =
        '<section class="sa-hero card"><div class="sa-hero-top"><div><span class="sa-eyebrow">' + (overnight ? 'OVERNIGHT SESSION · ' + esc(Sales.dateLabel(activeDate)) : 'TODAY · ' + esc(Sales.dateLabel(data.today))) + '</span><h2>My attendance</h2><p>Use this when you start and finish your workday.</p></div><span class="sa-state ' + cls + '">' + esc(state) + '</span></div>' +
        '<div class="sa-times"><div><small>Check in</small><b>' + timeLabel(active && active.inTime) + '</b></div><div><small>Check out</small><b>' + timeLabel(active && active.outTime) + '</b></div><div><small>Working hours</small><b>' + esc(active && active.hours && active.hours !== "-" ? active.hours : active && !active.outAt ? "In progress" : "—") + '</b></div></div>' +
        (action ? '<button class="sa-action ' + (action === "punch-out" ? "out" : "") + '" id="saPunch" type="button">' + (action === "punch-in" ? Sales.ic("login") : Sales.ic("logout")) + '<span>' + actionText + '</span></button>' : '<div class="sa-finished">' + Sales.ic("check-circle") + '<span>Your attendance for today is complete.</span></div>') +
        '<p class="sa-hint">' + (overnight ? 'Your previous-day attendance is still open. Punch out to complete that work session.' : 'Attendance time is recorded by the server. You can punch in or out only once per day.') + '</p></section>' +
        '<section class="sa-stats"><div class="card"><small>Present</small><b>' + present + '</b></div><div class="card"><small>Late</small><b>' + late + '</b></div><div class="card"><small>Total hours</small><b>' + (totalMins ? Math.floor(totalMins / 60) + 'h ' + String(totalMins % 60).padStart(2, '0') + 'm' : '—') + '</b></div></section>' +
        '<section class="card sa-history"><div class="sa-history-head"><div><h2>Attendance history</h2><p>Monthly attendance records</p></div><div class="sa-month"><button type="button" id="saPrev" aria-label="Previous month">' + Sales.ic("chevron-left") + '</button><b>' + esc(monthName(month)) + '</b><button type="button" id="saNext" aria-label="Next month" ' + (month >= data.today.slice(0, 7) ? 'disabled' : '') + '>' + Sales.ic("chevron-right") + '</button></div></div>' +
        (days.length ? '<div class="sa-list">' + days.map(function (d) {
          var e = data.days[d], status = e.status === "late" ? "Late" : "Present";
          var wd = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
          return '<div class="sa-row"><div class="sa-date"><b>' + Number(d.slice(8)) + '</b><span>' + esc(wd) + '</span></div><div class="sa-row-times"><span><small>In</small><b>' + timeLabel(e.inTime) + '</b></span><span><small>Out</small><b>' + timeLabel(e.outTime) + '</b></span></div><div class="sa-row-end"><span class="sa-tag ' + (e.status === "late" ? "late" : "") + '">' + status + '</span><small>' + esc(e.hours && e.hours !== "-" ? e.hours : statusLabel(e)) + '</small></div></div>';
        }).join("") + '</div>' : '<div class="sa-empty">' + Sales.ic("calendar-days") + '<b>No attendance records</b><span>There are no punches recorded for this month.</span></div>') +
        '</section>';
      if (action) el("saPunch").onclick = function () { punch(action); };
      el("saPrev").onclick = function () { month = monthShift(month, -1); load(); };
      el("saNext").onclick = function () { if (month < data.today.slice(0, 7)) { month = monthShift(month, 1); load(); } };
    }
    function load() {
      main.innerHTML = '<div class="card sa-loading">Loading attendance…</div>';
      Sales.api("/api/sales/attendance?month=" + encodeURIComponent(month)).then(function (r) { data = r; render(); }).catch(function (e) {
        main.innerHTML = '<div class="card sa-error"><b>Could not load attendance</b><span>' + esc(e.message || "Check your connection and try again.") + '</span><button class="btn teal sm" id="saRetry" type="button">Try again</button></div>';
        el("saRetry").onclick = load;
      });
    }
    function punch(action) {
      if (busy) return;
      var btn = el("saPunch");
      busy = true; btn.disabled = true; btn.textContent = action === "punch-in" ? "Punching in…" : "Punching out…";
      Sales.api("/api/sales/attendance", { action: action }).then(function () {
        Sales.toast(action === "punch-in" ? "Punched in successfully." : "Punched out successfully. You are being signed out. See you tomorrow!");
        // Like the delivery panel: after punch-out the person is signed out
        if (action === "punch-out") { setTimeout(Sales.logout, 1800); return null; }
        return Sales.api("/api/sales/attendance?month=" + encodeURIComponent(month));
      }).then(function (r) { if (r) { data = r; render(); } }).catch(function (e) {
        Sales.toast(e.message || "Attendance could not be saved.", true); load();
      }).finally(function () { busy = false; });
    }
    load();
  });
})();