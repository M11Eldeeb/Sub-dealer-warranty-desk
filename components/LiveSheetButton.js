"use client";
import { useState } from "react";
import { Sheet, Loader2 } from "lucide-react";

/**
 * Menu item that opens the live Google Sheet (every claim and Free Service request, refreshed about every 15 minutes).
 * Dealer and admin accounts create it the first time they open it; managers just open it.
 */
export default function LiveSheetButton({ className = "", canRefresh = false }) {
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  const open = async () => {
    setNotice("");
    setWorking(true);
    // The tab is opened first, inside the click, so the browser does not treat it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      let info = await fetch("/api/live-sheet", { cache: "no-store" }).then((r) => r.json());
      let created = false;
      if (!info.url && canRefresh) {
        const res = await fetch("/api/live-sheet", { method: "POST" });
        info = await res.json();
        if (!res.ok) throw new Error(info.error || "Could not create the Google Sheet.");
        created = true;
      }
      if (!info.url) throw new Error("The live Google Sheet has not been created yet. A dealer or admin creates it the first time.");
      if (tab) tab.location.href = info.url;
      else setNotice("Allow pop-ups for this site, then try again.");
      // Dealer and admin: bring the sheet up to date in the background if it is more than 5 minutes old (reload the sheet to see it).
      const age = info.updatedAt ? Date.now() - new Date(info.updatedAt).getTime() : Infinity;
      if (canRefresh && age > 5 * 60 * 1000 && !created) fetch("/api/live-sheet", { method: "POST" }).catch(() => {});
    } catch (e) {
      tab?.close();
      setNotice(e instanceof Error ? e.message : "Could not open the Google Sheet.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <button onClick={open} disabled={working} title="Open the live Google Sheet: every claim and Free Service request, updated about every 15 minutes" className={className}>
        {working ? <Loader2 size={16} className="animate-spin text-[#6E6E6E]" /> : <Sheet size={16} className="text-[#6E6E6E]" />}
        {working ? "Opening…" : "Live Google Sheet"}
      </button>
      {notice && (
        <div role="alert" className="note-in mx-3.5 mb-2 text-xs text-[#C4551B]">
          {notice}
        </div>
      )}
    </>
  );
}
