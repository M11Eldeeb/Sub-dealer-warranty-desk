import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/require-manager";

export const dynamic = "force-dynamic";

/** Every account on the site with its e-mail, role and branch. Dealer / admin only. */
export async function GET() {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });

  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: branches }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, branch_id"),
    admin.from("branches").select("id, name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emails = new Map();
  for (let page = 1; page <= 20; page++) {
    const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    for (const u of data.users) emails.set(u.id, { email: u.email, lastSignInAt: u.last_sign_in_at });
    if (data.users.length < 200) break;
  }
  const branchName = new Map((branches || []).map((b) => [b.id, b.name]));

  const users = (profiles || [])
    .map((p) => ({
      id: p.id,
      fullName: p.full_name,
      role: p.role,
      branch: p.branch_id ? branchName.get(p.branch_id) ?? null : null,
      email: emails.get(p.id)?.email ?? null,
      lastSignInAt: emails.get(p.id)?.lastSignInAt ?? null,
    }))
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
  return NextResponse.json({ users, me: who.user.id, myRole: who.role });
}
