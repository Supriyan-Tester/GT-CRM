#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const r = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const theme = r("shared/theme.css"), login = r("login.html");
const rule = theme.slice(theme.lastIndexOf("@media (prefers-reduced-motion: reduce)", theme.indexOf("animation: none !important")));
const checks = [
  [/\[class\*="spin" i\]/.test(rule) && /#gml-sp/.test(rule), "reduce-motion rule keeps loading spinners turning"],
  [/#go\.loading \.spin\s*\{[^}]*display:\s*inline-block/.test(login), "sign-in spinner is shown while loading"],
  [/AbortController/.test(login) && /20000/.test(login), "sign-in request times out so the spinner cannot spin forever"],
  [/function setLoading\(on\)[\s\S]{0,260}aria-busy/.test(login), "button announces busy state"],
];
checks.forEach(([ok, n]) => { assert.ok(ok, "FAILED: " + n); console.log("PASS " + n); });
console.log("Login spinner regression: " + checks.length + " checks passed.");
