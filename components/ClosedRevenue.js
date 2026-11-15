"use client";
import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const sar = (n) => `SAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Revenue that came to a branch from CLOSED work only: the labor approved on closed warranty claims plus the approved
 * amount on closed Free Service requests. Rejected and still-open ones are not counted. A sub-dealer sees its own
 * branch; dealer, admin and manager see every branch (and the total of all of them). The numbers are added up in the
 * database (closed_revenue()), so they are right however many claims there are.
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

  if (!rows || rows.length === 0) return null; // nothing closed yet, or not available: no card

  const total = (key) => rows.reduce((sum, r) => sum + Number(r[key] || 0), 0);

  return (
    <section aria-label="Revenue from closed claims" className="mb-4 bg-white border border-[#E0E0E0] rounded-lg p-4">
      <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs font-bold text-[#6E6E6E]">
        <Wallet size={14} /> Revenue from closed claims
        <span className="font-normal">closed only, no rejected or pending · VAT inclusive</span>
      </div>
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
    </section>
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
