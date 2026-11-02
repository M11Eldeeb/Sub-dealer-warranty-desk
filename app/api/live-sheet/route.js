import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveSheet, syncLiveSheet } from "@/lib/live-sheet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function whoIsAsking() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role ?? null;
}

/** Where the live Google Sheet is (dealer, admin and manager). */
export async function GET() {
  const role = await whoIsAsking();
  if (!["admin", "dealer", "manager"].includes(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const sheet = await getLiveSheet();
  return NextResponse.json({ url: sheet?.url ?? null, updatedAt: sheet?.updated_at ?? null, canRefresh: role !== "manager" });
}

/** Refresh the sheet now (dealer and admin); creates it the first time. */
export async function POST() {
  const role = await whoIsAsking();
  if (!["admin", "dealer"].includes(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  try {
    const result = await syncLiveSheet({ share: true });
    if (result.skipped) return NextResponse.json({ error: "Google Drive is not connected yet - connect it in Settings first." }, { status: 409 });
    return NextResponse.json({ url: result.url, updatedAt: result.updated_at, created: result.created, notShared: result.notShared });
  } catch (e) {
    console.error("Live sheet refresh failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update the Google Sheet." }, { status: 500 });
  }
}
