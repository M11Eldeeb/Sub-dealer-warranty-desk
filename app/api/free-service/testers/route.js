import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", status: 401 };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Only an admin can choose test accounts.", status: 403 };
  return { user };
}

/** Sub-dealer accounts, and which of them may use Free Service while it is locked for everyone else. */
export async function GET() {
  const who = await requireAdmin();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });
  const admin = createAdminClient();
  const [{ data: profiles }, { data: access }, { data: branches }] = await Promise.all([
    admin.from("profiles").select("id, full_name, branch_id").eq("role", "sub_dealer"),
    admin.from("free_service_access").select("user_id"),
    admin.from("branches").select("id, name"),
  ]);
  const allowed = new Set((access || []).map((a) => a.user_id));
  const branchName = new Map((branches || []).map((b) => [b.id, b.name]));
  const users = (profiles || [])
    .map((p) => ({ id: p.id, name: p.full_name, branch: branchName.get(p.branch_id) ?? null, allowed: allowed.has(p.id) }))
    .sort((a, b) => (a.branch || "").localeCompare(b.branch || "") || (a.name || "").localeCompare(b.name || ""));
  return NextResponse.json({ users });
}

/** Grants or removes test access for one sub-dealer account. */
export async function POST(request) {
  const who = await requireAdmin();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });
  const { userId, allowed } = (await request.json().catch(() => ({}))) || {};
  if (!userId || typeof allowed !== "boolean") return NextResponse.json({ error: "Missing value." }, { status: 400 });
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (target?.role !== "sub_dealer") return NextResponse.json({ error: "Only sub-dealer accounts can be given test access." }, { status: 400 });
  const { error } = allowed ? await admin.from("free_service_access").upsert({ user_id: userId }) : await admin.from("free_service_access").delete().eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
