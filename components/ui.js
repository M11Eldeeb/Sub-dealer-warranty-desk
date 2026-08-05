"use client";
import { Wrench } from "lucide-react";

export const STATUS = {
  draft: { label: "Draft", color: "#8A8F98", bg: "#F1F2F4" },
  submitted: { label: "Submitted", color: "#C77700", bg: "#FCF1DA" },
  returned: { label: "Returned for Edit", color: "#C4551B", bg: "#FDEBE0" },
  rejected: { label: "Rejected", color: "#B23A32", bg: "#FAE4E2" },
  approved: { label: "Approved", color: "#2A62B0", bg: "#E4EDFA" },
  awaiting_parts: { label: "Awaiting Parts", color: "#5B4FB0", bg: "#EAE7FA" },
  parts_arrived: { label: "Parts Arrived", color: "#1E7A6B", bg: "#E1F2EE" },
  repair_submitted: { label: "After Repair Submitted", color: "#0E7490", bg: "#E0F2FE" },
  closed: { label: "Closed", color: "#2E7D46", bg: "#E5F3E8" },
};

export function fmt(ts) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getPartsSummary(parts) {
  if (!parts || parts.length === 0) return null;
  const total = parts.length;
  const shipped = parts.filter((p) => p.status === "Shipped to branch").length;
  const cancelled = parts.filter((p) => p.status === "Cancelled").length;
  const resolved = shipped + cancelled;

  if (cancelled === total) return { label: "Parts Cancelled", color: "#B23A32", bg: "#FAE4E2" };
  if (resolved === total) return { label: "All Parts Shipped", color: "#1E7A6B", bg: "#E1F2EE" };
  if (resolved === 0) return { label: "Waiting Shipment", color: "#C77700", bg: "#FCF1DA" };
  return { label: `Partially Shipped (${resolved}/${total})`, color: "#5B4FB0", bg: "#EAE7FA" };
}

export function StatusTag({ status, parts }) {
  if (status === "awaiting_parts" && parts) {
    const summary = getPartsSummary(parts);
    if (summary) {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide"
          style={{ color: summary.color, background: summary.bg }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: summary.color }} />
          {summary.label}
        </span>
      );
    }
  }
  const s = STATUS[status] || STATUS.draft;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function Header({ profile, onSignOut }) {
  return (
    <div className="bg-[#111111] text-white px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#E4002B] flex items-center justify-center">
            <Wrench size={16} className="text-white" />
          </div>
          <div>
            <div className="font-black uppercase tracking-wide text-sm leading-none">WarrantyDesk</div>
            <div className="text-[10px] text-[#ADADAD] uppercase tracking-wide mt-0.5">
              {profile?.role === "dealer" ? "Dealer Console" : profile?.role === "parts_team" ? "Parts Team Console" : "Sub-Dealer Portal"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[#ADADAD]">{profile?.full_name}</span>
          <button
            onClick={onSignOut}
            className="px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
