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
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "free_service_open").maybeSingle();
  const globalOpen = setting?.value === true;
  const { data: tester } = await admin.from("free_service_access").select("user_id").eq("user_id", user.id).maybeSingle();
  const open = globalOpen || !!tester;

  const role = profile?.role;
  const canUse = role === "admin" || role === "dealer" || (role === "sub_dealer" && open);
  let pending = null;
  if (role === "admin" || role === "dealer") {
    const { count } = await admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "free_service").in("status", ["submitted", "invoice_submitted"]);
    pending = count ?? 0;
  }
  return NextResponse.json({ open, globalOpen, canUse, role, pending });
}
