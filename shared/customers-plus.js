/* General Traders - Customers page enhancements (loaded after the page script).
   Adds: tile icons + %, avatars, WhatsApp, route colours, actions menu, numbered pager,
   new Quick View drawer, drag-and-drop import with preview, real Last visit.
   Nothing here invents data: fields that are not stored show a dash or an honest empty note. */
(function () {
  'use strict';
  if (typeof render !== 'function' || !document.getElementById('gtCustomersPage')) return;

  var DASH = '\u2014', MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function E(v) { return esc(v == null ? '' : String(v)); }
  function G(id) { return document.getElementById(id); }
  function hash(t, n) { var h = 0; String(t || '').split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 997; }); return h % n; }
  function initials(n) { var w = String(n || '?').replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/); return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase(); }
  function wa(p) { var d = String(p || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return d.length >= 11 ? 'https://wa.me/' + d : ''; }
  /* ---------- toast (visible even while a modal is open) ---------- */
  function gpToast(msg, ok) {
    var old = document.querySelectorAll('.gp-toast'); old.forEach(function (o) { o.remove(); });
    var t = document.createElement('div'); t.className = 'gp-toast ' + (ok ? 'ok' : 'bad'); t.setAttribute('role', 'status');
    t.innerHTML = '<span class="gp-toast-i">' + (ok ? '\u2713' : '!') + '</span><span>' + E(msg) + '</span>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, ok ? 2600 : 5000);
    var mm = G('mm'); if (mm) { mm.textContent = msg; mm.className = (mm.className.indexOf('gce-msg') > -1 ? 'gce-msg ' : '') + (ok ? 'msg ok' : 'msg'); }
  }
  window.pmsg = gpToast;
  var pmsg = gpToast;
  /* ---------- shop photos (stored on the server in data/photos) ---------- */
  var PH = {};
  function pkey(code) { return String(code || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); }
  function hasPhoto(c) { return !!PH[pkey(c.code)]; }
  function photoUrl(c) { return '/api/photo?code=' + encodeURIComponent(pkey(c.code)) + '&v=' + PH[pkey(c.code)]; }
  function loadPhotos(done) {
    fetch('/api/photos').then(function (r) { return r.json(); }).then(function (j) { PH = (j && j.photos) || {}; if (done) done(); }).catch(function () { /* server without photo support */ });
  }
  function shrink(file, cb) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 900, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cb(null, cv.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb('This browser cannot read that picture. Try a JPG or PNG.'); };
    img.src = url;
  }
  function pickPhoto(c, after) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      shrink(f, function (err, data) {
        if (err) { pmsg(err); return; }
        fetch('/api/photo?code=' + encodeURIComponent(pkey(c.code)), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: data }) })
          .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || 'not saved'); PH[pkey(c.code)] = j.v; pmsg('Photo saved for ' + (c.name || c.code) + '.', true); if (after) after(); })
          .catch(function (e) { pmsg('Could not save the photo: ' + e.message + '. Restart the server after running the photo patch.'); });
      });
    };
    inp.click();
  }
  function removePhoto(c, after) {
    if (!confirm('Remove the photo of ' + (c.name || c.code) + '?')) return;
    fetch('/api/photo?code=' + encodeURIComponent(pkey(c.code)), { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function () { delete PH[pkey(c.code)]; if (after) after(); }).catch(function () { pmsg('Could not remove the photo.'); });
  }
  function avatar(c, cls, noPhoto) {
    if (!noPhoto && hasPhoto(c)) return '<span class="gp-av gp-av-img' + (cls ? ' ' + cls : '') + '"><img src="' + photoUrl(c) + '" alt="" loading="lazy"></span>';
    return '<span class="gp-av gp-a' + hash(c.name, 6) + (cls ? ' ' + cls : '') + '">' + E(initials(c.name)) + '</span>';
  }
  function waIcon() { return typeof WA === 'string' ? WA : ''; }
  function ic(name) {
    var P = {
      users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 14.4c1.7.8 2.9 2.7 2.9 5.6"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
      x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
      pin: '<path d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
      pinoff: '<path d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21z"/><path d="M4 4l16 16"/>',
      cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18"/><path d="M12 12v8M9 15l3-3 3 3"/>',
      ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
      camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
    };
    return '<svg class="gp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';
  }

  /* ---------- Last visit (from the daily plans, like the old page did) ---------- */
  function visitOf(c) {
    var v = (window.__gpLV || {})[c.code] || c.lastVisit || c.last_visit || c.lastVisitDate || c.last_visit_date || c.lastDelivery || c.last_delivery || '';
    return v ? String(v) : '';
  }
  function toDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(v); return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v) { var d = toDate(v); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : String(v); }
  window.fmtLastVisit = function (c) { var v = visitOf(c); return v ? E(fmtDate(v)) : DASH; };
  window.visitMatch = function (c, days) {
    if (!days) return true;
    var v = visitOf(c);
    if (days === 'never') return !v;
    if (!v) return false;
    var d = toDate(v); if (!d) return false;
    return (Date.now() - d.getTime()) <= (+days * 86400000);
  };

  /* ---------- stat tiles ---------- */
  function stats() {
    var all = S.customers || [], total = all.length, active = all.filter(function (c) { return !c.inactive; }).length, inactive = total - active;
    var pinned = all.filter(hasPin).length, noPin = total - pinned;
    function pct(n) { return total ? (n * 100 / total).toFixed(1) + '%' : ''; }
    var T = [['t1', 'users', 'Total customers', total, ''], ['t2', 'check', 'Active', active, pct(active)], ['t3', 'x', 'Inactive', inactive, pct(inactive)], ['t4', 'pin', 'With location', pinned, pct(pinned)], ['t5', 'pinoff', 'Without location', noPin, pct(noPin)]];
    G('stats').innerHTML = T.map(function (t) { return '<div class="gtc-stat gp-' + t[0] + '"><span class="gtc-stat-icon">' + ic(t[1]) + '</span><div><b>' + t[3].toLocaleString('en-IN') + '</b><span>' + t[2] + '</span></div>' + (t[4] ? '<em>' + t[4] + '</em>' : '') + '</div>'; }).join('');
  }

  /* ---------- table rows ---------- */
  function rows() {
    var rm = routeMap();
    document.querySelectorAll('#cBody tr').forEach(function (tr) {
      var nb = tr.querySelector('.gtc-name[data-open]'); if (!nb || tr.getAttribute('data-gp')) return;
      tr.setAttribute('data-gp', '1');
      var c = cust(nb.getAttribute('data-open')); if (!c) return;
      nb.classList.add('gp-hasav');
      nb.insertAdjacentHTML('afterbegin', avatar(c));
      var ph = tr.querySelector('.gtc-phone'), w = wa(c.phone);
      if (ph && c.phone && w) ph.insertAdjacentHTML('afterend', '<a class="gp-wa" title="WhatsApp" target="_blank" rel="noopener" href="' + w + '">' + waIcon() + '</a>');
      var rp = tr.querySelector('.gtc-route-pill'); if (rp) rp.classList.add('gp-rc' + hash(rp.textContent, 6));
      var lc = tr.querySelector('.gtc-location'); if (lc) lc.insertAdjacentHTML('afterbegin', '<i class="gp-dot"></i>');
      var chk = tr.querySelector('input[data-sel]'); if (chk && chk.checked) tr.classList.add('gp-sel');
      var mb = tr.querySelector('.gtc-more'); if (mb) mb.onclick = function (e) { e.stopPropagation(); openMenu(mb, c.code); };
      tr.addEventListener('click', function (e) { if (e.target.closest('input,button,a,select')) return; openQuick(c); });
    });
    document.querySelectorAll('[data-card-menu]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openMenu(b, b.getAttribute('data-card-menu')); }; });
  }

  /* ---------- actions menu ---------- */
  function closeMenu() { var m = G('gpMenu'); if (m) m.remove(); }
  function openMenu(btn, code) {
    closeMenu();
    var c = cust(code); if (!c) return;
    var m = document.createElement('div'); m.id = 'gpMenu'; m.className = 'gp-menu';
    m.innerHTML = '<button data-a="quick">Quick view</button><button data-a="view">View full details</button><button data-a="photo">' + (hasPhoto(c) ? 'Change shop photo' : 'Add shop photo') + '</button><button data-a="edit">Edit customer</button><button data-a="toggle">' + (c.inactive ? 'Set active' : 'Set inactive') + '</button><button data-a="del" class="danger">Delete</button>';
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = ((r.bottom + h + 8 > window.innerHeight) ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    m.onclick = function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return; closeMenu();
      if (a === 'quick') openQuick(c); else if (a === 'view') openDetails(c); else if (a === 'photo') pickPhoto(c, function () { render(); }); else if (a === 'edit') form(c); else if (a === 'toggle') toggleActive(c); else if (a === 'del') delCustomer(c);
    };
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('#gpMenu') && !e.target.closest('.gtc-more,[data-card-menu]')) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('scroll', closeMenu, true);

  /* ---------- pager with page numbers ---------- */
  function pager() {
    var list = customerList(), total = list.length, el = G('cPager'); if (!el) return;
    if (!total) { el.innerHTML = ''; return; }
    var pages = Math.max(1, Math.ceil(total / PS)), from = (PG - 1) * PS, to = Math.min(total, from + PS);
    var lo = Math.max(1, Math.min(PG - 2, pages - 4)), hi = Math.min(pages, lo + 4), nums = '';
    for (var k = lo; k <= hi; k++) nums += '<button type="button" data-gp-pg="' + k + '"' + (k === PG ? ' class="cur"' : '') + '>' + k + '</button>';
    if (hi < pages) nums += '<span class="gp-gap">...</span><button type="button" data-gp-pg="' + pages + '">' + pages + '</button>';
    el.innerHTML = '<span class="gp-showing">Showing ' + (from + 1) + ' - ' + to + ' of ' + total.toLocaleString('en-IN') + ' customers</span><span class="grow"></span>' +
      '<label class="gp-rows">Rows per page <span class="field a-f"><select id="cPS">' + [25, 50, 100, 200].map(function (n) { return '<option value="' + n + '"' + (n === PS ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></span></label>' +
      '<div class="gp-pages"><button type="button" data-gp-pg="' + (PG - 1) + '"' + (PG <= 1 ? ' disabled' : '') + ' aria-label="Previous">&#8249;</button>' + nums + '<button type="button" data-gp-pg="' + (PG + 1) + '"' + (PG >= pages ? ' disabled' : '') + ' aria-label="Next">&#8250;</button></div>';
    el.querySelectorAll('[data-gp-pg]').forEach(function (b) { b.onclick = function () { var n = +b.getAttribute('data-gp-pg'); if (n >= 1 && n <= pages) { PG = n; render(); } }; });
    G('cPS').onchange = function () { PS = +this.value; PG = 1; render(); };
  }

  /* ---------- wrap render ---------- */
  var origRender = render;
  window.render = function () {
    try { window.__gpLV = lastVisits(); } catch (e) { window.__gpLV = {}; }
    origRender.apply(this, arguments);
    try { stats(); rows(); pager(); } catch (e) { console.error('customers-plus', e); }
  };

  /* ---------- Shop photo inside the Edit customer form ---------- */
  window.gpFormPhoto = function (c, box) {
    if (!box) return;
    if (!c) { box.innerHTML = '<div class="gp-fphoto"><div class="gp-fphoto-ph">' + ic('camera') + '</div><div class="gp-fphoto-t"><b>Shop photo</b><small>Save the customer first, then open Edit to add a photo.</small></div></div>'; return; }
    function draw() {
      var has = hasPhoto(c);
      box.innerHTML = '<div class="gp-fphoto">' + (has ? '<a class="gp-fphoto-img" href="' + photoUrl(c) + '" target="_blank" rel="noopener"><img src="' + photoUrl(c) + '" alt="Shop photo"></a>' : '<div class="gp-fphoto-ph">' + ic('camera') + '</div>') +
        '<div class="gp-fphoto-t"><b>Shop photo</b><small>' + (has ? 'Tap the picture to view it full size.' : 'Take or choose a picture of the shop.') + '</small>' +
        '<div class="gp-fphoto-b"><button type="button" class="btn btn-secondary a-btn" id="gpFpAdd">' + (has ? 'Change photo' : 'Add photo') + '</button>' + (has ? '<button type="button" class="btn btn-secondary a-btn gp-danger" id="gpFpRm">Remove</button>' : '') + '</div></div></div>';
      G('gpFpAdd').onclick = function () { pickPhoto(c, function () { draw(); render(); }); };
      if (G('gpFpRm')) G('gpFpRm').onclick = function () { removePhoto(c, function () { draw(); render(); }); };
    }
    draw();
  };

  /* ---------- Quick View drawer ---------- */
  function kv(label, val) { return '<div class="gp-kv"><span>' + label + '</span><b>' + (val ? val : DASH) + '</b></div>'; }
  window.openQuick = function (c) {
    if (!c) return;
    var r = routeFor(c.code), pin = hasPin(c), w = wa(c.phone), off = !!c.inactive, lv = visitOf(c);
    var head = document.querySelector('#gtcQuick .gtc-quick-head > div:first-child');
    head.innerHTML = '<div class="gp-qh">' + avatar(c, 'gp-av-lg') + '<div><h3 id="gtcQuickTitle">' + E(c.name || 'Customer') + '</h3><div class="gp-qh-sub"><span class="gp-idbox">ID: ' + E(c.code) + '</span><span class="gtc-status ' + (off ? 'off' : 'on') + '">' + (off ? 'Inactive' : 'Active') + '</span></div></div></div>';
    var phone = c.phone ? E(c.phone) + (w ? ' <a class="gp-wa" target="_blank" rel="noopener" href="' + w + '">' + waIcon() + '</a>' : '') : '';
    var addr = c.address ? '<div class="gp-addr"><span>' + E(c.address) + '</span>' + (pin ? '<a class="gp-mini" target="_blank" rel="noopener" href="' + mapLink(c.lat, c.lng) + '">View on Map</a>' : '') + '</div>' : '<div class="gp-note">No address stored.</div>';
    var P1 = '<div class="gp-sec">Basic information</div>' + kv('Shop name', E(c.name)) + kv('Customer ID', '<span class="gp-idbox">' + E(c.code) + '</span>') + kv('Phone number', phone) + kv('Alternate phone', E(c.phone2)) + kv('GST number', E(c.gstin)) +
      '<div class="gp-sec">Address</div>' + addr +
      '<div class="gp-sec">Location <span class="gp-loc ' + (pin ? 'ok' : 'no') + '">' + (pin ? 'Located' : 'Missing') + '</span></div>' +
      (pin ? kv('Latitude', E((+c.lat).toFixed(6))) + kv('Longitude', E((+c.lng).toFixed(6))) + '<a class="btn btn-secondary a-btn gp-open" target="_blank" rel="noopener" href="' + mapLink(c.lat, c.lng) + '">Open in Maps</a>' : '<div class="gp-note">' + (c.place ? 'Landmark: ' + E(c.place) + '. ' : '') + 'No latitude/longitude saved yet. Use Edit to add the pin.</div>');
    var P2 = '<div class="gp-empty">Order history is not stored for customers yet, so there is nothing to show here.</div>';
    var P3 = '<div class="gp-sec">Route</div>' + kv('Route', r ? '<span class="gtc-route-pill gp-rc' + hash(r.name, 6) + '">' + E(r.name) + '</span>' : '') + kv('Area', E(c.area)) + kv('Shops on this route', r ? String((r.codes || []).length) : '') + kv('Last visit', lv ? E(fmtDate(lv)) : '');
    var P4 = kv('Last visit', lv ? E(fmtDate(lv)) : '') + '<div class="gp-empty">Detailed activity (payments, route changes) is not recorded yet.</div>';
    G('gtcQuickBody').innerHTML = '<div class="gp-tabs"><button class="on" data-t="1">Quick View</button><button data-t="2">Orders</button><button data-t="3">Route</button><button data-t="4">Activity</button></div>' +
      '<div class="gp-panel" data-p="1">' + P1 + '</div><div class="gp-panel" data-p="2" hidden>' + P2 + '</div><div class="gp-panel" data-p="3" hidden>' + P3 + '</div><div class="gp-panel" data-p="4" hidden>' + P4 + '</div>' +
      '<div class="gtc-q-actions"><button class="btn a-btn" id="gtcFull" type="button">View Full Details</button><button class="btn btn-secondary a-btn" id="gtcEdit" type="button">Edit</button><button class="btn btn-secondary a-btn" id="gtcTog" type="button">' + (off ? 'Set active' : 'Set inactive') + '</button></div>';
    G('gtcQuickBody').querySelectorAll('.gp-tabs button').forEach(function (b) {
      b.onclick = function () {
        G('gtcQuickBody').querySelectorAll('.gp-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
        G('gtcQuickBody').querySelectorAll('.gp-panel').forEach(function (p) { p.hidden = p.getAttribute('data-p') !== b.getAttribute('data-t'); });
      };
    });
    G('gtcFull').onclick = function () { closeQuick(); openDetails(c); };
    G('gtcEdit').onclick = function () { closeQuick(); form(c); };
    G('gtcTog').onclick = function () { closeQuick(); toggleActive(c); };
    G('gtcQuick').classList.add('open'); G('gtcScrim').classList.add('show'); G('gtcQuick').setAttribute('aria-hidden', 'false');
  };

  /* ---------- Customer Details (dashboard style) ---------- */
  function sv(d) { return '<svg class="gdt-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  var I = { store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M10 20v-5h4v5"/>', pin: '<path d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', info: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>', ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>' };
  function gk(label, val, wide) { return '<div class="gdt-k' + (wide ? ' wide' : '') + '"><span>' + label + '</span><b>' + (val ? val : DASH) + '</b></div>'; }
  function embed(c) {
    if (!hasPin(c)) return '<div class="gdt-map-ph">No pin saved for this shop yet.<br>Use Edit customer to add the location.</div>';
    var la = +c.lat, lo = +c.lng;
    return '<iframe loading="lazy" title="Map" src="https://www.openstreetmap.org/export/embed.html?bbox=' + (lo - 0.004) + ',' + (la - 0.003) + ',' + (lo + 0.004) + ',' + (la + 0.003) + '&layer=mapnik&marker=' + la + ',' + lo + '"></iframe>';
  }
  window.openDetails = function (c) {
    if (!c) return;
    var r = routeFor(c.code), pin = hasPin(c), off = !!c.inactive, lv = visitOf(c), w = wa(c.phone);
    var ov = G('gtcDetail'), body = G('gtcDetailBody');
    var where = c.place || c.area || c.address || '';
    var basic = gk('Shop name', E(c.name)) + gk('Customer ID', E(c.code)) + gk('Customer type', E(c.customerType || c.type)) +
      gk('Phone number', c.phone ? E(c.phone) : '') + gk('Alternate phone', E(c.phone2)) + gk('Contact person', E(c.contactPerson || c.contact)) +
      gk('Area', E(c.area)) + gk('Route', r ? E(r.name) : 'No route') + gk('Status', off ? 'Inactive' : 'Active') +
      gk('Address', E(c.address), true) + gk('GST number', E(c.gstin)) + gk('Last visit', lv ? E(fmtDate(lv)) : '');
    var loc = '<div class="gdt-map">' + embed(c) + '</div><div class="gdt-ll">' + gk('Latitude', pin ? E((+c.lat).toFixed(6)) : '') + gk('Longitude', pin ? E((+c.lng).toFixed(6)) : '') + '</div>';
    var act = lv ? '<div class="gdt-act"><span class="gdt-act-i">' + sv(I.clock) + '</span><div><b>Last visit</b><small>' + E(fmtDate(lv)) + (c.area ? ' &middot; ' + E(c.area) : '') + '</small></div></div>' : '<div class="gdt-empty">No activity recorded yet. Visits will appear here.</div>';
    function card(ic, t, s, extra, inner) { return '<section class="gdt-card"><div class="gdt-ch"><span class="gdt-ci">' + sv(ic) + '</span><div><h4>' + t + '</h4><small>' + s + '</small></div>' + (extra || '') + '</div>' + inner + '</section>'; }
    var empty = function (t) { return '<div class="gdt-empty">' + t + '</div>'; };
    body.innerHTML =
      '<div class="gdt-top"><div class="gdt-eb">CUSTOMER DETAILS</div><div class="gdt-id">' + avatar(c, 'gp-av-lg gdt-av') +
        '<div class="gdt-idt"><h2>' + E(c.name || 'Customer') + '</h2><div class="gdt-chips"><span class="gdt-pill">' + E(c.code) + '</span>' +
        '<span class="gdt-st ' + (off ? 'off' : 'on') + '"><i></i>' + (off ? 'Inactive' : 'Active') + '</span>' +
        (where ? '<span class="gdt-ch2">' + sv(I.pin) + E(where) + '</span>' : '') +
        (c.phone ? '<span class="gdt-ch2">' + sv(I.phone) + E(c.phone) + '<button type="button" id="gdtCp" class="gdt-ib" title="Copy phone">' + sv(I.copy) + '</button>' + (w ? '<a class="gp-wa" target="_blank" rel="noopener" href="' + w + '">' + waIcon() + '</a>' : '') + '</span>' : '') +
        '</div></div>' +
        '<div class="gdt-acts"><button type="button" class="btn a-btn" id="gdtEdit">Edit customer</button><div class="gdt-mw"><button type="button" class="btn btn-secondary a-btn" id="gdtMore">More actions &#9662;</button><div class="gdt-menu" id="gdtMenu" hidden>' +
          '<button data-m="map">View on map</button><button data-m="gmaps">Open in Google Maps</button><hr><button data-m="export">Export customer</button><button data-m="print">Print details</button><hr><button data-m="del" class="danger">Delete customer</button></div></div>' +
          '<button type="button" class="gtc-close" id="gdtX" aria-label="Close">&times;</button></div></div></div>' +
      '<div class="gdt-tabs"><button class="on" data-t="overview">Overview</button><button data-t="route">Route &amp; Location</button><button data-t="payments">Payments</button><button data-t="history">History &amp; Activity</button><button data-t="notes">Notes</button><button data-t="attachments">Attachments</button></div>' +
      '<div class="gdt-p" data-p="overview"><div class="gdt-cols"><div>' + card(I.info, 'Basic Information', 'Shop details and contact information', '', '<div class="gdt-grid">' + basic + '</div>') + '</div><div class="gdt-col">' +
        card(I.pin, 'Location', 'Shop location on map', pin ? '<a class="btn btn-secondary a-btn" style="margin-left:auto" target="_blank" rel="noopener" href="' + mapLink(c.lat, c.lng) + '">Open in Maps</a>' : '', loc) +
        card(I.clock, 'Recent Activity', 'Latest customer activity and updates', '<button type="button" class="btn btn-secondary a-btn" style="margin-left:auto" id="gdtAll">View all</button>', act) + '</div></div></div>' +
      '<div class="gdt-p" data-p="route" hidden><div class="gdt-cols"><div>' + card(I.pin, 'Route &amp; Location', 'Delivery route and pin', '', '<div class="gdt-grid">' + gk('Route', r ? E(r.name) : 'No route') + gk('Area', E(c.area)) + gk('Landmark', E(c.place)) + gk('Shops on this route', r ? String((r.codes || []).length) : '') + gk('Address', E(c.address), true) + '</div>') + '</div><div>' + card(I.pin, 'Map', 'Stored shop pin', '', loc) + '</div></div></div>' +
      '<div class="gdt-p" data-p="payments" hidden>' + empty('Payment records are not stored for customers yet.') + '</div>' +
      '<div class="gdt-p" data-p="history" hidden>' + card(I.clock, 'History &amp; Activity', 'Visits and updates', '', act) + '</div>' +
      '<div class="gdt-p" data-p="notes" hidden>' + empty('Customer notes are not stored yet.') + '</div>' +
      '<div class="gdt-p" data-p="attachments" hidden>' + empty('Customer attachments are not stored yet.') + '</div>';
    function tab(t) { body.querySelectorAll('.gdt-tabs button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-t') === t); }); body.querySelectorAll('.gdt-p').forEach(function (p) { p.hidden = p.getAttribute('data-p') !== t; }); }
    body.querySelectorAll('.gdt-tabs button').forEach(function (b) { b.onclick = function () { tab(b.getAttribute('data-t')); }; });
    function close() { ov.classList.remove('open'); }
    function edit() { close(); closeQuick(); form(c); }
    G('gdtX').onclick = close; G('gdtEdit').onclick = edit; G('gdtAll').onclick = function () { tab('history'); };
    if (G('gdtCp')) G('gdtCp').onclick = function () { try { navigator.clipboard.writeText(c.phone); pmsg('Phone number copied.', true); } catch (x) { pmsg('Could not copy.'); } };
    var mn = G('gdtMenu'); G('gdtMore').onclick = function (ev) { ev.stopPropagation(); mn.hidden = !mn.hidden; };
    body.onclick = function (ev) { if (!ev.target.closest('.gdt-mw')) mn.hidden = true; };
    mn.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        var m = b.getAttribute('data-m'); mn.hidden = true;
        if (m === 'map') tab('route');
        else if (m === 'gmaps') { if (pin) window.open(mapLink(c.lat, c.lng), '_blank'); else pmsg('No pin saved for this shop.'); }
        else if (m === 'export') {
          var cols = [['Customer ID', c.code], ['Shop name', c.name], ['Phone', c.phone], ['Alternate phone', c.phone2], ['Area', c.area], ['Route', r ? r.name : ''], ['Address', c.address], ['GST', c.gstin], ['Latitude', pin ? c.lat : ''], ['Longitude', pin ? c.lng : ''], ['Status', off ? 'Inactive' : 'Active']];
          var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + cols.map(function (x) { return q(x[0]); }).join(',') + '\r\n' + cols.map(function (x) { return q(x[1]); }).join(',')], { type: 'text/csv' })); a.download = 'customer-' + c.code + '.csv'; a.click();
        } else if (m === 'print') {
          var pw = window.open('', '_blank'); if (!pw) { pmsg('Allow pop-ups to print.'); return; }
          pw.document.write('<title>' + E(c.name) + '</title><body style="font-family:Arial;padding:24px"><h2>' + E(c.name) + ' (' + E(c.code) + ')</h2><table cellpadding="8" style="border-collapse:collapse">' + [['Phone', c.phone], ['Alternate phone', c.phone2], ['Area', c.area], ['Route', r ? r.name : 'No route'], ['Address', c.address], ['GST', c.gstin], ['Status', off ? 'Inactive' : 'Active'], ['Pin', pin ? c.lat + ', ' + c.lng : '']].map(function (x) { return '<tr><td style="border:1px solid #ccc"><b>' + x[0] + '</b></td><td style="border:1px solid #ccc">' + E(x[1] || '-') + '</td></tr>'; }).join('') + '</table>'); pw.document.close(); pw.print();
        } else if (m === 'del') { close(); delCustomer(c); }
      };
    });
    ov.classList.add('open');
  };

  /* ---------- Import: drag and drop + preview, keeps the Customer ID from the file ---------- */
  var origOnXFile = onXFile;
  function hdrIndex(rows) {
    var best = -1;
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      var h = rows[i].map(function (x) { return String(x).trim().toLowerCase(); });
      if (h.some(function (x) { return /^(shop name|shop|customer name|customer|name|ledger name)$/.test(x); })) { best = i; break; }
    }
    return best;
  }
  function colmap(h) {
    var H = {}; h.forEach(function (x, i) { x = String(x).trim().toLowerCase(); if (x && H[x] == null) H[x] = i; });
    function col(names) { for (var k = 0; k < names.length; k++) if (H[names[k]] != null) return H[names[k]]; return -1; }
    return { id: col(['customer id', 'customer code', 'id', 'code']), name: col(['shop name', 'customer name', 'ledger name', 'shop', 'customer', 'name']), phone: col(['phone', 'mobile', 'phone number', 'cell', 'contact']), phone2: col(['alternate phone', 'alt phone', 'phone2', 'cell2']),
      area: col(['area', 'area name']), route: col(['route', 'route name']), address: col(['address']), lat: col(['latitude', 'lat']), lng: col(['longitude', 'lng', 'long', 'lon']), gst: col(['gst', 'gstin', 'gst number']) };
  }
  function isSimple(rows) {
    if (XLSXLite.bill(rows)) return false;
    var hi = hdrIndex(rows); if (hi < 0) return false;
    var m = colmap(rows[hi]);
    if (m.name < 0) return false;
    if (rows.slice(0, 15).some(function (r) { return r.some(function (c) { return /^ledger name$/i.test(String(c).trim()); }); })) return false;
    var pinStyle = (m.lat >= 0 || rows[hi].some(function (x) { return /map link|maplink|google map/i.test(String(x)); })) && m.phone < 0 && m.area < 0 && m.route < 0;
    return !pinStyle;
  }
  function parseSimple(rows) {
    var hi = hdrIndex(rows), m = colmap(rows[hi]), out = [], seen = {}, dup = 0, badGeo = 0;
    function cell(r, k) { return k >= 0 && r[k] != null ? String(r[k]).trim() : ''; }
    rows.slice(hi + 1).forEach(function (r) {
      var name = cell(r, m.name); if (!name) return;
      var code = cell(r, m.id); if (code && seen[code.toUpperCase()]) { dup++; return; } if (code) seen[code.toUpperCase()] = 1;
      var la = cell(r, m.lat), lo = cell(r, m.lng), geo = null;
      if (la || lo) { var a = parseFloat(la), b = parseFloat(lo); if (isNaN(a) || isNaN(b) || Math.abs(a) > 90 || Math.abs(b) > 180) badGeo++; else geo = { lat: a, lng: b }; }
      out.push({ code: code, name: name, phone: cell(r, m.phone), phone2: cell(r, m.phone2), area: cell(r, m.area), route: cell(r, m.route), address: cell(r, m.address), gstin: cell(r, m.gst).toUpperCase(), geo: geo });
    });
    return { list: out, dup: dup, badGeo: badGeo };
  }
  function findExisting(r, byName) { if (r.code) { var c = cust(r.code) || cust(r.code.toUpperCase()); if (c) return c; } return (!r.code && byName[normKey(r.name)]) || null; }
  function nameIndex() { var ix = {}; S.customers.forEach(function (c) { var k = normKey(c.name); if (k && !ix[k]) ix[k] = c; }); return ix; }
  function showPreview(P, f) {
    var ix = nameIndex(), add = 0, upd = 0, noId = 0;
    P.list.forEach(function (r) { if (findExisting(r, ix)) upd++; else { add++; if (!r.code) noId++; } });
    var head = '<tr><th>Customer ID</th><th>Shop Name</th><th>Phone</th><th>Area</th><th>Route</th></tr>';
    var body = P.list.slice(0, 5).map(function (r) { return '<tr><td>' + E(r.code || DASH) + '</td><td>' + E(r.name) + '</td><td>' + E(r.phone || DASH) + '</td><td>' + E(r.area || DASH) + '</td><td>' + E(r.route || DASH) + '</td></tr>'; }).join('');
    var note = noId ? (add - noId) + ' new customers keep the Customer ID from your file. ' + noId + ' rows have no ID and will get a new one.' : 'The Customer ID from your file will be used in the system. No new ID will be generated.';
    show('<div class="card-title">Import customers</div><p style="margin-bottom:8px"><b>' + P.list.length + '</b> customers found in <b>' + E(f.name) + '</b>: <b>' + add + '</b> new, <b>' + upd + '</b> existing will be updated.' + (P.dup ? ' ' + P.dup + ' repeated IDs skipped.' : '') + (P.badGeo ? ' ' + P.badGeo + ' rows have an invalid location and will keep the old one.' : '') + '</p>' +
      '<div class="gp-prev"><table>' + head + body + '</table></div>' + (P.list.length > 5 ? '<p class="mu" style="font-size:12px;margin:6px 0">Showing the first 5 rows.</p>' : '') +
      '<div class="gp-okbox">' + ic('ok') + '<span>' + E(note) + '</span></div>' +
      '<div class="btn-group" style="margin-top:12px"><button class="btn btn-secondary a-btn" id="gpBack" type="button">Back</button><button class="btn a-btn" id="gpGo" type="button">Import ' + P.list.length + ' customers</button></div>');
    G('gpBack').onclick = openImport;
    G('gpGo').onclick = function () {
      var r = applySimple(P.list); closeM(); areaOptions(); render();
      pmsg(r.added + ' added, ' + r.updated + ' updated' + (r.routes ? ', ' + r.routes + ' new routes' : '') + '.', true);
      openRouteSuggest(true);
    };
  }
  function applySimple(list) {
    var ix = nameIndex(), added = 0, updated = 0, made = 0;
    list.forEach(function (r) {
      var c = findExisting(r, ix), isNew = !c;
      if (isNew) { c = { code: r.code || nextCode() }; c.address = ''; S.customers.push(c); added++; } else updated++;
      c.name = r.name;
      if (r.phone) c.phone = r.phone; else if (isNew) c.phone = '';
      if (r.phone2) c.phone2 = r.phone2;
      if (r.area || isNew) c.area = r.area || c.area || '';
      if (r.address) c.address = r.address;
      if (r.gstin) c.gstin = r.gstin;
      if (r.geo) { c.lat = r.geo.lat; c.lng = r.geo.lng; }
      if (r.route) {
        var rt = (S.routes || []).filter(function (x) { return String(x.name).toLowerCase() === r.route.toLowerCase(); })[0];
        if (!rt) { var n0 = (S.routes || []).length; rt = O.areaRoute(S, r.route); if ((S.routes || []).length > n0) made++; }
        /* A Route column only fills shops that have no route yet. A route already set (or set by hand) is never overwritten. */
        if (rt && !O.routeOf(S, c.code) && !O.isLocked(c)) O.assign(S, c.code, rt.id);
      }
    });
    O.syncRoutes(S); save();
    return { added: added, updated: updated, routes: made };
  }
  function handleFile(inp) {
    var f = inp.files && inp.files[0]; if (!f) return;
    xmsg('Reading ' + f.name + '...', true);
    var fr = new FileReader(), isX = /\.xlsx$/i.test(f.name);
    fr.onerror = function () { xmsg('Could not read that file'); };
    fr.onload = function () {
      (isX ? XLSXLite.parse(fr.result) : Promise.resolve(csvParse(String(fr.result)))).then(function (rows) {
        if (isSimple(rows)) { var P = parseSimple(rows); if (!P.list.length) throw new Error('No customers found in this file'); xmsg(''); showPreview(P, f); }
        else origOnXFile.call(inp);
      }).catch(function (e) { xmsg(e && e.message ? e.message : 'Could not read that file'); });
    };
    if (isX) fr.readAsArrayBuffer(f); else fr.readAsText(f);
  }
  function sample() {
    function q(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = [['Customer ID', 'Shop Name', 'Phone', 'Area', 'Route', 'Address', 'Latitude', 'Longitude'], ['SM-001', 'Sri Murugan Stores', '9876543210', 'Anna Nagar', 'North Route', '12A Main Road', '', ''], ['LT-014', 'Lakshmi Traders', '9123456789', 'T. Nagar', 'Central Route', '45 Bazaar Street', '', '']];
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    a.download = 'customers-sample.csv'; document.body.appendChild(a); a.click(); a.remove(); xmsg('Sample saved. Fill it in and drop it above.', true);
  }
  window.openImport = function () {
    show('<div class="card-title">Import Customers (CSV / Excel)</div>' +
      '<div class="gp-drop" id="gpDrop">' + ic('cloud') + '<b>Upload CSV or Excel file</b><p>Drag and drop your file here or <span class="gp-link">click to browse</span></p><small>Supported formats: .csv, .xlsx</small><input class="gp-file" type="file" id="xFile" accept=".xlsx,.csv,.txt"></div>' +
      '<p class="mu" style="font-size:12px;margin:10px 0">Columns: Customer ID, Shop Name, Phone, Area, Route (optional: Address, Latitude, Longitude, Alternate Phone, GST). Your existing ledger export also still works.</p>' +
      '<div class="a-fg"><button class="btn btn-secondary a-btn" id="sSample" type="button">Download sample CSV</button></div>' +
      '<div class="msg" id="xMsg" style="margin-bottom:10px"></div><div class="btn-group"><button class="btn btn-secondary a-btn" id="no" type="button">Close</button></div>');
    G('xFile').onchange = function () { handleFile(this); }; G('sSample').onclick = sample; G('no').onclick = closeM;
  };
  G('imp').onclick = function () { openImport(); };

  /* ---------- route suggestions from the address (asks first, never touches routes set by hand) ---------- */
  function openRouteSuggest(afterImport) {
    var list = O.suggestRoutes(S), pick = {};
    function rank(s) { return s.how === 'exact' ? 0 : (s.how === 'near' && s.sure ? 1 : (s.how === 'similar' ? 2 : (s.how === 'near' ? 3 : 4))); }
    list.sort(function (a, b) { return rank(a) - rank(b); });
    list.forEach(function (s) { pick[s.code] = (s.how === 'exact' || (s.how === 'near' && s.sure)); });
    if (!list.length) {
      if (afterImport) return;
      show('<div class="card-title">Suggest routes</div><p class="mu" style="margin-bottom:12px">No suggestions. Every shop either has a route, was set by hand, or its address does not contain the name of a route.</p><div class="btn-group"><button class="btn a-btn" id="srNo" type="button">Close</button></div>');
      G('srNo').onclick = closeM; return;
    }
    function nChecked() { return list.filter(function (s) { return pick[s.code]; }).length; }
    function draw() {
      var rows = list.slice(0, 200).map(function (s) {
        return '<tr><td><input type="checkbox" data-sr="' + E(s.code) + '"' + (pick[s.code] ? ' checked' : '') + ' aria-label="Use this suggestion for ' + E(s.name) + '"></td><td>' + E(s.name) + '</td><td>' + E(s.address || DASH) + '</td><td><b>' + E(s.routeName) + '</b>' + (s.how === 'near' ? '<div class="mu" style="font-size:11px">nearest on the map, ' + s.km + ' km' + (s.sure ? '' : ', please check') + '</div>' : s.how === 'similar' ? '<div class="mu" style="font-size:11px">similar spelling, please check</div>' : (s.how === 'road' ? '<div class="mu" style="font-size:11px">from a road name, please check</div>' : '')) + '</td></tr>';
      }).join('');
      show('<div class="card-title">Suggest routes</div>' +
        '<p style="margin-bottom:8px"><b>' + list.length + '</b> ' + (list.length === 1 ? 'shop has' : 'shops have') + ' no route and a suggested route. Nothing changes until you press Apply.</p>' +
        '<p class="mu" style="font-size:12px;margin:0 0 8px">Ticked rows are sure matches. Rows marked "please check" are not ticked, so tick them only if you agree. "Nearest on the map" uses the map pin and the closest shop already on a route. Shops you moved or took off a route by hand are never listed.</p>' +
        '<div class="gp-prev gp-sr"><table><tr><th></th><th>Shop</th><th>Address</th><th>Suggested route</th></tr>' + rows + '</table></div>' +
        (list.length > 200 ? '<p class="mu" style="font-size:12px;margin:6px 0">Showing the first 200 of ' + list.length + '. The rest are in Apply too if ticked.</p>' : '') +
        '<div class="msg" id="mm" style="margin:10px 0"></div>' +
        '<div class="btn-group"><button class="btn btn-secondary a-btn" id="srNo" type="button">Not now</button><button class="btn a-btn" id="srGo" type="button"' + (nChecked() ? '' : ' disabled') + '>Apply ' + nChecked() + (nChecked() === 1 ? ' route' : ' routes') + '</button></div>');
      G('srNo').onclick = closeM;
      [].slice.call(document.querySelectorAll('[data-sr]')).forEach(function (b) { b.onchange = function () { pick[b.getAttribute('data-sr')] = b.checked; var g = G('srGo'); g.textContent = 'Apply ' + nChecked() + (nChecked() === 1 ? ' route' : ' routes'); g.disabled = !nChecked(); }; });
      G('srGo').onclick = function () {
        var n = O.applyRouteSuggestions(S, list.filter(function (s) { return pick[s.code]; }));
        save(); closeM(); render(); pmsg(n + (n === 1 ? ' shop' : ' shops') + ' put on a route.', true);
      };
    }
    draw();
  }
  window.gpSuggestRoutes = openRouteSuggest;
  var sug = G('sugRt'); if (sug) sug.onclick = function () { openRouteSuggest(false); };
  /* After an import finishes, offer the suggestions (the admin can say "Not now") */
  (function () {
    var done0 = window.importDone; if (typeof done0 !== 'function') return;
    window.importDone = function (msg) {
      done0.apply(this, arguments);
      var n = O.suggestRoutes(S).length;
      if (!n) return;
      var box = G('mc'); if (!box) return;
      var b = document.createElement('div'); b.className = 'gp-okbox'; b.style.cursor = 'pointer';
      b.innerHTML = '<span><b>' + n + '</b> shops have no route, but their address matches a route. <u>Review suggestions</u></span>';
      b.onclick = function () { openRouteSuggest(false); };
      box.appendChild(b);
    };
  })();

  /* ---------- small clean-ups ---------- */
  window.qvClose = function () { closeQuick(); };   /* old Escape handler pointed at a drawer that no longer exists */
  var demo = G('demo'); if (demo) demo.style.display = 'none';   /* "Load demo data" replaces real customers - hidden */
  loadPhotos(function () { render(); });
  render();
})();