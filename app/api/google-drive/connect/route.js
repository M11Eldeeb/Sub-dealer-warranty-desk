import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, driveConfig } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

/** Starts connecting the company Google account. Admins only. */
export async function GET(request) {
  const origin = new URL(request.url).origin;
  const back = (flag) => NextResponse.redirect(`${origin}/dashboard/dealer?drive=${flag}`);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Only an admin can connect Google Drive." }, { status: 403 });
  if (!driveConfig()) return back("not-configured");

  // A random value that must come back unchanged from Google, so a forged callback is rejected.
  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(buildAuthUrl(`${origin}/api/google-drive/callback`, state));
  response.cookies.set("gd_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/google-drive",
    maxAge: 600,
  });
  return response;
}
