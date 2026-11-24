// SERVER-ONLY. The dashboard as ONE html file that works on its own: the page's script and styles, and the numbers, are all inside it.
// Whoever gets the file (the weekly e-mail, the Export dashboard download) opens it in a browser, no sign-in needed, and clicks the
// charts to see their work orders just like on the site. The numbers are those of the day it was made.
import { DASHBOARD_CSS, DASHBOARD_JS, DASHBOARD_LOGO } from "@/lib/generated/dashboard-assets";
import { siteUrl } from "@/lib/email";

export const RANGE_NAMES = { 1: "This month", 3: "Last 3 months", 6: "Last 6 months", 12: "Last 12 months", all: "All time" };

const fullMonth = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const when = (d, opts) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", ...opts });

/** JSON that is safe inside a <script> tag. */
const BS = String.fromCharCode(92);
const safeJson = (v) => JSON.stringify(v).replace(/</g, BS + "u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), BS + "u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), BS + "u2029");

/** What is printed at the top of the dashboard and in the file name. */
export function dashboardLabels(range, months, now = new Date()) {
  const period = RANGE_NAMES[range] || RANGE_NAMES[6];
  const span = months?.length ? (months.length === 1 ? fullMonth(months[0]) : `${fullMonth(months[0])} to ${fullMonth(months[months.length - 1])}`) : "";
  const exported = when(now, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  return { period, span, exported, day, fileName: `Sub-dealer dashboard - ${period} - ${day}.html` };
}

/**
 * @param data        what loadAnalytics() returns
 * @param workOrders  what loadWorkOrders() returns
 * @param revenue     the revenue rows per branch, or null when they are not available
 * @param revenueAt   when those revenue rows were worked out (ISO), shown on the page
 */
export function buildDashboardFile({ data, workOrders, revenue, revenueAt = null, range = "6", now = new Date() }) {
  const labels = dashboardLabels(range, data.months, now);
  const title = labels.fileName.replace(/\.html$/, "");
  // the lists and numbers the page draws from; what only the signed-in site uses (the waiting-for-you counts) stays out
  const { actions, revenueCached, ...shown } = data;
  const dash = {
    title,
    range,
    period: labels.period,
    span: labels.span,
    exported: labels.exported,
    revenueAt: revenueAt ? when(revenueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null,
    logo: DASHBOARD_LOGO,
    site: siteUrl(""),
    data: { ...shown, actions: [] },
    revenue: revenue ?? null,
    workOrders: workOrders ?? null,
  };
  const html = `<!doctype html>
<html lang="en" data-theme="light" data-look="new">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>
<style>${DASHBOARD_CSS}</style>
<style>body{font-family:Barlow,"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;margin:0}</style>
</head>
<body>
<div id="root"></div>
<noscript><p style="font-family:Arial,sans-serif;padding:24px">This dashboard needs JavaScript. Open the file in a browser such as Chrome, Edge or Safari.</p></noscript>
<script>window.__DASH__=${safeJson(dash)};</script>
<script>${DASHBOARD_JS.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
  return { html, fileName: labels.fileName, labels };
}
