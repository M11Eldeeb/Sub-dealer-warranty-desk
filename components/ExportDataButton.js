"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { CLAIMS_SELECT, FREE_SERVICE_SELECT, buildWorkbook } from "@/lib/export-rows";

export default function ExportDataButton({ variant = "button", className = "" }) {
  const supabase = createClient();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  const handleExport = async () => {
    setNotice("");
    setWorking(true);
    try {
      const [{ data: claims, error }, { data: freeService }] = await Promise.all([
        supabase.from("claims").select(CLAIMS_SELECT).eq("kind", "claim").order("created_at", { ascending: false }),
        supabase.from("claims").select(FREE_SERVICE_SELECT).eq("kind", "free_service").order("created_at", { ascending: false }),
      ]);

      if (error) throw error;
      if ((!claims || claims.length === 0) && (!freeService || freeService.length === 0)) {
        setNotice("There is nothing to export yet.");
        return;
      }

      const XLSX = await import("xlsx");
      const workbook = buildWorkbook(XLSX, { claims: claims || [], freeService: freeService || [] });
      XLSX.writeFile(workbook, `warranty-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setNotice("The export failed. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  if (variant === "menu") {
    return (
      <>
        <button onClick={handleExport} disabled={working} title="Export every claim and Free Service request you can see to one Excel file" className={className}>
          {working ? <Loader2 size={16} className="animate-spin text-[#6E6E6E]" /> : <FileSpreadsheet size={16} className="text-[#6E6E6E]" />}
          {working ? "Exporting…" : "Export data"}
        </button>
        {notice && (
          <div role="alert" className="note-in mx-3.5 mb-2 text-xs text-[#C4551B]">
            {notice}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={working}
        title="Export every claim and Free Service request you can see to one Excel file"
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
      >
        {working ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
        {working ? "Exporting…" : "Export Data"}
      </button>
      {notice && (
        <span role="alert" className="note-in text-xs text-[#C4551B]">
          {notice}
        </span>
      )}
    </>
  );
}
