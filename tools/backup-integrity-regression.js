#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Backup = require(path.join(__dirname, "..", "backup-integrity"));
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "shared", "admin.js"), "utf8");
const sample = {
  rev: 9,
  items: {
    gm_customers_v1: { v: JSON.stringify([{ id: "c1", name: "Test" }]), rev: 8 },
    gm_routes_v1: { v: "[]", rev: 9 },
  },
  activity: { "202611": [{ t: 1, type: "customer", text: "created" }] },
};
const backup = Backup.createBackup(sample, "2026-11-02T00:00:00.000Z");
assert.equal(backup.app, "GM-CRM backup");
assert.equal(backup.formatVersion, 1);
assert.equal(Backup.verifyBackup(backup).ok, true);
assert.match(backup.integrity.digest, /^[a-f0-9]{64}$/);
console.log("PASS newly created backup has a valid SHA-256 checksum");

const tamperedRecord = JSON.parse(JSON.stringify(backup));
tamperedRecord.items.gm_customers_v1.v = "[]";
assert.equal(Backup.verifyBackup(tamperedRecord).reason, "checksum-mismatch");
console.log("PASS modified record data is detected");

const tamperedActivity = JSON.parse(JSON.stringify(backup));
tamperedActivity.activity["202611"][0].text = "changed";
assert.equal(Backup.verifyBackup(tamperedActivity).reason, "checksum-mismatch");
console.log("PASS modified activity log is detected");

const tamperedRevision = JSON.parse(JSON.stringify(backup));
tamperedRevision.rev += 1;
assert.equal(Backup.verifyBackup(tamperedRevision).reason, "checksum-mismatch");
console.log("PASS modified backup revision is detected");

const tamperedItemsRevision = JSON.parse(JSON.stringify(backup));
tamperedItemsRevision.items.gm_routes_v1.rev += 1;
assert.equal(Backup.verifyBackup(tamperedItemsRevision).reason, "checksum-mismatch");
console.log("PASS modified stored-record revision is detected");

const legacy = { app: "GM-CRM backup", ...sample };
assert.deepEqual(Backup.verifyBackup(legacy), { ok: true, legacy: true });
console.log("PASS valid legacy backups remain import-compatible");

const badMeta = JSON.parse(JSON.stringify(backup));
badMeta.integrity.algorithm = "md5";
assert.equal(Backup.verifyBackup(badMeta).reason, "invalid-integrity-metadata");
console.log("PASS unsupported checksum metadata is rejected");

for (const malformed of [null, undefined, [], "backup", 42]) {
  assert.equal(Backup.verifyBackup(malformed).ok, false);
}
console.log("PASS null, array and primitive backup payloads are rejected");

for (const digest of ["", "abc", "g".repeat(64), "A".repeat(63)]) {
  const invalid = JSON.parse(JSON.stringify(backup));
  invalid.integrity.digest = digest;
  assert.equal(Backup.verifyBackup(invalid).reason, "invalid-integrity-metadata");
}
console.log("PASS malformed checksum lengths and characters are rejected");

const legacyEmpty = Backup.verifyBackup({ app: "GM-CRM backup" });
assert.deepEqual(legacyEmpty, { ok: true, legacy: true });
console.log("PASS checksum-free legacy backup compatibility is retained");

assert(/BackupIntegrity\.verifyBackup\(b\)/.test(server));
assert(/Safety backup verification failed; restore was not started/.test(server));
assert(/Daily backup verification failed/.test(server));
assert(/renameSync\(tmpBackup, bk\)/.test(server));
assert(/retained\.length > 30/.test(server));
assert(/while \(old\.length > 14\)/.test(server));
assert(/legacy backup \(no checksum\)/.test(admin));
console.log("PASS local daily backups are atomically renamed and retention is bounded");
console.log("PASS server import, safety-copy and UI verification safeguards are wired");
console.log("12/12 backup integrity checks passed.");
