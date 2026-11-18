"use strict";
// Copies everything from the OLD Supabase project to the NEW setup, exactly as it is (nothing converted):
//   1. gm_kv rows              -> new Supabase gm_kv
//   2. gm_accounts_* tables    -> new Supabase, same table names, same ids
//   3. files in the old bucket -> Backblaze B2, same paths
// Safe to run again: rows/files that already exist are skipped. Any error stops the run and says what failed.
// Run:  node tools/copy-old-to-new.js            (copy)
//       node tools/copy-old-to-new.js --check    (only compare counts, change nothing)
//       --overwrite-kv                           (also replace saved records that already exist in the new database;
//                                                 normally NOT wanted once the app is live on the new database)
// Stop the old app (or put it in maintenance) before the final copy, so nothing changes while copying.

try {
  process.loadEnvFile();
} catch (_) {}

const PAGE = 1000;
const CHUNK = 200;

// Order matters: a table must come after the tables it points to.
// key = the column(s) that identify a row (used for paging, skipping duplicates, and counting).
const TABLES = [
  { name: "gm_accounts_invoices", key: "id" },
  { name: "gm_accounts_collections", key: "id" },
  { name: "gm_accounts_collection_allocations", key: "id" },
  { name: "gm_accounts_journal_entries", key: "entry_no", conflict: "id" },
  { name: "gm_accounts_journal_lines", key: "id" },
  // added by Accounts phases 9-12 (invoice edits, deletions, discounts/returns); skipped if the old database does not have them
  { name: "gm_accounts_invoice_edits", key: "id" },
  { name: "gm_accounts_invoice_deletions", key: "id" },
  { name: "gm_accounts_invoice_adjustments", key: "id" },
  { name: "gm_accounts_cash_movements", key: "id" },
  { name: "gm_accounts_cash_denominations", key: "movement_id,denomination", conflict: "movement_id,denomination" },
  { name: "gm_accounts_daily_closings", key: "closing_date" },
  { name: "gm_accounts_upi_settlements", key: "id" },
];

const log = (...a) => console.log(...a);
function must(error, what) {
  if (!error) return;
  const bits = [error.message, error.code && "code " + error.code, error.status && "HTTP " + error.status, error.details, error.hint].filter(Boolean);
  let hint = "";
  if (error.status === 401 || error.status === 403 || error.code === "PGRST301")
    hint = " -> The key looks wrong. Use the service_role key (Project Settings > API), not the anon key.";
  else if (error.status === 404 || error.code === "PGRST205" || error.code === "42P01")
    hint = " -> The table was not found. Check the URL points to the right project and the SQL files were run in it.";
  else if (!bits.length)
    hint = " -> No reason was sent back. Check the URL (it must look like https://xxxx.supabase.co) and the key.";
  throw new Error(what + ": " + (bits.join(" | ") || "unknown error") + hint);
}
const isMissingTable = (e) =>
  e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message || ""));

async function readAll(db, table, orderCols) {
  const rows = [];
  for (let off = 0; ; off += PAGE) {
    let q = db.from(table).select("*");
    for (const c of orderCols.split(",")) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(off, off + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows, error: null };
}

async function countRows(db, table) {
  // limit(1) instead of head: a failed HEAD request comes back with no message at all.
  const { count, error, status } = await db.from(table).select("*", { count: "exact" }).limit(1);
  if (error && status && !error.status) error.status = status;
  return { count, error };
}

async function copyTable(oldDb, newDb, t, checkOnly) {
  const { count: oldCount, error: oe } = await countRows(oldDb, t.name);
  if (oe) {
    if (isMissingTable(oe)) {
      log(`  ${t.name}: not in old database, skipped`);
      return { name: t.name, old: 0, now: 0, ok: true };
    }
    must(oe, `Counting ${t.name} in old database`);
  }
  if (!checkOnly && oldCount > 0) {
    const { rows, error } = await readAll(oldDb, t.name, t.key);
    must(error, `Reading ${t.name} from old database`);
    if (rows.length !== oldCount) throw new Error(`${t.name}: read ${rows.length} rows but old database says ${oldCount}`);
    for (let i = 0; i < rows.length; i += CHUNK) {
      // ignoreDuplicates = "if this row is already there, leave it" (accounts rows must never be changed after saving)
      const { error: ie } = await newDb
        .from(t.name)
        .upsert(rows.slice(i, i + CHUNK), { onConflict: t.conflict || t.key, ignoreDuplicates: true });
      must(ie, `Writing ${t.name} (rows ${i + 1}-${Math.min(i + CHUNK, rows.length)}) to new database`);
    }
  }
  const { count: newCount, error: ne } = await countRows(newDb, t.name);
  must(ne, `Counting ${t.name} in new database`);
  const ok = newCount === oldCount;
  log(`  ${t.name}: old ${oldCount}, new ${newCount} ${ok ? "OK" : "<-- MISMATCH"}`);
  return { name: t.name, old: oldCount, now: newCount, ok };
}

async function copyKv(oldDb, newDb, checkOnly, overwrite) {
  const { count: oldCount, error: oe } = await countRows(oldDb, "gm_kv");
  must(oe, "Counting gm_kv in old database");
  if (!checkOnly) {
    const { rows, error } = await readAll(oldDb, "gm_kv", "key");
    must(error, "Reading gm_kv from old database");
    if (rows.length !== oldCount) throw new Error(`gm_kv: read ${rows.length} rows but old database says ${oldCount}`);
    for (let i = 0; i < rows.length; i += 100) {
      // By default a key that already exists in the NEW database is left alone: once the app runs on the new database,
      // it holds newer data than the old one. Use --overwrite-kv only for a deliberate fresh copy.
      const { error: ie } = await newDb.from("gm_kv").upsert(rows.slice(i, i + 100), { onConflict: "key", ignoreDuplicates: !overwrite });
      must(ie, `Writing gm_kv (rows ${i + 1}-${Math.min(i + 100, rows.length)}) to new database`);
    }
  }
  const { count: newCount, error: ne } = await countRows(newDb, "gm_kv");
  must(ne, "Counting gm_kv in new database");
  const ok = newCount >= oldCount; // new may have more only if the new app already saved something
  log(`  gm_kv: old ${oldCount}, new ${newCount} ${ok ? "OK" : "<-- MISMATCH"}`);
  return { name: "gm_kv", old: oldCount, now: newCount, ok };
}

// Walk the old bucket folder by folder (Supabase lists one level at a time; folders have no id).
async function listOldFiles(oldDb, bucket) {
  const out = [];
  async function walk(prefix) {
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await oldDb.storage
        .from(bucket)
        .list(prefix, { limit: PAGE, offset: off, sortBy: { column: "name", order: "asc" } });
      must(error, `Listing old bucket folder "${prefix || "/"}"`);
      for (const o of data) {
        const p = prefix ? prefix + "/" + o.name : o.name;
        if (o.id) out.push({ path: p, size: (o.metadata && o.metadata.size) || 0 });
        else await walk(p);
      }
      if (data.length < PAGE) break;
    }
  }
  await walk("");
  return out;
}

async function copyFiles(oldDb, bucket, b2, checkOnly) {
  const files = await listOldFiles(oldDb, bucket);
  const have = new Map((await b2.list()).map((o) => [o.p, o.size]));
  const todo = files.filter((f) => have.get(f.path) !== f.size || !f.size);
  log(`  files: ${files.length} in old bucket, ${files.length - todo.length} already in B2, ${todo.length} to copy`);
  const failed = [];
  if (!checkOnly) {
    let done = 0;
    const queue = todo.slice();
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        try {
          const { data, error } = await oldDb.storage.from(bucket).download(f.path);
          must(error, "download");
          const buf = Buffer.from(await data.arrayBuffer());
          await b2.put(f.path, buf);
          done++;
          if (done % 25 === 0) log(`    copied ${done}/${todo.length}`);
        } catch (e) {
          failed.push({ path: f.path, why: e.message });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  const after = new Map((await b2.list()).map((o) => [o.p, o.size]));
  const missing = files.filter((f) => !after.has(f.path)).map((f) => f.path);
  const ok = !failed.length && !missing.length;
  log(`  files in B2 after: ${files.length - missing.length} of ${files.length} ${ok ? "OK" : "<-- INCOMPLETE"}`);
  failed.slice(0, 20).forEach((f) => log(`    FAILED ${f.path}: ${f.why}`));
  return { name: "files", old: files.length, now: files.length - missing.length, ok };
}

async function run({ oldDb, newDb, bucket, b2, checkOnly, overwriteKv }) {
  const results = [];
  log(checkOnly ? "Checking counts only (nothing is changed)...\n" : "Copying old data to the new setup...\n");
  log("1. gm_kv (all saved records, logins, sessions)");
  results.push(await copyKv(oldDb, newDb, checkOnly, !!overwriteKv));
  log("\n2. Accounts tables");
  for (const t of TABLES) results.push(await copyTable(oldDb, newDb, t, checkOnly));
  log("\n3. Files -> Backblaze B2");
  results.push(await copyFiles(oldDb, bucket, b2, checkOnly));
  const bad = results.filter((r) => !r.ok);
  log(bad.length ? `\nNOT FINISHED CLEANLY: ${bad.map((b) => b.name).join(", ")}` : "\nAll counts match. Copy complete.");
  return { results, ok: !bad.length };
}

function makeB2() {
  const need = ["B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET", "B2_ENDPOINT"];
  const miss = need.filter((k) => !(process.env[k] || "").trim());
  if (miss.length) throw new Error("Missing in .env: " + miss.join(", "));
  const storage = require("../storage")({ DATA: ".", URL: "", KEY: "" });
  return {
    async list() {
      await storage.files.init();
      return storage.files.names("").map((p) => ({ p, size: storage.files.meta(p).size }));
    },
    async put(p, buf) {
      await storage.files.put(p, buf, storage.files.mimeOf(p));
    },
  };
}

module.exports = { run, TABLES };

if (require.main === module) {
  const clean = (k) => (process.env[k] || "").trim();
  const need = ["OLD_SUPABASE_URL", "OLD_SUPABASE_SERVICE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
  const miss = need.filter((k) => !clean(k));
  if (miss.length) {
    console.error("Missing in .env: " + miss.join(", "));
    process.exit(1);
  }
  const { createClient } = require("@supabase/supabase-js");
  const opt = { auth: { autoRefreshToken: false, persistSession: false } };
  run({
    oldDb: createClient(clean("OLD_SUPABASE_URL"), clean("OLD_SUPABASE_SERVICE_KEY"), opt),
    newDb: createClient(clean("SUPABASE_URL"), clean("SUPABASE_SERVICE_KEY"), opt),
    bucket: clean("OLD_SUPABASE_BUCKET") || "gm-files",
    b2: makeB2(),
    checkOnly: process.argv.includes("--check"),
    overwriteKv: process.argv.includes("--overwrite-kv"),
  })
    .then((r) => process.exit(r.ok ? 0 : 2))
    .catch((e) => {
      console.error("\nStopped:", e.message);
      process.exit(1);
    });
}