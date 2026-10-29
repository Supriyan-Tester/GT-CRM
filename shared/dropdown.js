/* Themed dropdowns for the Sales app: an exact copy of the dropdown block in theme.js (so Sales matches Admin and Delivery without loading the whole theme). */
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
