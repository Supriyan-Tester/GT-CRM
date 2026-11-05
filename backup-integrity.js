"use strict";
const crypto = require("crypto");

function payloadOf(data) {
  return { rev: data.rev, items: data.items, activity: data.activity || {} };
}
function digest(data) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payloadOf(data)), "utf8")
    .digest("hex");
}
function createBackup(data, exportedAt) {
  const payload = payloadOf(data);
  return Object.assign(
    {
      app: "GM-CRM backup",
      formatVersion: 1,
      exportedAt: exportedAt || new Date().toISOString(),
      integrity: { algorithm: "sha256", digest: digest(payload) },
    },
    payload,
  );
}
function verifyBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { ok: false, reason: "not-an-object" };
  if (!data.integrity) return { ok: true, legacy: true };
  if (
    data.integrity.algorithm !== "sha256" ||
    typeof data.integrity.digest !== "string" ||
    !/^[a-f0-9]{64}$/i.test(data.integrity.digest)
  )
    return { ok: false, reason: "invalid-integrity-metadata" };
  const actual = digest(data);
  const expected = data.integrity.digest.toLowerCase();
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b)
    ? { ok: true, legacy: false }
    : { ok: false, reason: "checksum-mismatch" };
}
module.exports = { createBackup, verifyBackup, digest };
