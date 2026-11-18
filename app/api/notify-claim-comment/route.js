import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/**
 * E-mails a comment that was just added to a claim's history.
 *  - dealer / admin wrote it -> the sub-dealer's branch accounts, nobody else
 *  - sub-dealer wrote it     -> one person (the "Comment from the sub-dealer" e-mail in Settings: Mostafa), nobody else
 * It comes from the person who wrote it (their name; the address is the company mailbox) and replies go to their own address.
 * Parts-team and technical-team comments are not e-mailed. Each comment is e-mailed at most once.
 */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: requester } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();

  const { logId } = (await request.json().catch(() => ({}))) || {};
  if (!logId) return NextResponse.json({ error: "Missing comment." }, { status: 400 });

  const admin = createAdminClient();
  const { data: entry } = await admin.from("claim_status_log").select("id, claim_id, kind, actor_name, actor_role, note, at, emailed_at").eq("id", logId).maybeSingle();
  if (!entry || entry.kind !== "comment") return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  // only the author can ask for the e-mail, and only right after writing the comment
  if (entry.actor_name !== requester?.full_name || entry.actor_role !== requester?.role) return NextResponse.json({ error: "Not your comment." }, { status: 403 });
  if (Date.now() - Date.parse(entry.at) > 10 * 60 * 1000) return NextResponse.json({ error: "Too late to e-mail this comment." }, { status: 409 });
  if (entry.emailed_at) return NextResponse.json({ skipped: true });

  const key = ["dealer", "admin"].includes(requester.role) ? "comment_to_sub_dealer" : requester.role === "sub_dealer" ? "comment_to_dealer" : null;
  if (!key) return NextResponse.json({ skipped: true });

  const { data: claim } = await admin
    .from("claims")
    .select("id, kind, status, branch_id, claim_number, work_order_number, dealer_work_order_number, vin, service_requested, approved_amount, branches(name)")
    .eq("id", entry.claim_id)
    .single();
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });

  try {
    const result = await sendTemplatedEmail(admin, key, {
      claim,
      claimId: claim.id,
      trigger: { id: user.id, email: user.email, name: requester.full_name },
      comment: entry.note,
      commenter: requester.full_name,
      fromName: `${requester.full_name} (Warranty Desk)`,
      replyTo: user.email,
    });
    if (result.sent) await admin.from("claim_status_log").update({ emailed_at: new Date().toISOString() }).eq("id", entry.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
