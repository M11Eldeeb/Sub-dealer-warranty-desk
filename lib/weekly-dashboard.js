// SERVER-ONLY. The weekly dashboard e-mail: the interactive dashboard file made fresh, with the main numbers in the mail itself.
import { loadAnalyticsSet, loadWorkOrdersSet } from "@/lib/dashboard-data";
import { buildDashboardFile } from "@/lib/dashboard-file";
import { siteUrl } from "@/lib/email";
import { sendTemplatedEmail } from "@/lib/email-templates";

/** The period the weekly file opens on (the reader can switch to any other: 1 week, 1 month, 3, 6, 12 months, all time). */
export const WEEKLY_RANGE = "6";

const num = (n, digits = 0) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const span = (hours) => (hours == null ? "—" : hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`);

/** The file, and the pieces the e-mail template needs to wrap it. */
export async function buildWeeklyDashboard(admin, range = WEEKLY_RANGE) {
  const [analytics, workOrders, cache] = await Promise.all([
    loadAnalyticsSet(admin),
    loadWorkOrdersSet(admin).catch(() => null),
    admin.from("app_settings").select("value").eq("key", "revenue_cache").maybeSingle(),
  ]);
  const revenue = cache.data?.value?.rows ?? null;
  const data = analytics[range];
  const { html, fileName, labels } = buildDashboardFile({ analytics, workOrders, revenue, revenueAt: cache.data?.value?.at ?? null, initial: range });

  // the same sums as the revenue cards on the dashboard
  const sum = (key) => (revenue || []).reduce((s, r) => s + Number(r[key] || 0), 0);
  const known = (key) => (revenue || []).every((r) => r[key] != null);
  const rows = [["Claims", `<b>${data.totals.claims}</b> · ${data.totals.open} open · ${data.totals.closed} closed · ${data.totals.rejected} rejected`]];
  if (revenue?.length) {
    const toBranch = sum("warranty_total") + sum("free_service_total");
    const dealer = sum("dealer_revenue") + (known("parts_revenue") ? sum("parts_revenue") : 0) + (known("fs_revenue") ? sum("fs_revenue") : 0);
    rows.push(["Revenue to the sub-dealer", `<b>SAR ${num(toBranch)}</b>`], ["Dealer revenue", `<b>SAR ${num(dealer)}</b>`]);
  }
  rows.push(["Average lead time", `<b>${span(data.totals.avgLeadHours)}</b> (${data.leadTimes.total.n} closed claims)`]);
  if (data.quality.firstTimeRightRate != null) rows.push(["First time right", `<b>${Math.round(data.quality.firstTimeRightRate * 100)}%</b> of ${data.quality.decided} decided`]);

  return {
    fileName,
    labels,
    custom: { values: { period: labels.period, exported: labels.exported }, url: siteUrl("/"), infoRows: rows },
    attachments: [{ filename: fileName, mime: "text/html; charset=UTF-8", content: Buffer.from(html, "utf8") }],
  };
}

/** Makes the file and sends the weekly mail to the people set up under Settings > Emails. Throws a readable error if it cannot. */
export async function sendWeeklyDashboard(admin) {
  const weekly = await buildWeeklyDashboard(admin);
  const sent = await sendTemplatedEmail(admin, "weekly_dashboard", { claim: {}, custom: weekly.custom, attachments: weekly.attachments });
  return { ...sent, fileName: weekly.fileName };
}
