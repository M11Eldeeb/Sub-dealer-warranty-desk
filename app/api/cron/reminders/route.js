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

  // ---------- Parts team ----------
  // Reminds only while parts are still outstanding (Waiting Action, ICT or VOR); a part that is Supplied to
  // Sub-Dealer (or cancelled / returned) is finished and never triggers one.
  //  - first reminder: 24h after approval if nobody has changed any part status yet, otherwise 5 days after approval
  //  - then every 5 days after the previous reminder
  // Wording and recipients come from the "Parts team reminder" email in Settings.
  const OUTSTANDING = ["Waiting Action", "ICT", "VOR"];
  const { data: awaitingPartsClaims } = await admin
    .from("claims")
    .select(
      "id, claim_number, work_order_number, dealer_work_order_number, vin, awaiting_parts_since, parts_reminder_sent_at, branches(name), claim_parts(name, part_number, qty, status)"
    )
    .eq("status", "awaiting_parts");

  for (const claim of awaitingPartsClaims || []) {
    if (!claim.awaiting_parts_since) continue;
    const parts = claim.claim_parts || [];
    const outstanding = parts.filter((p) => OUTSTANDING.includes(p.status));
    if (outstanding.length === 0) continue;

    let waitMs, since;
    if (claim.parts_reminder_sent_at) {
      waitMs = 5 * DAY_MS;
      since = claim.parts_reminder_sent_at;
    } else {
      const untouched = parts.every((p) => p.status === "Waiting Action");
      waitMs = untouched ? DAY_MS : 5 * DAY_MS;
      since = claim.awaiting_parts_since;
    }
    if (now - new Date(since).getTime() < waitMs) continue;

    try {
      // The email lists only what is still outstanding, with its current status.
      const listed = { ...claim, claim_parts: outstanding.map((p) => ({ ...p, name: `${p.name} — ${p.status}` })) };
      const sent = await sendTemplatedEmail(admin, "parts_reminder", { claim: listed, claimId: claim.id });
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
