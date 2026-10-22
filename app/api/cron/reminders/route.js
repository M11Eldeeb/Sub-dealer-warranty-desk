import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail, latestStatusEntry } from "@/lib/email-templates";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// The job runs once a day, a few seconds apart, so "a day later" is checked with an hour of slack.
// Without it a reminder sent at 06:00:03 would miss the next 06:00:01 run and slip to every second day.
const SLACK_MS = HOUR_MS;
const due = (sinceIso, waitMs, now) => now - new Date(sinceIso).getTime() >= waitMs - SLACK_MS;

export const dynamic = "force-dynamic";

/** Every run (and every refused call) is written down so Settings can show whether the daily job really ran. */
async function logRun(outcome, summary) {
  await createAdminClient().from("cron_run_log").insert({ outcome, summary }).then(() => undefined, () => undefined);
}

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Called every day at 06:00 UTC (9:00 AM Saudi time) by the database scheduler (pg_cron), which sends the shared
 * secret kept in the cron_secret table. Vercel's own CRON_SECRET is accepted too. (Vercel's free plan can only
 * promise "sometime in the hour", which is why the schedule lives in the database.)
 */
async function authorized(request) {
  const header = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && same(header, `Bearer ${process.env.CRON_SECRET}`)) return true;
  const { data } = await createAdminClient().from("cron_secret").select("secret").eq("id", 1).maybeSingle();
  return !!data?.secret && same(header, `Bearer ${data.secret}`);
}

export async function GET(request) {
  if (!(await authorized(request))) {
    await logRun("unauthorized", { headerSent: !!request.headers.get("authorization") });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const results = { partsReminders: 0, technicalReminders: 0, returnedReminders: 0, errors: [] };

  // ---------- Parts team ----------
  // Every day (9:00 AM Saudi time) while any part is still outstanding (Waiting Action, ICT or VOR), starting
  // 24h after approval. A part that is Supplied to Sub-Dealer (or cancelled / returned) is finished; once every
  // part is finished the reminders stop. Wording and recipients come from the "Parts team reminder" email in Settings.
  const OUTSTANDING = ["Waiting Action", "ICT", "VOR"];
  const { data: awaitingPartsClaims } = await admin
    .from("claims")
    .select(
      "id, branch_id, claim_number, work_order_number, dealer_work_order_number, vin, awaiting_parts_since, parts_reminder_sent_at, branches(name), claim_parts(name, part_number, qty, status)"
    )
    .eq("status", "awaiting_parts");

  for (const claim of awaitingPartsClaims || []) {
    if (!claim.awaiting_parts_since) continue;
    const parts = claim.claim_parts || [];
    const outstanding = parts.filter((p) => OUTSTANDING.includes(p.status));
    if (outstanding.length === 0) continue;

    const since = claim.parts_reminder_sent_at || claim.awaiting_parts_since;
    if (!due(since, DAY_MS, now)) continue;

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
      "id, branch_id, claim_number, work_order_number, dealer_work_order_number, vin, technical_review_since, last_technical_reminder_at, technical_review_requested_by, branches(name)"
    )
    .eq("status", "technical_review");

  for (const claim of techClaims || []) {
    const baseline = claim.last_technical_reminder_at || claim.technical_review_since;
    if (!baseline) continue;
    if (!due(baseline, DAY_MS, now)) continue;

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

  // ---------- Sub-dealer: every 24h while a claim (or its after-repair evidence) is still returned ----------
  const RETURN_LABELS = { returned: "returned for edit", repair_returned: "after-repair evidence returned" };
  const { data: returnedClaims } = await admin
    .from("claims")
    .select("id, branch_id, status, claim_number, work_order_number, dealer_work_order_number, vin, returned_since, last_returned_reminder_at, branches(name)")
    .in("status", Object.keys(RETURN_LABELS));

  for (const claim of returnedClaims || []) {
    // Claims returned before this reminder existed have no start time saved: use when the status log says they were returned.
    const entry = await latestStatusEntry(admin, claim.id, claim.status);
    const baseline = claim.last_returned_reminder_at || claim.returned_since || entry.at;
    if (!baseline) continue;
    if (!due(baseline, DAY_MS, now)) continue;

    try {
      const sent = await sendTemplatedEmail(admin, "returned_reminder", { claim, claimId: claim.id, reason: entry.note, returnType: RETURN_LABELS[claim.status] });
      if (sent.skipped) continue;
      await admin.from("claims").update({ last_returned_reminder_at: new Date().toISOString() }).eq("id", claim.id);
      results.returnedReminders++;
    } catch (err) {
      results.errors.push(`returned reminder for ${claim.claim_number}: ${err.message}`);
    }
  }

  await logRun(results.errors.length ? "error" : "ok", results);
  return NextResponse.json({ success: true, ...results });
}
