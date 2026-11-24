// SERVER-ONLY. The weekly dashboard e-mail: the interactive dashboard file made fresh, with the main numbers in the mail itself.
import { loadAnalyticsSet, loadWorkOrdersSet } from "@/lib/dashboard-data";
import { buildDashboardFile } from "@/lib/dashboard-file";
import { siteUrl } from "@/lib/email";
import { sendTemplatedEmail } from "@/lib/email-templates";

/** The period the weekly file opens on (the reader can switch to any other: 1 week, 1 month, 3, 6 months, 1 year, all time). */
export const WEEKLY_RANGE = "all";

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
  const now = new Date();
  const { html, fileName, labels } = buildDashboardFile({ analytics, workOrders, revenue, revenueAt: cache.data?.value?.at ?? null, initial: range, now });

  // the same sums as the revenue cards on the dashboard
  const sum = (key) => (revenue || []).reduce((s, r) => s + Number(r[key] || 0), 0);
  const known = (key) => (revenue || []).every((r) => r[key] != null);
  const week = analytics.w.totals.claims;
  const tiles = [
    { label: "Claims", value: num(data.totals.claims), note: `${data.totals.open} open · ${data.totals.closed} closed · ${data.totals.rejected} rejected`, bg: "#F1F2F4", fg: "#5B6270" },
    { label: "Opened in the last 7 days", value: num(week), note: week === 1 ? "new claim this week" : "new claims this week", bg: "#E8F5EC", fg: "#2E9E5B" },
  ];
  if (revenue?.length) {
    const toBranch = sum("warranty_total") + sum("free_service_total");
    const dealer = sum("dealer_revenue") + (known("parts_revenue") ? sum("parts_revenue") : 0) + (known("fs_revenue") ? sum("fs_revenue") : 0);
    tiles.push(
      { label: "Revenue to the sub-dealer", value: `SAR ${num(toBranch)}`, note: "Closed claims and Free Service, VAT incl.", bg: "#FDE8EC", fg: "#E4002B" },
      { label: "Dealer revenue", value: `SAR ${num(dealer)}`, note: "Labor + parts + Free Service", bg: "#FFF1DC", fg: "#C77700" }
    );
  }
  tiles.push({ label: "Average lead time", value: span(data.totals.avgLeadHours), note: `All steps added up, ${data.leadTimes.total.n} closed claims`, bg: "#E8F5EC", fg: "#2E9E5B" });
  if (data.quality.firstTimeRightRate != null) tiles.push({ label: "First time right", value: `${Math.round(data.quality.firstTimeRightRate * 100)}%`, note: `of ${data.quality.decided} claims decided`, bg: "#EAE7FA", fg: "#5B4FB0" });

  const date = now.toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });
  return {
    fileName,
    labels,
    custom: {
      weekly: { tiles, fileName, period: labels.period, exported: labels.exported, date },
      values: { period: labels.period, exported: labels.exported, date },
      url: siteUrl("/dashboard"),
      infoRows: tiles.map((t) => [t.label, `<b>${t.value}</b> · ${t.note}`]),
    },
    attachments: [{ filename: fileName, mime: "text/html; charset=UTF-8", content: Buffer.from(html, "utf8") }],
  };
}

/** Makes the file and sends the weekly mail to the people set up under Settings > Emails. Throws a readable error if it cannot. */
export async function sendWeeklyDashboard(admin) {
  const weekly = await buildWeeklyDashboard(admin);
  const sent = await sendTemplatedEmail(admin, "weekly_dashboard", { claim: {}, custom: weekly.custom, attachments: weekly.attachments });
  return { ...sent, fileName: weekly.fileName };
}
