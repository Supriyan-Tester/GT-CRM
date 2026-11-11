#!/usr/bin/env node
"use strict";
const assert = require("assert");
const path = require("path");
const Activity = require(path.join(__dirname, "..", "activity"));

function run(name, fn) {
  fn();
  console.log("PASS " + name);
}

run("unknown storage keys produce no activity", () => {
  assert.deepStrictEqual(Activity.diff("gm_unknown_v1", "{}", "{}"), []);
});

run("unchanged product data produces no activity", () => {
  const value = JSON.stringify([{ id: "p1", name: "Tea", price: 10 }]);
  assert.deepStrictEqual(Activity.diff("gm_admin_products_v1", value, value), []);
});

run("product creation is described", () => {
  const events = Activity.diff("gm_admin_products_v1", "[]", JSON.stringify([{ id: "p1", name: "Tea", code: "T01" }]));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "product");
  assert.match(events[0].text, /added: Tea \(T01\)/i);
});

run("product deletion is described", () => {
  const events = Activity.diff("gm_admin_products_v1", JSON.stringify([{ id: "p1", name: "Tea" }]), "[]");
  assert.strictEqual(events.length, 1);
  assert.match(events[0].text, /deleted: Tea/i);
});

run("product field changes are described", () => {
  const before = JSON.stringify([{ id: "p1", name: "Tea", price: 10 }]);
  const after = JSON.stringify([{ id: "p1", name: "Tea", price: 12 }]);
  const events = Activity.diff("gm_admin_products_v1", before, after);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "product");
  assert.match(events[0].text, /price changed/i);
});

run("admin account additions are described", () => {
  const events = Activity.diff("gm_admin_account_v1", "[]", JSON.stringify([{ id: "a1", name: "Operator", role: "admin" }]));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "settings");
  assert.match(events[0].text, /admin account added: Operator/i);
});

run("malformed JSON inputs do not crash supported diff handlers", () => {
  assert.doesNotThrow(() => Activity.diff("gm_admin_products_v1", "{bad", "{also bad"));
  assert.doesNotThrow(() => Activity.diff("gm_admin_v1", null, undefined));
  assert.deepStrictEqual(Activity.diff("gm_admin_products_v1", "{bad", "{also bad"), []);
});

run("non-array product payloads are handled safely", () => {
  assert.deepStrictEqual(Activity.diff("gm_admin_products_v1", "{}", "{}"), []);
});

console.log("8/8 activity diff checks passed.");
