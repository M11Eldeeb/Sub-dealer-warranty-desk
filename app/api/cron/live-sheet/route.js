import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLiveSheet } from "@/lib/live-sheet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Same shared secret as the daily reminders job (kept in the cron_secret table). */
async function authorized(request) {
  const header = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && same(header, `Bearer ${process.env.CRON_SECRET}`)) return true;
  const { data } = await createAdminClient().from("cron_secret").select("secret").eq("id", 1).maybeSingle();
  return !!data?.secret && same(header, `Bearer ${data.secret}`);
}

/** Called every 15 minutes by the database scheduler (pg_cron): refreshes the live Google Sheet. */
export async function GET(request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const result = await syncLiveSheet();
    return NextResponse.json(result.skipped ? { skipped: result.skipped } : { ok: true, claims: result.claims, free_service: result.free_service, created: result.created });
  } catch (e) {
    console.error("Live sheet refresh failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
