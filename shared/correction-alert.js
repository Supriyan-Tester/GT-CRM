/* Tells an employee (sales or delivery) when the office asked them to correct a collection:
   a red count on the Account / Collections menu items, and a banner on the Home screen. */
(function () {
  if (window.__gmCorrAlert) return;
  window.__gmCorrAlert = true;
  var count = 0, items = [], timer = 0;
  var st = document.createElement("style");
  st.textContent =
    ".gm-badge{display:inline-block;min-width:18px;height:18px;line-height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle}" +
    ".gm-corr{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px 14px;margin:0 0 12px;border-radius:14px;border:1px solid rgba(220,38,38,.45);background:rgba(220,38,38,.09);color:inherit;font-size:14px}" +
    ".gm-corr small{display:block;opacity:.8;margin-top:2px;font-size:12px}" +
    ".gm-corr a{flex:none;padding:9px 14px;border-radius:10px;background:#dc2626;color:#fff;font-weight:700;font-size:13px;text-decoration:none}";
  document.head.appendChild(st);

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function apply() {
    // 1. red count on the menu items that lead to collections
    document.querySelectorAll('a[href$="advances.html"],a[href$="collections.html"],a[href$="collections-history.html"]').forEach(function (a) {
      if (a.classList.contains("gm-corr-btn")) return;
      var b = a.querySelector(".gm-badge");
      if (!count) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("span"); b.className = "gm-badge"; a.appendChild(b); }
      if (b.textContent !== String(count)) b.textContent = count;
    });
    // 2. banner on the Home screen
    var home = /\/home\.html$/.test(location.pathname);
    var old = document.getElementById("gmCorr");
    if (!home || !count) { if (old) old.remove(); return; }
    var host = document.querySelector("main.app") || document.getElementById("main");
    if (!host) return;
    var one = count === 1 && items[0];
    var html = "<div><b>Office asked you to correct " + count + (count === 1 ? " collection" : " collections") + "</b>" +
      (one ? "<small>" + esc(items[0].customerName) + (items[0].note ? ": " + esc(items[0].note) : "") + "</small>" : "") + "</div>" +
      '<a class="gm-corr-btn" href="collections-history.html?all=1">Review</a>';
    if (!old) { old = document.createElement("div"); old.id = "gmCorr"; old.className = "gm-corr"; host.insertBefore(old, host.firstChild); }
    if (old.parentNode !== host) host.insertBefore(old, host.firstChild);
    if (old.innerHTML !== html) old.innerHTML = html;
  }
  function load() {
    fetch("/api/accounts/collections/corrections", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (!j || !j.ok) return; count = Number(j.count) || 0; items = j.items || []; apply(); })
      .catch(function () {});
  }
  // Menus and the Home screen are drawn after the page loads, so re-apply when the page changes.
  new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(apply, 120); })
    .observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
  load();
})();
