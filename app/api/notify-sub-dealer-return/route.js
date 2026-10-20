import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const TYPES = {
  returned: { key: "claim_returned", status: "returned", label: "returned for edit" },
  repair_returned: { key: "repair_returned", status: "repair_returned", label: "after-repair evidence returned" },
};

/**
 * Tells the sub-dealer's branch accounts that their claim (or its after-repair evidence) was returned,
 * and starts the daily reminder clock. Dealer / admin only, and only while the claim really is in that status.
 */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: requester } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(requester?.role)) return NextResponse.json({ error: "Not authorized to trigger this notification." }, { status: 403 });

  const { claimId, type, reason } = (await request.json().catch(() => ({}))) || {};
  const kind = TYPES[type];
  if (!claimId || !kind) return NextResponse.json({ error: "Missing claim or type." }, { status: 400 });

  const admin = createAdminClient();
  const { data: claim } = await admin
    .from("claims")
    .select("status, branch_id, claim_number, work_order_number, dealer_work_order_number, vin, branches(name)")
    .eq("id", claimId)
    .single();
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (claim.status !== kind.status) return NextResponse.json({ error: "The claim is not in that status." }, { status: 409 });

  // Start the daily reminder clock before sending, so it runs even if this first email fails.
  await admin.from("claims").update({ returned_since: new Date().toISOString(), last_returned_reminder_at: null }).eq("id", claimId);

  try {
    const result = await sendTemplatedEmail(admin, kind.key, {
      claim,
      claimId,
      trigger: { id: user.id, email: user.email, name: requester.full_name },
      reason: String(reason ?? "").slice(0, 2000),
      returnType: kind.label,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
