// The numbers behind the home dashboard, worked out from our own claims. Pure functions (no browser or server access),
// so the API route and the tests share them. Same ideas as the self-audit's Sub-Dealer Analytics page:
//  - first time right / rejection rate: of the claims the dealer has decided on (approved, sent back, or rejected)
//  - lead time A to Z: how long each step of a claim takes, from the sub-dealer opening it to the dealer closing it
//  - claims over time, where the claims stand, labor approved over time, most replaced parts, defective parts returned

const HOUR = 3_600_000;
const MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" });

/** "2026-11" for a timestamp, in Saudi time. */
export const monthKey = (iso) => (iso ? MONTH.format(new Date(iso)).slice(0, 7) : null);

/** Every month from `from` to `to` ("YYYY-MM"), in order. */
export function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// The dealer's own steps (the decision, and closing) only count the hours the dealer is at work: a claim that arrives after the
// working day waits for the next morning, and the weekend (Friday, Saturday) does not count. Saudi time, no daylight saving.
export const WORK_DAYS = [0, 1, 2, 3, 4]; // Sunday to Thursday (Date's getUTCDay: 0 = Sunday)
export const WORK_START = 9; // 09:00
export const WORK_END = 17; // 17:00
const SAUDI_OFFSET = 3 * HOUR;

/** Hours between two timestamps that fall inside working time (null when either is missing or the order is wrong). */
export function workingHoursBetween(a, b) {
  if (!a || !b) return null;
  const from = Date.parse(a);
  const to = Date.parse(b);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  // work in "Saudi clock" milliseconds so the UTC getters read Saudi dates
  const start = from + SAUDI_OFFSET;
  const end = to + SAUDI_OFFSET;
  const DAY = 24 * HOUR;
  let total = 0;
  for (let day = Math.floor(start / DAY) * DAY; day <= end; day += DAY) {
    if (!WORK_DAYS.includes(new Date(day).getUTCDay())) continue;
    const open = day + WORK_START * HOUR;
    const close = day + WORK_END * HOUR;
    total += Math.max(0, Math.min(end, close) - Math.max(start, open));
  }
  return total / HOUR;
}

/**
 * When the clock starts for a claim opened at `iso`: at once during working time, otherwise at the start of the next working
 * period (09:00 the same day when opened before work, 09:00 of the next working day when opened after work or on a weekend).
 */
export function workClockStart(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const DAY = 24 * HOUR;
  const local = t + SAUDI_OFFSET;
  let day = Math.floor(local / DAY) * DAY;
  for (let i = 0; i < 8; i++, day += DAY) {
    if (!WORK_DAYS.includes(new Date(day).getUTCDay())) continue;
    if (local < day + WORK_END * HOUR) return Math.max(local, day + WORK_START * HOUR) - SAUDI_OFFSET;
  }
  return t;
}

/** Hours from the work clock start of `from` to `to`: plain elapsed time, except that a claim opened outside working time starts at the next 09:00. */
export function hoursFromWorkStart(from, to) {
  if (!from || !to) return null;
  const end = Date.parse(to);
  const start = workClockStart(from);
  if (!Number.isFinite(end) || start == null || end < Date.parse(from)) return null;
  return Math.max(0, (end - start) / HOUR);
}

/**
 * The dealer's own turns on a claim, from its status log (rows of ONE claim, oldest first): a turn starts when the claim lands on
 * the dealer (submitted, or the after-repair evidence submitted) and ends at the dealer's reply (approved, sent back or rejected;
 * closed or evidence sent back). Each turn is counted in working hours, so the time a claim spends with the sub-dealer between
 * two turns never counts against the dealer. Returns { decision: [hours...], close: [hours...] }.
 */
export function dealerTurns(log) {
  const out = { decision: [], close: [] };
  let decisionSince = null;
  let closeSince = null;
  for (const r of log) {
    if (r.from_status === r.to_status) continue;
    if (r.to_status === "submitted" && decisionSince == null) decisionSince = r.at;
    else if (decisionSince != null && ["submitted", "waiting_pa"].includes(r.from_status) && ["returned", "approved", "rejected"].includes(r.to_status)) {
      const h = workingHoursBetween(decisionSince, r.at);
      if (h != null) out.decision.push(h);
      decisionSince = null;
    }
    if (r.to_status === "repair_submitted" && closeSince == null) closeSince = r.at;
    else if (closeSince != null && r.from_status === "repair_submitted" && ["closed", "repair_returned"].includes(r.to_status)) {
      const h = workingHoursBetween(closeSince, r.at);
      if (h != null) out.close.push(h);
      closeSince = null;
    }
  }
  return out;
}

/** The five steps of a claim, A to Z. `working`: counted in the dealer's working hours only. */
export const LEAD_STEPS = [
  { key: "decision", label: "Dealer decision", hint: "Each time a claim reaches the dealer to the dealer's reply (approve, send back or reject), in working hours", from: "created_at", to: "dealer_decision_at", working: true },
  { key: "parts_reply", label: "Parts reply", hint: "Approval to the parts team's first reply", from: "dealer_decision_at", to: "parts_replied_at" },
  { key: "parts_arrive", label: "Parts arrive", hint: "Parts team's reply to the parts arriving at the branch", from: "parts_replied_at", to: "parts_received_at" },
  { key: "repair", label: "Repair", hint: "Parts arrived to the after-repair evidence submitted", from: "parts_received_at", to: "repair_completed_at" },
  { key: "close", label: "Dealer closes", hint: "Each time after-repair evidence reaches the dealer to the dealer's reply (close or send back), in working hours", from: "repair_completed_at", to: "closed_at", working: true },
];

/** Hours between two timestamps, or null when either is missing or the order is wrong. */
const hoursBetween = (a, b) => {
  if (!a || !b) return null;
  const h = (Date.parse(b) - Date.parse(a)) / HOUR;
  return Number.isFinite(h) && h >= 0 ? h : null;
};

export function leadTimes(claims) {
  const stat = (pairs) => {
    const hours = pairs.filter((h) => h != null);
    return { n: hours.length, avgHours: avg(hours), medianHours: median(hours) };
  };
  return {
    steps: LEAD_STEPS.map((s) => ({ key: s.key, label: s.label, hint: s.hint, working: !!s.working, ...stat(s.working ? claims.flatMap((c) => (c.turns ? c.turns[s.key === "decision" ? "decision" : "close"] : [workingHoursBetween(c[s.from], c[s.to])])) : claims.map((c) => hoursBetween(c[s.from], c[s.to]))) })),
    total: stat(claims.map((c) => hoursFromWorkStart(c.created_at, c.closed_at))), // opened to closed: elapsed time, from the next working hour when opened out of hours
  };
}

/** Which group of the board a status belongs to. */
export const STATUS_GROUPS = [
  { key: "dealer", label: "With the dealer", statuses: ["submitted", "waiting_pa", "technical_review"], color: "#E4002B" },
  { key: "sub_dealer", label: "With the sub-dealer", statuses: ["returned", "repair_returned"], color: "#F29D38" },
  { key: "parts", label: "Waiting for parts", statuses: ["approved", "awaiting_parts", "parts_return"], color: "#5B8DEF" },
  { key: "arrived", label: "Parts arrived", statuses: ["parts_arrived"], color: "#8E7CE0" },
  { key: "review", label: "After-repair review", statuses: ["repair_submitted"], color: "#37A6A0" },
  { key: "closed", label: "Closed", statuses: ["closed"], color: "#2E9E5B" },
  { key: "rejected", label: "Rejected", statuses: ["rejected"], color: "#6E6E6E" },
];

export function statusBoard(claims) {
  return STATUS_GROUPS.map((g) => ({ key: g.key, label: g.label, color: g.color, value: claims.filter((c) => g.statuses.includes(c.status)).length }));
}

/** First time right and rejection: of the claims the dealer has decided on. */
export function quality(claims) {
  const decided = claims.filter((c) => c.dealer_decision_at || c.times_returned > 0 || c.times_rejected > 0 || c.status === "rejected");
  const rejected = decided.filter((c) => c.times_rejected > 0 || c.status === "rejected");
  const returned = decided.filter((c) => c.times_returned > 0);
  const firstTimeRight = decided.filter((c) => c.dealer_decision_at && !(c.times_returned > 0) && !(c.times_rejected > 0) && c.status !== "rejected");
  const rate = (n) => (decided.length ? n / decided.length : null);
  return {
    decided: decided.length,
    firstTimeRight: firstTimeRight.length,
    firstTimeRightRate: rate(firstTimeRight.length),
    returned: returned.length,
    returnedRate: rate(returned.length),
    rejected: rejected.length,
    rejectionRate: rate(rejected.length),
  };
}

/** A value per month over a continuous list of months. */
function perMonth(months, items, keyOf, valueOf = () => 1) {
  const sums = new Map(months.map((m) => [m, 0]));
  for (const it of items) {
    const k = keyOf(it);
    if (sums.has(k)) sums.set(k, sums.get(k) + valueOf(it));
  }
  return months.map((m) => ({ month: m, value: Math.round(sums.get(m) * 100) / 100 }));
}

/** The most replaced parts by quantity (cancelled parts do not count). */
export function topParts(parts, limit = 8) {
  const map = new Map();
  for (const p of parts) {
    if (p.status === "Cancelled") continue;
    const name = String(p.name || "").trim().toUpperCase();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + (Number(p.qty) || 1));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name, qty]) => ({ name, qty }));
}

/** Closed claims: the parts on them and how many came back to the dealer. */
export function defectedParts(claims, parts) {
  const closedIds = new Set(claims.filter((c) => c.status === "closed").map((c) => c.id));
  const onClosed = parts.filter((p) => closedIds.has(p.claim_id) && p.status !== "Cancelled");
  const back = onClosed.filter((p) => p.defected_arrived_at).length;
  return { total: onClosed.length, returned: back, pending: onClosed.length - back };
}

/**
 * claims: [{ id, status, created_at, dealer_decision_at, parts_replied_at, parts_received_at, repair_completed_at, closed_at,
 * labor_amount, times_returned, times_rejected }]  parts: [{ claim_id, name, qty, status, defected_arrived_at }]
 * months: the continuous list of months the charts cover; `since` is its first day (the claims are already limited to it).
 */
export function buildAnalytics(claims, parts, months) {
  const closed = claims.filter((c) => c.status === "closed");
  const total = leadTimes(claims).total;
  return {
    months,
    totals: {
      claims: claims.length,
      open: claims.filter((c) => !["closed", "rejected"].includes(c.status)).length,
      closed: closed.length,
      rejected: claims.filter((c) => c.status === "rejected").length,
      laborApproved: Math.round(claims.reduce((s, c) => s + (Number(c.labor_amount) || 0), 0) * 100) / 100,
      avgLeadHours: total.avgHours,
    },
    board: statusBoard(claims),
    claimsPerMonth: perMonth(months, claims, (c) => monthKey(c.created_at)),
    laborPerMonth: perMonth(months, claims.filter((c) => c.labor_amount != null && c.dealer_decision_at), (c) => monthKey(c.dealer_decision_at), (c) => Number(c.labor_amount) || 0),
    quality: quality(claims),
    leadTimes: leadTimes(claims),
    topParts: topParts(parts),
    defected: defectedParts(claims, parts),
  };
}

// ---- what the dashboard's click-through lists need ------------------------------------------------------------------------

/** The dealer work order without its -1 / -2 suffix ("HER-37530-1" -> "HER-37530"), or null. */
export const baseWorkOrder = (dealerWorkOrder) => /^([A-Za-z]+-\d+)/.exec(dealerWorkOrder || "")?.[1]?.toUpperCase() || null;

/** The key a work order + VIN has on the "Work order by work order" table (a claim with no dealer work order yet stands alone). */
export const workOrderKey = (c) => {
  const base = baseWorkOrder(c.dealer_work_order_number);
  return base && c.vin ? `${base}|${String(c.vin).toUpperCase()}` : `claim:${c.id}`;
};

/** "right" (decided, first time right), "other" (decided, but sent back or rejected), or null (not decided on yet). */
export function qualityClass(c) {
  const decided = c.dealer_decision_at || c.times_returned > 0 || c.times_rejected > 0 || c.status === "rejected";
  if (!decided) return null;
  return c.dealer_decision_at && !(c.times_returned > 0) && !(c.times_rejected > 0) && c.status !== "rejected" ? "right" : "other";
}

/** One claim, boiled down to what the lists behind the charts show and filter on. */
export function claimBrief(c) {
  return {
    id: c.id,
    n: c.claim_number,
    wo: c.work_order_number || null,
    dwo: c.dealer_work_order_number || null,
    vin: c.vin || null,
    k: workOrderKey(c),
    st: c.status,
    g: STATUS_GROUPS.find((x) => x.statuses.includes(c.status))?.key || null,
    cm: monthKey(c.created_at), // the month it was opened
    dm: c.labor_amount != null && c.dealer_decision_at ? monthKey(c.dealer_decision_at) : null, // the month its labor was approved
    la: c.labor_amount == null ? null : Number(c.labor_amount),
    q: qualityClass(c),
  };
}

/** The parts of the claims, for the lists behind "most replaced parts" and "defective parts returned" (cancelled ones left out). */
export function partBriefs(parts) {
  return parts
    .filter((p) => p.status !== "Cancelled" && String(p.name || "").trim())
    .map((p) => ({ c: p.claim_id, name: String(p.name).trim().toUpperCase(), qty: Number(p.qty) || 1, back: !!p.defected_arrived_at }));
}
