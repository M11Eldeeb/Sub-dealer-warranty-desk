import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMailStatus, sendMail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Sends a test message to the signed-in person, so they can see the connection works. Dealer / admin only. */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!user.email) return NextResponse.json({ error: "Your account has no e-mail address." }, { status: 400 });

  const status = await getMailStatus();
  if (!status) return NextResponse.json({ error: "The e-mail sender is not connected yet." }, { status: 409 });

  const result = await sendMail({
    kind: "test",
    to: [user.email],
    subject: "WarrantyDesk test e-mail",
    html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;"><p>This is a test message from WarrantyDesk. The e-mail sender works.</p></div>`,
    sentBy: user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ sentTo: user.email, from: status.accountEmail });
}
