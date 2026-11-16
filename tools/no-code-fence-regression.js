#!/usr/bin/env node
"use strict";
// A pasted markdown code fence (```html) at the top or bottom of a page shows up as text in the browser.
const fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.resolve(__dirname, ".."), skip = new Set(["node_modules", "_backup_before_updates", ".git", "tests"]);
let n = 0; const bad = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(html|js|css)$/.test(e.name)) {
      const t = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "").trim();
      n++;
      if (/^```/.test(t) || /```$/.test(t)) bad.push(path.relative(root, f));
    }
  }
})(root);
assert.deepStrictEqual(bad, [], "Stray code fence in: " + bad.join(", "));
console.log("No stray markdown code fences in " + n + " html/js/css files.");
