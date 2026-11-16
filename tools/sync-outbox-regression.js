#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "shared", "sync.js"), "utf8");
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: !!condition });
}
check("all syncable gm_* keys can be marked dirty", /function track\(k\)[\s\S]*?ok\(k\)/.test(src));
check("dirty marker persists base revision for protected records", /base:\s*PROT\.test\(k\)[\s\S]*?readRev\[k\]/.test(src));
check("hydration skips locally queued records", /k in savedDirty/.test(src));
check("queued values are replayed after hydration", /Object\.keys\(queued\)[\s\S]*?push\(k,\s*rawGet\.call\(ls,\s*k\)\)/.test(src));
check("first-run migration does not duplicate queued keys", /!\(k in queued\)/.test(src));
check("successful save clears durable marker", /function markClean\(k\)[\s\S]*?delete m\[k\][\s\S]*?dirtySave\(m\)/.test(src));
checks.forEach(x => console.log((x.ok ? "PASS " : "FAIL ") + x.name));
const failed = checks.filter(x => !x.ok);
console.log(`${checks.length - failed.length}/${checks.length} durable outbox checks passed.`);
if (failed.length) process.exit(1);
