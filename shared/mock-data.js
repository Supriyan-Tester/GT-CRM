/* General Traders (GM-CRM) - Shared Mock Data Store
   Provides demo state with realistic past data and clean future states.
*/
(function () {
  var STORAGE_KEY = 'gm_crm_data_v5';

  // Base date reference: Today is 03 October 2026
  var DEFAULT_DATA = {
    worker: {
      id: 'GT-W104',
      name: 'Ravi Kumar',
      phone: '9876543210',
      role: 'Delivery Executive',
      onLeaveToday: false,
      emergencyContact: '98765 99999 (Brother)',
      adminPhone: '8489600833',
      adminName: 'Fleet Admin'
    },
    shift: {
      punchedIn: false,
      punchInTime: null,
      assignedVehicle: '',
      lastRecordedKm: 0,
      startKm: null,
      punchedOut: false,
      punchOutTime: null,
      endKm: null,
      drivenKm: null,
      handoverCompleted: false
    },
    warehouse: {
      name: 'Depot',
      address: '',
      lat: null,
      lng: null,
      radiusMeters: 200
    },
    products: [
      { code: 'P101', name: 'Refined Oil (1L Pouch)', unitPrice: 130 },
      { code: 'P102', name: 'Basmati Rice (5kg Bag)', unitPrice: 420 },
      { code: 'P103', name: 'Wheat Flour / Atta (10kg Bag)', unitPrice: 380 },
      { code: 'P104', name: 'Premium Tea Powder (500g)', unitPrice: 210 },
      { code: 'P105', name: 'Crystal Sugar (1kg Packet)', unitPrice: 44 },
      { code: 'P106', name: 'Toor Dal Premium (1kg)', unitPrice: 165 },
      { code: 'P107', name: 'Detergent Washing Powder (1kg)', unitPrice: 110 },
      { code: 'P108', name: 'Pure Coconut Oil (500ml Bottle)', unitPrice: 140 },
      { code: 'P109', name: 'Glucose Biscuits (Box of 24 pkts)', unitPrice: 240 },
      { code: 'P110', name: 'Beauty Soap Bar (Box of 12 pcs)', unitPrice: 360 },
      { code: 'P111', name: 'Mustard Seeds / Rai (500g)', unitPrice: 65 },
      { code: 'P112', name: 'Groundnut Oil Tin (5L)', unitPrice: 890 }
    ],
    shops: [
      {
        id: 's1',
        name: 'Shree Krishna Stores',
        owner: 'Ramesh Patel',
        phone: '9876500001',
        address: '14/B Main Market Road, Near Gandhi Statue',
        distance: '450m away',
        boxes: 3,
        billNo: 'INV-2041',
        lat: 18.5231, lng: 73.8589,
        billAmount: 4250,
        status: 'pending',
        priority: true,
        img: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=300&auto=format&fit=crop&q=60'
      },
      {
        id: 's2',
        name: 'City Supermarket',
        owner: 'Sunil Gupta',
        phone: '9876500002',
        address: 'Plot 8, North Ring Road, Opp. Bus Stand',
        distance: '850m away',
        boxes: 5,
        billNo: 'INV-2042',
        lat: 18.5262, lng: 73.8611,
        billAmount: 7890,
        status: 'pending',
        priority: false,
        img: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=300&auto=format&fit=crop&q=60'
      },
      {
        id: 's3',
        name: 'Rajesh Provision Store',
        owner: 'Rajesh Sharma',
        phone: '9876500003',
        address: '22 Station Bazaar, Near Platform 1',
        distance: '1.4 km away',
        boxes: 2,
        billNo: 'INV-2043',
        lat: 18.532, lng: 73.865,
        billAmount: 2310,
        status: 'pending',
        priority: false,
        img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=60'
      },
      {
        id: 's4',
        name: 'Anand Bakers & Daily Needs',
        owner: 'Anand Kumar',
        phone: '9876500004',
        address: 'Shop 4, Golden Plaza, Hospital Road',
        distance: '2.1 km away',
        boxes: 4,
        billNo: 'INV-2044',
        lat: 18.538, lng: 73.87,
        billAmount: 5120,
        status: 'pending',
        priority: false,
        img: 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=300&auto=format&fit=crop&q=60'
      },
      {
        id: 's5',
        name: 'Deluxe General Store',
        owner: 'Mohammad Arif',
        phone: '9876500005',
        address: '56 Old Fort Road, Near Jama Masjid',
        distance: '3.2 km away',
        boxes: 1,
        billNo: 'INV-2045',
        lat: 18.545, lng: 73.876,
        billAmount: 1450,
        status: 'pending',
        priority: false,
        img: 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?w=300&auto=format&fit=crop&q=60'
      }
    ],
    returns: [],
    // Month-by-month Advances and Deductions (Realistic past data, NO future entries)
    monthlyLedger: {
      '2026-10': [
        {
          id: 101,
          date: '01 Oct 2026',
          title: 'Festival Advance Salary',
          type: 'advance',
          amount: 3000,
          note: 'Approved by Fleet Admin for upcoming festival'
        }
      ],
      '2026-09': [
        {
          id: 201,
          date: '28 Sep 2026',
          title: 'Damaged item deduction',
          type: 'deduction',
          amount: 150,
          note: '1 oil bottle broken during transit at Krishna Stores'
        },
        {
          id: 202,
          date: '15 Sep 2026',
          title: 'Mid-Month Salary Advance',
          type: 'advance',
          amount: 1500,
          note: 'Transferred via UPI on worker request'
        }
      ],
      '2026-08': [
        {
          id: 301,
          date: '22 Aug 2026',
          title: 'Family Emergency Advance',
          type: 'advance',
          amount: 2000,
          note: 'Cash advance signed with Admin'
        },
        {
          id: 302,
          date: '11 Aug 2026',
          title: 'Crushed box deduction',
          type: 'deduction',
          amount: 120,
          note: 'Carton damage during unloading at City Supermarket'
        }
      ]
    },
    // Realistic Attendance: Oct 1-3 are completed/current. Days 4-31 are upcoming with NO fake values!
    attendanceMonthly: {
      '2026-10': [
        { day: 1, weekday: 'Thu', status: 'present', inTime: '08:15 AM', outTime: '05:30 PM', hours: '9h 15m', km: 48 },
        { day: 2, weekday: 'Fri', status: 'late', inTime: '08:52 AM', outTime: '05:45 PM', hours: '8h 53m', km: 54 },
        { day: 3, weekday: 'Sat', status: 'present', inTime: '08:10 AM', outTime: '05:15 PM', hours: '9h 05m', km: 42 },
        // Upcoming days: No fake attendance values!
        { day: 4, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '0h', km: 0 },
        { day: 5, weekday: 'Mon', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 6, weekday: 'Tue', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 7, weekday: 'Wed', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 8, weekday: 'Thu', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 9, weekday: 'Fri', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 10, weekday: 'Sat', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 11, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 12, weekday: 'Mon', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 13, weekday: 'Tue', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 14, weekday: 'Wed', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 15, weekday: 'Thu', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 16, weekday: 'Fri', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 17, weekday: 'Sat', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 18, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 19, weekday: 'Mon', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 20, weekday: 'Tue', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 21, weekday: 'Wed', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 22, weekday: 'Thu', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 23, weekday: 'Fri', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 24, weekday: 'Sat', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 25, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 26, weekday: 'Mon', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 27, weekday: 'Tue', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 28, weekday: 'Wed', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 29, weekday: 'Thu', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 30, weekday: 'Fri', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 },
        { day: 31, weekday: 'Sat', status: 'upcoming', inTime: '--', outTime: '--', hours: '--', km: 0 }
      ],
      // Full completed past month (September 2026)
      '2026-09': [
        { day: 1, weekday: 'Tue', status: 'present', inTime: '08:12 AM', outTime: '05:30 PM', hours: '9h 18m', km: 50 },
        { day: 2, weekday: 'Wed', status: 'present', inTime: '08:15 AM', outTime: '05:40 PM', hours: '9h 25m', km: 52 },
        { day: 3, weekday: 'Thu', status: 'present', inTime: '08:20 AM', outTime: '05:35 PM', hours: '9h 15m', km: 48 },
        { day: 4, weekday: 'Fri', status: 'late', inTime: '08:50 AM', outTime: '05:45 PM', hours: '8h 55m', km: 54 },
        { day: 5, weekday: 'Sat', status: 'present', inTime: '08:10 AM', outTime: '05:15 PM', hours: '9h 05m', km: 42 },
        { day: 6, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '0h', km: 0 },
        { day: 7, weekday: 'Mon', status: 'present', inTime: '08:15 AM', outTime: '05:40 PM', hours: '9h 25m', km: 51 },
        { day: 8, weekday: 'Tue', status: 'present', inTime: '08:14 AM', outTime: '05:30 PM', hours: '9h 16m', km: 49 },
        { day: 9, weekday: 'Wed', status: 'absent', inTime: '--', outTime: '--', hours: '0h', km: 0 },
        { day: 10, weekday: 'Thu', status: 'present', inTime: '08:18 AM', outTime: '05:45 PM', hours: '9h 27m', km: 53 },
        { day: 11, weekday: 'Fri', status: 'present', inTime: '08:11 AM', outTime: '05:30 PM', hours: '9h 19m', km: 50 },
        { day: 12, weekday: 'Sat', status: 'present', inTime: '08:22 AM', outTime: '05:10 PM', hours: '8h 48m', km: 40 },
        { day: 13, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '0h', km: 0 },
        { day: 14, weekday: 'Mon', status: 'present', inTime: '08:15 AM', outTime: '05:35 PM', hours: '9h 20m', km: 52 },
        { day: 15, weekday: 'Tue', status: 'present', inTime: '08:10 AM', outTime: '05:40 PM', hours: '9h 30m', km: 55 },
        { day: 16, weekday: 'Wed', status: 'late', inTime: '08:45 AM', outTime: '05:30 PM', hours: '8h 45m', km: 47 },
        { day: 17, weekday: 'Thu', status: 'present', inTime: '08:12 AM', outTime: '05:30 PM', hours: '9h 18m', km: 51 },
        { day: 18, weekday: 'Fri', status: 'present', inTime: '08:16 AM', outTime: '05:50 PM', hours: '9h 34m', km: 58 },
        { day: 19, weekday: 'Sat', status: 'present', inTime: '08:19 AM', outTime: '05:15 PM', hours: '8h 56m', km: 43 },
        { day: 20, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '0h', km: 0 },
        { day: 21, weekday: 'Mon', status: 'present', inTime: '08:15 AM', outTime: '05:40 PM', hours: '9h 25m', km: 52 },
        { day: 22, weekday: 'Tue', status: 'present', inTime: '08:10 AM', outTime: '05:35 PM', hours: '9h 25m', km: 50 },
        { day: 23, weekday: 'Wed', status: 'present', inTime: '08:14 AM', outTime: '05:45 PM', hours: '9h 31m', km: 56 },
        { day: 24, weekday: 'Thu', status: 'present', inTime: '08:18 AM', outTime: '05:30 PM', hours: '9h 12m', km: 49 },
        { day: 25, weekday: 'Fri', status: 'present', inTime: '08:12 AM', outTime: '05:40 PM', hours: '9h 28m', km: 53 },
        { day: 26, weekday: 'Sat', status: 'present', inTime: '08:20 AM', outTime: '05:10 PM', hours: '8h 50m', km: 41 },
        { day: 27, weekday: 'Sun', status: 'off', inTime: '--', outTime: '--', hours: '0h', km: 0 },
        { day: 28, weekday: 'Mon', status: 'present', inTime: '08:15 AM', outTime: '05:30 PM', hours: '9h 15m', km: 48 },
        { day: 29, weekday: 'Tue', status: 'present', inTime: '08:08 AM', outTime: '05:45 PM', hours: '9h 37m', km: 55 },
        { day: 30, weekday: 'Wed', status: 'present', inTime: '08:15 AM', outTime: '05:35 PM', hours: '9h 20m', km: 50 }
      ]
    }
  };

  // The built-in sample shops are no longer given to anyone's route. They are kept only to build the demo attendance history below.
  var DEMO_SHOPS = DEFAULT_DATA.shops;
  DEFAULT_DATA.shops = [];

  // DEMO HISTORY (past days only): vehicle, odometer, shops and returns for completed shifts.
  // Delete this block when real data comes from a backend.
  (function () {
    var days = [];
    ['2026-09', '2026-10'].forEach(function (k) {
      DEFAULT_DATA.attendanceMonthly[k].forEach(function (d) {
        if (d.status === 'present' || d.status === 'late') days.push({ key: k, d: d });
      });
    });
    var running = DEFAULT_DATA.shift.lastRecordedKm;
    var times = ['09:40 AM', '11:15 AM', '01:20 PM', '03:10 PM', '04:45 PM'];
    for (var i = days.length - 1; i >= 0; i--) {
      var d = days[i].d, key = days[i].key;
      d.endKm = running; d.startKm = running - d.km; running = d.startKm;
      d.vehicle = DEFAULT_DATA.shift.assignedVehicle;
      d.shops = DEMO_SHOPS.map(function (sh, n) {
        var retry = key === '2026-10' && d.day === 2 && n === 4;
        return { name: sh.name, address: sh.address.split(',')[0], boxes: sh.boxes, billNo: sh.billNo, time: times[n], status: retry ? 'retry' : 'delivered' };
      });
      d.returns = (key === '2026-09' && d.day === 28) ? [{ item: 'Refined Oil (1L Pouch)', qty: 1, amount: 150, reason: 'Bottle broken in transit at Shree Krishna Stores' }] : [];
    }
  })();

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st.worker && (st.worker.password || st.worker.pin)) { delete st.worker.password; delete st.worker.pin; saveStore(st); }
        // Remove the old sample shops (Shree Krishna Stores etc.) that earlier versions put in every employee's record.
        // Only when no real plan was ever applied, so a real route is never touched.
        if (typeof st.appliedPlan !== 'string' && Array.isArray(st.shops) && st.shops.length &&
            st.shops.every(function (x) { return x && /^s[1-5]$/.test(x.id) && /^INV-204[1-5]$/.test(x.billNo || ''); })) {
          st.shops = [];
          st.shift = Object.assign(st.shift || {}, { punchedIn: false, punchInTime: null, startKm: null, punchedOut: false, punchOutTime: null, endKm: null, drivenKm: null, handoverCompleted: false });
          st.returns = [];
          saveStore(st);
        }
        return st;
      }
    } catch (e) {}
    saveStore(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  function saveStore(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  // Shop pins saved by employees (gm_pins_v1): { <shop code or N:NAME>: { lat, lng, acc, phone, address, by, at } }
  function pinKey(s) { return s ? (s.code || (s.name ? 'N:' + String(s.name).toUpperCase() : '')) : ''; }
  // Each employee writes only their own key (gm_pins_v1_<id>), so two employees saving at the same moment can never overwrite each other.
  // Everyone reads all of them (plus the old shared gm_pins_v1), so a shop saved by one employee is seen as done by the others.
  function pinOwnKey() { var id = String(((loadStore().worker || {}).id) || 'x').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 60) || 'x'; return 'gm_pins_v1_' + id; }
  function pinParse(k) { try { var P = JSON.parse(localStorage.getItem(k)); return P && typeof P === 'object' && !Array.isArray(P) ? P : {}; } catch (e) { return {}; } }
  function pinStore() {   // all employees' saved pins, merged (a saved location wins over a details-only entry)
    var out = {}, keys = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k === 'gm_pins_v1' || k.indexOf('gm_pins_v1_') === 0) keys.push(k); }
    keys.forEach(function (k) { var P = pinParse(k); Object.keys(P).forEach(function (c) { var e = P[c]; if (!e || typeof e !== 'object') return; if (!out[c] || (typeof e.lat === 'number' && typeof out[c].lat !== 'number')) out[c] = e; }); });
    return out;
  }
  function pinExtra(e, x) {
    if (!x) return;
    var d = String(x.phone || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2); if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    if (d.length === 10) e.phone = d;
    var a = String(x.address || '').replace(/\s+/g, ' ').trim().slice(0, 200); if (a) e.address = a;
  }
  function markPinDone(code) { if (!code) return; var d = loadStore(); d.pinDone = d.pinDone || {}; d.pinDone[code] = Date.now(); saveStore(d); }
  /* ---- Crew: a driver and helpers share one route. Each person writes their own marks (gm_crew_<day>_<id>); everyone merges the others' marks into their own list. ---- */
  function crewDay() { var t = new Date(); return t.getFullYear() + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0'); }
  function crewMerge(d) {
    if (!d || !d.crewSize || d.crewSize < 2 || !Array.isArray(d.shops)) return false;
    var me = (d.worker || {}).id, pre = 'gm_crew_' + crewDay() + '_', changed = false;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i); if (!k || k.indexOf(pre) !== 0 || k === pre + me) continue;
      var c; try { c = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
      if (!c || typeof c !== 'object') continue;
      var marks = c.marks || {};
      Object.keys(marks).forEach(function (bill) {
        var m = marks[bill]; if (!m || !m.f || typeof m.t !== 'number') return;
        d.shops.forEach(function (sh) {
          if ((sh.billNo || sh.id) !== bill || (sh.sAt || 0) >= m.t) return;
          if (sh.status === m.f.status && sh.sAt === m.t) return;
          Object.keys(m.f).forEach(function (f) { sh[f] = m.f[f]; });
          sh.sAt = m.t; sh.doneBy = m.by || ''; changed = true;
        });
      });
      (Array.isArray(c.returns) ? c.returns : []).forEach(function (r) {
        if (!r || r.id == null) return;
        d.returns = d.returns || [];
        if (!d.returns.some(function (x) { return x.id === r.id; })) { d.returns.push(Object.assign({}, r, { shared: true })); changed = true; }
      });
    }
    return changed;
  }

  window.GM = {
    // Set to false before real workers use the app: hides the demo login helper.
    DEMO_MODE: false,

    getData: function () {
      return loadStore();
    },

    getWorker: function () {
      var w = loadStore().worker;
      // The office number shown to employees follows the admin's own account (editable on the admin Profile page)
      try { var a = JSON.parse(localStorage.getItem('gm_admin_account_v1')); if (Array.isArray(a) && a[0] && a[0].phone) w = Object.assign({}, w, { adminPhone: a[0].phone, adminName: a[0].name || w.adminName }); } catch (e) {}
      return w;
    },

    setWorker: function (worker) {
      var d = loadStore();
      d.worker = Object.assign(d.worker, worker);
      saveStore(d);
    },

    // Loads today's plan built in the admin Daily plan page for THIS worker (several workers can each have one).
    // First time today: replaces the shops and starts a fresh shift on the plan's vehicle.
    // If the admin edits the plan later the same day: shops already delivered, cancelled or marked retry are kept,
    // pending shops follow the new plan (moved, added, removed or re-ordered) and the shift is left alone.
    applyTodayPlan: function () {
      var d = loadStore(), w = d.worker, t = new Date();
      var key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      // NEW DAY: yesterday's punch-in / punch-out, delivered shops and returns must not carry over.
      // This used to happen only when the office had made a plan for today, so on a day with no plan
      // the app kept showing yesterday's "Day Finished" screen with no Punch In button.
      var lastDay = d.dayKey || (typeof d.appliedPlan === 'string' ? d.appliedPlan.slice(0, 10) : null), fresh = false;
      if (lastDay && lastDay !== key) {
        d.shift = Object.assign(d.shift || {}, { punchedIn: false, punchInTime: null, startKm: null, punchedOut: false, punchOutTime: null, endKm: null, drivenKm: null, handoverCompleted: false });
        d.returns = [];
        if (typeof d.appliedPlan === 'string') d.shops = [];                       // yesterday's plan shops are gone; today's plan (if any) fills them below
        else (d.shops || []).forEach(function (sh) { sh.status = 'pending'; });    // demo data: start every shop again
        d.appliedPlan = (typeof d.appliedPlan === 'string') ? key + ':none' : null; fresh = true;
      }
      if (d.dayKey !== key) { d.dayKey = key; if (!fresh) saveStore(d); }
      var adm = {};
      try { adm = JSON.parse(localStorage.getItem('gm_admin_v1')) || {}; } catch (e) {}
      var raw = adm.plans && adm.plans[key], every = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      // Cancelled plans stay in the admin data as history; the worker only follows active plans.
      var list = every.filter(function (p) { return p && p.status !== 'cancelled'; });
      // The plan this person follows: as the driver (workerId) or as a helper riding along (helpers).
      var plan = list.filter(function (p) { return p && p.workerId && p.workerId === w.id; })[0] || list.filter(function (p) { return p && Array.isArray(p.helpers) && p.helpers.indexOf(w.id) > -1; })[0], custs = adm.customers || [];
      var crewRole = plan ? (plan.workerId === w.id ? 'driver' : 'helper') : null, crewSize = plan ? 1 + (Array.isArray(plan.helpers) ? plan.helpers.length : 0) : 0, crewDirty = false;
      var prevRole = d.crewRole;
      if (d.crewRole !== crewRole || d.crewSize !== crewSize) { d.crewRole = crewRole; d.crewSize = crewSize; crewDirty = true; }
      // Messages the admin sent about changes to today's plans (priority shop, new order, worker or vehicle change, cancellation).
      // Each one is stored once in this worker's own record, which is also how the admin page can tell it arrived.
      var got = (d.noticeIds = d.noticeIds || []), gotNew = false;
      every.forEach(function (p) {
        (p.history || []).forEach(function (h) {
          if (!h || !h.id || !h.notify || h.notify.indexOf(w.id) < 0 || got.indexOf(h.id) > -1) return;
          got.push(h.id); gotNew = true;
          d.notices = d.notices || [];
          d.notices.unshift({ id: h.id, ts: h.ts, type: h.type, text: (h.workerTexts && h.workerTexts[w.id]) || h.workerText || h.text, read: false });
        });
      });
      if (d.notices) d.notices = d.notices.slice(0, 30);
      if (got.length > 200) d.noticeIds = got.slice(-200);
      if (!plan) {
        // The plan this worker was following was cancelled or given to someone else: unfinished shops come off the list.
        if (typeof d.appliedPlan === 'string' && d.appliedPlan.indexOf(key + ':') === 0 && d.appliedPlan !== key + ':none') {
          // A helper's list is only a copy of the driver's route, so it goes away completely when they are taken off the plan.
          d.shops = prevRole === 'helper' ? [] : (d.shops || []).filter(function (s) { return s.status !== 'pending'; });
          if (prevRole === 'helper') d.returns = (d.returns || []).filter(function (r) { return !r.shared; });
          d.shops.forEach(function (s, i) { s.distance = 'Stop ' + (i + 1) + ' of ' + d.shops.length; });
          d.appliedPlan = key + ':none'; saveStore(d); return true;
        }
        if (gotNew || fresh || crewDirty) { saveStore(d); return true; }
        return false;
      }
      var tag = key + ':' + plan.builtAt;
      if (d.appliedPlan === tag) { var mg = crewMerge(d); if (gotNew || mg || crewDirty) { saveStore(d); return true; } return false; }
      var sameDay = typeof d.appliedPlan === 'string' && d.appliedPlan.indexOf(key + ':') === 0;
      function mk(s, id) {
        var c = custs.filter(function (x) { return x.code === s.code; })[0] || {};
        return { id: id, name: s.name, owner: plan.routeName || 'Route', phone: c.phone || '', address: s.address || '-',
          distance: '', boxes: Number(s.boxes) || 0, items: Array.isArray(s.items) ? s.items : [], billNo: s.inv, billAmount: Number(s.amount) || 0,
          status: 'pending', priority: !!s.priority, img: '../assets/logo.png',
          note: s.note || '', visitTime: s.time || '',
          code: s.code, lat: (typeof c.lat === 'number' ? c.lat : undefined), lng: (typeof c.lng === 'number' ? c.lng : undefined) };
      }
      var shops;
      if (!sameDay) {
        shops = plan.stops.map(function (s, i) { return mk(s, 'p' + (i + 1)); });
        d.returns = [];
        d.shift = Object.assign(d.shift, { punchedIn: false, punchInTime: null, startKm: null, punchedOut: false, punchOutTime: null, endKm: null, drivenKm: null, handoverCompleted: false,
          assignedVehicle: plan.vehicleLabel || plan.vehicle || d.shift.assignedVehicle, lastRecordedKm: plan.vehicleKm != null ? plan.vehicleKm : d.shift.lastRecordedKm });
      } else {
        var old = d.shops || [], used = {};
        old.forEach(function (o) { used[o.id] = 1; });
        function freeId() { var n = 1; while (used['p' + n]) n++; used['p' + n] = 1; return 'p' + n; }
        shops = plan.stops.map(function (s) {
          var ex = old.filter(function (o) { return o.billNo === s.inv; })[0];
          if (ex) return ex.status !== 'pending' ? ex : mk(s, ex.id);
          return mk(s, freeId());
        });
        old.forEach(function (o) { if (o.status !== 'pending' && !plan.stops.some(function (s) { return s.inv === o.billNo; })) shops.push(o); });
        if (!d.shift.punchedIn) d.shift = Object.assign(d.shift, { assignedVehicle: plan.vehicleLabel || plan.vehicle || d.shift.assignedVehicle, lastRecordedKm: plan.vehicleKm != null ? plan.vehicleKm : d.shift.lastRecordedKm });
      }
      shops.forEach(function (s, i) { s.distance = 'Stop ' + (i + 1) + ' of ' + shops.length; });
      d.shops = shops;
      d.appliedPlan = tag;
      crewMerge(d);
      saveStore(d);
      return true;
    },

    // True when this employee has a plan for today (so there is something to punch in for).
    // Real accounts: the office must have assigned a plan today. Demo data (no plans ever applied) keeps its sample shops.
    hasPlanToday: function () {
      var d = loadStore(), t = new Date();
      var key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      if (typeof d.appliedPlan === 'string') return d.appliedPlan.indexOf(key + ':') === 0 && d.appliedPlan !== key + ':none';
      return (d.shops || []).length > 0;
    },

    // Unread messages from the admin about today's plan (see applyTodayPlan)
    getNotices: function () { return (loadStore().notices || []).filter(function (n) { return !n.read; }); },
    markNoticesRead: function () {
      var d = loadStore(); (d.notices || []).forEach(function (n) { n.read = true; }); saveStore(d);
    },

    getShift: function () {
      return loadStore().shift;
    },

    shopPin: function (s) {
      if (!s) return null;
      if (typeof s.lat === 'number' && typeof s.lng === 'number') return { lat: s.lat, lng: s.lng };
      var adm = {}, c = null;
      try { adm = JSON.parse(localStorage.getItem('gm_admin_v1')) || {}; } catch (e) {}
      (adm.customers || []).forEach(function (x) {
        if (c || typeof x.lat !== 'number' || typeof x.lng !== 'number') return;
        if ((s.code && x.code === s.code) || (s.name && x.name && x.name.toLowerCase() === String(s.name).toLowerCase())) c = x;
      });
      if (c) return { lat: c.lat, lng: c.lng };
      var pk = s.code || (s.name ? 'N:' + String(s.name).toUpperCase() : ''), P = pinStore();
      return pk && P[pk] && typeof P[pk].lat === 'number' ? { lat: P[pk].lat, lng: P[pk].lng } : null;
    },

    // Worker saves a shop's location, only when the shop has no pin yet. Admin merges these into Customers.
    // extra = { phone, address } typed or suggested at the shop; the admin only fills blanks, nothing is overwritten.
    savePin: function (s, lat, lng, acc, extra) {
      if (!s || GM.shopPin(s)) return false;
      var pk = pinKey(s); if (!pk) return false;
      var P = pinParse(pinOwnKey()); if (pinStore()[pk] && typeof pinStore()[pk].lat === 'number') return false;
      var e = P[pk] || {}; e.lat = Math.round(lat * 1e6) / 1e6; e.lng = Math.round(lng * 1e6) / 1e6; e.acc = Math.round(acc || 0); e.by = (loadStore().worker || {}).name || ''; e.at = new Date().toISOString();
      pinExtra(e, extra); P[pk] = e;
      try { localStorage.setItem(pinOwnKey(), JSON.stringify(P)); } catch (x) { return false; }
      markPinDone(s.code); return true;
    },

    // Worker adds phone / address for a shop that already has its location.
    saveShopInfo: function (s, extra) {
      var pk = pinKey(s); if (!s || !pk) return false;
      var P = pinParse(pinOwnKey()), e = P[pk] || {}; pinExtra(e, extra);
      if (!e.phone && !e.address) return false;
      e.by = (loadStore().worker || {}).name || ''; e.at = e.at || new Date().toISOString(); P[pk] = e;
      try { localStorage.setItem(pinOwnKey(), JSON.stringify(P)); } catch (x) { return false; }
      markPinDone(s.code); return true;
    },

    // Shops the office sent to this employee to fill in (location, phone, address). Sent from Admin > Customers > Shop locations.
    pinTasks: function () {
      var d = loadStore(), w = d.worker || {}, done = d.pinDone || {}, T = {}, adm = {}, P = pinStore();
      try { T = (JSON.parse(localStorage.getItem('gm_pintasks_v1')) || {}).tasks || {}; } catch (e) {}
      try { adm = JSON.parse(localStorage.getItem('gm_admin_v1')) || {}; } catch (e) {}
      var byCode = {}, pinnedCode = {}, pinnedName = {};
      (adm.customers || []).forEach(function (c) {
        if (!c) return;
        if (c.code) byCode[c.code] = c;
        if (typeof c.lat === 'number' && typeof c.lng === 'number') { if (c.code) pinnedCode[c.code] = 1; if (c.name) pinnedName[String(c.name).toLowerCase()] = 1; }
      });
      // Same answer as GM.shopPin, but without reading the whole customer list again for every shop (that made long lists very slow).
      function hasPinFast(code, name) {
        if (pinnedCode[code] || (name && pinnedName[String(name).toLowerCase()])) return true;
        var pk = code || (name ? 'N:' + String(name).toUpperCase() : '');
        return !!(pk && P[pk] && typeof P[pk].lat === 'number');
      }
      var out = [];
      Object.keys(T).forEach(function (k) {
        var t = T[k]; if (!t || !t.code) return;
        var to = t.to == null || t.to === '' ? ['all'] : [].concat(t.to); if (to.indexOf('all') < 0 && to.indexOf(w.id) < 0) return;
        var c = byCode[t.code] || {}, p = P[t.code] || P['N:' + String(t.name || '').toUpperCase()] || {};
        var s = { code: t.code, name: c.name || t.name || t.code, area: c.area || t.area || '', address: c.address || p.address || t.address || '', phone: c.phone || p.phone || t.phone || '' };
        var hasPin = hasPinFast(t.code, s.name);
        var needs = (t.need || ['pin']).filter(function (n) { return n === 'pin' ? !hasPin : (n === 'phone' ? !s.phone : !s.address); });
        var anyone = p && p.at && (Date.parse(p.at) || 0) >= (t.ts || 0);   // some employee saved this shop after it was sent
        s.hasPin = hasPin; s.needs = needs; s.done = !needs.length || (done[t.code] || 0) >= (t.ts || 0) || (hasPin && (t.need || ['pin']).indexOf('pin') > -1) || !!anyone;
        out.push(s);
      });
      out.sort(function (a, b) { return String(a.area || '~').localeCompare(String(b.area || '~')) || String(a.name).localeCompare(String(b.name)); });
      return out;
    },

    mapsUrl: function (s) {
      var p = GM.shopPin(s);
      if (p) return 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '&travelmode=driving';
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(((s && s.name) || '') + ' ' + ((s && s.address) || ''));
    },

    updateShift: function (updates) {
      var d = loadStore();
      d.shift = Object.assign(d.shift, updates);
      saveStore(d);
      return d.shift;
    },

    getShops: function () {
      return loadStore().shops;
    },

    getShop: function (id) {
      var shops = loadStore().shops;
      for (var i = 0; i < shops.length; i++) {
        if (shops[i].id === id) return shops[i];
      }
      return null;
    },

    updateShop: function (id, updates) {
      var d = loadStore();
      for (var i = 0; i < d.shops.length; i++) {
        if (d.shops[i].id === id) {
          d.shops[i] = Object.assign(d.shops[i], updates);
          if (updates && updates.status) { d.shops[i].sAt = Date.now(); d.shops[i].doneBy = (d.worker || {}).name || ''; }
          break;
        }
      }
      saveStore(d);
    },

    getNextShop: function () {
      var shops = loadStore().shops;
      for (var i = 0; i < shops.length; i++) {
        if (shops[i].status === 'pending' && shops[i].priority) return shops[i];
      }
      for (var j = 0; j < shops.length; j++) {
        if (shops[j].status === 'pending') return shops[j];
      }
      for (var k = 0; k < shops.length; k++) {
        if (shops[k].status === 'retry') return shops[k];
      }
      return null;
    },

    // The product list is uploaded by the admin (Products page). No built-in demo products.
    getProducts: function () {
      var L = []; try { L = JSON.parse(localStorage.getItem('gm_admin_products_v1')) || []; } catch (e) {}
      return (Array.isArray(L) ? L : []).filter(function (p) { return p.active !== false; }).map(function (p) { return { code: String(p.code || ''), name: String(p.name || ''), unitPrice: Number(p.price) || 0, tax: Number(p.tax) || 0 }; });
    },

    qtyLabel: function (sh) { return sh && sh.items && sh.items.length ? sh.items.length + (sh.items.length === 1 ? ' item' : ' items') : ((sh && sh.boxes) || 0) + ' Boxes'; },
    searchProducts: function (query) {
      var all = GM.getProducts(), q = String(query || '').toLowerCase().trim();
      if (!q) return all.slice(0, 20);
      return all.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1 || p.code.toLowerCase().indexOf(q) !== -1; }).slice(0, 40);
    },

    getReturns: function () {
      return loadStore().returns;
    },

    addReturn: function (returnItem) {
      var d = loadStore();
      d.returns.push(Object.assign({ id: Date.now() }, returnItem));
      saveStore(d);
    },

    getMonthlyAttendance: function (yearMonthKey) {
      var store = loadStore();
      var key = yearMonthKey || '2026-10';
      if (store.attendanceMonthly[key]) {
        return store.attendanceMonthly[key];
      }
      return [];
    },

    getDayDetail: function (dayNum, yearMonthKey) {
      var store = loadStore();
      var key = yearMonthKey || '2026-10';
      var month = store.attendanceMonthly[key] || store.attendanceMonthly['2026-10'];
      var day = month.find(function(d){ return d.day === dayNum; }) || month[0];

      if (!day || day.status === 'upcoming') {
        return {
          day: day || { day: dayNum, weekday: '--', status: 'upcoming' },
          vehicle: 'None',
          startKm: 0,
          endKm: 0,
          shops: [],
          notes: 'Future shift. Not started yet.'
        };
      }

      if (day.status === 'absent') {
        return {
          day: day,
          vehicle: 'None',
          startKm: 0,
          endKm: 0,
          shops: [],
          notes: 'Marked on approved casual leave by Fleet Admin. No vehicle assigned.'
        };
      }
      if (day.status === 'off') {
        return {
          day: day,
          vehicle: 'None',
          startKm: 0,
          endKm: 0,
          shops: [],
          notes: 'Weekly Sunday off.'
        };
      }

      return {
        day: day,
        vehicle: day.vehicle || '--',
        startKm: day.startKm || 0,
        endKm: day.endKm || 0,
        shops: day.shops || [],
        returns: day.returns || [],
        notes: ''
      };
    },

    getMonthlyAdvances: function (yearMonthKey) {
      var store = loadStore();
      var key = yearMonthKey || '2026-10';
      var base = (store.monthlyLedger[key] || []).slice(), extra = [];
      var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      // Advances and deductions entered by the admin (admin > Advances)
      try {
        extra = (JSON.parse(localStorage.getItem('gm_admin_ledger_v1')) || []).filter(function (e) {
          return e.workerId === store.worker.id && e.date.slice(0, 7) === key;
        }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (e) {
          return { id: e.id, date: e.date.slice(8, 10) + ' ' + mon[+e.date.slice(5, 7) - 1] + ' ' + e.date.slice(0, 4), title: e.title, type: e.type, amount: e.amount, note: e.note || 'Added by Fleet Admin' };
        });
      } catch (e) {}
      return extra.concat(base);
    },

    // The depot set by the admin (Profile page, key gm_depot_v1, synced to every device) wins over the built-in sample location.
    getWarehouse: function () {
      var base = { name: 'Depot', address: '', lat: null, lng: null, radiusMeters: 200 };   // no built-in sample depot: location is checked only after the office saves the depot
      try {
        var dp = JSON.parse(localStorage.getItem('gm_depot_v1'));
        if (dp && isFinite(dp.lat) && isFinite(dp.lng)) return Object.assign({}, base, { name: dp.name || base.name, address: dp.address || base.address, lat: dp.lat, lng: dp.lng, radiusMeters: dp.radiusMeters || base.radiusMeters || 200 });
      } catch (e) {}
      return base;
    },

    resetData: function () {
      saveStore(DEFAULT_DATA);
      return DEFAULT_DATA;
    }
  };
  /* ---- Admin notifications: every important worker action is logged for the admin ---- */
  var NK = 'gm_admin_notifs_v1';
  function dkey() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  function notify(type, title, text) {
    try {
      var l = JSON.parse(localStorage.getItem(NK)); if (!Array.isArray(l)) l = [];
      var nn = { id: 'N' + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), date: dkey(), type: type, title: title, text: text, worker: loadStore().worker.name, read: false };
      try { var fx = GM.fix && GM.fix(); if (fx && /^(delivered|problem|cancelled|punchin|punchout|route)$/.test(type)) nn.loc = { lat: Math.round(fx.lat * 1e6) / 1e6, lng: Math.round(fx.lng * 1e6) / 1e6, acc: fx.acc || 0 }; } catch (e) {}
      l.unshift(nn);
      localStorage.setItem(NK, JSON.stringify(l.slice(0, 300)));
    } catch (e) {}
  }
  var _sp = GM.savePin, _si = GM.saveShopInfo;
  GM.savePin = function (s, lat, lng, acc, extra) {
    var ok = _sp.apply(GM, arguments);
    if (ok) { try { notify('pin', 'Shop location saved: ' + s.name, GM.getWorker().name + ' saved the location of ' + s.name + (extra && extra.phone ? ', with a phone number' : '') + (extra && extra.address ? ', with an address' : '') + '. It is added to Customers when you open that page.'); } catch (e) {} }
    return ok;
  };
  GM.saveShopInfo = function (s, extra) {
    var ok = _si.apply(GM, arguments);
    if (ok) { try { notify('pin', 'Shop details saved: ' + s.name, GM.getWorker().name + ' added ' + [extra && extra.phone ? 'phone number' : '', extra && extra.address ? 'address' : ''].filter(Boolean).join(' and ') + ' for ' + s.name + '.'); } catch (e) {} }
    return ok;
  };
  /* ---- Badge on the Home tab: shop details the office asked for (left / completed). Shown on every employee page. ---- */
  (function () {
    function paint() {
      var a = document.querySelector('.nav > div a[href="home.html"]'); if (!a) return;
      var L = [], old = a.querySelector('.gm-pinbadge');
      try { L = GM.pinTasks(); } catch (e) {}
      var left = L.filter(function (s) { return !s.done; }).length, done = L.length - left;
      if (!left) { if (old) old.remove(); return; }
      if (!document.getElementById('gmPinBadgeCss')) {
        var st = document.createElement('style'); st.id = 'gmPinBadgeCss';
        st.textContent = '.nav a{position:relative}.gm-pinbadge{position:absolute;top:2px;left:50%;margin-left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#d92d20;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;box-sizing:border-box}';
        document.head.appendChild(st);
      }
      if (!old) { old = document.createElement('span'); old.className = 'gm-pinbadge'; a.appendChild(old); }
      old.textContent = left > 99 ? '99+' : left; old.title = left + ' shops left, ' + done + ' completed'; old.setAttribute('aria-label', left + ' shops left, ' + done + ' completed');
    }
    function go() { paint(); window.addEventListener('gm-sync', paint); window.addEventListener('storage', paint); window.addEventListener('focus', paint); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    GM.paintPinBadge = paint;
  })();

  var _us = GM.updateShop, _ar = GM.addReturn, _ush = GM.updateShift;
  GM.updateShop = function (id, updates) {
    var before = GM.getShop(id), old = before && before.status;
    _us.call(GM, id, updates);
    try {
      var sh = GM.getShop(id), st = updates && updates.status;
      if (!sh || !st || st === old) return;
      var all = GM.getShops(), done = all.filter(function (x) { return x.status === 'delivered'; }).length, nm = GM.getWorker().name;
      if (st === 'delivered') notify('delivered', 'Delivered: ' + sh.name, nm + ' delivered ' + GM.qtyLabel(sh) + ', bill ' + sh.billNo + '. ' + done + ' of ' + all.length + ' shops done.');
      else if (st === 'retry') notify('problem', 'Problem at ' + sh.name, nm + ' could not deliver (bill ' + sh.billNo + '). Reason: ' + (sh.problemReason || 'not given') + '. Moved to the end of the route.');
      else if (st === 'cancelled') notify('cancelled', 'Cancelled: ' + sh.name, nm + ' cancelled bill ' + sh.billNo + '. Reason: ' + (sh.problemReason || 'not given') + '. ' + sh.boxes + ' box(es) to bring back.');
      if (!all.some(function (x) { return x.status === 'pending' || x.status === 'retry'; })) notify('route', 'Route complete', nm + ' finished all stops: ' + done + ' delivered, ' + all.filter(function (x) { return x.status === 'cancelled'; }).length + ' cancelled.');
    } catch (e) {}
  };
  GM.addReturn = function (r) {
    _ar.call(GM, r);
    try { notify('return', 'Return: ' + r.shopName, GM.getWorker().name + ' brought back ' + r.quantity + ' x ' + r.productName + '. Deduction \u20b9' + (Number(r.deductionAmount) || 0) + '. ' + (r.notOnBill ? 'Not on the bill. ' : '') + (r.reason || '')); } catch (e) {}
  };
  GM.updateShift = function (u) {
    var old = GM.getShift(), res = _ush.call(GM, u), nm = GM.getWorker().name;
    try {
      if (u.punchedIn && !old.punchedIn) notify('punchin', nm + ' punched in', 'At ' + (u.punchInTime || '') + (u.startKm != null ? ', start km ' + u.startKm : '') + ', vehicle ' + (res.assignedVehicle || '-') + '.');
      if (u.punchedOut && !old.punchedOut) notify('punchout', nm + ' punched out', 'At ' + (u.punchOutTime || '') + (u.endKm != null && !isNaN(u.endKm) ? ', end km ' + u.endKm + ', driven ' + (u.drivenKm || 0) + ' km' : '') + '. Day closed.');
    } catch (e) {}
    return res;
  };
})();

/* GM-ATTENDANCE START */
(function () {
  // Real attendance: every punch-in / punch-out is written into this worker's own record (attendanceLog).
  var LATE_AFTER = '08:30';   // a punch-in after this time (24-hour HH:MM) counts as Late. Change here if needed.
  var KEY = 'gm_crm_data_v5', WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function mins(s) { var m = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(s || '')); if (!m) return null; var h = +m[1]; if (m[3]) { h = h % 12; if (/p/i.test(m[3])) h += 12; } return h * 60 + (+m[2]); }
  function hm(n) { return Math.floor(n / 60) + 'h ' + String(n % 60).padStart(2, '0') + 'm'; }
  function rec(kind, sh) {
    var raw = localStorage.getItem(KEY); if (!raw) return;
    var d = JSON.parse(raw), t = new Date();
    var mk = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'), dk = String(t.getDate());
    d.attendanceLog = d.attendanceLog || {}; d.attendanceLog[mk] = d.attendanceLog[mk] || {};
    var r = d.attendanceLog[mk][dk];
    if (!r) {
      var im = mins(sh.punchInTime), lim = mins(GM.settings().lateAfter);
      r = d.attendanceLog[mk][dk] = { day: t.getDate(), weekday: WD[t.getDay()], status: (im != null && im > lim) ? 'late' : 'present', inTime: sh.punchInTime || '-', outTime: '-', hours: '-', km: 0, vehicle: sh.assignedVehicle || '', startKm: sh.startKm == null ? null : sh.startKm, endKm: null };
    }
    if (kind === 'out') {
      r.outTime = sh.punchOutTime || '-';
      var a = mins(r.inTime), b = mins(r.outTime);
      r.hours = (a != null && b != null && b >= a) ? hm(b - a) : '-';
      r.km = Number(sh.drivenKm) || 0; r.endKm = sh.endKm == null ? null : sh.endKm;
      r.shops = (d.shops || []).filter(function (s) { return s && s.status && s.status !== 'pending'; }).map(function (s) { return { name: s.name, address: String(s.address || '').split(',')[0], boxes: s.boxes, billNo: s.billNo, time: s.sAt ? new Date(s.sAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '', status: s.status === 'delivered' ? 'delivered' : 'retry' }; });
      r.returns = (d.returns || []).map(function (x) { return { item: x.productName, qty: x.quantity, amount: x.deductionAmount, reason: x.reason }; });
    }
    localStorage.setItem(KEY, JSON.stringify(d));
  }
  var prev = GM.updateShift;
  GM.updateShift = function (u) {
    var res = prev.call(GM, u);
    try { if (u && u.punchedIn === true && u.punchInTime) rec('in', res); if (u && u.punchedOut === true && u.punchOutTime) rec('out', res); } catch (e) {}
    return res;
  };
    /* ---- Work rules the office can change (admin > My profile > Work rules). Saved as gm_admin_settings_v1 and synced to every phone. ---- */
  var SET_DEFAULT = { lateAfter: '08:30', highKm: 250, jumpKm: 300, requireDepot: false,
    returnReasons: ['Broken', 'Expired', 'Expiry date is near', 'Leaking / seal open', 'Wrong item sent', 'Shop did not order', 'Bad quality', 'Shop did not want'] };
  GM.settingsDefault = SET_DEFAULT;
  GM.settings = function () {
    var s = {}; try { s = JSON.parse(localStorage.getItem('gm_admin_settings_v1')) || {}; } catch (e) {}
    var out = { lateAfter: /^\d{1,2}:\d{2}$/.test(s.lateAfter || '') ? s.lateAfter : SET_DEFAULT.lateAfter,
      highKm: Number(s.highKm) > 0 ? Number(s.highKm) : SET_DEFAULT.highKm, jumpKm: Number(s.jumpKm) > 0 ? Number(s.jumpKm) : SET_DEFAULT.jumpKm,
      requireDepot: s.requireDepot === true,
      returnReasons: (Array.isArray(s.returnReasons) ? s.returnReasons : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean).slice(0, 20) };
    if (!out.returnReasons.length) out.returnReasons = SET_DEFAULT.returnReasons.slice();
    return out;
  };
  try { Object.defineProperty(GM, 'LATE_AFTER', { get: function () { return GM.settings().lateAfter; }, configurable: true }); } catch (e) { GM.LATE_AFTER = LATE_AFTER; }

  /* ---- Driver's own Attendance and Account: real data only (no sample history) ---- */
  function p2(n) { return String(n).padStart(2, '0'); }
  function jl(k, d) { try { var r = JSON.parse(localStorage.getItem(k)); return r == null ? d : r; } catch (e) { return d; } }
  function ymd(t) { return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()); }
  function hrsText(a, b) { var x = mins(a), y = mins(b); return (x != null && y != null && y >= x) ? hm(y - x) : '-'; }
  function shopRow(s) { return { name: s.name, address: String(s.address || '').split(',')[0], boxes: s.boxes, billNo: s.billNo, time: s.sAt ? new Date(s.sAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '', status: s.status === 'delivered' ? 'delivered' : 'retry' }; }
  function retRow(x) { return { item: x.productName, qty: x.quantity, amount: x.deductionAmount, reason: x.reason }; }
  // One day of this employee: their own punch record, the office's correction on top, leave and Sundays.
  function ownDay(ds) {
    var st = GM.getData() || {}, w = st.worker || {}, td = ymd(new Date());
    var log = ((st.attendanceLog || {})[ds.slice(0, 7)] || {})[+ds.slice(8)];
    var ed = (((jl('gm_admin_attedit_v1', {}) || {}).edits || {})[w.id] || {})[ds];
    var wd = jl('gm_admin_workers_v1', {}) || {};
    var me = (wd.workers || []).filter(function (x) { return x && x.id === w.id; })[0] || {};
    var d = new Date(ds + 'T00:00:00');
    var o = { day: d.getDate(), weekday: WD[d.getDay()], status: null, inTime: '-', outTime: '-', hours: '-', km: 0, vehicle: '', startKm: null, endKm: null, shops: [], returns: [], note: '' };
    if (log) { o.status = log.status; o.inTime = log.inTime || '-'; o.outTime = log.outTime || '-'; o.hours = log.hours || hrsText(o.inTime, o.outTime); o.km = Number(log.km) || 0; o.vehicle = log.vehicle || ''; o.startKm = log.startKm; o.endKm = log.endKm; o.shops = log.shops || []; o.returns = log.returns || []; }
    if (ed && ed.status) {
      o.status = ed.status === 'leave' ? 'absent' : ed.status; o.inTime = ed.inTime || '-'; o.outTime = ed.outTime || '-'; o.hours = hrsText(o.inTime, o.outTime); o.km = Number(ed.km) || 0; o.vehicle = ed.vehicle || o.vehicle;
      if (ed.status === 'leave') o.note = 'On approved leave.'; else if (ed.status === 'absent') o.note = 'Marked absent by the office.';
      if (ed.remarks) o.note = (o.note ? o.note + ' ' : '') + ed.remarks;
    }
    if (!o.status) {
      var start = me.created || '';
      if (ds > td || (start && ds < start)) o.status = 'upcoming';
      else if (d.getDay() === 0) { o.status = 'off'; o.note = 'Sunday holiday.'; }
      else if ((wd.leaves || []).some(function (l) { return l && l.workerId === w.id && l.from <= ds && ds <= l.to; })) { o.status = 'absent'; o.note = 'On approved leave.'; }
      else if (ds === td && new Date().getHours() < 12) o.status = 'upcoming';
      else { o.status = 'absent'; o.note = 'No punch-in was recorded.'; }
    }
    if (ds === td && !o.shops.length) {   // today: show what is on the live route
      o.shops = (st.shops || []).filter(function (s) { return s.status && s.status !== 'pending'; }).map(shopRow);
      o.returns = (st.returns || []).map(retRow);
    }
    return o;
  }
  GM.getMonthlyAttendance = function (key) {
    var m = /^(\d{4})-(\d{2})$/.exec(key || ''); if (!m) return [];
    var n = new Date(+m[1], +m[2], 0).getDate(), out = [];
    for (var i = 1; i <= n; i++) out.push(ownDay(m[1] + '-' + m[2] + '-' + p2(i)));
    return out;
  };
  GM.getDayDetail = function (dayNum, key) {
    var o = ownDay(key + '-' + p2(dayNum));
    return { day: o, vehicle: o.vehicle || '--', startKm: o.startKm || 0, endKm: o.endKm || 0, shops: o.shops, returns: o.returns, notes: o.note };
  };
  GM.getMonthlyAdvances = function (key) {
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], me = ((GM.getData() || {}).worker || {}).id;
    return (jl('gm_admin_ledger_v1', []) || []).filter(function (e) { return e && e.workerId === me && String(e.date).slice(0, 7) === key; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (e) { return { id: e.id, date: e.date.slice(8, 10) + ' ' + mon[+e.date.slice(5, 7) - 1] + ' ' + e.date.slice(0, 4), title: e.title, type: e.type, amount: e.amount, note: e.note || 'Added by the office' }; });
  };
})();
/* GM-ATTENDANCE END */
/* GM-CREW START: shared delivery marks for a driver + helpers, and the location the office sees.
   Location is only read when the employee taps something (arrived, delivered, problem, punch in/out) or when the office presses "Locate now" while the app is open.
   Nothing runs in the background. */
(function () {
  if (!window.GM) return;
  function pad(n) { return String(n).padStart(2, '0'); }
  function day8() { var t = new Date(); return t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()); }
  function me() { return GM.getData().worker || {}; }
  function getJ(k) { try { var v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---- sharing marks with the rest of the crew ---- */
  function publish(fn) {
    try {
      var d = GM.getData(); if (!d.crewSize || d.crewSize < 2 || !me().id) return;
      var k = 'gm_crew_' + day8() + '_' + me().id, c = getJ(k) || {}; c.marks = c.marks || {}; c.returns = c.returns || [];
      fn(c, d); c.by = me().name || ''; putJ(k, c);
    } catch (e) {}
  }
  var _us = GM.updateShop, _ar = GM.addReturn;
  GM.updateShop = function (id, updates) {
    var r = _us.apply(GM, arguments);
    if (updates && updates.status) publish(function (c) { var sh = GM.getShop(id); if (!sh) return; c.marks[sh.billNo || sh.id] = { f: Object.assign({}, updates, { doneBy: me().name || '' }), t: sh.sAt || Date.now(), by: me().name || '' }; });
    if (updates && updates.status) { try { GM.captureLoc(updates.status === 'delivered' ? 'delivered' : updates.status === 'retry' ? 'problem' : 'cancelled', (GM.getShop(id) || {}).name || ''); } catch (e) {} }
    return r;
  };
  GM.addReturn = function (r) {
    var out = _ar.apply(GM, arguments);
    publish(function (c) { var list = GM.getReturns().filter(function (x) { return !x.shared; }); c.returns = list.slice(-40); });
    return out;
  };

  /* ---- location ---- */
  function fresh(f, ms) { return f && typeof f.lat === 'number' && Date.now() - f.t < ms; }
  GM.fix = function (ms) { try { var f = JSON.parse(sessionStorage.getItem('gm_lastfix')); return fresh(f, ms || 180000) ? f : null; } catch (e) { return null; } };
  function saveFix(f) { try { sessionStorage.setItem('gm_lastfix', JSON.stringify(f)); } catch (e) {} }
  GM.refreshFix = function (cb) {
    if (!navigator.geolocation) { cb && cb(null); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      var f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), t: Date.now() }; saveFix(f); cb && cb(f);
    }, function () { cb && cb(null); }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 });
  };
  var bat = null; try { if (navigator.getBattery) navigator.getBattery().then(function (b) { bat = Math.round(b.level * 100); }); } catch (e) {}
  function dist(a, b) { var R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function writeLoc(f, ev, label) {
    try {
      var w = me(); if (!w.id) return;
      var k = 'gm_loc_' + w.id, o = getJ(k) || {}, sh = GM.getShift() || {}, d = GM.getData();
      var pts = Array.isArray(o.pts) && o.day === day8() ? o.pts : [];
      var lp = pts[pts.length - 1]; if (!lp || dist([lp[0], lp[1]], [f.lat, f.lng]) > 25 || f.t - lp[2] > 120000) pts.push([Math.round(f.lat * 1e5) / 1e5, Math.round(f.lng * 1e5) / 1e5, f.t, ev]);
      if (pts.length > 80) pts = pts.slice(-80);
      putJ(k, { id: w.id, name: w.name || '', role: d.crewRole || 'driver', lat: Math.round(f.lat * 1e6) / 1e6, lng: Math.round(f.lng * 1e6) / 1e6, acc: f.acc || 0, t: f.t, ev: ev, label: label || '', veh: sh.assignedVehicle || '', bat: bat, day: day8(), pts: pts });
    } catch (e) {}
  }
  // Called when the employee taps something. Uses the freshest fix the page already has, and asks the phone for a new one for the next tap.
  GM.captureLoc = function (ev, label) {
    var f = GM.fix(); if (f) writeLoc(f, ev, label);
    GM.refreshFix(function (n) { if (n) writeLoc(n, ev, label); });
  };
  var _ush = GM.updateShift;
  GM.updateShift = function (u) {
    var r = _ush.apply(GM, arguments);
    try { if (u && u.punchedIn === true) GM.captureLoc('punchin', ''); if (u && u.punchedOut === true) GM.captureLoc('punchout', ''); } catch (e) {}
    return r;
  };

  // "Locate now" from the office: works only while this app is open on a shift.
  function answerRequest() {
    try {
      var w = me(), q = getJ('gm_locreq_' + w.id), sh = GM.getShift() || {};
      if (!q || typeof q.ts !== 'number' || Date.now() - q.ts > 10 * 60000) return;
      var done = 0; try { done = Number(localStorage.getItem('gt_locreq_done')) || 0; } catch (e) {}
      if (q.ts <= done || !sh.punchedIn || sh.punchedOut) return;
      try { localStorage.setItem('gt_locreq_done', String(q.ts)); } catch (e) {}
      GM.refreshFix(function (f) { if (f) writeLoc(f, 'requested', ''); });
    } catch (e) {}
  }
  // Having a recent fix ready means the next tap can put a location on the office notification. The fix stays on this phone until then.
  function warm() { try { var sh = GM.getShift() || {}; if (sh.punchedIn && !sh.punchedOut && !GM.fix(60000)) GM.refreshFix(); } catch (e) {} }
  window.addEventListener('gm-sync', answerRequest);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', warm); else warm();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', answerRequest); else setTimeout(answerRequest, 1500);
})();
/* GM-CREW END */