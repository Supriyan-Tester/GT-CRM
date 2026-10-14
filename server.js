const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), zlib = require('zlib');
const ROOT = __dirname, DATA = path.join(ROOT, 'data'), DB = path.join(DATA, 'db.json');
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_BODY = 5 * 1024 * 1024;

// Where data lives: this computer's data folder (default), or Supabase when these two settings exist (used on Render).
const storage = require('./storage')({ DATA, URL: process.env.SUPABASE_URL, KEY: process.env.SUPABASE_SERVICE_KEY, BUCKET: process.env.SUPABASE_BUCKET });
const CLOUD = storage.cloud, Files = storage.files;
if (!CLOUD) fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true });
const VKINDS = ['photo', 'rc', 'insurance', 'permit', 'fitness', 'other', 'aadhaar', 'license', 'addrproof', 'idother'];   // vehicle kinds + worker document kinds (worker id is used as the key)
const VEXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const VMIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
const VMAX = 5 * 1024 * 1024;
function pfind(p, i) { for (const e of ['jpg', 'png', 'webp']) { const f = 'p/' + p + '__' + i + '.' + e; if (Files.has(f)) return { path: f, ext: e }; } return null; }
function vfind(v, k) { for (const e of Object.keys(VMIME)) { const f = 'v/' + v + '__' + k + '.' + e; if (Files.has(f)) return { path: f, ext: e }; } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let db = { rev: 0, items: {} };
function readLocalDb() {
  try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) { if (fs.existsSync(DB)) { fs.copyFileSync(DB, DB + '.corrupt-' + Date.now()); console.log('db.json was unreadable, copy kept. Starting empty.'); } }
  if (!db.items) db.items = {}; if (!db.rev) db.rev = 0;
}
// Loads saved data at start-up (from the data folder, or from Supabase).
async function loadDb() {
  if (!CLOUD) return readLocalDb();
  const rows = await storage.kv.loadAll();
  rows.forEach(r => {
    if (r.key === '_auth') { try { auth = JSON.parse(r.v); if (!auth.admins) auth.admins = {}; if (!auth.workers) auth.workers = {}; } catch (e) {} }
    else if (r.key === '_sessions') { try { sessions = JSON.parse(r.v) || {}; } catch (e) {} }
    else { db.items[r.key] = { v: r.v, rev: Number(r.rev) || 0 }; db.rev = Math.max(db.rev, Number(r.rev) || 0); }
  });
}

let timer = null, flushing = false, lastBackup = '';
const dirty = new Set();
function persist() { clearTimeout(timer); timer = setTimeout(flush, 200); }
function touch(key) { dirty.add(key); }
function setItem(key, v) { db.items[key] = { v, rev: ++db.rev }; touch(key); persist(); }
async function cloudBackup() {
  const day = new Date().toISOString().slice(0, 10); if (lastBackup === day) return;
  await Files.put('backups/db-' + day + '.json', Buffer.from(JSON.stringify(db)), 'application/json'); lastBackup = day;
  const old = Files.names('backups/').sort(); while (old.length > 14) await Files.del(old.shift());
}
async function flush() {
  if (!CLOUD) {
    try {
      const tmp = DB + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB);
      const bk = path.join(DATA, 'backups', 'db-' + new Date().toISOString().slice(0, 10) + '.json');
      if (!fs.existsSync(bk)) fs.copyFileSync(DB, bk);
    } catch (e) { console.error('Save failed:', e.message); }
    return;
  }
  if (flushing) { persist(); return; }
  if (!dirty.size) return;
  flushing = true; const keys = Array.from(dirty); dirty.clear();
  try {
    await storage.kv.save(keys.map(k => k === '_auth' ? { key: k, v: JSON.stringify(auth), rev: 0 } : k === '_sessions' ? { key: k, v: JSON.stringify(sessions), rev: 0 } : { key: k, v: db.items[k] ? db.items[k].v : null, rev: db.items[k] ? db.items[k].rev : 0 }));
    try { await cloudBackup(); } catch (e) { console.error('Daily backup failed:', e.message); }
  } catch (e) { console.error('Save to Supabase failed, will retry:', e.message); keys.forEach(k => dirty.add(k)); setTimeout(persist, 5000); }
  finally { flushing = false; }
}
async function flushNow() { clearTimeout(timer); for (let i = 0; flushing && i < 100; i++) await sleep(50); await flush(); }
process.on('SIGINT', () => { flushNow().then(() => process.exit(0)); });
process.on('SIGTERM', () => { flushNow().then(() => process.exit(0)); });

/* ================= SECURITY: accounts, sessions, permissions ================= */
// Passwords are kept only here, as scrypt hashes (data/auth.json). They are never stored in db.json or sent to a browser.
const AUTHF = path.join(DATA, 'auth.json'), SESSF = path.join(DATA, 'sessions.json');
const MAX_VALUE = 3 * 1024 * 1024, MAX_KEYS = 3000, MAX_FILES = 6000;
let auth = { admins: {}, workers: {} };
if (!CLOUD) { try { auth = JSON.parse(fs.readFileSync(AUTHF, 'utf8')); } catch (e) {} }
if (!auth.admins) auth.admins = {}; if (!auth.workers) auth.workers = {};
function saveAuth() { if (CLOUD) { touch('_auth'); persist(); return; } try { const t = AUTHF + '.tmp'; fs.writeFileSync(t, JSON.stringify(auth), { mode: 0o600 }); fs.renameSync(t, AUTHF); } catch (e) { console.error('Could not save auth.json:', e.message); } }
function hashPw(pw) { const salt = crypto.randomBytes(16); return 's1$' + salt.toString('hex') + '$' + crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
const DUMMY = hashPw('not-a-real-password');
function checkPw(pw, stored) {
  const parts = String(stored || DUMMY).split('$'); if (parts.length !== 3) return false;
  const want = Buffer.from(parts[2], 'hex'), got = crypto.scryptSync(String(pw), Buffer.from(parts[1], 'hex'), want.length);
  return crypto.timingSafeEqual(want, got) && !!stored;
}
function tempPassword() { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o = ''; const r = crypto.randomBytes(10); for (let i = 0; i < 10; i++) o += c[r[i] % c.length]; return o; }
function clientIp(req) {
  if (process.env.TRUST_PROXY === '1' || process.env.RENDER) { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(t => t.trim()).filter(Boolean); if (x.length) return x[x.length - 1]; }
  return req.socket.remoteAddress || '?';
}
function localDate() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function jparse(raw) { try { return JSON.parse(raw); } catch (e) { return null; } }
function stored(key) { const it = db.items[key]; return it && it.v != null ? jparse(it.v) : null; }

const DEFAULT_ADMIN = { id: 'A1', phone: '8489600833', name: 'Bala', role: 'Admin' };
function adminList() {
  let a = stored('gm_admin_account_v1');
  if (Array.isArray(a) && a.length && a[0].phone) return a;
  const w = stored('gm_admin_workers_v1');
  if (w && Array.isArray(w.admins) && w.admins.length && w.admins[0].phone) return w.admins;
  return [DEFAULT_ADMIN];
}
function workerData() { const w = stored('gm_admin_workers_v1'); return (w && typeof w === 'object') ? w : { workers: [], leaves: [] }; }

// Moves any plain-text passwords found in a saved value into auth.json and removes them from the value.
// Returns the cleaned JSON string. A password field left empty means "keep the existing password".
function cleanValue(key, raw) {
  if (typeof raw !== 'string') return raw;
  if (key === 'gm_admin_account_v1') {
    const L = jparse(raw); if (!Array.isArray(L)) return raw;
    L.forEach(a => { if (!a || typeof a !== 'object') return; if (a.id && a.password) { auth.admins[a.id] = { h: hashPw(a.password), must: false }; saveAuth(); } delete a.password; delete a.pin; });
    return JSON.stringify(L);
  }
  if (key === 'gm_admin_workers_v1') {
    const d = jparse(raw); if (!d || typeof d !== 'object') return raw;
    if (Array.isArray(d.admins)) { d.admins.forEach(a => { if (a && a.id && a.password && !auth.admins[a.id]) { auth.admins[a.id] = { h: hashPw(a.password), must: false }; saveAuth(); } }); delete d.admins; }
    if (Array.isArray(d.workers)) d.workers.forEach(w => { if (!w || typeof w !== 'object') return; const pw = w.password || w.pin; if (w.id && pw) { auth.workers[w.id] = { h: hashPw(pw) }; saveAuth(); } delete w.password; delete w.pin; });
    return JSON.stringify(d);
  }
  if (key === 'gm_crm_data_v5' || key.indexOf('gm_crm_data_v5__') === 0) {
    const d = jparse(raw); if (!d || typeof d !== 'object') return raw;
    if (d.worker && typeof d.worker === 'object') { delete d.worker.password; delete d.worker.pin; }
    return JSON.stringify(d);
  }
  return raw;
}

// First start / upgrade: hash existing passwords, replace the default admin password with a one-time password, scrub db.json.
function migrateAuth() {
  let changed = false, notice = [];
  const list = adminList();
  const workers = stored('gm_admin_workers_v1');
  const old = (workers && Array.isArray(workers.admins)) ? workers.admins : [];
  list.forEach(a => {
    if (!a || !a.id) return;
    if (!auth.admins[a.id]) {
      const o = old.filter(x => x && x.id === a.id)[0] || {};
      const pw = a.password || o.password;
      if (!pw || pw === 'admin123') { const t = tempPassword(); auth.admins[a.id] = { h: hashPw(t), must: true }; notice.push('  Admin ' + a.phone + '  temporary password:  ' + t); }
      else auth.admins[a.id] = { h: hashPw(pw), must: false };
      changed = true;
    }
  });
  if (changed) saveAuth();
  ['gm_admin_account_v1', 'gm_admin_workers_v1'].forEach(k => {
    if (k === 'gm_admin_account_v1' && !(db.items[k] && db.items[k].v)) { setItem(k, JSON.stringify(list.map(a => ({ id: a.id, phone: a.phone, name: a.name, role: a.role || 'Admin' })))); return; }
    if (db.items[k] && typeof db.items[k].v === 'string') { const c = cleanValue(k, db.items[k].v); if (c !== db.items[k].v) setItem(k, c); }
  });
  Object.keys(db.items).forEach(k => { if ((k === 'gm_crm_data_v5' || k.indexOf('gm_crm_data_v5__') === 0) && db.items[k] && typeof db.items[k].v === 'string') { const c = cleanValue(k, db.items[k].v); if (c !== db.items[k].v) setItem(k, c); } });
  persist();
  return notice;
}
function resetAdmin() {
  const list = adminList(), a = list[0], t = tempPassword();
  auth.admins[a.id] = { h: hashPw(t), must: true }; saveAuth();
  Object.keys(sessions).forEach(h => { if (sessions[h].role === 'admin') delete sessions[h]; }); saveSessions();
  console.log('\n  Admin ' + a.phone + ' new temporary password:  ' + t + '\n  You must choose your own password when you sign in.\n');
}

// ---- sessions (cookie "gm_sid", HttpOnly; only a hash of the token is stored) ----
let sessions = {};
if (!CLOUD) { try { sessions = JSON.parse(fs.readFileSync(SESSF, 'utf8')); } catch (e) {} }
let sessTimer = null;
function saveSessions() { if (CLOUD) { touch('_sessions'); persist(); return; } clearTimeout(sessTimer); sessTimer = setTimeout(() => { try { const t = SESSF + '.tmp'; fs.writeFileSync(t, JSON.stringify(sessions), { mode: 0o600 }); fs.renameSync(t, SESSF); } catch (e) {} }, 500); }
const TTL = { admin: 12 * 3600e3, worker: 30 * 86400e3 };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function cookieToken(req) { const m = /(?:^|;\s*)gm_sid=([A-Za-z0-9_-]{20,80})/.exec(req.headers.cookie || ''); return m ? m[1] : null; }
function getSession(req) {
  const t = cookieToken(req); if (!t) return null;
  const h = sha(t), s = sessions[h]; if (!s) return null;
  const now = Date.now(); if (s.exp < now) { delete sessions[h]; saveSessions(); return null; }
  if (s.exp - now < TTL[s.role] - 10 * 60e3) { s.exp = now + TTL[s.role]; saveSessions(); }
  return Object.assign({ hash: h }, s);
}
function isHttps(req) { return !!(req.socket && req.socket.encrypted) || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'; }
function setCookie(res, req, token, maxAgeSec) {
  res.setHeader('Set-Cookie', 'gm_sid=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSec + (isHttps(req) ? '; Secure' : ''));
}
function startSession(res, req, role, id) {
  const token = crypto.randomBytes(32).toString('base64url');
  Object.keys(sessions).forEach(h => { if (sessions[h].exp < Date.now()) delete sessions[h]; });
  sessions[sha(token)] = { role, id, exp: Date.now() + TTL[role] }; saveSessions();
  setCookie(res, req, token, Math.floor(TTL[role] / 1000));
}

// ---- limit password guessing ----
const fails = {};
function lockLeft(k) { const f = fails[k]; return (f && f.until > Date.now()) ? Math.ceil((f.until - Date.now()) / 60000) : 0; }
function noteFail(k, max) { let f = fails[k]; if (!f || (f.until && f.until <= Date.now())) f = fails[k] = { n: 0, until: 0 }; f.t = Date.now(); if (++f.n >= max) { f.until = Date.now() + 15 * 60e3; f.n = 0; } }
setInterval(() => { const n = Date.now(); Object.keys(fails).forEach(k => { if ((fails[k].until || 0) < n && n - (fails[k].t || 0) > 15 * 60e3) delete fails[k]; }); }, 600e3).unref();

// ---- who may read / write which saved value ----
const W_READ = new Set(['gm_admin_v1', 'gm_admin_workers_v1', 'gm_admin_wprofile_v1', 'gm_depot_v1', 'gm_pintasks_v1']);
function canRead(s, key) {
  if (s.role === 'admin') return true;
  return W_READ.has(key) || key === 'gm_pins_v1' || key.indexOf('gm_pins_v1_') === 0 || key === 'gm_crm_data_v5__' + s.id || key === 'gm_wself_' + s.id;
}
function canWrite(s, key) {
  if (s.role === 'admin') return true;
  return key === 'gm_crm_data_v5__' + s.id || key === 'gm_pins_v1_' + s.id || key === 'gm_wself_' + s.id || key === 'gm_admin_notifs_v1';
}
// What a signed-in employee is allowed to see inside a value: only their own plan, own profile, own pin tasks.
function viewFor(s, key, raw) {
  if (s.role === 'admin' || raw == null) return raw;
  const d = jparse(raw); if (!d || typeof d !== 'object') return raw;
  if (key === 'gm_admin_v1') {
    const out = {}; Object.keys(d).forEach(k => { if (k !== 'plans') out[k] = d[k]; });
    out.plans = {};
    Object.keys(d.plans || {}).forEach(dt => {
      const raw2 = d.plans[dt], arr = Array.isArray(raw2) ? raw2 : (raw2 ? [raw2] : []);
      const mine = arr.filter(p => p && typeof p === 'object' && (p.workerId === s.id || (p.history || []).some(h => h && Array.isArray(h.notify) && h.notify.indexOf(s.id) > -1)));
      if (mine.length) out.plans[dt] = Array.isArray(raw2) ? mine : mine[0];
    });
    return JSON.stringify(out);
  }
  if (key === 'gm_admin_workers_v1') return JSON.stringify({ workers: (d.workers || []).filter(w => w && w.id === s.id).map(w => ({ id: w.id, name: w.name, phone: w.phone, emergency: w.emergency, active: w.active, created: w.created })), leaves: (d.leaves || []).filter(l => l && l.workerId === s.id) });
  if (key === 'gm_admin_wprofile_v1') { const o = {}; if (d[s.id]) o[s.id] = d[s.id]; return JSON.stringify(o); }
  if (key === 'gm_pintasks_v1') { const o = Object.assign({}, d, { tasks: {} }); Object.keys(d.tasks || {}).forEach(c => { { const t = d.tasks[c]; if (!t) return; const to = (t.to == null || t.to === '') ? ['all'] : [].concat(t.to); if (to.indexOf('all') > -1 || to.indexOf(s.id) > -1) o.tasks[c] = t; } }); return JSON.stringify(o); }
  return raw;
}
// Employees can only ADD notifications for the admin; they cannot change or delete the admin's list.
function mergeNotifs(oldRaw, newRaw, s) {
  const old = jparse(oldRaw), inc = jparse(newRaw); if (!Array.isArray(inc)) return null;
  const base = Array.isArray(old) ? old : [], have = new Set(base.map(n => n && n.id));
  const add = inc.filter(n => n && typeof n === 'object' && typeof n.id === 'string' && !have.has(n.id)).slice(0, 10).map(n => ({ id: String(n.id).slice(0, 60), ts: Number(n.ts) || Date.now(), date: String(n.date || '').slice(0, 10), type: String(n.type || '').slice(0, 30), title: String(n.title || '').slice(0, 200), text: String(n.text || '').slice(0, 600), worker: String(n.worker || '').slice(0, 80), read: false }));
  return JSON.stringify(add.concat(base).slice(0, 300));
}
function workerFileOk(s, v, k, method) {   // photos and documents saved under a worker id or a vehicle id
  if (s.role === 'admin') return true;
  if (v === s.id) return method === 'GET' || k === 'photo';
  return method === 'GET' && k === 'photo';   // vehicle photos / other employees' profile photos
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const BLOCKED = ['data', 'node_modules', 'backup-before-backend', 'test files'];
const KEY_RE = /^gm_[A-Za-z0-9_\-]{1,80}$/;

function send(res, code, obj, hdr) {
  const b = JSON.stringify(obj), h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, hdr || {});
  const ae = res.req ? String(res.req.headers['accept-encoding'] || '') : '';
  if (b.length > 1024 && /\bgzip\b/.test(ae)) {   // big answers (the full data load) go out compressed: about 5 to 10 times smaller
    return zlib.gzip(b, { level: 5 }, (e, z) => {
      if (e) { res.writeHead(code, h); return res.end(b); }
      h['Content-Encoding'] = 'gzip'; h['Vary'] = 'Accept-Encoding'; res.writeHead(code, h); res.end(z);
    });
  }
  res.writeHead(code, h); res.end(b);
}
function body(req, cb, limit) {
  let n = 0; const parts = [], max = limit || MAX_BODY;
  req.on('data', c => { n += c.length; if (n > max) { req.destroy(); } else parts.push(c); });
  req.on('end', () => { try { cb(null, JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch (e) { cb(e); } });
}

// Daily plan rules, enforced here as well as in the browser:
// on one date a worker, a vehicle and an invoice can each be in only one active (not cancelled) plan.
// Only conflicts that a save INTRODUCES are rejected, so data that was already inconsistent never blocks saving.
function planConflicts(raw) {
  const out = new Set();
  let S; try { S = JSON.parse(raw); } catch (e) { return out; }
  const plans = S && S.plans; if (!plans || typeof plans !== 'object') return out;
  const floor = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);   // old history is not re-checked
  for (const d of Object.keys(plans)) {
    if (d < floor) continue;
    const list = (Array.isArray(plans[d]) ? plans[d] : [plans[d]]).filter(p => p && typeof p === 'object' && p.status !== 'cancelled');
    const w = {}, v = {}, inv = {};
    for (const p of list) {
      if (p.workerId) { if (w[p.workerId]) out.add(d + '|worker|' + p.workerId + '|' + (p.worker || p.workerId)); w[p.workerId] = 1; }
      if (p.vehicleId) { if (v[p.vehicleId]) out.add(d + '|vehicle|' + p.vehicleId + '|' + (p.vehicle || p.vehicleId)); v[p.vehicleId] = 1; }
      for (const s of (Array.isArray(p.stops) ? p.stops : [])) {
        if (!s || !s.inv) continue;
        if (inv[s.inv]) out.add(d + '|invoice|' + s.inv + '|' + s.inv); inv[s.inv] = 1;
      }
    }
  }
  return out;
}
function planConflict(oldRaw, newRaw) {
  const before = oldRaw ? planConflicts(oldRaw) : new Set();
  for (const c of planConflicts(newRaw)) {
    if (before.has(c)) continue;
    const [d, kind, , label] = c.split('|');
    return kind === 'invoice' ? 'Invoice ' + label + ' is already in another plan on ' + d + '.'
      : (kind === 'worker' ? 'Employee ' : 'Vehicle ') + label + ' already has a plan on ' + d + '.';
  }
  return '';
}

function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health') return send(res, 200, { ok: true });
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {   // another website cannot make the browser act for the user
    let okOrigin = false; try { okOrigin = new URL(req.headers.origin).host === req.headers.host; } catch (e) {}
    if (!okOrigin) return send(res, 403, { error: 'bad origin' });
  }

  if (p === '/api/login' && req.method === 'POST') return body(req, (err, b) => {
    if (err || !b || typeof b.phone !== 'string' || typeof b.password !== 'string') return send(res, 400, { error: 'Enter your mobile number and password.' });
    const ip = clientIp(req), phone = b.phone.replace(/\D/g, '').slice(-10), pw = b.password.slice(0, 200);
    const kp = 'p:' + phone, ki = 'i:' + ip, lk = Math.max(lockLeft(kp), lockLeft(ki));
    if (lk) return send(res, 429, { error: 'Too many wrong attempts. Try again in ' + lk + ' minute' + (lk > 1 ? 's' : '') + '.' });
    const a = adminList().filter(x => x && x.phone === phone)[0];
    const wk = a ? null : (workerData().workers || []).filter(x => x && x.phone === phone)[0];
    const hash = a ? (auth.admins[a.id] || {}).h : (wk ? (auth.workers[wk.id] || {}).h : null);
    const good = checkPw(pw, hash) && !!(a || wk);
    if (!good) { noteFail(kp, 5); noteFail(ki, 25); return send(res, 401, { error: 'Incorrect mobile number or password.' }); }
    delete fails[kp];
    if (a) { startSession(res, req, 'admin', a.id); return send(res, 200, { ok: true, role: 'admin', id: a.id, name: a.name, adminRole: a.role || 'Admin', must: !!auth.admins[a.id].must }); }
    if (!wk.active) return send(res, 403, { code: 'inactive', error: 'This account is inactive. Contact Fleet Admin.' });
    const t = localDate();
    if ((workerData().leaves || []).some(l => l && l.workerId === wk.id && l.from <= t && t <= l.to)) return send(res, 403, { code: 'leave', error: 'On leave today.' });
    startSession(res, req, 'worker', wk.id);
    send(res, 200, { ok: true, role: 'worker', id: wk.id, name: wk.name, phone: wk.phone, emergency: wk.emergency || '' });
  }, 4096);

  const s = getSession(req);
  if (p === '/api/logout' && req.method === 'POST') { if (s) { delete sessions[s.hash]; saveSessions(); } setCookie(res, req, '', 0); return send(res, 200, { ok: true }); }
  if (!s) return send(res, 401, { error: 'Please sign in.' });
  const mustChange = s.role === 'admin' && auth.admins[s.id] && auth.admins[s.id].must;
  if (p === '/api/me') return send(res, 200, { ok: true, role: s.role, id: s.id, must: !!mustChange });
  if (p === '/api/change-password' && req.method === 'POST') return body(req, (err, b) => {
    if (err || !b || typeof b.current !== 'string' || typeof b.next !== 'string') return send(res, 400, { error: 'Enter your current and new password.' });
    const rec = (s.role === 'admin' ? auth.admins : auth.workers)[s.id], k = 'c:' + s.role + s.id;
    if (lockLeft(k)) return send(res, 429, { error: 'Too many wrong attempts. Try again later.' });
    if (!rec || !checkPw(b.current, rec.h)) { noteFail(k, 5); return send(res, 400, { error: 'The current password is not correct.' }); }
    if (b.next.length < 8) return send(res, 400, { error: 'The new password must be at least 8 characters.' });
    if (b.next === b.current) return send(res, 400, { error: 'Choose a password different from the current one.' });
    (s.role === 'admin' ? auth.admins : auth.workers)[s.id] = { h: hashPw(b.next), must: false }; saveAuth();
    Object.keys(sessions).forEach(h => { if (sessions[h].role === s.role && sessions[h].id === s.id && h !== s.hash) delete sessions[h]; }); saveSessions();
    send(res, 200, { ok: true });
  }, 4096);
  if (mustChange) return send(res, 403, { error: 'Choose a new password first.', must: true });

  if (p === '/api/state' && req.method === 'GET') {
    const since = parseInt(url.searchParams.get('since'), 10) || 0, out = {};
    for (const k in db.items) if (db.items[k].rev > since && canRead(s, k)) out[k] = { v: viewFor(s, k, db.items[k].v), rev: db.items[k].rev };
    return send(res, 200, { rev: db.rev, items: out });   // always fresh (never cached); only compressed
  }
  if (p === '/api/export' && req.method === 'GET') {
    if (s.role !== 'admin') return send(res, 403, { error: 'Admin only' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="gm-crm-export.json"' });
    return res.end(JSON.stringify(db, null, 2));
  }
  const m = /^\/api\/kv\/([^/]+)$/.exec(p);
  if (m) {
    let key; try { key = decodeURIComponent(m[1]); } catch (e) { return send(res, 400, { error: 'bad key' }); }
    if (!KEY_RE.test(key)) return send(res, 400, { error: 'bad key' });
    if (!canWrite(s, key) || (req.method === 'DELETE' && key === 'gm_admin_notifs_v1' && s.role !== 'admin')) return send(res, 403, { error: 'Not allowed' });
    if (req.method === 'PUT') return body(req, (err, b) => {
      if (err || !b || typeof b.v !== 'string') return send(res, 400, { error: 'body must be {"v":"<string>"}' });
      if (b.v.length > MAX_VALUE) return send(res, 413, { error: 'Too large' });
      if (!db.items[key] && Object.keys(db.items).length >= MAX_KEYS) return send(res, 507, { error: 'Storage limit reached' });
      let val = b.v;
      if (key === 'gm_admin_notifs_v1' && s.role !== 'admin') { val = mergeNotifs(db.items[key] && db.items[key].v, val, s); if (val == null) return send(res, 400, { error: 'bad list' }); }
      if (key === 'gm_admin_v1') {
        const bad = planConflict(db.items[key] && db.items[key].v, val);
        if (bad) return send(res, 409, { error: bad });
      }
      val = cleanValue(key, val);
      setItem(key, val); send(res, 200, { ok: true, rev: db.rev });
    });
    if (req.method === 'DELETE') { setItem(key, null); return send(res, 200, { ok: true, rev: db.rev }); }
  }
  // Pictures and documents. Files go to Files (this computer's folders, or the Supabase bucket).
  const fail = e => { console.error('File error:', e && e.message); if (!res.headersSent) send(res, 500, { error: 'The file could not be saved or read. Try again.' }); };
  const sendFile = (f, ext, cache) => Files.get(f).then(d => {
    if (!d) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': ext === 'jpg' ? 'image/jpeg' : VMIME[ext], 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }); res.end(d);
  }).catch(fail);
  const decode = (b, pdfOk) => {
    const m = b && typeof b.data === 'string' && /^data:([a-z]+\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(b.data);
    return (m && VEXT[m[1]] && (pdfOk || m[1] !== 'application/pdf')) ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
  };
  if (p === '/api/vfile') {
    const v = String(url.searchParams.get('v') || ''), k = String(url.searchParams.get('k') || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(v) || VKINDS.indexOf(k) < 0) return send(res, 400, { error: 'bad vehicle or file kind' });
    if (!workerFileOk(s, v, k, req.method)) return send(res, 403, { error: 'Not allowed' });
    if (req.method === 'GET') { const f = vfind(v, k); if (!f) { res.writeHead(404); return res.end(); } return sendFile(f.path, f.ext, 'private, max-age=300'); }
    if (req.method === 'PUT') return body(req, (err, b) => {
      const d = !err && decode(b, true);
      if (!d) return send(res, 400, { error: 'Send a JPG, PNG, WEBP or PDF file' });
      if (k === 'photo' && d.mime === 'application/pdf') return send(res, 400, { error: 'The vehicle photo must be a picture' });
      if (d.buf.length > VMAX) return send(res, 400, { error: 'File is larger than 5 MB' });
      const old = vfind(v, k), np = 'v/' + v + '__' + k + '.' + VEXT[d.mime];
      if (!old && Files.count() >= MAX_FILES) return send(res, 507, { error: 'Storage limit reached' });
      Files.put(np, d.buf, d.mime).then(() => old && old.path !== np ? Files.del(old.path) : null).then(() => send(res, 200, { ok: true, size: d.buf.length, mime: d.mime, at: Date.now() })).catch(fail);
    }, 8 * 1024 * 1024);
    if (req.method === 'DELETE') { const f = vfind(v, k); return Promise.resolve(f ? Files.del(f.path) : null).then(() => send(res, 200, { ok: true })).catch(fail); }
  }
  if (p === '/api/pfile') {
    const v = String(url.searchParams.get('p') || ''), k = String(url.searchParams.get('i') || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(v) || !/^[0-5]$/.test(k)) return send(res, 400, { error: 'bad product or picture slot' });
    if (req.method !== 'GET' && s.role !== 'admin') return send(res, 403, { error: 'Not allowed' });
    if (req.method === 'GET') { const f = pfind(v, k); if (!f) { res.writeHead(404); return res.end(); } return sendFile(f.path, f.ext, 'private, max-age=300'); }
    if (req.method === 'PUT') return body(req, (err, b) => {
      const d = !err && decode(b, false);
      if (!d) return send(res, 400, { error: 'Send a JPG, PNG or WEBP picture' });
      if (d.buf.length > VMAX) return send(res, 400, { error: 'Picture is larger than 5 MB' });
      const old = pfind(v, k), np = 'p/' + v + '__' + k + '.' + VEXT[d.mime];
      if (!old && Files.count() >= MAX_FILES) return send(res, 507, { error: 'Storage limit reached' });
      Files.put(np, d.buf, d.mime).then(() => old && old.path !== np ? Files.del(old.path) : null).then(() => send(res, 200, { ok: true, size: d.buf.length, mime: d.mime, at: Date.now() })).catch(fail);
    }, 8 * 1024 * 1024);
    if (req.method === 'DELETE') { const f = pfind(v, k); return Promise.resolve(f ? Files.del(f.path) : null).then(() => send(res, 200, { ok: true })).catch(fail); }
  }
  if (p === '/api/photos' && req.method === 'GET') {
    const out = {}; Files.names('c/').forEach(n => { if (/\.jpg$/i.test(n)) out[n.slice(2, -4)] = Math.floor(Files.meta(n).at); });
    return send(res, 200, { photos: out });
  }
  if (p === '/api/photo') {
    const code = String(url.searchParams.get('code') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    if (!code) return send(res, 400, { error: 'bad code' });
    if (req.method !== 'GET' && s.role !== 'admin') return send(res, 403, { error: 'Not allowed' });
    const fp = 'c/' + code + '.jpg';
    if (req.method === 'GET') { if (!Files.has(fp)) { res.writeHead(404); return res.end(); } return sendFile(fp, 'jpg', 'private, max-age=31536000'); }
    if (req.method === 'PUT') return body(req, (err, b) => {
      const d = !err && decode(b, false);
      if (!d) return send(res, 400, { error: 'send a JPG, PNG or WEBP picture' });
      if (d.buf.length > 3 * 1024 * 1024) return send(res, 400, { error: 'picture is too large' });
      if (!Files.has(fp) && Files.count() >= MAX_FILES) return send(res, 507, { error: 'Storage limit reached' });
      Files.put(fp, d.buf, d.mime).then(() => send(res, 200, { ok: true, v: Date.now() })).catch(fail);
    });
    if (req.method === 'DELETE') return Promise.resolve(Files.has(fp) ? Files.del(fp) : null).then(() => send(res, 200, { ok: true })).catch(fail);
  }
  send(res, 404, { error: 'not found' });
}

const ZIPPABLE = new Set(['.html', '.css', '.js', '.svg', '.webmanifest', '.ico']), ZC = new Map();
function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  let file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  const parts = path.relative(ROOT, file).split(path.sep);
  if (parts.some(s => s.startsWith('.') || BLOCKED.includes(s.toLowerCase()))) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) file = path.join(file, 'index.html');
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext] || path.basename(file).toLowerCase() === 'server.js') { res.writeHead(404); return res.end('Not found'); }
    fs.stat(file, (e2, st2) => {
      if (e2 || !st2.isFile()) { res.writeHead(404); return res.end('Not found'); }
      // "no-cache" means: ask the server every time, but the answer is a tiny "not modified" while the file is unchanged. A new deploy changes the tag, so updates still show at once.
      const tag = 'W/"' + st2.size.toString(36) + '-' + Math.floor(st2.mtimeMs).toString(36) + '"';
      const hdr = { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', 'ETag': tag, 'Vary': 'Accept-Encoding' };
      const inm = String(req.headers['if-none-match'] || '').split(',').map(x => x.trim());
      if (inm.indexOf(tag) > -1) { res.writeHead(304, hdr); return res.end(); }
      const ae = String(req.headers['accept-encoding'] || ''), enc = !ZIPPABLE.has(ext) ? '' : (/\bbr\b/.test(ae) ? 'br' : (/\bgzip\b/.test(ae) ? 'gzip' : ''));
      const ck = file + '|' + enc, hit = ZC.get(ck);
      if (hit && hit.tag === tag) { if (enc) hdr['Content-Encoding'] = enc; hdr['Content-Length'] = hit.buf.length; res.writeHead(200, hdr); return res.end(hit.buf); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        const done = (buf, used) => {
          if (used) hdr['Content-Encoding'] = used;
          if (ZIPPABLE.has(ext)) { if (ZC.size > 300) ZC.clear(); ZC.set(ck, { tag, buf }); }
          hdr['Content-Length'] = buf.length; res.writeHead(200, hdr); res.end(buf);
        };
        if (!enc || data.length < 600) return done(data, '');
        const cb = (er, z) => er ? done(data, '') : done(z, enc);
        if (enc === 'br') zlib.brotliCompress(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } }, cb);
        else zlib.gzip(data, { level: 6 }, cb);
      });
    });
  });
}

let SETUP_NOTICE = [];
// "node server.js --migrate": copies this computer's data (records, logins, photos, documents) up to Supabase, once.
async function migrateToCloud() {
  if (!CLOUD) { console.log('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first (see SUPABASE-SETUP.md).'); return; }
  readLocalDb();
  try { auth = JSON.parse(fs.readFileSync(AUTHF, 'utf8')); } catch (e) {}
  if (!auth.admins) auth.admins = {}; if (!auth.workers) auth.workers = {};
  SETUP_NOTICE = migrateAuth();
  const rows = Object.keys(db.items).map(k => ({ key: k, v: db.items[k].v, rev: db.items[k].rev }));
  rows.push({ key: '_auth', v: JSON.stringify(auth), rev: 0 });
  await storage.kv.save(rows);
  console.log('Saved ' + (rows.length - 1) + ' records and the login accounts to Supabase.');
  const list = storage.files.localScan(); let n = 0;
  for (const it of list) { await Files.put(it.p, fs.readFileSync(it.file), Files.mimeOf(it.p)); n++; }
  console.log('Uploaded ' + n + ' pictures and documents to Supabase.');
  SETUP_NOTICE.forEach(l => console.log(l));
  console.log('Done. Your data is now in Supabase.');
}

async function boot() {
  if (process.argv.includes('--migrate')) { await migrateToCloud(); process.exit(0); }
  await loadDb(); await Files.init();
  if (process.argv.includes('--reset-admin')) { migrateAuth(); resetAdmin(); await flushNow(); process.exit(0); }
  SETUP_NOTICE = migrateAuth();
  if (CLOUD) { await flushNow(); setInterval(() => storage.kv.ping().catch(() => {}), 12 * 3600e3).unref(); }   // a small daily request keeps the free Supabase project from pausing

  http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    let url; try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
    if (url.pathname.startsWith('/api/')) { try { return api(req, res, url); } catch (e) { console.error('Request error:', e && e.message); if (!res.headersSent) send(res, 500, { error: 'Server error' }); return; } }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  }).listen(PORT, '0.0.0.0', () => {
    console.log('\nGeneral Traders backend running  (' + (CLOUD ? 'data in Supabase' : 'data on this computer') + ')');
    console.log('  This computer :  http://localhost:' + PORT + '/');
    const ifs = os.networkInterfaces();
    Object.keys(ifs).forEach(n => ifs[n].forEach(a => { if (a.family === 'IPv4' && !a.internal) console.log('  Phones on WiFi:  http://' + a.address + ':' + PORT + '/'); }));
    console.log('  Data          :  ' + (CLOUD ? 'Supabase' : DB) + '\n  Stop with Ctrl+C\n');
    if (SETUP_NOTICE.length) { console.log('  ==== FIRST-TIME SECURITY SETUP ===='); SETUP_NOTICE.forEach(l => console.log(l)); console.log('  Sign in with it, then choose your own password. This is shown only once.\n  If you lose it, stop the server and run:  node server.js --reset-admin\n'); }
  });
}
boot().catch(e => { console.error('Could not start: ' + e.message); process.exit(1); });