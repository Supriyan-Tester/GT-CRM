/* Loading feedback for every tap (all pages). On a slow network a tap can look like nothing happened, so:
   - a thin progress bar at the top shows at once,
   - the spinner screen shows at the same moment (it also stops a second accidental tap).
   The same screen also covers a page that is still opening: it shows as soon as a page starts and goes off once the page and the
   data it asked for have arrived (max 10 s), so the person never sees a blank page.
   It starts when a tap/click opens another page or sends a request to the server. Background requests (automatic refresh) are
   ignored: only requests that start within 1.5 s of a tap, click or key press count. It always clears itself after 25 s. */
(function () {
  "use strict";
  if (window.GMLoading) return;
  var css =
    "#gml-bar{position:fixed;top:0;left:0;height:4px;width:0;background:#f59e0b;z-index:100000;opacity:0;pointer-events:none;transition:width .4s ease,opacity .25s ease;box-shadow:0 0 8px rgba(245,158,11,.8)}" +
    "#gml-ov{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.28);-webkit-tap-highlight-color:transparent}" +
    "#gml-ov.init{background:rgba(246,248,250,.98)}html[data-theme=dark] #gml-ov.init{background:rgba(11,18,32,.98)}" +
    "#gml-ov.on{display:flex;animation:gmlfade .12s ease-out}@keyframes gmlfade{from{opacity:0}to{opacity:1}}" +
    "#gml-box{background:#fff;color:#334155;border-radius:14px;padding:16px 22px;display:flex;align-items:center;gap:12px;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)}" +
    "#gml-sp{width:22px;height:22px;border-radius:50%;border:3px solid #cbd5e1;border-top-color:#0f766e;animation:gmlspin .7s linear infinite}" +
    "@keyframes gmlspin{to{transform:rotate(360deg)}}" +
    "@media (prefers-reduced-motion:reduce){#gml-sp{animation-duration:1.6s}}";
  var bar, ov, pending = 0, lastTap = 0, tShow = 0, tSafe = 0, tBar = 0, w = 0;

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
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
    ov.innerHTML = '<div id="gml-box"><div id="gml-sp"></div><span>Loading\u2026</span></div>';
    (document.body || document.documentElement).appendChild(bar);
    (document.body || document.documentElement).appendChild(ov);
  }
  function creep() {
    // the bar moves forward but never reaches the end until the work is done
    w = w + (90 - w) * 0.12;
    bar.style.width = w + "%";
    tBar = setTimeout(creep, 400);
  }
  function begin() {
    pending++;
    if (pending > 1) return;
    (function () {
      build();
      if (pending < 1) return;
      clearTimeout(tBar);
      w = 8;
      bar.style.transition = "none";
      bar.style.width = "0";
      void bar.offsetWidth;
      bar.style.transition = "width .4s ease,opacity .25s ease";
      bar.style.opacity = "1";
      bar.style.width = "8%";
      tBar = setTimeout(creep, 300);
      clearTimeout(tShow);
      ov.classList.add("on"); // spinner screen shows at the same moment as the bar
    })();
    clearTimeout(tSafe);
    tSafe = setTimeout(function () {
      pending = 0;
      end(true);
    }, 25000);
  }
  function end(force) {
    if (!force) pending = Math.max(0, pending - 1);
    if (pending > 0 || !bar) return;
    clearTimeout(tShow);
    clearTimeout(tBar);
    clearTimeout(tSafe);
    ov.classList.remove("on");
    bar.style.width = "100%";
    setTimeout(function () {
      if (pending === 0) bar.style.opacity = "0";
    }, 180);
  }
  var initial = true, loaded = false, fetching = 0, tInit = 0;
  function initDone() {
    if (!initial) return;
    initial = false;
    clearTimeout(tInit);
    if (ov) ov.classList.remove("init");
    end();
  }
  function initCheck() {
    if (!initial || !loaded) return;
    if (fetching > 0) return;
    clearTimeout(tInit);
    tInit = setTimeout(function () {
      if (fetching === 0) initDone();
      else initCheck();
    }, 350);
  }
  function userNow() {
    return Date.now() - lastTap < 1500;
  }
  ["pointerdown", "click", "keydown", "touchstart"].forEach(function (ev) {
    document.addEventListener(
      ev,
      function () {
        lastTap = Date.now();
      },
      true,
    );
  });

  // 0) the page itself is opening: cover it until it and its data have arrived (never longer than 10 s)
  begin();
  if (ov) ov.classList.add("init");
  window.addEventListener("load", function () {
    loaded = true;
    initCheck();
  });
  setTimeout(initDone, 10000);

  // 1) a tap on a link that opens another page
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button > 0) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || /^(javascript:|tel:|mailto:|sms:|whatsapp:|blob:|data:)/i.test(href)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      var u;
      try {
        u = new URL(a.href, location.href);
      } catch (x) {
        return;
      }
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search && u.hash) return;
      setTimeout(function () {
        if (e.defaultPrevented) return; // a page script handled this tap itself (it shows its own progress if needed)
        begin();
      }, 0);
    },
    false,
  );
  // 2) a form that is sent to the server
  document.addEventListener(
    "submit",
    function (e) {
      setTimeout(function () {
        if (!e.defaultPrevented) begin();
      }, 0);
    },
    false,
  );
  // a page shown again from the back button must not stay stuck on "Loading"
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    initial = false;
    pending = 0;
    if (ov) ov.classList.remove("init");
    end(true);
  });

  // 3) requests to the server that follow a tap (save, delete, search, ...)
  if (window.fetch) {
    var _f = window.fetch;
    window.fetch = function () {
      var inInit = initial;
      if (!inInit && !userNow()) return _f.apply(this, arguments);
      if (inInit) fetching++;
      else begin();
      var done = false,
        fin = function () {
          if (!done) {
            done = true;
            if (inInit) {
              fetching = Math.max(0, fetching - 1);
              initCheck();
            } else end();
          }
        },
        p;
      try {
        p = _f.apply(this, arguments);
      } catch (e) {
        fin();
        throw e;
      }
      p.then(fin, fin);
      return p;
    };
  }
  if (window.XMLHttpRequest) {
    var _s = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (userNow()) {
        begin();
        var done = false,
          fin = function () {
            if (!done) {
              done = true;
              end();
            }
          };
        this.addEventListener("loadend", fin);
      }
      return _s.apply(this, arguments);
    };
  }
  window.GMLoading = { begin: begin, end: function () { end(); } };
})();
