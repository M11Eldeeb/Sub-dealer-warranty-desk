"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const sar = (n) => `SAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hours = (n) => `${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;

/**
 * Revenue from CLOSED work only (rejected and still-open claims are not counted), from /api/revenue (dealer, admin and
 * manager only).
 *  - Revenue to each branch: the labor approved on its closed warranty claims plus the approved amount on its closed
 *    Free Service requests.
 *  - Dealer revenue: warranty labor (the manufacturer pays the dealer 180 SAR per hour, the sub-dealer gets 110 SAR, so the
 *    dealer keeps 70 SAR per hour) + warranty parts (from the claims batch or the invoiced parts lines, matched on GWS claim
 *    ID, work order and VIN) + Free Service (invoiced to account I660 minus the amount approved to the sub-dealer).
 * Lives in the sandwich menu's Revenue window.
 */
export default function ClosedRevenue() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/revenue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => alive && setRows(d.rows || []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!rows)
    return (
      <div className="flex items-center gap-2 text-sm text-[#6E6E6E] py-4" role="status">
        <Loader2 size={15} className="animate-spin" /> Adding up…
      </div>
    );
  if (rows.length === 0) return <p className="text-sm text-[#6E6E6E] py-2">Nothing has been closed yet.</p>;

  const total = (key) => rows.reduce((sum, r) => sum + Number(r[key] || 0), 0);
  const known = (key) => rows.every((r) => r[key] != null);

  return (
    <div>
      <p className="text-xs text-[#6E6E6E]">Closed claims only, no rejected or pending ones. Amounts include VAT.</p>
      <div className="mt-3 space-y-5">
        {rows.map((r) => (
          <Branch key={r.branch_id} title={r.branch_name} r={r} />
        ))}
        {rows.length > 1 && (
          <div className="pt-5 border-t border-[#EEEEEE]">
            <Branch
              title="All branches"
              r={{
                warranty_total: total("warranty_total"),
                warranty_count: total("warranty_count"),
                free_service_total: total("free_service_total"),
                free_service_count: total("free_service_count"),
                warranty_hours: total("warranty_hours"),
                manufacturer_total: total("manufacturer_total"),
                dealer_revenue: total("dealer_revenue"),
                parts_revenue: known("parts_revenue") ? total("parts_revenue") : null,
                parts_matched: total("parts_matched"),
                fs_invoiced: known("fs_invoiced") ? total("fs_invoiced") : null,
                fs_approved_invoiced: total("fs_approved_invoiced"),
                fs_revenue: known("fs_revenue") ? total("fs_revenue") : null,
                fs_invoiced_count: total("fs_invoiced_count"),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Branch({ title, r }) {
  const closed = Number(r.warranty_count) + Number(r.free_service_count);
  const dealerTotal = Number(r.dealer_revenue || 0) + Number(r.parts_revenue || 0) + Number(r.fs_revenue || 0);
  const missing = r.parts_revenue == null || r.fs_revenue == null; // the self-audit system could not be reached

  return (
    <div>
      <div className="text-sm font-bold text-[#111111]">{title}</div>

      <Group label={`Revenue to ${title === "All branches" ? "the branches" : title}`} cols="sm:grid-cols-3">
        <Stat label="Warranty claims" value={sar(r.warranty_total)} note={`${r.warranty_count} closed · 110 SAR per hour`} />
        <Stat label="Free Service" value={sar(r.free_service_total)} note={`${r.free_service_count} closed`} />
        <Stat label="Total revenue" value={sar(Number(r.warranty_total) + Number(r.free_service_total))} note={`${closed} closed`} strong />
      </Group>

      <Group label="Dealer revenue" cols="sm:grid-cols-4">
        <Stat label="Warranty labor" value={sar(r.dealer_revenue)} note={`${hours(r.warranty_hours)} × 70 SAR`} />
        <Stat
          label="Warranty parts"
          value={r.parts_revenue == null ? "Not available" : sar(r.parts_revenue)}
          note={r.parts_revenue == null ? "Self-audit system not reachable" : `${r.parts_matched} of ${r.warranty_count} claims matched`}
        />
        <Stat
          label="Free Service"
          value={r.fs_revenue == null ? "Not available" : sar(r.fs_revenue)}
          note={r.fs_revenue == null ? "Self-audit system not reachable" : `${r.fs_invoiced_count} of ${r.free_service_count} invoiced`}
        />
        <Stat label="Total dealer revenue" value={sar(dealerTotal)} note={missing ? "without the figures not available" : "labor + parts + Free Service"} strong />
      </Group>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-[#6E6E6E]">
        Labor: billed to the manufacturer {sar(r.manufacturer_total)} ({hours(r.warranty_hours)} × 180) minus {sar(r.warranty_total)} paid to the sub-dealer ({hours(r.warranty_hours)} × 110).
        {r.parts_revenue != null && (
          <>
            {" "}
            Parts: from the claims batch{r.parts_from_invoice > 0 ? ` (${r.parts_from_invoice} from the invoiced lines under account W40)` : ""}, only claims whose GWS claim ID, work order and VIN all match; the parts cost is not deducted.
          </>
        )}
        {r.fs_revenue != null && (
          <>
            {" "}
            Free Service: {sar(r.fs_invoiced)} invoiced to account I660 minus {sar(r.fs_approved_invoiced)} approved to the sub-dealer, for the {r.fs_invoiced_count} invoiced request{r.fs_invoiced_count === 1 ? "" : "s"}.
          </>
        )}
      </p>
    </div>
  );
}

function Group({ label, cols, children }) {
  return (
    <div className="mt-2.5">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">{label}</div>
      <dl className={`grid grid-cols-1 ${cols} gap-3`}>{children}</dl>
    </div>
  );
}

function Stat({ label, value, note, strong }) {
  return (
    <div className={`rounded-md px-3 py-2 ${strong ? "bg-[#E5F3E8]" : "bg-[#F7F7F7]"}`}>
      <dt className="text-[0.6875rem] font-bold text-[#6E6E6E]">{label}</dt>
      <dd className={`font-mono font-bold break-words ${strong ? "text-[#1E6B35] text-base" : "text-[#111111] text-sm"}`}>{value}</dd>
      <div className="text-[0.6875rem] text-[#6E6E6E]">{note}</div>
    </div>
  );
}
