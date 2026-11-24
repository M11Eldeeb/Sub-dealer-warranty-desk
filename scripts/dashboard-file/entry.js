// The browser side of the interactive dashboard file (the one attached to the weekly e-mail and downloaded from Export dashboard).
// It draws the very same page as the site (HomeView), from the numbers embedded in the file, so a click on a chart opens its list.
// The numbers of every period are in the file; the buttons at the top switch between them.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HomeView } from "@/components/HomeDashboard";

const d = window.__DASH__;
const root = document.documentElement;
root.setAttribute("data-theme", "light");
root.setAttribute("data-look", "new");
document.title = d.title;

function App() {
  const [range, setRange] = useState(d.initial);
  const set = d.sets[range];
  return (
    <HomeView
      key={range}
      report={{ period: set.period, span: set.span, exported: d.exported, revenueAt: d.revenueAt, logo: d.logo, ready: true, interactive: true, ranges: d.ranges, onRange: setRange, print: () => window.print() }}
      range={range}
      setRange={setRange}
      data={set.data}
      failed={false}
      revenue={d.revenue}
      workOrders={set.workOrders}
    />
  );
}

createRoot(document.getElementById("root")).render(<App />);
