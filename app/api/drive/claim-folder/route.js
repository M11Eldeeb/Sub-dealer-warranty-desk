import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureClaimFolder, getDriveStatus } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeps a claim's Drive folder name in step with its work orders: called after the dealer work order is
 * added or a work order is edited. Only renames an existing folder - it never creates one.
 */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!UUID.test(body?.claimId || "")) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: claim } = await supabase
    .from("claims")
    .select("id, branch_id, claim_number, work_order_number, dealer_work_order_number, branches(name)")
    .eq("id", body.claimId)
    .maybeSingle();
  if (!claim) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await getDriveStatus())) return NextResponse.json({ ok: true, skipped: "not-connected" });

  try {
    await ensureClaimFolder({ claim, branchName: claim.branches?.name, create: false });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Could not rename the claim's Drive folder:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false });
  }
}
