"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Clock, RefreshCw, Truck, AlertTriangle, XCircle, CheckCircle2, RotateCcw, UserPlus } from "lucide-react";

export const PART_STATUS = {
  "Waiting Action": { label: "Waiting Action", color: "#8A8F98", icon: Clock },
  ICT: { label: "ICT", color: "#5B4FB0", icon: RefreshCw },
  Shipped: { label: "Shipped", color: "#1D6FBD", icon: Truck },
  "Supplied to Sub-Dealer": { label: "Supplied to Sub-Dealer", color: "#1E7A6B", icon: CheckCircle2 },
  "Parts Return": { label: "Parts Return", color: "#C4551B", icon: RotateCcw },
  VOR: { label: "VOR", color: "#C77700", icon: AlertTriangle },
  Cancelled: { label: "Cancelled", color: "#B23A32", icon: XCircle },
};
export const PART_STATUS_OPTIONS = ["Waiting Action", "ICT", "Shipped", "Supplied to Sub-Dealer", "Parts Return", "VOR", "Cancelled"];
export const SUPPLYING_LOCATIONS = ["Heraa Jeddah", "Al Qassim", "Jizan", "Riyadh"];

export const STATUS = {
  draft: { label: "Draft", color: "#8A8F98", bg: "#F1F2F4" },
  submitted: { label: "Submitted", color: "#C77700", bg: "#FCF1DA" },
  waiting_pa: { label: "Waiting PA", color: "#B45309", bg: "#FDF0DC" },
  returned: { label: "Returned for Edit", color: "#C4551B", bg: "#FDEBE0" },
  rejected: { label: "Rejected", color: "#B23A32", bg: "#FAE4E2" },
  approved: { label: "Approved", color: "#2A62B0", bg: "#E4EDFA" },
  technical_review: { label: "Technical Review", color: "#6D28D9", bg: "#EDE7FC" },
  awaiting_parts: { label: "Awaiting Parts", color: "#5B4FB0", bg: "#EAE7FA" },
  parts_arrived: { label: "Parts Arrived", color: "#1E7A6B", bg: "#E1F2EE" },
  parts_return: { label: "Parts Return", color: "#C4551B", bg: "#FDEBE0" },
  repair_returned: { label: "After Repair Returned", color: "#C4551B", bg: "#FDEBE0" },
  repair_submitted: { label: "After Repair Submitted", color: "#0E7490", bg: "#E0F2FE" },
  closed: { label: "Closed", color: "#2E7D46", bg: "#E5F3E8" },
};

export function firstPartName(parts) {
  if (!parts || parts.length === 0) return null;
  return [...parts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]?.name;
}

export function cardSubtitle(parts, labor) {
  const partName = firstPartName(parts);
  if (partName) return partName;
  if (!labor || labor.length === 0) return null;
  return [...labor].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]?.name;
}

export function sanitizeFileName(name) {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot) : "";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return safeBase + ext;
}

export function daysSinceReturned(claim) {
  if (claim.status !== "returned" || !claim.returned_since) return null;
  return Math.floor((Date.now() - new Date(claim.returned_since).getTime()) / (1000 * 60 * 60 * 24));
}

export function isAgeing(claim) {
  const days = daysSinceReturned(claim);
  return days !== null && days > 30;
}

export function AgeingBadge({ days }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-[#B23A32] bg-[#FAE4E2]">
      ⚠ Ageing — {days}d
    </span>
  );
}

export function ReturnedDaysBadge({ days }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-[#C4551B] bg-[#FDEBE0]">
      Returned {days} day{days === 1 ? "" : "s"} ago
    </span>
  );
}

export function combinedWorkOrder(claim) {
  return claim.dealer_work_order_number ? `${claim.work_order_number}-${claim.dealer_work_order_number}` : claim.work_order_number;
}

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
  const supplied = parts.filter((p) => p.status === "Supplied to Sub-Dealer").length;
  const cancelled = parts.filter((p) => p.status === "Cancelled").length;
  const resolved = supplied + cancelled;

  if (cancelled === total) return { label: "Parts Cancelled", color: "#B23A32", bg: "#FAE4E2" };
  if (resolved === total) return { label: "All Parts Supplied", color: "#1E7A6B", bg: "#E1F2EE" };
  if (resolved === 0) return { label: "Waiting Shipment", color: "#C77700", bg: "#FCF1DA" };
  return { label: `Partially Supplied (${resolved}/${total})`, color: "#5B4FB0", bg: "#EAE7FA" };
}

export function StatusTag({ status, parts, returnRequests }) {
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
  if (status === "parts_return" && returnRequests) {
    const pending = returnRequests.filter((r) => !r.resolved).length;
    const s = STATUS.parts_return;
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide"
        style={{ color: s.color, background: s.bg }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
        Parts Return {pending > 0 ? `(${pending} pending)` : ""}
      </span>
    );
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
    <div
      className="sticky top-0 z-30 bg-[#111111] text-white px-6 py-4 border-b border-white/5"
      style={{ boxShadow: "0 1px 0 rgba(228,0,43,0.35), 0 8px 24px -12px rgba(0,0,0,0.55)" }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2447] to-[#B8001F] flex items-center justify-center"
            style={{ boxShadow: "0 4px 12px -2px rgba(228,0,43,0.6)" }}
          >
            <Wrench size={16} className="text-white" />
          </div>
          <div>
            <div className="font-black uppercase tracking-wide text-sm leading-none">WarrantyDesk</div>
            <div className="text-[10px] text-[#ADADAD] uppercase tracking-wide mt-0.5">
              {profile?.role === "admin"
                ? "Admin Console"
                : profile?.role === "dealer"
                ? "Dealer Console"
                : profile?.role === "parts_team"
                ? "Parts Team Console"
                : profile?.role === "technical_team"
                ? "Technical Team Console"
                : "Sub-Dealer Portal"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[#ADADAD]">{profile?.full_name}</span>
          {(profile?.role === "dealer" || profile?.role === "admin") && (
            <Link
              href="/dashboard/dealer/create-account"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide bg-[#E4002B] hover:bg-[#FF2447] active:scale-95 transition-all"
            >
              <UserPlus size={13} /> Create Account
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide bg-[#1A1A1A] hover:bg-[#2A2A2A] active:scale-95 transition-all"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Segmented tab control with a sliding pill indicator (shared layoutId, so it
 * glides between tabs instead of jump-cutting) — used by every dashboard's
 * Needs Review / Ongoing / History style switcher.
 */
export function Tabs({ value, onChange, tabs, layoutId = "tab-pill" }) {
  return (
    <div className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-sm relative flex-wrap">
      {tabs.map(({ key, label, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 transition-colors ${
              active ? "text-white" : "text-[#4D4D4D] hover:text-[#111111]"
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-[#111111]"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {label}
              {count !== undefined && (
                <span className={`px-1.5 rounded-full text-[10px] transition-colors ${active ? "bg-white/20" : "bg-[#E0E0E0]"}`}>{count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } },
};

/**
 * Animated claim-card grid: fades/slides cards in with a light stagger
 * whenever `animKey` changes (pass the active tab/filter) and whenever the
 * card list itself changes. Wrap each card in <ClaimCard> below.
 */
export function ClaimGrid({ animKey, children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={animKey} variants={gridVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function ClaimCard({ claimId, children }) {
  return (
    <motion.div key={claimId} layout variants={cardVariants} exit="exit">
      {children}
    </motion.div>
  );
}
