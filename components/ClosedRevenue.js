"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const sar = (n) => `SAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hours = (n) => `${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;

/**
 * Revenue from CLOSED work only (rejected and still-open claims are not counted), added up in the database by
 * closed_revenue(), which only answers dealer, admin and manager.
 *  - Revenue that came to each branch: the labor approved on its closed warranty claims plus the approved amount on its
 *    closed Free Service requests.
 *  - The dealer's revenue on warranty: the manufacturer pays the dealer 180 SAR per labor hour and the sub-dealer is
 *    paid 110 SAR per hour, so the dealer keeps 70 SAR for every hour done at the sub-dealer.
 * Lives in the sandwich menu's Revenue window.
 */
export default function ClosedRevenue() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("closed_revenue")
      .then(({ data, error }) => {
        if (alive) setRows(error ? [] : data || []);
      });
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
  return (
    <div>
      <div className="text-sm font-bold text-[#111111]">{title}</div>

      <Group label={`Revenue to ${title === "All branches" ? "the branches" : title}`}>
        <Stat label="Warranty claims" value={sar(r.warranty_total)} note={`${r.warranty_count} closed · 110 SAR per hour`} />
        <Stat label="Free Service" value={sar(r.free_service_total)} note={`${r.free_service_count} closed`} />
        <Stat label="Total revenue" value={sar(Number(r.warranty_total) + Number(r.free_service_total))} note={`${closed} closed`} strong />
      </Group>

      <Group label="Dealer revenue on warranty">
        <Stat label="Billed to the manufacturer" value={sar(r.manufacturer_total)} note={`${hours(r.warranty_hours)} × 180 SAR`} />
        <Stat label="Paid to the sub-dealer" value={sar(r.warranty_total)} note={`${hours(r.warranty_hours)} × 110 SAR`} />
        <Stat label="Dealer revenue" value={sar(r.dealer_revenue)} note={`${hours(r.warranty_hours)} × 70 SAR`} strong />
      </Group>
    </div>
  );
}

function Group({ label, children }) {
  return (
    <div className="mt-2.5">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">{label}</div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</dl>
    </div>
  );
}

function Stat({ label, value, note, strong }) {
  return (
    <div className={`rounded-md px-3 py-2 ${strong ? "bg-[#E5F3E8]" : "bg-[#F7F7F7]"}`}>
      <dt className="text-[0.6875rem] font-bold text-[#6E6E6E]">{label}</dt>
      <dd className={`font-mono font-bold ${strong ? "text-[#1E6B35] text-base" : "text-[#111111] text-sm"}`}>{value}</dd>
      <div className="text-[0.6875rem] text-[#6E6E6E]">{note}</div>
    </div>
  );
}
