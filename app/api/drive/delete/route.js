import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trashFile } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Removes one attachment. The row is deleted AS THE SIGNED-IN USER, so the database rules decide who may remove
 * evidence at which stage, exactly as before; only if that worked is the Drive file moved to the Drive trash
 * (still recoverable there for 30 days).
 */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body?.attachmentId;
  if (!UUID.test(id || "")) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: att } = await supabase.from("claim_attachments").select("id, file_path").eq("id", id).maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: deleted, error } = await supabase.from("claim_attachments").delete().eq("id", id).select("id");
  if (error || !deleted || deleted.length === 0) return NextResponse.json({ error: error?.message ?? "You cannot remove this file." }, { status: 403 });

  if (att.file_path.startsWith("drive:")) {
    await trashFile(att.file_path.slice("drive:".length)).catch((e) => console.error("Could not trash the Drive file:", e instanceof Error ? e.message : e));
  }
  return NextResponse.json({ ok: true });
}
