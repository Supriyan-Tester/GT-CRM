/* General Traders - first-use privacy notice for drivers and helpers.
   Shown once. When the person taps "I understand", the SERVER saves it with the server's own clock
   (so the time cannot be changed from the phone) and the office can see it in Admin > Profile.
   The phone also remembers it, so the notice is not shown again on this phone. */
(function () {
  'use strict';
  var KEY = 'gm_privacy_ok_v1', UNSENT = 'gm_privacy_unsent_v1';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function send(method, cb) {
    try {
      fetch('/api/consent', { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (j) { cb(null, j); }).catch(function (e) { cb(e || true); });
    } catch (e) { cb(e); }
  }
  function sendOnce() { send('POST', function (err, j) { if (!err && j && j.ok) ls(UNSENT, null); }); }

  if (ls(KEY)) { if (ls(UNSENT)) sendOnce(); return; }       // already accepted on this phone

  function build() {
    if (document.getElementById('gmPrivacy')) return;
    var st = document.createElement('style');
    st.textContent = '#gmPrivacy{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;padding:0}' +
      '#gmPrivacy .pb{background:var(--card,#fff);color:var(--text,#0f172a);width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,.3)}' +
      '@media(min-width:600px){#gmPrivacy{align-items:center}#gmPrivacy .pb{border-radius:20px}}' +
      '#gmPrivacy h3{margin:0 0 8px;font-size:19px}#gmPrivacy p{margin:6px 0;font-size:14.5px;line-height:1.5}#gmPrivacy ul{margin:6px 0 10px;padding-left:20px;font-size:14.5px;line-height:1.5}' +
      '#gmPrivacy a{color:var(--primary,#0f766e);font-weight:600}' +
      '#gmPrivacy button{width:100%;margin-top:10px;padding:14px;border:0;border-radius:12px;background:var(--primary,#0f766e);color:var(--on-primary,#fff);font-weight:700;font-size:16px;font-family:inherit;cursor:pointer}';
    document.head.appendChild(st);
    var ov = document.createElement('div'); ov.id = 'gmPrivacy'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'gmPrivT');
    ov.innerHTML = '<div class="pb"><h3 id="gmPrivT">Before you start</h3>' +
      '<p>This app keeps some of your details for work. Please read:</p>' +
      '<ul><li>Your <b>location</b> is taken only when you tap Punch In, Punch Out, Arrived, Delivered, Problem or Save shop location.</li>' +
      '<li>Your <b>photo</b> is taken when you punch in.</li>' +
      '<li>The office sees your attendance, deliveries and advances.</li>' +
      '<li>The app does <b>not</b> follow you when it is closed.</li></ul>' +
      '<p><a href="../privacy.html" target="_blank" rel="noopener">Read the full privacy notice</a></p>' +
      '<button type="button" id="gmPrivOk">I understand</button></div>';
    document.body.appendChild(ov);
    document.getElementById('gmPrivOk').onclick = function () {
      ls(KEY, new Date().toISOString()); ls(UNSENT, '1'); sendOnce(); ov.remove();
    };
  }
  function start() {
    // New phone? Ask the server first: if this person already accepted, do not ask again.
    send('GET', function (err, j) {
      if (!err && j && j.at) { ls(KEY, j.at); return; }
      if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
    });
  }
  start();
})();
