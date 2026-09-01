"use client";
import { useState } from "react";
import { combinedWorkOrder, sanitizeFileName } from "@/components/ui";
import { FileSpreadsheet, Loader2 } from "lucide-react";

export default function ExportPartsLaborButton({ claim, parts, labor }) {
  const [working, setWorking] = useState(false);

  const handleExport = async () => {
    setWorking(true);
    try {
      const XLSX = await import("xlsx");

      const partsRows = (parts || []).map((p) => ({
        "Part Name": p.name,
        "Part Number": p.part_number || "",
        Qty: p.qty,
        Status: p.status,
        "Tracking Number": p.tracking_number || "",
        ETA: p.eta || "",
        "Supplying Location": p.supplying_location || "",
        "Superseding Part #": p.superseding_part_number || "",
      }));

      const laborRows = (labor || []).map((l) => ({
        "Labor Code": l.labor_code || "",
        "Labor Name": l.labor_name,
      }));

      const workbook = XLSX.utils.book_new();

      const partsSheet = XLSX.utils.json_to_sheet(partsRows.length > 0 ? partsRows : [{ "Part Name": "(no parts on this claim)" }]);
      partsSheet["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, partsSheet, "Parts");

      const laborSheet = XLSX.utils.json_to_sheet(laborRows.length > 0 ? laborRows : [{ "Labor Code": "(no labor on this claim)" }]);
      laborSheet["!cols"] = [{ wch: 14 }, { wch: 36 }];
      XLSX.utils.book_append_sheet(workbook, laborSheet, "Labor");

      XLSX.writeFile(workbook, sanitizeFileName(`${combinedWorkOrder(claim)}.xlsx`));
    } finally {
      setWorking(false);
    }
  };

  const hasData = (parts && parts.length > 0) || (labor && labor.length > 0);
  if (!hasData) return null;

  return (
    <button
      onClick={handleExport}
      disabled={working}
      title="Export this claim's parts and labor to an Excel spreadsheet"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase tracking-wide text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
    >
      {working ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
      {working ? "Exporting…" : "Export Excel"}
    </button>
  );
}
