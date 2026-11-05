/* Lightweight loading feedback for GM-CRM.
   - Initial page rendering is never blocked by a full-screen overlay.
   - Navigation and user-triggered requests show a top progress bar immediately.
   - A spinner appears only if the operation is still pending after 350 ms.
   - Background sync/polling is ignored.
*/
(function () {
  "use strict";
  if (window.GMLoading) return;

  var css =
    "#gml-bar{position:fixed;top:0;left:0;height:3px;width:0;background:#0f9f91;z-index:100000;opacity:0;pointer-events:none;transition:width .25s ease,opacity .2s ease}" +
    "#gml-ov{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.18);-webkit-tap-highlight-color:transparent}" +
    "#gml-ov.on{display:flex;animation:gmlfade .12s ease-out}@keyframes gmlfade{from{opacity:0}to{opacity:1}}" +
    "#gml-box{background:#fff;color:#334155;border-radius:12px;padding:13px 18px;display:flex;align-items:center;gap:11px;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.18)}" +
    "html[data-theme=dark] #gml-box{background:#172235;color:#e2e8f0}" +
    "#gml-sp{width:19px;height:19px;flex:0 0 19px;border-radius:50%;border:2.5px solid #cbd5e1;border-top-color:#0f9f91;animation:gmlspin .7s linear infinite}" +
    "@keyframes gmlspin{to{transform:rotate(360deg)}}" +
    "@media(prefers-reduced-motion:reduce){#gml-sp{animation-duration:1.6s}}";

  var bar, ov, pending = 0, lastTap = 0, tShow = 0, tSafe = 0, tBar = 0, w = 0;

  function build() {
    if (bar) return;
    var st = document.createElement("style");
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
    bar = document.createElement("div");
    bar.id = "gml-bar";
    ov = document.createElement("div");
    ov.id = "gml-ov";
    ov.setAttribute("role", "status");
    ov.setAttribute("aria-live", "polite");
    ov.innerHTML = '<div id="gml-box"><div id="gml-sp"></div><span>Working…</span></div>';
    (document.body || document.documentElement).appendChild(bar);
    (document.body || document.documentElement).appendChild(ov);
  }

  function creep() {
    if (!bar || pending < 1) return;
    w += (92 - w) * 0.12;
    bar.style.width = w + "%";
    tBar = setTimeout(creep, 350);
  }

  function begin() {
    build();
    pending++;
    if (pending > 1) return;

    clearTimeout(tShow);
    clearTimeout(tBar);
    clearTimeout(tSafe);
    w = 7;
    bar.style.transition = "none";
    bar.style.width = "0";
    void bar.offsetWidth;
    bar.style.transition = "width .25s ease,opacity .2s ease";
    bar.style.opacity = "1";
    bar.style.width = "7%";
    tBar = setTimeout(creep, 250);

    // Avoid flashing a modal spinner for fast navigation/API responses.
    tShow = setTimeout(function () {
      if (pending > 0 && ov) ov.classList.add("on");
    }, 350);

    tSafe = setTimeout(function () {
      pending = 0;
      finish();
    }, 25000);
  }

  function finish() {
    if (!bar) return;
    clearTimeout(tShow);
    clearTimeout(tBar);
    clearTimeout(tSafe);
    if (ov) ov.classList.remove("on");
    bar.style.width = "100%";
    setTimeout(function () {
      if (pending === 0 && bar) {
        bar.style.opacity = "0";
        setTimeout(function () {
          if (pending === 0 && bar) bar.style.width = "0";
        }, 220);
      }
    }, 150);
  }

  function end(force) {
    if (force) pending = 0;
    else pending = Math.max(0, pending - 1);
    if (pending === 0) finish();
  }

  function userNow() {
    return Date.now() - lastTap < 1500;
  }

  ["pointerdown", "click", "keydown", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, function () {
      lastTap = Date.now();
    }, true);
  });

  // Same-origin navigation: progress bar now, spinner only if it takes longer.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button > 0) return;
    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#" ||
        /^(javascript:|tel:|mailto:|sms:|whatsapp:|blob:|data:)/i.test(href)) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;

    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin) return;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return;

    setTimeout(function () {
      if (!e.defaultPrevented) begin();
    }, 0);
  }, false);

  document.addEventListener("submit", function (e) {
    setTimeout(function () {
      if (!e.defaultPrevented) begin();
    }, 0);
  }, false);

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) end(true);
  });

  // Track only requests caused by a recent user action. Background sync is excluded.
  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function () {
      if (!userNow()) return originalFetch.apply(this, arguments);
      begin();
      var done = false;
      function complete() {
        if (done) return;
        done = true;
        end();
      }
      var promise;
      try {
        promise = originalFetch.apply(this, arguments);
      } catch (err) {
        complete();
        throw err;
      }
      return promise.then(function (result) {
        complete();
        return result;
      }, function (error) {
        complete();
        throw error;
      });
    };
  }

  if (window.XMLHttpRequest) {
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (userNow()) {
        begin();
        var xhr = this;
        var done = false;
        xhr.addEventListener("loadend", function () {
          if (done) return;
          done = true;
          end();
        }, { once: true });
      }
      return originalSend.apply(this, arguments);
    };
  }

  window.GMLoading = {
    begin: begin,
    end: function () { end(); },
    reset: function () { end(true); }
  };
})();
