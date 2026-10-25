import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Is Free Service open for sub-dealers, and (for dealer / admin) how many requests wait for a decision.
 * Sub-dealers only ever learn whether it is open.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, branch_id").eq("id", user.id).single();

  const admin = createAdminClient();
  const role = profile?.role;
  const isStaff = role === "admin" || role === "dealer";
  const [{ data: setting }, { data: tester }, pendingResult] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "free_service_open").maybeSingle(),
    admin.from("free_service_access").select("user_id").eq("user_id", user.id).maybeSingle(),
    isStaff ? admin.from("claims").select("id", { count: "exact", head: true }).eq("kind", "free_service").in("status", ["submitted", "invoice_submitted"]) : Promise.resolve(null),
  ]);
  const globalOpen = setting?.value === true;
  const open = globalOpen || !!tester;
  const canUse = isStaff || role === "manager" || (role === "sub_dealer" && open);
  const pending = isStaff ? pendingResult?.count ?? 0 : null;
  const actions = await menuActions(admin, role, profile?.branch_id, canUse);
  return NextResponse.json({ userId: user.id, open, globalOpen, canUse, role, pending, actions });
}

/** How many things in each menu entry wait for this person (shown as a red dot). Managers only watch, so nothing waits for them. */
async function menuActions(admin, role, branchId, canUse) {
  const count = async (q) => (await q).count ?? 0;
  const head = { count: "exact", head: true };

  if (role === "admin" || role === "dealer") {
    const [claims, free, defects] = await Promise.all([
      count(admin.from("claims").select("id", head).eq("kind", "claim").in("status", ["submitted", "waiting_pa", "repair_submitted"])),
      count(admin.from("claims").select("id", head).eq("kind", "free_service").in("status", ["submitted", "invoice_submitted"])),
      count(admin.from("defect_returns").select("id", head).eq("status", "submitted")),
    ]);
    return { claims, free, defects };
  }

  if (role === "sub_dealer" && branchId) {
    const [claims, free, closed, reserved] = await Promise.all([
      count(admin.from("claims").select("id", head).eq("kind", "claim").eq("branch_id", branchId).in("status", ["returned", "parts_arrived", "repair_returned", "parts_return"])),
      canUse ? count(admin.from("claims").select("id", head).eq("kind", "free_service").eq("branch_id", branchId).in("status", ["returned", "invoice_returned", "approved"])) : Promise.resolve(0),
      admin.from("claims").select("id, status, parts_received_at, claim_parts(id, status, defected_arrived_at)").eq("kind", "claim").eq("branch_id", branchId).in("status", ["closed", "rejected"]),
      admin.from("defect_return_items").select("part_id, defect_returns(status)").eq("decision", "pending"),
    ]);
    const held = new Set((reserved.data || []).filter((i) => i.defect_returns?.status === "submitted").map((i) => i.part_id));
    // closed claims that still have a defective part here which is not on its way to the dealer
    const defects = (closed.data || []).filter((c) => (c.claim_parts || []).some((p) => (c.status === "closed" || (c.parts_received_at && p.status === "Supplied to Sub-Dealer")) && !p.defected_arrived_at && !held.has(p.id))).length;
    return { claims, free, defects };
  }

  return { claims: 0, free: 0, defects: 0 };
}
