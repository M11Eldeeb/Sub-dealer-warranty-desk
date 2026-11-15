import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreeServiceInvoiced, getWarrantyParts } from "@/lib/self-audit-scrap";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The Revenue window (dealer, admin, manager). Per branch, closed claims only:
 *  - from our own database (closed_revenue()): what the branch earned, and the dealer's warranty labor margin;
 *  - from the Warranty Self-Audit system: the dealer's revenue on warranty PARTS (the claims batch, or the invoiced parts
 *    lines under account W40 when the claim is not in the batch; a claim only counts when work order, VIN and GWS claim ID all match) and on
 *    Free Service (invoiced to account I660 minus the amount approved to the sub-dealer).
 * If the self-audit system can not be reached, those extra figures come back as null and the rest still shows.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin", "manager"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const { data: rows, error } = await supabase.rpc("closed_revenue");
  if (error) return NextResponse.json({ error: "Could not add up the revenue." }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ rows: [] });

  const { data: closed } = await createAdminClient()
    .from("claims")
    .select("id, kind, branch_id, dealer_work_order_number, vin, gws_claim_id, approved_amount")
    .eq("status", "closed");

  const warranty = (closed || []).filter((c) => c.kind === "claim" && c.gws_claim_id && c.dealer_work_order_number && c.vin);
  const free = (closed || []).filter((c) => c.kind === "free_service" && c.dealer_work_order_number && c.vin);

  const [parts, invoiced] = await Promise.all([
    getWarrantyParts(warranty.map((c) => ({ key: c.id, gws_claim_id: c.gws_claim_id, work_order_no: c.dealer_work_order_number, vin: c.vin }))),
    getFreeServiceInvoiced(free.map((c) => ({ key: c.id, work_order_no: c.dealer_work_order_number, vin: c.vin }))),
  ]);

  const out = rows.map((r) => {
    const row = { ...r, parts_revenue: null, parts_matched: 0, parts_from_invoice: 0, fs_invoiced: null, fs_approved_invoiced: 0, fs_revenue: null, fs_invoiced_count: 0 };

    if (!parts.error) {
      let total = 0;
      for (const c of warranty.filter((w) => w.branch_id === r.branch_id)) {
        const p = parts.byKey[c.id];
        if (!p) continue;
        if (p.batch_found) {
          total += Number(p.batch_parts || 0);
          row.parts_matched += 1;
        } else if (p.invoiced_lines > 0) {
          total += Number(p.invoiced_parts || 0);
          row.parts_matched += 1;
          row.parts_from_invoice += 1;
        }
      }
      row.parts_revenue = round2(total);
    }

    if (!invoiced.error) {
      let inv = 0;
      let approved = 0;
      for (const c of free.filter((f) => f.branch_id === r.branch_id)) {
        const i = invoiced.byKey[c.id];
        if (i?.invoiced == null) continue; // not invoiced yet: it joins the totals once it is
        inv += Number(i.invoiced);
        approved += Number(c.approved_amount || 0);
        row.fs_invoiced_count += 1;
      }
      row.fs_invoiced = round2(inv);
      row.fs_approved_invoiced = round2(approved);
      row.fs_revenue = round2(inv - approved);
    }
    return row;
  });

  return NextResponse.json({ rows: out });
}
