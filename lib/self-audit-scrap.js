// SERVER-ONLY. Asks the Warranty Self-Audit system questions about our claims. It calls only a few read-only functions
// there (sub_dealer_scrap_status, sub_dealer_free_service_invoiced, sub_dealer_warranty_parts), with the self-audit
// service-role key plus a secret the functions check. The connection details live in this project's integration_secrets
// table (service role only), never in the browser. Do not use the key for anything else.
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK = 250; // the functions accept up to 300 items per call

async function linkSettings() {
  noStore();
  const { data } = await createAdminClient().from("integration_secrets").select("value").eq("key", "self_audit_scrap_link").maybeSingle();
  const v = data?.value;
  return v?.url && v?.service_key && v?.secret ? v : null;
}

/** Calls one self-audit function for all items (in chunks). Returns { byKey } keyed by each answer's `key`, or { error }. */
async function callSelfAudit(functionName, items) {
  if (items.length === 0) return { byKey: {} };
  const link = await linkSettings();
  if (!link) return { error: "The self-audit link is not set up." };

  const byKey = {};
  try {
    for (let i = 0; i < items.length; i += CHUNK) {
      const res = await fetch(`${link.url}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: { apikey: link.service_key, Authorization: `Bearer ${link.service_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_secret: link.secret, p_items: items.slice(i, i + CHUNK) }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`self-audit answered ${res.status}`);
      for (const row of await res.json()) byKey[row.key] = row;
    }
  } catch (e) {
    console.error(`Self-audit ${functionName} failed:`, e instanceof Error ? e.message : e);
    return { error: "Could not reach the self-audit system." };
  }
  return { byKey };
}

/**
 * Can the claim's parts be scrapped yet? The scrap rule is the self-audit one: Verification Date more than 90 days ago,
 * claim Approved / Settled / To Be Settled, parts not reserved for the supplier.
 * items: [{ key, work_order_no, vin, gws_claim_id?, part_nos? }]. gws_claim_id (WSA...) names the batch claim exactly;
 * without it the match is VIN + work order, and part_nos tell apart claims that share them. byKey[key] = { status,
 * verification_date, eligible_on, days_held, batch_claim_number, batch_status }.
 */
export const getScrapStatus = (items) => callSelfAudit("sub_dealer_scrap_status", items);

/**
 * What the dealer invoiced to account I660 (free service for the customer, labor KH9 + parts MG5 lines) on each free service
 * work order and VIN. items: [{ key, work_order_no, vin }]. byKey[key] = { invoiced (SAR or null), lines }.
 */
export const getFreeServiceInvoiced = (items) => callSelfAudit("sub_dealer_free_service_invoiced", items);

/**
 * What the dealer got for the PARTS of closed warranty claims, from the claims batch and from the invoicing lines. A claim
 * counts only when work order, VIN and GWS claim ID all match. items: [{ key, gws_claim_id, work_order_no, vin }].
 * byKey[key] = { batch_found, batch_parts, batch_status, invoiced_parts, invoiced_lines } (SAR).
 */
export const getWarrantyParts = (items) => callSelfAudit("sub_dealer_warranty_parts", items);

const OK = new Set(["can_scrap", "already_scrapped"]);

/** One return: can every claim in it be scrapped now? `claims` are the per-claim results, keyed by claim id. */
export function summarizeReturn(claimIds, byClaim) {
  const results = claimIds.map((id) => byClaim[id]).filter(Boolean);
  if (results.length === 0) return null;
  const blockers = results.filter((r) => !OK.has(r.status));
  const canScrap = blockers.length === 0;
  // when the only thing in the way is the 90 days, say when the whole return becomes scrappable
  const onlyWaiting = blockers.length > 0 && blockers.every((r) => r.status === "not_yet");
  const eligibleFrom = onlyWaiting ? blockers.map((r) => r.eligible_on).sort().at(-1) : null;
  return { canScrap, total: results.length, ready: results.length - blockers.length, eligibleFrom };
}

/**
 * What the claims batch holds for each work order + VIN (all its claims added up, the -1 / -2 suffix ignored): the adjusted
 * claim total in dollars and riyals and the batch statuses. items: [{ key, work_order_no, vin }].
 * byKey[key] = { claims, adjusted_usd, adjusted_sar, statuses }.
 */
export const getBatchByWorkOrder = (items) => callSelfAudit("sub_dealer_batch_by_work_order", items);
