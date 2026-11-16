"use strict";

const { findPunchOutDate, getPendingPunchOut } = require("./attendance.service");

/**
 * Handles the authenticated Sales employee attendance API.
 * Returns null for requests outside this module so salesApi can continue its
 * existing dispatch flow. Authentication/role enforcement remains in server.js.
 */
function handleSalesAttendanceRoute(deps) {
  const {
    req, res, s, p, url,
    stored, setItem, send, body, istDay, clockMins,
    logEvents, notifyAdmin, actorOf,
  } = deps;

  if (p !== "/api/sales/attendance") return null;

  const attendanceAll = () => {
    const value = stored("gm_sales_attendance_v1");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  };
  const attendanceTime = (timestamp) => {
    const date = new Date(timestamp + 5.5 * 3600e3);
    return String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0");
  };
  const attendanceHours = (start, end) => {
    const minutes = Math.max(0, Math.round((end - start) / 60000));
    return Math.floor(minutes / 60) + "h " + String(minutes % 60).padStart(2, "0") + "m";
  };
  const syncSalesAttendanceToEmployee = (date, entry) => {
    // Employee-based Sales logins share the attendance record used by the office dashboard.
    const recordKey = "gm_crm_data_v5__" + s.id;
    const record = stored(recordKey) || (s.emp ? {} : null);
    if (!record || typeof record !== "object" || Array.isArray(record)) return;
    const month = date.slice(0, 7), day = String(Number(date.slice(8)));
    record.attendanceLog = record.attendanceLog || {};
    record.attendanceLog[month] = record.attendanceLog[month] || {};
    record.attendanceLog[month][day] = Object.assign({}, entry);
    setItem(recordKey, JSON.stringify(record));
  };

  if (req.method === "GET") {
    const requestedMonth = url.searchParams.get("month");
    const month = /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth : istDay().slice(0, 7);
    const all = attendanceAll(), mine = all[s.id] || {}, days = {};
    Object.keys(mine).forEach((date) => {
      if (date.slice(0, 7) === month) days[date] = mine[date];
    });
    const today = istDay();
    const pendingEntry = getPendingPunchOut(mine, Date.now());
    return send(res, 200, {
      ok: true,
      today,
      month,
      days,
      todayEntry: mine[today] || null,
      pendingEntry,
    });
  }

  if (req.method === "POST") {
    return body(req, (err, payload) => {
      if (err || !payload || (payload.action !== "punch-in" && payload.action !== "punch-out"))
        return send(res, 400, { error: "Choose Punch In or Punch Out." });

      const now = Date.now(), date = istDay(), all = attendanceAll();
      const mine = all[s.id] || (all[s.id] = {}), existing = mine[date] || null;

      if (payload.action === "punch-in") {
        if (existing) return send(res, 409, { error: existing.outAt ? "Attendance is already completed for today." : "You have already punched in." });
        const previousOpenDate = findPunchOutDate(mine, now);
        if (previousOpenDate && previousOpenDate !== date)
          return send(res, 409, { error: "Please punch out of your previous attendance session before punching in again." });
        const time = attendanceTime(now), settings = stored("gm_admin_settings_v1") || {};
        const late = clockMins(time) > clockMins(/^\d{1,2}:\d{2}$/.test(settings.lateAfter || "") ? settings.lateAfter : "08:30");
        const entry = {
          day: Number(date.slice(8)),
          weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T00:00:00Z").getUTCDay()],
          status: late ? "late" : "present", inTime: time, outTime: "-", hours: "-", km: 0,
          vehicle: "", startKm: null, endKm: null, inAt: now, outAt: null, source: "sales",
        };
        mine[date] = entry;
        const keep = Object.keys(mine).sort().slice(-90), trimmed = {};
        keep.forEach((day) => { trimmed[day] = mine[day]; });
        all[s.id] = trimmed;
        setItem("gm_sales_attendance_v1", JSON.stringify(all));
        syncSalesAttendanceToEmployee(date, entry);
        logEvents(s, [{ type: "attendance", text: "Sales punched in at " + time }]);
        notifyAdmin("sales_attendance", actorOf(s).name + " punched in", "Punched in at " + time + (late ? " (late)." : "."), actorOf(s).name);
        return send(res, 200, { ok: true, action: payload.action, entry });
      }

      const punchOutDate = findPunchOutDate(mine, now);
      const punchOutEntry = punchOutDate ? mine[punchOutDate] : null;
      if (!punchOutEntry || !punchOutEntry.inAt || punchOutEntry.outAt)
        return send(res, 409, { error: "You must punch in before punching out." });

      const time = attendanceTime(now);
      const entry = Object.assign({}, punchOutEntry, { outTime: time, outAt: now, hours: attendanceHours(punchOutEntry.inAt, now) });
      mine[punchOutDate] = entry;
      const keep = Object.keys(mine).sort().slice(-90), trimmed = {};
      keep.forEach((day) => { trimmed[day] = mine[day]; });
      all[s.id] = trimmed;
      setItem("gm_sales_attendance_v1", JSON.stringify(all));
      syncSalesAttendanceToEmployee(punchOutDate, entry);
      const dateNote = punchOutDate === date ? "" : " for " + punchOutDate;
      logEvents(s, [{ type: "attendance", text: "Sales punched out" + dateNote + " at " + time + " (" + entry.hours + ")" }]);
      notifyAdmin("sales_attendance", actorOf(s).name + " punched out", "Punched out" + dateNote + " at " + time + " (" + entry.hours + ").", actorOf(s).name);
      return send(res, 200, { ok: true, action: payload.action, entry, date: punchOutDate });
    }, 4096);
  }

  return null;
}

module.exports = { handleSalesAttendanceRoute };