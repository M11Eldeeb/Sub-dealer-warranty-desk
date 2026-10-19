import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { driveConfig, getDriveStatus } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

/** Who the company Google Drive is connected as (never the token). Dealer / admin accounts only. */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const status = await getDriveStatus();
  return NextResponse.json({ configured: !!driveConfig(), connected: !!status, accountEmail: status?.accountEmail ?? null, connectedAt: status?.connectedAt ?? null });
}
