#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const sync = fs.readFileSync(path.join(__dirname, "..", "shared", "sync.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: !!condition });
}
const clientProt = /var PROT\s*=\s*\/\^\((.*?)\)\$\//s.exec(sync);
const serverProt = /const PROTECTED\s*=\s*new Set\(\[(.*?)\]\)/s.exec(server);
const extract = (s) => Array.from(s.matchAll(/gm_[A-Za-z0-9_]+/g)).map(m => m[0]).sort();
check("client and server protected-record lists are identical",
  !!clientProt && !!serverProt &&
  JSON.stringify([...new Set(extract(clientProt[1]))]) ===
  JSON.stringify([...new Set(extract(serverProt[1]))]));

check("stale conflicts persist a durable conflict marker",
  /function markConflict\(k, base, serverRev\)[\s\S]*?conflict:\s*true/.test(sync));
check("conflicted keys are blocked from automatic retries",
  /function send\(k, force\)[\s\S]*?isConflict\(k\)/.test(sync));
check("conflicted records are not automatically replayed after reload",
  /var entry = queued\[k\];\s*if \(entry && entry\.conflict\) return/.test(sync));
check("stale 409 handling preserves the local marker instead of clearing it",
  /if \(r\.status === 409\)[\s\S]*?markConflict\(k, readRev\[k\], j && j\.rev\)/.test(sync) &&
  !/if \(r\.status === 409\)[\s\S]*?markClean\(k\)/.test(sync));
check("server hydration continues to skip locally dirty/conflicted records",
  /k in savedDirty/.test(sync));
check("user can export conflicted local records",
  /Download local copy/.test(sync) && /localValue:\s*rawGet\.call\(ls,\s*k\)/.test(sync));
check("user can explicitly discard conflicts and reload server data",
  /Discard local copy & reload/.test(sync) && /if \(m\[k\] && m\[k\]\.conflict\)[\s\S]*?delete m\[k\]/.test(sync));
checks.forEach(x => console.log((x.ok ? "PASS " : "FAIL ") + x.name));
const failed = checks.filter(x => !x.ok);
console.log(`${checks.length - failed.length}/${checks.length} multi-device conflict checks passed.`);
if (failed.length) process.exit(1);
