/* Punch In / Punch Out as a popup. Include after mock-data.js.
   Any link to punch-in.html or punch-out.html on the page opens the popup instead. */
(function () {
  var css = '' +
  '.pm-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:1000}' +
  '.pm-ov.open{display:flex}' +
  '.pm-box{background:var(--bg);width:100%;max-width:560px;max-height:92vh;border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 30px rgba(0,0,0,.25)}' +
  '@media(min-width:700px){.pm-ov{align-items:center}.pm-box{border-radius:22px;max-height:90vh}}' +
  '.pm-top{display:flex;align-items:center;gap:12px;padding:16px 18px;background:linear-gradient(135deg,var(--t-primary),var(--card));border-bottom:1px solid var(--border)}' +
  '.pm-top h3{font-size:18px;font-weight:700;line-height:1.2}.pm-top p{font-size:12.5px;color:var(--muted);margin-top:2px}.pm-top>div{flex:1;min-width:0}' +
  '.pm-x{width:36px;height:36px;border:0;border-radius:10px;background:var(--card);color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)}' +
  '.pm-x svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}' +
  '.pm-body{padding:16px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}' +
  '.pm-foot{padding:12px 18px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:var(--card);display:flex;flex-direction:column;gap:8px}' +
  '.pm-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px}' +
  '.pm-st{display:flex;align-items:center;gap:10px;font-size:14.5px;font-weight:700;margin-bottom:10px}' +
  '.pm-n{width:24px;height:24px;border-radius:50%;background:var(--primary);color:var(--on-primary);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
  '.pm-gps{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--success);background:var(--t-success)}' +
  '.pm-gps b{display:block;font-size:13.5px;color:var(--success)}.pm-gps span.s{display:block;font-size:12px;color:var(--muted);margin-top:1px}.pm-gps .tx{flex:1;min-width:0}' +
  '.pm-gps.warn{border-color:var(--accent);background:var(--t-accent)}.pm-gps.warn b{color:var(--accent)}' +
  '.pm-gps.idle{border-color:var(--border);background:var(--bg)}.pm-gps.idle b{color:var(--muted)}' +
  '.pm-selfie{display:flex;flex-direction:column;align-items:center;gap:8px}' +
  '.pm-circle{width:120px;height:120px;border-radius:50%;border:2.5px dashed var(--primary);background:var(--t-primary);color:var(--primary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;overflow:hidden;font-size:12.5px;font-weight:700}' +
  '.pm-circle svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
  '.pm-circle img{width:100%;height:100%;object-fit:cover;display:none}' +
  '.pm-hint{font-size:12px;color:var(--muted)}' +
  '.pm-veh{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--t-info);border-radius:12px;padding:10px 12px;margin-bottom:12px}' +
  '.pm-veh small{display:block;font-size:12px;color:var(--muted)}.pm-veh strong{font-size:15px}' +
  '.pm-lab{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}' +
  '.pm-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
  '.pm-box2{background:var(--t-info);border-radius:12px;padding:10px 12px}.pm-box2 small{display:block;font-size:12px;color:var(--muted)}.pm-box2 strong{font-size:18px;font-weight:800}' +
  '.pm-driven{margin-top:10px;text-align:center;padding:12px;border-radius:12px;background:linear-gradient(135deg,var(--hero1),var(--hero2));color:var(--on-hero)}' +
  '.pm-driven small{display:block;font-size:11.5px;opacity:.9;text-transform:uppercase;letter-spacing:.04em}.pm-driven strong{font-size:26px;font-weight:800}' +
  '.pm-ret{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}.pm-ret small{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}.pm-ret small.bad{color:var(--danger)}' +
  '.pm-clean{font-size:13px;color:var(--success);font-weight:600;padding:2px 0 10px}' +
  '.pm-check{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1.5px solid var(--border);border-radius:12px;background:var(--bg);cursor:pointer;margin-top:10px}' +
  '.pm-check:first-of-type{margin-top:0}.pm-check input{width:22px;height:22px;accent-color:var(--primary);flex-shrink:0;margin-top:1px}.pm-check b{display:block;font-size:13.5px}.pm-check span{display:block;font-size:12px;color:var(--muted);margin-top:2px}' +
  '.pm-check:has(input:checked){border-color:var(--primary);background:var(--t-primary)}' +
  '.pm-sum{border-radius:16px;padding:14px 16px;color:var(--on-hero);background:linear-gradient(135deg,var(--hero1),var(--hero2))}' +
  '.pm-sum b{font-size:17px;display:block}.pm-sum p{font-size:12.5px;opacity:.9;margin-top:2px}' +
  '.pm-sg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.pm-sg div{background:rgba(255,255,255,.15);border-radius:10px;padding:8px 10px;min-width:0}.pm-sg small{display:block;font-size:11px;opacity:.85}.pm-sg strong{font-size:13px;overflow-wrap:anywhere}' +
  '.pm-go{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border:0;border-radius:14px;background:linear-gradient(135deg,var(--hero1),var(--hero2));color:var(--on-hero);font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}' +
  '.pm-go.red{background:var(--danger);color:#fff}.pm-go:disabled{background:var(--border);color:var(--muted);cursor:not-allowed}' +
  '.pm-todo{font-size:12px;color:var(--muted);text-align:center;min-height:16px}' +
  '.pm-wa{display:flex;align-items:center;justify-content:center;height:42px;border-radius:12px;border:1.5px solid #25D366;color:#16A34A;font-weight:700;font-size:13px;text-decoration:none;background:var(--card)}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ov = document.createElement('div'); ov.className = 'pm-ov';
  ov.innerHTML = '<div class="pm-box" role="dialog" aria-modal="true"><div class="pm-top"><div><h3 id="pmT"></h3><p id="pmS"></p></div><button type="button" class="pm-x" id="pmX" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="pm-body" id="pmBody"></div><div class="pm-foot" id="pmFoot"></div></div>';
  document.body.appendChild(ov);
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function close() { ov.classList.remove('open'); document.body.style.overflow = ''; }
  $('pmX').onclick = close;
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // Depot check (never blocks)
  function depotCheck(box, doneText) {
    var wh = GM.getWarehouse() || {};
    function set(cls, t, s, b) { box.className = 'pm-gps ' + cls; box.querySelector('b').textContent = t; box.querySelector('.s').textContent = s; box.querySelector('.badge').textContent = b; box.querySelector('.badge').className = 'badge ' + (cls === '' ? 'b-success' : cls === 'warn' ? 'b-accent' : 'b-muted'); }
    if (!navigator.geolocation || wh.lat == null) { set('idle', 'Location not checked', 'Location is not available on this device.', 'Unverified'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var R = 6371000, r = Math.PI / 180, dLat = (wh.lat - pos.coords.latitude) * r, dLng = (wh.lng - pos.coords.longitude) * r;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(pos.coords.latitude * r) * Math.cos(wh.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      var m = Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))), ok = m <= (wh.radiusMeters || 200);
      if (ok) set('', 'Location verified: at depot', doneText + ' (' + m + ' m)', 'At Depot');
      else set('warn', 'You are away from the depot', (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m') + ' from ' + (wh.name || 'the depot'), 'Not at depot');
    }, function () { set('idle', 'Turn on location', 'Location is needed to verify you are at the depot.', 'Unverified'); }, { enableHighAccuracy: true, timeout: 10000 });
  }
  var GPS = '<div class="pm-gps idle" id="pmGps"><div class="tx"><b>Checking your location...</b><span class="s">Allow location when your phone asks.</span></div><span class="badge b-muted">Checking</span></div>';

  function openIn() {
    var shift = GM.getShift(), lastKm = shift.lastRecordedKm || 0;
    $('pmT').textContent = 'Morning Punch In'; $('pmS').textContent = 'Verify location, photo & vehicle';
    $('pmBody').innerHTML =
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">1</span>Depot location</div>' + GPS + '</div>' +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">2</span>Attendance selfie</div><div class="pm-selfie"><label class="pm-circle" for="pmSelfie"><img id="pmImg" alt="Selfie"><span id="pmPrompt" style="display:flex;flex-direction:column;align-items:center;gap:4px"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Take Selfie</span></label><input type="file" id="pmSelfie" accept="image/*" capture="user" style="display:none"><span class="pm-hint">Tap the circle to take today\'s selfie</span></div></div>' +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">3</span>Vehicle &amp; odometer</div>' +
      '<div class="pm-veh"><div><small>Assigned by office</small><strong>' + esc(shift.assignedVehicle || 'No vehicle assigned yet') + '</strong></div><span class="badge ' + (shift.assignedVehicle ? 'b-info' : 'b-muted') + '">' + (shift.assignedVehicle ? 'Assigned' : 'Waiting') + '</span></div>' +
      '<label class="pm-lab" for="pmKm">Current odometer (KM)</label><div class="field" id="pmKmF"><input type="number" id="pmKm" inputmode="numeric" placeholder="' + (lastKm || 'Enter km reading') + '" style="font-weight:700;font-size:18px"></div>' +
      (lastKm ? '<div class="pm-hint" style="margin-top:6px">Last recorded closing KM: <b>' + lastKm.toLocaleString('en-IN') + ' km</b></div>' : '') + '<div class="msg" id="pmMsg"></div></div>';
    $('pmFoot').innerHTML = '<button type="button" class="pm-go" id="pmGo" disabled>Punch In &amp; Start Route</button><div class="pm-todo" id="pmTodo"></div>';
    depotCheck($('pmGps'), 'Ready at the depot');
    $('pmSelfie').onchange = function (e) { var f = e.target.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function (ev) { $('pmImg').src = ev.target.result; $('pmImg').style.display = 'block'; $('pmPrompt').style.display = 'none'; }; rd.readAsDataURL(f); };
    function check() {
      var v = parseInt($('pmKm').value, 10), msg = $('pmMsg'); $('pmKmF').classList.remove('err'); msg.textContent = ''; msg.style.color = '';
      var ok = !isNaN(v);
      if (ok && v < lastKm) { ok = false; $('pmKmF').classList.add('err'); msg.textContent = 'Starting KM cannot be lower than yesterday closing (' + lastKm.toLocaleString('en-IN') + ' km)'; }
      else if (ok && lastKm && v > lastKm + 300) { msg.style.color = 'var(--accent)'; msg.textContent = 'Note: ' + (v - lastKm) + ' km higher than last recorded.'; }
      $('pmGo').disabled = !ok; $('pmTodo').textContent = isNaN(v) ? 'Enter the odometer reading to continue' : '';
    }
    $('pmKm').oninput = check;
    $('pmGo').onclick = function () {
      var v = parseInt($('pmKm').value, 10), now = new Date();
      GM.updateShift({ punchedIn: true, punchInTime: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }), startKm: v, punchedOut: false });
      this.disabled = true; this.textContent = 'Punched in. Opening your route...';
      setTimeout(function () { location.href = 'home.html'; }, 600);
    };
    show();
  }

  function openOut() {
    var shift = GM.getShift(), shops = GM.getShops() || [], returns = GM.getReturns() || [], worker = GM.getWorker() || {};
    var startKm = shift.startKm || shift.lastRecordedKm || 0, now = new Date(), endTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    var done = shops.filter(function (s) { return s.status === 'delivered'; }).length, cancelled = shops.filter(function (s) { return s.status === 'cancelled'; }), rows = [];
    returns.forEach(function (r) { rows.push('<div class="pm-ret"><div><b>' + esc(r.productName) + '</b> (' + esc(r.quantity) + ' units) &bull; ' + esc(r.shopName) + '<small>' + esc(r.reason) + ' &middot; Deduction &#8377;' + esc(r.deductionAmount) + '</small></div></div>'); });
    cancelled.forEach(function (s) { rows.push('<div class="pm-ret"><div><b>' + esc(s.name) + '</b> (' + (s.items && s.items.length ? s.items.length + ' items' : esc(s.boxes) + ' unopened boxes') + ')<small class="bad">Cancelled: ' + esc(s.problemReason || 'Closed') + '</small></div></div>'); });
    $('pmT').textContent = 'Punch Out'; $('pmS').textContent = 'Close your vehicle and day summary';
    $('pmBody').innerHTML =
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">1</span>Depot location</div>' + GPS + '</div>' +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">2</span>Ending odometer</div><div class="pm-two"><div class="pm-box2"><small>Morning start</small><strong>' + startKm.toLocaleString('en-IN') + ' km</strong></div><div><label class="pm-lab" for="pmEnd">Ending KM</label><div class="field" id="pmEndF"><input type="number" id="pmEnd" inputmode="numeric" placeholder="' + startKm + '" style="font-weight:700;font-size:18px"></div></div></div><div class="msg" id="pmMsg"></div><div class="pm-driven"><small>Distance driven today</small><strong id="pmDriven">-- km</strong></div></div>' +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">3</span>Returns &amp; undelivered stock</div>' + (rows.length ? rows.join('') : '<div class="pm-clean">All deliveries completed. No returned goods to hand over.</div>') + '<label class="pm-check"><input type="checkbox" id="pmRet"' + (rows.length ? '' : ' checked') + '><div><b>Returned items handed to supervisor</b><span>All returned or cancelled parcels placed back on racks</span></div></label></div>' +
      '<div class="pm-card"><div class="pm-st"><span class="pm-n">4</span>Keys &amp; paper invoices</div><label class="pm-check"><input type="checkbox" id="pmInv"><div><b>Vehicle keys &amp; signed invoices deposited</b><span>Handed over physical papers to office desk</span></div></label></div>' +
      '<div class="pm-sum"><b>' + esc(worker.name || '') + '</b><p>Shift: ' + esc(shift.punchInTime || '--') + ' to ' + endTime + '</p><div class="pm-sg"><div><small>Vehicle</small><strong>' + esc(shift.assignedVehicle || '--') + '</strong></div><div><small>Deliveries</small><strong>' + done + ' of ' + shops.length + ' delivered</strong></div></div></div>';
    $('pmFoot').innerHTML = '<button type="button" class="pm-go red" id="pmGo" disabled>Confirm &amp; Punch Out</button><div class="pm-todo" id="pmTodo"></div><a class="pm-wa" id="pmWa" href="#" target="_blank" rel="noopener">Share day summary on WhatsApp (optional)</a>';
    depotCheck($('pmGps'), 'Vehicle is back at the depot');
    function calc() {
      var v = parseInt($('pmEnd').value, 10), msg = $('pmMsg'); $('pmEndF').classList.remove('err'); msg.textContent = ''; msg.style.color = '';
      if (isNaN(v)) { $('pmDriven').textContent = '-- km'; return false; }
      if (v < startKm) { $('pmEndF').classList.add('err'); msg.textContent = 'Ending KM cannot be lower than morning start (' + startKm.toLocaleString('en-IN') + ' km)'; $('pmDriven').textContent = 'Invalid'; return false; }
      $('pmDriven').textContent = (v - startKm) + ' km'; if (v - startKm > 250) { msg.style.color = 'var(--accent)'; msg.textContent = 'High mileage: ' + (v - startKm) + ' km driven today.'; }
      return true;
    }
    function validate() {
      var ok = calc(), todo = []; if (!ok) todo.push('enter ending KM'); if (!$('pmRet').checked) todo.push('confirm returns handed over'); if (!$('pmInv').checked) todo.push('confirm keys & invoices deposited');
      $('pmGo').disabled = todo.length > 0; $('pmTodo').textContent = todo.length ? 'To do: ' + todo.join(', ') : '';
      var v = parseInt($('pmEnd').value, 10);
      $('pmWa').href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent('GM-CRM Day Summary - ' + (worker.name || '') + '\nDate: ' + now.toLocaleDateString('en-IN') + '\nVehicle: ' + (shift.assignedVehicle || '--') + '\nStart KM: ' + startKm + ' | End KM: ' + ($('pmEnd').value || '--') + ' (Driven: ' + (isNaN(v) ? '--' : v - startKm) + ' km)\nDeliveries: ' + done + ' / ' + shops.length + ' completed');
    }
    $('pmEnd').oninput = validate; $('pmRet').onchange = validate; $('pmInv').onchange = validate; validate();
    $('pmGo').onclick = function () {
      var v = parseInt($('pmEnd').value, 10);
      GM.updateShift({ punchedOut: true, punchOutTime: endTime, endKm: v, drivenKm: v - startKm, handoverCompleted: true });
      this.disabled = true; this.textContent = 'Day closed. Summary sent to the office.';
      setTimeout(function () { localStorage.removeItem('gm_logged_in'); alert('Shift completed successfully! See you tomorrow, ' + (worker.name || '') + '.'); location.href = 'login.html'; }, 1000);
    };
    show();
  }
  function show() { ov.classList.add('open'); document.body.style.overflow = 'hidden'; $('pmBody').scrollTop = 0; }

  window.PunchModal = { openIn: openIn, openOut: openOut, close: close };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/(^|\/)punch-in\.html([?#]|$)/.test(h)) { e.preventDefault(); openIn(); }
    else if (/(^|\/)punch-out\.html([?#]|$)/.test(h)) { e.preventDefault(); openOut(); }
  });
})();