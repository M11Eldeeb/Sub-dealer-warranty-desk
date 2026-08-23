import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, claimInfoTable, claimLinkButton } from "@/lib/email";

const DAY_MS = 24 * 60 * 60 * 1000;

async function getEmailsForRole(admin, role) {
  const { data: profiles } = await admin.from("profiles").select("id").eq("role", role);
  const emails = [];
  for (const p of profiles || []) {
    const { data: authUserResult } = await admin.auth.admin.getUserById(p.id);
    if (authUserResult?.user?.email) emails.push(authUserResult.user.email);
  }
  return emails;
}

async function getEmailById(admin, id) {
  if (!id) return null;
  const { data: authUserResult } = await admin.auth.admin.getUserById(id);
  return authUserResult?.user?.email || null;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const results = { partsReminders: 0, technicalReminders: 0, errors: [] };

  // ---------- Parts team: single reminder, 24h after approval, only if untouched ----------
  const { data: awaitingPartsClaims } = await admin
    .from("claims")
    .select(
      "id, claim_number, work_order_number, dealer_work_order_number, vin, awaiting_parts_since, parts_reminder_sent_at, branches(name), claim_parts(name, part_number, qty, status)"
    )
    .eq("status", "awaiting_parts");

  const partsTeamEmails = await getEmailsForRole(admin, "parts_team");

  for (const claim of awaitingPartsClaims || []) {
    if (claim.parts_reminder_sent_at || !claim.awaiting_parts_since) continue;
    if (now - new Date(claim.awaiting_parts_since).getTime() < DAY_MS) continue;
    const untouched = (claim.claim_parts || []).every((p) => p.status === "Waiting Action");
    if (!untouched || claim.claim_parts.length === 0) continue;
    if (partsTeamEmails.length === 0) continue;

    const partsRows = claim.claim_parts.map((p) => `${p.name}${p.part_number ? ` (${p.part_number})` : ""} x${p.qty}`).join("<br/>");
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
        <p><b>Reminder:</b> this claim has been waiting on parts action for over 24 hours, for <b>${claim.branches?.name || "this branch"}</b>.</p>
        ${claimInfoTable(claim, [["Parts needed", partsRows]])}
        ${claimLinkButton(claim.id)}
      </div>
    `;

    try {
      await sendEmail({
        to: partsTeamEmails,
        subject: `Reminder: Parts Needed — Claim ${claim.claim_number} (${claim.branches?.name || "branch"})`,
        html,
      });
      await admin.from("claims").update({ parts_reminder_sent_at: new Date().toISOString() }).eq("id", claim.id);
      results.partsReminders++;
    } catch (err) {
      results.errors.push(`parts reminder for ${claim.claim_number}: ${err.message}`);
    }
  }

  // ---------- Technical team: recurring reminder, every 24h while still pending ----------
  const { data: techClaims } = await admin
    .from("claims")
    .select(
      "id, claim_number, work_order_number, dealer_work_order_number, vin, technical_review_since, last_technical_reminder_at, technical_review_requested_by, branches(name)"
    )
    .eq("status", "technical_review");

  const technicalTeamEmails = await getEmailsForRole(admin, "technical_team");
  const adminEmails = await getEmailsForRole(admin, "admin");

  for (const claim of techClaims || []) {
    const baseline = claim.last_technical_reminder_at || claim.technical_review_since;
    if (!baseline) continue;
    if (now - new Date(baseline).getTime() < DAY_MS) continue;
    if (technicalTeamEmails.length === 0) continue;

    const requesterEmail = await getEmailById(admin, claim.technical_review_requested_by);
    const cc = new Set(adminEmails);
    if (requesterEmail) cc.add(requesterEmail);

    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
        <p><b>Reminder:</b> this claim is still waiting on technical verification.</p>
        ${claimInfoTable(claim, [])}
        ${claimLinkButton(claim.id)}
      </div>
    `;

    try {
      await sendEmail({
        to: technicalTeamEmails,
        cc: Array.from(cc),
        subject: `Reminder: Technical Verification Needed — Claim ${claim.claim_number}`,
        html,
      });
      await admin.from("claims").update({ last_technical_reminder_at: new Date().toISOString() }).eq("id", claim.id);
      results.technicalReminders++;
    } catch (err) {
      results.errors.push(`technical reminder for ${claim.claim_number}: ${err.message}`);
    }
  }

  return NextResponse.json({ success: true, ...results });
}
