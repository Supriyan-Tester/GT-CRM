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
  // Vehicles a Sales person may choose at punch-in (active ones from the office vehicle list).
  const activeVehicles = () => {
    const list = stored("gm_admin_vehicles_v1");
    return (Array.isArray(list) ? list : [])
      .filter((v) => v && v.id && v.number && v.active !== false && (!v.status || v.status === "active"))
      .map((v) => ({ id: v.id, number: v.number, type: v.type || "", lastKm: Math.round(Number(v.lastKm) || 0) }));
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
      vehicles: activeVehicles(),
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
          return send(res, 409, { error: "You forgot to punch out yesterday. Please contact the admin to punch in." });
        // Sales people travel by vehicle: they must choose it and enter the odometer. (If the office has no active vehicle yet, this step is skipped.)
        const vehicles = activeVehicles();
        let veh = null, startKm = null;
        if (vehicles.length) {
          veh = vehicles.filter((v) => v.id === payload.vehicleId)[0];
          if (!veh) return send(res, 400, { error: "Choose the vehicle you are using." });
          startKm = Math.round(Number(payload.startKm));
          if (!(startKm > 0)) return send(res, 400, { error: "Enter the odometer reading (km)." });
          if (startKm < veh.lastKm)
            return send(res, 400, { error: "The odometer cannot be less than the last reading for this vehicle (" + veh.lastKm + " km)." });
        }
        const time = attendanceTime(now), settings = stored("gm_admin_settings_v1") || {};
        const late = clockMins(time) > clockMins(/^\d{1,2}:\d{2}$/.test(settings.lateAfter || "") ? settings.lateAfter : "08:30");
        const entry = {
          day: Number(date.slice(8)),
          weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T00:00:00Z").getUTCDay()],
          status: late ? "late" : "present", inTime: time, outTime: "-", hours: "-", km: 0,
          vehicle: veh ? veh.number : "", vehicleId: veh ? veh.id : "", startKm, endKm: null, inAt: now, outAt: null, source: "sales",
        };
        mine[date] = entry;
        const keep = Object.keys(mine).sort().slice(-90), trimmed = {};
        keep.forEach((day) => { trimmed[day] = mine[day]; });
        all[s.id] = trimmed;
        setItem("gm_sales_attendance_v1", JSON.stringify(all));
        syncSalesAttendanceToEmployee(date, entry);
        logEvents(s, [{ type: "attendance", text: "Sales punched in at " + time + (veh ? " (" + veh.number + ", start " + startKm + " km)" : "") }]);
        notifyAdmin("sales_attendance", actorOf(s).name + " punched in", "Punched in at " + time + (late ? " (late)." : "."), actorOf(s).name);
        return send(res, 200, { ok: true, action: payload.action, entry });
      }

      const punchOutDate = findPunchOutDate(mine, now);
      const punchOutEntry = punchOutDate ? mine[punchOutDate] : null;
      if (!punchOutEntry || !punchOutEntry.inAt || punchOutEntry.outAt)
        return send(res, 409, { error: "You must punch in before punching out." });

      // Ending odometer is needed when the day was started with a starting reading (days punched in before this rule are not blocked).
      let endKm = null;
      if (punchOutEntry.startKm != null) {
        endKm = Math.round(Number(payload.endKm));
        if (!(endKm > 0)) return send(res, 400, { error: "Enter the ending odometer reading (km)." });
        if (endKm < Number(punchOutEntry.startKm))
          return send(res, 400, { error: "The ending odometer cannot be less than the starting reading (" + punchOutEntry.startKm + " km)." });
      }
      const time = attendanceTime(now);
      const entry = Object.assign({}, punchOutEntry, { outTime: time, outAt: now, hours: attendanceHours(punchOutEntry.inAt, now) });
      if (endKm != null) {
        entry.endKm = endKm;
        entry.km = endKm - Number(punchOutEntry.startKm);
        // keep the vehicle's last odometer reading up to date for the next person
        try {
          const vl = stored("gm_admin_vehicles_v1"), vlist = Array.isArray(vl) ? JSON.parse(JSON.stringify(vl)) : null;
          const vv = vlist && vlist.filter((x) => x && x.id === punchOutEntry.vehicleId)[0];
          if (vv && endKm > (Number(vv.lastKm) || 0)) {
            vv.lastKm = endKm;
            setItem("gm_admin_vehicles_v1", JSON.stringify(vlist));
          }
        } catch (e) {}
      }
      mine[punchOutDate] = entry;
      const keep = Object.keys(mine).sort().slice(-90), trimmed = {};
      keep.forEach((day) => { trimmed[day] = mine[day]; });
      all[s.id] = trimmed;
      setItem("gm_sales_attendance_v1", JSON.stringify(all));
      syncSalesAttendanceToEmployee(punchOutDate, entry);
      const dateNote = punchOutDate === date ? "" : " for " + punchOutDate;
      logEvents(s, [{ type: "attendance", text: "Sales punched out" + dateNote + " at " + time + " (" + entry.hours + (endKm != null ? ", " + entry.km + " km driven" : "") + ")" }]);
      notifyAdmin("sales_attendance", actorOf(s).name + " punched out", "Punched out" + dateNote + " at " + time + " (" + entry.hours + ").", actorOf(s).name);
      return send(res, 200, { ok: true, action: payload.action, entry, date: punchOutDate });
    }, 4096);
  }

  return null;
}

module.exports = { handleSalesAttendanceRoute };