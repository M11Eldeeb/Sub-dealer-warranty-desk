import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { driveConfig } from "@/lib/google-drive";
import { buildMailAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Starts connecting the mailbox the site sends e-mail from. Admins only. */
export async function GET(request) {
  const origin = new URL(request.url).origin;
  const back = (flag) => NextResponse.redirect(`${origin}/dashboard/settings?mail=${flag}`);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Only an admin can connect the e-mail sender." }, { status: 403 });
  if (!driveConfig()) return back("not-configured");

  // A random value that must come back unchanged from Google, so a forged callback is rejected.
  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(buildMailAuthUrl(`${origin}/api/google-mail/callback`, state));
  response.cookies.set("gm_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/google-mail",
    maxAge: 600,
  });
  return response;
}
