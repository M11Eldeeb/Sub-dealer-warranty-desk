// The browser side of the interactive dashboard file (the one attached to the weekly e-mail and downloaded from Export dashboard).
// It draws the very same page as the site (HomeView), from the numbers embedded in the file, so a click on a chart opens its list.
import { createRoot } from "react-dom/client";
import { HomeView } from "@/components/HomeDashboard";

const d = window.__DASH__;
const root = document.documentElement;
root.setAttribute("data-theme", "light");
root.setAttribute("data-look", "new");
document.title = d.title;

createRoot(document.getElementById("root")).render(
  <HomeView
    report={{ period: d.period, span: d.span, exported: d.exported, revenueAt: d.revenueAt, logo: d.logo, ready: true, interactive: true, print: () => window.print() }}
    range={d.range}
    setRange={() => {}}
    data={d.data}
    failed={false}
    revenue={d.revenue}
    workOrders={d.workOrders}
  />
);
