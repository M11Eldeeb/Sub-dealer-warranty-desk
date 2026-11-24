import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAnalyticsSet, loadWorkOrdersSet } from "@/lib/dashboard-data";
import { buildDashboardFile } from "@/lib/dashboard-file";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Export dashboard -> "Interactive file" (dealer, admin, manager): the dashboard as one html file that opens on its own in a
 * browser, with the numbers of every period inside it (1 week, 1 month, 3, 6, 12 months, all time; the reader switches). ?range= is
 * the period it opens on. The revenue is what was worked out last time the dashboard was open (the file says when).
 */
export async function GET(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin", "manager"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const asked = new URL(request.url).searchParams.get("range");
  const initial = ["w", "1", "3", "6", "12", "all"].includes(asked) ? asked : "all";
  const admin = createAdminClient();

  try {
    const [analytics, workOrders, cache] = await Promise.all([
      loadAnalyticsSet(admin),
      loadWorkOrdersSet(admin).catch(() => null),
      admin.from("app_settings").select("value").eq("key", "revenue_cache").maybeSingle(),
    ]);
    const { html, fileName } = buildDashboardFile({ analytics, workOrders, revenue: cache.data?.value?.rows ?? null, revenueAt: cache.data?.value?.at ?? null, initial });
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "The file could not be made." }, { status: 500 });
  }
}
