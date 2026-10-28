const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  crypto = require("crypto"),
  util = require("util"),
  zlib = require("zlib");
const ROOT = __dirname,
  DATA = path.join(ROOT, "data"),
  DB = path.join(DATA, "db.json");
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_BODY = 5 * 1024 * 1024;

// Where data lives: this computer's data folder (default), or Supabase when these two settings exist (used on Render).
const storage = require("./storage")({
  DATA,
  URL: process.env.SUPABASE_URL,
  KEY: process.env.SUPABASE_SERVICE_KEY,
  BUCKET: process.env.SUPABASE_BUCKET,
});
const CLOUD = storage.cloud,
  Files = storage.files;
if (!CLOUD) fs.mkdirSync(path.join(DATA, "backups"), { recursive: true });
const VKINDS = [
  "photo",
  "rc",
  "insurance",
  "permit",
  "fitness",
  "other",
  "aadhaar",
  "license",
  "addrproof",
  "idother",
]; // vehicle kinds + worker document kinds (worker id is used as the key)
const VEXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const VMIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};
const VMAX = 5 * 1024 * 1024;
function pfind(p, i) {
  for (const e of ["jpg", "png", "webp"]) {
    const f = "p/" + p + "__" + i + "." + e;
    if (Files.has(f)) return { path: f, ext: e };
  }
  return null;
}
function vfind(v, k) {
  for (const e of Object.keys(VMIME)) {
    const f = "v/" + v + "__" + k + "." + e;
    if (Files.has(f)) return { path: f, ext: e };
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const activity = require("./activity");
let db = { rev: 0, items: {}, activity: {} };
function readLocalDb() {
  try {
    db = JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch (e) {
    if (fs.existsSync(DB)) {
      fs.copyFileSync(DB, DB + ".corrupt-" + Date.now());
      console.log("db.json was unreadable, copy kept. Starting empty.");
    }
  }
  if (!db.items) db.items = {};
  if (!db.rev) db.rev = 0;
  if (!db.activity) db.activity = {};
}
// Loads saved data at start-up (from the data folder, or from Supabase).
async function loadDb() {
  if (!CLOUD) return readLocalDb();
  const rows = await storage.kv.loadAll();
  rows.forEach((r) => {
    if (r.key === "_auth") {
      try {
        auth = JSON.parse(r.v);
        if (!auth.admins) auth.admins = {};
        if (!auth.workers) auth.workers = {};
      } catch (e) {}
    } else if (r.key.indexOf("_activity_") === 0) {
      try {
        db.activity[r.key.slice(10)] = JSON.parse(r.v) || [];
      } catch (e) {}
    } else if (r.key === "_sessions") {
      try {
        sessions = JSON.parse(r.v) || {};
      } catch (e) {}
    } else {
      db.items[r.key] = { v: r.v, rev: Number(r.rev) || 0 };
      db.rev = Math.max(db.rev, Number(r.rev) || 0);
    }
  });
}

let timer = null,
  flushing = false,
  lastBackup = "";
const dirty = new Set();
function persist() {
  clearTimeout(timer);
  timer = setTimeout(flush, 200);
}
function touch(key) {
  dirty.add(key);
}
function setItem(key, v) {
  db.items[key] = { v, rev: ++db.rev };
  touch(key);
  persist();
}
/* ---- Activity log: who changed what (kept per month, newest last; never sent to the browsers' storage) ---- */
const ACT_MAX = 3000;
function istMonth(t) {
  return new Date(t + 5.5 * 3600e3).toISOString().slice(0, 7).replace("-", "");
}
function actorOf(s) {
  try {
    if (!s) return { role: "system", name: "System" };
    if (s.role === "admin" || s.role === "sales") {
      const a = acctOf(s);
      return {
        role: s.role,
        id: s.id,
        name: (a && a.name) || (s.role === "sales" ? "Sales" : "Admin"),
      };
    }
    const w = (workerData().workers || []).filter((x) => x && x.id === s.id)[0];
    return { role: "worker", id: s.id, name: (w && w.name) || "Employee" };
  } catch (e) {
    return { role: s ? s.role : "system", name: "Unknown" };
  }
}
function logEvents(s, evs) {
  try {
    if (!evs || !evs.length) return;
    const a = actorOf(s),
      now = Date.now(),
      m = istMonth(now),
      list = db.activity[m] || (db.activity[m] = []);
    evs.forEach((e) => {
      if (
        e.dedupe &&
        list.slice(-30).some((x) => x.dedupe === e.dedupe && now - x.t < 120000)
      )
        return;
      const rec = {
        t: now,
        by: a.name,
        role: a.role,
        type: e.type,
        text: e.text,
      };
      if (a.id) rec.uid = a.id;
      if (e.dedupe) rec.dedupe = e.dedupe;
      list.push(rec);
    });
    if (list.length > ACT_MAX) list.splice(0, list.length - ACT_MAX);
    touch("_activity_" + m);
    persist();
  } catch (e) {
    console.error("Activity log skipped:", e && e.message);
  }
}
async function cloudBackup() {
  const day = new Date().toISOString().slice(0, 10);
  if (lastBackup === day) return;
  await Files.put(
    "backups/db-" + day + ".json",
    Buffer.from(JSON.stringify(db)),
    "application/json",
  );
  lastBackup = day;
  const old = Files.names("backups/").sort();
  while (old.length > 14) await Files.del(old.shift());
}
async function flush() {
  if (!CLOUD) {
    try {
      const tmp = DB + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB);
      const bk = path.join(
        DATA,
        "backups",
        "db-" + new Date().toISOString().slice(0, 10) + ".json",
      );
      if (!fs.existsSync(bk)) fs.copyFileSync(DB, bk);
    } catch (e) {
      console.error("Save failed:", e.message);
    }
    return;
  }
  if (flushing) {
    persist();
    return;
  }
  if (!dirty.size) return;
  flushing = true;
  const keys = Array.from(dirty);
  dirty.clear();
  try {
    await storage.kv.save(
      keys.map((k) =>
        k === "_auth"
          ? { key: k, v: JSON.stringify(auth), rev: 0 }
          : k === "_sessions"
            ? { key: k, v: JSON.stringify(sessions), rev: 0 }
            : k.indexOf("_activity_") === 0
              ? {
                  key: k,
                  v: JSON.stringify(db.activity[k.slice(10)] || []),
                  rev: 0,
                }
              : {
                  key: k,
                  v: db.items[k] ? db.items[k].v : null,
                  rev: db.items[k] ? db.items[k].rev : 0,
                },
      ),
    );
    try {
      await cloudBackup();
    } catch (e) {
      console.error("Daily backup failed:", e.message);
    }
  } catch (e) {
    console.error("Save to Supabase failed, will retry:", e.message);
    keys.forEach((k) => dirty.add(k));
    setTimeout(persist, 5000);
  } finally {
    flushing = false;
  }
}
async function flushNow() {
  clearTimeout(timer);
  for (let i = 0; flushing && i < 100; i++) await sleep(50);
  await flush();
}
process.on("SIGINT", () => {
  flushNow().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  flushNow().then(() => process.exit(0));
});

/* ================= SECURITY: accounts, sessions, permissions ================= */
// Passwords are kept only here, as scrypt hashes (data/auth.json). They are never stored in db.json or sent to a browser.
const AUTHF = path.join(DATA, "auth.json"),
  SESSF = path.join(DATA, "sessions.json");
const MAX_VALUE = 3 * 1024 * 1024,
  MAX_KEYS = 3000,
  MAX_FILES = 6000;
let auth = { admins: {}, workers: {} };
if (!CLOUD) {
  try {
    auth = JSON.parse(fs.readFileSync(AUTHF, "utf8"));
  } catch (e) {}
}
if (!auth.admins) auth.admins = {};
if (!auth.workers) auth.workers = {};
function saveAuth() {
  if (CLOUD) {
    touch("_auth");
    persist();
    return;
  }
  try {
    const t = AUTHF + ".tmp";
    fs.writeFileSync(t, JSON.stringify(auth), { mode: 0o600 });
    fs.renameSync(t, AUTHF);
  } catch (e) {
    console.error("Could not save auth.json:", e.message);
  }
}
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return (
    "s1$" +
    salt.toString("hex") +
    "$" +
    crypto.scryptSync(String(pw), salt, 32).toString("hex")
  );
}
const DUMMY = hashPw("not-a-real-password");
function checkPw(pw, stored) {
  const parts = String(stored || DUMMY).split("$");
  if (parts.length !== 3) return false;
  const want = Buffer.from(parts[2], "hex"),
    got = crypto.scryptSync(
      String(pw),
      Buffer.from(parts[1], "hex"),
      want.length,
    );
  return crypto.timingSafeEqual(want, got) && !!stored;
}
function tempPassword() {
  const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let o = "";
  const r = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) o += c[r[i] % c.length];
  return o;
}
function clientIp(req) {
  if (process.env.TRUST_PROXY === "1" || process.env.RENDER) {
    const x = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (x.length) return x[x.length - 1];
  }
  return req.socket.remoteAddress || "?";
}
function localDate() {
  const d = new Date(),
    p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function jparse(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
function stored(key) {
  const it = db.items[key];
  return it && it.v != null ? jparse(it.v) : null;
}

const DEFAULT_ADMIN = {
  id: "A1",
  phone: "8489600833",
  name: "Bala",
  role: "Super Admin",
};
function adminList() {
  let a = stored("gm_admin_account_v1");
  if (Array.isArray(a) && a.length && a[0].phone) return a;
  const w = stored("gm_admin_workers_v1");
  if (w && Array.isArray(w.admins) && w.admins.length && w.admins[0].phone)
    return w.admins;
  return [DEFAULT_ADMIN];
}
function workerData() {
  const w = stored("gm_admin_workers_v1");
  return w && typeof w === "object" ? w : { workers: [], leaves: [] };
}

// Moves any plain-text passwords found in a saved value into auth.json and removes them from the value.
// Returns the cleaned JSON string. A password field left empty means "keep the existing password".
function cleanValue(key, raw) {
  if (typeof raw !== "string") return raw;
  if (key === "gm_admin_account_v1") {
    const L = jparse(raw);
    if (!Array.isArray(L)) return raw;
    L.forEach((a) => {
      if (!a || typeof a !== "object") return;
      if (a.id && a.password) {
        auth.admins[a.id] = { h: hashPw(a.password), must: false };
        saveAuth();
      }
      delete a.password;
      delete a.pin;
    });
    return JSON.stringify(L);
  }
  if (key === "gm_admin_workers_v1") {
    const d = jparse(raw);
    if (!d || typeof d !== "object") return raw;
    if (Array.isArray(d.admins)) {
      d.admins.forEach((a) => {
        if (a && a.id && a.password && !auth.admins[a.id]) {
          auth.admins[a.id] = { h: hashPw(a.password), must: false };
          saveAuth();
        }
      });
      delete d.admins;
    }
    if (Array.isArray(d.workers))
      d.workers.forEach((w) => {
        if (!w || typeof w !== "object") return;
        const pw = w.password || w.pin;
        if (w.id && pw) {
          auth.workers[w.id] = { h: hashPw(pw) };
          saveAuth();
        }
        delete w.password;
        delete w.pin;
      });
    return JSON.stringify(d);
  }
  if (key === "gm_crm_data_v5" || key.indexOf("gm_crm_data_v5__") === 0) {
    const d = jparse(raw);
    if (!d || typeof d !== "object") return raw;
    if (d.worker && typeof d.worker === "object") {
      delete d.worker.password;
      delete d.worker.pin;
    }
    return JSON.stringify(d);
  }
  return raw;
}

// One-time move: any old Users & Accounts login that is not a Super Admin or Admin (Sales, Billing, Inventory, Delivery, Helper)
// becomes an employee with the same mobile number and password, and keeps its ticked options as access.
function moveStaffToEmployees() {
  const list = adminList(),
    move = list.filter((a) => a && STAFF_ROLES.indexOf(a.role || "Admin") < 0);
  if (!move.length) return;
  const wd = Object.assign({ workers: [], leaves: [] }, workerData()),
    prof = Object.assign({}, stored("gm_admin_wprofile_v1") || {}),
    acc = Object.assign({}, accessData()),
    label = {
      Sales: "Sales",
      Billing: "Billing",
      Inventory: "Inventory",
      Delivery: "Delivery / Driver",
      Helper: "Helper",
    };
  wd.workers = (wd.workers || []).slice();
  move.forEach((a) => {
    if (wd.workers.some((w) => w && w.phone === a.phone)) return; // already an employee: leave this login alone
    const n =
        wd.workers.reduce(
          (m, x) => Math.max(m, parseInt(String(x.id).slice(1), 10) || 0),
          0,
        ) + 1,
      id = "W" + String(n).padStart(3, "0");
    wd.workers.push({
      id,
      name: a.name,
      phone: a.phone,
      emergency: "",
      active: a.status !== "inactive",
      created: localDate(),
    });
    prof[id] = {
      role: label[a.role] || "Delivery / Driver",
      joinDate: localDate(),
    };
    if (auth.admins[a.id] && auth.admins[a.id].h)
      auth.workers[id] = { h: auth.admins[a.id].h };
    const mods = (a.perms || []).filter(
      (m) => MODULES.indexOf(m) > -1 && m !== EMP_ROLE_MODULE[a.role],
    );
    if (mods.length && (a.role === "Billing" || a.role === "Inventory"))
      acc[id] = mods;
    delete auth.admins[a.id];
    dropSessionsOf(a.id);
    logEvents({ role: "system" }, [
      {
        type: "employee",
        text:
          "Login of " +
          a.name +
          " (" +
          a.role +
          ") moved to the Employees page",
      },
    ]);
    a._moved = true;
  });
  const moved = move.filter((a) => a._moved).map((a) => a.id);
  if (!moved.length) return;
  setItem("gm_admin_workers_v1", JSON.stringify(wd));
  setItem("gm_admin_wprofile_v1", JSON.stringify(prof));
  setItem("gm_admin_access_v1", JSON.stringify(acc));
  setItem(
    "gm_admin_account_v1",
    JSON.stringify(
      list
        .filter((a) => moved.indexOf(a.id) < 0)
        .map((a) => {
          const c = Object.assign({}, a);
          delete c._moved;
          return c;
        }),
    ),
  );
  saveAuth();
  persist();
  console.log(
    "  Moved " + moved.length + " staff login(s) to the Employees page.",
  );
}

// First start / upgrade: hash existing passwords, replace the default admin password with a one-time password, scrub db.json.
function migrateAuth() {
  let changed = false,
    notice = [];
  const list = adminList();
  const workers = stored("gm_admin_workers_v1");
  const old = workers && Array.isArray(workers.admins) ? workers.admins : [];
  list.forEach((a) => {
    if (!a || !a.id) return;
    if (!auth.admins[a.id]) {
      const o = old.filter((x) => x && x.id === a.id)[0] || {};
      const pw = a.password || o.password;
      if (!pw || pw === "admin123") {
        const t = tempPassword();
        auth.admins[a.id] = { h: hashPw(t), must: true };
        notice.push("  Admin " + a.phone + "  temporary password:  " + t);
      } else auth.admins[a.id] = { h: hashPw(pw), must: false };
      changed = true;
    }
  });
  if (changed) saveAuth();
  ["gm_admin_account_v1", "gm_admin_workers_v1"].forEach((k) => {
    if (k === "gm_admin_account_v1" && !(db.items[k] && db.items[k].v)) {
      setItem(
        k,
        JSON.stringify(
          list.map((a) => ({
            id: a.id,
            phone: a.phone,
            name: a.name,
            role: a.role || "Admin",
          })),
        ),
      );
      return;
    }
    if (db.items[k] && typeof db.items[k].v === "string") {
      const c = cleanValue(k, db.items[k].v);
      if (c !== db.items[k].v) setItem(k, c);
    }
  });
  Object.keys(db.items).forEach((k) => {
    if (
      (k === "gm_crm_data_v5" || k.indexOf("gm_crm_data_v5__") === 0) &&
      db.items[k] &&
      typeof db.items[k].v === "string"
    ) {
      const c = cleanValue(k, db.items[k].v);
      if (c !== db.items[k].v) setItem(k, c);
    }
  });
  upgradeAccounts();
  persist();
  return notice;
}
function resetAdmin() {
  const list = adminList(),
    a = list[0],
    t = tempPassword();
  auth.admins[a.id] = { h: hashPw(t), must: true };
  saveAuth();
  Object.keys(sessions).forEach((h) => {
    if (sessions[h].role === "admin") delete sessions[h];
  });
  saveSessions();
  console.log(
    "\n  Admin " +
      a.phone +
      " new temporary password:  " +
      t +
      "\n  You must choose your own password when you sign in.\n",
  );
}

// ---- roles and permissions ----
// Super Admin: everything, plus managing users. Admin: every CRM page, but not user management.
// Sales / Billing / Inventory / Delivery / Helper: only the pages of the modules ticked for that user (see PAGE_RULES).
const MODULES = ["sales", "billing", "inventory", "delivery", "helper"];
const ROLES = [
  "Super Admin",
  "Admin",
  "Sales",
  "Billing",
  "Inventory",
  "Delivery",
  "Helper",
];
const ROLE_MODULE = {
  Sales: "sales",
  Billing: "billing",
  Inventory: "inventory",
  Delivery: "delivery",
  Helper: "helper",
};
// ---- employees who sign in ----
// Everyone except the Super Admin and Admin accounts is an EMPLOYEE (Employees page). The employee's role decides which panel opens:
// Delivery / Helper / Loading -> delivery app, Sales -> Sales panel, Billing / Inventory / Admin -> admin side (limited by access).
// The Users & Accounts page keeps only the Super Admin and Admin accounts.
const STAFF_ROLES = ["Super Admin", "Admin"];
const EMP_ROLE_MODULE = { Billing: "billing", Inventory: "inventory" };
function empRoleOf(id) {
  const p = stored("gm_admin_wprofile_v1"),
    r = String((p && p[id] && p[id].role) || "").toLowerCase();
  return (
    {
      sales: "Sales",
      billing: "Billing",
      inventory: "Inventory",
      admin: "Admin",
      helper: "Helper",
      loading: "Loading",
    }[r] || "Delivery"
  );
}
function empPanel(role) {
  return role === "Sales"
    ? "sales"
    : role === "Admin" || role === "Billing" || role === "Inventory"
      ? "admin"
      : "worker";
}
function accessData() {
  const a = stored("gm_admin_access_v1");
  return a && typeof a === "object" && !Array.isArray(a) ? a : {};
}
// The account an admin-side or Sales employee signs in as (null for delivery-app staff or an unknown id).
function empAccount(id) {
  const w = (workerData().workers || []).filter((x) => x && x.id === id)[0];
  if (!w) return null;
  const role = empRoleOf(id);
  if (empPanel(role) === "worker") return null;
  const extra = accessData()[id];
  return {
    id: w.id,
    name: w.name,
    phone: w.phone,
    email: "",
    role,
    perms:
      role === "Admin"
        ? []
        : MODULES.filter(
            (m) =>
              m === EMP_ROLE_MODULE[role] ||
              (role !== "Sales" &&
                Array.isArray(extra) &&
                extra.indexOf(m) > -1),
          ),
    status: w.active === false ? "inactive" : "active",
    emp: true,
  };
}
function acctOf(s) {
  if (!s || (s.role !== "admin" && s.role !== "sales")) return null;
  return s.emp
    ? empAccount(s.id)
    : adminList().filter((x) => x && x.id === s.id)[0] || null;
}
function isSuper(a) {
  return !!a && a.role === "Super Admin";
}
function isFull(a) {
  return (
    !!a &&
    (a.role === "Super Admin" || a.role === "Admin" || !ROLE_MODULE[a.role])
  );
} // an old account with no known role keeps full access
function modsOf(a) {
  return isFull(a)
    ? MODULES.slice()
    : Array.isArray(a && a.perms)
      ? a.perms.filter((m) => MODULES.indexOf(m) > -1)
      : [];
}
function hasAny(a, list) {
  if (isFull(a)) return true;
  const m = modsOf(a);
  return list.some((x) => m.indexOf(x) > -1);
}
// Which admin page needs what: '*' any signed-in user, 'full' Admin or Super Admin, 'super' Super Admin only, or a list of modules (any one is enough).
const PAGE_RULES = {
  "index.html": "*",
  "profile.html": "*",
  "notifications.html": "*",
  "summary.html": ["sales", "billing", "delivery"],
  "customers.html": ["sales", "billing"],
  "routes.html": ["sales", "delivery"],
  "plan.html": ["delivery"],
  "vehicles.html": ["delivery"],
  "vehicle.html": ["delivery"],
  "vehicle-edit.html": ["delivery"],
  "vehicle-fuel.html": ["delivery"],
  "vehicle-maintenance.html": ["delivery"],
  "live.html": ["delivery"],
  "problems.html": ["delivery", "helper"],
  "attendance.html": ["helper"],
  "advances.html": ["billing"],
  "products.html": ["inventory", "billing", "sales"],
  "sales.html": ["sales", "billing"],
  "orders.html": ["sales", "billing"],
  "product-edit.html": ["inventory"],
  "workers.html": "full",
  "activity.html": "full",
  "admin.html": "full",
  "super.html": "super",
  "users.html": "super",
  "user-edit.html": "super",
};
function pageAllowed(a, file) {
  if (!a) return false;
  const r = PAGE_RULES[file] || "full";
  if (r === "*") return true;
  if (r === "super") return isSuper(a);
  if (r === "full") return isFull(a);
  return hasAny(a, r);
}
// Saved records only some roles may change. (Reading stays open: the pages need data from several modules.)
const KEY_RULES = {
  gm_admin_products_v1: ["inventory"],
  gm_admin_vehicles_v1: ["delivery"],
  gm_admin_vfuel_v1: ["delivery"],
  gm_admin_vehsync_v1: ["delivery"],
  gm_admin_ledger_v1: ["billing"],
  gm_admin_workers_v1: "full",
  gm_admin_wprofile_v1: "full",
};
function adminMayWrite(s, key) {
  const a = acctOf(s);
  if (!a) return false;
  const r = KEY_RULES[key];
  if (!r) return true;
  return r === "full" ? isFull(a) : hasAny(a, r);
}
function adminMayManagePlans(s) {
  return hasAny(acctOf(s), ["delivery"]);
}
function customerPlanHistory(plans) {
  const out = {},
    today = localDate();
  if (!plans || typeof plans !== "object" || Array.isArray(plans)) return out;
  Object.keys(plans).forEach((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return;
    const source = plans[date],
      list = Array.isArray(source) ? source : source ? [source] : [],
      history = list
        .filter((p) => p && typeof p === "object" && p.status !== "cancelled")
        .map((p) => ({
          stops: (Array.isArray(p.stops) ? p.stops : [])
            .filter((stop) => stop && typeof stop.code === "string")
            .map((stop) => ({ code: stop.code })),
        }))
        .filter((p) => p.stops.length);
    if (history.length) out[date] = Array.isArray(source) ? history : history[0];
  });
  return out;
}
function isCustomerPlanHistory(candidate, currentPlans) {
  const visible = customerPlanHistory(currentPlans);
  return (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    Object.keys(candidate).every(
      (date) =>
        Object.prototype.hasOwnProperty.call(visible, date) &&
        util.isDeepStrictEqual(candidate[date], visible[date]),
    )
  );
}
function cleanPhone(v) {
  return String(v || "")
    .replace(/\D/g, "")
    .slice(-10);
}
function phoneTaken(phone, exceptId) {
  return (
    adminList().some((a) => a && a.id !== exceptId && a.phone === phone) ||
    (workerData().workers || []).some((w) => w && w.phone === phone)
  );
}
function publicUser(a) {
  const au = auth.admins[a.id] || {},
    st =
      a.status === "inactive"
        ? "inactive"
        : au.must && !au.last
          ? "pending"
          : "active";
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    email: a.email || "",
    role: a.role || "Admin",
    perms: isFull(a) ? [] : modsOf(a),
    status: st,
    last: au.last || 0,
    created: a.created || 0,
    must: !!au.must,
  };
}
// Older accounts get the new fields; the very first account becomes the Super Admin.
function upgradeAccounts() {
  const list = adminList().map((a) => Object.assign({}, a));
  let ch = false;
  list.forEach((a, i) => {
    if (i === 0 && a.role !== "Super Admin") {
      a.role = "Super Admin";
      ch = true;
    }
    if (!a.role) {
      a.role = "Admin";
      ch = true;
    }
    if (!a.status) {
      a.status = "active";
      ch = true;
    }
    if (!Array.isArray(a.perms)) {
      a.perms = [];
      ch = true;
    }
    if (a.email == null) {
      a.email = "";
      ch = true;
    }
  });
  if (
    ch ||
    !(db.items["gm_admin_account_v1"] && db.items["gm_admin_account_v1"].v)
  ) {
    setItem("gm_admin_account_v1", JSON.stringify(list));
    persist();
  }
}
// A saved copy of the account list that came from a browser. Only the signed-in person's own name and mobile number can change this way;
// roles, permissions, status and new or removed users change only through /api/users (Super Admin only).
function sanitizeAccounts(s, newRaw) {
  const inc = jparse(newRaw);
  if (!Array.isArray(inc)) return null;
  return JSON.stringify(
    adminList().map((a) => {
      const n = inc.filter((x) => x && x.id === a.id)[0];
      if (!n || a.id !== s.id) return a;
      const out = Object.assign({}, a),
        nm = String(n.name || "")
          .trim()
          .slice(0, 60),
        ph = cleanPhone(n.phone);
      if (nm.length >= 2) out.name = nm;
      if (/^[6-9]\d{9}$/.test(ph) && !phoneTaken(ph, a.id)) out.phone = ph;
      return out;
    }),
  );
}
function dropSessionsOf(id) {
  Object.keys(sessions).forEach((h) => {
    if (
      (sessions[h].role === "admin" || sessions[h].role === "sales") &&
      sessions[h].id === id
    )
      delete sessions[h];
  });
  saveSessions();
}
function pageGate(req, file) {
  // null = allowed
  const s = getSession(req);
  if (!s || s.role !== "admin") return { redirect: "/login.html" };
  const a = acctOf(s);
  if (!a || a.status === "inactive") return { redirect: "/login.html" };
  if (pageAllowed(a, file)) return null;
  return { denied: true };
}
const DENIED_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No access - General Traders</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,system-ui,sans-serif;background:#0F1418;color:#F1F5F9}.b{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#94A3B8;margin:0 0 20px;line-height:1.5}a{display:inline-block;background:#2DD4BF;color:#06201D;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:10px}</style></head><body><div class="b"><h1>You do not have access to this page</h1><p>Your account is not set up for this part of the system. Ask the Super Admin to change your role or permissions.</p><a href="/admin/index.html">Go to Home</a></div></body></html>';

// ---- sessions (cookie "gm_sid", HttpOnly; only a hash of the token is stored) ----
let sessions = {};
if (!CLOUD) {
  try {
    sessions = JSON.parse(fs.readFileSync(SESSF, "utf8"));
  } catch (e) {}
}
let sessTimer = null;
function saveSessions() {
  if (CLOUD) {
    touch("_sessions");
    persist();
    return;
  }
  clearTimeout(sessTimer);
  sessTimer = setTimeout(() => {
    try {
      const t = SESSF + ".tmp";
      fs.writeFileSync(t, JSON.stringify(sessions), { mode: 0o600 });
      fs.renameSync(t, SESSF);
    } catch (e) {}
  }, 500);
}
// An admin is signed out after 30 minutes with no activity. "Remember me" no longer lengthens an admin sign-in.
// Background polling (GET requests) does not count as activity for an admin; only saving something or the page's own /api/keepalive does.
// Sales people work in the field on their phones, so (like the delivery crew) they stay signed in for 30 days.
const TTL = { admin: 30 * 60e3, worker: 30 * 86400e3, sales: 30 * 86400e3 };
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
function cookieToken(req) {
  const m = /(?:^|;\s*)gm_sid=([A-Za-z0-9_-]{20,80})/.exec(
    req.headers.cookie || "",
  );
  return m ? m[1] : null;
}
function getSession(req) {
  const t = cookieToken(req);
  if (!t) return null;
  const h = sha(t),
    s = sessions[h];
  if (!s) return null;
  const now = Date.now();
  if (s.exp < now) {
    delete sessions[h];
    saveSessions();
    return null;
  }
  if (s.role === "admin" || s.role === "sales") {
    const ac = acctOf(s);
    // The person must still exist, be active, and still have the role that panel is for (so a role change takes effect at once).
    if (
      !ac ||
      ac.status === "inactive" ||
      (s.role === "sales") !== (ac.role === "Sales") ||
      (s.emp && empPanel(ac.role) !== s.role)
    ) {
      delete sessions[h];
      saveSessions();
      return null;
    }
  }
  const ttl = TTL[s.role],
    gap = s.role === "admin" ? 60e3 : 10 * 60e3; // admin sessions use the current limit even if they were created under the old 12 h / 30 day rule
  if (s.exp > now + ttl) s.exp = now + ttl;
  const active =
    s.role !== "admin" ||
    (req.method !== "GET" && req.method !== "HEAD") ||
    /^\/api\/keepalive/.test(req.url || "");
  if (active && s.exp - now < ttl - gap) {
    s.exp = now + ttl;
    saveSessions();
  }
  return Object.assign({ hash: h }, s);
}
function isHttps(req) {
  return (
    !!(req.socket && req.socket.encrypted) ||
    String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim() === "https"
  );
}
function setCookie(res, req, token, maxAgeSec) {
  res.setHeader(
    "Set-Cookie",
    "gm_sid=" +
      token +
      "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
      maxAgeSec +
      (isHttps(req) ? "; Secure" : ""),
  );
}
function startSession(res, req, role, id, remember, emp) {
  const ttl = TTL[role];
  const token = crypto.randomBytes(32).toString("base64url");
  Object.keys(sessions).forEach((h) => {
    if (sessions[h].exp < Date.now()) delete sessions[h];
  });
  sessions[sha(token)] = { role, id, exp: Date.now() + ttl, ttl };
  if (emp) sessions[sha(token)].emp = true; // signed in as an employee (not as a Users & Accounts account)
  saveSessions();
  setCookie(res, req, token, Math.floor(ttl / 1000));
}

// ---- limit password guessing ----
const fails = {};
function lockLeft(k) {
  const f = fails[k];
  return f && f.until > Date.now()
    ? Math.ceil((f.until - Date.now()) / 60000)
    : 0;
}
function noteFail(k, max) {
  let f = fails[k];
  if (!f || (f.until && f.until <= Date.now()))
    f = fails[k] = { n: 0, until: 0 };
  f.t = Date.now();
  if (++f.n >= max) {
    f.until = Date.now() + 15 * 60e3;
    f.n = 0;
  }
}
setInterval(() => {
  const n = Date.now();
  Object.keys(fails).forEach((k) => {
    if ((fails[k].until || 0) < n && n - (fails[k].t || 0) > 15 * 60e3)
      delete fails[k];
  });
}, 600e3).unref();

// ---- who may read / write which saved value ----
function CREWDAY() {
  return new Date(Date.now() + 5.5 * 3600e3)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
}
const W_READ = new Set([
  "gm_admin_v1",
  "gm_admin_workers_v1",
  "gm_admin_wprofile_v1",
  "gm_depot_v1",
  "gm_pintasks_v1",
  "gm_admin_products_v1",
  "gm_admin_ledger_v1",
  "gm_admin_attedit_v1",
  "gm_admin_settings_v1",
]);
// Crew marks (delivery results shared between the driver and helpers of one route) and location pings.
const CREW_RE = /^gm_crew_\d{8}_[A-Za-z0-9_-]{1,40}$/;
// Who may READ which saved record on the admin side. Full access (Super Admin, Admin) reads everything. Everyone else only
// the records their modules need; a record not listed here (small screen preferences and the like) is open to any signed-in admin user.
const ADMIN_READ = [
  [/^gm_admin_v1$/, ["sales", "billing", "delivery", "helper"]],
  [/^gm_admin_workers_v1$/, ["sales", "billing", "delivery", "helper"]],
  [/^gm_admin_wprofile_v1$/, ["billing", "delivery", "helper"]],
  [/^gm_admin_ledger_v1$/, ["billing", "helper"]],
  [/^gm_admin_attedit_v1$/, ["helper"]],
  [/^gm_admin_(vehicles|vfuel|vehsync)_v1$/, ["delivery"]],
  [/^gm_(pintasks_v1|depot_v1|pins_v1.*)$/, ["sales", "delivery"]],
  [/^gm_crm_data_v5(__.*)?$/, ["sales", "billing", "delivery", "helper"]],
  [/^gm_(loc|locreq|crew)_.*$/, ["delivery", "helper"]],
  [/^gm_admin_access_v1$/, []],
  [/^gm_sales_(orders|days|watch)_v1$/, ["sales", "billing"]],
];
function adminMayRead(s, key) {
  const a = acctOf(s);
  if (!a) return false;
  if (isFull(a)) return true;
  for (const r of ADMIN_READ) if (r[0].test(key)) return hasAny(a, r[1]);
  return true;
}
function canRead(s, key) {
  if (s.role === "sales")
    return key === "gm_admin_products_v1" || key === "gm_admin_v1"; // Sales sees the price list, plus shop names and routes (trimmed in viewFor); never plans, costs or other records
  if (s.role === "admin") return adminMayRead(s, key); // (the account list and product list are trimmed per person in viewFor)
  return (
    W_READ.has(key) ||
    CREW_RE.test(key) ||
    key === "gm_locreq_" + s.id ||
    key === "gm_pins_v1" ||
    key.indexOf("gm_pins_v1_") === 0 ||
    key === "gm_crm_data_v5__" + s.id ||
    key === "gm_wself_" + s.id
  );
}
function canWrite(s, key) {
  if (key === "gm_admin_access_v1") return false; // changed only through /api/access (Super Admin)
  if (/^gm_sales_(orders|days|watch)_v1$/.test(key)) return false; // written only by the Sales API on the server
  if (s.role === "sales") return false; // Sales cannot save any shared record (yet)
  if (s.role === "admin") return adminMayWrite(s, key);
  return (
    key === "gm_crm_data_v5__" + s.id ||
    key === "gm_crew_" + CREWDAY() + "_" + s.id ||
    key === "gm_loc_" + s.id ||
    key === "gm_pins_v1_" + s.id ||
    key === "gm_wself_" + s.id ||
    key === "gm_admin_notifs_v1"
  );
}
// What a signed-in employee is allowed to see inside a value: only their own plan, own profile, own pin tasks.
function viewFor(s, key, raw) {
  if (s.role === "sales" && key === "gm_admin_v1" && raw != null) {
    // Shops (name, place, phone, pin, GST) and route shop lists only. No delivery plans, invoices or anything else.
    const d = jparse(raw) || {};
    return JSON.stringify({
      customers: (Array.isArray(d.customers) ? d.customers : [])
        .filter((c) => c && c.code && c.active !== false)
        .map((c) => ({
          code: c.code,
          name: c.name,
          address: c.address,
          phone: c.phone,
          area: c.area,
          lat: c.lat,
          lng: c.lng,
          gstin: c.gstin,
        })),
      routes: (Array.isArray(d.routes) ? d.routes : [])
        .filter((r) => r && r.id)
        .map((r) => ({ id: r.id, name: r.name, codes: r.codes })),
    });
  }
  if (
    s.role === "admin" &&
    key === "gm_admin_v1" &&
    raw != null &&
    !adminMayManagePlans(s)
  ) {
    const d = jparse(raw);
    if (!d || typeof d !== "object" || Array.isArray(d)) return raw;
    return JSON.stringify(
      {
        customers: Array.isArray(d.customers) ? d.customers : [],
        routes: Array.isArray(d.routes) ? d.routes : [],
        plans: customerPlanHistory(d.plans),
      },
    );
  }
  if (s.role === "admin" && key === "gm_admin_account_v1" && raw != null) {
    // only the Super Admin sees everybody; others see just their own record
    const me = acctOf(s);
    if (isSuper(me)) return raw;
    const L = jparse(raw);
    return JSON.stringify(
      (Array.isArray(L) ? L : [])
        .filter((a) => a && a.id === s.id)
        .map((a) => ({ id: a.id, name: a.name, phone: a.phone, role: a.role })),
    );
  }
  if (key === "gm_admin_products_v1" && raw != null) {
    // Price list only (no cost, stock, opening value or batch details) for Sales and for admin-side people without Billing or Inventory.
    const ac = s.role === "admin" ? acctOf(s) : null;
    if (
      s.role === "sales" ||
      (ac && !isFull(ac) && !hasAny(ac, ["billing", "inventory"]))
    ) {
      const L = jparse(raw);
      return JSON.stringify(
        (Array.isArray(L) ? L : [])
          .filter((p) => p && typeof p === "object" && p.active !== false)
          .map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            alias: p.alias,
            category: p.category,
            unit: p.unit,
            price: p.price,
            mrp: p.mrp,
            tax: p.tax,
            stock: stockOf(p), // available quantity (null = stock not tracked for this product)
            active: true,
          })),
      );
    }
  }
  if (s.role === "admin" || raw == null) return raw;
  const d = jparse(raw);
  if (!d || typeof d !== "object") return raw;
  if (key === "gm_admin_v1") {
    const out = {};
    Object.keys(d).forEach((k) => {
      if (k !== "plans") out[k] = d[k];
    });
    out.plans = {};
    Object.keys(d.plans || {}).forEach((dt) => {
      const raw2 = d.plans[dt],
        arr = Array.isArray(raw2) ? raw2 : raw2 ? [raw2] : [];
      const mine = arr.filter(
        (p) =>
          p &&
          typeof p === "object" &&
          (p.workerId === s.id ||
            (Array.isArray(p.helpers) && p.helpers.indexOf(s.id) > -1) ||
            (p.history || []).some(
              (h) =>
                h && Array.isArray(h.notify) && h.notify.indexOf(s.id) > -1,
            )),
      );
      if (mine.length) out.plans[dt] = Array.isArray(raw2) ? mine : mine[0];
    });
    return JSON.stringify(out);
  }
  if (key === "gm_admin_workers_v1")
    return JSON.stringify({
      workers: (d.workers || [])
        .filter((w) => w && w.id === s.id)
        .map((w) => ({
          id: w.id,
          name: w.name,
          phone: w.phone,
          emergency: w.emergency,
          active: w.active,
          created: w.created,
        })),
      leaves: (d.leaves || []).filter((l) => l && l.workerId === s.id),
    });
  // Employees need the product list to record returns, but only name, code and selling price (no cost, stock or pictures).
  if (key === "gm_admin_products_v1")
    return JSON.stringify(
      (Array.isArray(d) ? d : [])
        .filter((p) => p && typeof p === "object" && p.active !== false)
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          price: p.price,
          tax: p.tax,
          unit: p.unit,
          active: true,
        })),
    );
  // Advances/cuts and attendance corrections: an employee gets only their own lines.
  if (key === "gm_admin_ledger_v1")
    return JSON.stringify(
      (Array.isArray(d) ? d : []).filter((e) => e && e.workerId === s.id),
    );
  if (key === "gm_admin_attedit_v1") {
    const me = (d.edits && d.edits[s.id]) || {};
    return JSON.stringify({ edits: { [s.id]: me }, log: [] });
  }
  if (key === "gm_admin_wprofile_v1") {
    const o = {};
    if (d[s.id]) o[s.id] = d[s.id];
    return JSON.stringify(o);
  }
  if (key === "gm_pintasks_v1") {
    const o = Object.assign({}, d, { tasks: {} });
    Object.keys(d.tasks || {}).forEach((c) => {
      {
        const t = d.tasks[c];
        if (!t) return;
        const to = t.to == null || t.to === "" ? ["all"] : [].concat(t.to);
        if (to.indexOf("all") > -1 || to.indexOf(s.id) > -1) o.tasks[c] = t;
      }
    });
    return JSON.stringify(o);
  }
  return raw;
}
// Employees can only ADD notifications for the admin; they cannot change or delete the admin's list.
function validLoc(l) {
  return l &&
    Math.abs(l.lat) <= 90 &&
    Math.abs(l.lng) <= 180 &&
    Number.isFinite(l.lat) &&
    Number.isFinite(l.lng)
    ? {
        lat: +l.lat,
        lng: +l.lng,
        acc: Math.min(99999, Math.max(0, Math.round(+l.acc || 0))),
      }
    : undefined;
}
function mergeNotifs(oldRaw, newRaw, s) {
  const old = jparse(oldRaw),
    inc = jparse(newRaw);
  if (!Array.isArray(inc)) return null;
  const base = Array.isArray(old) ? old : [],
    have = new Set(base.map((n) => n && n.id));
  const add = inc
    .filter(
      (n) =>
        n &&
        typeof n === "object" &&
        typeof n.id === "string" &&
        !have.has(n.id),
    )
    .slice(0, 10)
    .map((n) => ({
      id: String(n.id).slice(0, 60),
      ts: Number(n.ts) || Date.now(),
      date: String(n.date || "").slice(0, 10),
      type: String(n.type || "").slice(0, 30),
      title: String(n.title || "").slice(0, 200),
      text: String(n.text || "").slice(0, 600),
      worker: String(n.worker || "").slice(0, 80),
      wid: s && s.role === "worker" && s.id ? String(s.id).slice(0, 60) : undefined,
      read: false,
      loc: validLoc(n.loc),
    }));
  return JSON.stringify(add.concat(base).slice(0, 300));
}

/* ---- Attendance safety net ----
   Punch-in / punch-out is saved twice: as a notification (small, always arrives) and inside the employee's own record
   (attendanceLog, saved from the phone). If the phone's copy is ever lost or overwritten, the Attendance page showed
   "Absent" for a day the office was told about. These two functions make sure a punch the office was notified of is
   always in the attendance record, and that an older copy from a phone can never remove entries already saved. */
function clockMins(t) {
  const m = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(t || ""));
  if (!m) return null;
  let h = +m[1];
  if (m[3]) {
    h = h % 12;
    if (/p/i.test(m[3])) h += 12;
  }
  return h * 60 + +m[2];
}
function reconcileAttendance(onlyId) {
  const notifs = stored("gm_admin_notifs_v1");
  if (!Array.isArray(notifs)) return 0;
  const byName = {};
  (workerData().workers || []).forEach((w) => {
    if (!w || !w.id) return;
    const k = String(w.name || "").trim().toLowerCase();
    (byName[k] = byName[k] || []).push(w.id);
  });
  const set = stored("gm_admin_settings_v1") || {},
    lateAfter = clockMins(
      /^\d{1,2}:\d{2}$/.test(set.lateAfter || "") ? set.lateAfter : "08:30",
    ),
    WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    recs = {},
    touched = new Set();
  const list = notifs
    .filter(
      (n) =>
        n &&
        (n.type === "punchin" || n.type === "punchout") &&
        /^\d{4}-\d{2}-\d{2}$/.test(n.date || ""),
    )
    .sort((a, b) => (a.ts || 0) - (b.ts || 0)); // oldest first, so a punch-in is handled before its punch-out
  for (const n of list) {
    let id = n.wid;
    if (!id) {
      const c = byName[String(n.worker || "").trim().toLowerCase()];
      if (c && c.length === 1) id = c[0]; // older notifications carry only a name: use it only when it is unique
    }
    if (!id || (onlyId && id !== onlyId)) continue;
    if (!recs[id]) {
      const r = stored("gm_crm_data_v5__" + id);
      if (!r || typeof r !== "object") continue;
      recs[id] = r;
    }
    const rec = recs[id],
      mk = n.date.slice(0, 7),
      dk = String(+n.date.slice(8)),
      text = String(n.text || ""),
      tm = /^At\s+(\d{1,2}:\d{2}\s*[ap]m)/i.exec(text);
    if (!tm) continue;
    rec.attendanceLog = rec.attendanceLog || {};
    rec.attendanceLog[mk] = rec.attendanceLog[mk] || {};
    let e = rec.attendanceLog[mk][dk];
    if (n.type === "punchin") {
      if (e) continue;
      const im = clockMins(tm[1]),
        sk = /start km (\d+)/i.exec(text),
        vh = /vehicle (.+)\.$/i.exec(text);
      e = rec.attendanceLog[mk][dk] = {
        day: +n.date.slice(8),
        weekday: WD[new Date(n.date + "T00:00:00Z").getUTCDay()],
        status: im != null && im > lateAfter ? "late" : "present",
        inTime: tm[1],
        outTime: "-",
        hours: "-",
        km: 0,
        vehicle: vh && vh[1] !== "-" ? vh[1] : "",
        startKm: sk ? +sk[1] : null,
        endKm: null,
      };
      touched.add(id);
    } else if (e && (!e.outTime || e.outTime === "-")) {
      const a = clockMins(e.inTime),
        b = clockMins(tm[1]),
        ek = /end km (\d+)/i.exec(text),
        dr = /driven (\d+) km/i.exec(text);
      e.outTime = tm[1];
      e.hours =
        a != null && b != null && b >= a
          ? Math.floor((b - a) / 60) + "h " + String((b - a) % 60).padStart(2, "0") + "m"
          : "-";
      e.km = dr ? +dr[1] : Number(e.km) || 0;
      e.endKm = ek ? +ek[1] : e.endKm == null ? null : e.endKm;
      touched.add(id);
    }
  }
  touched.forEach((id) => {
    setItem("gm_crm_data_v5__" + id, JSON.stringify(recs[id]));
    console.log("Attendance restored from punch notifications for", id);
  });
  return touched.size;
}
// An employee's phone saves its whole record. Keep every attendance entry the server already has that the phone's copy lacks
// (or has without the punch-out), so an old copy can never erase a day.
function keepAttendance(oldRaw, newRaw) {
  const o = jparse(oldRaw),
    n = jparse(newRaw);
  if (!o || !n || typeof o !== "object" || typeof n !== "object") return newRaw;
  const ol = o.attendanceLog;
  if (!ol || typeof ol !== "object") return newRaw;
  if (!n.attendanceLog || typeof n.attendanceLog !== "object")
    n.attendanceLog = {};
  const nl = n.attendanceLog;
  let changed = false;
  Object.keys(ol).forEach((m) => {
    if (!ol[m] || typeof ol[m] !== "object") return;
    if (!nl[m] || typeof nl[m] !== "object") nl[m] = {};
    Object.keys(ol[m]).forEach((d) => {
      const oe = ol[m][d],
        ne = nl[m][d];
      if (!oe || typeof oe !== "object") return;
      if (!ne || typeof ne !== "object") {
        nl[m][d] = oe;
        changed = true;
      } else if (
        (!ne.outTime || ne.outTime === "-") &&
        oe.outTime &&
        oe.outTime !== "-" &&
        ne.inTime === oe.inTime
      ) {
        nl[m][d] = oe;
        changed = true;
      }
    });
  });
  return changed ? JSON.stringify(n) : newRaw;
}
function workerFileOk(s, v, k, method) {
  // photos and documents saved under a worker id or a vehicle id
  if (s.role === "admin") return true;
  if (v === s.id) return method === "GET" || k === "photo";
  return method === "GET" && k === "photo"; // vehicle photos / other employees' profile photos
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
const BLOCKED = ["data", "node_modules", "backup-before-backend", "test files"];
const KEY_RE = /^gm_[A-Za-z0-9_\-]{1,80}$/;
const PROTECTED = new Set([
  "gm_admin_v1",
  "gm_admin_workers_v1",
  "gm_admin_wprofile_v1",
  "gm_pintasks_v1",
  "gm_depot_v1",
  "gm_admin_account_v1",
]);

function send(res, code, obj, hdr) {
  const b = JSON.stringify(obj),
    h = Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      hdr || {},
    );
  const ae = res.req ? String(res.req.headers["accept-encoding"] || "") : "";
  if (b.length > 1024 && /\bgzip\b/.test(ae)) {
    // big answers (the full data load) go out compressed: about 5 to 10 times smaller
    return zlib.gzip(b, { level: 5 }, (e, z) => {
      if (e) {
        res.writeHead(code, h);
        return res.end(b);
      }
      h["Content-Encoding"] = "gzip";
      h["Vary"] = "Accept-Encoding";
      res.writeHead(code, h);
      res.end(z);
    });
  }
  res.writeHead(code, h);
  res.end(b);
}
// ---- Sales panel: orders, today's route and shop visits. A Sales person can only read and change their OWN records. ----
// Prices always come from the server's price list (never from the browser). Order numbers run SO-1001, SO-1002 ...
const SALES_ORDERS = "gm_sales_orders_v1",
  SALES_DAYS = "gm_sales_days_v1";
function istDay() {
  return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
}
// A visit can only be marked from near the shop (shop pin): within SALES_RADIUS metres, allowing for GPS accuracy (up to 50 m).
const SALES_RADIUS = 150,
  SALES_WATCH = "gm_sales_watch_v1",
  NO_ORDER_REASONS = [
    "Shop closed",
    "Not interested",
    "Out of stock with customer",
    "Will order next time",
    "Customer not available",
    "Other",
  ];
function metres(a, b, c, d) {
  const R = 6371000,
    r = (x) => (x * Math.PI) / 180,
    h =
      Math.sin(r(c - a) / 2) ** 2 +
      Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Adds a line to the admin's bell list (newest first, same shape the delivery app uses).
function notifyAdmin(type, title, text, who) {
  const L = stored("gm_admin_notifs_v1"),
    ts = Date.now();
  const list = Array.isArray(L) ? L : [];
  list.unshift({
    id: "N" + ts + Math.random().toString(36).slice(2, 6),
    ts,
    date: istDay(),
    type,
    title,
    text,
    worker: who || "",
    read: false,
  });
  setItem("gm_admin_notifs_v1", JSON.stringify(list.slice(0, 300)));
}
// Stock a Sales person may rely on: null = this product's stock is not tracked.
function stockOf(x) {
  return x &&
    x.track &&
    x.stock !== "" &&
    x.stock != null &&
    !isNaN(Number(x.stock))
    ? Math.max(0, Number(x.stock))
    : null;
}
// ---- cancelling a placed order. A Sales person may cancel their OWN order for CANCEL_MINUTES after placing it; the office may cancel any. ----
// Nothing is deleted: the order stays in the list as Cancelled with who, when and why, and drops out of all totals.
const CANCEL_MINUTES = 30;
function cancelOrder(id, who, reason, repOnly) {
  const L = stored("gm_sales_orders_v1"),
    list = Array.isArray(L) ? L : [],
    o = list.filter((x) => x && x.id === id)[0];
  if (!o || o.status !== "placed")
    return { error: "That order cannot be cancelled." };
  if (repOnly) {
    if (o.rep !== who.id) return { error: "That order is not yours." };
    if (Date.now() - o.t > CANCEL_MINUTES * 60e3)
      return {
        error:
          "The " +
          CANCEL_MINUTES +
          " minutes to cancel have passed. Ask the office to cancel it.",
      };
  }
  const why = String(reason || "")
    .trim()
    .slice(0, 300);
  if (why.length < 3) return { error: "Give a reason for cancelling." };
  Object.assign(o, {
    status: "cancelled",
    cancelBy: who.name,
    cancelRole: who.role,
    cancelAt: Date.now(),
    cancelReason: why,
  });
  setItem("gm_sales_orders_v1", JSON.stringify(list));
  // the shop was still visited, just with no order
  const days = stored("gm_sales_days_v1");
  if (days && days[o.rep]) {
    Object.keys(days[o.rep]).forEach((dt) => {
      const v =
        days[o.rep][dt] &&
        days[o.rep][dt].visits &&
        days[o.rep][dt].visits[o.code];
      if (v && v.o === id) {
        delete v.o;
        v.s = "no_order";
        v.reason = "Order cancelled";
        v.note = why;
      }
    });
    setItem("gm_sales_days_v1", JSON.stringify(days));
  }
  notifyAdmin(
    "sales_cancel",
    "Order cancelled: " + id + " (" + o.shop + ")",
    who.name +
      (who.role === "sales" ? " (salesperson)" : " (office)") +
      " cancelled order " +
      id +
      " for " +
      o.shop +
      ", Rs " +
      o.total +
      ". Reason: " +
      why,
    o.repName,
  );
  return { order: o };
}
function salesApi(req, res, s, p, url) {
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  const arr = (k) => {
    const v = stored(k);
    return Array.isArray(v) ? v : [];
  };
  const daysAll = () => {
    const v = stored(SALES_DAYS);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  };
  const admin = () => stored("gm_admin_v1") || {};
  const shop = (code) =>
    (admin().customers || []).filter(
      (c) => c && c.code === code && c.active !== false,
    )[0];
  const num = (n) => Math.round((Number(n) || 0) * 100) / 100;
  // Checks the phone's position against the shop pin. Returns { loc } or { error }.
  const where = (sh, b) => {
    const lat = Number(b.lat),
      lng = Number(b.lng),
      acc = Math.max(0, Math.round(Number(b.acc) || 0));
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || (!lat && !lng))
      return {
        error:
          "Turn on location (GPS) and allow it for this page, then try again.",
      };
    if (acc > 200)
      return {
        error:
          "Your GPS is not accurate enough yet (about " +
          acc +
          " m). Step outside or wait a few seconds, then try again.",
      };
    const loc = {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      acc,
    };
    if (!(Number(sh.lat) && Number(sh.lng))) {
      loc.nopin = true; // the shop has no map pin, so the distance cannot be checked
      return { loc };
    }
    const d = Math.round(metres(Number(sh.lat), Number(sh.lng), lat, lng));
    loc.dist = d;
    if (d - Math.min(acc, 50) > SALES_RADIUS)
      return {
        error:
          "You are about " +
          (d >= 1000 ? (d / 1000).toFixed(1) + " km" : d + " m") +
          " from " +
          sh.name +
          ". Go to the shop to mark it (must be within " +
          SALES_RADIUS +
          " m).",
      };
    return { loc };
  };
  const dayOf = (all, date) => {
    const mine = all[s.id] || (all[s.id] = {});
    return mine[date] || (mine[date] = { route: "", visits: {} });
  };
  const saveDays = (all) => {
    const mine = all[s.id] || {},
      keep = Object.keys(mine).sort().slice(-62), // two months of days per person
      out = {};
    keep.forEach((d) => (out[d] = mine[d]));
    all[s.id] = out;
    setItem(SALES_DAYS, JSON.stringify(all));
  };

  if (p === "/api/sales/mine" && req.method === "GET") {
    const q = url.searchParams.get("date"),
      date = isDate(q) ? q : istDay(),
      day = (daysAll()[s.id] || {})[date] || {};
    const orders = arr(SALES_ORDERS)
      .filter((o) => o && o.rep === s.id)
      .slice(-500)
      .reverse();
    const wl = stored(SALES_WATCH),
      mineW = wl && Array.isArray(wl[s.id]) ? wl[s.id] : [],
      byP = {};
    arr("gm_admin_products_v1").forEach((x) => x && x.id && (byP[x.id] = x));
    const back = mineW
      .map((id) => byP[id])
      .filter(
        (x) =>
          x &&
          x.active !== false &&
          (stockOf(x) === null ? false : stockOf(x) > 0),
      )
      .map((x) => ({
        id: x.id,
        name: x.name,
        unit: x.unit || "",
        stock: stockOf(x),
      }));
    return send(res, 200, {
      ok: true,
      date,
      today: istDay(),
      route: day.route || "",
      visits: day.visits || {},
      orders,
      watch: mineW,
      back,
    });
  }
  if (req.method !== "POST") return send(res, 404, { error: "Not found" });

  return body(req, (err, b) => {
    if (err || !b || typeof b !== "object")
      return send(res, 400, { error: "Bad request" });

    // choose today's route (any day from today on)
    if (p === "/api/sales/route") {
      const date = isDate(b.date) ? b.date : istDay(),
        id = String(b.route || "");
      if (id && !(admin().routes || []).some((r) => r && r.id === id))
        return send(res, 400, { error: "Route not found" });
      const all = daysAll();
      dayOf(all, date).route = id;
      saveDays(all);
      return send(res, 200, { ok: true });
    }

    // "Visited, no order": needs a reason and the phone's position near the shop. A visit cannot be undone by the Sales person.
    if (p === "/api/sales/visit") {
      const code = String(b.code || ""),
        sh = shop(code);
      if (!sh) return send(res, 400, { error: "Shop not found" });
      if (b.status !== "no_order")
        return send(res, 400, {
          error:
            "To record a visit with an order, place the order. Otherwise choose a reason for no order.",
        });
      const reason = String(b.reason || ""),
        note = String(b.note || "")
          .trim()
          .slice(0, 300);
      if (NO_ORDER_REASONS.indexOf(reason) < 0)
        return send(res, 400, { error: "Choose the reason for no order." });
      if (reason === "Other" && note.length < 3)
        return send(res, 400, { error: "Write a short note for Other." });
      const w = where(sh, b);
      if (w.error) return send(res, 400, { error: w.error });
      const all = daysAll(),
        d = dayOf(all, istDay()),
        prev = d.visits[code];
      if (prev && prev.o)
        return send(res, 400, {
          error:
            "An order was already placed for this shop today. Cancel it first if it was a mistake.",
        });
      d.visits[code] = Object.assign(
        { s: "no_order", t: Date.now(), reason, note },
        w.loc,
      );
      saveDays(all);
      if (!prev) {
        const who = actorOf(s).name;
        notifyAdmin(
          "sales_noorder",
          "No order: " + sh.name,
          who +
            " visited " +
            sh.name +
            " - no order (" +
            reason +
            (note ? ": " + note : "") +
            ")." +
            (w.loc.nopin
              ? " Shop has no map pin, so distance was not checked."
              : " Marked " + w.loc.dist + " m from the shop."),
          who,
        );
        logEvents(s, [
          {
            type: "visit",
            text: "Visit, no order: " + sh.name + " (" + reason + ")",
          },
        ]);
      }
      return send(res, 200, { ok: true, visits: d.visits });
    }

    if (p === "/api/sales/cancel") {
      const r = cancelOrder(
        String(b.id || ""),
        { id: s.id, name: actorOf(s).name, role: "sales" },
        b.reason,
        true,
      );
      if (r.error) return send(res, 400, { error: r.error });
      logEvents(s, [
        {
          type: "order",
          text: "Order " + r.order.id + " cancelled: " + r.order.cancelReason,
        },
      ]);
      return send(res, 200, { ok: true, order: r.order });
    }

    // "Tell me when it is back in stock"
    if (p === "/api/sales/watch") {
      const id = String(b.id || ""),
        x = arr("gm_admin_products_v1").filter((q) => q && q.id === id)[0];
      if (!x) return send(res, 400, { error: "Product not found" });
      const all0 = stored(SALES_WATCH),
        all =
          all0 && typeof all0 === "object" && !Array.isArray(all0) ? all0 : {},
        mine = (Array.isArray(all[s.id]) ? all[s.id] : []).filter(
          (q) => q !== id,
        );
      if (b.on !== false) mine.push(id);
      all[s.id] = mine.slice(-100);
      setItem(SALES_WATCH, JSON.stringify(all));
      return send(res, 200, { ok: true, watch: all[s.id] });
    }

    // save a draft, place an order, or remove a draft
    if (p === "/api/sales/order") {
      const list = arr(SALES_ORDERS),
        old = b.id
          ? list.filter((o) => o && o.id === b.id && o.rep === s.id)[0]
          : null;
      if (b.remove) {
        if (!old || old.status !== "draft")
          return send(res, 400, {
            error: "Only your own drafts can be removed",
          });
        setItem(SALES_ORDERS, JSON.stringify(list.filter((o) => o !== old)));
        return send(res, 200, { ok: true });
      }
      if (old && old.status !== "draft")
        return send(res, 400, { error: "A placed order cannot be changed" });
      // the same tap sent twice gives the same order back
      if (b.k && !old) {
        const dup = list.filter(
          (o) => o && o.rep === s.id && o.k === String(b.k),
        )[0];
        if (dup) return send(res, 200, { ok: true, order: dup });
      }
      const sh = shop(String(b.code || ""));
      if (!sh) return send(res, 400, { error: "Shop not found" });
      const prods = arr("gm_admin_products_v1"),
        byId = {};
      prods.forEach((x) => {
        if (x && x.id && x.active !== false) byId[x.id] = x;
      });
      const merged = {};
      (Array.isArray(b.items) ? b.items : []).slice(0, 200).forEach((it) => {
        const id = String((it && it.id) || ""),
          q = Math.floor(Number(it && it.qty));
        if (byId[id] && q > 0)
          merged[id] = Math.min(9999, (merged[id] || 0) + q);
      });
      const ids = Object.keys(merged);
      if (!ids.length)
        return send(res, 400, { error: "Add at least one product" });
      if (!b.draft) {
        // only what is in stock can be sold
        for (const id of ids) {
          const av = stockOf(byId[id]);
          if (av === null) continue;
          if (av <= 0)
            return send(res, 400, {
              error:
                byId[id].name +
                " is out of stock. Remove it to place the order.",
            });
          if (merged[id] > av)
            return send(res, 400, {
              error:
                "Only " +
                av +
                " " +
                (byId[id].unit || "") +
                " of " +
                byId[id].name +
                " available. Reduce the quantity.",
            });
        }
      }
      let oloc = null;
      if (!b.draft) {
        const w = where(sh, b);
        if (w.error) return send(res, 400, { error: w.error });
        oloc = w.loc;
      }
      const items = ids.map((id) => {
        const x = byId[id],
          price = num(x.price);
        return {
          id,
          code: x.code,
          name: x.name,
          unit: x.unit || "",
          price,
          qty: merged[id],
          amount: num(price * merged[id]),
        };
      });
      const subtotal = num(items.reduce((t, i) => t + i.amount, 0)),
        discount = Math.min(subtotal, Math.max(0, num(b.discount))),
        placing = !b.draft;
      let id = old ? old.id : "DR-" + Date.now().toString(36);
      if (placing) {
        const seq = list.reduce((m, o) => {
          const n =
            o && /^SO-(\d+)$/.test(o.id) ? parseInt(o.id.slice(3), 10) : 0;
          return n > m ? n : m;
        }, 1000);
        id = "SO-" + (seq + 1);
      }
      const now = Date.now(),
        rec = {
          id,
          rep: s.id,
          repName: actorOf(s).name,
          code: sh.code,
          shop: sh.name,
          area: sh.area || "",
          date: istDay(),
          t: now,
          status: placing ? "placed" : "draft",
          items,
          subtotal,
          discount,
          total: num(subtotal - discount),
          notes: String(b.notes || "").slice(0, 500),
        };
      if (b.k) rec.k = String(b.k).slice(0, 60);
      if (oloc) rec.loc = oloc;
      if (
        b.replaces &&
        list.some(
          (x) =>
            x &&
            x.id === b.replaces &&
            x.rep === s.id &&
            x.status === "cancelled",
        )
      )
        rec.replaces = String(b.replaces); // a corrected order that replaces a cancelled one
      const next = list.filter((o) => o !== old);
      next.push(rec);
      setItem(SALES_ORDERS, JSON.stringify(next));
      if (placing) {
        const all = daysAll(),
          d = dayOf(all, istDay()),
          pv = d.visits[sh.code],
          firstToday = !pv || pv.s === "no_order";
        // the order becomes the visit (with where it was placed)
        d.visits[sh.code] = Object.assign(
          { s: "visited", t: now, o: id },
          oloc,
        );
        saveDays(all);
        const who = rec.repName;
        notifyAdmin(
          "sales_order",
          "New order " + id + ": " + sh.name,
          who +
            " took an order for " +
            sh.name +
            ": " +
            items.length +
            (items.length === 1 ? " item" : " items") +
            ", Rs " +
            rec.total +
            (oloc.nopin
              ? ". Shop has no map pin, so distance was not checked."
              : ". Placed " + oloc.dist + " m from the shop."),
          who,
        );
        logEvents(s, [
          {
            type: "order",
            text: "Order " + id + " for " + sh.name + ", Rs " + rec.total,
          },
        ]);
      }
      return send(res, 200, { ok: true, order: rec });
    }
    return send(res, 404, { error: "Not found" });
  });
}

function body(req, cb, limit) {
  let n = 0;
  const parts = [],
    max = limit || MAX_BODY;
  req.on("data", (c) => {
    n += c.length;
    if (n > max) {
      req.destroy();
    } else parts.push(c);
  });
  req.on("end", () => {
    try {
      cb(null, JSON.parse(Buffer.concat(parts).toString("utf8")));
    } catch (e) {
      cb(e);
    }
  });
}

// Daily plan rules, enforced here as well as in the browser:
// on one date a worker, a vehicle and an invoice can each be in only one active (not cancelled) plan.
// Only conflicts that a save INTRODUCES are rejected, so data that was already inconsistent never blocks saving.
function planConflicts(raw) {
  const out = new Set();
  let S;
  try {
    S = JSON.parse(raw);
  } catch (e) {
    return out;
  }
  const plans = S && S.plans;
  if (!plans || typeof plans !== "object") return out;
  const floor = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10); // old history is not re-checked
  for (const d of Object.keys(plans)) {
    if (d < floor) continue;
    const list = (Array.isArray(plans[d]) ? plans[d] : [plans[d]]).filter(
      (p) => p && typeof p === "object" && p.status !== "cancelled",
    );
    const w = {},
      v = {},
      inv = {};
    for (const p of list) {
      const crew = [p.workerId]
        .concat(Array.isArray(p.helpers) ? p.helpers : [])
        .filter((x) => typeof x === "string" && x);
      for (const id of crew) {
        if (w[id])
          out.add(
            d +
              "|worker|" +
              id +
              "|" +
              ((id === p.workerId ? p.worker : "") || id),
          );
        w[id] = 1;
      }
      if (p.vehicleId) {
        if (v[p.vehicleId])
          out.add(
            d + "|vehicle|" + p.vehicleId + "|" + (p.vehicle || p.vehicleId),
          );
        v[p.vehicleId] = 1;
      }
      for (const s of Array.isArray(p.stops) ? p.stops : []) {
        if (!s || !s.inv) continue;
        if (inv[s.inv]) out.add(d + "|invoice|" + s.inv + "|" + s.inv);
        inv[s.inv] = 1;
      }
    }
  }
  return out;
}
function planConflict(oldRaw, newRaw) {
  const before = oldRaw ? planConflicts(oldRaw) : new Set();
  for (const c of planConflicts(newRaw)) {
    if (before.has(c)) continue;
    const [d, kind, , label] = c.split("|");
    return kind === "invoice"
      ? "Invoice " + label + " is already in another plan on " + d + "."
      : (kind === "worker" ? "Employee " : "Vehicle ") +
          label +
          " already has a plan on " +
          d +
          ".";
  }
  return "";
}

function api(req, res, url) {
  const p = url.pathname;
  if (p === "/api/health") return send(res, 200, { ok: true });
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin) {
    // another website cannot make the browser act for the user
    let okOrigin = false;
    try {
      okOrigin = new URL(req.headers.origin).host === req.headers.host;
    } catch (e) {}
    if (!okOrigin) return send(res, 403, { error: "bad origin" });
  }

  if (p === "/api/login" && req.method === "POST")
    return body(
      req,
      (err, b) => {
        if (
          err ||
          !b ||
          typeof b.phone !== "string" ||
          typeof b.password !== "string"
        )
          return send(res, 400, {
            error: "Enter your mobile number and password.",
          });
        const ip = clientIp(req),
          phone = b.phone.replace(/\D/g, "").slice(-10),
          pw = b.password.slice(0, 200);
        const kp = "p:" + phone,
          ki = "i:" + ip,
          lk = Math.max(lockLeft(kp), lockLeft(ki));
        if (lk)
          return send(res, 429, {
            error:
              "Too many wrong attempts. Try again in " +
              lk +
              " minute" +
              (lk > 1 ? "s" : "") +
              ".",
          });
        const a = adminList().filter((x) => x && x.phone === phone)[0];
        const wk = a
          ? null
          : (workerData().workers || []).filter(
              (x) => x && x.phone === phone,
            )[0];
        const hash = a
          ? (auth.admins[a.id] || {}).h
          : wk
            ? (auth.workers[wk.id] || {}).h
            : null;
        const good = checkPw(pw, hash) && !!(a || wk);
        if (!good) {
          noteFail(kp, 5);
          noteFail(ki, 25);
          return send(res, 401, {
            error: "Incorrect mobile number or password.",
          });
        }
        delete fails[kp];
        if (a) {
          if (a.status === "inactive")
            return send(res, 403, {
              code: "inactive",
              error: "This account is inactive. Contact the Super Admin.",
            });
          const isSales = a.role === "Sales"; // Sales people get their own limited session, never an admin one
          startSession(
            res,
            req,
            isSales ? "sales" : "admin",
            a.id,
            b.remember === true,
          );
          logEvents({ role: isSales ? "sales" : "admin", id: a.id }, [
            { type: "login", text: "Signed in" },
          ]);
          auth.admins[a.id].last = Date.now();
          saveAuth();
          if (isSales)
            return send(res, 200, {
              ok: true,
              role: "sales",
              id: a.id,
              name: a.name,
              must: !!auth.admins[a.id].must,
            });
          return send(res, 200, {
            ok: true,
            role: "admin",
            id: a.id,
            name: a.name,
            adminRole: a.role || "Admin",
            perms: isFull(a) ? MODULES.slice() : modsOf(a),
            full: isFull(a),
            super: isSuper(a),
            must: !!auth.admins[a.id].must,
          });
        }
        if (!wk.active)
          return send(res, 403, {
            code: "inactive",
            error: "This account is inactive. Contact Fleet Admin.",
          });
        const panel = empPanel(empRoleOf(wk.id));
        if (panel !== "worker") {
          startSession(res, req, panel, wk.id, false, true);
          logEvents({ role: panel, id: wk.id, emp: true }, [
            { type: "login", text: "Signed in" },
          ]);
          if (panel === "sales")
            return send(res, 200, {
              ok: true,
              role: "sales",
              id: wk.id,
              name: wk.name,
              must: false,
            });
          const ec = empAccount(wk.id);
          return send(res, 200, {
            ok: true,
            role: "admin",
            id: wk.id,
            name: wk.name,
            adminRole: ec.role,
            perms: isFull(ec) ? MODULES.slice() : modsOf(ec),
            full: isFull(ec),
            super: false,
            must: false,
          });
        }
        const t = localDate();
        if (
          (workerData().leaves || []).some(
            (l) => l && l.workerId === wk.id && l.from <= t && t <= l.to,
          )
        )
          return send(res, 403, { code: "leave", error: "On leave today." });
        startSession(res, req, "worker", wk.id);
        send(res, 200, {
          ok: true,
          role: "worker",
          id: wk.id,
          name: wk.name,
          phone: wk.phone,
          emergency: wk.emergency || "",
        });
      },
      4096,
    );

  const s = getSession(req);
  if (p === "/api/logout" && req.method === "POST") {
    if (s) {
      delete sessions[s.hash];
      saveSessions();
    }
    setCookie(res, req, "", 0);
    return send(res, 200, { ok: true });
  }
  if (!s) return send(res, 401, { error: "Please sign in." });
  const mustChange =
    (s.role === "admin" || s.role === "sales") &&
    !s.emp &&
    auth.admins[s.id] &&
    auth.admins[s.id].must;
  if (p === "/api/keepalive" && req.method === "POST")
    return send(res, 200, { ok: true }); // the admin page calls this while the person is really using it
  if (p === "/api/me") {
    const ac = acctOf(s);
    return send(res, 200, {
      ok: true,
      role: s.role,
      id: s.id,
      must: !!mustChange,
      name: ac ? ac.name : undefined,
      adminRole: ac ? ac.role || "Admin" : undefined,
      email: ac ? ac.email || "" : undefined,
      phone: ac ? ac.phone : undefined,
      perms: ac ? modsOf(ac) : undefined,
      full: ac ? isFull(ac) : undefined,
      super: ac ? isSuper(ac) : undefined,
    });
  }
  if (p === "/api/change-password" && req.method === "POST")
    return body(
      req,
      (err, b) => {
        if (
          err ||
          !b ||
          typeof b.current !== "string" ||
          typeof b.next !== "string"
        )
          return send(res, 400, {
            error: "Enter your current and new password.",
          });
        const useW = s.role === "worker" || s.emp,
          rec = (useW ? auth.workers : auth.admins)[s.id],
          k = "c:" + s.role + s.id;
        if (lockLeft(k))
          return send(res, 429, {
            error: "Too many wrong attempts. Try again later.",
          });
        if (!rec || !checkPw(b.current, rec.h)) {
          noteFail(k, 5);
          return send(res, 400, {
            error: "The current password is not correct.",
          });
        }
        if (b.next.length < 8)
          return send(res, 400, {
            error: "The new password must be at least 8 characters.",
          });
        if (b.next === b.current)
          return send(res, 400, {
            error: "Choose a password different from the current one.",
          });
        (useW ? auth.workers : auth.admins)[s.id] = Object.assign({}, rec, {
          h: hashPw(b.next),
          must: false,
        });
        saveAuth();
        Object.keys(sessions).forEach((h) => {
          if (
            sessions[h].role === s.role &&
            sessions[h].id === s.id &&
            h !== s.hash
          )
            delete sessions[h];
        });
        saveSessions();
        logEvents(s, [{ type: "password", text: "Changed own password" }]);
        send(res, 200, { ok: true });
      },
      4096,
    );
  if (mustChange)
    return send(res, 403, {
      error: "Choose a new password first.",
      must: true,
    });
  // A Sales session can only: read the price list and shops (/api/state, trimmed in viewFor), see product pictures, use the
  // /api/sales/* calls below (its own orders, route and visits), and sign out / change its own password (handled above). Everything else is refused here, before any other rule is looked at.
  if (
    s.role === "sales" &&
    !(
      (p === "/api/state" && req.method === "GET") ||
      (p === "/api/pfile" && req.method === "GET") ||
      p.indexOf("/api/sales/") === 0
    )
  )
    return send(res, 403, { error: "Not allowed" });
  if (s.role === "sales" && p.indexOf("/api/sales/") === 0)
    return salesApi(req, res, s, p, url);

  // ---- Office cancels a Sales order (needs the Sales or Billing option, or full access) ----
  if (p === "/api/salesadmin/cancel" && req.method === "POST") {
    const ac = acctOf(s);
    if (s.role !== "admin" || !ac || !hasAny(ac, ["sales", "billing"]))
      return send(res, 403, { error: "Not allowed" });
    return body(
      req,
      (err, b) => {
        if (err || !b) return send(res, 400, { error: "Bad request" });
        const r = cancelOrder(
          String(b.id || ""),
          { id: s.id, name: ac.name, role: "admin" },
          b.reason,
          false,
        );
        if (r.error) return send(res, 400, { error: r.error });
        logEvents(s, [
          {
            type: "order",
            text: "Order " + r.order.id + " cancelled: " + r.order.cancelReason,
          },
        ]);
        send(res, 200, { ok: true });
      },
      4096,
    );
  }

  // ---- Employee access (Super Admin only): which options each admin-side employee can open ----
  if (p === "/api/access" || p.indexOf("/api/access/") === 0) {
    if (s.role !== "admin" || s.emp || !isSuper(acctOf(s)))
      return send(res, 403, {
        error: "Only the Super Admin can change who sees what.",
      });
    if (p === "/api/access" && req.method === "GET") {
      const prof = stored("gm_admin_wprofile_v1") || {},
        acc = accessData();
      return send(res, 200, {
        ok: true,
        modules: MODULES,
        people: (workerData().workers || [])
          .filter((w) => w && empPanel(empRoleOf(w.id)) !== "worker")
          .map((w) => {
            const role = empRoleOf(w.id);
            return {
              id: w.id,
              name: w.name,
              phone: w.phone,
              role,
              code: (prof[w.id] && prof[w.id].empCode) || "",
              active: w.active !== false,
              full: role === "Admin",
              panel: empPanel(role),
              base: EMP_ROLE_MODULE[role] || "",
              perms: MODULES.filter(
                (m) =>
                  m === EMP_ROLE_MODULE[role] ||
                  (Array.isArray(acc[w.id]) && acc[w.id].indexOf(m) > -1),
              ),
            };
          }),
      });
    }
    const am = /^\/api\/access\/([^/]+)$/.exec(p);
    if (am && req.method === "PUT")
      return body(
        req,
        (err, b) => {
          const id = decodeURIComponent(am[1]),
            role = empRoleOf(id);
          if (err || !b || !Array.isArray(b.perms))
            return send(res, 400, { error: "Send the list of options." });
          if (
            !(workerData().workers || []).some((w) => w && w.id === id) ||
            role === "Admin" ||
            role === "Sales" ||
            empPanel(role) === "worker"
          )
            return send(res, 400, {
              error:
                "Access can only be set for Billing and Inventory employees.",
            });
          const acc = Object.assign({}, accessData()),
            list = MODULES.filter(
              (m) => b.perms.indexOf(m) > -1 && m !== EMP_ROLE_MODULE[role],
            );
          if (list.length) acc[id] = list;
          else delete acc[id];
          setItem("gm_admin_access_v1", JSON.stringify(acc));
          persist();
          logEvents(s, [
            {
              type: "access",
              text:
                "Access changed for " +
                (
                  (workerData().workers || []).filter(
                    (w) => w && w.id === id,
                  )[0] || {}
                ).name +
                ": " +
                (list.length ? list.join(", ") : "own module only"),
            },
          ]);
          send(res, 200, { ok: true });
        },
        4096,
      );
    return send(res, 404, { error: "not found" });
  }

  // ---- Users & Admins (Super Admin only) ----
  if (p === "/api/users" || p.indexOf("/api/users/") === 0) {
    const me = acctOf(s);
    if (!isSuper(me))
      return send(res, 403, {
        error: "Only the Super Admin can manage users.",
      });
    const parts = p.split("/"),
      uid = parts[3] ? decodeURIComponent(parts[3]) : "",
      act = parts[4] || "";
    const clean = (b, cur) => {
      // validates the form fields; returns { error } or { rec }
      const name = String(b.name == null ? (cur && cur.name) || "" : b.name)
          .trim()
          .slice(0, 60),
        phone = cleanPhone(b.phone == null ? cur && cur.phone : b.phone),
        email = String(b.email == null ? (cur && cur.email) || "" : b.email)
          .trim()
          .slice(0, 80);
      const role = b.role == null ? cur && cur.role : String(b.role),
        status =
          b.status == null ? (cur && cur.status) || "active" : String(b.status);
      if (name.length < 2)
        return { error: "Enter the full name (at least 2 letters)." };
      if (!/^[6-9]\d{9}$/.test(phone))
        return { error: "Enter a valid 10-digit mobile number." };
      if (phoneTaken(phone, cur && cur.id))
        return {
          error:
            "This mobile number is already used by another user or employee.",
        };
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return { error: "Enter a valid email address, or leave it empty." };
      if (STAFF_ROLES.indexOf(role) < 0)
        return {
          error:
            "Only Super Admin and Admin accounts are made here. Add everyone else on the Employees page.",
        };
      if (status !== "active" && status !== "inactive")
        return { error: "Choose the account status." };
      let perms = Array.isArray(b.perms) ? b.perms : (cur && cur.perms) || [];
      perms =
        ROLES.indexOf(role) < 2
          ? []
          : MODULES.filter((m) => perms.indexOf(m) > -1);
      if (ROLES.indexOf(role) >= 2 && !perms.length)
        return { error: "Tick at least one module for this user." };
      return { rec: { name, phone, email, role, perms, status } };
    };
    const activeSupers = (list, skipId) =>
      list.filter(
        (a) =>
          a &&
          a.id !== skipId &&
          a.role === "Super Admin" &&
          a.status !== "inactive",
      ).length;
    if (p === "/api/users" && req.method === "GET")
      return send(res, 200, {
        ok: true,
        me: s.id,
        users: adminList().map(publicUser),
      });
    if (p === "/api/users" && req.method === "POST")
      return body(
        req,
        (err, b) => {
          if (err || !b)
            return send(res, 400, { error: "Send the user details." });
          const c = clean(b, null);
          if (c.error) return send(res, 400, { error: c.error });
          const list = adminList().map((a) => Object.assign({}, a)),
            n =
              list.reduce((m, a) => {
                const x = /^A(\d+)$/.exec(a.id || "");
                return x ? Math.max(m, +x[1]) : m;
              }, 0) + 1;
          const id = "A" + n,
            pw =
              typeof b.password === "string" && b.password.length >= 8
                ? b.password.slice(0, 100)
                : tempPassword();
          if (
            typeof b.password === "string" &&
            b.password &&
            b.password.length < 8
          )
            return send(res, 400, {
              error: "A password you set must be at least 8 characters.",
            });
          list.push(Object.assign({ id, created: Date.now() }, c.rec));
          auth.admins[id] = { h: hashPw(pw), must: true };
          saveAuth(); // the new user must choose their own password at first sign-in
          setItem("gm_admin_account_v1", JSON.stringify(list));
          logEvents(s, [
            {
              type: "settings",
              text: "User created: " + c.rec.name + " (" + c.rec.role + ")",
            },
          ]);
          send(res, 200, {
            ok: true,
            user: publicUser(list[list.length - 1]),
            tempPassword: pw,
          });
        },
        4096,
      );
    if (uid && !act && req.method === "PUT")
      return body(
        req,
        (err, b) => {
          if (err || !b)
            return send(res, 400, { error: "Send the user details." });
          const list = adminList().map((a) => Object.assign({}, a)),
            i = list.findIndex((a) => a.id === uid);
          if (i < 0) return send(res, 404, { error: "User not found." });
          const cur = list[i],
            c = clean(b, cur);
          if (c.error) return send(res, 400, { error: c.error });
          if (uid === s.id && c.rec.status === "inactive")
            return send(res, 400, {
              error: "You cannot deactivate your own account.",
            });
          if (
            cur.role === "Super Admin" &&
            (c.rec.role !== "Super Admin" || c.rec.status === "inactive") &&
            !activeSupers(list, uid)
          )
            return send(res, 400, {
              error: "There must always be at least one active Super Admin.",
            });
          const before = publicUser(cur);
          list[i] = Object.assign({}, cur, c.rec);
          setItem("gm_admin_account_v1", JSON.stringify(list));
          if (c.rec.status === "inactive" || c.rec.role !== cur.role)
            dropSessionsOf(uid); // they sign in again under the new rules
          const ch = [];
          if (before.role !== c.rec.role)
            ch.push("role " + before.role + " to " + c.rec.role);
          if (before.status !== "pending" && cur.status !== c.rec.status)
            ch.push(c.rec.status === "inactive" ? "deactivated" : "activated");
          if (
            JSON.stringify(before.perms) !==
            JSON.stringify(publicUser(list[i]).perms)
          )
            ch.push("module access");
          if (
            cur.name !== c.rec.name ||
            cur.phone !== c.rec.phone ||
            (cur.email || "") !== c.rec.email
          )
            ch.push("details");
          if (ch.length)
            logEvents(s, [
              {
                type: "settings",
                text: "User " + c.rec.name + ": " + ch.join(", ") + " changed",
              },
            ]);
          send(res, 200, { ok: true, user: publicUser(list[i]) });
        },
        4096,
      );
    if (uid && act === "reset" && req.method === "POST") {
      const a = adminList().filter((x) => x && x.id === uid)[0];
      if (!a) return send(res, 404, { error: "User not found." });
      if (uid === s.id)
        return send(res, 400, {
          error: "Use Change password on your own profile.",
        });
      const pw = tempPassword();
      auth.admins[uid] = Object.assign({}, auth.admins[uid], {
        h: hashPw(pw),
        must: true,
      });
      saveAuth();
      dropSessionsOf(uid);
      logEvents(s, [
        { type: "settings", text: "Password reset for " + a.name },
      ]);
      return send(res, 200, { ok: true, tempPassword: pw });
    }
    return send(res, 404, { error: "not found" });
  }

  // Privacy notice acceptance. The server writes the time with its own clock; employees cannot write or read this key through /api/kv.
  if (p === "/api/consent" && s.role === "worker") {
    const CK = "gm_admin_consent_v1",
      cur = (db.items[CK] && jparse(db.items[CK].v)) || {};
    if (req.method === "GET")
      return send(res, 200, {
        ok: true,
        at: (cur[s.id] && cur[s.id].at) || null,
      });
    if (req.method === "POST") {
      if (!cur[s.id]) {
        cur[s.id] = { v: 1, at: new Date().toISOString() };
        setItem(CK, JSON.stringify(cur));
      }
      return send(res, 200, { ok: true, at: cur[s.id].at });
    }
  }

  if (p === "/api/state" && req.method === "GET") {
    const since = parseInt(url.searchParams.get("since"), 10) || 0,
      out = {};
    for (const k in db.items)
      if (db.items[k].rev > since && canRead(s, k))
        out[k] = { v: viewFor(s, k, db.items[k].v), rev: db.items[k].rev };
    return send(res, 200, { rev: db.rev, items: out }); // always fresh (never cached); only compressed
  }
  if (p === "/api/activity" && req.method === "GET") {
    if (s.role !== "admin" || !isFull(acctOf(s)))
      return send(res, 403, { error: "Admin only" });
    const months = Object.keys(db.activity)
      .filter((k) => /^\d{6}$/.test(k))
      .sort()
      .reverse();
    // One employee's log (all months): what they did themselves, plus changes that mention them by name or ID.
    const wid = String(url.searchParams.get("worker") || "");
    if (wid) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(wid))
        return send(res, 400, { error: "bad employee id" });
      const w = (workerData().workers || []).filter(
          (x) => x && x.id === wid,
        )[0],
        nm = String((w && w.name) || "").toLowerCase(),
        idl = wid.toLowerCase();
      const out = [];
      months.forEach((m) =>
        (db.activity[m] || []).forEach((e) => {
          const txt = String(e.text || "").toLowerCase(),
            own =
              e.uid === wid ||
              (!e.uid &&
                e.role === "worker" &&
                nm &&
                String(e.by || "").toLowerCase() === nm),
            about =
              txt.indexOf("(" + idl + ")") >= 0 ||
              (nm.length > 2 && txt.indexOf(nm) >= 0);
          if (own || about)
            out.push({
              t: e.t,
              by: e.by,
              role: e.role,
              type: e.type,
              text: e.text,
              own: !!own,
            });
        }),
      );
      out.sort((a, b) => b.t - a.t);
      return send(res, 200, { events: out.slice(0, 500), total: out.length });
    }
    let mo = String(url.searchParams.get("month") || "");
    if (!/^\d{6}$/.test(mo)) mo = months[0] || istMonth(Date.now());
    const events = (db.activity[mo] || [])
      .slice()
      .reverse()
      .map((e) => ({
        t: e.t,
        by: e.by,
        role: e.role,
        type: e.type,
        text: e.text,
      }));
    return send(res, 200, { month: mo, months, events });
  }
  // The office closes a day the employee forgot to punch out. The check-out time and closing km are written into the employee's
  // own record (the same place a real punch-out writes), so the Vehicles page shows the day as returned and moves the odometer.
  if (p === "/api/close-day" && req.method === "POST")
    return body(
      req,
      (err, b) => {
        if (s.role !== "admin" || !hasAny(acctOf(s), ["helper"]))
          return send(res, 403, { error: "Not allowed" });
        if (err || !b || typeof b !== "object")
          return send(res, 400, { error: "bad request" });
        const id = typeof b.id === "string" ? b.id : "",
          date = typeof b.date === "string" ? b.date : "",
          endKm = Math.round(Number(b.endKm)) || 0,
          stKm = Math.round(Number(b.startKm)) || 0,
          tOut = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(b.outTime || ""));
        if (
          !/^[A-Za-z0-9_-]{1,40}$/.test(id) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date)
        )
          return send(res, 400, { error: "bad request" });
        if (!(endKm > 0) && !(stKm > 0))
          return send(res, 400, {
            error: "Enter the start km or the end km (odometer reading).",
          });
        if (endKm > 0 && !tOut)
          return send(res, 400, { error: "Enter the check-out time too." });
        const w = (workerData().workers || []).filter(
          (x) => x && x.id === id,
        )[0];
        const rec = stored("gm_crm_data_v5__" + id);
        if (!w || !rec || typeof rec !== "object")
          return send(res, 404, {
            error: "This employee has no saved record yet.",
          });
        const fmt = (n) => {
          const h = Math.floor(n / 60);
          return (
            String(h % 12 || 12).padStart(2, "0") +
            ":" +
            String(n % 60).padStart(2, "0") +
            (h >= 12 ? " pm" : " am")
          );
        };
        const mk = date.slice(0, 7),
          dk = String(+date.slice(8));
        rec.attendanceLog = rec.attendanceLog || {};
        rec.attendanceLog[mk] = rec.attendanceLog[mk] || {};
        let e = rec.attendanceLog[mk][dk];
        if (!e) {
          // the phone never saved this day: build it from the check-in time the office entered
          const im = clockMins(b.inTime);
          if (im == null)
            return send(res, 400, { error: "Enter the check-in time." });
          const set = stored("gm_admin_settings_v1") || {},
            late = clockMins(
              /^\d{1,2}:\d{2}$/.test(set.lateAfter || "") ? set.lateAfter : "08:30",
            );
          e = rec.attendanceLog[mk][dk] = {
            day: +date.slice(8),
            weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
              new Date(date + "T00:00:00Z").getUTCDay()
            ],
            status: im > late ? "late" : "present",
            inTime: fmt(im),
            outTime: "-",
            hours: "-",
            km: 0,
            vehicle: "",
            startKm: null,
            endKm: null,
          };
        }
        // start km: the office may correct it; otherwise keep what the employee entered
        const sk =
          stKm > 0
            ? stKm
            : e.startKm == null || !Number.isFinite(Number(e.startKm))
              ? null
              : Number(e.startKm);
        // end km: the new one if given, else the one already saved on this day
        const ek =
          endKm > 0
            ? endKm
            : Number(e.endKm) > 0
              ? Number(e.endKm)
              : null;
        if (sk != null && ek != null && ek < sk)
          return send(res, 400, {
            error:
              endKm > 0
                ? "End km cannot be less than the start km (" + sk + " km)."
                : "Start km cannot be more than the end km (" + ek + " km).",
          });
        if (endKm > 0) {
          let om = clockMins(tOut[0]);
          const im2 = clockMins(e.inTime);
          if (om != null && im2 != null && om < im2)
            return send(res, 400, {
              error: "Check-out must be after check-in (" + e.inTime + ").",
            });
          e.outTime = fmt(om);
          e.hours =
            im2 != null
              ? Math.floor((om - im2) / 60) +
                "h " +
                String((om - im2) % 60).padStart(2, "0") +
                "m"
              : "-";
          e.endKm = endKm;
          e.closedByOffice = true;
        }
        if (stKm > 0) {
          e.startKm = stKm;
          e.startKmByOffice = true;
        }
        if (sk != null && ek != null) e.km = ek - sk;
        else if (endKm > 0)
          e.km =
            Number.isFinite(Number(b.km)) && Number(b.km) >= 0
              ? Number(b.km)
              : Number(e.km) || 0;
        if (!e.vehicle && typeof b.vehicle === "string")
          e.vehicle = b.vehicle.slice(0, 80);
        setItem("gm_crm_data_v5__" + id, JSON.stringify(rec));
        logEvents(s, [
          {
            type: "employee",
            text:
              (endKm > 0
                ? "Closed " + w.name + "'s day " + date + " from the office: " + e.outTime + ", end km " + endKm
                : "Changed " + w.name + "'s start km on " + date) +
              (stKm > 0 ? (endKm > 0 ? ", start km " : ": ") + stKm : ""),
          },
        ]);
        send(res, 200, { ok: true, entry: e });
      },
      8192,
    );
  if (p === "/api/delete-employee" && req.method === "POST")
    return body(
      req,
      (err, b) => {
        if (s.role !== "admin" || !isFull(acctOf(s)))
          return send(res, 403, { error: "Admin only" });
        const id = b && typeof b.id === "string" ? b.id : "";
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(id))
          return send(res, 400, { error: "bad employee id" });
        const wd = workerData(),
          w = (wd.workers || []).filter((x) => x && x.id === id)[0];
        if (!w)
          return send(res, 404, {
            error: "Employee not found. Reload the page.",
          });
        // An employee who has worked (attendance, deliveries, plans, advances) must not be deleted: their history would lose its name.
        const reasons = [],
          has = (k, needle) =>
            !!(
              db.items[k] &&
              typeof db.items[k].v === "string" &&
              db.items[k].v.indexOf(needle) >= 0
            );
        const rec = stored("gm_crm_data_v5__" + id);
        if (
          rec &&
          rec.attendanceLog &&
          Object.keys(rec.attendanceLog).some(
            (m) =>
              rec.attendanceLog[m] && Object.keys(rec.attendanceLog[m]).length,
          )
        )
          reasons.push("has attendance records");
        if (
          rec &&
          Array.isArray(rec.shops) &&
          rec.shops.some((x) => x && x.status && x.status !== "pending")
        )
          reasons.push("has delivery records");
        if (has("gm_admin_v1", '"workerId":"' + id + '"'))
          reasons.push("is on one or more daily plans");
        if (has("gm_admin_ledger_v1", '"workerId":"' + id + '"'))
          reasons.push("has advances or deductions");
        if (reasons.length && !b.force)
          return send(res, 409, {
            code: "history",
            error:
              w.name +
              " " +
              reasons.join(", ") +
              ". Mark them as relieved instead, so the history stays.",
            reasons,
          });
        const nd = Object.assign({}, wd, {
          workers: wd.workers.filter((x) => x && x.id !== id),
          leaves: (wd.leaves || []).filter((l) => l && l.workerId !== id),
        });
        setItem("gm_admin_workers_v1", JSON.stringify(nd));
        const pr = stored("gm_admin_wprofile_v1");
        if (pr && typeof pr === "object" && pr[id]) {
          delete pr[id];
          setItem("gm_admin_wprofile_v1", JSON.stringify(pr));
        }
        ["gm_crm_data_v5__" + id, "gm_pins_v1_" + id, "gm_wself_" + id].forEach(
          (k) => {
            if (db.items[k] && db.items[k].v != null) setItem(k, null);
          },
        );
        delete auth.workers[id];
        saveAuth();
        Object.keys(sessions).forEach((h) => {
          if (
            sessions[h].id === id &&
            (sessions[h].role === "worker" || sessions[h].emp)
          )
            delete sessions[h];
        });
        saveSessions();
        logEvents(s, [
          {
            type: "employee",
            text: "Employee deleted: " + w.name + " (" + id + ")",
          },
        ]);
        send(res, 200, { ok: true });
      },
      1024,
    );
  if (p === "/api/export" && req.method === "GET") {
    if (s.role !== "admin" || !isSuper(acctOf(s)))
      return send(res, 403, { error: "Super Admin only" });
    const ist = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition":
        'attachment; filename="gm-crm-backup-' + ist + '.json"',
    });
    return res.end(
      JSON.stringify(
        Object.assign(
          { app: "GM-CRM backup", exportedAt: new Date().toISOString() },
          db,
        ),
        null,
        2,
      ),
    );
  }
  // Import backup (Super Admin only). POST /api/import?preview=1 only checks the file; without it the data is replaced.
  // Logins (auth.json), sessions and the admin account list are never touched, so nobody is locked out.
  if (p === "/api/import" && req.method === "POST") {
    if (s.role !== "admin" || !isSuper(acctOf(s)))
      return send(res, 403, { error: "Super Admin only" });
    const preview = /[?&]preview=1\b/.test(req.url || "");
    return body(
      req,
      async (err, b) => {
        if (err || !b || typeof b !== "object")
          return send(res, 400, {
            error: "This is not a readable backup file.",
          });
        if (!b.items || typeof b.items !== "object" || Array.isArray(b.items))
          return send(res, 400, {
            error: "This file is not a GM-CRM backup (no data found).",
          });
        const keys = Object.keys(b.items);
        if (!keys.length || keys.length > MAX_KEYS)
          return send(res, 400, {
            error:
              "The backup has " + keys.length + " records, which is not valid.",
          });
        for (const k of keys) {
          const it = b.items[k];
          if (
            !it ||
            typeof it !== "object" ||
            (it.v != null && typeof it.v !== "string") ||
            (it.v && it.v.length > MAX_VALUE)
          )
            return send(res, 400, {
              error:
                'The backup file is damaged (record "' +
                String(k).slice(0, 40) +
                '").',
            });
        }
        if (
          b.activity != null &&
          (typeof b.activity !== "object" || Array.isArray(b.activity))
        )
          return send(res, 400, {
            error: "The backup file is damaged (activity log).",
          });
        const KEEP = ["gm_admin_account_v1"];
        const live = (k) => db.items[k] && db.items[k].v != null;
        const count = (obj, k) => {
          try {
            const v = JSON.parse(obj[k].v);
            return Array.isArray(v)
              ? v.length
              : v && typeof v === "object"
                ? Object.keys(v).length
                : 0;
          } catch (e) {
            return 0;
          }
        };
        const info = {
          ok: true,
          records: keys.length,
          exportedAt: b.exportedAt || null,
          current: Object.keys(db.items).filter(live).length,
          removed: Object.keys(db.items).filter(
            (k) => live(k) && !b.items[k] && KEEP.indexOf(k) < 0,
          ).length,
        };
        const workersIn = b.items["gm_admin_workers_v1"]
          ? (() => {
              try {
                return (
                  JSON.parse(b.items["gm_admin_workers_v1"].v).workers || []
                ).length;
              } catch (e) {
                return 0;
              }
            })()
          : 0;
        info.employees = workersIn;
        info.workersNow = (workerData().workers || []).length;
        if (preview) return send(res, 200, info);
        try {
          // 1. safety copy of what is there now
          const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
            name = "backups/before-import-" + stamp + ".json",
            snap = Buffer.from(JSON.stringify(db));
          if (CLOUD) await Files.put(name, snap, "application/json");
          else fs.writeFileSync(path.join(DATA, name), snap);
          // 2. replace the data (account list kept as it is now)
          const old = Object.keys(db.items);
          keys.forEach((k) => {
            if (KEEP.indexOf(k) < 0)
              setItem(k, b.items[k].v == null ? null : b.items[k].v);
          });
          old.forEach((k) => {
            if (!b.items[k] && KEEP.indexOf(k) < 0 && live(k)) setItem(k, null);
          });
          const acts = b.activity || {};
          Object.keys(db.activity).forEach((m) => {
            if (!acts[m]) {
              db.activity[m] = [];
              touch("_activity_" + m);
            }
          });
          Object.keys(acts).forEach((m) => {
            if (Array.isArray(acts[m])) {
              db.activity[m] = acts[m];
              touch("_activity_" + m);
            }
          });
          logEvents(s, [
            {
              type: "backup",
              text:
                "Backup imported (" +
                keys.length +
                " records" +
                (b.exportedAt
                  ? ", exported " + String(b.exportedAt).slice(0, 10)
                  : "") +
                "). Safety copy: " +
                name.slice(8),
            },
          ]);
          persist();
          await flushNow();
          info.safetyCopy = name.slice(8);
          send(res, 200, info);
        } catch (e) {
          console.error("Import failed:", e && e.message);
          send(res, 500, {
            error:
              "The import failed: " +
              (e && e.message ? e.message : "unknown error") +
              ". Your data was not changed unless the safety copy says otherwise.",
          });
        }
      },
      64 * 1024 * 1024,
    );
  }
  const m = /^\/api\/kv\/([^/]+)$/.exec(p);
  if (m) {
    let key;
    try {
      key = decodeURIComponent(m[1]);
    } catch (e) {
      return send(res, 400, { error: "bad key" });
    }
    if (!KEY_RE.test(key)) return send(res, 400, { error: "bad key" });
    if (
      !canWrite(s, key) ||
      (req.method === "DELETE" &&
        key === "gm_admin_v1" &&
        !adminMayManagePlans(s)) ||
      (req.method === "DELETE" &&
        key === "gm_admin_notifs_v1" &&
        s.role !== "admin")
    )
      return send(res, 403, { error: "Not allowed" });
    if (req.method === "PUT")
      return body(req, (err, b) => {
        if (err || !b || typeof b.v !== "string")
          return send(res, 400, { error: 'body must be {"v":"<string>"}' });
        if (b.v.length > MAX_VALUE)
          return send(res, 413, { error: "Too large" });
        if (!db.items[key] && Object.keys(db.items).length >= MAX_KEYS)
          return send(res, 507, { error: "Storage limit reached" });
        let val = b.v;
        if (key === "gm_admin_notifs_v1" && s.role !== "admin") {
          val = mergeNotifs(db.items[key] && db.items[key].v, val, s);
          if (val == null) return send(res, 400, { error: "bad list" });
        }
        // Stale-save protection: the page says which version it was based on. If someone else saved a newer one since, refuse (unless it is the very same data, e.g. a retry of a save that did go through).
        if (
          PROTECTED.has(key) &&
          Number.isFinite(b.base) &&
          db.items[key] &&
          db.items[key].rev > b.base
        ) {
          if (db.items[key].v === b.v)
            return send(res, 200, { ok: true, rev: db.items[key].rev });
          return send(res, 409, {
            error:
              "Someone else changed this data while you were editing. Reload the page and try again.",
            code: "stale",
            rev: db.items[key].rev,
          });
        }
        if (
          key === "gm_admin_v1" &&
          s.role === "admin" &&
          !adminMayManagePlans(s)
        ) {
          const current = jparse(db.items[key] && db.items[key].v),
            currentData =
              current && typeof current === "object" && !Array.isArray(current)
                ? current
                : {},
            next = jparse(val);
          if (!next || typeof next !== "object" || Array.isArray(next))
            return send(res, 400, { error: "Invalid customer data" });
          if (
            Object.prototype.hasOwnProperty.call(next, "plans") &&
            !util.isDeepStrictEqual(next.plans, currentData.plans) &&
            !isCustomerPlanHistory(next.plans, currentData.plans)
          )
            return send(res, 403, {
              error: "Delivery plans are not editable by this role",
            });
          if (Object.prototype.hasOwnProperty.call(currentData, "plans"))
            next.plans = currentData.plans;
          else delete next.plans;
          val = JSON.stringify(next);
        }
        if (key === "gm_admin_v1") {
          const bad = planConflict(db.items[key] && db.items[key].v, val);
          if (bad) return send(res, 409, { error: bad });
        }
        if (
          key === "gm_admin_wprofile_v1" &&
          s.role === "admin" &&
          !isSuper(acctOf(s))
        ) {
          const oldP = stored(key) || {},
            newP = jparse(val),
            isAdm = (o) =>
              String((o && o.role) || "").toLowerCase() === "admin";
          if (newP && typeof newP === "object")
            for (const eid of Object.keys(newP))
              if (isAdm(newP[eid]) && !isAdm(oldP[eid]))
                return send(res, 403, {
                  error: "Only the Super Admin can make someone an Admin.",
                });
        }
        if (key === "gm_admin_account_v1") {
          val = sanitizeAccounts(s, val);
          if (val == null) return send(res, 400, { error: "bad list" });
        }
        if (key.indexOf("gm_crm_data_v5__") === 0 && db.items[key])
          val = keepAttendance(db.items[key].v, val);
        val = cleanValue(key, val);
        const oldV = db.items[key] ? db.items[key].v : null;
        setItem(key, val);
        if (key === "gm_admin_notifs_v1" && s.role === "worker") {
          try {
            reconcileAttendance(s.id);
          } catch (e) {
            console.error("Attendance check skipped:", e && e.message);
          }
        }
        try {
          logEvents(
            s,
            activity.diff(key, oldV, val, b.v, {
              workerName: (id) => {
                const w = (workerData().workers || []).filter(
                  (x) => x && x.id === id,
                )[0];
                return w ? w.name : id;
              },
            }),
          );
        } catch (e) {
          console.error("Activity diff skipped:", e && e.message);
        }
        send(res, 200, { ok: true, rev: db.rev });
      });
    if (req.method === "DELETE") {
      setItem(key, null);
      return send(res, 200, { ok: true, rev: db.rev });
    }
  }
  // Pictures and documents. Files go to Files (this computer's folders, or the Supabase bucket).
  const fail = (e) => {
    console.error("File error:", e && e.message);
    if (!res.headersSent)
      send(res, 500, {
        error: "The file could not be saved or read. Try again.",
      });
  };
  const sendFile = (f, ext, cache) =>
    Files.get(f)
      .then((d) => {
        if (!d) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, {
          "Content-Type": ext === "jpg" ? "image/jpeg" : VMIME[ext],
          "Cache-Control": cache,
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        });
        res.end(d);
      })
      .catch(fail);
  const decode = (b, pdfOk) => {
    const m =
      b &&
      typeof b.data === "string" &&
      /^data:([a-z]+\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(b.data);
    return m && VEXT[m[1]] && (pdfOk || m[1] !== "application/pdf")
      ? { mime: m[1], buf: Buffer.from(m[2], "base64") }
      : null;
  };
  if (p === "/api/vfile") {
    const v = String(url.searchParams.get("v") || ""),
      k = String(url.searchParams.get("k") || "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(v) || VKINDS.indexOf(k) < 0)
      return send(res, 400, { error: "bad vehicle or file kind" });
    if (!workerFileOk(s, v, k, req.method))
      return send(res, 403, { error: "Not allowed" });
    if (req.method === "GET") {
      const f = vfind(v, k);
      if (!f) {
        res.writeHead(404);
        return res.end();
      }
      return sendFile(f.path, f.ext, "private, max-age=300");
    }
    if (req.method === "PUT")
      return body(
        req,
        (err, b) => {
          const d = !err && decode(b, true);
          if (!d)
            return send(res, 400, {
              error: "Send a JPG, PNG, WEBP or PDF file",
            });
          if (k === "photo" && d.mime === "application/pdf")
            return send(res, 400, {
              error: "The vehicle photo must be a picture",
            });
          if (d.buf.length > VMAX)
            return send(res, 400, { error: "File is larger than 5 MB" });
          const old = vfind(v, k),
            np = "v/" + v + "__" + k + "." + VEXT[d.mime];
          if (!old && Files.count() >= MAX_FILES)
            return send(res, 507, { error: "Storage limit reached" });
          Files.put(np, d.buf, d.mime)
            .then(() => (old && old.path !== np ? Files.del(old.path) : null))
            .then(() =>
              send(res, 200, {
                ok: true,
                size: d.buf.length,
                mime: d.mime,
                at: Date.now(),
              }),
            )
            .catch(fail);
        },
        8 * 1024 * 1024,
      );
    if (req.method === "DELETE") {
      const f = vfind(v, k);
      return Promise.resolve(f ? Files.del(f.path) : null)
        .then(() => send(res, 200, { ok: true }))
        .catch(fail);
    }
  }
  if (p === "/api/pfile") {
    const v = String(url.searchParams.get("p") || ""),
      k = String(url.searchParams.get("i") || "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(v) || !/^[0-5]$/.test(k))
      return send(res, 400, { error: "bad product or picture slot" });
    if (req.method !== "GET" && s.role !== "admin")
      return send(res, 403, { error: "Not allowed" });
    if (req.method === "GET") {
      const f = pfind(v, k);
      if (!f) {
        res.writeHead(404);
        return res.end();
      }
      return sendFile(f.path, f.ext, "private, max-age=300");
    }
    if (req.method === "PUT")
      return body(
        req,
        (err, b) => {
          const d = !err && decode(b, false);
          if (!d)
            return send(res, 400, { error: "Send a JPG, PNG or WEBP picture" });
          if (d.buf.length > VMAX)
            return send(res, 400, { error: "Picture is larger than 5 MB" });
          const old = pfind(v, k),
            np = "p/" + v + "__" + k + "." + VEXT[d.mime];
          if (!old && Files.count() >= MAX_FILES)
            return send(res, 507, { error: "Storage limit reached" });
          Files.put(np, d.buf, d.mime)
            .then(() => (old && old.path !== np ? Files.del(old.path) : null))
            .then(() =>
              send(res, 200, {
                ok: true,
                size: d.buf.length,
                mime: d.mime,
                at: Date.now(),
              }),
            )
            .catch(fail);
        },
        8 * 1024 * 1024,
      );
    if (req.method === "DELETE") {
      const f = pfind(v, k);
      return Promise.resolve(f ? Files.del(f.path) : null)
        .then(() => send(res, 200, { ok: true }))
        .catch(fail);
    }
  }
  if (p === "/api/photos" && req.method === "GET") {
    const out = {};
    Files.names("c/").forEach((n) => {
      if (/\.jpg$/i.test(n)) out[n.slice(2, -4)] = Math.floor(Files.meta(n).at);
    });
    return send(res, 200, { photos: out });
  }
  if (p === "/api/photo") {
    const code = String(url.searchParams.get("code") || "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 60);
    if (!code) return send(res, 400, { error: "bad code" });
    if (req.method !== "GET" && s.role !== "admin")
      return send(res, 403, { error: "Not allowed" });
    const fp = "c/" + code + ".jpg";
    if (req.method === "GET") {
      if (!Files.has(fp)) {
        res.writeHead(404);
        return res.end();
      }
      return sendFile(fp, "jpg", "private, max-age=31536000");
    }
    if (req.method === "PUT")
      return body(req, (err, b) => {
        const d = !err && decode(b, false);
        if (!d)
          return send(res, 400, { error: "send a JPG, PNG or WEBP picture" });
        if (d.buf.length > 3 * 1024 * 1024)
          return send(res, 400, { error: "picture is too large" });
        if (!Files.has(fp) && Files.count() >= MAX_FILES)
          return send(res, 507, { error: "Storage limit reached" });
        Files.put(fp, d.buf, d.mime)
          .then(() => send(res, 200, { ok: true, v: Date.now() }))
          .catch(fail);
      });
    if (req.method === "DELETE")
      return Promise.resolve(Files.has(fp) ? Files.del(fp) : null)
        .then(() => send(res, 200, { ok: true }))
        .catch(fail);
  }
  send(res, 404, { error: "not found" });
}

const ZIPPABLE = new Set([
    ".html",
    ".css",
    ".js",
    ".svg",
    ".webmanifest",
    ".ico",
  ]),
  ZC = new Map();
function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end();
  }
  let file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  const parts = path.relative(ROOT, file).split(path.sep);
  if (
    parts.some((s) => s.startsWith(".") || BLOCKED.includes(s.toLowerCase()))
  ) {
    res.writeHead(404);
    return res.end("Not found");
  }
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) file = path.join(file, "index.html");
    const ext = path.extname(file).toLowerCase();
    if (
      !MIME[ext] ||
      ["server.js", "storage.js", "activity.js"].includes(
        path.basename(file).toLowerCase(),
      )
    ) {
      // server code is never sent to a browser
      res.writeHead(404);
      return res.end("Not found");
    }
    const rp = path.relative(ROOT, file).split(path.sep);
    if (rp[0] === "admin" && ext === ".html") {
      // admin pages: only for a signed-in admin whose role allows that page
      const g = pageGate(req, rp[rp.length - 1]);
      if (g && g.redirect) {
        res.writeHead(302, {
          Location: g.redirect,
          "Cache-Control": "no-store",
        });
        return res.end();
      }
      if (g && g.denied) {
        res.writeHead(403, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(DENIED_HTML);
      }
    }
    if (rp[0] === "sales" && ext === ".html") {
      // Sales pages: only for a signed-in Sales person
      const ss = getSession(req);
      if (!ss || ss.role !== "sales") {
        res.writeHead(302, {
          Location: "/login.html",
          "Cache-Control": "no-store",
        });
        return res.end();
      }
    }
    fs.stat(file, (e2, st2) => {
      if (e2 || !st2.isFile()) {
        res.writeHead(404);
        return res.end("Not found");
      }
      // "no-cache" means: ask the server every time, but the answer is a tiny "not modified" while the file is unchanged. A new deploy changes the tag, so updates still show at once.
      const tag =
        'W/"' +
        st2.size.toString(36) +
        "-" +
        Math.floor(st2.mtimeMs).toString(36) +
        '"';
      const hdr = {
        "Content-Type": MIME[ext],
        "Cache-Control": "no-cache",
        ETag: tag,
        Vary: "Accept-Encoding",
      };
      const inm = String(req.headers["if-none-match"] || "")
        .split(",")
        .map((x) => x.trim());
      if (inm.indexOf(tag) > -1) {
        res.writeHead(304, hdr);
        return res.end();
      }
      const ae = String(req.headers["accept-encoding"] || ""),
        enc =
          !ZIPPABLE.has(ext) || st2.size < 600
            ? ""
            : /\bbr\b/.test(ae)
              ? "br"
              : /\bgzip\b/.test(ae)
                ? "gzip"
                : ""; // tiny files are sent as they are, so the cache key always matches what is stored
      const ck = file + "|" + enc,
        hit = ZC.get(ck);
      if (hit && hit.tag === tag) {
        if (enc) hdr["Content-Encoding"] = enc;
        hdr["Content-Length"] = hit.buf.length;
        res.writeHead(200, hdr);
        return res.end(hit.buf);
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end("Not found");
        }
        const done = (buf, used) => {
          if (used) hdr["Content-Encoding"] = used;
          if (ZIPPABLE.has(ext)) {
            if (ZC.size > 300) ZC.clear();
            ZC.set(file + "|" + (used || ""), { tag, buf });
          } // stored under the encoding that was REALLY used
          hdr["Content-Length"] = buf.length;
          res.writeHead(200, hdr);
          res.end(buf);
        };
        if (!enc || data.length < 600) return done(data, "");
        const cb = (er, z) => (er ? done(data, "") : done(z, enc));
        if (enc === "br")
          zlib.brotliCompress(
            data,
            {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
              },
            },
            cb,
          );
        else zlib.gzip(data, { level: 6 }, cb);
      });
    });
  });
}

// Shared delivery marks are only needed for the day; older ones are dropped so they never pile up.
function pruneCrew() {
  try {
    const floor = new Date(Date.now() + 5.5 * 3600e3 - 3 * 86400000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    Object.keys(db.items).forEach((k) => {
      const m = /^gm_crew_(\d{8})_/.exec(k);
      if (m && m[1] < floor) {
        delete db.items[k];
        if (CLOUD)
          storage.kv.save([{ key: k, v: null, rev: db.rev }]).catch(() => {});
      }
    });
  } catch (e) {
    console.error("Crew cleanup skipped:", e && e.message);
  }
}
let SETUP_NOTICE = [];
// "node server.js --migrate": copies this computer's data (records, logins, photos, documents) up to Supabase, once.
async function migrateToCloud() {
  if (!CLOUD) {
    console.log(
      "Set SUPABASE_URL and SUPABASE_SERVICE_KEY first (see SUPABASE-SETUP.md).",
    );
    return;
  }
  readLocalDb();
  try {
    auth = JSON.parse(fs.readFileSync(AUTHF, "utf8"));
  } catch (e) {}
  if (!auth.admins) auth.admins = {};
  if (!auth.workers) auth.workers = {};
  SETUP_NOTICE = migrateAuth();
  const rows = Object.keys(db.items).map((k) => ({
    key: k,
    v: db.items[k].v,
    rev: db.items[k].rev,
  }));
  rows.push({ key: "_auth", v: JSON.stringify(auth), rev: 0 });
  Object.keys(db.activity || {}).forEach((m) =>
    rows.push({
      key: "_activity_" + m,
      v: JSON.stringify(db.activity[m]),
      rev: 0,
    }),
  );
  await storage.kv.save(rows);
  console.log(
    "Saved " +
      (rows.length - 1) +
      " records and the login accounts to Supabase.",
  );
  const list = storage.files.localScan();
  let n = 0;
  for (const it of list) {
    await Files.put(it.p, fs.readFileSync(it.file), Files.mimeOf(it.p));
    n++;
  }
  console.log("Uploaded " + n + " pictures and documents to Supabase.");
  SETUP_NOTICE.forEach((l) => console.log(l));
  console.log("Done. Your data is now in Supabase.");
}

async function boot() {
  if (process.argv.includes("--migrate")) {
    await migrateToCloud();
    process.exit(0);
  }
  await loadDb();
  await Files.init();
  if (process.argv.includes("--reset-admin")) {
    migrateAuth();
    resetAdmin();
    await flushNow();
    process.exit(0);
  }
  SETUP_NOTICE = migrateAuth();
  moveStaffToEmployees();
  try {
    reconcileAttendance();
  } catch (e) {
    console.error("Attendance check skipped:", e && e.message);
  }
  pruneCrew();
  setInterval(pruneCrew, 6 * 3600e3).unref();
  if (CLOUD) {
    await flushNow();
    setInterval(() => storage.kv.ping().catch(() => {}), 12 * 3600e3).unref();
  } // a small daily request keeps the free Supabase project from pausing

  http
    .createServer((req, res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      if (isHttps(req))
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      let url;
      try {
        url = new URL(req.url, "http://x");
      } catch (e) {
        res.writeHead(400);
        return res.end();
      }
      if (url.pathname.startsWith("/api/")) {
        try {
          return api(req, res, url);
        } catch (e) {
          console.error("Request error:", e && e.message);
          if (!res.headersSent) send(res, 500, { error: "Server error" });
          return;
        }
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        return res.end();
      }
      serveStatic(req, res, url);
    })
    .listen(PORT, "0.0.0.0", () => {
      console.log(
        "\nGeneral Traders backend running  (" +
          (CLOUD ? "data in Supabase" : "data on this computer") +
          ")",
      );
      console.log("  This computer :  http://localhost:" + PORT + "/");
      const ifs = os.networkInterfaces();
      Object.keys(ifs).forEach((n) =>
        ifs[n].forEach((a) => {
          if (a.family === "IPv4" && !a.internal)
            console.log(
              "  Phones on WiFi:  http://" + a.address + ":" + PORT + "/",
            );
        }),
      );
      console.log(
        "  Data          :  " +
          (CLOUD ? "Supabase" : DB) +
          "\n  Stop with Ctrl+C\n",
      );
      if (SETUP_NOTICE.length) {
        console.log("  ==== FIRST-TIME SECURITY SETUP ====");
        SETUP_NOTICE.forEach((l) => console.log(l));
        console.log(
          "  Sign in with it, then choose your own password. This is shown only once.\n  If you lose it, stop the server and run:  node server.js --reset-admin\n",
        );
      }
    });
}
boot().catch((e) => {
  console.error("Could not start: " + e.message);
  process.exit(1);
});