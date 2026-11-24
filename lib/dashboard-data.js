// SERVER-ONLY. The numbers behind the home dashboard, worked out with the service role so they can be used by the API routes
// (a signed-in dealer, admin or manager) and by the dashboard file / weekly e-mail (no one signed in).
import { buildAnalytics, claimBrief, dealerTurns, monthKey, monthRange, partBriefs } from "@/lib/analytics";
import { getBatchByWorkOrder } from "@/lib/self-audit-scrap";

const CLAIM_COLUMNS =
  "id, claim_number, status, created_at, dealer_decision_at, parts_replied_at, parts_received_at, repair_completed_at, closed_at, labor_amount, times_returned, times_rejected, work_order_number, dealer_work_order_number, vin, sub_invoiced_at";

const round2 = (n) => Math.round(n * 100) / 100;

/** The periods: "w" = the last 7 days, 1 | 3 | 6 | 12 = this month and the months before it, "all" = since the start. */
export const RANGES = ["w", "1", "3", "6", "12", "all"];

/** The first day of the month `n - 1` months before this one, as "YYYY-MM". */
export function monthsAgo(n) {
  const now = monthKey(new Date().toISOString());
  let [y, m] = now.split("-").map(Number);
  m -= n - 1;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Where a period starts, as a timestamp (ISO), or null for all time. */
export function sinceOf(range) {
  if (range === "all") return null;
  if (range === "w") return new Date(Date.now() - 7 * 86400000).toISOString();
  return `${monthsAgo(Math.min(Math.max(parseInt(range, 10) || 6, 1), 60))}-01T00:00:00+03:00`;
}

const inRange = (iso, since) => !since || Date.parse(iso) >= Date.parse(since);

/** The claims (kind "claim") opened since `since` (all of them when null), with their parts and their dealer turns worked out. */
async function readClaims(admin, since = null) {
  const claims = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("claims").select(CLAIM_COLUMNS).eq("kind", "claim").order("created_at", { ascending: true }).range(from, from + 999);
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) throw new Error("Could not read the claims.");
    claims.push(...data);
    if (data.length < 1000) break;
  }

  const parts = [];
  const ids = claims.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from("claim_parts").select("claim_id, name, qty, status, defected_arrived_at").in("claim_id", ids.slice(i, i + 150));
    parts.push(...(data || []));
  }

  // The dealer's own steps (decision, closing) are timed turn by turn from the status log, in working hours.
  const logs = new Map();
  for (let i = 0; i < ids.length; i += 60) {
    for (let from = 0; ; from += 1000) {
      const { data } = await admin
        .from("claim_status_log")
        .select("claim_id, from_status, to_status, at")
        .in("claim_id", ids.slice(i, i + 60))
        .or("kind.is.null,kind.neq.comment")
        .order("at", { ascending: true })
        .range(from, from + 999);
      for (const r of data || []) (logs.get(r.claim_id) || logs.set(r.claim_id, []).get(r.claim_id)).push(r);
      if ((data || []).length < 1000) break;
    }
  }
  for (const c of claims) c.turns = dealerTurns(logs.get(c.id) || []);
  return { claims, parts };
}

/** The dashboard's numbers for one period, from the claims already read. */
function analyticsFor({ claims, parts }, range) {
  const since = sinceOf(range);
  const mine = claims.filter((c) => inRange(c.created_at, since));
  const ids = new Set(mine.map((c) => c.id));
  const myParts = parts.filter((p) => ids.has(p.claim_id));
  const nowMonth = monthKey(new Date().toISOString());
  const first = since ? monthKey(since) : mine[0] ? monthKey(mine[0].created_at) : nowMonth;
  const analytics = buildAnalytics(mine, myParts, monthRange(first, nowMonth));
  // what the lists behind the charts (click a bar, a slice or a part) are drawn from
  analytics.claimList = mine.map(claimBrief);
  analytics.partList = partBriefs(myParts);
  // the latest closed work orders, each with what was approved to the sub-dealer and whether it is invoiced yet
  analytics.recent = mine
    .filter((c) => c.status === "closed" && c.closed_at)
    .sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at))
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      claim_number: c.claim_number,
      work_order: c.work_order_number,
      dealer_work_order: c.dealer_work_order_number,
      vin: c.vin,
      labor_amount: c.labor_amount,
      closed_at: c.closed_at,
      invoiced: !!c.sub_invoiced_at,
    }));
  return analytics;
}

/**
 * The home dashboard's numbers from our own database for one period (see RANGES).
 * The money figures come from the revenue routine, which also asks the self-audit system and is slower, so they are apart.
 * Throws an Error with a readable message when the claims cannot be read.
 */
export async function loadAnalytics(admin, range = "6") {
  return analyticsFor(await readClaims(admin, sinceOf(range)), range);
}

/** The numbers for several periods at once ({ [range]: analytics }); the claims are read only once. */
export async function loadAnalyticsSet(admin, ranges = RANGES) {
  const read = await readClaims(admin, ranges.includes("all") ? null : ranges.map(sinceOf).reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)));
  return Object.fromEntries(ranges.map((r) => [r, analyticsFor(read, r)]));
}

// ---- work order by work order ---------------------------------------------------------------------------------------------------

/** One row per dealer work order (no suffix) + VIN; a claim without a dealer work order yet stands alone. */
function groupClaims(claims) {
  const groups = new Map();
  for (const c of claims) {
    const base = /^([A-Za-z]+-\d+)/.exec(c.dealer_work_order_number || "")?.[1]?.toUpperCase() || null;
    const key = base && c.vin ? `${base}|${String(c.vin).toUpperCase()}` : `claim:${c.id}`;
    const g = groups.get(key) || { key, workOrder: base, subWorkOrders: [], statuses: [], vin: c.vin, created: c.created_at, approved: null, claimIds: [] };
    if (c.work_order_number && !g.subWorkOrders.includes(c.work_order_number)) g.subWorkOrders.push(c.work_order_number);
    if (!g.statuses.includes(c.status)) g.statuses.push(c.status);
    if (c.created_at > g.created) g.created = c.created_at;
    if (c.labor_amount != null) g.approved = (g.approved ?? 0) + Number(c.labor_amount);
    g.claimIds.push(c.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
}

/** The rows of one period: the sub-dealer's side next to what the batch holds, and what the dealer is left with. */
function workOrderRows(claims, range, batch) {
  const since = sinceOf(range);
  const rows = groupClaims(claims.filter((c) => inRange(c.created_at, since)));
  const out = rows.map((g) => {
    const b = !batch.error ? batch.byKey[g.key] : null;
    const onBatch = !!b && b.claims > 0;
    return {
      key: g.key,
      workOrder: g.workOrder,
      subWorkOrders: g.subWorkOrders,
      created: g.created,
      statuses: g.statuses,
      approved: g.approved == null ? null : round2(g.approved),
      claimId: g.claimIds.length === 1 ? g.claimIds[0] : null,
      batch: onBatch ? { sar: b.adjusted_sar, usd: b.adjusted_usd, statuses: b.statuses || [] } : null,
      dealerRevenue: onBatch && g.approved != null ? round2(b.adjusted_sar - g.approved) : null,
    };
  });
  return { rows: out, batchAvailable: !batch.error };
}

async function readWorkOrderClaims(admin, since = null) {
  const claims = [];
  for (let from = 0; ; from += 1000) {
    let q = admin
      .from("claims")
      .select("id, status, created_at, labor_amount, work_order_number, dealer_work_order_number, vin")
      .eq("kind", "claim")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) throw new Error("Could not read the claims.");
    claims.push(...data);
    if (data.length < 1000) break;
  }
  return claims;
}

/**
 * "Work order by work order" for several periods ({ [range]: { rows, batchAvailable } }). What the dealer's claims batch holds is
 * asked once for all the work orders. Revenue to the dealer on a row = what the batch pays minus the labor approved to the
 * sub-dealer. Throws when the claims cannot be read.
 */
export async function loadWorkOrdersSet(admin, ranges = RANGES) {
  // only the work orders of the widest period asked for are read and go to the batch
  const widest = ranges.includes("all") ? null : ranges.map(sinceOf).reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
  const claims = await readWorkOrderClaims(admin, widest);
  const asked = groupClaims(claims.filter((c) => inRange(c.created_at, widest))).filter((g) => g.workOrder);
  const batch = await getBatchByWorkOrder(asked.map((g) => ({ key: g.key, work_order_no: g.workOrder, vin: g.vin })));
  return Object.fromEntries(ranges.map((r) => [r, workOrderRows(claims, r, batch)]));
}

/** "Work order by work order" for one period. */
export async function loadWorkOrders(admin, range = "6") {
  return (await loadWorkOrdersSet(admin, [range]))[range];
}
