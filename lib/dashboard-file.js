// SERVER-ONLY. The dashboard as ONE html file that works on its own: the page's script and styles, and the numbers, are all inside it.
// Whoever gets the file (the weekly e-mail, the Export dashboard download) opens it in a browser, no sign-in needed, and clicks the
// charts to see their work orders just like on the site. The numbers are those of the day it was made.
import { DASHBOARD_CSS, DASHBOARD_JS, DASHBOARD_LOGO } from "@/lib/generated/dashboard-assets";
import { siteUrl } from "@/lib/email";

export const RANGE_NAMES = { w: "Last 7 days", 1: "This month", 3: "Last 3 months", 6: "Last 6 months", 12: "Last 12 months", all: "All time" };
/** The period buttons in the file, in order: [key, label]. */
export const FILE_RANGES = [
  ["w", "1 week"],
  ["1", "1 month"],
  ["3", "3 months"],
  ["6", "6 months"],
  ["12", "1 year"],
  ["all", "All time"],
];

const fullMonth = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const when = (d, opts) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", ...opts });

/** JSON that is safe inside a <script> tag. */
const BS = String.fromCharCode(92);
const safeJson = (v) => JSON.stringify(v).replace(/</g, BS + "u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), BS + "u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), BS + "u2029");

/** What is printed at the top of the dashboard and in the file name. */
export function dashboardLabels(range, months, now = new Date()) {
  const period = RANGE_NAMES[range] || RANGE_NAMES[6];
  const week = `${when(new Date(now.getTime() - 7 * 86400000), { day: "numeric", month: "short" })} to ${when(now, { day: "numeric", month: "short", year: "numeric" })}`;
  const span = range === "w" ? week : months?.length ? (months.length === 1 ? fullMonth(months[0]) : `${fullMonth(months[0])} to ${fullMonth(months[months.length - 1])}`) : "";
  const exported = when(now, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  return { period, span, exported, day, fileName: `Sub-dealer dashboard - ${period} - ${day}.html` };
}

/**
 * @param analytics   { [range]: what loadAnalytics() returns } for every period in FILE_RANGES
 * @param workOrders  { [range]: what loadWorkOrders() returns }
 * @param revenue     the revenue rows per branch, or null when they are not available
 * @param revenueAt   when those revenue rows were worked out (ISO), shown on the page
 * @param initial     the period the file opens on (the reader switches with the buttons at the top)
 */
export function buildDashboardFile({ analytics, workOrders, revenue, revenueAt = null, initial = "6", now = new Date() }) {
  const labels = dashboardLabels(initial, analytics[initial].months, now);
  const title = labels.fileName.replace(/[.]html$/, "");
  // for each period: the lists and numbers the page draws from (what only the signed-in site uses stays out)
  const sets = {};
  for (const [range] of FILE_RANGES) {
    const { actions, revenueCached, ...shown } = analytics[range];
    const l = dashboardLabels(range, shown.months, now);
    sets[range] = { period: l.period, span: l.span, data: { ...shown, actions: [] }, workOrders: workOrders?.[range] ?? null };
  }
  const dash = {
    title,
    initial,
    ranges: FILE_RANGES,
    exported: labels.exported,
    revenueAt: revenueAt ? when(revenueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null,
    logo: DASHBOARD_LOGO,
    site: siteUrl(""),
    revenue: revenue ?? null,
    sets,
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
