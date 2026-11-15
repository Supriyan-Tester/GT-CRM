#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const rd = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const login = rd("login.html"), theme = rd("shared/theme.css");
const reduce = (theme.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\/\* Decorative motion stops[\s\S]*?\n\}/) || [""])[0];
const checks = [
  [/id="go"[\s\S]{0,200}class="spin"/.test(login) && /#go\.loading \.spin\s*\{[^}]*display:\s*inline-block/.test(login), "Sign In button has a spinner that shows while loading"],
  [/function setLoading\(on\)[\s\S]{0,200}aria-busy/.test(login) && /Signing in/.test(login), "button announces the busy state and changes its text"],
  [/go\.disabled = true;\s*setLoading\(true\)/.test(login) && /setLoading\(false\)/.test(login), "spinner starts on submit and stops on failure"],
  [/AbortController/.test(login) && /20000/.test(login), "sign-in request gives up after 20 s so the spinner cannot spin forever"],
  [reduce.includes('[class*="spin" i]') && reduce.includes("#gml-sp") && reduce.includes(".i-ld"), "reduce-motion setting no longer freezes loading spinners"],
  [!/body:not\(:has\(\.a-main\)\) \* \{\s*animation: none/.test(theme), "no blanket animation:none rule remains"],
];
checks.forEach(([ok, n]) => { assert.ok(ok, "FAILED: " + n); console.log("PASS " + n); });
console.log("Sign-in spinner regression: " + checks.length + " checks passed.");
