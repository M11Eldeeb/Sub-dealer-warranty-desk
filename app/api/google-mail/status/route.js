import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveConfig } from "@/lib/google-drive";
import { getMailStatus } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Which mailbox sends the site's e-mail (never the token) plus the last few sends. Dealer / admin only. */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const status = await getMailStatus();
  const { data: recent } = await createAdminClient()
    .from("email_log")
    .select("id, created_at, kind, recipients, subject, status, error")
    .order("created_at", { ascending: false })
    .limit(8);
  return NextResponse.json({
    configured: !!driveConfig(),
    connected: !!status,
    accountEmail: status?.accountEmail ?? null,
    connectedAt: status?.connectedAt ?? null,
    canConnect: profile.role === "admin",
    recent: recent ?? [],
  });
}
