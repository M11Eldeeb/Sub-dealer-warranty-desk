import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyDashboard } from "@/lib/weekly-dashboard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The same shared secret the daily reminders job uses (Vercel's CRON_SECRET too). */
async function authorized(request) {
  const header = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && same(header, `Bearer ${process.env.CRON_SECRET}`)) return true;
  const { data } = await createAdminClient().from("cron_secret").select("secret").eq("id", 1).maybeSingle();
  return !!data?.secret && same(header, `Bearer ${data.secret}`);
}

/**
 * Called every Wednesday at 07:00 UTC (10:00 AM Saudi time) by the database scheduler (pg_cron, job "weekly-dashboard"). Makes the
 * interactive dashboard file and e-mails it to the "Weekly dashboard" recipients in Settings. Sends at most once a day. (Every send, or failure, is in the e-mail log; this job does not write to cron_run_log, which Settings reads as the daily reminders' last run.)
 */
export async function GET(request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // the day in Saudi time
  const { data: last } = await admin.from("app_settings").select("value").eq("key", "weekly_dashboard_last_sent").maybeSingle();
  if (last?.value?.day === today) return NextResponse.json({ skipped: "already sent today" });

  try {
    const result = await sendWeeklyDashboard(admin);
    if (result.skipped) {
      return NextResponse.json({ skipped: "switched off" });
    }
    await admin.from("app_settings").upsert({ key: "weekly_dashboard_last_sent", value: { day: today, at: new Date().toISOString() }, updated_at: new Date().toISOString() });
    return NextResponse.json({ sent: true, to: result.to?.length ?? 0 });
  } catch (e) {
    console.error("Weekly dashboard failed:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
