import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAnalytics } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The home dashboard's numbers from our own database (dealer, admin, manager). ?range=1 | 3 | 6 | 12 | all (months back).
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

  let analytics;
  try {
    analytics = await loadAnalytics(admin, range);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // what waits for you
  const count = async (q) => (await q).count || 0;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [decide, review, returns, freeService, closedWeek, cache] = await Promise.all([
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "claim").in("status", ["submitted", "waiting_pa"])),
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "claim").eq("status", "repair_submitted")),
    count(admin.from("defect_returns").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "free_service").in("status", ["submitted", "invoice_submitted"])),
    count(admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "claim").eq("status", "closed").gte("closed_at", weekAgo)),
    admin.from("app_settings").select("value").eq("key", "revenue_cache").maybeSingle(),
  ]);
  analytics.closedThisWeek = closedWeek;
  // The money cards need the self-audit system, which is slow. The figures worked out last time ride along here, so those
  // cards appear together with the rest (the page then asks /api/revenue for fresh ones).
  analytics.revenueCached = cache?.data?.value?.rows ?? null;
  analytics.actions = [
    { key: "decide", label: "Waiting for your decision", count: decide, href: "/dashboard/dealer" },
    { key: "review", label: "After-repair evidence to review", count: review, href: "/dashboard/dealer" },
    { key: "returns", label: "Defected parts to check", count: returns, href: "/dashboard/defect-returns" },
    { key: "free", label: "Free Service to review", count: freeService, href: "/dashboard/free-service" },
  ];
  analytics.range = range;
  analytics.generatedAt = new Date().toISOString();
  return NextResponse.json(analytics);
}
