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
 *  - from the Warranty Self-Audit system: the dealer's revenue on warranty PARTS (the claims batch when GWS claim ID, work
 *    order and VIN all match; otherwise the parts invoiced under account W40 on the same work order number and VIN, or,
 *    when there are no parts lines, everything invoiced under W40 minus the labor amount approved) and on
 *    Free Service (invoiced to account I660 minus what is paid to the sub-dealer: invoiced to account I1855, both without VAT;
 *    until the I1855 invoice is in, the approved amount - which includes VAT - divided by 1.15).
 * If the self-audit system can not be reached, those extra figures come back as null and the rest still shows.
 */
export async function GET(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["dealer", "admin", "manager"].includes(profile?.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  // ?cached=1: the answer worked out last time, at once (the self-audit part below takes a few seconds). The home dashboard shows
  // this first so its cards appear together, then asks again for the fresh figures.
  if (new URL(request.url).searchParams.get("cached") === "1") {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "revenue_cache").maybeSingle();
    return NextResponse.json({ rows: data?.value?.rows ?? null, at: data?.value?.at ?? null });
  }

  const { data: rows, error } = await supabase.rpc("closed_revenue");
  if (error) return NextResponse.json({ error: "Could not add up the revenue." }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ rows: [] });

  const admin = createAdminClient();
  const { data: closed } = await admin
    .from("claims")
    .select("id, kind, branch_id, dealer_work_order_number, vin, gws_claim_id, approved_amount, labor_amount")
    .eq("status", "closed");

  const warranty = (closed || []).filter((c) => c.kind === "claim" && c.dealer_work_order_number && c.vin);
  const free = (closed || []).filter((c) => c.kind === "free_service" && c.dealer_work_order_number && c.vin);

  // The part numbers of each claim, and how many closed claims share its work order number and VIN: when the claims batch
  // has no match, these tell the invoiced lines of one work order apart.
  const partNos = {};
  if (warranty.length) {
    const { data: parts } = await admin.from("claim_parts").select("claim_id, part_number").in("claim_id", warranty.map((c) => c.id));
    for (const p of parts || []) if (p.part_number?.trim()) (partNos[p.claim_id] ||= []).push(p.part_number.trim());
  }
  const wipOf = (c) => `${(/^[A-Za-z]+-(\d+)/.exec(c.dealer_work_order_number) || [])[1]}|${String(c.vin).toUpperCase()}`;
  const twins = {};
  for (const c of warranty) twins[wipOf(c)] = (twins[wipOf(c)] || 0) + 1;

  const [parts, invoiced] = await Promise.all([
    getWarrantyParts(
      warranty.map((c) => ({
        key: c.id,
        gws_claim_id: c.gws_claim_id || "",
        work_order_no: c.dealer_work_order_number,
        vin: c.vin,
        part_nos: partNos[c.id] || [],
        twins: twins[wipOf(c)] || 1,
        labor_amount: c.labor_amount,
      }))
    ),
    getFreeServiceInvoiced(free.map((c) => ({ key: c.id, work_order_no: c.dealer_work_order_number, vin: c.vin }))),
  ]);

  const out = rows.map((r) => {
    const row = { ...r, parts_revenue: null, parts_matched: 0, parts_from_invoice: 0, parts_from_total: 0, fs_invoiced: null, fs_approved_invoiced: 0, fs_revenue: null, fs_invoiced_count: 0 };

    if (!parts.error) {
      let total = 0;
      for (const c of warranty.filter((w) => w.branch_id === r.branch_id)) {
        const p = parts.byKey[c.id];
        if (!p) continue;
        if (p.batch_found) {
          total += Number(p.batch_parts || 0);
          row.parts_matched += 1;
        } else if (p.invoiced_parts != null) {
          total += Number(p.invoiced_parts);
          row.parts_matched += 1;
          row.parts_from_invoice += 1;
          if (p.invoiced_method === "total_minus_labor") row.parts_from_total += 1;
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
        // The invoices are without VAT but the sub-dealer's approved amount includes it: take what was invoiced to I1855,
        // and only until that invoice is in, the approved amount without its VAT.
        approved += i.paid != null ? Number(i.paid) : Number(c.approved_amount || 0) / 1.15;
        row.fs_invoiced_count += 1;
      }
      row.fs_invoiced = round2(inv);
      row.fs_approved_invoiced = round2(approved);
      row.fs_revenue = round2(inv - approved);
    }
    return row;
  });

  const at = new Date().toISOString();
  await admin.from("app_settings").upsert({ key: "revenue_cache", value: { at, rows: out }, updated_at: at });
  return NextResponse.json({ rows: out, at });
}
