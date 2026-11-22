"use client";
import { useEffect, useState } from "react";
import { ReportDashboard } from "@/components/HomeDashboard";

const RANGES = ["1", "3", "6", "12", "all"];

/** The printable dashboard report (opened by Export dashboard in the menu). ?range=1 | 3 | 6 | 12 | all months back. */
export default function ReportPage() {
  const [range, setRange] = useState(null);
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("range");
    setRange(RANGES.includes(asked) ? asked : "6");
  }, []);
  if (!range) return null;
  return <ReportDashboard range={range} />;
}
