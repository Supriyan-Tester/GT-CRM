# GM-CRM Map

How to use: find your page in section 1 → see its CSS + JS files. For a button, look it up in section 2 (class → CSS line → where used). Shortcut: browser Inspect shows the class, then search it here. Section 6 = step-by-step find/change guide + copy-paste recipes.

## 0. Cheat sheet: what to change to get what you want

### MOVE (position)

- **margin** — space OUTSIDE the button. Bigger = pushes it away from neighbours. `margin-left:auto` pushes it to the right edge
- **position** — `relative` = nudge from normal spot; `absolute`/`fixed` = pin to an exact spot on screen
- **top / right / bottom / left** — distance used with position (e.g. `top:10px` moves it down 10px)
- **transform: translate(x,y)** — moves it by x,y without disturbing others. Best for small nudges
- **float / display:flex / justify-content / align-items / gap** — how buttons line up in a row. `justify-content:flex-end` = right, `center` = middle, `space-between` = spread. `gap` = space between buttons
- **order / z-index** — `order` changes sequence in a flex row; `z-index` decides who sits on top when overlapping

### SIZE

- **width / height** — exact size. `100%` = full width of its box
- **min-width / max-width / min-height** — size limits so it never gets too small/big
- **padding** — space INSIDE the button around the text. Easiest way to make it bigger/smaller (e.g. `10px 18px` = top/bottom 10, left/right 18)
- **font-size** — text size. Also scales buttons that use `em`/`rem`
- **transform: scale(1.1)** — grows/shrinks the whole button visually (often used on hover)

### SHAPE & BORDER

- **border-radius** — corner roundness. `0` square, `8px` soft, `999px` full pill, `50%` circle (needs equal width & height)
- **border** — outline line: `1px solid #ccc`. `none` removes it
- **outline** — focus ring when tabbed/clicked. Don't remove it fully (keyboard users need it)
- **box-shadow** — soft shadow / glow / raised look: `0 2px 6px rgba(0,0,0,.2)`. `inset` = pressed-in look
- **clip-path** — cut custom shapes (arrow, hexagon)

### COLOUR & TEXT

- **background / background-color** — fill colour. Can be gradient: `linear-gradient(90deg,#f00,#00f)`
- **color** — text/icon colour
- **opacity** — see-through. `1` solid, `.5` half, used for disabled look
- **font-weight / letter-spacing / text-transform** — bold, spread letters, UPPERCASE
- **filter** — blur, brightness etc: `brightness(1.1)` for hover
- **var(--something)** — a theme colour variable (defined in theme.css `:root`). Change it ONCE there and every button using it changes. Use when you want global change

### ANIMATION & STATES

- **transition** — smooth change between states: `all .2s ease` = 0.2s fade between normal and hover
- **:hover** — style when mouse is over it
- **:active** — style while being pressed (often `transform:scale(.97)`)
- **:focus / :focus-visible** — style when selected by keyboard/click
- **:disabled** — style when button is switched off
- **animation + @keyframes** — looping/auto animation (pulse, shake, spin). Define `@keyframes name{...}` then `animation: name 1s infinite`
- **cursor** — mouse icon: `pointer` = hand
- **display:none / visibility** — hide the button

**Tip:** the bigger-picture rule: to change ONE button, edit its own class (section 3). To change ALL buttons, edit the shared class (e.g. `.a-btn`) or the theme variables in `shared/theme.css`.

## 1. Pages → files they load

| Page | CSS files | JS files | Inline style/script |
|---|---|---|---|
| admin/accounts-dashboard.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/accounts-reports.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/accounts.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/activity.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | style, script |
| admin/admin.html | shared/admin.css, shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/vendor/leaflet/leaflet.js | style, script |
| admin/advances.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/form-check.js, shared/admin.js | script |
| admin/attendance.html | shared/admin.css, shared/attendance.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/road-line.js, shared/attendance.js | script |
| admin/bill.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/visit.js | style, script |
| admin/cash-closing.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/collections.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/customers.html | shared/admin.css, shared/customers-plus.css, shared/customers.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js, shared/xlsx-lite.js, shared/customers-plus.js | script |
| admin/daily-closing.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/delivery.html | shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/vendor/leaflet/leaflet.js, shared/theme.js, shared/mock-data.js, shared/visit.js, shared/road-line.js | style, script |
| admin/home.html | shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/punch-modal.js, shared/consent.js, shared/vendor/leaflet/leaflet.js | style, script |
| admin/index.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | style, script |
| admin/live.html | shared/admin.css, shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/road-line.js, shared/admin.js, shared/vendor/leaflet/leaflet.js | style, script |
| admin/notifications.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | script |
| admin/office-cash.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/orders.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | style, script |
| admin/plan.html | shared/admin.css, shared/plan.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/xlsx-lite.js, shared/plan-core.js, shared/road-line.js, shared/plan-map.js, shared/plan-dialogs.js, shared/plan.js | script |
| admin/problem.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| admin/problems.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | script |
| admin/product-edit.html | shared/admin.css, shared/plan.css, shared/products.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/products.js | script |
| admin/products.html | shared/admin.css, shared/plan.css, shared/products.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/xlsx-lite.js, shared/products.js | script |
| admin/profile.html | shared/admin.css, shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/form-check.js, shared/admin.js, shared/vendor/leaflet/leaflet.js | style, script |
| admin/punch-in.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| admin/punch-out.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/visit.js | style, script |
| admin/returns.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | style, script |
| admin/route.html | shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/visit.js, shared/vendor/leaflet/leaflet.js | style, script |
| admin/routes.html | shared/admin.css, shared/routes.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js, shared/road-line.js, shared/routes.js | - |
| admin/sales.html | shared/admin.css, shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/vendor/leaflet/leaflet.js | style, script |
| admin/shop-pins.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| admin/statement.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js | style, script |
| admin/summary.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | script |
| admin/super.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/users.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/users.js, shared/user-form.js | script |
| admin/upi-settlements.html | shared/admin.css, shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/form-check.js, shared/admin.js | style, script |
| admin/user-edit.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/users.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/users.js | script |
| admin/users.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/users.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/users.js, shared/user-form.js | script |
| admin/vehicle-edit.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/vehicles.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/vehicles.js | script |
| admin/vehicle-fuel.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/vehicles.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/form-check.js, shared/admin.js, shared/plan-core.js, shared/vehicles.js | script |
| admin/vehicle-maintenance.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/vehicles.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/form-check.js, shared/admin.js, shared/plan-core.js, shared/vehicles.js | script |
| admin/vehicle.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/vehicles.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/vehicles.js | script |
| admin/vehicles.html | shared/admin.css, shared/plan.css, shared/theme.css, shared/vehicles.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js, shared/plan-core.js, shared/vehicles.js | script |
| admin/workers.html | shared/admin.css, shared/theme.css, shared/workers.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/admin.js, shared/form-check.js, shared/workers.js | script |
| index.html | - | - | script |
| login.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/admin.js | style, script |
| sales/attendance.html | sales/sales.css | shared/loading.js, assets/icons.js, sales/sales.js, sales/attendance.js | - |
| sales/cash-handover.html | shared/theme.css | shared/loading.js, shared/form-check.js, shared/theme.js | style, script |
| sales/collections.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | style, script |
| sales/customers.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | script |
| sales/home.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | script |
| sales/office-deposit.html | shared/theme.css | shared/form-check.js, shared/theme.js | style, script |
| sales/order.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | script |
| sales/orders.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | script |
| sales/products.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | script |
| sales/route.html | sales/sales.css, shared/dropdown.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js, shared/vendor/leaflet/leaflet.js, shared/road-line.js | script |
| sales/shop.html | sales/sales.css, shared/dropdown.css | shared/loading.js, assets/icons.js, sales/sales.js, shared/dropdown.js | style, script |
| worker/advances.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| worker/attendance.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/punch-modal.js | style, script |
| worker/bill.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/visit.js | style, script |
| worker/cash-handover.html | shared/theme.css | shared/loading.js, shared/form-check.js, shared/theme.js | style, script |
| worker/collect-sheet.html | shared/theme.css | shared/loading.js, shared/sync.js, shared/theme.js | style, script |
| worker/collections-history.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| worker/collections.html | shared/theme.css | shared/loading.js, shared/sync.js, shared/theme.js | style, script |
| worker/delivery.html | shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/vendor/leaflet/leaflet.js, shared/theme.js, shared/mock-data.js, shared/visit.js, shared/road-line.js | style, script |
| worker/home.html | shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/punch-modal.js, shared/consent.js, shared/vendor/leaflet/leaflet.js | style, script |
| worker/office-deposit.html | shared/theme.css | shared/form-check.js, shared/theme.js | style, script |
| worker/orders.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js | style, script |
| worker/problem.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| worker/profile.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| worker/punch-in.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |
| worker/punch-out.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/visit.js | style, script |
| worker/route.html | shared/theme.css, shared/vendor/leaflet/leaflet.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js, shared/visit.js, shared/vendor/leaflet/leaflet.js | style, script |
| worker/shop-pins.html | shared/theme.css | shared/loading.js, assets/icons.js, shared/sync.js, shared/theme.js, shared/mock-data.js | style, script |

## 2. Button/control classes → style location → used in

(Only classes containing btn/button/chip/tab/pill/toggle/icon-btn; ask me for any other.)

| Class | Styled at (css:line) | Used in |
|---|---|---|
| .a-btn | admin/profile.html:177 (inline), admin/profile.html:182 (inline), shared/admin.css:98 … | admin/accounts-reports.html, admin/admin.html, admin/advances.html, admin/customers.html, admin/notifications.html … |
| .a-chips | admin/route.html:94 (inline), admin/route.html:543 (inline), worker/route.html:94 (inline) … | admin/route.html, worker/route.html |
| .a-table | admin/accounts.html:91 (inline), shared/admin.css:139, shared/admin.css:144 … | admin/accounts-dashboard.html, admin/accounts.html, admin/advances.html, admin/collections.html, admin/customers.html … |
| .a-uchip | shared/admin.css:2015, shared/admin.css:2028, shared/admin.css:2046 … | shared/admin.js |
| .ac-btn | admin/accounts.html:19 (inline), admin/accounts.html:81 (inline) | admin/accounts.html |
| .ac-chip | admin/accounts.html:113 (inline), admin/accounts.html:114 (inline), admin/accounts.html:115 (inline) … | admin/accounts.html |
| .ac-openbtn | admin/accounts.html:42 (inline), admin/accounts.html:43 (inline) | admin/accounts.html |
| .ac-tabs | admin/accounts.html:72 (inline), admin/accounts.html:73 (inline), admin/accounts.html:74 (inline) … | admin/accounts.html |
| .action-buttons | admin/problem.html:134 (inline), worker/problem.html:134 (inline) | admin/problem.html, worker/problem.html |
| .ad-btn | admin/accounts-dashboard.html:132 (inline) | admin/accounts-dashboard.html |
| .al-btn | admin/activity.html:90 (inline), admin/activity.html:106 (inline), admin/activity.html:115 (inline) … | admin/activity.html |
| .al-pill | admin/activity.html:238 (inline), admin/activity.html:248 (inline), admin/activity.html:379 (inline) | admin/activity.html |
| .at-btn | worker/attendance.html:531 (inline), worker/attendance.html:550 (inline), worker/attendance.html:555 (inline) … | worker/attendance.html |
| .at-chip | shared/attendance.css:579 | shared/attendance.js |
| .at-tabs | shared/admin.css:1600, shared/attendance.css:333, shared/attendance.css:339 … | shared/attendance.js |
| .back-btn | shared/theme.css:218, shared/theme.css:2624, shared/theme.css:2739 | admin/problem.html, admin/punch-in.html, worker/problem.html, worker/punch-in.html |
| .bl-chips | admin/bill.html:123 (inline), admin/bill.html:129 (inline), admin/bill.html:139 (inline) … | admin/bill.html, worker/bill.html |
| .bl-table | worker/delivery.html:706 (inline), worker/delivery.html:707 (inline), worker/delivery.html:708 (inline) … | worker/delivery.html |
| .brand-chip | login.html:99 (inline), login.html:107 (inline), login.html:590 (inline) … | login.html |
| .btn | admin/collections.html:124 (inline), admin/collections.html:149 (inline), admin/collections.html:164 (inline) … | admin/accounts-dashboard.html, admin/accounts-reports.html, admin/accounts.html, admin/admin.html, admin/advances.html … |
| .btn-call-admin | admin/problem.html:37 (inline), worker/problem.html:37 (inline), shared/theme.css:2633 | admin/problem.html, worker/problem.html |
| .btn-danger | shared/admin.css:1427, shared/admin.css:1449, shared/theme.css:374 | admin/accounts.html, admin/collections.html, admin/problem.html, admin/vehicle-fuel.html, admin/vehicle-maintenance.html … |
| .btn-forgot | login.html:410 (inline), login.html:420 (inline) | login.html |
| .btn-group | shared/theme.css:384, shared/theme.css:389 | admin/advances.html, admin/customers.html, admin/notifications.html, admin/products.html, shared/customers-plus.js … |
| .btn-outline | shared/admin.css:1427, shared/admin.css:1444, shared/admin.css:1468 … | admin/accounts-dashboard.html, admin/accounts.html, admin/cash-closing.html, admin/collections.html, admin/daily-closing.html … |
| .btn-secondary | shared/customers-plus.css:1655, shared/customers-plus.css:1660, shared/customers-plus.css:1663 … | admin/accounts-reports.html, admin/admin.html, admin/advances.html, admin/customers.html, admin/home.html … |
| .btn-success | shared/theme.css:379 | admin/accounts.html, admin/collections.html, admin/daily-closing.html, admin/office-cash.html, admin/upi-settlements.html |
| .btns | admin/collections.html:169 (inline), worker/profile.html:566 (inline), worker/profile.html:572 (inline) … | admin/collections.html, shared/plan.js, worker/profile.html |
| .cbtns | sales/sales.css:1302 | sales/order.html |
| .cc-btn | admin/cash-closing.html:23 (inline) | admin/cash-closing.html |
| .cc-chip | admin/cash-closing.html:38 (inline) | admin/cash-closing.html |
| .chip | admin/accounts-dashboard.html:68 (inline), admin/admin.html:48 (inline), admin/home.html:535 (inline) … | admin/accounts-dashboard.html, admin/admin.html, admin/home.html, admin/index.html, admin/notifications.html … |
| .chips | worker/collect-sheet.html:41 (inline) | worker/collect-sheet.html |
| .co-openbtn | admin/collections.html:264 (inline), admin/collections.html:277 (inline), admin/collections.html:280 (inline) | admin/collections.html |
| .d-chipn | admin/index.html:202 (inline), admin/index.html:215 (inline) | admin/index.html |
| .d-pill | admin/index.html:346 (inline), admin/index.html:356 (inline), admin/index.html:362 (inline) … | admin/index.html |
| .dc-btn | admin/daily-closing.html:28 (inline) | admin/daily-closing.html |
| .dc-table | admin/daily-closing.html:60 (inline), admin/daily-closing.html:71 (inline) | admin/daily-closing.html |
| .dp-chip | shared/plan.css:654, shared/plan.css:665, shared/plan.css:1532 | shared/plan-dialogs.js, shared/plan.js |
| .dp-chips | shared/plan.css:649 | shared/plan-dialogs.js, shared/plan.js |
| .dp-ptable | shared/plan.css:1331, shared/plan.css:1335, shared/plan.css:1353 … | shared/plan.js |
| .dp-tab | shared/plan.css:341, shared/plan.css:354, shared/plan.css:1572 … | shared/plan.js |
| .dp-table | shared/plan.css:367, shared/plan.css:372, shared/plan.css:379 … | shared/plan-dialogs.js, shared/plan.js |
| .dp-tabs | shared/plan.css:334 | shared/plan.js |
| .dv-btn2 | admin/delivery.html:215 (inline), admin/delivery.html:227 (inline), worker/delivery.html:221 (inline) … | admin/delivery.html, worker/delivery.html |
| .gce-btn | shared/customers-plus.css:1018, shared/customers-plus.css:1021, shared/customers-plus.css:1037 … | admin/customers.html |
| .gce-btns | shared/customers-plus.css:1013, shared/customers-plus.css:1018 | admin/customers.html |
| .gdt-chips | shared/customers-plus.css:1162 | shared/customers-plus.js |
| .gdt-pill | shared/customers-plus.css:1168 | shared/customers-plus.js |
| .gdt-tabs | shared/customers-plus.css:1320, shared/customers-plus.css:1330, shared/customers-plus.css:1342 … | shared/customers-plus.js |
| .gp-tabs | shared/customers-plus.css:336, shared/customers-plus.css:342, shared/customers-plus.css:354 | shared/customers-plus.js |
| .gtc-detail-tabs | shared/customers.css:630, shared/customers.css:637, shared/customers.css:647 | admin/customers.html |
| .gtc-muted-pill | shared/customers.css:266, shared/customers.css:277 | admin/customers.html |
| .gtc-route-pill | NOT FOUND in css | admin/customers.html, shared/customers-plus.js |
| .gtc-table | shared/customers-plus.css:160, shared/customers-plus.css:163, shared/customers-plus.css:194 … | admin/customers.html |
| .gtp-btn | admin/accounts-reports.html:16 (inline), admin/activity.html:53 (inline), shared/admin.css:3304 … | shared/theme.js |
| .hv-pill | admin/accounts-reports.html:47 (inline), admin/accounts-reports.html:48 (inline) | admin/accounts-reports.html |
| .ibtn | sales/sales.css:313, sales/sales.css:324 | sales/sales.js |
| .icon-btn | worker/advances.html:418 (inline), shared/theme.css:231, shared/theme.css:2624 … | admin/bill.html, admin/delivery.html, admin/home.html, admin/problem.html, admin/punch-in.html … |
| .in-out-pill | worker/attendance.html:229 (inline), worker/attendance.html:236 (inline), shared/theme.css:744 … | worker/attendance.html |
| .lv-btn | admin/live.html:54 (inline), admin/live.html:60 (inline), shared/theme.css:3253 | admin/live.html |
| .lv-pills | admin/live.html:146 (inline) | admin/live.html |
| .ma-tab | worker/advances.html:424 (inline), worker/advances.html:425 (inline) | worker/advances.html |
| .ma-tabs | worker/advances.html:423 (inline) | worker/advances.html |
| .modal-close-btn | admin/delivery.html:747 (inline), worker/attendance.html:285 (inline), worker/delivery.html:781 (inline) … | admin/delivery.html, worker/attendance.html, worker/delivery.html |
| .oc-btn | admin/office-cash.html:28 (inline) | admin/office-cash.html |
| .om-tab | admin/orders.html:168 (inline), admin/orders.html:178 (inline), shared/admin.css:3329 | admin/orders.html |
| .om-tabs | admin/orders.html:161 (inline), shared/admin.css:3328, shared/admin.css:3329 … | admin/orders.html |
| .pf-btn | worker/profile.html:116 (inline), worker/profile.html:134 (inline), worker/profile.html:139 (inline) … | worker/profile.html |
| .pf-tab | worker/profile.html:182 (inline), worker/profile.html:198 (inline), worker/profile.html:203 (inline) … | worker/profile.html |
| .pf-tabs | worker/profile.html:176 (inline) | worker/profile.html |
| .pill | admin/home.html:181 (inline), admin/home.html:189 (inline), admin/home.html:192 (inline) … | admin/home.html, sales/home.html, sales/orders.html, sales/route.html, sales/shop.html … |
| .pill-l | admin/punch-out.html:312 (inline), worker/punch-out.html:312 (inline) | admin/punch-out.html, worker/punch-out.html |
| .pl-btn | sales/sales.css:2286 | sales/home.html |
| .pr-table | shared/admin.css:3357, shared/admin.css:3359, shared/admin.css:3360 … | admin/products.html |
| .ret-btn | shared/admin.css:3490, shared/admin.css:3491, shared/admin.css:3492 … | admin/returns.html |
| .ret-pill | shared/admin.css:3475 | admin/returns.html |
| .rp-tabs | admin/accounts-reports.html:6 (inline), admin/accounts-reports.html:7 (inline), admin/accounts-reports.html:8 (inline) … | admin/accounts-reports.html |
| .rt-chip | admin/delivery.html:1290 (inline), admin/delivery.html:1306 (inline), admin/delivery.html:1313 (inline) … | admin/delivery.html, shared/routes.js, worker/delivery.html |
| .rt-chips | admin/delivery.html:1285 (inline), admin/route.html:193 (inline), admin/route.html:199 (inline) … | admin/delivery.html, admin/route.html, worker/delivery.html, worker/route.html |
| .sa-pill | admin/sales.html:80 (inline) | admin/sales.html |
| .sh-btn | admin/delivery.html:820 (inline), admin/delivery.html:834 (inline), admin/delivery.html:1279 (inline) … | admin/delivery.html, worker/delivery.html |
| .tabs | sales/sales.css:1354, sales/sales.css:1359, sales/sales.css:1369 | sales/shop.html |
| .toggle | login.html:180 (inline), login.html:192 (inline), login.html:195 (inline) … | login.html |
| .up-btn | admin/upi-settlements.html:73 (inline) | admin/upi-settlements.html |
| .us-table | shared/users.css:293, shared/users.css:298, shared/users.css:307 … | admin/users.html |
| .us-table-acc | shared/users.css:634, shared/users.css:637, shared/users.css:707 … | admin/users.html |
| .vx-tab | shared/vehicles.css:378, shared/vehicles.css:395, shared/vehicles.css:399 … | admin/vehicle-maintenance.html, admin/vehicle.html, admin/vehicles.html |
| .vx-table | shared/vehicles.css:478, shared/vehicles.css:483, shared/vehicles.css:490 … | admin/vehicle-fuel.html, admin/vehicle-maintenance.html, admin/vehicle.html, admin/vehicles.html |
| .vx-tabs | shared/vehicles.css:368, shared/vehicles.css:984, shared/vehicles.css:1040 | admin/vehicle-maintenance.html, admin/vehicle.html, admin/vehicles.html |
| .wk-chip | shared/workers.css:831, shared/workers.css:840, shared/workers.css:843 … | shared/workers.js |
| .wk-tabs | shared/workers.css:573, shared/workers.css:579, shared/workers.css:589 … | shared/workers.js |

## 3. Button details: what each button is using now and why

Each block: where it is styled, and every property it uses with a plain meaning. Edit the value after the colon to change it. `hover`/`active` blocks = look when mouse is over / pressed.

### .a-btn
Used in: admin/accounts-reports.html, admin/admin.html, admin/advances.html, admin/customers.html …
- **normal** — `.btn.a-btn` at shared/admin.css:98
  - `width: auto` — fixed width
  - `min-height: 40px` — smallest height
  - `padding: 0 16px` — space inside = button size
  - `font-size: 14px` — text size
- **normal** — `.btn.a-btn` at shared/admin.css:354
  - `min-height: 44px` — smallest height
- **normal** — `.btn.a-btn` at shared/theme.css:3236
  - `height: 36px !important` — fixed height
  - `min-height: 36px !important` — smallest height
  - `padding: 0 14px !important` — space inside = button size
  - `font-size: 13px !important` — text size
  - `border-radius: 10px !important` — corner roundness
  - `line-height: 1` — text row height
- **normal** — `.pf2-hd .a-btn` at admin/profile.html (inline):177
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 8px` — space between items

### .a-chips
Used in: admin/route.html, worker/route.html
- **normal** — `.a-chips` at admin/route.html (inline):94
  - `order: 2` — sequence in row
- **normal** — `.a-chips` at admin/route.html (inline):543
  - `grid-area: chips`
- **normal** — `.a-chips` at worker/route.html (inline):94
  - `order: 2` — sequence in row
- **normal** — `.a-chips` at worker/route.html (inline):543
  - `grid-area: chips`

### .a-table
Used in: admin/accounts-dashboard.html, admin/accounts.html, admin/advances.html, admin/collections.html …
- **normal** — `.a-table` at shared/admin.css:139
  - `width: 100%` — fixed width
  - `border-collapse: collapse`
- **normal** — `.a-table` at shared/admin.css:360
  - `display: block` — layout type (flex/inline-flex/block/none)

### .a-uchip
Used in: shared/admin.js
- **normal** — `.a-uchip` at shared/admin.css:2015
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 10px` — space between items
  - `height: 40px` — fixed height
  - `padding: 0 10px 0 4px` — space inside = button size
  - `border-radius: 12px` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `cursor: pointer` — mouse icon
  - `font: inherit`
- **normal** — `.a-uchip` at shared/admin.css:2094
  - `padding: 0 4px` — space inside = button size
- **normal** — `.a-top .a-uchip` at shared/admin.css:2834
  - `padding: 0` — space inside = button size
  - `min-width: 0` — smallest width
  - `gap: 0` — space between items
- **normal** — `.a-top:has(.a-dn) .a-uchip` at shared/plan.css:2205
  - `flex: none` — how it stretches in a row

### .ac-btn
Used in: admin/accounts.html
- **normal** — `.ac-btn` at admin/accounts.html (inline):19
  - `width: auto` — fixed width
  - `padding-left: 16px` — inner space left
  - `padding-right: 16px` — inner space right
  - `white-space: nowrap` — text wrapping

### .ac-chip
Used in: admin/accounts.html
- **normal** — `.ac-chip` at admin/accounts.html (inline):113
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `padding: 8px 14px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `background: var(--t-info)` — fill colour/gradient
  - `color: var(--info)` — text colour
  - `font-size: 13px` — text size
  - `font-weight: 600` — boldness
- **normal** — `.ac-chip:empty` at admin/accounts.html (inline):114
  - `display: none` — layout type (flex/inline-flex/block/none)
- **normal** — `.ac-chip.ok` at admin/accounts.html (inline):115
  - `background: var(--t-success)` — fill colour/gradient
  - `color: var(--success)` — text colour
- **normal** — `.ac-chip.ok::before` at admin/accounts.html (inline):116
  - `content: "✓"`
  - `margin-right: 6px` — space outside right

### .ac-openbtn
Used in: admin/accounts.html
- **normal** — `.ac-alloc a.ac-openbtn` at admin/accounts.html (inline):42
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 6px` — space between items
  - `margin-top: 8px` — space outside top
  - `padding: 8px 14px` — space inside = button size
  - `border: 1px solid var(--primary)` — outline line
  - `border-radius: 10px` — corner roundness
  - `color: var(--primary)` — text colour
  - `font-size: 13px` — text size
  - `font-weight: 700` — boldness
  - `text-decoration: none` — underline
  - `background: transparent` — fill colour/gradient
- **hover** — `.ac-alloc a.ac-openbtn:hover` at admin/accounts.html (inline):43
  - `background: var(--t-primary)` — fill colour/gradient

### .ac-tabs
Used in: admin/accounts.html
- **normal** — `.ac-tabs` at admin/accounts.html (inline):72
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 6px` — space between items
  - `border-bottom: 2px solid var(--border)` — bottom line
  - `margin: 0 0 16px` — space outside
  - `overflow-x: auto`
  - `overflow-y: hidden`
- **normal** — `.ac-tabs` at worker/advances.html (inline):66
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `overflow-x: auto`
  - `scrollbar-width: none`
  - `margin-bottom: 14px` — space outside bottom

### .action-buttons
Used in: admin/problem.html, worker/problem.html
- **normal** — `.action-buttons` at admin/problem.html (inline):133
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `flex-direction: column` — row/column
  - `gap: 10px` — space between items
  - `margin-top: 14px` — space outside top
  - `padding-bottom: 30px` — inner space bottom
- **normal** — `.action-buttons` at worker/problem.html (inline):133
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `flex-direction: column` — row/column
  - `gap: 10px` — space between items
  - `margin-top: 14px` — space outside top
  - `padding-bottom: 30px` — inner space bottom

### .ad-btn
Used in: admin/accounts-dashboard.html
- **normal** — `.ad-btn` at admin/accounts-dashboard.html (inline):132
  - `width: auto` — fixed width
  - `padding-left: 16px` — inner space left
  - `padding-right: 16px` — inner space right

### .al-btn
Used in: admin/activity.html
- **normal** — `.al-btn` at shared/theme.css:3236
  - `height: 36px !important` — fixed height
  - `min-height: 36px !important` — smallest height
  - `padding: 0 14px !important` — space inside = button size
  - `font-size: 13px !important` — text size
  - `border-radius: 10px !important` — corner roundness
  - `line-height: 1` — text row height
- **normal** — `.al-btn` at shared/theme.css:3253
  - `width: 16px` — fixed width
  - `height: 16px` — fixed height
- **normal** — `.al-btn` at admin/activity.html (inline):90
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `justify-content: center` — horizontal alignment
  - `gap: 6px` — space between items
  - `height: 36px` — fixed height
  - `padding: 0 16px` — space inside = button size
  - `border: 0` — outline line
  - `border-radius: 10px` — corner roundness
  - `background: var(--primary)` — fill colour/gradient
  - `color: var(--on-primary)` — text colour
  - `font: inherit`
  - `font-size: 13px` — text size
  - `font-weight: 700` — boldness
  - `cursor: pointer` — mouse icon
- **normal** — `.al-btn` at admin/activity.html (inline):338
  - `flex: 1 1 100%` — how it stretches in a row

### .al-pill
Used in: admin/activity.html
- **normal** — `.al-pill` at admin/activity.html (inline):238
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 6px` — space between items
  - `padding: 6px 12px` — space inside = button size
  - `border-radius: 8px` — corner roundness
  - `font-size: 13.5px` — text size
  - `font-weight: 600` — boldness
  - `white-space: nowrap` — text wrapping
- **normal** — `.al-row .al-pill` at admin/activity.html (inline):379
  - `font-size: 12.5px` — text size
  - `padding: 5px 10px` — space inside = button size

### .at-btn
Used in: worker/attendance.html
- **normal** — `.at-btn` at shared/theme.css:2595
  - `height: 42px !important` — fixed height
  - `min-height: 42px !important` — smallest height
  - `font-size: 14px !important` — text size
  - `border-radius: 12px` — corner roundness
- **normal** — `body:not(:has(.a-main)) .at-btn` at shared/theme.css:2628
  - `min-width: 0 !important` — smallest width
- **normal** — `.at-btn` at shared/theme.css:2663
  - `transition: transform 0.22s var(--w-ease),
    box-shadow 0.22s var(--w-ease),
   ` — smooth animation between states
- **normal** — `.at-btn` at shared/theme.css:2692
  - `transform: scale(0.96)` — move/scale/rotate

### .at-chip
Used in: shared/attendance.js
- **normal** — `.at-hero .at-chip` at shared/attendance.css:579
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
  - `font-weight: 700` — boldness
  - `font-size: 12.5px` — text size
  - `letter-spacing: 0.02em` — letter gap
  - `padding: 3px 10px` — space inside = button size
  - `border-radius: 999px` — corner roundness

### .at-tabs
Used in: shared/attendance.js
- **normal** — `.at-tabs` at shared/attendance.css:333
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 6px` — space between items
  - `flex-wrap: wrap`
  - `margin-bottom: 14px` — space outside bottom

### .back-btn
Used in: admin/problem.html, admin/punch-in.html, worker/problem.html, worker/punch-in.html
- **normal** — `.back-btn` at shared/theme.css:218
  - `width: 44px` — fixed width
  - `height: 44px` — fixed height
  - `border-radius: var(--radius-btn)` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `place-items: center`
  - `cursor: pointer` — mouse icon
  - `text-decoration: none` — underline
- **normal** — `.back-btn)` at shared/theme.css:2624
  - `width: 40px !important` — fixed width
  - `height: 40px !important` — fixed height
- **normal** — `.back-btn` at shared/theme.css:2663
  - `transition: transform 0.22s var(--w-ease),
    box-shadow 0.22s var(--w-ease),
   ` — smooth animation between states
- **normal** — `.back-btn` at shared/theme.css:2692
  - `transform: scale(0.96)` — move/scale/rotate

### .bl-chips
Used in: admin/bill.html, worker/bill.html
- **normal** — `.bl-chips` at admin/bill.html (inline):123
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `margin-top: 13px` — space outside top
  - `flex-wrap: wrap`
- **normal** — `.bl-chips` at worker/bill.html (inline):123
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `margin-top: 13px` — space outside top
  - `flex-wrap: wrap`

### .bl-table
Used in: worker/delivery.html
- **normal** — `.bl-table` at worker/delivery.html (inline):706
  - `width: 100%` — fixed width
  - `table-layout: fixed`
  - `border-collapse: collapse`
  - `font-size: 11.5px` — text size

### .brand-chip
Used in: login.html
- **normal** — `.brand-chip` at login.html (inline):99
  - `display: block` — layout type (flex/inline-flex/block/none)
  - `background: #fff` — fill colour/gradient
  - `border-radius: 16px` — corner roundness
  - `padding: 7px 14px` — space inside = button size
  - `box-shadow: 0 6px 22px rgba(15, 23, 42, 0.12)` — shadow/glow
  - `line-height: 0` — text row height
- **normal** — `.brand-chip` at login.html (inline):590
  - `padding: 5px 11px` — space inside = button size
  - `border-radius: 13px` — corner roundness

### .btn
Used in: admin/accounts-dashboard.html, admin/accounts-reports.html, admin/accounts.html, admin/admin.html …
- **normal** — `.gtc-quick .gtc-q-actions .btn` at shared/customers-plus.css:716
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `justify-content: center` — horizontal alignment
  - `box-sizing: border-box` — whether padding counts in width
  - `height: 42px` — fixed height
  - `min-height: 42px` — smallest height
  - `padding: 0 10px` — space inside = button size
  - `margin: 0` — space outside
  - `white-space: nowrap` — text wrapping
  - `line-height: 1` — text row height
  - `font: inherit`
  - `font-size: 13px` — text size
  - `font-weight: 700` — boldness
  - `border-radius: 10px` — corner roundness
- **normal** — `.gtc-quick .gtc-q-actions .btn` at shared/customers-plus.css:735
  - `flex: 1 1 0` — how it stretches in a row
  - `min-width: 0` — smallest width
- **normal** — `.gp-fphoto-b .btn` at shared/customers-plus.css:816
  - `height: 36px` — fixed height
  - `min-height: 0` — smallest height
  - `padding: 0 12px` — space inside = button size
  - `font-size: 13px` — text size
  - `font-weight: 700` — boldness
  - `white-space: nowrap` — text wrapping
- **normal** — `.gdt-acts .btn` at shared/customers-plus.css:1508
  - `white-space: nowrap` — text wrapping

### .btn-call-admin
Used in: admin/problem.html, worker/problem.html
- **normal** — `.btn-call-admin)` at shared/theme.css:2633
  - `height: 42px !important` — fixed height
  - `min-height: 42px !important` — smallest height
  - `font-size: 14px !important` — text size
  - `border-radius: 12px !important` — corner roundness
- **normal** — `.btn-call-admin` at admin/problem.html (inline):37
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 6px` — space between items
  - `background: var(--primary)` — fill colour/gradient
  - `color: var(--on-primary)` — text colour
  - `border: 0` — outline line
  - `border-radius: 8px` — corner roundness
  - `padding: 8px 14px` — space inside = button size
  - `font-size: 13px` — text size
  - `font-weight: 700` — boldness
  - `text-decoration: none` — underline
  - `flex-shrink: 0`
- **normal** — `.btn-call-admin` at worker/problem.html (inline):37
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 6px` — space between items
  - `background: var(--primary)` — fill colour/gradient
  - `color: var(--on-primary)` — text colour
  - `border: 0` — outline line
  - `border-radius: 8px` — corner roundness
  - `padding: 8px 14px` — space inside = button size
  - `font-size: 13px` — text size
  - `font-weight: 700` — boldness
  - `text-decoration: none` — underline
  - `flex-shrink: 0`

### .btn-danger
Used in: admin/accounts.html, admin/collections.html, admin/problem.html, admin/vehicle-fuel.html …
- **disabled** — `.btn:not(.btn-secondary):not(.btn-outline):not(.btn-danger):` at shared/admin.css:1427
  - `background-image: linear-gradient(
    110deg,
    transparent 30%,
    rgba(255, 255, 2`
  - `background-size: 250% 100%`
  - `background-position: 160% 0`
  - `background-repeat: no-repeat`
- **disabled** — `.btn.btn-danger:not(:disabled):hover` at shared/admin.css:1449
  - `box-shadow: 0 8px 20px -8px rgba(220, 38, 38, 0.5)` — shadow/glow
- **normal** — `.btn-danger` at shared/theme.css:374
  - `background: var(--danger)` — fill colour/gradient
  - `color: #ffffff` — text colour
- **normal** — `.btn-danger` at shared/theme.css:2579
  - `height: 46px !important` — fixed height
  - `min-height: 46px !important` — smallest height
  - `font-size: 15px !important` — text size
  - `border-radius: 12px` — corner roundness

### .btn-forgot
Used in: login.html
- **normal** — `.btn-forgot` at login.html (inline):410
  - `background: none` — fill colour/gradient
  - `border: 0` — outline line
  - `padding: 6px 0` — space inside = button size
  - `font: inherit`
  - `font-size: 14px` — text size
  - `font-weight: 700` — boldness
  - `color: var(--primary)` — text colour
  - `cursor: pointer` — mouse icon
- **hover** — `.btn-forgot:hover` at login.html (inline):420
  - `text-decoration: underline` — underline

### .btn-group
Used in: admin/advances.html, admin/customers.html, admin/notifications.html, admin/products.html …
- **normal** — `.btn-group` at shared/theme.css:384
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 10px` — space between items

### .btn-outline
Used in: admin/accounts-dashboard.html, admin/accounts.html, admin/cash-closing.html, admin/collections.html …
- **disabled** — `.btn:not(.btn-secondary):not(.btn-outline):not(.btn-danger):` at shared/admin.css:1427
  - `background-image: linear-gradient(
    110deg,
    transparent 30%,
    rgba(255, 255, 2`
  - `background-size: 250% 100%`
  - `background-position: 160% 0`
  - `background-repeat: no-repeat`
- **disabled** — `.btn.btn-outline:not(:disabled):hover` at shared/admin.css:1443
  - `box-shadow: 0 8px 18px -10px rgba(15, 23, 42, 0.35)` — shadow/glow
  - `border-color: var(--primary)` — outline colour
  - `color: var(--primary)` — text colour
- **normal** — `.btn-outline` at shared/theme.css:368
  - `background: transparent` — fill colour/gradient
  - `border: 1.5px solid var(--primary)` — outline line
  - `color: var(--primary)` — text colour
- **normal** — `.btn.btn-outline` at shared/theme.css:2595
  - `height: 42px !important` — fixed height
  - `min-height: 42px !important` — smallest height
  - `font-size: 14px !important` — text size
  - `border-radius: 12px` — corner roundness

### .btn-secondary
Used in: admin/accounts-reports.html, admin/admin.html, admin/advances.html, admin/customers.html …
- **normal** — `.gtc-quick .gtc-q-actions .btn-secondary` at shared/customers-plus.css:745
  - `background: var(--card)` — fill colour/gradient
  - `border: 1px solid var(--border)` — outline line
  - `color: var(--text)` — text colour
- **hover** — `.gtc-quick .gtc-q-actions .btn-secondary:hover` at shared/customers-plus.css:751
  - `border-color: var(--primary)` — outline colour
  - `color: var(--primary)` — text colour
- **normal** — `.gdt-acts .btn:not(.btn-secondary)` at shared/customers-plus.css:1655
  - `background: var(--primary)` — fill colour/gradient
  - `border: 1px solid var(--primary)` — outline line
  - `color: var(--on-primary)` — text colour
- **hover** — `.gdt-acts .btn:not(.btn-secondary):hover` at shared/customers-plus.css:1660
  - `opacity: 0.9` — transparency

### .btn-success
Used in: admin/accounts.html, admin/collections.html, admin/daily-closing.html, admin/office-cash.html …
- **normal** — `.btn-success` at shared/theme.css:379
  - `background: var(--success)` — fill colour/gradient
  - `color: #ffffff` — text colour
- **normal** — `.btn-success` at shared/theme.css:2579
  - `height: 46px !important` — fixed height
  - `min-height: 46px !important` — smallest height
  - `font-size: 15px !important` — text size
  - `border-radius: 12px` — corner roundness
- **normal** — `.btn-success` at shared/theme.css:2663
  - `transition: transform 0.22s var(--w-ease),
    box-shadow 0.22s var(--w-ease),
   ` — smooth animation between states
- **normal** — `.btn-success` at shared/theme.css:2692
  - `transform: scale(0.96)` — move/scale/rotate

### .btns
Used in: admin/collections.html, shared/plan.js, worker/profile.html
- **normal** — `.dp-msum .btns` at shared/plan.css:558
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `flex-wrap: wrap`
  - `margin-top: 10px` — space outside top
- **normal** — `.co-pg .btns` at admin/collections.html (inline):169
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
- **normal** — `.pf-sheet .btns` at worker/profile.html (inline):566
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: 1fr 1fr`
  - `gap: 10px` — space between items
  - `margin-top: 16px` — space outside top

### .cbtns
Used in: sales/order.html
- **normal** — `.cbtns` at sales/sales.css:1302
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: auto 1fr`
  - `gap: 10px` — space between items

### .cc-btn
Used in: admin/cash-closing.html
- **normal** — `.cc-btn` at admin/cash-closing.html (inline):23
  - `width: auto` — fixed width
  - `padding: 0 16px` — space inside = button size
  - `white-space: nowrap` — text wrapping
- **normal** — `.cc-row .cc-btn` at admin/cash-closing.html (inline):52
  - `grid-column: 2/4`

### .cc-chip
Used in: admin/cash-closing.html
- **normal** — `.cc-chip` at admin/cash-closing.html (inline):38
  - `font-weight: 800` — boldness
  - `font-size: 15px` — text size
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
  - `border-radius: 9px` — corner roundness
  - `padding: 7px 0` — space inside = button size
  - `text-align: center` — text alignment

### .chip
Used in: admin/accounts-dashboard.html, admin/admin.html, admin/home.html, admin/index.html …
- **normal** — `.a-who .chip` at shared/admin.css:163
  - `font-weight: 700` — boldness
  - `font-size: 14px` — text size
- **normal** — `.a-stat .chip` at shared/admin.css:224
  - `background: var(--card)` — fill colour/gradient
- **normal** — `.a-n span:not(.chip)` at shared/admin.css:644
  - `display: block` — layout type (flex/inline-flex/block/none)
  - `font-size: 13px` — text size
  - `color: var(--muted)` — text colour
- **normal** — `.a-n .chip` at shared/admin.css:653
  - `flex: none` — how it stretches in a row

### .chips
Used in: worker/collect-sheet.html
- **normal** — `.chips` at worker/collect-sheet.html (inline):41
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `flex-wrap: wrap`

### .co-openbtn
Used in: admin/collections.html
- **normal** — `.co-openbtn` at admin/collections.html (inline):264
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 4px` — space between items
  - `padding: 6px 10px` — space inside = button size
  - `border: 1px solid var(--primary)` — outline line
  - `border-radius: 10px` — corner roundness
  - `color: var(--primary)` — text colour
  - `font-size: 12.5px` — text size
  - `font-weight: 700` — boldness
  - `text-decoration: none` — underline
  - `white-space: nowrap` — text wrapping
- **hover** — `.co-openbtn:hover` at admin/collections.html (inline):277
  - `background: var(--t-primary)` — fill colour/gradient
- **normal** — `button.co-openbtn` at admin/collections.html (inline):280
  - `background: transparent` — fill colour/gradient
  - `cursor: pointer` — mouse icon
  - `font-family: inherit` — font

### .d-chipn
Used in: admin/index.html
- **normal** — `.d-chipn` at admin/index.html (inline):202
  - `white-space: nowrap` — text wrapping
  - `flex: none` — how it stretches in a row
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 7px` — space between items
  - `font-size: 12.5px` — text size
  - `font-weight: 700` — boldness
  - `color: var(--primary)` — text colour
  - `background: var(--t-primary)` — fill colour/gradient
  - `padding: 5px 12px` — space inside = button size
  - `border-radius: 999px` — corner roundness

### .d-pill
Used in: admin/index.html
- **normal** — `.d-pill` at admin/index.html (inline):346
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 7px` — space between items
  - `font-size: 12.5px` — text size
  - `font-weight: 700` — boldness
  - `padding: 5px 12px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `white-space: nowrap` — text wrapping
- **normal** — `.d-pill.b-success` at admin/index.html (inline):362
  - `background: var(--t-success)` — fill colour/gradient
  - `color: #15803d` — text colour
- **normal** — `.d-pill.b-accent` at admin/index.html (inline):366
  - `background: var(--t-accent)` — fill colour/gradient
  - `color: #b45309` — text colour
- **normal** — `.d-pill.b-danger` at admin/index.html (inline):370
  - `background: rgba(220, 38, 38, 0.12)` — fill colour/gradient
  - `color: #dc2626` — text colour

### .dc-btn
Used in: admin/daily-closing.html
- **normal** — `.dc-btn` at admin/daily-closing.html (inline):28
  - `width: auto` — fixed width
  - `padding-left: 16px` — inner space left
  - `padding-right: 16px` — inner space right

### .dp-chip
Used in: shared/plan-dialogs.js, shared/plan.js
- **normal** — `.dp-chip` at shared/plan.css:654
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--muted)` — text colour
  - `border-radius: 999px` — corner roundness
  - `padding: 4px 10px` — space inside = button size
  - `font-family: inherit` — font
  - `font-size: 12px` — text size
  - `font-weight: 600` — boldness
  - `cursor: pointer` — mouse icon
- **normal** — `.dp-chip.on` at shared/plan.css:665
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
  - `border-color: var(--primary)` — outline colour
- **normal** — `.dp-chip` at shared/plan.css:1480
  - `transition: transform 0.2s var(--dp-ease),
    box-shadow 0.2s var(--dp-ease),
   ` — smooth animation between states
- **hover** — `.dp-chip:hover` at shared/plan.css:1532
  - `transform: translateY(-1px)` — move/scale/rotate

### .dp-chips
Used in: shared/plan-dialogs.js, shared/plan.js
- **normal** — `.dp-chips` at shared/plan.css:649
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 6px` — space between items
  - `flex-wrap: wrap`

### .dp-ptable
Used in: shared/plan.js
- **normal** — `.dp-ptable` at shared/plan.css:1331
  - `margin: 6px 0 4px` — space outside
  - `min-width: 420px` — smallest width
- **normal** — `.dp-ptable` at shared/plan.css:1353
  - `display: table !important` — layout type (flex/inline-flex/block/none)

### .dp-tab
Used in: shared/plan.js
- **normal** — `.dp-tab` at shared/admin.css:1586
  - `transition: background-color 0.2s,
    color 0.2s,
    transform 0.2s var(--fx-eas` — smooth animation between states
- **focus-visible** — `.dp-tab:focus-visible` at shared/plan.css:172
  - `outline: 2px solid var(--primary)` — focus ring
  - `outline-offset: 2px`
- **normal** — `.dp-tab` at shared/plan.css:341
  - `border: 0` — outline line
  - `background: none` — fill colour/gradient
  - `color: var(--muted)` — text colour
  - `font-family: inherit` — font
  - `font-size: 13px` — text size
  - `font-weight: 600` — boldness
  - `line-height: 1.5` — text row height
  - `padding: 11px 12px` — space inside = button size
  - `border-bottom: 2px solid transparent` — bottom line
  - `cursor: pointer` — mouse icon
  - `white-space: nowrap` — text wrapping
- **normal** — `.dp-tab.on` at shared/plan.css:354
  - `color: var(--primary)` — text colour

### .dp-table
Used in: shared/plan-dialogs.js, shared/plan.js
- **normal** — `.dp-table` at shared/plan.css:367
  - `width: 100%` — fixed width
  - `border-collapse: collapse`
- **normal** — `.dp-table` at shared/plan.css:1100
  - `display: block` — layout type (flex/inline-flex/block/none)

### .dp-tabs
Used in: shared/plan.js
- **normal** — `.dp-tabs` at shared/plan.css:334
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 2px` — space between items
  - `padding: 0 10px` — space inside = button size
  - `border-bottom: 1px solid var(--border)` — bottom line
  - `overflow-x: auto`

### .dv-btn2
Used in: admin/delivery.html, worker/delivery.html
- **normal** — `.dv-btn2` at admin/delivery.html (inline):215
  - `height: 46px` — fixed height
  - `border-radius: 12px` — corner roundness
  - `border: 1.5px solid var(--primary)` — outline line
  - `color: var(--primary)` — text colour
  - `background: var(--card)` — fill colour/gradient
  - `font: 700 14px Inter,
          sans-serif`
  - `width: 100%` — fixed width
  - `cursor: pointer` — mouse icon
- **disabled** — `.dv-btn2:disabled` at admin/delivery.html (inline):227
  - `opacity: 0.5` — transparency
- **normal** — `.dv-btn2` at worker/delivery.html (inline):221
  - `height: 46px` — fixed height
  - `border-radius: 12px` — corner roundness
  - `border: 1.5px solid var(--primary)` — outline line
  - `color: var(--primary)` — text colour
  - `background: var(--card)` — fill colour/gradient
  - `font: 700 14px Inter,
          sans-serif`
  - `width: 100%` — fixed width
  - `cursor: pointer` — mouse icon
- **disabled** — `.dv-btn2:disabled` at worker/delivery.html (inline):233
  - `opacity: 0.5` — transparency

### .gce-btn
Used in: admin/customers.html
- **normal** — `.gce-btns .gce-btn` at shared/customers-plus.css:1018
  - `flex: 1` — how it stretches in a row
- **normal** — `.gce-btn` at shared/customers-plus.css:1021
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `justify-content: center` — horizontal alignment
  - `height: 42px` — fixed height
  - `padding: 0 18px` — space inside = button size
  - `border: 1px solid var(--border)` — outline line
  - `border-radius: 11px` — corner roundness
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `font: inherit`
  - `font-size: 14px` — text size
  - `font-weight: 700` — boldness
  - `white-space: nowrap` — text wrapping
  - `cursor: pointer` — mouse icon
- **hover** — `.gce-btn:hover` at shared/customers-plus.css:1037
  - `border-color: var(--primary)` — outline colour
  - `color: var(--primary)` — text colour
- **normal** — `.gce-btn.soft` at shared/customers-plus.css:1041
  - `background: var(--t-primary)` — fill colour/gradient
  - `border-color: transparent` — outline colour
  - `color: var(--primary)` — text colour

### .gce-btns
Used in: admin/customers.html
- **normal** — `.gce-btns` at shared/customers-plus.css:1013
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `margin-bottom: 12px` — space outside bottom

### .gdt-chips
Used in: shared/customers-plus.js
- **normal** — `.gdt-chips` at shared/customers-plus.css:1162
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `flex-wrap: wrap`
  - `gap: 8px 12px` — space between items
  - `align-items: center` — vertical alignment

### .gdt-pill
Used in: shared/customers-plus.js
- **normal** — `.gdt-pill` at shared/customers-plus.css:1168
  - `padding: 5px 14px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `background: var(--bg)` — fill colour/gradient
  - `border: 1px solid var(--border)` — outline line
  - `font-weight: 700` — boldness
  - `font-size: 13px` — text size

### .gdt-tabs
Used in: shared/customers-plus.js
- **normal** — `.gdt-tabs` at shared/customers-plus.css:1320
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 4px` — space between items
  - `overflow-x: auto`
  - `margin: 14px 24px 0` — space outside
  - `padding: 4px` — space inside = button size
  - `border: 1px solid var(--border)` — outline line
  - `border-radius: 12px` — corner roundness
  - `background: var(--bg)` — fill colour/gradient
- **normal** — `.gdt-tabs` at shared/customers-plus.css:1503
  - `margin-left: 14px` — space outside left
  - `margin-right: 14px` — space outside right
- **normal** — `.gdt-tabs` at shared/customers-plus.css:1566
  - `gap: 4px` — space between items
  - `margin: 14px 24px 0` — space outside
  - `padding: 0` — space inside = button size
  - `border: 0` — outline line
  - `border-bottom: 1px solid var(--border)` — bottom line
  - `border-radius: 0` — corner roundness
  - `background: transparent` — fill colour/gradient
- **normal** — `.gdt-tabs` at shared/customers-plus.css:1596
  - `margin-left: 14px` — space outside left
  - `margin-right: 14px` — space outside right

### .gp-tabs
Used in: shared/customers-plus.js
- **normal** — `.gp-tabs` at shared/customers-plus.css:336
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 4px` — space between items
  - `border-bottom: 1px solid var(--border)` — bottom line
  - `margin-bottom: 12px` — space outside bottom

### .gtc-detail-tabs
Used in: admin/customers.html
- **normal** — `.gtc-detail-tabs` at shared/customers.css:630
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 4px` — space between items
  - `overflow: auto` — clip/scroll extra
  - `border-bottom: 1px solid var(--border)` — bottom line
  - `margin-top: 16px` — space outside top

### .gtc-muted-pill
Used in: admin/customers.html
- **normal** — `.gtc-muted-pill` at shared/customers.css:265
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `min-height: 24px` — smallest height
  - `padding: 3px 8px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `font-size: 11px` — text size
  - `font-weight: 700` — boldness
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
- **normal** — `.gtc-muted-pill` at shared/customers.css:277
  - `background: var(--bg)` — fill colour/gradient
  - `color: var(--muted)` — text colour

### .gtc-route-pill
Used in: admin/customers.html, shared/customers-plus.js
- **normal** — `.gtc-route-pill` at shared/customers.css:265
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `min-height: 24px` — smallest height
  - `padding: 3px 8px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `font-size: 11px` — text size
  - `font-weight: 700` — boldness
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour

### .gtc-table
Used in: admin/customers.html
- **normal** — `.a-main .gtc-table` at shared/admin.css:3234
  - `min-width: 0` — smallest width
  - `width: 100%` — fixed width
- **normal** — `.gtc-table` at shared/customers.css:218
  - `min-width: 1120px` — smallest width
- **normal** — `.gtc-table` at shared/customers.css:760
  - `min-width: 0` — smallest width
- **normal** — `.gtc-table` at shared/customers.css:766
  - `display: block` — layout type (flex/inline-flex/block/none)
  - `width: 100%` — fixed width

### .gtp-btn
Used in: shared/theme.js
- **normal** — `.a-main .om-bar .gtp-date .gtp-btn` at shared/admin.css:3304
  - `width: 100%` — fixed width
  - `height: 100%` — fixed height
  - `padding: 0 14px` — space inside = button size
  - `border: 0` — outline line
  - `background: none` — fill colour/gradient
  - `box-shadow: none` — shadow/glow
  - `align-items: center` — vertical alignment
  - `justify-content: space-between` — horizontal alignment
- **normal** — `.wk-form .field .gtp-btn` at shared/workers.css:16
  - `font-family: inherit` — font
  - `font-size: 13px` — text size
  - `font-weight: 400` — boldness
  - `color: var(--text)` — text colour
- **normal** — `.wk-form .field .gtp-btn` at shared/workers.css:48
  - `height: 100%` — fixed height
  - `min-height: 0` — smallest height
  - `padding: 0 12px` — space inside = button size
- **normal** — `.wk-mbar .gtp-btn` at shared/workers.css:1127
  - `height: 36px` — fixed height
  - `padding: 0 10px` — space inside = button size
  - `font-size: 13px` — text size

### .hv-pill
Used in: admin/accounts-reports.html
- **normal** — `.hv-pill` at admin/accounts-reports.html (inline):47
  - `display: inline-block` — layout type (flex/inline-flex/block/none)
  - `padding: 3px 10px` — space inside = button size
  - `border-radius: 99px` — corner roundness
  - `font-size: 12px` — text size
  - `font-weight: 600` — boldness
  - `white-space: nowrap` — text wrapping
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
- **normal** — `.hv-pill.w` at admin/accounts-reports.html (inline):48
  - `background: var(--t-warn,#fef3c7)` — fill colour/gradient
  - `color: #b45309` — text colour
- **normal** — `.hv-pill.d` at admin/accounts-reports.html (inline):48
  - `background: var(--t-danger)` — fill colour/gradient
  - `color: #b91c1c` — text colour
- **normal** — `.hv-pill.g` at admin/accounts-reports.html (inline):48
  - `background: #e5e7eb` — fill colour/gradient
  - `color: #4b5563` — text colour

### .ibtn
Used in: sales/sales.js
- **normal** — `.ibtn` at sales/sales.css:313
  - `width: 40px` — fixed width
  - `height: 40px` — fixed height
  - `border-radius: 50%` — corner roundness
  - `border: 1px solid var(--line)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `place-items: center`
  - `cursor: pointer` — mouse icon
  - `color: var(--muted)` — text colour
- **hover** — `.ibtn:hover` at sales/sales.css:324
  - `color: var(--text)` — text colour

### .icon-btn
Used in: admin/bill.html, admin/delivery.html, admin/home.html, admin/problem.html …
- **normal** — `.icon-btn` at shared/theme.css:231
  - `width: 44px` — fixed width
  - `height: 44px` — fixed height
  - `border-radius: var(--radius-btn)` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--accent)` — text colour
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `place-items: center`
  - `cursor: pointer` — mouse icon
- **normal** — `body:not(:has(.a-main)) :is(.icon-btn` at shared/theme.css:2624
  - `width: 40px !important` — fixed width
  - `height: 40px !important` — fixed height
- **normal** — `.icon-btn` at shared/theme.css:2663
  - `transition: transform 0.22s var(--w-ease),
    box-shadow 0.22s var(--w-ease),
   ` — smooth animation between states
- **normal** — `.icon-btn` at shared/theme.css:2692
  - `transform: scale(0.96)` — move/scale/rotate

### .in-out-pill
Used in: worker/attendance.html
- **normal** — `.app .in-out-pill` at shared/theme.css:744
  - `flex-wrap: wrap`
- **normal** — `.in-out-pill` at worker/attendance.html (inline):229
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `font-size: 12px` — text size
  - `margin-top: 3px` — space outside top
  - `color: var(--muted)` — text colour

### .lv-btn
Used in: admin/live.html
- **normal** — `.lv-btn` at shared/theme.css:3236
  - `height: 36px !important` — fixed height
  - `min-height: 36px !important` — smallest height
  - `padding: 0 14px !important` — space inside = button size
  - `font-size: 13px !important` — text size
  - `border-radius: 10px !important` — corner roundness
  - `line-height: 1` — text row height
- **normal** — `.lv-btn` at shared/theme.css:3253
  - `width: 16px` — fixed width
  - `height: 16px` — fixed height
- **normal** — `.lv-btn` at admin/live.html (inline):54
  - `gap: 6px` — space between items
  - `font-weight: 700` — boldness
  - `cursor: pointer` — mouse icon
  - `white-space: nowrap` — text wrapping
- **disabled** — `.lv-btn:disabled` at admin/live.html (inline):60
  - `opacity: 0.6` — transparency
  - `cursor: default` — mouse icon

### .lv-pills
Used in: admin/live.html
- **normal** — `.lv-pills` at admin/live.html (inline):146
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 6px` — space between items
  - `flex: none` — how it stretches in a row

### .ma-tab
Used in: worker/advances.html
- **normal** — `.ma-tab` at worker/advances.html (inline):424
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `border-radius: 999px` — corner roundness
  - `padding: 9px 20px` — space inside = button size
  - `font: inherit`
  - `font-weight: 700` — boldness
  - `font-size: 14px` — text size
  - `cursor: pointer` — mouse icon
  - `white-space: nowrap` — text wrapping
- **normal** — `.ma-tab.active` at worker/advances.html (inline):425
  - `background: var(--primary)` — fill colour/gradient
  - `color: var(--on-primary, #fff)` — text colour
  - `border-color: var(--primary)` — outline colour

### .ma-tabs
Used in: worker/advances.html
- **normal** — `.ma-tabs` at worker/advances.html (inline):423
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `overflow-x: auto`
  - `margin-bottom: 12px` — space outside bottom

### .modal-close-btn
Used in: admin/delivery.html, worker/attendance.html, worker/delivery.html
- **normal** — `body:not(:has(.a-main)) .modal-close-btn` at shared/theme.css:2639
  - `width: 40px !important` — fixed width
  - `height: 40px !important` — fixed height
- **normal** — `.modal-close-btn` at admin/delivery.html (inline):747
  - `width: 34px` — fixed width
  - `height: 34px` — fixed height
  - `border-radius: 50%` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--bg)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `place-items: center`
  - `font-size: 15px` — text size
  - `font-weight: 700` — boldness
  - `cursor: pointer` — mouse icon
- **normal** — `.modal-close-btn` at worker/attendance.html (inline):285
  - `width: 36px` — fixed width
  - `height: 36px` — fixed height
  - `border-radius: 50%` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--bg)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `place-items: center`
  - `font-size: 16px` — text size
  - `font-weight: 700` — boldness
  - `cursor: pointer` — mouse icon
- **normal** — `.modal-close-btn` at worker/delivery.html (inline):781
  - `width: 34px` — fixed width
  - `height: 34px` — fixed height
  - `border-radius: 50%` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--bg)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `place-items: center`
  - `font-size: 15px` — text size
  - `font-weight: 700` — boldness
  - `cursor: pointer` — mouse icon

### .oc-btn
Used in: admin/office-cash.html
- **normal** — `.oc-btn` at admin/office-cash.html (inline):28
  - `width: auto` — fixed width
  - `padding: 0 16px` — space inside = button size
  - `white-space: nowrap` — text wrapping
- **normal** — `.oc-row .oc-btn` at admin/office-cash.html (inline):31
  - `grid-column: 2/4`

### .om-tab
Used in: admin/orders.html
- **normal** — `.a-main .om-tabs .om-tab` at shared/admin.css:3329
  - `grid-column: span 3`
  - `text-align: center` — text alignment
  - `padding: 10px 8px` — space inside = button size
- **normal** — `.om-tab` at admin/orders.html (inline):168
  - `border: 1px solid transparent` — outline line
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `border-radius: 10px` — corner roundness
  - `padding: 9px 14px` — space inside = button size
  - `font: inherit`
  - `font-size: 14px` — text size
  - `cursor: pointer` — mouse icon
- **normal** — `.om-tab.on` at admin/orders.html (inline):178
  - `background: var(--primary)` — fill colour/gradient
  - `color: var(--on-primary)` — text colour
  - `font-weight: 600` — boldness

### .om-tabs
Used in: admin/orders.html
- **normal** — `.a-main .om-tabs` at shared/admin.css:3327
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: repeat(6, minmax(0, 1fr))`
  - `gap: 8px` — space between items
- **normal** — `.om-tabs` at admin/orders.html (inline):161
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `flex-wrap: wrap`
  - `align-items: center` — vertical alignment
  - `margin-bottom: 12px` — space outside bottom

### .pf-btn
Used in: worker/profile.html
- **normal** — `.pf-btn` at shared/theme.css:2595
  - `height: 42px !important` — fixed height
  - `min-height: 42px !important` — smallest height
  - `font-size: 14px !important` — text size
  - `border-radius: 12px` — corner roundness
- **normal** — `.pf-btn` at shared/theme.css:2663
  - `transition: transform 0.22s var(--w-ease),
    box-shadow 0.22s var(--w-ease),
   ` — smooth animation between states
- **normal** — `.pf-btn` at shared/theme.css:2692
  - `transform: scale(0.96)` — move/scale/rotate
- **normal** — `.pf-btn` at shared/theme.css:2723
  - `transform: translateY(-2px)` — move/scale/rotate
  - `box-shadow: 0 8px 18px -10px rgba(15, 23, 42, 0.35)` — shadow/glow
  - `border-color: var(--primary)` — outline colour

### .pf-tab
Used in: worker/profile.html
- **normal** — `body:not(:has(.a-main)) :is(.pf-tab)` at shared/theme.css:2619
  - `height: 40px !important` — fixed height
  - `min-height: 40px !important` — smallest height
  - `font-size: 13.5px !important` — text size
- **normal** — `.pf-tab` at worker/profile.html (inline):182
  - `height: 46px` — fixed height
  - `border-radius: 12px` — corner roundness
  - `border: 1px solid var(--border)` — outline line
  - `background: var(--card)` — fill colour/gradient
  - `color: var(--muted)` — text colour
  - `font-weight: 700` — boldness
  - `font-size: 14px` — text size
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `justify-content: center` — horizontal alignment
  - `gap: 8px` — space between items
  - `cursor: pointer` — mouse icon
  - `font-family: inherit` — font
  - `min-width: 0` — smallest width
- **normal** — `.pf-tab.on` at worker/profile.html (inline):203
  - `background: var(--primary)` — fill colour/gradient
  - `color: var(--on-primary)` — text colour
  - `border-color: var(--primary)` — outline colour
  - `box-shadow: 0 4px 10px rgba(15, 118, 110, 0.2)` — shadow/glow
- **normal** — `.pf-tab` at worker/profile.html (inline):215
  - `font-size: 11.5px` — text size
  - `gap: 0` — space between items
  - `padding: 0 2px` — space inside = button size

### .pf-tabs
Used in: worker/profile.html
- **normal** — `.pf-tabs` at worker/profile.html (inline):176
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: repeat(4, 1fr)`
  - `gap: 8px` — space between items
  - `margin-bottom: 14px` — space outside bottom

### .pill
Used in: admin/home.html, sales/home.html, sales/orders.html, sales/route.html …
- **normal** — `.pill` at shared/theme.css:284
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 8px` — space between items
  - `background: rgba(255, 255, 255, 0.18)` — fill colour/gradient
  - `border-radius: 999px` — corner roundness
  - `padding: 5px 14px` — space inside = button size
  - `font-size: 13px` — text size
  - `font-weight: 600` — boldness
- **normal** — `.pill` at shared/theme.css:684
  - `white-space: nowrap` — text wrapping
- **normal** — `.app .hero .pill` at shared/theme.css:757
  - `white-space: normal` — text wrapping
- **normal** — `.pill` at sales/sales.css:885
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 4px` — space between items
  - `font-size: 11.5px` — text size
  - `font-weight: 600` — boldness
  - `border-radius: 999px` — corner roundness
  - `padding: 3px 10px` — space inside = button size
  - `white-space: nowrap` — text wrapping

### .pill-l
Used in: admin/punch-out.html, worker/punch-out.html
- **normal** — `.po-sum .pill-l` at admin/punch-out.html (inline):312
  - `display: inline-block` — layout type (flex/inline-flex/block/none)
  - `font-size: 12px` — text size
  - `font-weight: 700` — boldness
  - `background: rgba(255, 255, 255, 0.2)` — fill colour/gradient
  - `border-radius: 999px` — corner roundness
  - `padding: 4px 12px` — space inside = button size
- **normal** — `.po-sum .pill-l` at worker/punch-out.html (inline):312
  - `display: inline-block` — layout type (flex/inline-flex/block/none)
  - `font-size: 12px` — text size
  - `font-weight: 700` — boldness
  - `background: rgba(255, 255, 255, 0.2)` — fill colour/gradient
  - `border-radius: 999px` — corner roundness
  - `padding: 4px 12px` — space inside = button size

### .pl-btn
Used in: sales/home.html
- **normal** — `.pl-btn` at sales/sales.css:2286
  - `height: 50px` — fixed height
  - `padding: 0 22px` — space inside = button size
  - `border: 0` — outline line
  - `border-radius: 16px` — corner roundness
  - `background: #0f766e` — fill colour/gradient
  - `color: #fff` — text colour
  - `font-weight: 700` — boldness
  - `font-size: 14px` — text size
  - `cursor: pointer` — mouse icon

### .pr-table
Used in: admin/products.html
- **normal** — `.a-main .pr-table` at shared/admin.css:3373
  - `display: block` — layout type (flex/inline-flex/block/none)
  - `width: 100%` — fixed width
  - `min-width: 0` — smallest width
- **normal** — `.pr-table` at shared/products.css:196
  - `width: 100%` — fixed width
  - `border-collapse: collapse`
  - `min-width: 720px` — smallest width

### .ret-btn
Used in: admin/returns.html
- **normal** — `.a-main .ret-btn` at shared/admin.css:3490
  - `height: 42px` — fixed height
  - `padding: 0 18px` — space inside = button size
  - `border-radius: 10px` — corner roundness
  - `justify-self: start`
- **hover** — `.a-main .ret-btn:hover` at shared/admin.css:3491
  - `border-color: var(--primary)` — outline colour
- **hover** — `.a-main .ret-btn.primary:hover` at shared/admin.css:3492
  - `filter: brightness(1.08)` — blur/brightness
- **normal** — `.a-main .ret-btn` at shared/admin.css:3504
  - `width: 100%` — fixed width
  - `justify-self: stretch`

### .ret-pill
Used in: admin/returns.html
- **normal** — `.a-main .ret-pill` at shared/admin.css:3475
  - `font-size: 12px` — text size
  - `font-weight: 700` — boldness
  - `text-transform: capitalize` — UPPER/lower case
  - `padding: 6px 12px` — space inside = button size
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
  - `border: 1px solid var(--border)` — outline line
- **normal** — `.ret-pill` at admin/returns.html (inline):7
  - `font-size: 11px` — text size
  - `padding: 5px 9px` — space inside = button size
  - `border-radius: 20px` — corner roundness
  - `background: var(--soft)` — fill colour/gradient
  - `color: var(--muted)` — text colour
  - `white-space: nowrap` — text wrapping

### .rp-tabs
Used in: admin/accounts-reports.html
- **normal** — `.rp-tabs` at admin/accounts-reports.html (inline):6
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 6px` — space between items
  - `border-bottom: 2px solid var(--border)` — bottom line
  - `margin: 0 0 16px` — space outside
  - `overflow-x: auto`
  - `overflow-y: hidden`
- **normal** — `.rp-tabs` at admin/accounts-reports.html (inline):34
  - `display: none!important` — layout type (flex/inline-flex/block/none)

### .rt-chip
Used in: admin/delivery.html, shared/routes.js, worker/delivery.html
- **normal** — `.rt-chip` at shared/routes.css:480
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 5px` — space between items
  - `padding: 3px 9px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `font-size: 12px` — text size
  - `font-weight: 600` — boldness
  - `white-space: nowrap` — text wrapping
- **normal** — `.rt-chip.pin` at shared/routes.css:494
  - `background: var(--t-success)` — fill colour/gradient
  - `color: var(--success)` — text colour
- **normal** — `.rt-chip.nopin` at shared/routes.css:498
  - `background: var(--t-accent)` — fill colour/gradient
  - `color: var(--accent)` — text colour
- **normal** — `.rt-chip` at admin/delivery.html (inline):1290
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `gap: 8px` — space between items
  - `min-height: 46px` — smallest height
  - `padding: 8px 11px` — space inside = button size
  - `border: 1.5px solid var(--border)` — outline line
  - `border-radius: 12px` — corner roundness
  - `background: var(--bg)` — fill colour/gradient
  - `color: var(--text)` — text colour
  - `font: 600 13.5px/1.25 Inter,
          sans-serif`
  - `cursor: pointer` — mouse icon
  - `text-align: left` — text alignment

### .rt-chips
Used in: admin/delivery.html, admin/route.html, worker/delivery.html, worker/route.html
- **normal** — `.rt-chips` at admin/delivery.html (inline):1285
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: 1fr 1fr`
  - `gap: 8px` — space between items
- **normal** — `.rt-chips` at admin/route.html (inline):193
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `overflow-x: auto`
  - `scrollbar-width: none`
- **normal** — `.rt-chips::-webkit-scrollbar` at admin/route.html (inline):199
  - `display: none` — layout type (flex/inline-flex/block/none)
- **normal** — `.rt-chips` at worker/delivery.html (inline):1319
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: 1fr 1fr`
  - `gap: 8px` — space between items

### .sa-pill
Used in: admin/sales.html
- **normal** — `.sa-pill` at admin/sales.html (inline):80
  - `display: inline-block` — layout type (flex/inline-flex/block/none)
  - `border-radius: 999px` — corner roundness
  - `padding: 2px 10px` — space inside = button size
  - `font-size: 12px` — text size
  - `font-weight: 600` — boldness

### .sh-btn
Used in: admin/delivery.html, worker/delivery.html
- **normal** — `.sh-btn` at admin/delivery.html (inline):820
  - `height: 50px` — fixed height
  - `border-radius: 13px` — corner roundness
  - `width: 100%` — fixed width
  - `margin-top: 8px` — space outside top
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `align-items: center` — vertical alignment
  - `justify-content: center` — horizontal alignment
  - `font: 700 14.5px Inter,
          sans-serif`
  - `cursor: pointer` — mouse icon
  - `border: 0` — outline line
- **disabled** — `.sh-btn:disabled` at admin/delivery.html (inline):834
  - `opacity: 0.6` — transparency
- **normal** — `.rt-foot .sh-btn` at admin/delivery.html (inline):1279
  - `margin-top: 0` — space outside top
- **normal** — `.rt-foot .sh-btn + .sh-btn` at admin/delivery.html (inline):1282
  - `margin-top: 8px` — space outside top

### .tabs
Used in: sales/shop.html
- **normal** — `.tabs` at sales/sales.css:1354
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 4px` — space between items
  - `border-bottom: 1px solid var(--line)` — bottom line

### .toggle
Used in: login.html
- **normal** — `.toggle` at login.html (inline):180
  - `position: relative` — how it's placed
  - `display: grid` — layout type (flex/inline-flex/block/none)
  - `grid-template-columns: 1fr 1fr`
  - `padding: 4px` — space inside = button size
  - `border-radius: 999px` — corner roundness
  - `background: color-mix(in srgb, var(--card) 82%, transparent)` — fill colour/gradient
  - `-webkit-backdrop-filter: blur(10px)`
  - `backdrop-filter: blur(10px)` — blur behind
  - `border: 1px solid var(--border)` — outline line
  - `box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1)` — shadow/glow
- **normal** — `html[data-theme="dark"] .toggle` at login.html (inline):192
  - `box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4)` — shadow/glow
- **normal** — `.toggle::before` at login.html (inline):195
  - `content: ""`
  - `position: absolute` — how it's placed
  - `top: 4px` — offset from top
  - `bottom: 4px` — offset from bottom
  - `left: 4px` — offset from left
  - `width: calc(50% - 4px)` — fixed width
  - `border-radius: 999px` — corner roundness
  - `background: linear-gradient(
          135deg,
          var(--primary),
         ` — fill colour/gradient
  - `box-shadow: 0 4px 12px
          color-mix(in srgb, var(--primary) 45%, transparen` — shadow/glow
  - `transition: transform 0.28s cubic-bezier(0.4, 0.1, 0.2, 1)` — smooth animation between states
- **normal** — `.toggle:has(#td[aria-pressed="true"])::before` at login.html (inline):212
  - `transform: translateX(100%)` — move/scale/rotate

### .up-btn
Used in: admin/upi-settlements.html
- **normal** — `.up-btn` at admin/upi-settlements.html (inline):73
  - `width: auto` — fixed width
  - `padding-left: 16px` — inner space left
  - `padding-right: 16px` — inner space right

### .us-table
Used in: admin/users.html
- **normal** — `.us-table` at shared/users.css:293
  - `width: 100%` — fixed width
  - `border-collapse: collapse`
  - `min-width: 760px` — smallest width
- **normal** — `.us-table` at shared/users.css:664
  - `min-width: 0` — smallest width
- **normal** — `.us-table` at shared/users.css:670
  - `display: block` — layout type (flex/inline-flex/block/none)
  - `width: 100%` — fixed width
  - `box-sizing: border-box` — whether padding counts in width

### .vx-tab
Used in: admin/vehicle-maintenance.html, admin/vehicle.html, admin/vehicles.html
- **focus-visible** — `.vx-tab:focus-visible` at shared/vehicles.css:179
  - `outline: 2px solid var(--primary)` — focus ring
  - `outline-offset: 2px`
- **normal** — `.vx-tab` at shared/vehicles.css:378
  - `display: inline-flex` — layout type (flex/inline-flex/block/none)
  - `gap: 8px` — space between items
  - `align-items: center` — vertical alignment
  - `border: 0` — outline line
  - `background: none` — fill colour/gradient
  - `color: var(--muted)` — text colour
  - `font-family: inherit` — font
  - `font-size: 13px` — text size
  - `font-weight: 600` — boldness
  - `line-height: 1.5` — text row height
  - `padding: 13px 14px` — space inside = button size
  - `border-bottom: 2px solid transparent` — bottom line
  - `cursor: pointer` — mouse icon
  - `white-space: nowrap` — text wrapping
- **normal** — `.vx-tab.on` at shared/vehicles.css:399
  - `color: var(--primary)` — text colour
  - `border-bottom-color: var(--primary)`
- **hover** — `.vx-tab:hover` at shared/vehicles.css:403
  - `color: var(--primary)` — text colour

### .vx-table
Used in: admin/vehicle-fuel.html, admin/vehicle-maintenance.html, admin/vehicle.html, admin/vehicles.html
- **normal** — `.vx-table` at shared/vehicles.css:478
  - `width: 100%` — fixed width
  - `border-collapse: collapse`
- **normal** — `.vx-table.stack` at shared/vehicles.css:956
  - `display: block` — layout type (flex/inline-flex/block/none)

### .vx-tabs
Used in: admin/vehicle-maintenance.html, admin/vehicle.html, admin/vehicles.html
- **normal** — `.vx-tabs` at shared/vehicles.css:368
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 2px` — space between items
  - `overflow-x: auto`
  - `background: var(--card)` — fill colour/gradient
  - `border: 1px solid var(--border)` — outline line
  - `border-radius: var(--radius-card)` — corner roundness
  - `padding: 0 8px` — space inside = button size
  - `margin-bottom: 14px` — space outside bottom
- **normal** — `.vx-tabs` at shared/vehicles.css:982
  - `border-radius: 18px` — corner roundness
  - `box-shadow: 0 6px 24px -14px rgba(15, 80, 70, 0.28)` — shadow/glow
- **normal** — `.vx-tabs` at shared/vehicles.css:1040
  - `padding: 8px` — space inside = button size
  - `gap: 6px` — space between items

### .wk-chip
Used in: shared/workers.js
- **normal** — `.wk-hero .wk-meta .wk-chip` at shared/workers.css:831
  - `background: var(--t-primary)` — fill colour/gradient
  - `color: var(--primary)` — text colour
  - `font-weight: 700` — boldness
  - `font-size: 12.5px` — text size
  - `letter-spacing: 0.02em` — letter gap
  - `padding: 3px 10px` — space inside = button size
  - `border-radius: 999px` — corner roundness

### .wk-tabs
Used in: shared/workers.js
- **normal** — `.wk-tabs` at shared/workers.css:573
  - `display: flex` — layout type (flex/inline-flex/block/none)
  - `gap: 6px` — space between items
  - `flex-wrap: wrap`
  - `margin-bottom: 14px` — space outside bottom


## 4. Shared files: what each does

- `activity.js` — GM-CRM activity log: turns "what was saved before" and "what is being saved now" into short plain sentences.
- `backend/modules/accounts/accounts.domain.js` — Financial values are represented as integer paise inside the domain layer.
- `backend/modules/accounts/accounts.routes.js` — (no header comment)
- `backend/modules/attendance/attendance.routes.js` — (no header comment)
- `backend/modules/attendance/attendance.service.js` — (no header comment)
- `backend/modules/health/health.routes.js` — (no header comment)
- `backup-integrity.js` — (no header comment)
- `playwright.config.js` — Browser tests target a separately deployed staging environment only.
- `server.js` — (no header comment)
- `shared/admin.css` — (no header comment)
- `shared/admin.js` — General Traders (GM-CRM) - Admin data layer + page shell.
- `shared/attendance.css` — Attendance dashboard (admin). Uses theme variables so light and dark both work. */
- `shared/attendance.js` — General Traders - Attendance dashboard (admin). Reads every employee's own record from the server (read only)
- `shared/consent.js` — General Traders - first-use privacy notice for drivers and helpers.
- `shared/customers-plus.css` — General Traders - Customers page enhancements (pairs with customers-plus.js) */
- `shared/customers-plus.js` — General Traders - Customers page enhancements (loaded after the page script).
- `shared/customers.css` — General Traders Customers page */
- `shared/dropdown.css` — Themed dropdowns for the Sales app: the same rules as the .gt-dd block in theme.css (copied as is). */
- `shared/dropdown.js` — Themed dropdowns for the Sales app: an exact copy of the dropdown block in theme.js (so Sales matches Admin an
- `shared/form-check.js` — Shared form helper: red * on required labels, red box + message under the empty field.
- `shared/loading.js` — Lightweight loading feedback for GM-CRM.
- `shared/mock-data.js` — General Traders (GM-CRM) - Shared Mock Data Store
- `shared/pin-picker.js` — Shop location picker (shared by the delivery page and the Shop pins page).
- `shared/plan-core.js` — General Traders - Daily Plan: shared helpers (data access, saving, dialogs, menus, searchable picker, toasts).
- `shared/plan-dialogs.js` — General Traders - Daily Plan: the workflows that change a plan (add plan, priority shop, change order, employe
- `shared/plan-map.js` — General Traders - Daily Plan: map (Leaflet + OpenStreetMap, the same vendored library the Routes page uses).
- `shared/plan.css` — General Traders - Daily Plan workspace. Loads after theme.css and admin.css; uses only shared theme variables.
- `shared/plan.js` — General Traders - Daily Plan workspace (three panels: plans, selected plan, route map).
- `shared/products.css` — General Traders - Products module. Loads after theme.css, admin.css and plan.css. Theme variables only. */
- `shared/products.js` — General Traders - Products module (list + add/edit wizard). Loads after admin.js and plan-core.js. */
- `shared/punch-modal.js` — Punch In / Punch Out as a popup. Include after mock-data.js.
- `shared/road-line.js` — General Traders - shared road-route helper for every Leaflet map.
- `shared/routes.css` — General Traders (GM-CRM) - Routes page (list / cards / map). Load after theme.css and admin.css */
- `shared/routes.js` — General Traders (GM-CRM) - Routes page: searchable route selector, List / Cards / Map views, drag-and-drop vis
- `shared/static-path.js` — A path is inside root only when relative() does not escape via '..'.
- `shared/sync.js` — GM-CRM sync v2: keeps gm_* browser data in step with the backend server.
- `shared/theme.css` — Fonts: Inter is loaded from shared/fonts on EVERY page (admin, delivery app, login), not only the pages that l
- `shared/theme.js` — General Traders (GM-CRM) - Theme Switcher
- `shared/user-form.js` — General Traders - Create / Edit user as a pop-up (used by users.html and super.html).
- `shared/users.css` — General Traders - Users & Admins module. Loads after theme.css, admin.css and plan.css. Theme variables only (
- `shared/users.js` — General Traders - Users & Admins module (shared helpers for super.html, users.html and user-edit.html).
- `shared/vehicles.css` — General Traders - Vehicles module. Loads after theme.css, admin.css and plan.css (for dialogs, menus, toasts).
- `shared/vehicles.js` — General Traders - Vehicles: shared data layer, derived numbers, charts and small components.
- `shared/visit.js` — GM-VISIT: how long the employee spends at each shop.
- `shared/workers.css` — Workers pages (admin). Theme variables only, so light and dark both work. */
- `shared/workers.js` — General Traders - Workers (admin): list, add/edit, details, documents, route assignment.
- `shared/xlsx-lite.js` — Minimal .xlsx reader (no libraries). Reads the first sheet into rows of text. Needs DecompressionStream (all c
- `storage.js` — GM-CRM storage: keeps saved data and uploaded files either on this computer's disk (default)

## 5. Notes
- Files ending in .bak and folder _backup_before_updates are old copies; ignore them.
- Short names like a, b, q, r in JS are local helpers only; the real JS↔CSS link is the class name.


## 6. Find it → Change it (step by step, plain language)

### A. How to find which code controls something on screen
1. Open the page in Chrome/Edge. Right-click the thing (button, box, text) → **Inspect**.
2. The highlighted line shows `class="btn a-btn"`. Those words are the class names. They are the link between the page and the CSS.
3. On the right side (Styles panel) you see every CSS rule affecting it, with the file name and line number (e.g. `theme.css:3236`).
4. A rule with a line through it is being overridden by another rule. The rule without a line is the one winning. Edit that one.
5. Search this MAP.md for the class name (Ctrl+F) to see everything that uses it.
6. To find which JS creates or controls it: search the project for the class name. The JS file that contains it is the one. If a button has an `id="saveBtn"`, search `saveBtn` to find the click code.

### B. What the 3 kinds of files do
- **HTML** (admin/xyz.html): the skeleton, which buttons and boxes exist on the page.
- **CSS** (shared/*.css): how they look, such as colour, size, shape and animation.
- **JS** (shared/*.js): what they do when clicked, and also builds some buttons on the fly. So a button may not be in the HTML at all; it may be written inside a JS file as text.

### C. Where to edit, by what you want
| I want to change… | Edit this |
|---|---|
| One button on one page only | Give it a new class in the HTML (or JS), then add that class in the page's CSS |
| All buttons of a type (e.g. every `.a-btn`) | The class rule in section 3 (watch for `!important` overrides in `theme.css`) |
| Every button in the app | `.btn` rule, or the colour variables in `shared/theme.css` under `:root` |
| Colours of whole app / dark mode | `shared/theme.css` variables (`--something`). Check the dark-theme block too |
| Phone layout only | The same class inside `@media (max-width: …) { }` |
| Text on a button | The HTML, or the JS file that builds it |
| What happens on click | The JS file (search the button's id or class) |

### D. If your change does nothing (checklist)
1. **Hard refresh:** Ctrl+Shift+R. The browser may be showing the old file.
2. **Overridden:** Inspect → is your rule crossed out? Another rule wins. Edit that one, or make yours more specific (`.card .a-btn`), or as a last resort add `!important`.
3. **Wrong file:** the same class can be styled in several files (the section 3 list shows all). The last one loaded wins; `theme.css` usually loads last in these pages.
4. **Inline style:** if the HTML tag has `style="..."`, it beats CSS files. Edit it there.
5. **JS sets it:** some JS changes styles while the app runs (search `.style.` in the JS). Edit there.
6. **Wrong page:** check section 1 to confirm that page actually loads that CSS file.
7. **Server copy:** if the app runs on a server, restart it or redeploy so the new file is served.
8. **Typo:** a missing `;` or `}` breaks every rule after it in that file. Inspect will show nothing for the broken rule.

### E. Copy-paste recipes (add to the end of the CSS file that loads last, e.g. `theme.css`, then give the button the class)
**Make bigger / smaller**
```css
.my-big   { padding: 14px 28px; font-size: 16px; }
.my-small { padding: 4px 10px;  font-size: 12px; }
```
**Shapes**
```css
.my-pill   { border-radius: 999px; }          /* fully rounded ends */
.my-square { border-radius: 0; }              /* sharp corners */
.my-circle { width: 44px; height: 44px; padding: 0; border-radius: 50%; } /* icon-only */
```
**Move**
```css
.my-right  { margin-left: auto; }             /* push to right edge (inside a flex row) */
.my-nudge  { transform: translate(6px, -3px); } /* 6px right, 3px up, others unaffected */
.my-fixed  { position: fixed; right: 16px; bottom: 16px; z-index: 50; } /* floating button */
.my-full   { width: 100%; }                   /* full-width, good on phones */
```
**Hover / press effects**
```css
.my-fx { transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
.my-fx:hover  { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,.2); } /* lift */
.my-fx:active { transform: scale(.96); }                                              /* press down */
```
**Always-on animations**
```css
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
.my-pulse { animation: pulse 1.6s ease-in-out infinite; }       /* draws attention */

@keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.my-shake { animation: shake .35s; }                            /* e.g. add on error */

@keyframes spin { to { transform: rotate(360deg); } }
.my-loading { position: relative; color: transparent; pointer-events: none; }
.my-loading::after { content: ""; position: absolute; inset: 0; margin: auto; width: 16px; height: 16px;
  border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
```
**Look**
```css
.my-gradient { background: linear-gradient(90deg, #6366f1, #8b5cf6); color: #fff; border: 0; }
.my-outline  { background: transparent; border: 2px solid currentColor; }
.my-glow     { box-shadow: 0 0 0 3px rgba(99,102,241,.35); }
.my-disabled, button:disabled { opacity: .5; cursor: not-allowed; }
```

### F. Safe working habits
- Copy the file to `.bak` before editing.
- Test the change live in Inspect first, then copy the value into the file.
- Change one thing at a time, refresh, check. Then the next.
- After colour changes, check dark mode and a phone-width screen.
- If it breaks: undo your last change (or restore the .bak).
