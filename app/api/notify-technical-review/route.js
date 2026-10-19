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
    .select("claim_number, work_order_number, dealer_work_order_number, vin, branches(name)")
    .eq("id", claimId)
    .single();
  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  // Track when this review started and who to CC on reminders, so the daily cron knows when to nudge again.
  // Done before the send attempt so the reminder clock starts even if this first email fails.
  await admin
    .from("claims")
    .update({
      technical_review_since: new Date().toISOString(),
      last_technical_reminder_at: null,
      technical_review_requested_by: user.id,
    })
    .eq("id", claimId);

  try {
    const result = await sendTemplatedEmail(admin, "technical_review", {
      claim,
      claimId,
      trigger: { id: user.id, email: user.email, name: requesterProfile.full_name },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
