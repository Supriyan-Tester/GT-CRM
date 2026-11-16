#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const storageFactory = require("../storage");

const PREFIX_DIR = { v: "vehicle-files", p: "product-files", c: "photos" };
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function safeRelative(name) {
  if (typeof name !== "string" || !/^(v|p|c)\/[A-Za-z0-9._-]+$/.test(name))
    throw new Error("Invalid attachment path in manifest");
  if (name.includes("..") || name.includes("\\"))
    throw new Error("Unsafe attachment path in manifest");
  return name;
}
function freshDirectory(dir) {
  const abs = path.resolve(dir);
  if (fs.existsSync(abs)) {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || !st.isDirectory() || fs.readdirSync(abs).length)
      throw new Error("Target directory must be a real, new or empty directory: " + abs);
  }
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}
async function createArchive(files, archiveDir) {
  const out = freshDirectory(archiveDir);
  const entries = [];
  for (const prefix of Object.keys(PREFIX_DIR)) {
    const names = files.names(prefix + "/").sort();
    for (const name of names) {
      safeRelative(name);
      const bytes = await files.get(name);
      if (!bytes) throw new Error("Attachment disappeared during backup: " + name);
      const rel = path.join("files", name);
      const target = path.join(out, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: "wx" });
      const reread = fs.readFileSync(target);
      if (!reread.equals(bytes)) throw new Error("Attachment read-back failed: " + name);
      entries.push({ path: name, size: bytes.length, sha256: sha256(bytes) });
    }
  }
  const manifest = {
    app: "GM-CRM attachment backup",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    files: entries,
  };
  const manifestPath = path.join(out, "manifest.json");
  fs.writeFileSync(manifestPath + ".tmp", JSON.stringify(manifest, null, 2), { flag: "wx" });
  fs.renameSync(manifestPath + ".tmp", manifestPath);
  return { archive: out, fileCount: entries.length };
}
function verifyArchive(archiveDir) {
  const root = path.resolve(archiveDir);
  const manifestPath = path.join(root, "manifest.json");
  const rootStat = fs.lstatSync(root);
  const manifestStat = fs.lstatSync(manifestPath);
  const filesRoot = path.join(root, "files");
  const filesRootStat = fs.lstatSync(filesRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || manifestStat.isSymbolicLink() || !manifestStat.isFile() || filesRootStat.isSymbolicLink() || !filesRootStat.isDirectory())
    throw new Error("Archive paths must be regular files and directories, not symlinks");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest || manifest.app !== "GM-CRM attachment backup" || manifest.formatVersion !== 1 || !Array.isArray(manifest.files) || manifest.fileCount !== manifest.files.length)
    throw new Error("Invalid attachment backup manifest");
  const seen = new Set();
  for (const entry of manifest.files) {
    const name = safeRelative(entry.path);
    if (seen.has(name)) throw new Error("Duplicate attachment path in manifest");
    seen.add(name);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))
      throw new Error("Invalid attachment metadata: " + name);
    const file = path.resolve(root, "files", name);
    const expectedRoot = path.resolve(root, "files") + path.sep;
    if (!file.startsWith(expectedRoot)) throw new Error("Attachment path escapes archive");
    const fileStat = fs.lstatSync(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error("Attachment must be a regular file: " + name);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256)
      throw new Error("Attachment integrity check failed: " + name);
  }
  return { ok: true, fileCount: manifest.files.length, generatedAt: manifest.generatedAt };
}
function restoreToIsolatedData(archiveDir, targetDataDir) {
  const verified = verifyArchive(archiveDir);
  const target = freshDirectory(targetDataDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(archiveDir), "manifest.json"), "utf8"));
  for (const entry of manifest.files) {
    const name = safeRelative(entry.path);
    const [prefix, filename] = name.split("/");
    const destination = path.join(target, PREFIX_DIR[prefix], filename);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const source = path.join(path.resolve(archiveDir), "files", name);
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    const copied = fs.readFileSync(destination);
    if (copied.length !== entry.size || sha256(copied) !== entry.sha256)
      throw new Error("Restored attachment verification failed: " + name);
  }
  return { ok: true, fileCount: verified.fileCount, targetDataDir: target };
}

async function main() {
  const [command, archive, target] = process.argv.slice(2);
  if (command === "verify") return console.log(JSON.stringify(verifyArchive(archive), null, 2));
  if (command === "restore") {
    if (!target) throw new Error("Usage: node tools/attachment-backup.js restore <archive-dir> <NEW-target-data-dir>");
    return console.log(JSON.stringify(restoreToIsolatedData(archive, target), null, 2));
  }
  if (command !== "create" || !archive)
    throw new Error("Usage: node tools/attachment-backup.js create <NEW-archive-dir> | verify <archive-dir> | restore <archive-dir> <NEW-target-data-dir>");
  const DATA = path.join(__dirname, "..", "data");
  const storage = storageFactory({ DATA, URL: process.env.SUPABASE_URL, KEY: process.env.SUPABASE_SERVICE_KEY, BUCKET: process.env.SUPABASE_BUCKET });
  await storage.files.init();
  console.log(JSON.stringify(await createArchive(storage.files, archive), null, 2));
}

module.exports = { createArchive, verifyArchive, restoreToIsolatedData, safeRelative };
if (require.main === module) main().catch((e) => { console.error("Attachment backup failed:", e.message); process.exitCode = 1; });
