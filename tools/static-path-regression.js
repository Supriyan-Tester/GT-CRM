#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { isWithinRoot } = require("../shared/static-path");
const root = path.join(os.tmpdir(), "gmcrm-static-root");
const sibling = root + "-private";
assert.strictEqual(isWithinRoot(root, path.join(root, "index.html")), true);
assert.strictEqual(isWithinRoot(root, root), true);
assert.strictEqual(isWithinRoot(root, sibling + path.sep + "secret.js"), false);
assert.strictEqual(isWithinRoot(root, path.join(root, "..", "secret.js")), false);
assert.strictEqual(isWithinRoot(root, path.join(root, "..", "gmcrm-static-root-evil", "secret.js")), false);
const encodedTraversal = new URL("/..%2fgmcrm-static-root-private/secret.js", "http://localhost").pathname;
const decodedTraversal = decodeURIComponent(encodedTraversal);
assert.strictEqual(isWithinRoot(root, path.normalize(path.join(root, decodedTraversal))), false);
const link = path.join(root, "outside-link");
try {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(sibling, "secret.js"), "secret");
  try { fs.symlinkSync(sibling, link, "dir"); } catch (e) { if (e.code !== "EPERM") throw e; }
  if (fs.existsSync(link)) {
    const real = fs.realpathSync(link);
    assert.strictEqual(isWithinRoot(root, real), false);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(sibling, { recursive: true, force: true });
}
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
assert(server.includes('const { isWithinRoot } = require("./shared/static-path");'));
assert(server.includes("file = fs.realpathSync(file)"));
console.log("Static path traversal regression checks passed (8 assertions).");
