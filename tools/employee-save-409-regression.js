#!/usr/bin/env node
"use strict";
// Regression for the "Another device saved newer data" banner that appeared when adding/editing an employee.
// Runs shared/sync.js in a small fake browser against a fake server that applies the same stale-save rule as server.js.
const vm = require("vm"), fs = require("fs"), path = require("path"), assert = require("assert");
const SYNC = path.join(__dirname, "..", "shared", "sync.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PK = "gm_admin_wprofile_v1", WK = "gm_admin_workers_v1";

function makeServer(init) {
  const db = { rev: 0, items: {} }, log = [];
  Object.keys(init).forEach((k) => (db.items[k] = { v: init[k], rev: ++db.rev }));
  const res = (code, obj) => Promise.resolve({ ok: code < 300, status: code, json: () => Promise.resolve(obj) });
  return {
    db, log,
    external(k, v) { db.items[k] = { v, rev: ++db.rev }; }, // another device saves
    handle(url, o) {
      const u = String(url);
      if (/\/api\/state/.test(u)) {
        const since = +(/since=(\d+)/.exec(u) || [0, 0])[1], items = {};
        Object.keys(db.items).forEach((k) => { if (db.items[k].rev > since) items[k] = db.items[k]; });
        return res(200, { rev: db.rev, items });
      }
      const key = decodeURIComponent(/\/api\/kv\/([^?]+)/.exec(u)[1]), b = o.body ? JSON.parse(o.body) : null;
      if (o.method === "PUT") {
        const cur = db.items[key];
        if (cur) {
          if (cur.v === b.v) return res(200, { ok: true, rev: cur.rev });
          if (!Number.isFinite(b.base) || b.base !== cur.rev) { log.push("409 " + key); return res(409, { error: "stale", code: "stale", rev: cur.rev }); }
        }
        db.items[key] = { v: b.v, rev: ++db.rev };
        log.push("200 " + key);
        return res(200, { ok: true, rev: db.rev });
      }
      return res(200, {});
    },
  };
}
function makeBrowser(server, cache) {
  const store = new Map(Object.entries(cache || {}));
  class Storage { getItem(k) { return store.has(k) ? store.get(k) : null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } key(i) { return Array.from(store.keys())[i] ?? null; } get length() { return store.size; } }
  const ls = new Storage(), L = {}, ctx = {
    Storage, console, JSON, Promise, Date, Math, Object, Array, String, Number, Error, RegExp, Blob: class {}, URL: {}, setTimeout, clearTimeout,
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    setInterval: () => 1, location: { protocol: "http:", origin: "http://x", pathname: "/admin/workers.html", replace() {} },
    sessionStorage: { removeItem() {} }, document: { hidden: false, body: null, getElementById: () => null, addEventListener() {}, createElement: () => ({}) },
    fetch: (u, o) => server.handle(u, o || {}), alert() {}, events: [],
  };
  ctx.window = ctx; ctx.localStorage = ls;
  ctx.addEventListener = (t, f) => (L[t] = L[t] || []).push(f);
  ctx.dispatchEvent = (e) => { ctx.events.push(e.type); (L[e.type] || []).forEach((f) => f(e)); };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(SYNC, "utf8"), ctx);
  return { ls, store, ctx };
}
const prof = (o) => JSON.stringify(o), get = (srv, k) => JSON.parse(srv.db.items[k].v);
const results = [];
async function t(name, fn) { try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); } }

(async () => {
  await t("save right after page opens (before first server read) is accepted, not 409", async () => {
    const P = prof({ W001: { role: "Delivery / Driver" } }), srv = makeServer({ [PK]: P });
    const b = makeBrowser(srv, { [PK]: P });
    b.ls.getItem(PK);                 // workers.js reads the profile at start-up
    const p = JSON.parse(P); p.W002 = { role: "Sales" };
    b.ls.setItem(PK, prof(p));        // ensureCodes()/Save fires before the server answer arrives
    await sleep(60);
    assert.ok(get(srv, PK).W002, "W002 saved"); assert.ok(!srv.log.some((x) => x.startsWith("409")), "no 409: " + srv.log);
    assert.ok(!(b.store.get("gmq_dirty") || "").includes("conflict"), "no conflict marker");
  });
  await t("page whose cache equals the server saves fine later (no repaint happened)", async () => {
    const P = prof({ W001: { role: "Sales" } }), srv = makeServer({ [PK]: P }), b = makeBrowser(srv, { [PK]: P });
    b.ls.getItem(PK); await sleep(40);
    const p = JSON.parse(P); p.W001.notes = "x"; b.ls.setItem(PK, prof(p)); await sleep(40);
    assert.strictEqual(get(srv, PK).W001.notes, "x"); assert.strictEqual(srv.log.filter((x) => x.startsWith("409")).length, 0);
  });
  await t("another device edited a different employee: both changes kept, no banner", async () => {
    const P = prof({ W001: { role: "Sales" }, W002: { role: "Helper" } }), srv = makeServer({ [PK]: P }), b = makeBrowser(srv, { [PK]: P });
    b.ls.getItem(PK); await sleep(40);
    srv.external(PK, prof({ W001: { role: "Sales" }, W002: { role: "Helper", salary: 9000 } })); // other device, not yet polled here
    const p = JSON.parse(P); p.W001.notes = "mine"; b.ls.setItem(PK, prof(p)); await sleep(80);
    const f = get(srv, PK); assert.strictEqual(f.W001.notes, "mine"); assert.strictEqual(f.W002.salary, 9000);
    assert.ok(!(b.store.get("gmq_dirty") || "").includes("conflict"), "no conflict marker");
  });
  await t("new employee added while another device added a profile field: merged", async () => {
    const W = { workers: [{ id: "W001", name: "A" }], leaves: [] }, srv = makeServer({ [WK]: JSON.stringify(W) }), b = makeBrowser(srv, { [WK]: JSON.stringify(W) });
    b.ls.getItem(WK); await sleep(40);
    srv.external(WK, JSON.stringify({ workers: [{ id: "W001", name: "A", phone: "999" }], leaves: [] }));
    b.ls.setItem(WK, JSON.stringify({ workers: [{ id: "W001", name: "A" }, { id: "W002", name: "New" }], leaves: [] })); await sleep(80);
    const f = get(srv, WK); assert.strictEqual(f.workers.length, 2); assert.strictEqual(f.workers[0].phone, "999"); assert.strictEqual(f.workers[1].name, "New");
  });
  await t("two devices created the same new employee id: still asks the user (no silent overwrite)", async () => {
    const W = { workers: [{ id: "W001", name: "A" }] }, srv = makeServer({ [WK]: JSON.stringify(W) }), b = makeBrowser(srv, { [WK]: JSON.stringify(W) });
    b.ls.getItem(WK); await sleep(40);
    srv.external(WK, JSON.stringify({ workers: [{ id: "W001", name: "A" }, { id: "W002", name: "Other device" }] }));
    b.ls.setItem(WK, JSON.stringify({ workers: [{ id: "W001", name: "A" }, { id: "W002", name: "Mine" }] })); await sleep(80);
    assert.strictEqual(get(srv, WK).workers[1].name, "Other device"); assert.ok((b.store.get("gmq_dirty") || "").includes("conflict"));
  });
  await t("an older server answer cannot move the known revision backwards", async () => {
    const P = prof({ W001: {} }), srv = makeServer({ [PK]: P }), b = makeBrowser(srv, { [PK]: P });
    await sleep(40); b.ls.getItem(PK);
    b.ls.setItem(PK, prof({ W001: { a: 1 } })); await sleep(40);       // rev now 2
    b.ctx.GMSync.pull(); await sleep(40);                                 // pull returns the same or newer, never older
    b.ls.getItem(PK); b.ls.setItem(PK, prof({ W001: { a: 2 } })); await sleep(40);
    assert.strictEqual(get(srv, PK).W001.a, 2); assert.strictEqual(srv.log.filter((x) => x.startsWith("409")).length, 0);
  });
  results.forEach((r) => console.log((r[1] ? "PASS " : "FAIL ") + r[0] + (r[2] ? "  -> " + r[2] : "")));
  const bad = results.filter((r) => !r[1]); console.log(`${results.length - bad.length}/${results.length} employee-save regression checks passed.`);
  if (bad.length) process.exit(1);
})();