import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Is Free Service open for sub-dealers, and (for dealer / admin) how many requests wait for a decision.
 * Sub-dealers only ever learn whether it is open.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const admin = createAdminClient();
  const role = profile?.role;
  const isStaff = role === "admin" || role === "dealer";
  const [{ data: setting }, { data: tester }, pendingResult] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "free_service_open").maybeSingle(),
    admin.from("free_service_access").select("user_id").eq("user_id", user.id).maybeSingle(),
    isStaff ? admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "free_service").in("status", ["submitted", "invoice_submitted"]) : Promise.resolve(null),
  ]);
  const globalOpen = setting?.value === true;
  const open = globalOpen || !!tester;
  const canUse = isStaff || role === "manager" || (role === "sub_dealer" && open);
  const pending = isStaff ? pendingResult?.count ?? 0 : null;
  return NextResponse.json({ userId: user.id, open, globalOpen, canUse, role, pending });
}
