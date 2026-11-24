import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkOrders } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * "Work order by work order" (dealer, admin, manager): one row per dealer work order + VIN with the sub-dealer's claims on it
 * (the -1 / -2 suffix only says there are several) next to what the dealer's claims batch holds for the same car and work
 * order. Revenue to the dealer on a row = what the batch pays minus the labor approved to the sub-dealer. ?range=1|3|6|12|all
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
  try {
    return NextResponse.json(await loadWorkOrders(createAdminClient(), range));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
