"use client";
import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ExportDataButton from "@/components/ExportDataButton";
import { useFreeService } from "@/lib/use-free-service";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Clock, RefreshCw, AlertTriangle, XCircle, CheckCircle2, RotateCcw, Menu, X, Users, Settings, LogOut, BadgeCheck } from "lucide-react";

export const PART_STATUS = {
  "Waiting Action": { label: "Waiting Action", color: "#8A8F98", icon: Clock },
  ICT: { label: "ICT", color: "#5B4FB0", icon: RefreshCw },
  "Supplied to Sub-Dealer": { label: "Supplied to Sub-Dealer", color: "#1E7A6B", icon: CheckCircle2 },
  "Parts Return": { label: "Parts Return", color: "#C4551B", icon: RotateCcw },
  VOR: { label: "VOR", color: "#C77700", icon: AlertTriangle },
  Cancelled: { label: "Cancelled", color: "#B23A32", icon: XCircle },
};
export const PART_STATUS_OPTIONS = ["Waiting Action", "ICT", "Supplied to Sub-Dealer", "Parts Return", "VOR", "Cancelled"];
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
      className="sticky top-0 z-40 bg-[#111111] text-white px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5"
      style={{ boxShadow: "0 1px 0 rgba(228,0,43,0.35), 0 8px 24px -12px rgba(0,0,0,0.55)" }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" title="Back to the main page" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
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
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[#ADADAD] hidden sm:inline">{profile?.full_name}</span>
          <HeaderMenu profile={profile} onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}

/** The sandwich menu: user + e-mail settings and data export for dealer / admin accounts, and Sign out for everyone. */
function HeaderMenu({ profile, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const manager = profile?.role === "dealer" || profile?.role === "admin";
  const freeService = useFreeService(profile?.role, profile?.id);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "no-press w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-[#111111] hover:bg-[#F4F4F4] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-md flex items-center justify-center bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ opacity: 0, rotate: open ? -45 : 45 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: open ? 45 : -45 }}
            transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
            className="flex"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </motion.span>
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] } }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.1, ease: [0.23, 1, 0.32, 1] } }}
            className="absolute right-0 mt-2 w-60 bg-white text-[#111111] rounded-lg border border-[#E0E0E0] overflow-hidden origin-top-right"
            style={{ boxShadow: "0 18px 40px -12px rgba(0,0,0,0.45)" }}
          >
            <div className="px-3.5 py-3 border-b border-[#EEEEEE] bg-[#FAFAFA]">
              <div className="text-sm font-bold truncate">{profile?.full_name}</div>
              <div className="text-[10px] uppercase tracking-wide text-[#6E6E6E]">{(profile?.role || "").replace("_", " ")}</div>
            </div>
            {freeService?.canUse && (
              <Link href="/dashboard/free-service" onClick={() => setOpen(false)} className={item}>
                <BadgeCheck size={16} className="text-[#6E6E6E]" /> Free Service
                {freeService.pending > 0 && <span className="ml-auto bg-[#E4002B] text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[10px]">{freeService.pending}</span>}
              </Link>
            )}
            {manager && (
              <>
                <Link href="/dashboard/users" onClick={() => setOpen(false)} className={item}>
                  <Users size={16} className="text-[#6E6E6E]" /> User settings
                </Link>
                <Link href="/dashboard/settings" onClick={() => setOpen(false)} className={item}>
                  <Settings size={16} className="text-[#6E6E6E]" /> Settings
                </Link>
                <ExportDataButton variant="menu" className={item} />
                <div className="border-t border-[#EEEEEE]" />
              </>
            )}
            <button onClick={onSignOut} className={`${item} text-[#B23A32]`}>
              <LogOut size={16} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-sm relative max-w-full overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
      {tabs.map(({ key, label, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative shrink-0 px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 transition-colors ${
              active ? "text-white" : "text-[#4D4D4D] hover:text-[#111111]"
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-[#111111]"
                transition={{ type: "spring", duration: 0.3, bounce: 0.08 }}
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

// Cards ease in with a short, capped stagger: the first handful cascade, the rest arrive together,
// so a long list never makes anyone wait for the tail.
const STAGGER_STEP = 0.03;
const STAGGER_CAP = 8;
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: [0.23, 1, 0.32, 1], delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP },
  }),
};

/**
 * Animated claim-card grid: cards fade up into place whenever `animKey` changes (pass the active tab/filter)
 * and whenever the list itself changes. Wrap each card in <ClaimCard> below.
 */
export function ClaimGrid({ animKey, children }) {
  const cards = Children.toArray(children).map((child, i) => (isValidElement(child) ? cloneElement(child, { index: i }) : child));
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={animKey}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.08 } }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {cards}
      </motion.div>
    </AnimatePresence>
  );
}

export function ClaimCard({ claimId, index = 0, children }) {
  return (
    <motion.div key={claimId} layout="position" variants={cardVariants} initial="hidden" animate="show" custom={index} className="min-w-0">
      {children}
    </motion.div>
  );
}
