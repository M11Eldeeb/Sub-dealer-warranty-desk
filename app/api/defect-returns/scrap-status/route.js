import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScrapStatus, summarizeReturn } from "@/lib/self-audit-scrap";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Can the parts of a defected-parts return be scrapped? Dealer, admin and manager only.
 * GET /api/defect-returns/scrap-status              -> every return that is not cancelled
 * GET /api/defect-returns/scrap-status?returnId=ID  -> just that one
 * Answer: { returns: { [returnId]: { canScrap, total, ready, eligibleFrom, claims: { [claimId]: {...} } } } }
 */
export async function GET(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin", "manager"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const returnId = new URL(request.url).searchParams.get("returnId");
  let query = supabase
    .from("defect_returns")
    .select("id, status, defect_return_items(claim_id, claims(id, dealer_work_order_number, vin))")
    .neq("status", "cancelled");
  if (returnId) query = query.eq("id", returnId);
  const { data: returns, error } = await query;
  if (error) return NextResponse.json({ error: "Could not read the returns." }, { status: 500 });

  // one lookup per claim
  const claims = new Map();
  for (const r of returns || []) for (const i of r.defect_return_items || []) if (i.claims) claims.set(i.claims.id, i.claims);

  // two portal claims on the same work order and VIN can not be told apart in the batch: flag them
  const admin = createAdminClient();
  const wos = [...new Set([...claims.values()].map((c) => c.dealer_work_order_number).filter(Boolean))];
  const twinCount = {};
  if (wos.length) {
    const { data: same } = await admin.from("claims").select("dealer_work_order_number, vin").eq("kind", "claim").in("dealer_work_order_number", wos);
    for (const c of same || []) {
      const k = `${c.dealer_work_order_number}|${c.vin}`.toUpperCase();
      twinCount[k] = (twinCount[k] || 0) + 1;
    }
  }

  const items = [...claims.values()].map((c) => ({
    key: c.id,
    work_order_no: c.dealer_work_order_number || "",
    vin: c.vin || "",
    twins: twinCount[`${c.dealer_work_order_number}|${c.vin}`.toUpperCase()] || 1,
  }));

  const { byKey, error: linkError } = await getScrapStatus(items);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 502 });

  const out = {};
  for (const r of returns || []) {
    const claimIds = [...new Set((r.defect_return_items || []).map((i) => i.claim_id))];
    const summary = summarizeReturn(claimIds, byKey);
    if (!summary) continue;
    out[r.id] = { ...summary, claims: Object.fromEntries(claimIds.filter((id) => byKey[id]).map((id) => [id, byKey[id]])) };
  }
  return NextResponse.json({ returns: out });
}
