#!/usr/bin/env node
"use strict";
// A "Net Amount" on the row that starts a bill is the whole bill's total. It must never become the first item's amount.
const assert = require("assert");
const path = require("path");
const X = require(path.join(__dirname, "..", "shared", "xlsx-lite.js"));
const rows = [
  [
    "S.no",
    "Bill No",
    "Party Name",
    "Net Amount",
    "Item Name",
    "MRP Rate",
    "Qty",
    "Rate+Tax",
  ],
  [1, "4201", "TEST SHOP", 1225, "ITEM A", 90, 5, 63],
  ["", "", "", "", "ITEM B", 200, 3, 56.7],
  ["", "", "", "", "ITEM C", 129, 3, 70],
  [2, "4202", "OTHER SHOP", 430, "ITEM D", 60, 8, 53.75],
];
const out = X.bill(rows);
assert(out && out.bills.length === 2, "two bills read");
const a = out.bills[0];
assert.strictEqual(
  a.items[0].amt,
  315,
  "first item amount is qty x rate, not the bill's Net Amount",
);
assert.strictEqual(a.items[0].rate, 63, "first item rate is the sheet's rate");
assert.strictEqual(a.amount, 1225, "bill amount is the sheet's own Net Amount");
assert.strictEqual(
  out.bills[1].amount,
  430,
  "single-line bill keeps its Net Amount",
);
assert.strictEqual(
  out.total,
  1655,
  "total of all bills equals the sum of the sheet's Net Amounts",
);
console.log(
  "PASS bill upload: Net Amount is the bill total, item amounts are qty x Rate+Tax (5 assertions).",
);
