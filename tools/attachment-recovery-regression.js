#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const storageFactory = require("../storage");
const Backup = require("./attachment-backup");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gmcrm-recovery-"));
(async () => {
  try {
    const sourceData = path.join(root, "source-data");
    fs.mkdirSync(path.join(sourceData, "vehicle-files"), { recursive: true });
    fs.mkdirSync(path.join(sourceData, "product-files"), { recursive: true });
    fs.mkdirSync(path.join(sourceData, "photos"), { recursive: true });
    fs.writeFileSync(path.join(sourceData, "vehicle-files", "veh1__rc.pdf"), Buffer.from("vehicle-doc-fixture"));
    fs.writeFileSync(path.join(sourceData, "product-files", "prod1__main.png"), Buffer.from("product-image-fixture"));
    fs.writeFileSync(path.join(sourceData, "photos", "cust1.jpg"), Buffer.from("customer-photo-fixture"));
    const storage = storageFactory({ DATA: sourceData });
    await storage.files.init();
    const archive = path.join(root, "archive");
    const created = await Backup.createArchive(storage.files, archive);
    assert.equal(created.fileCount, 3);
    console.log("PASS attachment archive includes vehicle, product and customer files");
    assert.equal(Backup.verifyArchive(archive).fileCount, 3);
    console.log("PASS manifest and all SHA-256 hashes verify");
    const target = path.join(root, "isolated-restore");
    const restored = Backup.restoreToIsolatedData(archive, target);
    assert.equal(restored.fileCount, 3);
    assert.deepEqual(fs.readFileSync(path.join(target, "vehicle-files", "veh1__rc.pdf")), Buffer.from("vehicle-doc-fixture"));
    assert.deepEqual(fs.readFileSync(path.join(target, "product-files", "prod1__main.png")), Buffer.from("product-image-fixture"));
    assert.deepEqual(fs.readFileSync(path.join(target, "photos", "cust1.jpg")), Buffer.from("customer-photo-fixture"));
    console.log("PASS restore recreates attachment bytes in an isolated data directory");
    const corrupt = path.join(archive, "files", "c", "cust1.jpg");
    fs.writeFileSync(corrupt, "tampered");
    assert.throws(() => Backup.verifyArchive(archive), /integrity check failed/);
    console.log("PASS corrupted attachment is rejected before restore");
    assert.throws(() => Backup.restoreToIsolatedData(archive, path.join(root, "must-not-exist")), /integrity check failed/);
    console.log("PASS failed verification prevents restore output creation");
    assert.throws(() => Backup.safeRelative("../../outside"), /Invalid attachment path/);
    console.log("PASS traversal paths in a manifest are rejected");
    console.log("6/6 attachment recovery checks passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
