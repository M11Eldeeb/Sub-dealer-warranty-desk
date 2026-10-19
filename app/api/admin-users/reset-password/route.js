import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager, canManage } from "@/lib/require-manager";
import { generateTempPassword } from "@/lib/temp-password";

export const dynamic = "force-dynamic";

/** Sets a new temporary password for an account and returns it once. */
export async function POST(request) {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });

  const { userId } = (await request.json().catch(() => ({}))) || {};
  if (!userId) return NextResponse.json({ error: "Missing user." }, { status: 400 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (!canManage(who.role, target.role)) return NextResponse.json({ error: "Only an admin can change an admin account." }, { status: 403 });

  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tempPassword });
}
