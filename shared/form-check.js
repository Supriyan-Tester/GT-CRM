/* Shared form helper: red * on required labels, red box + message under the empty field.
   FC.star("Amount")            -> 'Amount <span class="fc-star">*</span>'
   FC.check([["eA","Enter the amount."], ...], root?) -> true if all OK; else marks boxes, focuses first, returns false
   FC.fail("eA","Amount must be above 0.") -> mark one box with a custom message
   FC.clear(root?)              -> remove all marks */
(function () {
  var st = document.createElement("style");
  st.textContent =
    ".fc-star{color:#dc2626;font-weight:700;margin-left:2px}" +
    ".fc-msg{font-size:12.5px;color:#dc2626;margin-top:4px;line-height:1.3}" +
    ".field.err,.fc-err{border-color:#dc2626!important}";
  document.head.appendChild(st);
  function boxOf(el) {
    return el.closest(".field") || el;
  }
  function clearOne(el) {
    var b = boxOf(el);
    b.classList.remove("err", "fc-err");
    var n = b.nextElementSibling;
    if (n && n.classList.contains("fc-msg")) n.remove();
  }
  function mark(el, msg) {
    clearOne(el);
    var b = boxOf(el);
    b.classList.add("err", "fc-err");
    var m = document.createElement("div");
    m.className = "fc-msg";
    m.textContent = msg;
    b.parentNode.insertBefore(m, b.nextSibling);
    var h = function () {
      clearOne(el);
      el.removeEventListener("input", h);
      el.removeEventListener("change", h);
    };
    el.addEventListener("input", h);
    el.addEventListener("change", h);
  }
  window.FC = {
    star: function (t) {
      return t + ' <span class="fc-star">*</span>';
    },
    clear: function (root) {
      (root || document).querySelectorAll(".fc-msg").forEach(function (n) {
        n.remove();
      });
      (root || document).querySelectorAll(".fc-err,.field.err").forEach(function (n) {
        n.classList.remove("err", "fc-err");
      });
    },
    fail: function (id, msg) {
      var el = document.getElementById(id);
      if (!el) return;
      mark(el, msg);
      el.focus();
    },
    check: function (rules) {
      var first = null;
      rules.forEach(function (r) {
        var el = document.getElementById(r[0]);
        if (!el) return;
        var v = String(el.value == null ? "" : el.value).trim();
        if (!v || (r[2] && !r[2](v))) {
          mark(el, r[1]);
          if (!first) first = el;
        } else clearOne(el);
      });
      if (first) first.focus();
      return !first;
    },
  };
})();
