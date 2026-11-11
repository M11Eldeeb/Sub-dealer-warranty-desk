// Shared by the "Export data" button (browser) and the live Google Sheet (server): turns claims and Free Service
// requests into spreadsheet rows, so both always show exactly the same columns.

const STAMP = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const stamp = (iso) => (iso ? STAMP.format(new Date(iso)) : "");

function summarizeParts(parts) {
  if (!parts || parts.length === 0) return "";
  return parts.map((p) => `${p.name}${p.part_number ? ` (${p.part_number})` : ""} x${p.qty} [${p.status}]`).join("; ");
}

function summarizeLabor(labor) {
  if (!labor || labor.length === 0) return "";
  return labor.map((l) => `${l.labor_code ? `${l.labor_code}: ` : ""}${l.labor_name}`).join("; ");
}

/** "2/3" when some defective parts are back at the dealer, "Yes" for a claim without parts marked arrived, "" otherwise. */
function defectedArrived(c) {
  const total = (c.claim_parts || []).length;
  if (!total) return c.defected_part_arrived ? "Yes" : "";
  const got = c.defected_part_arrived ? total : c.claim_parts.filter((p) => p.defected_arrived_at).length;
  return `${got}/${total}`;
}

export const CLAIMS_SELECT = "*, branches(name), claim_parts(*), claim_labor(*)";
export const FREE_SERVICE_SELECT = "*, branches(name)";

export const CLAIM_COLUMN_WIDTHS = [14, 14, 22, 19, 19, 12, 12, 16, 20, 18, 18, 14, 34, 34, 34, 40, 30, 24, 30]; // one per column of claimRows, in order
export const FREE_SERVICE_COLUMN_WIDTHS = [16, 22, 19, 19, 12, 12, 20, 18, 40, 16, 18, 18, 30];

export function claimRows(claims) {
  return claims.map((c) => ({
    "Warranty Claim ID": c.claim_number,
    "Status": c.status,
    "Defected parts arrived": defectedArrived(c),
    "Branch": c.branches?.name || "",
    "VIN": c.vin,
    "Mileage (km)": c.mileage ?? "",
    "Plate": c.plate,
    "Vehicle Model": c.vehicle_model || "",
    "Work Order (Sub-Dealer)": c.work_order_number || "",
    "Work Order (Dealer)": c.dealer_work_order_number || "",
    "Creation Date": stamp(c.created_at),
    "Reception Date": c.reception_date || "",
    "Customer Complaint": c.customer_complaint || "",
    "Cause of Defect": c.cause_of_defect || "",
    "Correction": c.correction || "",
    "Parts": summarizeParts(c.claim_parts),
    "Labor": summarizeLabor(c.claim_labor),
    "Labor Approved (SAR, VAT incl.)": c.labor_amount ?? "",
    "Comment": c.comment || "",
  }));
}

export function freeServiceRows(rows) {
  return rows.map((r) => ({
    "Free Service ID": r.claim_number,
    "Status": r.status,
    "Branch": r.branches?.name || "",
    "VIN": r.vin,
    "Mileage (km)": r.mileage ?? "",
    "Plate": r.plate || "",
    "Work Order (Sub-Dealer)": r.work_order_number || "",
    "Work Order (Dealer)": r.dealer_work_order_number || "",
    "Service Requested": r.service_requested || "",
    "Approved Amount": r.approved_amount ?? "",
    "Creation Date": stamp(r.created_at),
    "Last Updated": stamp(r.updated_at),
    "Comment": r.comment || "",
  }));
}

/** A sheet from rows. With no rows it still shows the column headings, so the tab is never blank. */
export function sheetFrom(XLSX, rows, headings, widths) {
  const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([headings]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

export const CLAIM_HEADINGS = Object.keys(claimRows([{ claim_parts: [], claim_labor: [] }])[0]);
export const FREE_SERVICE_HEADINGS = Object.keys(freeServiceRows([{}])[0]);

/** The whole workbook: a Claims sheet and a Free Service sheet. */
export function buildWorkbook(XLSX, { claims, freeService }) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheetFrom(XLSX, claimRows(claims), CLAIM_HEADINGS, CLAIM_COLUMN_WIDTHS), "Claims");
  XLSX.utils.book_append_sheet(workbook, sheetFrom(XLSX, freeServiceRows(freeService), FREE_SERVICE_HEADINGS, FREE_SERVICE_COLUMN_WIDTHS), "Free Service");
  return workbook;
}
