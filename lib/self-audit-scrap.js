// SERVER-ONLY. Asks the Warranty Self-Audit system whether the claims in a defected-parts return can be scrapped yet.
// It calls ONE read-only function there (sub_dealer_scrap_status), and only that function, with the self-audit
// service-role key plus a secret the function checks. The connection details live in this project's
// integration_secrets table (service role only), never in the browser. Do not use the key for anything else. The scrap rule itself is the self-audit one: Verification
// Date more than 90 days ago, claim Approved / Settled / To Be Settled, parts not reserved for the supplier.
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK = 250; // the function accepts up to 300 items per call

async function linkSettings() {
  noStore();
  const { data } = await createAdminClient().from("integration_secrets").select("value").eq("key", "self_audit_scrap_link").maybeSingle();
  const v = data?.value;
  return v?.url && v?.service_key && v?.secret ? v : null;
}

/**
 * items: [{ key, work_order_no, vin, twins? }]. Returns { byKey } where byKey[key] = { status, verification_date,
 * eligible_on, days_held, batch_claim_number, batch_status }, or { error } when the self-audit system can not be reached.
 */
export async function getScrapStatus(items) {
  if (items.length === 0) return { byKey: {} };
  const link = await linkSettings();
  if (!link) return { error: "The self-audit link is not set up." };

  const byKey = {};
  try {
    for (let i = 0; i < items.length; i += CHUNK) {
      const res = await fetch(`${link.url}/rest/v1/rpc/sub_dealer_scrap_status`, {
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
    console.error("Self-audit scrap status failed:", e instanceof Error ? e.message : e);
    return { error: "Could not reach the self-audit system." };
  }
  return { byKey };
}

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
