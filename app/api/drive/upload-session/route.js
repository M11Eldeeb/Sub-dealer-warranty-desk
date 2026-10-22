import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DriveError, ensureClaimFolder, getDriveStatus, safeDriveName, startResumableUpload, fetchClaimForFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILES = 60;

/**
 * Step 1 of attaching files: makes sure the claim's Drive folder exists (Sub Dealer Claims / <branch> /
 * <work orders>) and opens one upload session per file. The browser then sends each file straight to Google.
 * Access is decided by the database: the claim is read as the signed-in user.
 * If Google Drive is not connected (or unreachable) the answer is { fallback: true } and the page keeps
 * using the old Supabase storage, so nobody is blocked from attaching evidence.
 */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role === "manager") return NextResponse.json({ error: "Managers can view but not change anything." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const claimId = body?.claimId;
  const files = Array.isArray(body?.files) ? body.files : [];
  if (!UUID.test(claimId || "")) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (files.length < 1 || files.length > MAX_FILES) return NextResponse.json({ error: `Attach between 1 and ${MAX_FILES} files at a time.` }, { status: 400 });
  for (const f of files) {
    if (!f || typeof f.name !== "string" || !(Number(f.size) >= 1)) return NextResponse.json({ error: "A file looks empty or invalid." }, { status: 400 });
  }

  const claim = await fetchClaimForFolder(supabase, claimId);
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });

  if (!(await getDriveStatus())) return NextResponse.json({ fallback: true, reason: "not-connected" });

  const origin = request.headers.get("origin") || new URL(request.url).origin;
  try {
    const parentId = await ensureClaimFolder({ claim, branchName: claim.branches?.name });
    const sessions = await Promise.all(
      files.map(async (f) => ({
        sessionUrl: await startResumableUpload({
          parentId,
          name: safeDriveName(f.name),
          mimeType: typeof f.type === "string" && f.type ? f.type : "application/octet-stream",
          size: Number(f.size),
          origin,
        }),
      }))
    );
    return NextResponse.json({ sessions });
  } catch (e) {
    console.error("Drive upload session failed, falling back to Supabase storage:", e instanceof Error ? e.message : e);
    return NextResponse.json({ fallback: true, reason: e instanceof DriveError ? e.message : "drive-error" });
  }
}
