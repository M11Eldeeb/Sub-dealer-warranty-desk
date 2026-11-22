"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import DialogFocus from "@/components/DialogFocus";

const OPTIONS = [
  ["1", "1 month", "This month so far"],
  ["3", "3 months", "This month and the 2 before"],
  ["6", "6 months", "This month and the 5 before"],
  ["12", "12 months", "This month and the 11 before"],
  ["all", "All time", "Every claim since the start"],
];

/**
 * Export dashboard (dealer, admin, manager): pick the period, and the dashboard opens as a printable report in a new tab with the
 * export date on it; "Save as PDF" in the print window gives the file. Render it only while it is open.
 */
export default function ExportDashboardDialog({ onClose }) {
  const [range, setRange] = useState("6");
  const create = () => {
    window.open(`/dashboard/report?range=${range}`, "_blank");
    onClose();
  };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Export dashboard" className="fade-in fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <DialogFocus onClose={onClose} />
      <div className="dialog-in bg-white text-[#111111] rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#111111]">
            <FileText size={17} className="text-[#6E6E6E]" /> Export dashboard
          </h2>
          <button onClick={onClose} aria-label="Close" className="tap-icon p-1.5 rounded-md text-[#6E6E6E] hover:bg-[#F1F2F4]">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[#6E6E6E] mb-3">A PDF of the sub-dealer analytics, with today&apos;s date on it. Choose the period.</p>
        <div role="radiogroup" aria-label="Period" className="space-y-1.5">
          {OPTIONS.map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={range === value}
              onClick={() => setRange(value)}
              className={`no-press w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${range === value ? "border-[#111111] bg-[#F7F7F8]" : "border-[#E4E4E8] hover:border-[#9A9AA0]"}`}
            >
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${range === value ? "border-[#111111] bg-[#111111] shadow-[inset_0_0_0_2px_#fff]" : "border-[#C4C4CA]"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#111111]">{label}</span>
                <span className="block text-[0.6875rem] text-[#6E6E6E]">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" onClick={create} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#E4002B] hover:bg-[#B8001F] text-white text-sm font-bold transition-colors">
          <FileText size={15} /> Create PDF
        </button>
        <p className="mt-2 text-[0.6875rem] text-[#6E6E6E] text-center">It opens in a new tab. In the print window choose Save as PDF.</p>
      </div>
    </div>,
    document.body
  );
}
