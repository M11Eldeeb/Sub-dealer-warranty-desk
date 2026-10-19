import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DriveError, ensureClaimFolder, getDriveStatus, getFileMeta, trashFile } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGES = ["evidence_before", "after_repair", "part_requisition"];

/**
 * Step 3 of attaching files: after the browser has sent the bytes to Google, re-checks every file against
 * Google itself (it exists, is not trashed and sits in this claim's folder, so an invented id cannot get in)
 * and then saves the attachment rows AS THE SIGNED-IN USER - the database rules decide who may add evidence
 * at which stage, exactly as before.
 */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const claimId = body?.claimId;
  const stage = body?.stage;
  const files = Array.isArray(body?.files) ? body.files : [];
  if (!UUID.test(claimId || "") || !STAGES.includes(stage) || files.length < 1) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { data: claim } = await supabase
    .from("claims")
    .select("id, branch_id, claim_number, work_order_number, dealer_work_order_number, branches(name)")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (!(await getDriveStatus())) return NextResponse.json({ error: "Google Drive is not connected." }, { status: 409 });

  let folderId;
  const verified = [];
  try {
    folderId = await ensureClaimFolder({ claim, branchName: claim.branches?.name, create: false });
    if (!folderId) return NextResponse.json({ error: "The upload folder was not found - please attach the files again." }, { status: 400 });
    const unique = files.filter((f, i) => f && typeof f.driveFileId === "string" && files.findIndex((g) => g?.driveFileId === f.driveFileId) === i);
    const metas = await Promise.all(unique.map((f) => getFileMeta(f.driveFileId)));
    for (let i = 0; i < unique.length; i++) {
      const meta = metas[i];
      if (!meta || meta.trashed || !meta.parents.includes(folderId) || meta.size < 1) {
        return NextResponse.json({ error: `"${unique[i].name}" did not finish uploading - please attach it again.` }, { status: 400 });
      }
      verified.push({ driveFileId: meta.id, name: String(unique[i].name || meta.name).slice(0, 250) });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof DriveError ? e.message : "Could not check the files with Google Drive." }, { status: 502 });
  }

  const { data: rows, error } = await supabase
    .from("claim_attachments")
    .insert(verified.map((f) => ({ claim_id: claimId, file_path: `drive:${f.driveFileId}`, file_name: f.name, stage, uploaded_by: user.id })))
    .select("id, file_name");
  if (error || !rows) {
    // Not allowed to attach here: do not leave the freshly uploaded files lying around in Drive.
    await Promise.all(verified.map((f) => trashFile(f.driveFileId).catch(() => false)));
    return NextResponse.json({ error: error?.message ?? "Could not save the attachments." }, { status: 403 });
  }
  return NextResponse.json({ attachments: rows });
}
