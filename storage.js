// GM-CRM storage: keeps saved data and uploaded files either on this computer's disk (default)
// or in Supabase (when SUPABASE_URL and SUPABASE_SERVICE_KEY are set). No packages needed (Node 18+ for Supabase mode).
// Files (photos, documents, backups) go to Backblaze B2 when B2_KEY_ID, B2_APP_KEY, B2_BUCKET and B2_ENDPOINT are set
// (needs the @aws-sdk/client-s3 package). If they are not set, files stay where they were (Supabase bucket or disk).
"use strict";
const fs = require("fs"),
  path = require("path");

module.exports = function (cfg) {
  const DATA = cfg.DATA,
    URL = (cfg.URL || "").replace(/\/+$/, ""),
    KEY = cfg.KEY || "",
    BUCKET = cfg.BUCKET || "gm-files";
  const cloud = !!(URL && KEY);

  // ---- Backblaze B2 (S3 compatible) for files ----
  const env = process.env;
  const useB2 = !!(
    (cfg.B2_BUCKET || env.B2_BUCKET) &&
    (cfg.B2_KEY_ID || env.B2_KEY_ID) &&
    (cfg.B2_APP_KEY || env.B2_APP_KEY) &&
    (cfg.B2_ENDPOINT || env.B2_ENDPOINT)
  );
  let s3 = null,
    S3;
  function b2Client() {
    if (s3) return s3;
    S3 = require("@aws-sdk/client-s3");
    const endpoint = String(cfg.B2_ENDPOINT || env.B2_ENDPOINT).trim();
    const m = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
    s3 = new S3.S3Client({
      endpoint: /^https?:\/\//i.test(endpoint) ? endpoint : "https://" + endpoint,
      region: String(cfg.B2_REGION || env.B2_REGION || (m && m[1]) || "us-west-004").trim(),
      credentials: {
        accessKeyId: String(cfg.B2_KEY_ID || env.B2_KEY_ID).trim(),
        secretAccessKey: String(cfg.B2_APP_KEY || env.B2_APP_KEY).trim(),
      },
      forcePathStyle: true,
      // Backblaze does not accept the newer automatic checksums the SDK adds by default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return s3;
  }
  const B2_BUCKET = String(cfg.B2_BUCKET || env.B2_BUCKET || "").trim();
  const isMissing = (e) =>
    e &&
    (e.name === "NoSuchKey" ||
      e.name === "NotFound" ||
      (e.$metadata && e.$metadata.httpStatusCode === 404));

  // Folder names in B2 are written out in full (customers/, vehicles/, products/). The rest of the app keeps using the
  // short names (c/, v/, p/), so nothing saved in the data changes. Files already saved under a short name still work.
  const B2_DIRS = { v: "vehicles", p: "products", c: "customers" };
  const B2_SHORT = Object.fromEntries(Object.entries(B2_DIRS).map(([s, f]) => [f, s]));
  const toKey = (p) => {
    const i = p.indexOf("/");
    const full = B2_DIRS[p.slice(0, i)];
    return full ? full + p.slice(i) : p;
  };
  const fromKey = (k) => {
    const i = k.indexOf("/");
    const short = B2_SHORT[k.slice(0, i)];
    return short ? short + k.slice(i) : k;
  };
  const known = new Map(); // app path -> the key it is really stored under in B2

  // Same four actions for B2 and for the Supabase bucket, so the code below does not care which one is used.
  const b2Backend = {
    async list() {
      const out = [];
      const seen = new Map();
      let token;
      do {
        const r = await b2Client().send(
          new S3.ListObjectsV2Command({ Bucket: B2_BUCKET, ContinuationToken: token }),
        );
        (r.Contents || []).forEach((o) => {
          const p = fromKey(o.Key);
          // If a file exists under both names, the full-name one wins.
          if (seen.has(p) && seen.get(p) === toKey(p) && o.Key !== toKey(p)) return;
          seen.set(p, o.Key);
          known.set(p, o.Key);
          out.push({ p, at: o.LastModified ? +o.LastModified : Date.now(), size: o.Size || 0 });
        });
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      // keep one entry per app path
      const uniq = new Map();
      out.forEach((o) => uniq.set(o.p, o));
      return [...uniq.values()];
    },
    async get(p) {
      const tryKey = async (k) => {
        try {
          const r = await b2Client().send(new S3.GetObjectCommand({ Bucket: B2_BUCKET, Key: k }));
          return Buffer.from(await r.Body.transformToByteArray());
        } catch (e) {
          if (isMissing(e)) return null;
          throw e;
        }
      };
      const k = known.get(p) || toKey(p);
      const buf = await tryKey(k);
      return buf || (k !== toKey(p) ? tryKey(toKey(p)) : null); // e.g. the folder was just renamed
    },
    async put(p, buf, mime) {
      const key = toKey(p),
        old = known.get(p);
      await b2Client().send(
        new S3.PutObjectCommand({ Bucket: B2_BUCKET, Key: key, Body: buf, ContentType: mime || mimeOf(p) }),
      );
      known.set(p, key);
      if (old && old !== key) // an older copy under the short name: remove it so there is one file, not two
        await b2Client().send(new S3.DeleteObjectCommand({ Bucket: B2_BUCKET, Key: old })).catch(() => {});
    },
    async del(p) {
      const keys = new Set([toKey(p), known.get(p)].filter(Boolean));
      for (const k of keys) await b2Client().send(new S3.DeleteObjectCommand({ Bucket: B2_BUCKET, Key: k }));
      known.delete(p);
    },
  };
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

  // ---- optional: also copy employees/advances into the new GT-CRM tables (set GT_SYNC_EMPLOYEES=1) ----
  // The app still reads and writes gm_kv as before; this only copies in the background and never blocks or breaks a save.
  const syncOn = cloud && /^(1|true|on|yes)$/i.test(String(cfg.GT_SYNC_EMPLOYEES || env.GT_SYNC_EMPLOYEES || ""));
  const employeeSync = syncOn
    ? require("./backend/modules/employees/employees.sync").createEmployeeSync({ url: URL, key: KEY })
    : null;
  // same idea for products, vehicles, routes, customers (set GT_SYNC_CATALOG=1)
  const catalogOn = cloud && /^(1|true|on|yes)$/i.test(String(cfg.GT_SYNC_CATALOG || env.GT_SYNC_CATALOG || ""));
  const catalogSync = catalogOn
    ? require("./backend/modules/catalog/catalog.sync").createCatalogSync({ url: URL, key: KEY })
    : null;

  // and for sales orders, shop visits and returns (set GT_SYNC_SALES=1)
  const salesOn = cloud && /^(1|true|on|yes)$/i.test(String(cfg.GT_SYNC_SALES || env.GT_SYNC_SALES || ""));
  const salesSync = salesOn
    ? require("./backend/modules/sales/sales.sync").createSalesSync({ url: URL, key: KEY })
    : null;

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
      if (employeeSync) {
        employeeSync.prime(rows);
        employeeSync.schedule(5000); // a few seconds after start-up, in the background
      }
      if (catalogSync) {
        catalogSync.prime(rows);
        catalogSync.schedule(9000); // after the employees copy, so "pinned by" can be matched
      }
      if (salesSync) {
        salesSync.prime(rows);
        salesSync.schedule(14000); // after employees and catalog, so shops, products and people can be matched
      }
      return rows;
    },
    async save(rows) {
      for (let i = 0; i < rows.length; i += 100)
        await rest("POST", "gm_kv?on_conflict=key", rows.slice(i, i + 100), {
          Prefer: "resolution=merge-duplicates,return=minimal",
        });
      if (employeeSync) employeeSync.onSave(rows); // only after the normal save worked
      if (catalogSync) catalogSync.onSave(rows);
      if (salesSync) salesSync.onSave(rows);
    },
    async ping() {
      await rest("GET", "gm_kv?select=key&limit=1");
    },
  };

  // ---- files: paths look like v/<id>__<kind>.<ext>, p/<product>__<slot>.<ext>, c/<code>.jpg, backups/db-<date>.json ----
  const DIRS = { v: "vehicle-files", p: "product-files", c: "photos", accounts: "accounts" };
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

  // Supabase bucket backend (used when B2 is not configured but Supabase is).
  async function supaList(prefix, out) {
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
          out.push({
            p: prefix + "/" + o.name,
            at: Date.parse(o.updated_at || o.created_at) || Date.now(),
            size: (o.metadata && o.metadata.size) || 0,
          });
      });
      if (part.length < 1000) break;
    }
  }
  const supaBackend = {
    async list() {
      const out = [];
      for (const pre of ["v", "p", "c", "accounts", "accounts/evidence", "backups"]) await supaList(pre, out);
      return out;
    },
    async get(p) {
      const r = await fetch(URL + "/storage/v1/object/" + BUCKET + "/" + p, { headers: H() });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error("Supabase storage get " + r.status);
      return Buffer.from(await r.arrayBuffer());
    },
    async put(p, buf, mime) {
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
        throw new Error("Supabase storage put " + r.status + " " + t.slice(0, 160));
      }
    },
    async del(p) {
      const r = await fetch(URL + "/storage/v1/object/" + BUCKET + "/" + p, { method: "DELETE", headers: H() });
      if (!r.ok && r.status !== 404 && r.status !== 400)
        throw new Error("Supabase storage delete " + r.status);
    },
  };
  // Where files live: B2 if set up, else the Supabase bucket if Supabase is set up, else this computer's disk.
  const remote = useB2 ? b2Backend : cloud ? supaBackend : null;

  const files = {
    cloud,
    provider: useB2 ? "b2" : cloud ? "supabase" : "disk",
    async init() {
      if (remote) {
        (await remote.list()).forEach((o) => {
          idx[o.p] = { at: o.at, size: o.size };
        });
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
      // Accounts bill photos live one folder deeper: accounts/evidence
      try {
        fs.readdirSync(path.join(DATA, DIRS.accounts, "evidence")).forEach((n) => {
          try {
            const st = fs.statSync(path.join(DATA, DIRS.accounts, "evidence", n));
            if (st.isFile())
              idx["accounts/evidence/" + n] = { at: Math.floor(st.mtimeMs), size: st.size };
          } catch (e) {}
        });
      } catch (e) {}
    },
    has: (p) => !!idx[p],
    meta: (p) => idx[p] || null,
    count: () => Object.keys(idx).length,
    names: (prefix) => Object.keys(idx).filter((k) => k.indexOf(prefix) === 0),
    async get(p) {
      if (!idx[p]) {
        // The list of files is read once when the server starts. A file saved since then by another server or phone is not in
        // it yet, so ask the storage directly instead of answering "missing".
        if (!remote) return null;
        const found = await remote.get(p);
        if (!found) return null;
        idx[p] = { at: Date.now(), size: found.length };
        cacheAdd(p, found);
        return found;
      }
      if (!remote) {
        try {
          return await fs.promises.readFile(localPath(p));
        } catch (e) {
          return null;
        }
      }
      const c = cache.get(p);
      if (c) return c.buf;
      const buf = await remote.get(p);
      if (buf) cacheAdd(p, buf);
      return buf;
    },
    async put(p, buf, mime) {
      if (!remote) {
        await fs.promises.mkdir(path.dirname(localPath(p)), { recursive: true });
        await fs.promises.writeFile(localPath(p), buf);
      } else {
        await remote.put(p, buf, mime);
        cacheDrop(p);
      }
      idx[p] = { at: Date.now(), size: buf.length };
    },
    async del(p) {
      if (!remote) {
        try {
          await fs.promises.unlink(localPath(p));
        } catch (e) {}
      } else {
        await remote.del(p);
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

  return { cloud, kv, files, employeeSync, catalogSync, salesSync };
};