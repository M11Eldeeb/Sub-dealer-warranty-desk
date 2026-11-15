// Sub-dealer bill: which closed claims go on it, the Excel memo, and reading a bill sheet back to mark claims as invoiced.
// Pure functions (no browser or server access), so the page and the tests share them.

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** What the sub-dealer is paid for a closed claim: the labor approved on a warranty claim, the approved amount on Free Service. */
export const amountOf = (c) => {
  const v = c.kind === "free_service" ? c.approved_amount : c.labor_amount;
  return v == null ? null : round2(v);
};

/**
 * The GRN number of a claim: the sub-dealer's work order number, then the dealer's work order (no -1 / -2 suffix on either,
 * those only say a work order has more than one claim). NAG-5243-1 + HER-42346-1 -> "5243-HER-42346".
 */
export function grnOf(c) {
  const sub = /^[A-Za-z]+-(\d+)/.exec(c.work_order_number || "")?.[1];
  const dealer = /^([A-Za-z]+-\d+)/.exec(c.dealer_work_order_number || "")?.[1];
  return sub && dealer ? `${sub}-${dealer.toUpperCase()}` : null;
}

/** "5243-HER-42346", "NAG-5243-HER-42346", "5243 - her-42346 -1" -> "5243-HER-42346" (null when it is not a GRN). */
export function parseGrn(text) {
  const m = /(\d{2,})\s*-\s*([A-Za-z]{2,4})\s*-\s*(\d+)/.exec(String(text ?? ""));
  return m ? `${m[1]}-${m[2].toUpperCase()}-${m[3]}` : null;
}

/** The date a claim was closed (Free Service has no closed date of its own: it is when it was last updated). */
export const closedOn = (c) => c.closed_at || c.updated_at || null;

// ---- the Excel bill ------------------------------------------------------------------------------------------------------

const SAUDI_OFFSET_MS = 3 * 60 * 60 * 1000;
const excelDate = (iso) => (iso ? (Date.parse(iso) + SAUDI_OFFSET_MS) / 86400000 + 25569 : null);
const dmy = (date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);

/**
 * items: [{ grn, claimNumber, kind, branchName, amount, closed (ISO), invoiceNo? }] in the order wanted.
 * One sheet: a memo heading, then Ser. / Invoice No. / Date / GRN NO. / Claim / Type / Branch / Amount, then the total in
 * SAR (VAT included) under the table.
 */
export function buildBillWorkbook(XLSX, items, { today = new Date() } = {}) {
  const branches = [...new Set(items.map((i) => i.branchName).filter(Boolean))];
  const who = branches.length === 1 ? branches[0] : "the sub-dealers";
  const header = ["Ser.", "Invoice No.", "Date", "GRN NO.", "Claim", "Type", "Branch", "Amount (SAR, VAT incl.)"];
  const FIRST = 7; // zero-based row of the first claim: heading rows, a blank, then the table header
  const rows = [
    ["Internal Memo"],
    ["Date:", dmy(today)],
    ["Subject:", `Payment to ${who} for closed warranty claims and Free Service`],
    [],
    [`Referring to the above, please process payment to ${who} as per the details below:`],
    [],
    header,
    ...items.map((it, i) => [i + 1, it.invoiceNo || "", excelDate(it.closed), it.grn || "", it.claimNumber, it.kind === "free_service" ? "Free Service" : "Warranty", it.branchName || "", round2(it.amount)]),
  ];
  const totalRow = FIRST + items.length;
  rows.push(["Total Amount"]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  items.forEach((it, i) => {
    const r = FIRST + i;
    const date = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    if (date && typeof date.v === "number") date.z = "dd/mm/yyyy";
    else if (date) delete sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    const amount = sheet[XLSX.utils.encode_cell({ r, c: 7 })];
    if (amount) amount.z = "#,##0.00";
  });
  const totalCents = items.reduce((sum, it) => sum + Math.round(Number(it.amount) * 100), 0);
  sheet[XLSX.utils.encode_cell({ r: totalRow, c: 7 })] = {
    t: "n",
    f: items.length ? `SUM(H${FIRST + 1}:H${FIRST + items.length})` : "0",
    v: totalCents / 100,
    z: "#,##0.00",
  };
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow, c: 7 } });
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
    { s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 6 } },
  ];
  sheet["!cols"] = [6, 14, 12, 22, 12, 13, 20, 24].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Payment bill");
  return { book, total: totalCents / 100 };
}

// ---- reading a bill sheet back -------------------------------------------------------------------------------------------

function isoFromCell(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Reads the rows of a bill sheet: finds the header row (one cell says GRN, another says Amount), then reads every row under
 * it until the Total line. Returns { rows: [{ line, grn, amount, invoiceNo, date }] } or { error }.
 */
export function readBillSheet(XLSX, data) {
  let book;
  try {
    book = XLSX.read(data, { type: "array", cellDates: true });
  } catch {
    return { error: "That file could not be read as an Excel sheet." };
  }
  for (const name of book.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: "" });
    const h = grid.findIndex((row) => row.some((c) => /^\s*grn/i.test(String(c))) && row.some((c) => /amount/i.test(String(c))));
    if (h < 0) continue;
    const head = grid[h].map((c) => String(c));
    const col = (re) => head.findIndex((c) => re.test(c));
    const grnCol = col(/^\s*grn/i);
    const amountCol = col(/amount/i);
    const invoiceCol = col(/invoice/i);
    const dateCol = col(/^\s*date/i);
    const rows = [];
    for (let i = h + 1; i < grid.length; i++) {
      const row = grid[i];
      if (row.some((c) => /^\s*total/i.test(String(c)))) break;
      const grnText = String(row[grnCol] ?? "").trim();
      const amount = Number(String(row[amountCol] ?? "").replace(/,/g, ""));
      if (!grnText && !row[amountCol]) continue;
      rows.push({
        line: i + 1,
        grnText,
        grn: parseGrn(grnText),
        amount: Number.isFinite(amount) ? round2(amount) : null,
        invoiceNo: invoiceCol >= 0 ? String(row[invoiceCol] ?? "").trim() : "",
        date: dateCol >= 0 ? isoFromCell(row[dateCol]) : null,
      });
    }
    return { rows };
  }
  return { error: "No table with a GRN column and an Amount column was found in that file." };
}

/**
 * Pairs each sheet row with a closed claim by GRN. When several claims share a GRN (a work order with more than one claim)
 * the rows are paired by the closest amount. claims: every closed claim { id, grn, amount, sub_invoiced_at, ... }.
 * Each result: { row, claim, status: "ok" | "already" | "no_grn" | "not_found" | "extra", diff }.
 */
export function matchBillRows(rows, claims) {
  const byGrn = new Map();
  for (const c of claims) {
    const g = grnOf(c);
    if (g) (byGrn.get(g) || byGrn.set(g, []).get(g)).push(c);
  }
  const results = rows.map((row) => ({ row, claim: null, status: row.grn ? "not_found" : "no_grn", diff: null }));

  const groups = new Map();
  results.forEach((res, i) => {
    if (res.row.grn && byGrn.has(res.row.grn)) (groups.get(res.row.grn) || groups.set(res.row.grn, []).get(res.row.grn)).push(i);
  });
  for (const [grn, indexes] of groups) {
    const pool = [...byGrn.get(grn)];
    // closest amounts first, so 76.99 pairs with the 77 claim and 32.99 with the 33 one
    const pairs = [];
    for (const i of indexes) for (const c of pool) pairs.push({ i, c, d: Math.abs((results[i].row.amount ?? 0) - (amountOf(c) ?? 0)) });
    pairs.sort((a, b) => a.d - b.d);
    const usedRows = new Set();
    const usedClaims = new Set();
    for (const p of pairs) {
      if (usedRows.has(p.i) || usedClaims.has(p.c.id)) continue;
      usedRows.add(p.i);
      usedClaims.add(p.c.id);
      const res = results[p.i];
      res.claim = p.c;
      res.diff = res.row.amount == null || amountOf(p.c) == null ? null : round2(res.row.amount - amountOf(p.c));
      res.status = p.c.sub_invoiced_at ? "already" : "ok";
    }
    for (const i of indexes) if (!usedRows.has(i)) results[i].status = "extra"; // more rows than claims on this GRN
  }
  return results;
}
