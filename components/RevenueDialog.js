"use client";
import { createPortal } from "react-dom";
import { Wallet, X } from "lucide-react";
import DialogFocus from "@/components/DialogFocus";
import ClosedRevenue from "@/components/ClosedRevenue";

/** The Revenue window (dealer, admin, manager). Shared by the sidebar and the phone menu. Render it only while it is open. */
export default function RevenueDialog({ onClose }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Revenue" className="fade-in fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <DialogFocus onClose={onClose} />
      <div className="dialog-in bg-white text-[#111111] rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#111111]">
            <Wallet size={17} className="text-[#6E6E6E]" /> Revenue
          </h2>
          <button onClick={onClose} aria-label="Close" className="tap-icon p-1.5 rounded-md text-[#6E6E6E] hover:bg-[#F1F2F4]">
            <X size={16} />
          </button>
        </div>
        <ClosedRevenue />
      </div>
    </div>,
    document.body
  );
}
