/* GM CRM - the one shared icon set.
   Every icon in the app lives here, once, under a plain name (for example "home", "map-pin", "delivery-van").
   Nothing else in the code draws icons by hand any more.

   In an HTML page:      <svg class="icon" data-icon="map-pin"></svg>
   In JavaScript:        GMIcons.svg("map-pin", "icon")        -> the finished <svg ...> text
   Only the shapes:      GMIcons.paths["map-pin"]
   See what exists:      GMIcons.names()

   All icons are drawn on a 24 x 24 grid. The colour, thickness and size come from the page's CSS (".icon" and friends),
   so changing one icon here changes it everywhere. To add an icon, add one line to the list below. */
(function () {
  var paths = {
    /* ---------- Arrows and navigation ---------- */
    "arrow-left": '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    "arrow-right": '<path d="M4 12h16M14 6l6 6-6 6"/>',
    "arrow-up": '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    "arrow-down": '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
    "arrow-to-top":
      '<path d="M5 4h14"/><path d="M12 20V9"/><path d="M6 14l6-6 6 6"/>',
    "arrow-to-bottom":
      '<path d="M5 20h14"/><path d="M12 4v11"/><path d="M6 10l6 6 6-6"/>',
    "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
    "chevron-right": '<path d="M9 6l6 6-6 6"/>',
    "chevron-up": '<path d="M6 15l6-6 6 6"/>',
    "chevron-down": '<path d="M6 9l6 6 6-6"/>',
    navigate: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    "external-link":
      '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    merge:
      '<path d="M6 4v5a6 6 0 0 0 6 6h6"/><path d="M15 11l4 4-4 4"/><path d="M6 20V9"/>',

    /* ---------- Actions ---------- */
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    "cloud-upload":
      '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18"/><path d="M12 12v8M9 15l3-3 3 3"/>',
    print:
      '<path d="M6 9V3h12v6"/><path d="M6 18H4v-7h16v7h-2"/><path d="M7 14h10v7H7z"/>',
    share:
      '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.5-3.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15M20 20v-5h-5"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
    login:
      '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    logout:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    eye: '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off":
      '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10.5 7 10.5 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.4 1.5 12 1.5 12s4 7 10.5 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M17 6l3 3"/>',

    /* ---------- Menus and layout ---------- */
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    panel:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/>',
    "dots-horizontal":
      '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="12" r="2.1"/></g>',
    "dots-vertical":
      '<g fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="12" cy="19" r="2.1"/></g>',
    grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="5.5" r="1.7"/><circle cx="15" cy="5.5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18.5" r="1.7"/><circle cx="15" cy="18.5" r="1.7"/></g>',

    /* ---------- Status ---------- */
    "check-circle":
      '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    "alert-circle":
      '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    "alert-triangle":
      '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    "help-circle":
      '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',

    /* ---------- People ---------- */
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:
      '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M17 4a4 4 0 0 1 0 8"/><path d="M22 21v-1a6 6 0 0 0-4-5.6"/>',
    team: '<circle cx="8" cy="8" r="2.8"/><circle cx="17" cy="9" r="2.3"/><path d="M2.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5M14.5 14c3 0 6 1.2 7 4.5"/>',
    headset:
      '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 1.7-1.8 2.5-5 2.5"/>',

    /* ---------- Places and maps ---------- */
    map: '<path d="M9 20l-6-2V4l6 2 6-2 6 2v14l-6-2-6 2zM9 6v14M15 4v14"/>',
    "map-pin":
      '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    "pin-off":
      '<path d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21z"/><path d="M4 4l16 16"/>',
    locate:
      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
    route:
      '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',

    /* ---------- Shops, goods and delivery ---------- */
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    store:
      '<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
    storefront:
      '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M10 20v-5h4v5"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2.5l2.2 11h10.6L21 7H6.4"/>',
    truck:
      '<path d="M1 6h13v10H1zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    "delivery-van":
      '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 8h4"/>',
    wrench:
      '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 14l4-5"/>',

    /* ---------- Money and documents ---------- */
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 6v12"/>',
    rupee: '<path d="M6 4h12M6 9h12M9 4c5 0 7 2 7 5s-2 5-7 5l7 6"/>',
    "credit-card":
      '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    briefcase:
      '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    receipt:
      '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
    "door-closed":
      '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 21h14M15 12h.01"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/>',
    document: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
    report: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
    "clipboard-list":
      '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    "clipboard-plus":
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 9v6M9 12h6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',

    /* ---------- Time, phone and photos ---------- */
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    hourglass:
      '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    phone:
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    camera:
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    whatsapp:
      '<path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.2 13.9c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.800s.7-2 1-2.300c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.500l.8 2c.1.2.1.4 0 .5l-.4.600c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.300z"/>',

    /* ---------- Settings and theme ---------- */
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  };

  var NS = 'viewBox="0 0 24 24" aria-hidden="true"';

  // The finished <svg> text for an icon name. cls = css class (optional), attrs = extra attributes such as 'fill="none" stroke="currentColor"'.
  function svg(name, cls, attrs) {
    var p = paths[name];
    if (p === undefined) {
      if (window.console) console.warn('GMIcons: no icon named "' + name + '"');
      p = "";
    }
    return (
      "<svg" +
      (cls ? ' class="' + cls + '"' : "") +
      " " +
      NS +
      (attrs ? " " + attrs : "") +
      ">" +
      p +
      "</svg>"
    );
  }

  // Fills every <svg data-icon="name"> that is still empty.
  function hydrate(root) {
    var list = (root || document).querySelectorAll
      ? (root || document).querySelectorAll(
          "svg[data-icon]:not([data-icon-done])",
        )
      : [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i],
        name = el.getAttribute("data-icon");
      if (paths[name] === undefined) {
        if (window.console)
          console.warn('GMIcons: no icon named "' + name + '"');
        continue;
      }
      if (!el.getAttribute("viewBox")) el.setAttribute("viewBox", "0 0 24 24");
      if (!el.getAttribute("aria-hidden"))
        el.setAttribute("aria-hidden", "true");
      el.innerHTML = paths[name];
      el.setAttribute("data-icon-done", "1");
    }
  }

  window.GMIcons = {
    paths: paths,
    svg: svg,
    hydrate: hydrate,
    has: function (name) {
      return paths[name] !== undefined;
    },
    names: function () {
      return Object.keys(paths);
    },
  };

  // Icons written in the page (or added to it later) are filled in as soon as they appear.
  if (window.MutationObserver && document.documentElement) {
    new MutationObserver(function () {
      hydrate(document);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () {
      hydrate(document);
    });
  else hydrate(document);
})();
