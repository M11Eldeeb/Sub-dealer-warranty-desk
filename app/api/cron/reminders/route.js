import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email-templates";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const results = { partsReminders: 0, technicalReminders: 0, errors: [] };

  // ---------- Parts team: single reminder, 24h after approval, only if untouched ----------
  // Wording and recipients come from the "Parts team reminder" email in Settings.
  const { data: awaitingPartsClaims } = await admin
    .from("claims")
    .select(
      "id, claim_number, work_order_number, dealer_work_order_number, vin, awaiting_parts_since, parts_reminder_sent_at, branches(name), claim_parts(name, part_number, qty, status)"
    )
    .eq("status", "awaiting_parts");

  for (const claim of awaitingPartsClaims || []) {
    if (claim.parts_reminder_sent_at || !claim.awaiting_parts_since) continue;
    if (now - new Date(claim.awaiting_parts_since).getTime() < DAY_MS) continue;
    const untouched = (claim.claim_parts || []).every((p) => p.status === "Waiting Action");
    if (!untouched || claim.claim_parts.length === 0) continue;

    try {
      const sent = await sendTemplatedEmail(admin, "parts_reminder", { claim, claimId: claim.id });
      if (sent.skipped) continue;
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

  for (const claim of techClaims || []) {
    const baseline = claim.last_technical_reminder_at || claim.technical_review_since;
    if (!baseline) continue;
    if (now - new Date(baseline).getTime() < DAY_MS) continue;

    try {
      const sent = await sendTemplatedEmail(admin, "technical_reminder", {
        claim,
        claimId: claim.id,
        trigger: { id: claim.technical_review_requested_by },
      });
      if (sent.skipped) continue;
      await admin.from("claims").update({ last_technical_reminder_at: new Date().toISOString() }).eq("id", claim.id);
      results.technicalReminders++;
    } catch (err) {
      results.errors.push(`technical reminder for ${claim.claim_number}: ${err.message}`);
    }
  }

  return NextResponse.json({ success: true, ...results });
}
