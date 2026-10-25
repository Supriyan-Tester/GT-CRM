// GM-CRM storage: keeps saved data and uploaded files either on this computer's disk (default)
// or in Supabase (when SUPABASE_URL and SUPABASE_SERVICE_KEY are set). No packages needed (Node 18+ for Supabase mode).
"use strict";
const fs = require("fs"),
  path = require("path");

module.exports = function (cfg) {
  const DATA = cfg.DATA,
    URL = (cfg.URL || "").replace(/\/+$/, ""),
    KEY = cfg.KEY || "",
    BUCKET = cfg.BUCKET || "gm-files";
  const cloud = !!(URL && KEY);
  const H = (extra) =>
    Object.assign({ apikey: KEY, Authorization: "Bearer " + KEY }, extra || {});
  const MIME = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    json: "application/json",
  };
  const mimeOf = (p) =>
    MIME[(p.split(".").pop() || "").toLowerCase()] ||
    "application/octet-stream";

  async function rest(method, p, body, extra) {
    const r = await fetch(URL + "/rest/v1/" + p, {
      method,
      headers: H(Object.assign({ "Content-Type": "application/json" }, extra)),
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("Supabase " + r.status + " " + t.slice(0, 200));
    }
    return r;
  }

  // ---- saved data: table gm_kv (key, v, rev) ----
  const kv = {
    async loadAll() {
      const rows = [];
      for (let off = 0; ; off += 1000) {
        const r = await rest("GET", "gm_kv?select=key,v,rev&order=key", null, {
          Range: off + "-" + (off + 999),
          "Range-Unit": "items",
        });
        const part = await r.json();
        rows.push.apply(rows, part);
        if (part.length < 1000) break;
      }
      return rows;
    },
    async save(rows) {
      for (let i = 0; i < rows.length; i += 100)
        await rest("POST", "gm_kv?on_conflict=key", rows.slice(i, i + 100), {
          Prefer: "resolution=merge-duplicates,return=minimal",
        });
    },
    async ping() {
      await rest("GET", "gm_kv?select=key&limit=1");
    },
  };

  // ---- files: paths look like v/<id>__<kind>.<ext>, p/<product>__<slot>.<ext>, c/<code>.jpg, backups/db-<date>.json ----
  const DIRS = { v: "vehicle-files", p: "product-files", c: "photos" };
  const idx = {}; // path -> { at, size }
  const cache = new Map();
  let cacheBytes = 0;
  const CACHE_MAX = 25 * 1024 * 1024;
  function cacheDrop(p) {
    const c = cache.get(p);
    if (c) {
      cacheBytes -= c.buf.length;
      cache.delete(p);
    }
  }
  function cacheAdd(p, buf) {
    if (buf.length > 3 * 1024 * 1024) return;
    cacheDrop(p);
    cache.set(p, { buf });
    cacheBytes += buf.length;
    for (const k of cache.keys()) {
      if (cacheBytes <= CACHE_MAX) break;
      cacheDrop(k);
    }
  }
  const localPath = (p) => {
    const i = p.indexOf("/");
    return path.join(DATA, DIRS[p.slice(0, i)] || "_none", p.slice(i + 1));
  };

  async function cloudList(prefix) {
    for (let off = 0; ; off += 1000) {
      const r = await fetch(URL + "/storage/v1/object/list/" + BUCKET, {
        method: "POST",
        headers: H({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          prefix,
          limit: 1000,
          offset: off,
          sortBy: { column: "name", order: "asc" },
        }),
      });
      if (!r.ok)
        throw new Error(
          "Supabase storage list " +
            r.status +
            ' (is the "' +
            BUCKET +
            '" bucket created? run supabase-setup.sql)',
        );
      const part = await r.json();
      part.forEach((o) => {
        if (o && o.id)
          idx[prefix + "/" + o.name] = {
            at: Date.parse(o.updated_at || o.created_at) || Date.now(),
            size: (o.metadata && o.metadata.size) || 0,
          };
      });
      if (part.length < 1000) break;
    }
  }

  const files = {
    cloud,
    async init() {
      if (cloud) {
        for (const pre of ["v", "p", "c", "backups"]) await cloudList(pre);
        return;
      }
      for (const pre of Object.keys(DIRS)) {
        fs.mkdirSync(path.join(DATA, DIRS[pre]), { recursive: true });
        fs.readdirSync(path.join(DATA, DIRS[pre])).forEach((n) => {
          try {
            const st = fs.statSync(path.join(DATA, DIRS[pre], n));
            if (st.isFile())
              idx[pre + "/" + n] = {
                at: Math.floor(st.mtimeMs),
                size: st.size,
              };
          } catch (e) {}
        });
      }
    },
    has: (p) => !!idx[p],
    meta: (p) => idx[p] || null,
    count: () => Object.keys(idx).length,
    names: (prefix) => Object.keys(idx).filter((k) => k.indexOf(prefix) === 0),
    async get(p) {
      if (!idx[p]) return null;
      if (!cloud) {
        try {
          return await fs.promises.readFile(localPath(p));
        } catch (e) {
          return null;
        }
      }
      const c = cache.get(p);
      if (c) return c.buf;
      const r = await fetch(URL + "/storage/v1/object/" + BUCKET + "/" + p, {
        headers: H(),
      });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error("Supabase storage get " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      cacheAdd(p, buf);
      return buf;
    },
    async put(p, buf, mime) {
      if (!cloud) {
        await fs.promises.writeFile(localPath(p), buf);
      } else {
        const r = await fetch(URL + "/storage/v1/object/" + BUCKET + "/" + p, {
          method: "POST",
          headers: H({
            "Content-Type": mime || mimeOf(p),
            "x-upsert": "true",
            "Cache-Control": "max-age=3600",
          }),
          body: buf,
        });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(
            "Supabase storage put " + r.status + " " + t.slice(0, 160),
          );
        }
        cacheDrop(p);
      }
      idx[p] = { at: Date.now(), size: buf.length };
    },
    async del(p) {
      if (!cloud) {
        try {
          await fs.promises.unlink(localPath(p));
        } catch (e) {}
      } else {
        const r = await fetch(URL + "/storage/v1/object/" + BUCKET + "/" + p, {
          method: "DELETE",
          headers: H(),
        });
        if (!r.ok && r.status !== 404 && r.status !== 400)
          throw new Error("Supabase storage delete " + r.status);
        cacheDrop(p);
      }
      delete idx[p];
    },
    // Used once by "node server.js --migrate": every file in this computer's data folders.
    localScan() {
      const out = [];
      Object.keys(DIRS).forEach((pre) => {
        const d = path.join(DATA, DIRS[pre]);
        let names = [];
        try {
          names = fs.readdirSync(d);
        } catch (e) {}
        names.forEach((n) => {
          const f = path.join(d, n);
          try {
            if (fs.statSync(f).isFile())
              out.push({ p: pre + "/" + n, file: f });
          } catch (e) {}
        });
      });
      return out;
    },
    mimeOf,
  };

  return { cloud, kv, files };
};
