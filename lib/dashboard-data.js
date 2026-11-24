// SERVER-ONLY. The numbers behind the home dashboard, worked out with the service role so they can be used by the API routes
// (a signed-in dealer, admin or manager) and by the weekly e-mail (no one signed in).
import { buildAnalytics, claimBrief, dealerTurns, monthKey, monthRange, partBriefs } from "@/lib/analytics";
import { getBatchByWorkOrder } from "@/lib/self-audit-scrap";

const CLAIM_COLUMNS =
  "id, claim_number, status, created_at, dealer_decision_at, parts_replied_at, parts_received_at, repair_completed_at, closed_at, labor_amount, times_returned, times_rejected, work_order_number, dealer_work_order_number, vin, sub_invoiced_at";

const round2 = (n) => Math.round(n * 100) / 100;

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

/** The first month of a period ("YYYY-MM"), or null for all time. `range` is 1 | 3 | 6 | 12 | all. */
export const sinceMonthOf = (range) => (range === "all" ? null : monthsAgo(Math.min(Math.max(parseInt(range, 10) || 6, 1), 60)));

/**
 * The home dashboard's numbers from our own database. `range` = 1 | 3 | 6 | 12 | all (months back).
 * The money figures come from the revenue routine, which also asks the self-audit system and is slower, so they are apart.
 * Throws an Error with a readable message when the claims cannot be read.
 */
export async function loadAnalytics(admin, range = "6") {
  const nowMonth = monthKey(new Date().toISOString());

  // all the claims in the range (a thousand at a time)
  const sinceMonth = sinceMonthOf(range);
  const claims = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("claims").select(CLAIM_COLUMNS).eq("kind", "claim").order("created_at", { ascending: true }).range(from, from + 999);
    if (sinceMonth) q = q.gte("created_at", `${sinceMonth}-01T00:00:00+03:00`);
    const { data, error } = await q;
    if (error) throw new Error("Could not read the claims.");
    claims.push(...data);
    if (data.length < 1000) break;
  }

  const first = sinceMonth || (claims[0] ? monthKey(claims[0].created_at) : nowMonth);
  const months = monthRange(first, nowMonth);

  // the parts on those claims
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

  const analytics = buildAnalytics(claims, parts, months);
  // what the lists behind the charts (click a bar, a slice or a part) are drawn from
  analytics.claimList = claims.map(claimBrief);
  analytics.partList = partBriefs(parts);
  // the latest closed work orders, each with what was approved to the sub-dealer and whether it is invoiced yet
  analytics.recent = claims
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
 * "Work order by work order": one row per dealer work order + VIN with the sub-dealer's claims on it (the -1 / -2 suffix only
 * says there are several) next to what the dealer's claims batch holds for the same car and work order. Revenue to the dealer on a
 * row = what the batch pays minus the labor approved to the sub-dealer. Throws when the claims cannot be read.
 */
export async function loadWorkOrders(admin, range = "6") {
  const sinceMonth = sinceMonthOf(range);
  const since = sinceMonth ? `${sinceMonth}-01T00:00:00+03:00` : null;

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

  // one row per dealer work order (no suffix) + VIN; a claim without a dealer work order yet stands alone
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
  const rows = [...groups.values()].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

  const { byKey, error } = await getBatchByWorkOrder(rows.filter((g) => g.workOrder).map((g) => ({ key: g.key, work_order_no: g.workOrder, vin: g.vin })));
  const out = rows.map((g) => {
    const b = !error ? byKey[g.key] : null;
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
  return { rows: out, batchAvailable: !error };
}
