import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DriveError, downloadFile } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves a claim attachment. Access is decided by the database: the attachment row is read as the
 * signed-in user, so nobody gets another branch's file. Files kept in Google Drive are streamed from
 * there (Range supported, so videos can seek). Add ?download=1 to force a download instead of showing it.
 */
export async function GET(request, { params }) {
  const { id } = params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: att } = await supabase.from("claim_attachments").select("id, file_path, file_name").eq("id", id).maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!att.file_path.startsWith("drive:")) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let upstream;
  try {
    upstream = await downloadFile(att.file_path.slice("drive:".length), request.headers.get("range"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof DriveError ? e.message : "Could not reach Google Drive." }, { status: 502 });
  }
  if (upstream.status === 404) return NextResponse.json({ error: "This file was removed from Google Drive." }, { status: 404 });
  if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "Could not read the file from Google Drive." }, { status: 502 });

  const type = upstream.headers.get("Content-Type") || "application/octet-stream";
  const forceDownload = new URL(request.url).searchParams.get("download") === "1";
  // Only photos, videos and PDFs are ever shown inline from our own domain (SVG can carry scripts).
  const showable = (type.startsWith("image/") && type !== "image/svg+xml") || type.startsWith("video/") || type === "application/pdf";
  const inline = !forceDownload && showable;

  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.file_name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  if (type !== "application/pdf") {
    // The sandbox keeps any script a file might carry from running; it would also break the PDF viewer, hence the exception.
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'");
  }
  for (const h of ["Content-Length", "Content-Range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
