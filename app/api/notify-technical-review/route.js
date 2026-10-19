import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, claimInfoTable, claimLinkButton } from "@/lib/email";

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

  // Find every technical_team and admin account, and look up their real emails via the admin API
  // (profiles doesn't store email — only auth.users does, and that's only readable with the service role).
  const { data: recipientProfiles } = await admin.from("profiles").select("id, role").in("role", ["technical_team", "admin"]);

  const toEmails = [];
  const ccEmails = new Set();
  if (user.email) ccEmails.add(user.email);

  for (const p of recipientProfiles || []) {
    const { data: authUserResult } = await admin.auth.admin.getUserById(p.id);
    const email = authUserResult?.user?.email;
    if (!email) continue;
    if (p.role === "technical_team") toEmails.push(email);
    else ccEmails.add(email);
  }

  if (toEmails.length === 0) {
    return NextResponse.json({ error: "No technical team accounts exist to notify." }, { status: 400 });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
      <p>A claim needs technical verification before the dealer can move forward with it.</p>
      ${claimInfoTable(claim, [["Requested by", requesterProfile.full_name]])}
      ${claimLinkButton(claimId)}
    </div>
  `;

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
    await sendEmail({
      to: toEmails,
      cc: Array.from(ccEmails),
      subject: `Technical Verification Needed — Claim ${claim.claim_number}`,
      kind: "technical-review",
      sentBy: user.id,
      html,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  return NextResponse.json({ success: true, notified: toEmails.length, cced: ccEmails.size });
}
