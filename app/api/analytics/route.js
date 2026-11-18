import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAnalytics, monthKey, monthRange } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLAIM_COLUMNS =
  "id, claim_number, status, created_at, dealer_decision_at, parts_replied_at, parts_received_at, repair_completed_at, closed_at, labor_amount, times_returned, times_rejected, work_order_number, dealer_work_order_number, vin, sub_invoiced_at";

/** The first day of the month `n - 1` months before this one, as "YYYY-MM". */
function monthsAgo(n) {
  const now = monthKey(new Date().toISOString());
  let [y, m] = now.split("-").map(Number);
  m -= n - 1;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * The home dashboard's numbers from our own database (dealer, admin, manager). ?range=3 | 6 | 12 | all (months back).
 * The money figures come from /api/revenue, which also asks the self-audit system and is slower, so the page loads them apart.
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
  const admin = createAdminClient();
  const nowMonth = monthKey(new Date().toISOString());

  // all the claims in the range (a thousand at a time)
  const sinceMonth = range === "all" ? null : monthsAgo(Math.min(Math.max(parseInt(range, 10) || 6, 1), 60));
  const claims = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("claims").select(CLAIM_COLUMNS).eq("kind", "claim").order("created_at", { ascending: true }).range(from, from + 999);
    if (sinceMonth) q = q.gte("created_at", `${sinceMonth}-01T00:00:00+03:00`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: "Could not read the claims." }, { status: 500 });
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

  const analytics = buildAnalytics(claims, parts, months);
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

  // what waits for you
  const count = async (q) => (await q).count || 0;
  const [decide, review, returns, freeService, notInvoiced] = await Promise.all([
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "claim").in("status", ["submitted", "waiting_pa"])),
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "claim").eq("status", "repair_submitted")),
    count(admin.from("defect_returns").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "free_service").in("status", ["submitted", "invoice_submitted"])),
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("status", "closed").is("sub_invoiced_at", null)),
  ]);
  analytics.actions = [
    { key: "decide", label: "Waiting for your decision", count: decide, href: "/dashboard/dealer" },
    { key: "review", label: "After-repair evidence to review", count: review, href: "/dashboard/dealer" },
    { key: "returns", label: "Defected parts to check", count: returns, href: "/dashboard/defect-returns" },
    { key: "free", label: "Free Service to review", count: freeService, href: "/dashboard/free-service" },
    { key: "bill", label: "Closed, not invoiced yet", count: notInvoiced, href: "/dashboard/billing" },
  ];
  analytics.range = range;
  analytics.generatedAt = new Date().toISOString();
  return NextResponse.json(analytics);
}
