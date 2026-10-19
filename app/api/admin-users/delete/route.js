import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager, canManage } from "@/lib/require-manager";

export const dynamic = "force-dynamic";

/** Deletes an account. Fails safely (and says so) when the person has claims or history on record. */
export async function POST(request) {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });

  const { userId } = (await request.json().catch(() => ({}))) || {};
  if (!userId) return NextResponse.json({ error: "Missing user." }, { status: 400 });
  if (userId === who.user.id) return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (!canManage(who.role, target.role)) return NextResponse.json({ error: "Only an admin can delete an admin account." }, { status: 403 });

  // Records point at the profile with no cascade, so an account that has any is refused (the auth API's own
  // error text for this is unhelpful). Deleting the login is what actually revokes access.
  const checks = await Promise.all([
    admin.from("claims").select("id", { count: "exact", head: true }).or(`created_by.eq.${userId},technical_review_requested_by.eq.${userId}`),
    admin.from("claim_attachments").select("id", { count: "exact", head: true }).eq("uploaded_by", userId),
    admin.from("part_return_requests").select("id", { count: "exact", head: true }).eq("requested_by", userId),
  ]);
  if (checks.some((c) => (c.count ?? 0) > 0)) {
    return NextResponse.json(
      { error: `Can't delete ${target.full_name || "this account"} - they have claims, uploads or history on record. Reset their password instead if you need to stop them using it.` },
      { status: 409 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message || "Could not delete the account." }, { status: 400 });
  return NextResponse.json({ success: true });
}
