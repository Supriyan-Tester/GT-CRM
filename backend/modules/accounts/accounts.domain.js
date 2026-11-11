"use strict";

// Financial values are represented as integer paise inside the domain layer.
// Do not use binary floating-point arithmetic for posting calculations.
const MAX_AMOUNT_PAISE = 999999999999;

function toPaise(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error((label || "Amount") + " must be a non-negative number.");
  const paise = Math.round((n + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(paise) || paise > MAX_AMOUNT_PAISE)
    throw new Error((label || "Amount") + " is outside the supported range.");
  return paise;
}

function fromPaise(paise) {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error("Invalid paise amount.");
  return Number((paise / 100).toFixed(2));
}

function normalizeInvoiceReference(value) {
  const ref = String(value || "").trim();
  if (!ref || ref.length > 80) throw new Error("Enter a valid invoice number (maximum 80 characters).");
  return ref;
}

function validateOpeningInvoice(input) {
  if (!input || typeof input !== "object") throw new Error("Opening invoice details are required.");
  const customerCode = String(input.customerCode || "").trim();
  if (!customerCode || customerCode.length > 80) throw new Error("Choose a valid customer.");
  const invoiceNo = normalizeInvoiceReference(input.invoiceNo);
  const invoiceDate = String(input.invoiceDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || Number.isNaN(Date.parse(invoiceDate + "T00:00:00Z")) || new Date(invoiceDate + "T00:00:00Z").toISOString().slice(0, 10) !== invoiceDate)
    throw new Error("Enter a valid invoice date.");
  const originalPaise = toPaise(input.originalAmount, "Original invoice amount");
  const outstandingPaise = toPaise(input.outstandingAmount, "Outstanding amount");
  if (originalPaise <= 0) throw new Error("Original invoice amount must be greater than zero.");
  if (outstandingPaise <= 0) throw new Error("Outstanding amount must be greater than zero.");
  if (outstandingPaise > originalPaise) throw new Error("Outstanding amount cannot exceed the original invoice amount.");
  const evidencePath = String(input.evidencePath || "").trim();
  if (!evidencePath || evidencePath.length > 240 || evidencePath.startsWith("/") || evidencePath.includes(".."))
    throw new Error("A valid bill-photo evidence reference is required.");
  return {
    customerCode, invoiceNo, invoiceDate,
    originalAmount: fromPaise(originalPaise),
    openingOutstanding: fromPaise(outstandingPaise),
    evidencePath, sourceKind: "opening",
  };
}

function validateCollection(input, invoiceBalances) {
  if (!input || typeof input !== "object") throw new Error("Collection details are required.");
  const customerCode = String(input.customerCode || "").trim();
  if (!customerCode) throw new Error("Choose a customer.");
  const method = String(input.method || "");
  if (!["cash", "upi", "bank_transfer"].includes(method)) throw new Error("Choose Cash, UPI or Bank Transfer.");
  if (!Array.isArray(input.allocations) || !input.allocations.length)
    throw new Error("Allocate the collection to at least one invoice.");
  const seen = new Set();
  let totalPaise = 0;
  const allocations = input.allocations.map((row) => {
    const invoiceId = String((row && row.invoiceId) || "").trim();
    if (!invoiceId || seen.has(invoiceId)) throw new Error("Each invoice can appear only once in a collection.");
    seen.add(invoiceId);
    const amountPaise = toPaise(row.amount, "Allocation amount");
    if (amountPaise <= 0) throw new Error("Each invoice allocation must be greater than zero.");
    const evidencePath = String(row.evidencePath || "").trim();
    if (!evidencePath || evidencePath.length > 240 || evidencePath.startsWith("/") || evidencePath.includes(".."))
      throw new Error("Every invoice allocation requires its own bill-photo evidence.");
    const invoice = invoiceBalances && invoiceBalances[invoiceId];
    if (!invoice || invoice.customerCode !== customerCode) throw new Error("An allocated invoice does not belong to this customer.");
    const duePaise = toPaise(invoice.outstandingAmount, "Invoice outstanding");
    if (amountPaise > duePaise) throw new Error("An allocation cannot exceed the invoice outstanding amount.");
    totalPaise += amountPaise;
    if (!Number.isSafeInteger(totalPaise) || totalPaise > MAX_AMOUNT_PAISE) throw new Error("Collection total is outside the supported range.");
    return { invoiceId, amount: fromPaise(amountPaise), evidencePath };
  });
  if (input.total != null && toPaise(input.total, "Collection total") !== totalPaise)
    throw new Error("Collection total must equal the sum of invoice allocations.");
  const requestKey = String(input.requestKey || "").trim();
  if (!requestKey || requestKey.length > 100) throw new Error("A valid collection request reference is required.");
  return {
    customerCode, method, total: fromPaise(totalPaise), allocations,
    requestKey,
    note: String(input.note || "").trim().slice(0, 300),
  };
}

function buildCollectionJournal(collection) {
  const amount = toPaise(collection.total, "Collection total");
  if (amount <= 0) throw new Error("Collection total must be greater than zero.");
  const debitAccount = collection.method === "cash" ? "EMPLOYEE_CASH_CUSTODY" :
    collection.method === "upi" ? "UPI_CLEARING" : "BANK";
  return [
    { accountCode: debitAccount, debit: fromPaise(amount), credit: 0 },
    { accountCode: "CUSTOMER_RECEIVABLE", debit: 0, credit: fromPaise(amount) },
  ];
}

function assertBalanced(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("A journal entry requires at least two lines.");
  let debit = 0, credit = 0;
  for (const line of lines) {
    const d = toPaise(line.debit, "Debit"), c = toPaise(line.credit, "Credit");
    if ((d > 0) === (c > 0)) throw new Error("Each journal line must contain either a debit or a credit, not both.");
    debit += d; credit += c;
  }
  if (debit !== credit || debit <= 0) throw new Error("Journal entry is not balanced.");
  return { debit: fromPaise(debit), credit: fromPaise(credit) };
}

// Customer statement: every invoice is a debit (its initial outstanding), every approved
// allocation is a credit. Totals are kept in integer paise, like the rest of this module.
function buildStatement(input) {
  const invoices = (input && input.invoices) || [], allocations = (input && input.allocations) || [], collections = (input && input.collections) || [];
  const from = input && input.from || "", to = input && input.to || "";
  const IST = 5.5 * 3600e3;
  const istDate = (t) => new Date(new Date(t).getTime() + IST).toISOString().slice(0, 10);
  const invById = new Map(invoices.map((x) => [x.id, x]));
  const colById = new Map(collections.filter((x) => x.status === "approved").map((x) => [x.id, x]));
  const entries = [];
  for (const inv of invoices)
    entries.push({ date: String(inv.invoice_date), order: 0, type: "invoice", ref: inv.invoice_no, detail: inv.source_kind === "opening" ? "Opening balance" : "Invoice", debit: toPaise(inv.initial_outstanding), credit: 0, at: inv.created_at || "" });
  for (const a of allocations) {
    const col = colById.get(a.collection_id), inv = invById.get(a.invoice_id);
    if (!col || !inv) continue;
    const method = col.method === "upi" ? "UPI" : col.method === "bank_transfer" ? "Bank transfer" : "Cash";
    entries.push({ date: istDate(col.approved_at || col.received_at), order: 1, type: "payment", ref: inv.invoice_no, detail: "Payment received (" + method + ")", debit: 0, credit: toPaise(a.amount), at: col.approved_at || col.received_at || "" });
  }
  entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order || String(a.at).localeCompare(String(b.at)));
  let balance = 0, opening = 0, totalDebit = 0, totalCredit = 0;
  const rows = [];
  for (const e of entries) {
    const before = from && e.date < from, after = to && e.date > to;
    if (after) continue;
    balance += e.debit - e.credit;
    if (before) { opening = balance; continue; }
    totalDebit += e.debit; totalCredit += e.credit;
    rows.push({ date: e.date, type: e.type, ref: e.ref, detail: e.detail, debit: e.debit ? e.debit / 100 : 0, credit: e.credit ? e.credit / 100 : 0, balance: balance / 100 });
  }
  return { openingBalance: opening / 100, totalDebit: totalDebit / 100, totalCredit: totalCredit / 100, closingBalance: balance / 100, rows };
}

const METHOD_LABEL = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer" };
const IST_MS = 5.5 * 3600e3;
const istDay = (t) => new Date(new Date(t).getTime() + IST_MS).toISOString().slice(0, 10);

// Collection + employee collection reports: approved collections only, dated by approval day (IST), like the statement.
function buildCollectionReport(input) {
  const collections = ((input && input.collections) || []).filter((x) => x.status === "approved");
  const byMethod = { cash: 0, upi: 0, bank_transfer: 0 }, byEmployee = new Map();
  let total = 0;
  const rows = collections.map((c) => {
    const paise = toPaise(c.total_amount);
    total += paise;
    if (byMethod[c.method] !== undefined) byMethod[c.method] += paise;
    const key = String(c.collected_by);
    const e = byEmployee.get(key) || { id: key, name: c.collector_name_snapshot || key, count: 0, cash: 0, upi: 0, bank_transfer: 0, total: 0 };
    e.count += 1; e.total += paise;
    if (e[c.method] !== undefined) e[c.method] += paise;
    byEmployee.set(key, e);
    return { id: c.id, date: istDay(c.approved_at || c.received_at), customer: c.customer_name_snapshot, customerCode: c.customer_code, collector: c.collector_name_snapshot, method: METHOD_LABEL[c.method] || c.method, amount: paise / 100 };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const p = (n) => n / 100;
  return {
    count: rows.length, total: p(total),
    byMethod: { cash: p(byMethod.cash), upi: p(byMethod.upi), bankTransfer: p(byMethod.bank_transfer) },
    byEmployee: Array.from(byEmployee.values()).sort((a, b) => b.total - a.total).map((e) => ({ id: e.id, name: e.name, count: e.count, cash: p(e.cash), upi: p(e.upi), bankTransfer: p(e.bank_transfer), total: p(e.total) })),
    rows,
  };
}

// Outstanding report: invoice outstanding = initial outstanding - approved allocations, summed per customer.
// Pending and rejected collections do not reduce it (same rule as the ledger and the statement).
function buildOutstandingReport(input) {
  const invoices = (input && input.invoices) || [], allocations = (input && input.allocations) || [];
  const approvedIds = new Set(((input && input.approvedCollectionIds) || []).map(String));
  const today = (input && input.today) || istDay(Date.now());
  const paid = new Map();
  for (const a of allocations) if (approvedIds.has(String(a.collection_id))) paid.set(a.invoice_id, (paid.get(a.invoice_id) || 0) + toPaise(a.amount));
  const byCustomer = new Map();
  for (const inv of invoices) {
    const due = toPaise(inv.initial_outstanding) - (paid.get(inv.id) || 0);
    if (due <= 0) continue;
    const c = byCustomer.get(inv.customer_code) || { code: inv.customer_code, name: inv.customer_name_snapshot, invoices: 0, outstanding: 0, oldest: String(inv.invoice_date) };
    c.invoices += 1; c.outstanding += due;
    if (String(inv.invoice_date) < c.oldest) c.oldest = String(inv.invoice_date);
    byCustomer.set(inv.customer_code, c);
  }
  const days = (d) => Math.max(0, Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86400000));
  const rows = Array.from(byCustomer.values()).sort((a, b) => b.outstanding - a.outstanding)
    .map((c) => ({ code: c.code, name: c.name, invoices: c.invoices, outstanding: c.outstanding / 100, oldestInvoiceDate: c.oldest, oldestDays: days(c.oldest) }));
  return { asOf: today, customers: rows.length, invoices: rows.reduce((n, r) => n + r.invoices, 0), total: Array.from(byCustomer.values()).reduce((n, c) => n + c.outstanding, 0) / 100, rows };
}

// Cash handover report: employee-to-employee handovers and office deposits, by the day they were recorded (IST).
// "recorded" means the receiver has not confirmed yet.
const MOVE_STATUS = { recorded: "Awaiting confirmation", confirmed: "Confirmed", disputed: "Disputed", reversed: "Reversed" };
function buildHandoverReport(input) {
  const movements = ((input && input.movements) || []).filter((m) => m.movement_type === "handover" || m.movement_type === "office_receipt");
  const names = (input && input.names) || {};
  const who = (id) => (id ? names[String(id)] || String(id) : "");
  const totals = { recorded: 0, confirmed: 0, disputed: 0, reversed: 0 }, counts = { recorded: 0, confirmed: 0, disputed: 0, reversed: 0 };
  let total = 0;
  const rows = movements.map((m) => {
    const paise = toPaise(m.amount);
    total += paise;
    if (totals[m.status] !== undefined) { totals[m.status] += paise; counts[m.status] += 1; }
    return {
      date: istDay(m.recorded_at), type: m.movement_type === "office_receipt" ? "Office deposit" : "Handover",
      from: who(m.from_employee_id), to: m.movement_type === "office_receipt" ? "Office" : who(m.to_employee_id),
      amount: paise / 100, status: MOVE_STATUS[m.status] || m.status, confirmedBy: who(m.confirmed_by),
    };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const p = (n) => n / 100;
  return {
    count: rows.length, total: p(total),
    awaiting: { count: counts.recorded, amount: p(totals.recorded) }, confirmed: { count: counts.confirmed, amount: p(totals.confirmed) },
    disputed: { count: counts.disputed, amount: p(totals.disputed) }, reversed: { count: counts.reversed, amount: p(totals.reversed) },
    rows,
  };
}

// Split payment: one visit, several invoices, paid by more than one method. The employee gives the invoice amounts and
// the amount paid by each method; the invoices are filled in the order given, first by the first method, then by the
// next (so an invoice can be paid partly by two methods). Each method becomes its own collection, linked by one request key.
const SPLIT_METHODS = ["cash", "upi", "bank_transfer"];
function validateSplitCollection(input, invoiceBalances) {
  if (!input || typeof input !== "object") throw new Error("Collection details are required.");
  const payments = Array.isArray(input.payments) ? input.payments : [];
  if (payments.length < 2 || payments.length > 3) throw new Error("A split payment needs two or three payment methods.");
  const seenMethods = new Set();
  const pay = payments.map((x) => {
    const method = String((x && x.method) || "");
    if (!SPLIT_METHODS.includes(method)) throw new Error("Choose Cash, UPI or Bank Transfer.");
    if (seenMethods.has(method)) throw new Error("Each payment method can appear only once.");
    seenMethods.add(method);
    const paise = toPaise(x.amount, "Payment amount");
    if (paise <= 0) throw new Error("Each payment amount must be greater than zero.");
    return { method, paise };
  });
  const requestKey = String(input.requestKey || "").trim();
  if (!requestKey || requestKey.length > 90) throw new Error("A valid collection request reference is required.");
  const base = validateCollection({ customerCode: input.customerCode, method: pay[0].method, allocations: input.allocations, requestKey, note: input.note }, invoiceBalances);
  const totalPaise = toPaise(base.total, "Collection total");
  const paidPaise = pay.reduce((n, x) => n + x.paise, 0);
  if (paidPaise !== totalPaise) throw new Error("The payment amounts must add up to the invoice total.");
  const queue = base.allocations.map((a) => ({ invoiceId: a.invoiceId, left: toPaise(a.amount, "Allocation amount"), evidencePath: a.evidencePath }));
  let qi = 0;
  const parts = pay.map((x) => {
    let need = x.paise;
    const allocations = [];
    while (need > 0) {
      const a = queue[qi], take = Math.min(need, a.left);
      allocations.push({ invoiceId: a.invoiceId, amount: fromPaise(take), evidencePath: a.evidencePath });
      a.left -= take; need -= take;
      if (a.left === 0) qi += 1;
    }
    return { method: x.method, total: fromPaise(x.paise), allocations };
  });
  return { customerCode: base.customerCode, requestKey, note: base.note, total: base.total, parts };
}

module.exports = { validateSplitCollection, buildHandoverReport, buildCollectionReport, buildOutstandingReport, buildStatement, toPaise, fromPaise, validateOpeningInvoice, validateCollection, buildCollectionJournal, assertBalanced };