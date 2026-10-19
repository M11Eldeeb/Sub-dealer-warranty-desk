import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email-templates";

export async function POST(request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: requesterProfile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(requesterProfile?.role)) {
    return NextResponse.json({ error: "Not authorized to trigger this notification." }, { status: 403 });
  }

  const { claimId } = await request.json();
  if (!claimId) {
    return NextResponse.json({ error: "Missing claim id." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim } = await admin
    .from("claims")
    .select("claim_number, work_order_number, dealer_work_order_number, vin, branches(name), claim_parts(name, part_number, qty)")
    .eq("id", claimId)
    .single();
  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  // Always start the reminder clock, even if there's no one to notify right now or the email fails —
  // so a parts_team account added later still gets caught by the daily reminder check.
  await admin
    .from("claims")
    .update({ awaiting_parts_since: new Date().toISOString(), parts_reminder_sent_at: null })
    .eq("id", claimId);

  try {
    const result = await sendTemplatedEmail(admin, "parts_needed", {
      claim,
      claimId,
      trigger: { id: user.id, email: user.email, name: requesterProfile.full_name },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
