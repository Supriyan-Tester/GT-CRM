"use strict";

const crypto = require("crypto");
const { validateOpeningInvoice, validateCollection, buildStatement, buildCollectionReport, buildOutstandingReport, buildHandoverReport, validateSplitCollection } = require("./accounts.domain");

function createAccountsRoutes(config) {
  const URL = String(config.url || "").replace(/\/+$/, "");
  const KEY = config.key || "";
  const fetchImpl = config.fetch || fetch;
  const db = config.db;
  const send = config.send;
  const body = config.body;
  const customerLookup = config.customerLookup;
  const canAccessCustomer = config.canAccessCustomer || (() => true);
  const canBill = config.canBill;
  const canCollect = config.canCollect;
  const planInvoiceOwner = config.planInvoiceOwner || (() => null);
  const planStopFor = config.planStopFor || (() => null);
  const notifyAdmin = config.notifyAdmin || (() => {});
  const inr = (n) => "\u20b9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  // Tells the office a payment was recorded (it then waits for approval).
  function notifyCollection(session, customer, total, methodLabel) {
    try {
      const who = String(session.name || config.employeeName(session.id) || "Employee");
      const shop = String(customer.name || customer.shopName || "Customer");
      notifyAdmin("collection", "Payment collected: " + inr(total) + " (" + methodLabel + ") - " + shop, who + " collected " + inr(total) + " by " + methodLabel + " from " + shop + ". It is waiting for approval.", who);
    } catch (e) {}
  }
  const employeeExists = config.employeeExists || (() => false);
  const files = config.files;
  const MAX_EVIDENCE = 5 * 1024 * 1024;
  function parseImage(input) {
    const match = input && typeof input.data === "string" &&
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.data);
    if (!match) throw new Error("Upload a JPG, PNG or WEBP invoice photo.");
    if (match[2].length > Math.ceil((MAX_EVIDENCE + 2) / 3) * 4 + 8) throw new Error("Invoice photo exceeds 5 MB.");
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > MAX_EVIDENCE) throw new Error("Invoice photo exceeds 5 MB.");
    const mime = match[1];
    const valid = mime === "image/jpeg"
      ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : mime === "image/png"
        ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : buffer.length >= 12 && buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WEBP";
    if (!valid) throw new Error("The uploaded file does not match its image format.");
    return { buffer, mime, ext: mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp" };
  }
  function sendEvidence(res, bytes, ext) {
    const mime = ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": bytes.length, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.end(bytes);
  }

  async function rest(path) {
    const response = await fetchImpl(URL + "/rest/v1/" + path, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY },
    });
    if (!response.ok) throw new Error("Accounts database read failed (" + response.status + ").");
    return response.json();
  }
  // Reads every row of a query. The database returns at most 1000 rows per request, so a balance added up from a single
  // request would be wrong once there are more than 1000 entries. The query must include an "order=" so the pages line up.
  async function restAll(path) {
    const rows = [];
    for (let offset = 0; offset < 500000; offset += 1000) {
      const page = await rest(path + "&limit=1000&offset=" + offset);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows;
  }
  // One page of rows plus the total number of matching rows (for "Showing 1 to 25 of 137").
  async function restPage(path, offset, limit) {
    const response = await fetchImpl(URL + "/rest/v1/" + path + "&limit=" + limit + "&offset=" + offset, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, Prefer: "count=exact" },
    });
    if (!response.ok) throw new Error("Accounts database read failed (" + response.status + ").");
    const rows = await response.json();
    const range = response.headers && response.headers.get ? String(response.headers.get("content-range") || "") : "";
    const total = /\/(\d+)$/.test(range) ? Number(/\/(\d+)$/.exec(range)[1]) : offset + rows.length;
    return { rows, total };
  }
  async function rpc(name, args) {
    const response = await fetchImpl(URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      const error = new Error(message.slice(0, 500) || "Accounts operation failed.");
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  function fail(res, error) {
    const detail = String(error && error.message || "");
    console.error("Accounts operation failed:", error && error.status ? "[" + error.status + "] " : "", detail.slice(0, 400));
    const status = error && error.status === 409 || /outstanding|allocation exceeds|not pending|already inspected/i.test(detail) ? 409 : 400;
    // Our own validation messages (not database errors) are safe and useful to show, so the person knows what to fix.
    const known = !(error && error.status) && /^(A |An |Allocate|Choose|Collection|Each|Enter|Every|Upload|Customer|Active|The payment|Outstanding|Original)/.test(detail);
    return send(res, status, { error: known ? detail : status === 409 ? "The financial record changed. Refresh and try again." : "Unable to complete the Accounts operation. Check the submitted details. [" + detail.slice(0, 200) + "]" });
  }
  function handle(req, res, url, session) {
    const p = url.pathname;
    const invoiceMatch = /^\/api\/accounts\/customers\/([^/]+)\/invoices$/.exec(p);
    if (!p.startsWith("/api/accounts/")) return false;
    if (!session) { send(res, 401, { error: "Please sign in." }); return true; }
    if (!URL || !KEY) { send(res, 503, { error: "Accounts database is not configured. Configure Supabase and apply the reviewed Accounts migration in staging." }); return true; }

    if (req.method === "POST" && p === "/api/accounts/evidence") {
      if (!files || (!canBill(session) && !canCollect(session))) { send(res, 403, { error: "Accounts evidence upload permission required." }); return true; }
      body(req, (err, input) => {
        if (err) return send(res, 400, { error: "Invalid evidence upload." });
        try {
          const parsed = parseImage(input);
          const token = crypto.randomUUID();
          const evidencePath = "accounts/evidence/" + token + "." + parsed.ext;
          files.put(evidencePath, parsed.buffer, parsed.mime)
            .then(() => send(res, 201, { ok: true, evidencePath, evidenceUrl: "/api/accounts/evidence/" + token }))
            .catch((e) => { console.error("Accounts evidence save:", e.message); send(res, 500, { error: "Unable to save invoice evidence." }); });
        } catch (e) { send(res, 400, { error: e.message }); }
      }, 8 * 1024 * 1024);
      return true;
    }

    // A bill on today's Daily plan that is not in Accounts yet: the first cash collection creates it (amount comes from the plan).
    if (req.method === "POST" && p === "/api/accounts/delivery-invoice") {
      if (!files || !canCollect(session)) { send(res, 403, { error: "Collection permission required." }); return true; }
      body(req, (err, input) => {
        if (err || !input || typeof input !== "object") return send(res, 400, { error: "Invalid request." });
        try {
          const customerCode = String(input.customerCode || "").trim();
          const invoiceNo = String(input.invoiceNo || "").trim();
          const customer = customerCode ? customerLookup(customerCode) : null;
          if (!customer || !invoiceNo || !canAccessCustomer(session, customerCode)) return send(res, 404, { error: "Customer not found." });
          const stop = planStopFor(session, customerCode, invoiceNo);
          if (!stop) return send(res, 403, { error: "This invoice is not on your plan for today." });
          const amount = Math.round(Number(stop.amount)); // whole rupees: the bill is rounded off to the nearest rupee
          if (!(amount > 0)) return send(res, 400, { error: "This bill has no amount on the plan." });
          const evidencePath = String(input.evidencePath || "").trim();
          if (!/^accounts\/evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(evidencePath) || !files.has(evidencePath))
            return send(res, 400, { error: "Upload the bill photo first." });
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
          rest("gm_accounts_invoices?select=id,customer_code,customer_name_snapshot&invoice_no=eq." + encodeURIComponent(invoiceNo) + "&limit=10").then((rows) => {
            const same = rows.find((x) => x.customer_code === customerCode);
            if (same) return same.id;
            if (rows.length) {
              send(res, 409, { error: "Invoice " + invoiceNo + " already belongs to " + (rows[0].customer_name_snapshot || rows[0].customer_code) + " (" + rows[0].customer_code + ")." });
              return null;
            }
            return rpc("gm_accounts_create_delivery_invoice", {
              p_customer_code: customerCode,
              p_customer_name: String(customer.name || customer.shopName || "Customer").slice(0, 120),
              p_invoice_no: invoiceNo,
              p_invoice_date: today,
              p_amount: amount,
              p_evidence_path: evidencePath,
              p_created_by: String(session.id).slice(0, 80),
            });
          }).then((invoiceId) => { if (invoiceId !== null) send(res, 201, { ok: true, invoiceId }); })
            .catch((e) => fail(res, e));
        } catch (e) { send(res, 400, { error: e.message }); }
      }, 8 * 1024);
      return true;
    }

    const evidenceMatch = /^\/api\/accounts\/evidence\/([0-9a-f-]{36})$/i.exec(p);
    if (req.method === "GET" && evidenceMatch) {
      if (!canBill(session) && !canCollect(session)) { send(res, 403, { error: "Accounts evidence permission required." }); return true; }
      const token = evidenceMatch[1].toLowerCase();
      (async () => {
        for (const ext of ["jpg", "png", "webp"]) {
          const evidencePath = "accounts/evidence/" + token + "." + ext;
          const encoded = encodeURIComponent(evidencePath);
          const [allocations, invoices] = await Promise.all([
            rest("gm_accounts_collection_allocations?select=evidence_path,collection_id&evidence_path=eq." + encoded),
            rest("gm_accounts_invoices?select=evidence_path,customer_code&evidence_path=eq." + encoded),
          ]);
          let allowed = false;
          if (allocations.length) {
            const ids = Array.from(new Set(allocations.map((x) => x.collection_id)));
            const collections = await rest("gm_accounts_collections?select=id,collected_by&id=in.(" + ids.join(",") + ")");
            allowed = collections.some((x) => canBill(session) || String(x.collected_by) === String(session.id));
          }
          if (invoices.length && (canBill(session) || invoices.some((x) => canAccessCustomer(session, x.customer_code)))) allowed = true;
          if (!allowed) continue;
          const bytes = await files.get(evidencePath);
          if (!bytes) return send(res, 404, { error: "Evidence file is missing." });
          return sendEvidence(res, bytes, ext);
        }
        send(res, 404, { error: "Evidence not found." });
      })().catch((e) => { console.error("Accounts evidence read:", e.message); send(res, 502, { error: "Unable to load invoice evidence." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/collectible-customers") {
      if (!canCollect(session)) { send(res, 403, { error: "Sales collection permission required." }); return true; }
      rest("gm_accounts_invoices?select=customer_code,customer_name_snapshot&order=customer_name_snapshot.asc&limit=5000")
        .then((rows) => {
          const seen = new Set();
          const customers = rows.filter((x) => {
            if (seen.has(x.customer_code)) return false;
            seen.add(x.customer_code);
            return !!customerLookup(x.customer_code) && canAccessCustomer(session, x.customer_code);
          }).map((x) => ({ code: x.customer_code, name: x.customer_name_snapshot }));
          send(res, 200, { ok: true, customers });
        })
        .catch((e) => { console.error("Accounts customer list:", e.message); send(res, 502, { error: "Unable to load customers with Accounts records." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/reports/collections") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
      const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
      if (!validDate(from) || !validDate(to) || from > to) { send(res, 400, { error: "Enter a valid date range." }); return true; }
      const start = new Date(from + "T00:00:00+05:30").toISOString(), end = new Date(new Date(to + "T00:00:00+05:30").getTime() + 24 * 3600e3).toISOString();
      restAll("gm_accounts_collections?select=id,customer_code,customer_name_snapshot,collected_by,collector_name_snapshot,method,total_amount,status,received_at,approved_at&status=eq.approved&approved_at=gte." + encodeURIComponent(start) + "&approved_at=lt." + encodeURIComponent(end) + "&order=approved_at,id")
        .then((collections) => send(res, 200, { ok: true, from, to, generatedAt: new Date().toISOString(), ...buildCollectionReport({ collections }) }))
        .catch((e) => { console.error("Accounts collection report:", e.message); send(res, 502, { error: "Unable to load the collection report." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/reports/handovers") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
      const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
      if (!validDate(from) || !validDate(to) || from > to) { send(res, 400, { error: "Enter a valid date range." }); return true; }
      const start = new Date(from + "T00:00:00+05:30").toISOString(), end = new Date(new Date(to + "T00:00:00+05:30").getTime() + 24 * 3600e3).toISOString();
      restAll("gm_accounts_cash_movements?select=id,movement_type,from_employee_id,to_employee_id,amount,status,recorded_at,confirmed_by&movement_type=in.(handover,office_receipt)&recorded_at=gte." + encodeURIComponent(start) + "&recorded_at=lt." + encodeURIComponent(end) + "&order=recorded_at,id")
        .then((movements) => {
          const names = {};
          for (const e of (config.employeeList ? config.employeeList() : [])) if (e && e.id) names[String(e.id)] = String(e.name || e.id).slice(0, 120);
          send(res, 200, { ok: true, from, to, generatedAt: new Date().toISOString(), ...buildHandoverReport({ movements, names }) });
        })
        .catch((e) => { console.error("Accounts handover report:", e.message); send(res, 502, { error: "Unable to load the cash handover report." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/reports/outstanding") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      Promise.all([
        restAll("gm_accounts_invoices?select=id,customer_code,customer_name_snapshot,invoice_date,initial_outstanding&order=id"),
        restAll("gm_accounts_collection_allocations?select=invoice_id,amount,collection_id&order=id"),
        restAll("gm_accounts_collections?select=id&status=eq.approved&order=id"),
      ]).then(([invoices, allocations, approved]) =>
        send(res, 200, { ok: true, generatedAt: new Date().toISOString(), ...buildOutstandingReport({ invoices, allocations, approvedCollectionIds: approved.map((x) => x.id) }) }))
        .catch((e) => { console.error("Accounts outstanding report:", e.message); send(res, 502, { error: "Unable to load the outstanding report." }); });
      return true;
    }

    const statementMatch = /^\/api\/accounts\/customers\/([^/]+)\/statement$/.exec(p);
    if (req.method === "GET" && statementMatch) {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      let customerCode;
      try { customerCode = decodeURIComponent(statementMatch[1]); } catch (_) { send(res, 400, { error: "Invalid customer code." }); return true; }
      const customer = customerCode && customerCode.length <= 80 ? customerLookup(customerCode) : null;
      if (!customer || !canAccessCustomer(session, customerCode)) { send(res, 404, { error: "Customer not found." }); return true; }
      const validDate = (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v);
      const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
      if (!validDate(from) || !validDate(to) || (from && to && from > to)) { send(res, 400, { error: "Enter a valid date range." }); return true; }
      (async () => {
        const invoices = await restAll("gm_accounts_invoices?select=id,invoice_no,invoice_date,source_kind,original_amount,initial_outstanding,created_at&customer_code=eq." + encodeURIComponent(customerCode) + "&order=id");
        let allocations = [];
        for (let i = 0; i < invoices.length; i += 40)
          allocations = allocations.concat(await restAll("gm_accounts_collection_allocations?select=id,invoice_id,amount,collection_id&invoice_id=in.(" + invoices.slice(i, i + 40).map((x) => x.id).join(",") + ")&order=id"));
        const colIds = Array.from(new Set(allocations.map((x) => x.collection_id)));
        let collections = [];
        for (let i = 0; i < colIds.length; i += 40)
          collections = collections.concat(await rest("gm_accounts_collections?select=id,status,method,received_at,approved_at&status=eq.approved&id=in.(" + colIds.slice(i, i + 40).join(",") + ")"));
        const statement = buildStatement({ invoices, allocations, collections, from, to });
        send(res, 200, { ok: true, customer: { code: customerCode, name: String(customer.name || customer.shopName || customerCode), phone: String(customer.phone || "").slice(0, 40), address: String(customer.address || "").slice(0, 300) }, from, to, generatedAt: new Date().toISOString(), ...statement });
      })().catch((e) => { console.error("Accounts statement:", e.message); send(res, 502, { error: "Unable to load customer statement." }); });
      return true;
    }

    if (req.method === "GET" && invoiceMatch) {
      if (!canBill(session) && !canCollect(session)) { send(res, 403, { error: "Customer Accounts permission required." }); return true; }
      let customerCode;
      try { customerCode = decodeURIComponent(invoiceMatch[1]); } catch (_) { send(res, 400, { error: "Invalid customer code." }); return true; }
      if (!customerCode || customerCode.length > 80 || !customerLookup(customerCode) || !canAccessCustomer(session, customerCode)) { send(res, 404, { error: "Customer not found." }); return true; }
      rest("gm_accounts_invoices?select=id,customer_code,customer_name_snapshot,invoice_no,invoice_date,source_kind,original_amount,initial_outstanding,evidence_path,created_at&customer_code=eq." + encodeURIComponent(customerCode) + "&order=invoice_date.desc,created_at.desc")
        .then(async (invoices) => {
          const ids = invoices.map((x) => x.id);
          let allocations = [];
          if (ids.length) allocations = await rest("gm_accounts_collection_allocations?select=invoice_id,amount,collection_id&invoice_id=in.(" + ids.join(",") + ")");
          const collectionIds = Array.from(new Set(allocations.map((x) => x.collection_id)));
          let approvedCollections = [];
          if (collectionIds.length) approvedCollections = await rest("gm_accounts_collections?select=id,status&id=in.(" + collectionIds.join(",") + ")&status=eq.approved");
          const statusById = new Map(approvedCollections.map((x) => [x.id, x.status]));
          const approved = {}, pending = {};
          for (const row of allocations) {
            const status = statusById.get(row.collection_id);
            if (status === "approved") approved[row.invoice_id] = (approved[row.invoice_id] || 0) + Number(row.amount || 0);
          }
          const allCollectionIds = Array.from(new Set(allocations.map((x) => x.collection_id)));
          let pendingCollections = [];
          if (allCollectionIds.length) pendingCollections = await rest("gm_accounts_collections?select=id,status&id=in.(" + allCollectionIds.join(",") + ")&status=eq.pending_approval");
          const pendingIds = new Set(pendingCollections.map((x) => x.id));
          for (const row of allocations) if (pendingIds.has(row.collection_id))
            pending[row.invoice_id] = (pending[row.invoice_id] || 0) + Number(row.amount || 0);
          const result = invoices.map((inv) => ({ ...inv, approvedPaid: Number((approved[inv.id] || 0).toFixed(2)), pendingAmount: Number((pending[inv.id] || 0).toFixed(2)), outstanding: Number((Number(inv.initial_outstanding) - (approved[inv.id] || 0)).toFixed(2)), availableToCollect: Number((Number(inv.initial_outstanding) - (approved[inv.id] || 0) - (pending[inv.id] || 0)).toFixed(2)) }));
          send(res, 200, { ok: true, customerCode, invoices: result });
        }).catch((e) => { console.error("Accounts invoice read:", e.message); send(res, 502, { error: "Unable to load customer ledger." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/summary") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const IST = 5.5 * 3600e3, DAY = 24 * 3600e3;
      const istDate = (t) => new Date(t + IST).toISOString().slice(0, 10);
      const today = istDate(Date.now());
      const todayStart = new Date(today + "T00:00:00+05:30").getTime();
      const chartFromMs = todayStart - 13 * DAY;
      // Range for "Collections" totals: today (default), this week (Monday on), this month, this year - all in India time.
      const RANGES = ["today", "week", "month", "year"];
      const range = RANGES.includes(url.searchParams.get("range")) ? url.searchParams.get("range") : "today";
      const dow = (new Date(todayStart + IST).getUTCDay() + 6) % 7; // Monday = 0
      const rangeStartMs = range === "week" ? todayStart - dow * DAY
        : range === "month" ? new Date(today.slice(0, 7) + "-01T00:00:00+05:30").getTime()
        : range === "year" ? new Date(today.slice(0, 4) + "-01-01T00:00:00+05:30").getTime() : todayStart;
      const chartFrom = new Date(Math.min(chartFromMs, rangeStartMs)).toISOString();
      Promise.all([
        restAll("gm_accounts_journal_lines?select=account_code,debit,credit&account_code=in.(CUSTOMER_RECEIVABLE,EMPLOYEE_CASH_CUSTODY,OFFICE_CASH,UPI_CLEARING,BANK)&order=id"),
        restAll("gm_accounts_collections?select=method,total_amount,status,received_at&received_at=gte." + encodeURIComponent(chartFrom) + "&status=in.(approved,pending_approval)&order=received_at"),
        restAll("gm_accounts_collections?select=id,total_amount&status=eq.pending_approval&order=id"),
        restAll("gm_accounts_cash_movements?select=id&movement_type=in.(handover,office_receipt)&status=eq.recorded&order=id"),
        restAll("gm_accounts_upi_settlements?select=id&status=eq.pending&order=id"),
        restAll("gm_accounts_daily_closings?select=id&status=eq.pending_approval&order=id"),
        rest("gm_accounts_collections?select=id,customer_name_snapshot,collector_name_snapshot,method,total_amount,status,received_at&order=received_at.desc&limit=8"),
        restAll("gm_accounts_cash_movements?select=id&status=eq.disputed&order=id"),
        restAll("gm_accounts_upi_settlements?select=id&status=eq.disputed&order=id"),
        restAll("gm_accounts_daily_closings?select=id&status=eq.disputed&order=id"),
      ]).then(async ([lines, recentWindow, pendingCollections, pendingMoves, pendingUpi, pendingClosings, recent, badMoves, badUpi, badClosings]) => {
        // Invoice numbers for the recent rows
        const recentIds = recent.map((x) => x.id);
        const recentAlloc = recentIds.length ? await rest("gm_accounts_collection_allocations?select=collection_id,invoice_id&collection_id=in.(" + recentIds.join(",") + ")") : [];
        const recentInvIds = Array.from(new Set(recentAlloc.map((x) => x.invoice_id)));
        const recentInv = recentInvIds.length ? await rest("gm_accounts_invoices?select=id,invoice_no&id=in.(" + recentInvIds.join(",") + ")") : [];
        const invNo = Object.fromEntries(recentInv.map((x) => [x.id, x.invoice_no]));
        for (const r of recent) r.invoiceNos = Array.from(new Set(recentAlloc.filter((a) => a.collection_id === r.id).map((a) => invNo[a.invoice_id]).filter(Boolean)));
        const sums = { CUSTOMER_RECEIVABLE: 0, EMPLOYEE_CASH_CUSTODY: 0, OFFICE_CASH: 0, UPI_CLEARING: 0, BANK: 0 };
        for (const line of lines) sums[line.account_code] += Number(line.debit || 0) - Number(line.credit || 0);
        const money = (n) => Number(Number(n || 0).toFixed(2));
        const dayTotals = {};
        for (let i = 13; i >= 0; i--) dayTotals[istDate(todayStart - i * DAY + 1000)] = { date: istDate(todayStart - i * DAY + 1000), approved: 0, pending: 0 };
        const todayBy = { cash: 0, upi: 0, bank_transfer: 0, count: 0 };
        const rangeBy = { cash: 0, upi: 0, bank_transfer: 0, count: 0 };
        for (const row of recentWindow) {
          const day = istDate(new Date(row.received_at).getTime());
          const amount = Number(row.total_amount || 0);
          if (dayTotals[day]) dayTotals[day][row.status === "approved" ? "approved" : "pending"] += amount;
          if (new Date(row.received_at).getTime() >= rangeStartMs && rangeBy[row.method] !== undefined) { rangeBy[row.method] += amount; rangeBy.count += 1; }
          if (day === today && todayBy[row.method] !== undefined) { todayBy[row.method] += amount; todayBy.count += 1; }
        }
        send(res, 200, {
          ok: true,
          today,
          balances: {
            receivables: money(sums.CUSTOMER_RECEIVABLE), officeCash: money(sums.OFFICE_CASH), employeeCash: money(sums.EMPLOYEE_CASH_CUSTODY),
            upiClearing: money(sums.UPI_CLEARING), bank: money(sums.BANK),
          },
          todayCollections: { cash: money(todayBy.cash), upi: money(todayBy.upi), bankTransfer: money(todayBy.bank_transfer), total: money(todayBy.cash + todayBy.upi + todayBy.bank_transfer), count: todayBy.count },
          range, rangeFrom: istDate(rangeStartMs + 1000),
          rangeCollections: { cash: money(rangeBy.cash), upi: money(rangeBy.upi), bankTransfer: money(rangeBy.bank_transfer), total: money(rangeBy.cash + rangeBy.upi + rangeBy.bank_transfer), count: rangeBy.count },
          pending: {
            discrepancies: badMoves.length + badUpi.length + badClosings.length,
            collections: pendingCollections.length,
            collectionsAmount: money(pendingCollections.reduce((n, x) => n + Number(x.total_amount || 0), 0)),
            cashMovements: pendingMoves.length,
            upiSettlements: pendingUpi.length,
            dailyClosings: pendingClosings.length,
          },
          recent,
          daily: Object.values(dayTotals).map((d) => ({ date: d.date, approved: money(d.approved), pending: money(d.pending) })),
        });
      }).catch((e) => { console.error("Accounts summary read:", e.message); send(res, 502, { error: "Unable to load the Accounts dashboard." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/my-collections") {
      if (!canCollect(session)) { send(res, 403, { error: "Sales or Delivery collection permission required." }); return true; }
      rest("gm_accounts_collections?select=id,customer_name_snapshot,method,total_amount,status,received_at,rejection_reason,correction_note&collected_by=eq." + encodeURIComponent(String(session.id)) + "&order=received_at.desc&limit=30")
        .then((rows) => send(res, 200, { ok: true, collections: rows.map((x) => ({ ...x, total_amount: Number(x.total_amount || 0) })) }))
        .catch((e) => { console.error("Accounts my collections:", e.message); send(res, 502, { error: "Unable to load your collections." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/collections") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const STATUSES = ["pending_approval", "approved", "rejected", "reversed", "correction_requested"], METHODS = ["cash", "upi", "bank_transfer"];
      const q = url.searchParams;
      const status = STATUSES.includes(q.get("status")) ? q.get("status") : "";
      const method = METHODS.includes(q.get("method")) ? q.get("method") : "";
      const collector = /^[A-Za-z0-9_.-]{1,60}$/.test(q.get("collector") || "") ? q.get("collector") : "";
      const visit = /^[A-Za-z0-9:_-]{1,90}$/.test(q.get("visit") || "") ? q.get("visit") : "";
      const search = String(q.get("q") || "").replace(/[^A-Za-z0-9 .&'-]/g, " ").trim().slice(0, 60);
      const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(new Date(v + "T00:00:00+05:30"));
      const from = dateOk(q.get("from")) ? q.get("from") : "", to = dateOk(q.get("to")) ? q.get("to") : "";
      const page = Math.max(1, Math.min(10000, parseInt(q.get("page"), 10) || 1)), size = 25;
      let filter = "";
      if (status) filter += "&status=eq." + status;
      if (method) filter += "&method=eq." + method;
      if (visit) filter += "&visit_ref=eq." + encodeURIComponent(visit);
      if (collector) filter += "&collected_by=eq." + encodeURIComponent(collector);
      if (search) filter += "&customer_name_snapshot=ilike." + encodeURIComponent("*" + search + "*");
      if (from) filter += "&received_at=gte." + encodeURIComponent(new Date(from + "T00:00:00+05:30").toISOString());
      if (to) filter += "&received_at=lt." + encodeURIComponent(new Date(new Date(to + "T00:00:00+05:30").getTime() + 24 * 3600e3).toISOString());
      const IST = 5.5 * 3600e3, today = new Date(Date.now() + IST).toISOString().slice(0, 10);
      const monthStart = new Date(today.slice(0, 7) + "-01T00:00:00+05:30").toISOString();
      const cols = "id,customer_code,customer_name_snapshot,collected_by,collector_name_snapshot,method,total_amount,note,status,received_at,approved_by,approved_at,rejection_reason,rejected_by,rejected_at,correction_note,correction_requested_by,correction_requested_at,visit_ref";
      Promise.all([
        restPage("gm_accounts_collections?select=" + cols + filter + "&order=received_at.desc,id", (page - 1) * size, size),
        restAll("gm_accounts_collections?select=total_amount&status=eq.pending_approval&order=id"),
        restPage("gm_accounts_collections?select=id&status=eq.approved&order=id", 0, 1),
        restPage("gm_accounts_collections?select=id&status=eq.rejected&order=id", 0, 1),
        restPage("gm_accounts_collections?select=id&status=eq.correction_requested&order=id", 0, 1),
        restAll("gm_accounts_collections?select=total_amount&status=eq.approved&approved_at=gte." + encodeURIComponent(monthStart) + "&order=id"),
      ]).then(async ([list, pendingRows, approvedCount, rejectedCount, correctionCount, approvedMonth]) => {
        const ids = list.rows.map((x) => x.id);
        const allocations = ids.length ? await rest("gm_accounts_collection_allocations?select=collection_id,invoice_id,amount,evidence_path&collection_id=in.(" + ids.join(",") + ")") : [];
        const invoiceIds = Array.from(new Set(allocations.map((x) => x.invoice_id)));
        const invoiceRows = invoiceIds.length ? await rest("gm_accounts_invoices?select=id,invoice_no,invoice_date,original_amount,initial_outstanding&id=in.(" + invoiceIds.join(",") + ")") : [];
        const invoiceMap = Object.fromEntries(invoiceRows.map((x) => [x.id, x]));
        // Outstanding now = amount owed when the invoice was entered, minus every APPROVED payment against it.
        const approvedPaid = {};
        if (invoiceIds.length) {
          const every = await restAll("gm_accounts_collection_allocations?select=invoice_id,amount,collection_id&invoice_id=in.(" + invoiceIds.join(",") + ")&order=id");
          const cids = Array.from(new Set(every.map((x) => x.collection_id)));
          const okRows = cids.length ? await rest("gm_accounts_collections?select=id&status=eq.approved&id=in.(" + cids.join(",") + ")") : [];
          const okIds = new Set(okRows.map((x) => x.id));
          for (const row of every) if (okIds.has(row.collection_id)) approvedPaid[row.invoice_id] = (approvedPaid[row.invoice_id] || 0) + Number(row.amount || 0);
        }
        const grouped = {};
        for (const row of allocations) {
          const inv = invoiceMap[row.invoice_id] || {};
          (grouped[row.collection_id] || (grouped[row.collection_id] = [])).push({
            invoiceNo: inv.invoice_no || "", invoiceDate: inv.invoice_date || "", invoiceAmount: Number(inv.original_amount || 0), amount: Number(row.amount || 0),
            outstanding: Number((Number(inv.initial_outstanding || 0) - (approvedPaid[row.invoice_id] || 0)).toFixed(2)),
            evidenceUrl: "/api/accounts/evidence/" + (String(row.evidence_path).split("/").pop() || "").replace(/\.(jpg|png|webp)$/i, ""),
          });
        }
        const money = (n) => Number(Number(n || 0).toFixed(2));
        send(res, 200, {
          ok: true, page, pageSize: size, total: list.total,
          stats: {
            pendingCount: pendingRows.length, pendingAmount: money(pendingRows.reduce((n, x) => n + Number(x.total_amount || 0), 0)),
            approvedCount: approvedCount.total, rejectedCount: rejectedCount.total, correctionCount: correctionCount.total,
            approvedMonthAmount: money(approvedMonth.reduce((n, x) => n + Number(x.total_amount || 0), 0)),
          },
          rows: list.rows.map((x) => ({ ...x, total_amount: Number(x.total_amount || 0), invoices: grouped[x.id] || [] })),
        });
      }).catch((e) => { console.error("Accounts collections read:", e.message); send(res, 502, { error: "Unable to load collections." }); });
      return true;
    }

    // The signed-in employee's own collections (their history screen).
    if (req.method === "GET" && p === "/api/accounts/collections/mine") {
      if (!canCollect(session)) { send(res, 403, { error: "Collection permission required." }); return true; }
      const q = url.searchParams;
      const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(new Date(v + "T00:00:00+05:30"));
      let filter = "&collected_by=eq." + encodeURIComponent(String(session.id));
      if (dateOk(q.get("from"))) filter += "&received_at=gte." + encodeURIComponent(new Date(q.get("from") + "T00:00:00+05:30").toISOString());
      if (dateOk(q.get("to"))) filter += "&received_at=lt." + encodeURIComponent(new Date(new Date(q.get("to") + "T00:00:00+05:30").getTime() + 24 * 3600e3).toISOString());
      rest("gm_accounts_collections?select=id,customer_code,customer_name_snapshot,method,total_amount,status,received_at,visit_ref,note" + filter + "&order=received_at.desc,id&limit=400").then(async (list) => {
        const ids = list.map((x) => x.id);
        const allocations = ids.length ? await rest("gm_accounts_collection_allocations?select=collection_id,invoice_id,amount,evidence_path&collection_id=in.(" + ids.join(",") + ")") : [];
        const invIds = Array.from(new Set(allocations.map((x) => x.invoice_id)));
        const invRows = invIds.length ? await rest("gm_accounts_invoices?select=id,invoice_no&id=in.(" + invIds.join(",") + ")") : [];
        const invMap = Object.fromEntries(invRows.map((x) => [x.id, x.invoice_no]));
        const grouped = {};
        for (const a of allocations)
          (grouped[a.collection_id] || (grouped[a.collection_id] = [])).push({
            invoiceNo: invMap[a.invoice_id] || "", amount: Number(a.amount || 0),
            evidenceUrl: "/api/accounts/evidence/" + (String(a.evidence_path).split("/").pop() || "").replace(/\.(jpg|png|webp)$/i, ""),
          });
        send(res, 200, { ok: true, rows: list.map((x) => ({
          id: x.id, visitRef: x.visit_ref || "", customerCode: x.customer_code, customerName: x.customer_name_snapshot,
          method: x.method, total: Number(x.total_amount || 0), status: x.status, receivedAt: x.received_at, note: x.note || "",
          invoices: grouped[x.id] || [],
        })) });
      }).catch((e) => { console.error("Accounts own collections:", e.message); send(res, 502, { error: "Unable to load your collections." }); });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/collections/pending") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      rest("gm_accounts_collections?select=id,customer_code,customer_name_snapshot,collected_by,collector_name_snapshot,method,total_amount,note,status,received_at&status=eq.pending_approval&order=received_at.asc")
        .then(async (collections) => {
          const ids = collections.map((x) => x.id);
          const allocations = ids.length ? await rest("gm_accounts_collection_allocations?select=collection_id,invoice_id,amount,evidence_path&collection_id=in.(" + ids.join(",") + ")") : [];
          const invoiceIds = Array.from(new Set(allocations.map((x) => x.invoice_id)));
          const invoiceRows = invoiceIds.length ? await rest("gm_accounts_invoices?select=id,invoice_no,invoice_date&id=in.(" + invoiceIds.join(",") + ")") : [];
          const invoiceMap = Object.fromEntries(invoiceRows.map((x) => [x.id, x]));
          const grouped = {};
          for (const row of allocations) (grouped[row.collection_id] || (grouped[row.collection_id] = [])).push({ ...row, invoice: invoiceMap[row.invoice_id] || null, evidenceUrl: "/api/accounts/evidence/" + (String(row.evidence_path).split("/").pop() || "").replace(/\.(jpg|png|webp)$/i, "") });
          send(res, 200, { ok: true, collections: collections.map((x) => ({ ...x, allocations: grouped[x.id] || [] })) });
        })
        .catch((e) => { console.error("Accounts pending read:", e.message); send(res, 502, { error: "Unable to load pending collections." }); });
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/opening-invoices") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      body(req, (err, input) => {
        if (err) return send(res, 400, { error: "Invalid request body." });
        try {
          const customer = customerLookup(input && input.customerCode);
          if (!customer) throw new Error("Customer not found.");
          const valid = validateOpeningInvoice(input);
          if (!/^accounts\/evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(valid.evidencePath) || !files || !files.has(valid.evidencePath))
            throw new Error("Upload and verify the opening invoice bill photo first.");
          const onPlan = planInvoiceOwner(valid.invoiceNo, valid.customerCode);
          if (onPlan) {
            send(res, 409, { error: "Invoice " + valid.invoiceNo + " is already on a Daily plan for " + onPlan.name + " (" + onPlan.code + "). One invoice number cannot be used for two customers." });
            return;
          }
          rest("gm_accounts_invoices?select=customer_code,customer_name_snapshot&invoice_no=eq." + encodeURIComponent(valid.invoiceNo) + "&customer_code=neq." + encodeURIComponent(valid.customerCode) + "&limit=1").then((other) => {
            if (other.length) {
              send(res, 409, { error: "Invoice " + valid.invoiceNo + " already belongs to " + (other[0].customer_name_snapshot || other[0].customer_code) + " (" + other[0].customer_code + "). One invoice number cannot be used for two customers." });
              return null;
            }
            return rpc("gm_accounts_create_opening_invoice", {
            p_customer_code: valid.customerCode,
            p_customer_name: String(customer.name || customer.shopName || "Customer").slice(0, 120),
            p_invoice_no: valid.invoiceNo,
            p_invoice_date: valid.invoiceDate,
            p_original_amount: valid.originalAmount,
            p_outstanding_amount: valid.openingOutstanding,
            p_evidence_path: valid.evidencePath,
            p_created_by: String(session.id).slice(0, 80),
            });
          }).then((invoiceId) => { if (invoiceId !== null) send(res, 201, { ok: true, invoiceId }); })
            .catch((e) => fail(res, e));
        } catch (e) { send(res, 400, { error: e.message }); }
      }, 16384);
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/collections/split") {
      if (!canCollect(session)) { send(res, 403, { error: "Sales or Delivery collection permission required." }); return true; }
      body(req, (err, input) => {
        if (err) return send(res, 400, { error: "Invalid request body." });
        try {
          const customer = customerLookup(input && input.customerCode);
          if (!customer || !canAccessCustomer(session, input && input.customerCode)) throw new Error("Customer not found or not assigned to your account.");
          if (session.role === "worker" && !config.isActiveDeliveryWorker(session.id)) throw new Error("Active Delivery employee account required.");
          const requested = input && Array.isArray(input.allocations) ? input.allocations : [];
          const invoiceIds = Array.from(new Set(requested.map((x) => String((x && x.invoiceId) || "").trim()).filter(Boolean)));
          if (!invoiceIds.length || invoiceIds.length !== requested.length) throw new Error("Choose valid invoice allocations.");
          if (invoiceIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Choose valid invoice allocations.");
          rest("gm_accounts_invoices?select=id,customer_code,initial_outstanding&id=in.(" + invoiceIds.join(",") + ")&customer_code=eq." + encodeURIComponent(String(input.customerCode)))
            .then(async (invoiceRows) => {
              const allocRows = await rest("gm_accounts_collection_allocations?select=invoice_id,amount,collection_id&invoice_id=in.(" + invoiceIds.join(",") + ")");
              const collectionIds = Array.from(new Set(allocRows.map((x) => x.collection_id)));
              const approvedRows = collectionIds.length ? await rest("gm_accounts_collections?select=id,status&id=in.(" + collectionIds.join(",") + ")&status=eq.approved") : [];
              const approvedIds = new Set(approvedRows.map((x) => x.id));
              const paid = {}, balances = {};
              for (const row of allocRows) if (approvedIds.has(row.collection_id)) paid[row.invoice_id] = (paid[row.invoice_id] || 0) + Number(row.amount || 0);
              for (const inv of invoiceRows) balances[inv.id] = { customerCode: inv.customer_code, outstandingAmount: Number((Number(inv.initial_outstanding) - (paid[inv.id] || 0)).toFixed(2)) };
              const valid = validateSplitCollection(input, balances);
              for (const part of valid.parts) for (const allocation of part.allocations) {
                if (!/^accounts\/evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(allocation.evidencePath) || !files || !files.has(allocation.evidencePath))
                  throw new Error("Upload and verify a bill photo for every invoice allocation.");
              }
              return rpc("gm_accounts_record_split_collection", {
                p_request_key: valid.requestKey,
                p_customer_code: valid.customerCode,
                p_customer_name: String(customer.name || customer.shopName || "Customer").slice(0, 120),
                p_collected_by: String(session.id).slice(0, 80),
                p_collector_name: String(session.name || config.employeeName(session.id) || "Employee").slice(0, 120),
                p_parts: valid.parts.map((x) => ({ method: x.method, allocations: x.allocations })),
                p_note: valid.note,
              }).then((result) => {
                notifyCollection(session, customer, valid.parts.reduce((n, x) => n + Number(x.total || 0), 0), valid.parts.map((x) => ({ cash: "Cash", upi: "UPI", bank_transfer: "Bank" }[x.method] || x.method)).join(" + "));
                send(res, 201, { ...result, parts: valid.parts.map((x) => ({ method: x.method, total: x.total })) });
              });
            }).catch((e) => fail(res, e));
        } catch (e) { send(res, 400, { error: e.message }); }
      }, 65536);
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/collections") {
      if (!canCollect(session)) { send(res, 403, { error: "Sales or Delivery collection permission required." }); return true; }
      body(req, (err, input) => {
        if (err) return send(res, 400, { error: "Invalid request body." });
        try {
          const customer = customerLookup(input && input.customerCode);
          if (!customer || !canAccessCustomer(session, input && input.customerCode)) throw new Error("Customer not found or not assigned to your account.");
          if (session.role === "worker" && !config.isActiveDeliveryWorker(session.id)) throw new Error("Active Delivery employee account required.");
          const requested = input && Array.isArray(input.allocations) ? input.allocations : [];
          const invoiceIds = Array.from(new Set(requested.map((x) => String((x && x.invoiceId) || "").trim()).filter(Boolean)));
          if (!invoiceIds.length || invoiceIds.length !== requested.length) throw new Error("Choose valid invoice allocations.");
          let valid;
          rest("gm_accounts_invoices?select=id,customer_code,initial_outstanding&id=in.(" + invoiceIds.join(",") + ")&customer_code=eq." + encodeURIComponent(String(input.customerCode)))
            .then(async (invoiceRows) => {
              const balances = {};
              const allocRows = await rest("gm_accounts_collection_allocations?select=invoice_id,amount,collection_id&invoice_id=in.(" + invoiceIds.join(",") + ")");
              const collectionIds = Array.from(new Set(allocRows.map((x) => x.collection_id)));
              const approvedRows = collectionIds.length ? await rest("gm_accounts_collections?select=id,status&id=in.(" + collectionIds.join(",") + ")&status=eq.approved") : [];
              const approvedIds = new Set(approvedRows.map((x) => x.id));
              const paid = {};
              for (const row of allocRows) if (approvedIds.has(row.collection_id)) paid[row.invoice_id] = (paid[row.invoice_id] || 0) + Number(row.amount || 0);
              for (const inv of invoiceRows) balances[inv.id] = { customerCode: inv.customer_code, outstandingAmount: Number((Number(inv.initial_outstanding) - (paid[inv.id] || 0)).toFixed(2)) };
              valid = validateCollection(input, balances);
              for (const allocation of valid.allocations) {
                if (!/^accounts\/evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(allocation.evidencePath) || !files || !files.has(allocation.evidencePath))
                  throw new Error("Upload and verify a bill photo for every invoice allocation.");
              }
              const allocations = valid.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount, evidencePath: a.evidencePath }));
              return rpc("gm_accounts_record_collection", {
            p_request_key: valid.requestKey,
            p_customer_code: valid.customerCode,
            p_customer_name: String(customer.name || customer.shopName || "Customer").slice(0, 120),
            p_collected_by: String(session.id).slice(0, 80),
            p_collector_name: String(session.name || config.employeeName(session.id) || "Employee").slice(0, 120),
            p_method: valid.method,
            p_allocations: allocations,
            p_note: valid.note,
              });
            }).then((result) => {
              notifyCollection(session, customer, valid.allocations.reduce((n, a) => n + Number(a.amount || 0), 0), { cash: "Cash", upi: "UPI", bank_transfer: "Bank" }[valid.method] || valid.method);
              send(res, 201, result);
            })
            .catch((e) => fail(res, e));
        } catch (e) { send(res, 400, { error: e.message }); }
      }, 32768);
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/upi-settlements") {
      if (!canBill(session)) { send(res,403,{error:"Billing permission required."}); return true; }
      Promise.all([
        restAll("gm_accounts_journal_lines?select=debit,credit&account_code=eq.UPI_CLEARING&order=id"),
        rest("gm_accounts_upi_settlements?select=id,request_key,amount,bank_reference,bank_credit_date,note,status,recorded_by,recorded_at,confirmed_by,confirmed_at&order=recorded_at.desc&limit=200"),
        rest("gm_accounts_collections?select=id,customer_name_snapshot,collected_by,collector_name_snapshot,total_amount,received_at,status&method=eq.upi&status=eq.approved&order=received_at.desc&limit=100")
      ]).then(([lines,settlements,collections])=>{
        const balance=Number(lines.reduce((n,x)=>n+Number(x.debit||0)-Number(x.credit||0),0).toFixed(2));
        send(res,200,{ok:true,upiClearingBalance:balance,settlements,collections});
      }).catch(e=>{console.error("UPI settlement read:",e.message);send(res,502,{error:"Unable to load UPI settlement register."});});
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/upi-settlements") {
      if (!canBill(session)) { send(res,403,{error:"Billing permission required."}); return true; }
      body(req,(err,input)=>{
        if(err)return send(res,400,{error:"Invalid UPI settlement request."});
        try {
          const amount=Number(input&&input.amount), reference=String(input&&input.bankReference||"").trim();
          const date=String(input&&input.bankCreditDate||"").trim(), key=String(input&&input.requestKey||"").trim();
          if(!Number.isFinite(amount)||amount<=0||amount>10000000)throw new Error("Enter a valid settlement amount.");
          if(!/^[A-Za-z0-9][A-Za-z0-9 ./_-]{3,79}$/.test(reference))throw new Error("Enter a valid bank UTR/reference (4–80 characters).");
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))throw new Error("Select the bank credit date.");
          if(!/^[A-Za-z0-9:_-]{12,100}$/.test(key))throw new Error("Invalid settlement request reference.");
          return rpc("gm_accounts_create_upi_settlement",{p_request_key:key,p_amount:amount,p_bank_reference:reference,p_bank_credit_date:date,p_note:String(input.note||"").slice(0,300),p_recorded_by:String(session.id)})
            .then(result=>send(res,201,result)).catch(e=>fail(res,e));
        }catch(e){send(res,400,{error:e.message});}
      },8192);
      return true;
    }

    const upiSettlementAction=/^\/api\/accounts\/upi-settlements\/([0-9a-f-]{36})\/(confirm|dispute)$/.exec(p);
    if(req.method==="POST"&&upiSettlementAction){
      if(!canBill(session)){send(res,403,{error:"Billing permission required."});return true;}
      if(upiSettlementAction[2]==="confirm"){
        rpc("gm_accounts_confirm_upi_settlement",{p_settlement_id:upiSettlementAction[1],p_confirmed_by:String(session.id)})
          .then(result=>send(res,200,result)).catch(e=>fail(res,e));
      }else{
        body(req,(err,input)=>{
          if(err)return send(res,400,{error:"Invalid dispute request."});
          const reason=String(input&&input.reason||"").trim();
          if(!reason||reason.length>300)return send(res,400,{error:"Enter a dispute reason (maximum 300 characters)."});
          rpc("gm_accounts_dispute_upi_settlement",{p_settlement_id:upiSettlementAction[1],p_disputed_by:String(session.id),p_reason:reason})
            .then(result=>send(res,200,result)).catch(e=>fail(res,e));
        },8192);
      }
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/daily-closing") {
      if (!canBill(session)) { send(res,403,{error:"Billing permission required."}); return true; }
      Promise.all([
        restAll("gm_accounts_journal_lines?select=account_code,employee_id,debit,credit&account_code=in.(EMPLOYEE_CASH_CUSTODY,OFFICE_CASH,UPI_CLEARING,BANK)&order=id"),
        rest("gm_accounts_daily_closings?select=id,closing_date,expected_employee_total,counted_employee_total,expected_office_cash,counted_office_cash,expected_upi_clearing,expected_bank,employee_variance,office_variance,total_cash_variance,status,variance_status,note,submitted_by,submitted_at,approved_by,approved_at,dispute_reason&order=closing_date.desc&limit=60")
      ]).then(([lines,history])=>{
        const balances=new Map(); const totals={OFFICE_CASH:0,UPI_CLEARING:0,BANK:0};
        for(const line of lines){const amount=Number(line.debit||0)-Number(line.credit||0);if(line.account_code==="EMPLOYEE_CASH_CUSTODY"&&line.employee_id)balances.set(line.employee_id,(balances.get(line.employee_id)||0)+amount);else if(Object.prototype.hasOwnProperty.call(totals,line.account_code))totals[line.account_code]+=amount;}
        const names=new Map((config.employeeList?config.employeeList():[]).map(x=>[String(x.id),String(x.name||"Employee")]));
        const employees=Array.from(balances.entries()).filter(([,balance])=>Math.abs(balance)>0.0001).map(([id,balance])=>({employeeId:id,name:names.get(id)||"Employee",expectedBalance:Number(balance.toFixed(2))})).sort((a,b)=>a.name.localeCompare(b.name));
        send(res,200,{ok:true,employees,officeCash:Number(totals.OFFICE_CASH.toFixed(2)),upiClearing:Number(totals.UPI_CLEARING.toFixed(2)),bankBalance:Number(totals.BANK.toFixed(2)),history});
      }).catch(e=>{console.error("Daily closing read:",e.message);send(res,502,{error:"Unable to load daily closing balances."});});
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/daily-closing") {
      if (!canBill(session)) { send(res,403,{error:"Billing permission required."}); return true; }
      body(req,(err,input)=>{
        if(err)return send(res,400,{error:"Invalid daily closing request."});
        try{
          const date=String(input&&input.closingDate||"");
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))throw new Error("Choose a valid closing date.");
          const office=Number(input&&input.countedOfficeCash);
          if(!Number.isFinite(office)||office<0||office>10000000)throw new Error("Enter a valid physical office cash count.");
          const rows=input&&input.employeeCounts;
          if(!Array.isArray(rows)||rows.length>500)throw new Error("Invalid employee cash counts.");
          const seen=new Set();
          for(const row of rows){const id=String(row&&row.employeeId||"").trim(),amount=Number(row&&row.amount);if(!id||id.length>80||seen.has(id)||!Number.isFinite(amount)||amount<0||amount>10000000)throw new Error("Enter one valid count for each employee.");seen.add(id);}
          const key=String(input&&input.requestKey||"").trim();if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(key))throw new Error("Invalid closing request reference.");
          rpc("gm_accounts_create_daily_closing",{p_request_key:key,p_closing_date:date,p_counted_employee_balances:rows,p_counted_office_cash:office,p_note:String(input.note||"").slice(0,300),p_submitted_by:String(session.id)})
            .then(result=>send(res,201,result)).catch(e=>fail(res,e));
        }catch(e){send(res,400,{error:e.message});}
      },32768);
      return true;
    }

    const dailyClosingAction=/^\/api\/accounts\/daily-closing\/([0-9a-f-]{36})\/(approve|dispute)$/.exec(p);
    if(req.method==="POST"&&dailyClosingAction){
      if(!canBill(session)){send(res,403,{error:"Billing permission required."});return true;}
      if(dailyClosingAction[2]==="approve"){
        rpc("gm_accounts_approve_daily_closing",{p_closing_id:dailyClosingAction[1],p_approved_by:String(session.id)})
          .then(result=>send(res,200,result)).catch(e=>fail(res,e));
      }else{
        body(req,(err,input)=>{if(err)return send(res,400,{error:"Invalid dispute request."});const reason=String(input&&input.reason||"").trim();if(!reason||reason.length>300)return send(res,400,{error:"Enter a dispute reason (maximum 300 characters)."});
          rpc("gm_accounts_dispute_daily_closing",{p_closing_id:dailyClosingAction[1],p_disputed_by:String(session.id),p_reason:reason}).then(result=>send(res,200,result)).catch(e=>fail(res,e));
        },8192);
      }
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/office-cash") {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      Promise.all([
        restAll("gm_accounts_journal_lines?select=debit,credit&account_code=eq.OFFICE_CASH&order=id"),
        rest("gm_accounts_cash_movements?select=id,movement_type,from_employee_id,to_employee_id,amount,status,reference,note,recorded_by,recorded_at,confirmed_by,confirmed_at&movement_type=eq.office_receipt&order=recorded_at.desc&limit=200")
      ]).then(([lines,movements])=>{
        const balance=Number(lines.reduce((n,x)=>n+Number(x.debit||0)-Number(x.credit||0),0).toFixed(2));
        send(res,200,{ok:true,officeBalance:balance,movements});
      }).catch(e=>{console.error("Office cash read:",e.message);send(res,502,{error:"Unable to load office cash register."});});
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/office-deposits") {
      if (!canCollect(session)) { send(res,403,{error:"Cash deposit permission required."}); return true; }
      body(req,(err,input)=>{
        if(err)return send(res,400,{error:"Invalid office deposit request."});
        try {
          const amount=Number(input&&input.amount), rows=input&&input.denominations, allowed=[500,200,100,50,20,10];
          if(!Number.isFinite(amount)||amount<=0||amount>10000000)throw new Error("Enter a valid deposit amount.");
          if(!Array.isArray(rows)||rows.length!==6)throw new Error("Enter all six denomination counts.");
          const seen=new Set();let total=0;
          for(const row of rows){const d=Number(row&&row.denomination),n=Number(row&&row.pieceCount);if(!allowed.includes(d)||seen.has(d)||!Number.isSafeInteger(n)||n<0)throw new Error("Invalid denomination counts.");seen.add(d);total+=d*n;}
          if(seen.size!==6||Number(total.toFixed(2))!==Number(amount.toFixed(2)))throw new Error("Denomination total must equal the deposit amount.");
          const key=String(input.requestKey||"").trim();if(!/^[a-zA-Z0-9:_-]{12,100}$/.test(key))throw new Error("Invalid deposit reference.");
          return rpc("gm_accounts_create_office_deposit",{p_request_key:key,p_employee_id:String(session.id),p_amount:amount,p_denominations:rows,p_note:String(input.note||"").slice(0,300),p_recorded_by:String(session.id)})
            .then(result=>send(res,201,result)).catch(e=>fail(res,e));
        }catch(e){send(res,400,{error:e.message});}
      },16384);
      return true;
    }

    const officeDepositAction=/^\/api\/accounts\/office-deposits\/([0-9a-f-]{36})\/confirm$/.exec(p);
    if(req.method==="POST"&&officeDepositAction){
      if(!canBill(session)){send(res,403,{error:"Billing permission required."});return true;}
      rpc("gm_accounts_confirm_office_deposit",{p_movement_id:officeDepositAction[1],p_confirmed_by:String(session.id)})
        .then(result=>send(res,200,result)).catch(e=>fail(res,e));
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/cash-recipients") {
      if (!canCollect(session)) { send(res, 403, { error: "Cash handover permission required." }); return true; }
      const recipients = (config.employeeList ? config.employeeList() : []).filter(x => x && x.id && String(x.id) !== String(session.id) && x.active !== false).map(x => ({ id: String(x.id), name: String(x.name || "Employee").slice(0, 120) }));
      send(res, 200, { ok: true, employees: recipients });
      return true;
    }

    if (req.method === "GET" && p === "/api/accounts/cash-custody") {
      if (!canBill(session) && !canCollect(session)) { send(res, 403, { error: "Cash custody permission required." }); return true; }
      const ownOnly = !canBill(session);
      const employeeId = String(session.id);
      Promise.all([
        rest("gm_accounts_cash_movements?select=id,movement_type,method,from_employee_id,to_employee_id,amount,status,reference,note,recorded_by,recorded_at,confirmed_by,confirmed_at&or=(from_employee_id.eq." + encodeURIComponent(employeeId) + ",to_employee_id.eq." + encodeURIComponent(employeeId) + ")&order=recorded_at.desc&limit=100"),
        restAll("gm_accounts_journal_lines?select=employee_id,debit,credit&account_code=eq.EMPLOYEE_CASH_CUSTODY&order=id&employee_id=eq." + encodeURIComponent(employeeId))
      ]).then(([movements, ownLines]) => {
        const ownBalance = Number(ownLines.reduce((n, x) => n + Number(x.debit || 0) - Number(x.credit || 0), 0).toFixed(2));
        send(res, 200, { ok: true, employeeId, ownBalance, movements: movements.filter(x => !ownOnly || x.from_employee_id === employeeId || x.to_employee_id === employeeId) });
      }).catch(e => { console.error("Accounts cash custody read:", e.message); send(res, 502, { error: "Unable to load cash custody." }); });
      return true;
    }

    if (req.method === "POST" && p === "/api/accounts/cash-handover") {
      if (!canCollect(session)) { send(res, 403, { error: "Cash handover permission required." }); return true; }
      body(req, (err, input) => {
        if (err) return send(res, 400, { error: "Invalid handover request." });
        try {
          const recipientId = String(input && input.toEmployeeId || "").trim();
          const amount = Number(input && input.amount);
          const denominations = input && input.denominations;
          const allowedDenoms = [500, 200, 100, 50, 20, 10];
          if (!recipientId || recipientId.length > 80 || recipientId === String(session.id) || !employeeExists(recipientId)) throw new Error("Select a valid, active recipient employee.");
          if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new Error("Enter a valid handover amount.");
          if (!Array.isArray(denominations) || denominations.length !== allowedDenoms.length) throw new Error("Enter all six denomination counts.");
          const seen = new Set(); let total = 0;
          for (const row of denominations) {
            const d = Number(row && row.denomination), count = Number(row && row.pieceCount);
            if (!allowedDenoms.includes(d) || seen.has(d) || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid denomination counts.");
            seen.add(d); total += d * count;
          }
          if (seen.size !== 6 || Number(total.toFixed(2)) !== Number(amount.toFixed(2))) throw new Error("Denomination total must equal the handover amount.");
          const requestKey = String(input.requestKey || "").trim();
          if (!/^[a-zA-Z0-9:_-]{12,100}$/.test(requestKey)) throw new Error("Invalid handover request reference.");
          const note = String(input.note || "").slice(0, 300);
          return rpc("gm_accounts_create_cash_handover", {
            p_request_key: requestKey, p_from_employee_id: String(session.id), p_to_employee_id: recipientId,
            p_amount: amount, p_denominations: denominations, p_note: note, p_recorded_by: String(session.id)
          }).then(result => send(res, 201, result)).catch(e => fail(res, e));
        } catch (e) { send(res, 400, { error: e.message }); }
      }, 16384);
      return true;
    }

    const handoverAction = /^\/api\/accounts\/cash-handover\/([0-9a-f-]{36})\/(confirm|dispute)$/.exec(p);
    if (req.method === "POST" && handoverAction) {
      const movementId = handoverAction[1];
      if (!canCollect(session)) { send(res, 403, { error: "Cash handover permission required." }); return true; }
      if (handoverAction[2] === "confirm") {
        rpc("gm_accounts_confirm_cash_handover", { p_movement_id: movementId, p_confirmed_by: String(session.id) })
          .then(result => send(res, 200, result)).catch(e => fail(res, e));
      } else {
        body(req, (err, input) => {
          if (err) return send(res, 400, { error: "Invalid dispute request." });
          const reason = String(input && input.reason || "").trim();
          if (!reason || reason.length > 300) return send(res, 400, { error: "Enter a dispute reason (maximum 300 characters)." });
          rpc("gm_accounts_dispute_cash_handover", { p_movement_id: movementId, p_disputed_by: String(session.id), p_reason: reason })
            .then(result => send(res, 200, result)).catch(e => fail(res, e));
        }, 8192);
      }
      return true;
    }

    if (req.method === "POST" && /^\/api\/accounts\/collections\/[^/]+\/approve$/.test(p)) {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const id = p.split("/")[4];
      if (!/^[0-9a-f-]{36}$/i.test(id)) { send(res, 400, { error: "Invalid collection reference." }); return true; }
      rpc("gm_accounts_approve_collection", { p_collection_id: id, p_approved_by: String(session.id).slice(0, 80) })
        .then((result) => send(res, 200, result))
        .catch((e) => fail(res, e));
      return true;
    }
    if (req.method === "POST" && /^\/api\/accounts\/collections\/[^/]+\/reject$/.test(p)) {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const id = p.split("/")[4];
      if (!/^[0-9a-f-]{36}$/i.test(id)) { send(res, 400, { error: "Invalid collection reference." }); return true; }
      body(req, (err, b) => {
        const reason = !err && b && typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
        if (reason.length < 3) return send(res, 400, { error: "Enter a reason for rejecting this collection (at least 3 characters)." });
        rpc("gm_accounts_reject_collection", { p_collection_id: id, p_rejected_by: String(session.id).slice(0, 80), p_reason: reason })
          .then((result) => send(res, 200, result))
          .catch((e) => fail(res, e));
      }, 2048);
      return true;
    }
    if (req.method === "POST" && /^\/api\/accounts\/collections\/[^/]+\/request-correction$/.test(p)) {
      if (!canBill(session)) { send(res, 403, { error: "Billing permission required." }); return true; }
      const id = p.split("/")[4];
      if (!/^[0-9a-f-]{36}$/i.test(id)) { send(res, 400, { error: "Invalid collection reference." }); return true; }
      body(req, (err, b) => {
        const note = !err && b && typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
        if (note.length < 3) return send(res, 400, { error: "Tell the employee what to correct (at least 3 characters)." });
        rpc("gm_accounts_request_collection_correction", { p_collection_id: id, p_requested_by: String(session.id).slice(0, 80), p_note: note })
          .then((result) => send(res, 200, result))
          .catch((e) => fail(res, e));
      }, 2048);
      return true;
    }
    send(res, 404, { error: "Accounts endpoint not found." });
    return true;
  }
  return { handle };
}

module.exports = { createAccountsRoutes };