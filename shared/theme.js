/* General Traders (GM-CRM) - Theme Switcher
   Standardizes 'gt-theme' in localStorage across all screens.
*/
(function () {
  var root = document.documentElement;

  function applyTheme(theme, save) {
    root.setAttribute("data-theme", theme);

    // Update theme-toggle buttons if present on the screen
    var btn = document.getElementById("themeToggle");
    [].forEach.call(document.querySelectorAll("[data-set]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-set") === theme);
    });
    if (btn && !btn.getAttribute("data-gt-switch")) {
      btn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      );
    }

    var tl = document.getElementById("tl");
    var td = document.getElementById("td");
    if (tl) tl.setAttribute("aria-pressed", theme === "light");
    if (td) td.setAttribute("aria-pressed", theme === "dark");

    if (save) {
      try {
        localStorage.setItem("gt-theme", theme);
      } catch (e) {}
    }
  }

  // Load saved theme or system preference
  var saved = null;
  try {
    saved = localStorage.getItem("gt-theme");
  } catch (e) {}

  var prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  var initialTheme = saved || (prefersDark ? "dark" : "light");
  applyTheme(initialTheme, false);

  // Setup click listeners once DOM is ready
  function fillShared() {
    try {
      if (!window.GM) return;
      var w = GM.getWorker();
      [].forEach.call(
        document.querySelectorAll("[data-admin-phone]"),
        function (e) {
          e.textContent = w.adminPhone || "";
        },
      );
      [].forEach.call(
        document.querySelectorAll("[data-admin-call]"),
        function (e) {
          e.setAttribute("href", "tel:" + (w.adminPhone || ""));
        },
      );
      [].forEach.call(
        document.querySelectorAll("[data-worker-name]"),
        function (e) {
          e.textContent = w.name || "";
        },
      );
    } catch (err) {}
  }

  // Every in-app theme button becomes the same sliding light/dark pill used on the sign-in page.
  function upgradeToggle() {
    var old = document.getElementById("themeToggle");
    if (!old || old.getAttribute("data-gt-switch")) return;
    var sun = GMIcons.svg("sun"),
      moon = GMIcons.svg("moon");
    var sw = document.createElement("div");
    sw.id = "themeToggle";
    sw.className = "gt-switch";
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "Theme");
    sw.setAttribute("data-gt-switch", "1");
    sw.innerHTML =
      '<button type="button" data-set="light" aria-label="Light theme">' +
      sun +
      '</button><button type="button" data-set="dark" aria-label="Dark theme">' +
      moon +
      "</button>";
    old.parentNode.replaceChild(sw, old);
    sw.onclick = function (e) {
      var b = e.target.closest ? e.target.closest("[data-set]") : null;
      // a script calling .click() on the switch (no inner button) flips the theme
      applyTheme(
        b
          ? b.getAttribute("data-set")
          : root.getAttribute("data-theme") === "dark"
            ? "light"
            : "dark",
        true,
      );
    };
    applyTheme(root.getAttribute("data-theme") || "light", false);
  }

  function initListeners() {
    fillShared();
    upgradeToggle();
    var toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn && !toggleBtn.getAttribute("data-gt-switch")) {
      toggleBtn.onclick = function () {
        var current =
          root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(current, true);
      };
    }

    var tl = document.getElementById("tl");
    var td = document.getElementById("td");
    if (tl)
      tl.onclick = function () {
        applyTheme("light", true);
      };
    if (td)
      td.onclick = function () {
        applyTheme("dark", true);
      };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initListeners);
  } else {
    initListeners();
  }

  // Expose helper globally
  window.GM_THEME = {
    set: function (t) {
      applyTheme(t, true);
    },
    get: function () {
      return root.getAttribute("data-theme") || "light";
    },
  };
})();

// ==========================================================
// GM-CALENDAR-CENTRALIZED
// Migrated from shared/calendar.js
// ==========================================================

/* GM-CALENDAR-CENTRALIZED */

/* ============================================================
   GENERAL TRADERS - CUSTOM CALENDAR V2
   ============================================================ */

(function () {
  "use strict";

  if (window.GTCalendarV2Loaded) return;

  window.GTCalendarV2Loaded = true;

  var active = null;
  var counter = 0;

  var months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function makeISO(d) {
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    );
  }

  function parse(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    var p = value.split("-").map(Number);

    return new Date(p[0], p[1] - 1, p[2]);
  }

  function today() {
    var d = new Date();

    return makeISO(d);
  }

  function format(value) {
    var d = parse(value);

    if (!d) return "Select date";

    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function same(a, b) {
    return (
      a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function outsideLimit(instance, value) {
    var min = instance.input.getAttribute("min");
    var max = instance.input.getAttribute("max");

    if (min && value < min) return true;
    if (max && value > max) return true;

    return false;
  }

  function close(instance) {
    if (!instance) return;

    instance.wrapper.classList.remove("open");
    instance.pop.classList.remove("open");
    instance.trigger.setAttribute("aria-expanded", "false");
  }

  function closeActive() {
    if (active) {
      close(active);
      active = null;
    }
  }

  function position(instance) {
    var r = instance.trigger.getBoundingClientRect();

    var width = Math.max(300, r.width);

    width = Math.min(width, window.innerWidth - 20);

    var left = r.left;

    if (left + width > window.innerWidth - 10) {
      left = window.innerWidth - width - 10;
    }

    if (left < 10) left = 10;

    var popHeight = 390;

    var below = window.innerHeight - r.bottom;
    var above = r.top;

    var top;

    if (below >= 300 || below >= above) {
      top = r.bottom + 7;
    } else {
      top = r.top - popHeight - 7;
    }

    if (top < 10) top = 10;

    instance.pop.style.left = Math.round(left) + "px";
    instance.pop.style.top = Math.round(top) + "px";
    instance.pop.style.width = Math.round(width) + "px";
  }

  /* Month + year dropdowns in the calendar header (jump straight to e.g. 2001) */
  function yearRange(input, viewYear) {
    var lo = 1900,
      hi = new Date().getFullYear() + 10;
    var mn = /^(\d{4})/.exec(input.getAttribute("min") || "");
    var mx = /^(\d{4})/.exec(input.getAttribute("max") || "");
    if (mn) lo = +mn[1];
    if (mx) hi = +mx[1];
    if (hi < lo) hi = lo;
    if (viewYear < lo) lo = viewYear;
    if (viewYear > hi) hi = viewYear;
    return [lo, hi];
  }

  function syncTitle(instance) {
    var vy = instance.view.getFullYear();
    var r = yearRange(instance.input, vy);
    var key = r[0] + "-" + r[1];
    if (instance.yearKey !== key) {
      var h = "";
      for (var y = r[1]; y >= r[0]; y--) {
        h += '<option value="' + y + '">' + y + "</option>";
      }
      instance.yearSel.innerHTML = h;
      instance.yearKey = key;
    }
    instance.monthSel.value = String(instance.view.getMonth());
    instance.yearSel.value = String(vy);
  }

  function render(instance) {
    var view = instance.view;

    syncTitle(instance);

    instance.days.innerHTML = "";

    var year = view.getFullYear();
    var month = view.getMonth();

    var first = new Date(year, month, 1);
    var start = first.getDay();

    var days = new Date(year, month + 1, 0).getDate();

    var previousDays = new Date(year, month, 0).getDate();

    var selected = parse(instance.input.value);
    var now = parse(today());

    for (var i = 0; i < 42; i++) {
      var n = i - start + 1;
      var d;
      var isOutside = false;

      if (n < 1) {
        d = new Date(year, month - 1, previousDays + n);
        isOutside = true;
      } else if (n > days) {
        d = new Date(year, month + 1, n - days);
        isOutside = true;
      } else {
        d = new Date(year, month, n);
      }

      var value = makeISO(d);

      var btn = document.createElement("button");

      btn.type = "button";
      btn.className = "gt-cal-day";

      if (isOutside) {
        btn.classList.add("outside");
      }

      if (same(d, selected)) {
        btn.classList.add("selected");
      }

      if (same(d, now)) {
        btn.classList.add("today");
      }

      var disabled = outsideLimit(instance, value);

      if (disabled) {
        btn.classList.add("disabled");
      }

      btn.textContent = d.getDate();

      btn.setAttribute("aria-label", format(value));

      btn.addEventListener(
        "click",
        (function (v, blocked) {
          return function () {
            if (blocked) return;

            instance.input.value = v;

            instance.input.dispatchEvent(new Event("input", { bubbles: true }));

            instance.input.dispatchEvent(
              new Event("change", { bubbles: true }),
            );

            refresh(instance);

            closeActive();
          };
        })(value, disabled),
      );

      instance.days.appendChild(btn);
    }
  }

  function refresh(instance) {
    instance.label.textContent = instance.input.value
      ? format(instance.input.value)
      : "Select date";

    var d = parse(instance.input.value);

    if (d) {
      instance.view = new Date(d.getFullYear(), d.getMonth(), 1);
    }

    render(instance);
  }

  function open(instance) {
    if (instance.input.disabled) return;

    if (active && active !== instance) {
      closeActive();
    }

    active = instance;

    instance.wrapper.classList.add("open");
    instance.pop.classList.add("open");
    instance.trigger.setAttribute("aria-expanded", "true");

    position(instance);
    render(instance);
  }

  function build(input) {
    if (!input) return;

    if (input.dataset.gtCalendarReady === "1") return;

    if (input.type !== "date") return;

    input.dataset.gtCalendarReady = "1";

    var wrapper = document.createElement("div");
    wrapper.className = "gt-cal";

    var trigger = document.createElement("button");

    trigger.type = "button";
    trigger.className = "gt-cal-trigger";

    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");

    var label = document.createElement("span");
    label.className = "gt-cal-label";

    var icon = document.createElement("span");
    icon.className = "gt-cal-icon";
    icon.setAttribute("aria-hidden", "true");

    trigger.appendChild(label);
    trigger.appendChild(icon);

    var pop = document.createElement("div");

    pop.className = "gt-cal-pop";
    pop.setAttribute("role", "dialog");

    var head = document.createElement("div");
    head.className = "gt-cal-head";

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "gt-cal-nav";
    prev.textContent = "‹";
    prev.setAttribute("aria-label", "Previous month");

    var title = document.createElement("div");
    title.className = "gt-cal-title";

    var next = document.createElement("button");
    next.type = "button";
    next.className = "gt-cal-nav";
    next.textContent = "›";
    next.setAttribute("aria-label", "Next month");

    var monthSel = document.createElement("select");
    monthSel.className = "gt-cal-sel gt-cal-sel-m";
    monthSel.setAttribute("aria-label", "Month");
    monthSel.setAttribute("data-gt-dropdown-ready", "1");
    months.forEach(function (nm, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = nm;
      monthSel.appendChild(o);
    });

    var yearSel = document.createElement("select");
    yearSel.className = "gt-cal-sel gt-cal-sel-y";
    yearSel.setAttribute("aria-label", "Year");
    yearSel.setAttribute("data-gt-dropdown-ready", "1");

    title.appendChild(monthSel);
    title.appendChild(yearSel);

    head.appendChild(prev);
    head.appendChild(title);
    head.appendChild(next);

    var week = document.createElement("div");
    week.className = "gt-cal-week";

    weekdays.forEach(function (day) {
      var span = document.createElement("span");

      span.textContent = day;

      week.appendChild(span);
    });

    var days = document.createElement("div");
    days.className = "gt-cal-days";

    var foot = document.createElement("div");
    foot.className = "gt-cal-foot";

    var todayBtn = document.createElement("button");

    todayBtn.type = "button";
    todayBtn.className = "gt-cal-today";
    todayBtn.textContent = "Today";

    foot.appendChild(todayBtn);

    pop.appendChild(head);
    pop.appendChild(week);
    pop.appendChild(days);
    pop.appendChild(foot);

    input.parentNode.insertBefore(wrapper, input);

    wrapper.appendChild(input);
    wrapper.appendChild(trigger);

    input.classList.add("gt-cal-native");

    document.body.appendChild(pop);

    var base = parse(input.value) || new Date();

    var instance = {
      input: input,
      wrapper: wrapper,
      trigger: trigger,
      label: label,
      pop: pop,
      title: title,
      monthSel: monthSel,
      yearSel: yearSel,
      days: days,

      view: new Date(base.getFullYear(), base.getMonth(), 1),
    };

    trigger.addEventListener("click", function () {
      if (wrapper.classList.contains("open")) {
        closeActive();
      } else {
        open(instance);
      }
    });

    prev.addEventListener("click", function () {
      instance.view.setMonth(instance.view.getMonth() - 1);

      render(instance);
    });

    next.addEventListener("click", function () {
      instance.view.setMonth(instance.view.getMonth() + 1);

      render(instance);
    });

    monthSel.addEventListener("change", function () {
      instance.view = new Date(instance.view.getFullYear(), +monthSel.value, 1);
      render(instance);
    });

    yearSel.addEventListener("change", function () {
      instance.view = new Date(+yearSel.value, instance.view.getMonth(), 1);
      render(instance);
    });

    todayBtn.addEventListener("click", function () {
      var value = today();

      if (outsideLimit(instance, value)) {
        return;
      }

      input.value = value;

      input.dispatchEvent(new Event("input", { bubbles: true }));

      input.dispatchEvent(new Event("change", { bubbles: true }));

      refresh(instance);

      closeActive();
    });

    trigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();

        if (wrapper.classList.contains("open")) {
          closeActive();
        } else {
          open(instance);
        }
      }

      if (e.key === "Escape") {
        closeActive();

        trigger.focus();
      }
    });

    input.addEventListener("change", function () {
      refresh(instance);
    });

    input.addEventListener("input", function () {
      refresh(instance);
    });

    refresh(instance);
  }

  function scan() {
    document.querySelectorAll("input[data-gt-legacy-off]").forEach(build);
  }

  document.addEventListener("click", function (e) {
    if (!active) return;

    if (e.target.closest(".gt-cal") || e.target.closest(".gt-cal-pop")) {
      return;
    }

    closeActive();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeActive();
    }
  });

  window.addEventListener("resize", function () {
    if (active) {
      position(active);
    }
  });

  window.addEventListener(
    "scroll",
    function () {
      if (active) {
        position(active);
      }
    },
    true,
  );

  var observer = new MutationObserver(function () {
    scan();
  });

  function init() {
    scan();

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  window.GTCalendar = {
    init: init,
    scan: scan,
    build: build,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* END GM-CALENDAR-CENTRALIZED */

// ==========================================================
// GM-DROPDOWNS-CENTRALIZED
// Migrated from shared/dropdowns.js
// ==========================================================

/* GM-DROPDOWNS-CENTRALIZED */

/* ============================================================
   GENERAL TRADERS - GLOBAL CUSTOM DROPDOWNS
   ============================================================ */

(function () {
  "use strict";

  if (window.GTCustomDropdowns) return;

  var openInstance = null;
  var uid = 0;

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function optionText(opt) {
    return opt ? opt.textContent.trim() : "";
  }

  function selectedOption(select) {
    return select.options && select.selectedIndex >= 0
      ? select.options[select.selectedIndex]
      : null;
  }

  function closeCurrent() {
    if (openInstance) {
      openInstance.close();
      openInstance = null;
    }
  }

  function position(instance) {
    if (!instance || !instance.trigger || !instance.menu) return;

    var r = instance.trigger.getBoundingClientRect();
    var gap = 6;
    var margin = 10;

    var chars = 0;
    Array.prototype.forEach.call(instance.select.options, function (o) {
      chars = Math.max(chars, (o.textContent || "").length);
    });
    var width = Math.max(r.width, Math.min(220, Math.max(110, 60 + chars * 8)));
    var left = r.left;

    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }

    if (left < margin) left = margin;

    instance.menu.style.maxHeight = "";
    var menuHeight = Math.min(
      instance.menu.scrollHeight + 2,
      360,
      window.innerHeight - 24,
    );
    var below = window.innerHeight - r.bottom;
    var above = r.top;

    var top;

    if (below >= menuHeight + gap + margin || below >= above) {
      top = r.bottom + gap;
    } else {
      top = r.top - gap - menuHeight;
    }

    if (top < margin) top = margin;

    instance.menu.style.left = Math.round(left) + "px";
    instance.menu.style.top = Math.round(top) + "px";
    instance.menu.style.width = Math.round(width) + "px";
    instance.menu.style.maxHeight =
      Math.max(120, Math.min(360, window.innerHeight - top - margin)) + "px";
  }

  function refresh(instance) {
    var select = instance.select;
    if (!select || !select.options) return;

    var opts = Array.prototype.slice.call(select.options);

    instance.menu.innerHTML = "";

    opts.forEach(function (opt, index) {
      var btn = document.createElement("button");

      btn.type = "button";
      btn.className = "gt-dd-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("data-index", String(index));
      btn.setAttribute(
        "aria-selected",
        index === select.selectedIndex ? "true" : "false",
      );

      if (index === select.selectedIndex) {
        btn.classList.add("selected");
      }

      var label = document.createElement("span");
      label.textContent = optionText(opt);

      var check = document.createElement("span");
      check.className = "gt-dd-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";

      btn.appendChild(label);
      btn.appendChild(check);

      btn.addEventListener("click", function () {
        choose(instance, index);
      });

      instance.menu.appendChild(btn);
    });

    var current = selectedOption(select);
    instance.label.textContent = current ? optionText(current) : "";

    if (select.disabled) {
      instance.wrapper.classList.add("disabled");
      instance.trigger.disabled = true;
    } else {
      instance.wrapper.classList.remove("disabled");
      instance.trigger.disabled = false;
    }
  }

  function choose(instance, index) {
    var select = instance.select;

    if (!select || !select.options[index]) return;

    var oldValue = select.value;

    select.selectedIndex = index;

    refresh(instance);

    if (openInstance === instance) {
      instance.close();
      openInstance = null;
    }

    if (oldValue !== select.value) {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      /* Keep application logic compatible even when the same option is clicked. */
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function moveActive(instance, direction) {
    var buttons = Array.prototype.slice.call(
      instance.menu.querySelectorAll(".gt-dd-option"),
    );

    if (!buttons.length) return;

    var current = buttons.findIndex(function (b) {
      return b.classList.contains("active");
    });

    if (current < 0) current = instance.select.selectedIndex;

    var next = current + direction;

    if (next < 0) next = buttons.length - 1;
    if (next >= buttons.length) next = 0;

    buttons.forEach(function (b) {
      b.classList.remove("active");
    });

    buttons[next].classList.add("active");
    buttons[next].scrollIntoView({ block: "nearest" });
  }

  function open(instance) {
    if (instance.select.disabled) return;

    if (openInstance && openInstance !== instance) {
      closeCurrent();
    }

    instance.wrapper.classList.add("open");
    instance.menu.classList.add("open");
    instance.trigger.setAttribute("aria-expanded", "true");

    openInstance = instance;

    position(instance);

    var selected = instance.menu.querySelector(".gt-dd-option.selected");

    if (selected) {
      selected.classList.add("active");
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  function close(instance) {
    instance.wrapper.classList.remove("open");
    instance.menu.classList.remove("open");
    instance.trigger.setAttribute("aria-expanded", "false");

    instance.menu
      .querySelectorAll(".gt-dd-option.active")
      .forEach(function (x) {
        x.classList.remove("active");
      });
  }

  function build(select) {
    if (!select || select.dataset.gtDropdownReady === "1") return;

    /* Don't touch the existing custom Routes selector. */
    if (
      select.closest(".rt-selwrap") ||
      select.closest(".rt-opts") ||
      select.closest(".gt-dd")
    ) {
      return;
    }

    select.dataset.gtDropdownReady = "1";

    var wrapper = document.createElement("div");
    wrapper.className = "gt-dd";

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "gt-dd-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    var label = document.createElement("span");
    label.className = "gt-dd-label";

    var chevron = document.createElement("span");
    chevron.className = "gt-dd-chevron";
    chevron.setAttribute("aria-hidden", "true");

    trigger.appendChild(label);
    trigger.appendChild(chevron);

    var menu = document.createElement("div");
    menu.className = "gt-dd-menu";
    menu.setAttribute("role", "listbox");

    var id = select.id || "gt-dd-" + ++uid;

    trigger.id = id + "-trigger";
    menu.id = id + "-menu";

    trigger.setAttribute("aria-controls", menu.id);

    wrapper.appendChild(trigger);

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    select.classList.add("gt-dd-native");

    var instance = {
      select: select,
      wrapper: wrapper,
      trigger: trigger,
      label: label,
      menu: menu,
      close: function () {
        close(instance);
      },
    };

    document.body.appendChild(menu);

    trigger.addEventListener("click", function () {
      if (wrapper.classList.contains("open")) {
        closeCurrent();
        openInstance = null;
      } else {
        open(instance);
      }
    });

    trigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();

        if (wrapper.classList.contains("open")) {
          closeCurrent();
          openInstance = null;
        } else {
          open(instance);
        }

        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();

        if (!wrapper.classList.contains("open")) {
          open(instance);
        }

        moveActive(instance, 1);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();

        if (!wrapper.classList.contains("open")) {
          open(instance);
        }

        moveActive(instance, -1);
        return;
      }

      if (e.key === "Escape") {
        closeCurrent();
        trigger.focus();
      }
    });

    select.addEventListener("change", function () {
      refresh(instance);
    });

    var observer = new MutationObserver(function () {
      refresh(instance);
    });

    observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });

    refresh(instance);
  }

  function scan(root) {
    root = root || document;

    root
      .querySelectorAll("select:not([data-gt-dropdown-ready='1'])")
      .forEach(build);
  }

  document.addEventListener("click", function (e) {
    if (!openInstance) return;

    if (e.target.closest(".gt-dd") || e.target.closest(".gt-dd-menu")) {
      return;
    }

    closeCurrent();
    openInstance = null;
  });

  window.addEventListener("resize", function () {
    if (openInstance) position(openInstance);
  });

  window.addEventListener(
    "scroll",
    function () {
      if (openInstance) position(openInstance);
    },
    true,
  );

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openInstance) {
      closeCurrent();
      openInstance = null;
    }
  });

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;

        if (node.matches && node.matches("select")) {
          build(node);
        }

        if (node.querySelectorAll) {
          node
            .querySelectorAll("select:not([data-gt-dropdown-ready='1'])")
            .forEach(build);
        }
      });
    });
  });

  function init() {
    scan(document);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  window.GTCustomDropdowns = {
    init: init,
    scan: scan,
    build: build,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* END GM-DROPDOWNS-CENTRALIZED */

/* ============================================================
   GT-CALENDAR-THEME-v1
   General Traders shared calendar
   ============================================================ */

(function () {
  "use strict";

  if (window.GTCalendar) return;

  var GTCalendar = {};

  var active = null;

  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  var WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function iso(y, m, d) {
    return y + "-" + pad(m + 1) + "-" + pad(d);
  }

  function parse(value) {
    if (!value) {
      return null;
    }

    var p = String(value).split("-");

    if (p.length !== 3) {
      return null;
    }

    var y = Number(p[0]);
    var m = Number(p[1]) - 1;
    var d = Number(p[2]);

    if (!y || m < 0 || m > 11 || !d) {
      return null;
    }

    return {
      y: y,
      m: m,
      d: d,
    };
  }

  function today() {
    var d = new Date();

    return {
      y: d.getFullYear(),
      m: d.getMonth(),
      d: d.getDate(),
    };
  }

  function sameDate(a, b) {
    return !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
  }

  function icon() {
    return GMIcons.svg(
      "calendar",
      "",
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"',
    );
  }

  function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  function firstDay(y, m) {
    return new Date(y, m, 1).getDay();
  }

  function format(value) {
    var p = parse(value);

    if (!p) {
      return "";
    }

    return pad(p.d) + "/" + pad(p.m + 1) + "/" + p.y;
  }

  function position() {
    if (!active) {
      return;
    }

    var r = active.trigger.getBoundingClientRect();

    var popup = active.popup;

    popup.style.visibility = "hidden";

    var pw = popup.offsetWidth;
    var ph = popup.offsetHeight;

    var left = r.left;
    var top = r.bottom + 7;

    if (left + pw > window.innerWidth - 10) {
      left = window.innerWidth - pw - 10;
    }

    if (left < 10) {
      left = 10;
    }

    if (top + ph > window.innerHeight - 10) {
      top = r.top - ph - 7;
    }

    if (top < 10) {
      top = 10;
    }

    popup.style.left = Math.round(left) + "px";
    popup.style.top = Math.round(top) + "px";
    popup.style.visibility = "";
  }

  function close() {
    if (!active) {
      return;
    }

    var a = active;

    active = null;

    if (a.popup && a.popup.parentNode) {
      a.popup.parentNode.removeChild(a.popup);
    }

    a.trigger.setAttribute("aria-expanded", "false");
  }

  function choose(a, value) {
    var native = a.native;

    var max = native.getAttribute("max");

    if (max && value > max) {
      return;
    }

    native.value = value;

    a.triggerText.textContent = format(value);

    try {
      native.dispatchEvent(
        new Event("input", {
          bubbles: true,
        }),
      );

      native.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      );
    } catch (e) {}

    close();
  }

  function build(a) {
    var popup = document.createElement("div");

    popup.className = "gt-calendar-popup";

    popup.setAttribute("role", "dialog");

    popup.setAttribute("aria-label", "Calendar");

    document.body.appendChild(popup);

    a.popup = popup;

    render(a);

    position();
  }

  function render(a) {
    var p = parse(a.native.value);

    if (!p) {
      var t = today();

      p = {
        y: t.y,
        m: t.m,
        d: t.d,
      };
    }

    a.year = a.year == null ? p.y : a.year;
    a.month = a.month == null ? p.m : a.month;

    var selected = parse(a.native.value);
    var t = today();

    var html = "";

    html +=
      '<div class="gt-calendar-head">' +
      '<div class="gt-calendar-month">' +
      MONTHS[a.month] +
      " " +
      a.year +
      "</div>" +
      '<div class="gt-calendar-nav">' +
      '<button type="button" data-cal="prev" aria-label="Previous month">‹</button>' +
      '<button type="button" data-cal="next" aria-label="Next month">›</button>' +
      "</div>" +
      "</div>";

    html += '<div class="gt-calendar-week">';

    WEEK.forEach(function (x) {
      html += "<span>" + x + "</span>";
    });

    html += "</div>";

    html += '<div class="gt-calendar-days">';

    var start = firstDay(a.year, a.month);

    var count = daysInMonth(a.year, a.month);

    var previousCount = daysInMonth(a.year, a.month - 1);

    var total = Math.ceil((start + count) / 7) * 7;

    for (var i = 0; i < total; i++) {
      var day = i - start + 1;

      var yy = a.year;
      var mm = a.month;
      var cls = "";

      if (day < 1) {
        day = previousCount + day;
        mm--;

        if (mm < 0) {
          mm = 11;
          yy--;
        }

        cls = "other-month";
      } else if (day > count) {
        day = day - count;
        mm++;

        if (mm > 11) {
          mm = 0;
          yy++;
        }

        cls = "other-month";
      }

      var value = iso(yy, mm, day);

      if (sameDate({ y: yy, m: mm, d: day }, t)) {
        cls += " today";
      }

      if (selected && sameDate({ y: yy, m: mm, d: day }, selected)) {
        cls += " selected";
      }

      html +=
        '<button type="button" ' +
        'class="gt-calendar-day ' +
        cls +
        '" ' +
        'data-date="' +
        value +
        '">' +
        day +
        "</button>";
    }

    html += "</div>";

    html +=
      '<div class="gt-calendar-footer">' +
      '<button type="button" data-cal="clear">Clear</button>' +
      '<button type="button" data-cal="today">Today</button>' +
      "</div>";

    a.popup.innerHTML = html;
  }

  function open(a) {
    if (active === a) {
      close();

      return;
    }

    close();

    active = a;

    var p = parse(a.native.value);

    if (!p) {
      var t = today();

      a.year = t.y;
      a.month = t.m;
    } else {
      a.year = p.y;
      a.month = p.m;
    }

    build(a);

    a.trigger.setAttribute("aria-expanded", "true");
  }

  function bind(a) {
    a.trigger.addEventListener("click", function (e) {
      e.preventDefault();

      open(a);
    });

    a.trigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();

        open(a);
      }

      if (e.key === "Escape") {
        close();
      }
    });

    a.native.addEventListener("change", function () {
      a.triggerText.textContent = format(a.native.value);
    });

    a.popup.addEventListener("click", function (e) {
      var day = e.target.closest("[data-date]");

      if (day) {
        choose(a, day.getAttribute("data-date"));

        return;
      }

      var action = e.target.closest("[data-cal]");

      if (!action) {
        return;
      }

      var type = action.getAttribute("data-cal");

      if (type === "prev") {
        a.month--;

        if (a.month < 0) {
          a.month = 11;
          a.year--;
        }

        render(a);
        position();
      } else if (type === "next") {
        a.month++;

        if (a.month > 11) {
          a.month = 0;
          a.year++;
        }

        render(a);
        position();
      } else if (type === "today") {
        var t = today();

        var value = iso(t.y, t.m, t.d);

        choose(a, value);
      } else if (type === "clear") {
        a.native.value = "";

        a.triggerText.textContent = "";

        try {
          a.native.dispatchEvent(
            new Event("input", {
              bubbles: true,
            }),
          );

          a.native.dispatchEvent(
            new Event("change", {
              bubbles: true,
            }),
          );
        } catch (err) {}

        close();
      }
    });
  }

  function attach(native) {
    if (!native || native.dataset.gtCalendar === "1") {
      return;
    }

    if (native.type !== "date") {
      return;
    }

    native.dataset.gtCalendar = "1";

    var host = document.createElement("div");

    host.className = "gt-calendar-host";

    native.parentNode.insertBefore(host, native);

    host.appendChild(native);

    native.classList.add("gt-calendar-native");

    var trigger = document.createElement("button");

    trigger.type = "button";

    trigger.className = "gt-calendar-trigger";

    trigger.setAttribute("aria-haspopup", "dialog");

    trigger.setAttribute("aria-expanded", "false");

    trigger.innerHTML =
      '<span class="gt-calendar-trigger-text">' +
      format(native.value) +
      "</span>" +
      '<span class="gt-calendar-trigger-icon">' +
      icon() +
      "</span>";

    host.appendChild(trigger);

    var a = {
      native: native,
      host: host,
      trigger: trigger,
      triggerText: trigger.querySelector(".gt-calendar-trigger-text"),
      popup: null,
      year: null,
      month: null,
    };

    bind(a);
  }

  function scan(root) {
    root = root || document;

    var inputs = root.querySelectorAll("input[data-gt-legacy-off]");

    Array.prototype.forEach.call(inputs, attach);
  }

  document.addEventListener("click", function (e) {
    if (!active) {
      return;
    }

    if (active.host.contains(e.target) || active.popup.contains(e.target)) {
      return;
    }

    close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      close();
    }
  });

  window.addEventListener("resize", function () {
    if (active) {
      position();
    }
  });

  window.addEventListener(
    "scroll",
    function () {
      if (active) {
        position();
      }
    },
    true,
  );

  var observer = new MutationObserver(function () {
    scan(document);
  });

  function init() {
    scan(document);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  GTCalendar.attach = attach;
  GTCalendar.scan = scan;
  GTCalendar.open = open;
  GTCalendar.close = close;

  window.GTCalendar = GTCalendar;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* END GT-CALENDAR-THEME-v1 */

/* ============================================================
   GT-CALENDAR-FINAL-BOOTSTRAP
   One common calendar system for the entire application.
   ============================================================ */
(function () {
  "use strict";

  function bootGTCalendar() {
    try {
      if (window.GTCalendar && typeof window.GTCalendar.scan === "function") {
        window.GTCalendar.scan(document);
      }
    } catch (e) {
      console.warn("GT Calendar scan failed:", e);
    }
  }

  function scheduleBoot() {
    bootGTCalendar();
    setTimeout(bootGTCalendar, 50);
    setTimeout(bootGTCalendar, 250);
    setTimeout(bootGTCalendar, 750);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBoot);
  } else {
    scheduleBoot();
  }

  if (window.MutationObserver) {
    var observer = new MutationObserver(function () {
      bootGTCalendar();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
/* END GT-CALENDAR-FINAL-BOOTSTRAP */

/* GT-MONTH-PICKER: themed replacement for <input type="month"> (same look as the date calendar). */
(function () {
  if (window.GTMonthLoaded) return;
  window.GTMonthLoaded = true;
  var NAMES = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    FULL = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    cur = null;
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function parse(v) {
    var m = /^(\d{4})-(\d{2})$/.exec(v || "");
    return m ? { y: +m[1], m: +m[2] - 1 } : null;
  }
  function nowM() {
    var d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  }
  function label(v) {
    var p = parse(v);
    return p ? FULL[p.m] + " " + p.y : "Select month";
  }
  function closeAll() {
    if (cur) {
      cur.wrap.classList.remove("open");
      cur.pop.classList.remove("open");
      cur.trigger.setAttribute("aria-expanded", "false");
      cur = null;
    }
  }
  function out(inst, y, m) {
    var v = y + "-" + pad(m + 1),
      mn = inst.input.getAttribute("min"),
      mx = inst.input.getAttribute("max");
    return (mn && v < mn) || (mx && v > mx);
  }
  function pos(inst) {
    var r = inst.trigger.getBoundingClientRect(),
      w = Math.min(Math.max(280, r.width), window.innerWidth - 20),
      l = Math.min(Math.max(10, r.left), window.innerWidth - w - 10),
      t = r.bottom + 7;
    if (window.innerHeight - r.bottom < 280 && r.top > 280) t = r.top - 270 - 7;
    inst.pop.style.left = Math.round(l) + "px";
    inst.pop.style.top = Math.round(Math.max(10, t)) + "px";
    inst.pop.style.width = Math.round(w) + "px";
  }
  function refresh(inst) {
    inst.label.textContent = label(inst.input.value);
  }
  function draw(inst) {
    var sel = parse(inst.input.value),
      n = nowM();
    var mn = (/^(\d{4})/.exec(inst.input.getAttribute("min") || "") || [])[1],
      mx = (/^(\d{4})/.exec(inst.input.getAttribute("max") || "") || [])[1],
      lo = mn ? +mn : 1900,
      hi = mx ? +mx : new Date().getFullYear() + 10;
    if (inst.year < lo) lo = inst.year;
    if (inst.year > hi) hi = inst.year;
    if (inst.yKey !== lo + "-" + hi) {
      var h = "";
      for (var yy = hi; yy >= lo; yy--)
        h += '<option value="' + yy + '">' + yy + "</option>";
      inst.ySel.innerHTML = h;
      inst.yKey = lo + "-" + hi;
    }
    inst.ySel.value = String(inst.year);
    inst.grid.innerHTML = NAMES.map(function (nm, i) {
      var dis = out(inst, inst.year, i),
        on = sel && sel.y === inst.year && sel.m === i,
        td = n.y === inst.year && n.m === i;
      return (
        '<button type="button" class="gt-mo' +
        (on ? " selected" : "") +
        (td ? " today" : "") +
        '" data-m="' +
        i +
        '"' +
        (dis ? " disabled" : "") +
        (on ? ' aria-pressed="true"' : "") +
        ">" +
        nm +
        "</button>"
      );
    }).join("");
  }
  function pick(inst, y, m) {
    inst.input.value = y + "-" + pad(m + 1);
    inst.input.dispatchEvent(new Event("input", { bubbles: true }));
    inst.input.dispatchEvent(new Event("change", { bubbles: true }));
    refresh(inst);
    closeAll();
    inst.trigger.focus();
  }
  function build(input) {
    if (input.dataset.gtMonthReady === "1") return;
    input.dataset.gtMonthReady = "1";
    var wrap = document.createElement("div");
    wrap.className = "gt-cal";
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "gt-cal-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    var lab = document.createElement("span");
    lab.className = "gt-cal-label";
    var ic = document.createElement("span");
    ic.className = "gt-cal-icon";
    ic.setAttribute("aria-hidden", "true");
    trigger.appendChild(lab);
    trigger.appendChild(ic);
    var pop = document.createElement("div");
    pop.className = "gt-cal-pop gt-mo-pop";
    pop.setAttribute("role", "dialog");
    pop.innerHTML =
      '<div class="gt-cal-head"><button type="button" class="gt-cal-nav" data-y="-1" aria-label="Previous year">‹</button><div class="gt-cal-title"></div><button type="button" class="gt-cal-nav" data-y="1" aria-label="Next year">›</button></div><div class="gt-mo-grid"></div><div class="gt-cal-foot"><button type="button" class="gt-cal-today">This month</button></div>';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(trigger);
    input.classList.add("gt-cal-native");
    document.body.appendChild(pop);
    var p = parse(input.value) || nowM(),
      inst = {
        input: input,
        wrap: wrap,
        trigger: trigger,
        label: lab,
        pop: pop,
        title: pop.querySelector(".gt-cal-title"),
        grid: pop.querySelector(".gt-mo-grid"),
        year: p.y,
      };
    refresh(inst);
    inst.ySel = document.createElement("select");
    inst.ySel.className = "gt-cal-sel gt-cal-sel-y";
    inst.ySel.setAttribute("aria-label", "Year");
    inst.ySel.setAttribute("data-gt-dropdown-ready", "1");
    inst.title.appendChild(inst.ySel);
    inst.ySel.addEventListener("change", function () {
      inst.year = +inst.ySel.value;
      draw(inst);
    });
    trigger.addEventListener("click", function () {
      if (wrap.classList.contains("open")) {
        closeAll();
        return;
      }
      if (input.disabled) return;
      closeAll();
      cur = inst;
      var q = parse(input.value) || nowM();
      inst.year = q.y;
      wrap.classList.add("open");
      pop.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      pos(inst);
      draw(inst);
    });
    pop.addEventListener("click", function (e) {
      var y = e.target.closest("[data-y]");
      if (y) {
        inst.year += +y.dataset.y;
        draw(inst);
        return;
      }
      var m = e.target.closest("[data-m]");
      if (m && !m.disabled) {
        pick(inst, inst.year, +m.dataset.m);
        return;
      }
      if (e.target.closest(".gt-cal-today")) {
        var n = nowM();
        if (!out(inst, n.y, n.m)) pick(inst, n.y, n.m);
      }
    });
    input.addEventListener("change", function () {
      refresh(inst);
    });
    input.addEventListener("input", function () {
      refresh(inst);
    });
  }
  function scan() {
    [].forEach.call(
      document.querySelectorAll("input[data-gt-legacy-off]"),
      build,
    );
  }
  document.addEventListener("click", function (e) {
    if (cur && !e.target.closest(".gt-mo-pop") && !e.target.closest(".gt-cal"))
      closeAll();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && cur) {
      var t = cur.trigger;
      closeAll();
      t.focus();
    }
  });
  window.addEventListener("resize", closeAll);
  window.addEventListener(
    "scroll",
    function (e) {
      if (cur && !e.target.closest) closeAll();
    },
    true,
  );
  function start() {
    scan();
    var t;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(scan, 30);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
/* ============================================================
   GT-PICKER: one calendar for every date and month field in the app.
   Replaces the native browser pickers and the older calendar scripts above (their scans are switched off).
   The original <input> stays in the page (hidden), so existing code that reads .value or listens for change keeps working.
   ============================================================ */
(function () {
  "use strict";
  if (window.GTPickerLoaded) return;
  window.GTPickerLoaded = true;
  var MF = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  var MS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  var WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var ICON = GMIcons.svg(
    "calendar",
    "",
    'width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"',
  );
  var desc = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  var pop = null,
    back = null,
    cur = null;
  function p2(n) {
    return String(n).padStart(2, "0");
  }
  function now() {
    var d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }
  function parse(v) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v || "");
    return m ? { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 } : null;
  }
  function iso(y, m, d) {
    return y + "-" + p2(m + 1) + "-" + p2(d);
  }
  function lab(inst) {
    var q = parse(inst.input.value);
    if (!q) return "";
    return inst.kind === "month"
      ? MF[q.m] + " " + q.y
      : q.d + " " + MS[q.m] + " " + q.y;
  }
  function refresh(inst) {
    var t = lab(inst);
    inst.label.textContent =
      t || (inst.kind === "month" ? "Select month" : "Select date");
    inst.btn.classList.toggle("empty", !t);
  }
  function lim(inst, a) {
    return inst.input.getAttribute(a) || "";
  }
  function badMonth(inst, y, m) {
    var v = y + "-" + p2(m + 1),
      mn = lim(inst, "min").slice(0, 7),
      mx = lim(inst, "max").slice(0, 7);
    return !!((mn && v < mn) || (mx && v > mx));
  }
  function badYear(inst, y) {
    var mn = lim(inst, "min").slice(0, 4),
      mx = lim(inst, "max").slice(0, 4);
    return !!((mn && String(y) < mn) || (mx && String(y) > mx));
  }
  function badDay(inst, s) {
    var mn = lim(inst, "min"),
      mx = lim(inst, "max");
    return !!((mn && s < mn) || (mx && s > mx));
  }

  function ensure() {
    if (pop) return;
    back = document.createElement("div");
    back.className = "gtp-back";
    document.body.appendChild(back);
    pop = document.createElement("div");
    pop.className = "gtp-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Choose date");
    document.body.appendChild(pop);
    pop.addEventListener("click", onPop);
    back.addEventListener("click", close);
  }
  function head(prev, title, next, tAct) {
    return (
      '<div class="gtp-head"><button type="button" class="gtp-nav" data-a="' +
      prev +
      '" aria-label="Previous">&#8249;</button>' +
      '<button type="button" class="gtp-title" data-a="' +
      tAct +
      '">' +
      title +
      (tAct === "none" ? "" : '<i aria-hidden="true"></i>') +
      "</button>" +
      '<button type="button" class="gtp-nav" data-a="' +
      next +
      '" aria-label="Next">&#8250;</button></div>'
    );
  }
  function draw() {
    var i = cur,
      t = now(),
      sel = parse(i.input.value),
      h = "";
    if (i.view === "days") {
      var first = new Date(i.y, i.m, 1).getDay(),
        dim = new Date(i.y, i.m + 1, 0).getDate(),
        cells = "";
      h =
        head("pm", MF[i.m] + " " + i.y, "nm", "months") +
        '<div class="gtp-week">' +
        WD.map(function (w) {
          return "<span>" + w + "</span>";
        }).join("") +
        '</div><div class="gtp-days">';
      for (var c = 0; c < 42; c++) {
        var dt = new Date(i.y, i.m, 1 - first + c),
          s = iso(dt.getFullYear(), dt.getMonth(), dt.getDate()),
          out = dt.getMonth() !== i.m;
        var on =
            sel &&
            sel.y === dt.getFullYear() &&
            sel.m === dt.getMonth() &&
            sel.d === dt.getDate(),
          td =
            t.y === dt.getFullYear() &&
            t.m === dt.getMonth() &&
            t.d === dt.getDate();
        cells +=
          '<button type="button" class="gtp-day' +
          (out ? " out" : "") +
          (on ? " on" : "") +
          (td ? " td" : "") +
          '" data-day="' +
          s +
          '"' +
          (badDay(i, s) ? " disabled" : "") +
          ">" +
          dt.getDate() +
          "</button>";
        if (c >= 34 && c % 7 === 6 && dt.getMonth() !== i.m && c < 41) {
          /* a sixth row is only needed when the month spills into it */
        }
      }
      h +=
        cells +
        '</div><div class="gtp-foot"><button type="button" class="gtp-link" data-a="today">Today</button></div>';
    } else if (i.view === "months") {
      h =
        head("py", String(i.y), "ny", "years") +
        '<div class="gtp-grid">' +
        MS.map(function (n, k) {
          var on = sel && sel.y === i.y && sel.m === k,
            td = t.y === i.y && t.m === k;
          return (
            '<button type="button" class="gtp-cell' +
            (on ? " on" : "") +
            (td ? " td" : "") +
            '" data-mon="' +
            k +
            '"' +
            (badMonth(i, i.y, k) ? " disabled" : "") +
            ">" +
            n +
            "</button>"
          );
        }).join("") +
        "</div>" +
        (i.kind === "month"
          ? '<div class="gtp-foot"><button type="button" class="gtp-link" data-a="today">This month</button></div>'
          : "");
    } else {
      var s0 = i.dec;
      h =
        head("pd", s0 + " &ndash; " + (s0 + 11), "nd", "none") +
        '<div class="gtp-grid">';
      for (var y = s0; y < s0 + 12; y++)
        h +=
          '<button type="button" class="gtp-cell' +
          (sel && sel.y === y ? " on" : "") +
          (t.y === y ? " td" : "") +
          '" data-yr="' +
          y +
          '"' +
          (badYear(i, y) ? " disabled" : "") +
          ">" +
          y +
          "</button>";
      h += "</div>";
    }
    pop.innerHTML =
      '<div class="gtp-view gtp-v-' + i.view + '">' + h + "</div>";
  }
  function pick(s) {
    var i = cur,
      inp = i.input;
    desc.set.call(inp, s);
    refresh(i);
    var b = i.btn;
    close(true);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      b.focus();
    } catch (e) {}
  }
  function onPop(e) {
    var el = e.target.closest("button");
    if (!el || !cur || el.disabled) return;
    var i = cur,
      a = el.getAttribute("data-a");
    if (el.hasAttribute("data-day")) return pick(el.getAttribute("data-day"));
    if (el.hasAttribute("data-mon")) {
      var k = +el.getAttribute("data-mon");
      if (i.kind === "month") return pick(i.y + "-" + p2(k + 1));
      i.m = k;
      i.view = "days";
      return draw();
    }
    if (el.hasAttribute("data-yr")) {
      i.y = +el.getAttribute("data-yr");
      i.view = "months";
      return draw();
    }
    if (a === "pm") {
      i.m--;
      if (i.m < 0) {
        i.m = 11;
        i.y--;
      }
    } else if (a === "nm") {
      i.m++;
      if (i.m > 11) {
        i.m = 0;
        i.y++;
      }
    } else if (a === "py") i.y--;
    else if (a === "ny") i.y++;
    else if (a === "pd") i.dec -= 12;
    else if (a === "nd") i.dec += 12;
    else if (a === "months") i.view = "months";
    else if (a === "years") {
      i.view = "years";
      i.dec = i.y - 4;
    } else if (a === "today") {
      var t = now();
      if (i.kind === "month") {
        if (!badMonth(i, t.y, t.m)) pick(t.y + "-" + p2(t.m + 1));
      } else if (!badDay(i, iso(t.y, t.m, t.d))) pick(iso(t.y, t.m, t.d));
      return;
    }
    draw();
  }
  function place() {
    if (!cur) return;
    var r = cur.btn.getBoundingClientRect(),
      vw = window.innerWidth,
      vh = window.innerHeight;
    if (vw <= 520) {
      pop.style.left = pop.style.top = "";
      pop.classList.add("sheet");
      back.classList.add("on");
      return;
    }
    pop.classList.remove("sheet");
    back.classList.remove("on");
    var w = pop.offsetWidth,
      h = pop.offsetHeight,
      l = Math.min(Math.max(10, r.left), vw - w - 10),
      t = r.bottom + 8;
    if (t + h > vh - 10 && r.top - h - 8 > 10) t = r.top - h - 8;
    t = Math.max(10, Math.min(t, vh - h - 10));
    pop.style.left = Math.round(l) + "px";
    pop.style.top = Math.round(t) + "px";
  }
  function open(inst) {
    if (inst.input.disabled) return;
    if (cur) close(true);
    ensure();
    cur = inst;
    var q = parse(inst.input.value) || now();
    inst.y = q.y;
    inst.m = q.m;
    inst.dec = q.y - 4;
    inst.view = inst.kind === "month" ? "months" : "days";
    inst.btn.setAttribute("aria-expanded", "true");
    inst.wrap.classList.add("open");
    draw();
    pop.classList.add("open");
    place();
  }
  function close(keep) {
    if (!cur) return;
    cur.btn.setAttribute("aria-expanded", "false");
    cur.wrap.classList.remove("open");
    var b = cur.btn;
    cur = null;
    if (pop) {
      pop.classList.remove("open");
      pop.classList.remove("sheet");
    }
    if (back) back.classList.remove("on");
    if (keep !== true) {
      try {
        b.focus();
      } catch (e) {}
    }
  }
  function build(input) {
    if (input.getAttribute("data-gtp") === "1") return;
    var kind = input.type === "month" ? "month" : "date";
    input.setAttribute("data-gtp", "1");
    var wrap = document.createElement("span");
    wrap.className = "gtp gtp-" + kind;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gtp-btn";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute(
      "aria-label",
      input.getAttribute("aria-label") ||
        (kind === "month" ? "Choose month" : "Choose date"),
    );
    var label = document.createElement("span");
    label.className = "gtp-label";
    var ic = document.createElement("span");
    ic.className = "gtp-ic";
    ic.innerHTML = ICON;
    btn.appendChild(label);
    btn.appendChild(ic);
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(btn);
    input.classList.add("gtp-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    var inst = { input: input, kind: kind, wrap: wrap, btn: btn, label: label };
    Object.defineProperty(input, "value", {
      configurable: true,
      get: function () {
        return desc.get.call(input);
      },
      set: function (v) {
        desc.set.call(input, v);
        refresh(inst);
      },
    });
    input.addEventListener("change", function () {
      refresh(inst);
    });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (cur === inst) close();
      else open(inst);
    });
    refresh(inst);
  }
  function scan() {
    [].forEach.call(
      document.querySelectorAll(
        'input[type="date"]:not([data-gtp]),input[type="month"]:not([data-gtp])',
      ),
      build,
    );
  }
  document.addEventListener("mousedown", function (e) {
    if (cur && !e.target.closest(".gtp-pop") && !e.target.closest(".gtp-btn"))
      close(true);
  });
  document.addEventListener(
    "keydown",
    function (e) {
      if (e.key === "Escape" && cur) {
        e.stopPropagation();
        close();
      }
    },
    true,
  );
  window.addEventListener("resize", function () {
    if (cur) place();
  });
  window.addEventListener(
    "scroll",
    function (e) {
      if (cur && !(pop && pop.contains(e.target))) place();
    },
    true,
  );
  function start() {
    scan();
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
