import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBatchByWorkOrder } from "@/lib/self-audit-scrap";
import { monthKey } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * "Work order by work order" (dealer, admin, manager): one row per dealer work order + VIN with the sub-dealer's claims on it
 * (the -1 / -2 suffix only says there are several) next to what the dealer's claims batch holds for the same car and work
 * order. Revenue to the dealer on a row = what the batch pays minus the labor approved to the sub-dealer. ?range=3|6|12|all
 */
export async function GET(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin", "manager"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const range = new URL(request.url).searchParams.get("range") || "6";
  let since = null;
  if (range !== "all") {
    const n = Math.min(Math.max(parseInt(range, 10) || 6, 1), 60);
    let [y, m] = monthKey(new Date().toISOString()).split("-").map(Number);
    m -= n - 1;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    since = `${y}-${String(m).padStart(2, "0")}-01T00:00:00+03:00`;
  }

  const admin = createAdminClient();
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
    if (error) return NextResponse.json({ error: "Could not read the claims." }, { status: 500 });
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
  return NextResponse.json({ rows: out, batchAvailable: !error });
}
