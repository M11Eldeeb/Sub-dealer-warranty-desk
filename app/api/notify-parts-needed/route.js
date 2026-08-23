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
    .select("claim_number, work_order_number, dealer_work_order_number, vin, branches(name), claim_parts(name, part_number, qty)")
    .eq("id", claimId)
    .single();
  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  const { data: partsTeamProfiles } = await admin.from("profiles").select("id").eq("role", "parts_team");

  const toEmails = [];
  for (const p of partsTeamProfiles || []) {
    const { data: authUserResult } = await admin.auth.admin.getUserById(p.id);
    const email = authUserResult?.user?.email;
    if (email) toEmails.push(email);
  }

  // Always start the reminder clock, even if there's no one to notify right now or the email fails —
  // so a parts_team account added later still gets caught by the daily reminder check.
  await admin
    .from("claims")
    .update({ awaiting_parts_since: new Date().toISOString(), parts_reminder_sent_at: null })
    .eq("id", claimId);

  if (toEmails.length === 0) {
    return NextResponse.json({ error: "No parts team accounts exist to notify." }, { status: 400 });
  }

  const partsRows = (claim.claim_parts || [])
    .map((p) => `${p.name}${p.part_number ? ` (${p.part_number})` : ""} x${p.qty}`)
    .join("<br/>") || "—";

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
      <p>A claim was just approved and needs parts sourced for <b>${claim.branches?.name || "this branch"}</b>.</p>
      ${claimInfoTable(claim, [["Parts needed", partsRows]])}
      ${claimLinkButton(claimId)}
    </div>
  `;

  try {
    await sendEmail({
      to: toEmails,
      subject: `Parts Needed — Claim ${claim.claim_number} (${claim.branches?.name || "branch"})`,
      html,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  return NextResponse.json({ success: true, notified: toEmails.length });
}
