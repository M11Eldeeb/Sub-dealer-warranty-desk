"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const sar = (n) => `SAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Revenue that came to a branch from CLOSED work only: the labor approved on closed warranty claims plus the approved
 * amount on closed Free Service requests. Rejected and still-open ones are not counted. Shown to dealer, admin and
 * manager (the database refuses everyone else), one block per branch plus the total of all branches. The numbers are
 * added up in the database (closed_revenue()), so they are right however many claims there are.
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
      <div className="mt-3 space-y-4">
        {rows.map((r) => (
          <Block key={r.branch_id} title={r.branch_name} warranty={r.warranty_total} warrantyCount={r.warranty_count} free={r.free_service_total} freeCount={r.free_service_count} />
        ))}
        {rows.length > 1 && (
          <div className="pt-4 border-t border-[#EEEEEE]">
            <Block title="All branches" warranty={total("warranty_total")} warrantyCount={total("warranty_count")} free={total("free_service_total")} freeCount={total("free_service_count")} />
          </div>
        )}
      </div>
    </div>
  );
}

function Block({ title, warranty, warrantyCount, free, freeCount }) {
  const all = Number(warranty) + Number(free);
  return (
    <div>
      <div className="text-sm font-bold text-[#111111] mb-1.5">{title}</div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Warranty claims" value={sar(warranty)} note={`${warrantyCount} closed`} />
        <Stat label="Free Service" value={sar(free)} note={`${freeCount} closed`} />
        <Stat label="Total revenue" value={sar(all)} note={`${Number(warrantyCount) + Number(freeCount)} closed`} strong />
      </dl>
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
