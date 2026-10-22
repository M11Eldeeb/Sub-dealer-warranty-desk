import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

// event -> the email, the status the request must be in, and who may trigger it
const EVENTS = {
  submitted: { key: "fs_submitted", status: "submitted", by: ["sub_dealer", "dealer", "admin"] },
  approved: { key: "fs_approved", status: "approved", by: ["dealer", "admin"] },
  returned: { key: "fs_returned", status: "returned", by: ["dealer", "admin"] },
  rejected: { key: "fs_rejected", status: "rejected", by: ["dealer", "admin"] },
  invoice_submitted: { key: "fs_invoice_submitted", status: "invoice_submitted", by: ["sub_dealer", "dealer", "admin"] },
  invoice_returned: { key: "fs_invoice_returned", status: "invoice_returned", by: ["dealer", "admin"] },
  completed: { key: "fs_completed", status: "closed", by: ["dealer", "admin"] },
  cancelled: { key: "fs_cancelled", status: "cancelled", by: ["sub_dealer"] },
};

/** Sends the e-mail for a step of a Free Service request. A failed e-mail never blocks the step itself. */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();

  const { claimId, event, reason } = (await request.json().catch(() => ({}))) || {};
  const step = EVENTS[event];
  if (!claimId || !step) return NextResponse.json({ error: "Missing request or event." }, { status: 400 });
  if (!step.by.includes(me?.role)) return NextResponse.json({ error: "Not authorized to trigger this notification." }, { status: 403 });

  // Visible to the person asking (so a locked sub-dealer cannot trigger anything).
  const { data: visible } = await supabase.from("claims").select("id").eq("id", claimId).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: claim } = await admin
    .from("claims")
    .select("id, kind, status, branch_id, claim_number, vin, mileage, service_requested, work_order_number, dealer_work_order_number, approved_amount, branches(name)")
    .eq("id", claimId)
    .single();
  if (!claim || claim.kind !== "free_service") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (claim.status !== step.status) return NextResponse.json({ error: "The request is not in that status." }, { status: 409 });

  if (event === "returned" || event === "invoice_returned") {
    await admin.from("claims").update({ returned_since: new Date().toISOString() }).eq("id", claimId);
  }

  try {
    const result = await sendTemplatedEmail(admin, step.key, {
      claim,
      claimId,
      trigger: { id: user.id, email: user.email, name: me.full_name },
      reason: String(reason ?? "").slice(0, 2000),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
