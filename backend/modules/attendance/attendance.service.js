"use strict";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_OPEN_SESSION_MS = 24 * 60 * 60 * 1000;

function istDateAt(timestamp) {
  return new Date(Number(timestamp) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Resolve which attendance date a punch-out should close.
 * Prefer today's open entry. If none exists, allow the immediately preceding
 * IST date to be closed when its punch-in is no more than 24 hours old.
 * Completed or stale entries are never reopened.
 */
function findPunchOutDate(attendanceByDate, now) {
  if (!attendanceByDate || typeof attendanceByDate !== "object" || Array.isArray(attendanceByDate)) return null;
  const currentDate = istDateAt(now);
  const today = attendanceByDate[currentDate];
  if (today) return today.inAt && !today.outAt ? currentDate : null;

  const candidates = Object.keys(attendanceByDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < currentDate)
    .map((date) => ({ date, entry: attendanceByDate[date] }))
    .filter(({ entry }) => entry && Number.isFinite(Number(entry.inAt)) && !entry.outAt && Number(entry.inAt) <= now)
    .filter(({ entry }) => now - Number(entry.inAt) <= MAX_OPEN_SESSION_MS)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!candidates.length) return null;
  const previousDate = new Date(Date.parse(currentDate + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  return candidates[0].date === previousDate ? candidates[0].date : null;
}

function getPendingPunchOut(attendanceByDate, now) {
  const today = istDateAt(now);
  const date = findPunchOutDate(attendanceByDate, now);
  if (!date || date === today) return null;
  return { date, entry: attendanceByDate[date] };
}

module.exports = { findPunchOutDate, getPendingPunchOut, istDateAt, MAX_OPEN_SESSION_MS };
