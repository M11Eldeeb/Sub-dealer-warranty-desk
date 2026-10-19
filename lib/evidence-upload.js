"use client";
import { sanitizeFileName } from "@/components/ui";

/** Where a claim attachment is opened from (the server decides access and where the bytes live). */
export const attachmentUrl = (attachmentId, { download = false } = {}) => `/api/drive/file/${attachmentId}${download ? "?download=1" : ""}`;

/** Removes one attachment (row + Drive file / storage file). Throws with a readable message if it is not allowed. */
export async function removeAttachment(attachmentId) {
  const res = await fetch("/api/drive/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId }) });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Could not remove the file (${res.status}).`);
  }
}

/** Asks the server to rename the claim's Drive folder after a work order changed. Best effort - never throws. */
export async function syncClaimFolder(claimId) {
  try {
    await fetch("/api/drive/claim-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId }) });
  } catch {}
}

/**
 * Saves evidence files for a claim. The files go to Google Drive (Sub Dealer Claims / <branch> / <work orders>):
 * the server opens an upload session per file, the browser sends the bytes straight to Google, then the server
 * checks them and saves the attachment rows. If Google Drive is not connected / unreachable, the old Supabase
 * storage is used instead so nobody is blocked.
 *
 * items: [{ file: File, name: string }] - `name` is what is stored and shown for the attachment.
 * Returns { uploaded: [name], failed: [{ name, message }] } - never throws.
 */
export async function uploadEvidence({ supabase, claimId, uploadedBy, stage, items }) {
  const result = { uploaded: [], failed: [] };
  if (!items.length) return result;
  const failAll = (message) => items.forEach((i) => result.failed.push({ name: i.name, message }));
  const mimeOf = (file) => file.type || "application/octet-stream";

  let session = null;
  try {
    const res = await fetch("/api/drive/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId, files: items.map((i) => ({ name: i.name, type: mimeOf(i.file), size: i.file.size })) }),
    });
    const json = await res.json().catch(() => ({}));
    session = res.ok ? json : { error: json.error || `The upload could not start (${res.status}).` };
  } catch {
    session = { error: "Could not reach the server - check your connection and try again." };
  }
  if (session.error) {
    failAll(session.error);
    return result;
  }

  if (session.sessions) {
    const sent = [];
    for (let i = 0; i < items.length; i++) {
      const { file, name } = items[i];
      try {
        const res = await fetch(session.sessions[i].sessionUrl, { method: "PUT", headers: { "Content-Type": mimeOf(file) }, body: file });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.id) throw new Error(`Google Drive did not accept the file (${res.status}).`);
        sent.push({ driveFileId: json.id, name });
      } catch (e) {
        result.failed.push({ name, message: e instanceof Error ? e.message : "The file could not be sent to Google Drive." });
      }
    }
    if (sent.length) {
      try {
        const res = await fetch("/api/drive/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId, stage, files: sent }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) sent.forEach((f) => result.failed.push({ name: f.name, message: json.error || `The files could not be saved (${res.status}).` }));
        else sent.forEach((f) => result.uploaded.push(f.name));
      } catch {
        sent.forEach((f) => result.failed.push({ name: f.name, message: "Could not reach the server - check your connection and try again." }));
      }
    }
    return result;
  }

  // Fallback: Google Drive is not available, keep using the Supabase storage bucket.
  for (const { file, name } of items) {
    const path = `${claimId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("evidence").upload(path, file);
    if (uploadError) {
      result.failed.push({ name, message: uploadError.message });
      continue;
    }
    const { error: rowError } = await supabase.from("claim_attachments").insert({ claim_id: claimId, file_path: path, file_name: name, stage, uploaded_by: uploadedBy });
    if (rowError) {
      await supabase.storage.from("evidence").remove([path]);
      result.failed.push({ name, message: rowError.message });
    } else result.uploaded.push(name);
  }
  return result;
}
