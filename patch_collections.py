#!/usr/bin/env python3
# Usage: python3 patch_collections.py path/to/collections.html
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'collections.html'
s = open(p, encoding='utf-8').read()
if 'co-tb' in s:
    sys.exit('Already patched')

# ---- CSS: drop old command bar + compact overrides ----
a = s.index('      /* Command bar pill + filter chips */')
b = s.index('      @media (max-width: 900px) {', a)
s = s[:a] + s[b:]
c = s.index('        .co-top {\n          flex-direction: column;')
d = s.index('      }\n      @media (max-width: 560px)', c)
s = s[:c] + s[d:]
e = s.index('      /* Compact overrides')
f = s.rindex('    </style>')
newcss = r'''      /* Slim toolbar, filters popover, active chips */
      .co-tb { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
      .co-s {
        flex: 1 1 240px; max-width: 360px; min-width: 0; height: 40px; display: flex; align-items: center; gap: 8px;
        padding: 0 14px; border-radius: 999px; background: var(--card); border: 1px solid var(--border); color: var(--muted);
      }
      .co-s svg { width: 16px; height: 16px; flex: none; }
      .co-s input[type="search"] {
        flex: 1; min-width: 0; width: auto; height: 36px; min-height: 0; padding: 0; margin: 0; border: 0;
        outline: 0; box-shadow: none; background: none; font: inherit; font-size: 14px; color: var(--text);
      }
      .co-tbr { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      .co-fw { position: relative; }
      .co-btn {
        height: 40px; padding: 0 18px; display: inline-flex; align-items: center; gap: 8px; width: auto;
        border: 1.5px solid var(--primary); border-radius: 999px; background: var(--t-primary);
        color: var(--primary); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
      }
      .co-btn svg { width: 16px; height: 16px; flex: none; }
      .co-btn:hover { filter: brightness(0.97); }
      .co-btn-p { background: var(--primary); color: var(--on-primary); }
      .co-btn-p:hover { filter: brightness(1.08); }
      .co-btn:disabled { opacity: 0.55; cursor: default; }
      .co-badge {
        min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--primary);
        color: var(--on-primary); font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
      }
      .co-badge[hidden] { display: none; }
      .co-pop {
        display: none; position: absolute; top: calc(100% + 8px); right: 0; z-index: 60; width: 380px;
        max-width: calc(100vw - 32px); background: var(--card); border: 1px solid var(--border);
        border-radius: 20px; padding: 16px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      }
      .co-pop.open { display: block; }
      .co-pf1 { margin-bottom: 12px; min-width: 0; }
      .co-pf1 label { display: block; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
      .co-pf2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .co-pop .field, .co-pop select { width: 100%; }
      .co-pact { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 4px; }
      .co-link { border: 0; background: none; color: var(--primary); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; padding: 8px 10px; white-space: nowrap; }
      .co-pact .co-link { color: var(--text); }
      .co-apply {
        height: 40px; padding: 0 22px; border: 0; border-radius: 999px; background: var(--primary);
        color: var(--on-primary); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; width: auto;
      }
      .co-active { display: none; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .co-al { color: var(--muted); font-size: 13px; }
      .co-ac {
        display: inline-flex; align-items: center; gap: 2px; height: 32px; padding: 0 4px 0 12px; border-radius: 999px;
        background: var(--card); border: 1px solid var(--border); font-size: 13px; font-weight: 600;
      }
      .co-ac button { border: 0; background: none; cursor: pointer; color: var(--muted); font-size: 16px; line-height: 1; padding: 4px 8px; }
      .co-ac button:hover { color: var(--text); }
      .co-chips { display: flex; align-items: center; margin-bottom: 12px; }
      #coTabs.co-seg button { padding: 6px 14px; font-size: 13px; }
      #coTabs.co-seg .n { font-size: 11px; padding: 0 6px; margin-left: 6px; }
      @media (max-width: 560px) {
        .co-s { max-width: none; flex-basis: 100%; }
        .co-tbr { margin-left: 0; width: 100%; justify-content: flex-end; }
      }
'''
s = s[:e] + newcss + s[f:]

# ---- icon ----
s = s.replace('        function ico(n) {\n          if (n === "search") return SEARCH_SVG;',
 '''        var FILTER_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16"/><path d="M7 12h10"/><path d="M10 17h4"/></svg>';
        function ico(n) {
          if (n === "search") return SEARCH_SVG;
          if (n === "filter") return FILTER_SVG;''', 1)

# ---- markup ----
ms = s.index("          '<div class=\"co-top\"><div class=\"co-pill\">' +")
end = "Clear filters</button></div>' +\n"
me = s.index(end, ms) + len(end)
markup = r'''          '<div class="co-tb">' +
          '<label class="co-s">' + ico("search") + '<input type="search" id="coQ" placeholder="Search customer name" aria-label="Search customer name" autocomplete="off"></label>' +
          '<div class="co-tbr"><div class="co-fw">' +
          '<button class="co-btn" id="coFbtn" type="button" aria-haspopup="true" aria-expanded="false">' + ico("filter") + 'Filters<span class="co-badge" id="coFcount" hidden>0</span></button>' +
          '<div class="co-pop" id="coPop" role="dialog" aria-label="Filters">' +
          '<div class="co-pf1"><label for="coMethod">Payment method</label><div class="field"><select id="coMethod"><option value="">All methods</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option></select></div></div>' +
          '<div class="co-pf1"><label for="coEmp">Employee</label><div class="field"><select id="coEmp"><option value="">All employees</option></select></div></div>' +
          '<div class="co-pf2"><div class="co-pf1"><label for="coFrom">From</label><div class="field"><input type="date" id="coFrom"></div></div>' +
          '<div class="co-pf1"><label for="coTo">To</label><div class="field"><input type="date" id="coTo"></div></div></div>' +
          '<div class="co-pact"><button class="co-link" id="coPClear" type="button">Clear</button><button class="co-apply" id="coApply" type="button">Apply filters</button></div>' +
          '</div></div>' +
          '<button class="co-btn co-btn-p" id="coExport" type="button">' + ico("download") + 'Export</button></div></div>' +
          '<div class="co-active" id="coActive"></div>' +
          '<div class="co-chips"><div class="a-seg co-seg" id="coTabs"></div></div>' +
'''
s = s[:ms] + markup + s[me:]

# ---- JS ----
j0 = s.index('        // Round search button and Enter key search straight away')
j1 = s.index('        $("coList").addEventListener("keydown"')
js = r'''        function fmtD(v) {
          var d = new Date(v + "T00:00:00");
          return isNaN(d) ? v : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        }
        function empName(id) {
          var o = [].filter.call($("coEmp").options, function (x) { return x.value === id; })[0];
          return o ? o.textContent : "Employee";
        }
        function drawActive() {
          var chips = [];
          if (st.method) chips.push(["method", "Method: " + (METHOD[st.method] || st.method)]);
          if (st.collector) chips.push(["collector", "Employee: " + empName(st.collector)]);
          if (st.from || st.to) chips.push(["date", st.from && st.to ? fmtD(st.from) + " – " + fmtD(st.to) : st.from ? "From " + fmtD(st.from) : "Until " + fmtD(st.to)]);
          var n = chips.length;
          $("coFcount").textContent = n;
          $("coFcount").hidden = !n;
          var box = $("coActive");
          box.style.display = n ? "flex" : "none";
          box.innerHTML = n
            ? '<span class="co-al">Active filters</span>' +
              chips.map(function (c) {
                return '<span class="co-ac">' + esc(c[1]) + '<button type="button" data-rm="' + c[0] + '" aria-label="Remove filter">×</button></span>';
              }).join("") +
              '<button class="co-link" type="button" data-clearall>Clear all</button>'
            : "";
        }
        function syncFields() {
          $("coMethod").value = st.method;
          $("coEmp").value = st.collector;
          $("coFrom").value = st.from;
          $("coTo").value = st.to;
        }
        function setPop(open) {
          if (open) syncFields();
          $("coPop").classList.toggle("open", open);
          $("coFbtn").setAttribute("aria-expanded", open ? "true" : "false");
        }
        function applyFilters() { st.page = 1; drawActive(); load(); }
        function clearFilters() {
          st.method = st.collector = st.from = st.to = "";
          syncFields();
          applyFilters();
        }
        $("coFbtn").onclick = function (e) { e.stopPropagation(); setPop(!$("coPop").classList.contains("open")); };
        $("coPop").addEventListener("click", function (e) { e.stopPropagation(); });
        document.addEventListener("click", function () { setPop(false); });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") setPop(false); });
        $("coApply").onclick = function () {
          st.method = $("coMethod").value;
          st.collector = $("coEmp").value;
          st.from = $("coFrom").value;
          st.to = $("coTo").value;
          setPop(false);
          applyFilters();
        };
        $("coPClear").onclick = function () { setPop(false); clearFilters(); };
        $("coActive").onclick = function (e) {
          if (e.target.closest("[data-clearall]")) { clearFilters(); return; }
          var r = e.target.closest("[data-rm]");
          if (!r) return;
          var k = r.getAttribute("data-rm");
          if (k === "method") st.method = "";
          else if (k === "collector") st.collector = "";
          else st.from = st.to = "";
          syncFields();
          applyFilters();
        };
        api("/api/accounts/collectors").then(function (j) {
          $("coEmp").innerHTML = '<option value="">All employees</option>' + (j.collectors || []).map(function (c) {
            return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
          }).join("");
          $("coEmp").value = st.collector;
          drawActive();
        }).catch(function () {});
        drawActive();
'''
s = s[:j0] + js + s[j1:]
open(p, 'w', encoding='utf-8').write(s)
print('patched', p)
