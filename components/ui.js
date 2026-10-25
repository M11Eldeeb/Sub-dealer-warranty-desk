"use client";
import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ExportDataButton from "@/components/ExportDataButton";
import { useFreeService } from "@/lib/use-free-service";
import { useTheme } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Clock, RefreshCw, AlertTriangle, XCircle, CheckCircle2, RotateCcw, Menu, X, Users, Settings, LogOut, BadgeCheck, ClipboardList, Sun, Moon, Monitor, PackageOpen } from "lucide-react";

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
  draft: { label: "Draft", color: "#656970", bg: "#F1F2F4" },
  submitted: { label: "Submitted", color: "#9A5C00", bg: "#FCF1DA" },
  waiting_pa: { label: "Waiting PA", color: "#AB4F09", bg: "#FDF0DC" },
  returned: { label: "Returned for Edit", color: "#A84917", bg: "#FDEBE0" },
  rejected: { label: "Rejected", color: "#B23A32", bg: "#FAE4E2" },
  approved: { label: "Approved", color: "#2A62B0", bg: "#E4EDFA" },
  technical_review: { label: "Technical Review", color: "#6D28D9", bg: "#EDE7FC" },
  awaiting_parts: { label: "Awaiting Parts", color: "#5B4FB0", bg: "#EAE7FA" },
  parts_arrived: { label: "Parts Arrived", color: "#1D7466", bg: "#E1F2EE" },
  parts_return: { label: "Parts Return", color: "#A84917", bg: "#FDEBE0" },
  repair_returned: { label: "After Repair Returned", color: "#A84917", bg: "#FDEBE0" },
  repair_submitted: { label: "After Repair Submitted", color: "#0E7490", bg: "#E0F2FE" },
  closed: { label: "Closed", color: "#2C7743", bg: "#E5F3E8" },
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-bold uppercase tracking-wide text-[#B23A32] bg-[#FAE4E2]">
      ⚠ Ageing — {days}d
    </span>
  );
}

export function ReturnedDaysBadge({ days }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-bold uppercase tracking-wide text-[#C4551B] bg-[#FDEBE0]">
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
  if (resolved === total) return { label: "All Parts Supplied", color: "#1D7466", bg: "#E1F2EE" };
  if (resolved === 0) return { label: "Waiting Shipment", color: "#9A5C00", bg: "#FCF1DA" };
  return { label: `Partially Supplied (${resolved}/${total})`, color: "#5B4FB0", bg: "#EAE7FA" };
}

/** How many of a claim's defective parts have arrived back at the dealer. null = nothing to show. */
export function defectedSummary(claim) {
  const parts = claim.claim_parts || [];
  const total = parts.length;
  if (!total) return claim.defected_part_arrived ? { all: true, arrived: 0, total: 0 } : null;
  const arrived = claim.defected_part_arrived ? total : parts.filter((p) => p.defected_arrived_at).length;
  return { all: arrived === total, arrived, total };
}

export function StatusTag({ status, parts, returnRequests }) {
  if (status === "awaiting_parts" && parts) {
    const summary = getPartsSummary(parts);
    if (summary) {
      return (
        <span
          className="pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.6875rem] font-bold"
          style={{ "--pill-fg": summary.color, "--pill-bg": summary.bg }}
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
        className="pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.6875rem] font-bold"
        style={{ "--pill-fg": s.color, "--pill-bg": s.bg }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
        Parts Return {pending > 0 ? `(${pending} pending)` : ""}
      </span>
    );
  }
  const s = STATUS[status] || STATUS.draft;
  return (
    <span
      className="pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.6875rem] font-bold"
      style={{ "--pill-fg": s.color, "--pill-bg": s.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function Header({ profile, onSignOut }) {
  return (
    <>
    <header
      className="app-header sticky top-0 z-40 bg-[#111111] text-white px-4 sm:px-6 pb-3 sm:pb-4 sm:pt-4 border-b border-white/5"
      style={{ boxShadow: "0 1px 0 rgba(228,0,43,0.35), 0 8px 24px -12px rgba(0,0,0,0.55)" }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" title="Back to the main page" className="flex items-center gap-2.5 py-1.5 sm:py-0 hover:opacity-90 transition-opacity">
          <div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2447] to-[#B8001F] flex items-center justify-center"
            style={{ boxShadow: "0 4px 12px -2px rgba(228,0,43,0.6)" }}
          >
            <Wrench size={16} className="text-white" />
          </div>
          <div>
            <div className="font-black uppercase tracking-wide text-sm leading-none">WarrantyDesk</div>
            <div className="text-[0.6875rem] text-[#ADADAD] mt-0.5">
              {profile?.role === "admin"
                ? "Admin Console"
                : profile?.role === "manager"
                ? "Manager Console (view only)"
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
    </header>
    <BottomNav profile={profile} />
    </>
  );
}

/** The sandwich menu: user + e-mail settings and data export for dealer / admin accounts, and Sign out for everyone. */
function HeaderMenu({ profile, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const staff = profile?.role === "dealer" || profile?.role === "admin";
  const viewer = profile?.role === "manager"; // managers can look at everything and change nothing
  const freeService = useFreeService(profile?.role, profile?.id);
  const [theme, setTheme] = useTheme();

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

  const item = "no-press menu-row w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-[#111111] hover:bg-[#F4F4F4] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        className="no-press tap-icon sm:min-w-0 sm:min-h-0 w-11 h-11 sm:w-9 sm:h-9 rounded-md flex items-center justify-center bg-[#1A1A1A] hover:bg-[#2A2A2A] active:scale-95 transition-colors"
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
              <div className="text-[0.6875rem] text-[#6E6E6E]">{(profile?.role || "").replace("_", " ")}</div>
            </div>
            {(staff || viewer || profile?.role === "sub_dealer") && (
              <Link href={profile?.role === "sub_dealer" ? "/dashboard/sub-dealer" : "/dashboard/dealer"} onClick={() => setOpen(false)} className={item}>
                <ClipboardList size={16} className="text-[#6E6E6E]" /> Warranty Claims
              </Link>
            )}
            {(staff || viewer || profile?.role === "sub_dealer") && (
              <Link href="/dashboard/defect-returns" onClick={() => setOpen(false)} className={item}>
                <PackageOpen size={16} className="text-[#6E6E6E]" /> Defected parts
              </Link>
            )}
            {freeService?.canUse && (
              <Link href="/dashboard/free-service" onClick={() => setOpen(false)} className={item}>
                <BadgeCheck size={16} className="text-[#6E6E6E]" /> Free Service
                {freeService.pending > 0 && <span className="ml-auto bg-[#E4002B] text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[0.6875rem]">{freeService.pending}</span>}
              </Link>
            )}
            {viewer && (
              <>
                <ExportDataButton variant="menu" className={item} />
                <div className="border-t border-[#EEEEEE]" />
              </>
            )}
            {staff && (
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
            <div className="px-3.5 py-3 border-t border-[#EEEEEE]">
              <div id="appearance-label" className="text-xs font-semibold text-[#6E6E6E] mb-2">
                Appearance
              </div>
              <div role="radiogroup" aria-labelledby="appearance-label" className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#F1F2F4]">
                {[
                  ["auto", "Auto", Monitor],
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                    className={`no-press tap-auto flex items-center justify-center gap-1.5 min-h-9 rounded-md text-xs font-semibold transition-colors ${
                      theme === value ? "bg-white text-[#111111] shadow-sm" : "text-[#6E6E6E] hover:text-[#111111]"
                    }`}
                  >
                    <Icon size={14} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-[#EEEEEE]" />
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
    <div role="tablist" className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-sm relative max-w-full overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
      {tabs.map(({ key, label, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`relative shrink-0 px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-colors ${ active ? "text-white" : "text-[#4D4D4D] hover:text-[#111111]" }`}
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
                <span className={`px-1.5 rounded-full text-[0.6875rem] transition-colors ${active ? "bg-white/20" : "bg-[#E0E0E0]"}`}>{count}</span>
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

/** Phones: the two main places always one tap away, like a tab bar (a menu hides them). */
function BottomNav({ profile }) {
  const path = usePathname() || "";
  const role = profile?.role;
  const freeService = useFreeService(role, profile?.id);
  const hasClaims = ["sub_dealer", "dealer", "admin", "manager"].includes(role);
  const show = hasClaims && freeService?.canUse;

  useEffect(() => {
    if (!show) return;
    document.body.classList.add("has-bottom-nav");
    return () => document.body.classList.remove("has-bottom-nav");
  }, [show]);

  if (!show) return null;
  const claimsHref = role === "sub_dealer" ? "/dashboard/sub-dealer" : "/dashboard/dealer";
  const onFree = path.startsWith("/dashboard/free-service") || path.startsWith("/free-service");
  const tabs = [
    { href: claimsHref, label: "Claims", Icon: ClipboardList, active: !onFree },
    { href: "/dashboard/free-service", label: "Free Service", Icon: BadgeCheck, active: onFree, badge: freeService.pending },
  ];
  return (
    <nav aria-label="Main" className="bottom-nav sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#E0E0E0]">
      <ul className="flex">
        {tabs.map(({ href, label, Icon, active, badge }) => (
          <li key={label} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-14 text-[0.6875rem] font-semibold transition-colors ${active ? "text-[#E4002B]" : "text-[#6E6E6E]"}`}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
              {badge > 0 && <span className="absolute top-1.5 left-1/2 ml-2 bg-[#E4002B] text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[0.6875rem]">{badge}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** What shows while a page loads its data: the bar and the shape of the cards, instead of an empty screen. */
export function LoadingShell({ cards = 4 }) {
  return (
    <div className="min-h-screen bg-[#F4F4F4]" role="status" aria-label="Loading">
      <header className="app-header bg-[#111111] text-white px-4 sm:px-6 pb-3 sm:pb-4 sm:pt-4 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2447] to-[#B8001F] flex items-center justify-center">
              <Wrench size={16} className="text-white" />
            </div>
            <div className="font-black uppercase tracking-wide text-sm leading-none">WarrantyDesk</div>
          </div>
          <div className="skeleton w-11 h-11 sm:w-9 sm:h-9 rounded-md opacity-30" />
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="skeleton h-10 w-72 max-w-full rounded-lg mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="claim-card p-4">
              <div className="skeleton h-3 w-32 rounded mb-3" />
              <div className="skeleton h-5 w-56 max-w-full rounded mb-2" />
              <div className="skeleton h-3 w-40 rounded mb-4" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
