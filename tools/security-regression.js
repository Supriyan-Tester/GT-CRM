"use strict";
// Lightweight regression checks for the shared Admin HTML escaping helper.
// Run with: node tools/security-regression.js
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(require("path").join(__dirname, "..", "shared", "admin.js"), "utf8");
const match = source.match(/function esc\(s\)\s*\{[\s\S]*?\n  \}/);
if (!match) throw new Error("GA.esc helper was not found");
const esc = vm.runInNewContext("(" + match[0].replace(/^function esc\(s\)/, "function(s)") + ")");
const cases = [
  ["<script>alert(1)</script>", "&lt;script&gt;alert(1)&lt;/script&gt;"],
  [`'\"&<>`, "&#39;&quot;&amp;&lt;&gt;"],
  [null, ""],
  [42, "42"],
];
for (const [input, expected] of cases) {
  const actual = esc(input);
  if (actual !== expected) {
    throw new Error(`GA.esc regression: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
console.log(`GA.esc regression checks passed (${cases.length} cases).`);
