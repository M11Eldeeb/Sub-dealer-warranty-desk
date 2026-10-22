import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Opens or locks Free Service for sub-dealers. Admins only. */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Only an admin can open or lock Free Service." }, { status: 403 });

  const { open } = (await request.json().catch(() => ({}))) || {};
  if (typeof open !== "boolean") return NextResponse.json({ error: "Missing value." }, { status: 400 });

  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: "free_service_open", value: open, updated_at: new Date().toISOString(), updated_by: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ open });
}
