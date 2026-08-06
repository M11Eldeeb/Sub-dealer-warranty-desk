"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileSpreadsheet, Loader2 } from "lucide-react";

function summarizeParts(parts) {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((p) => `${p.name}${p.part_number ? ` (${p.part_number})` : ""} x${p.qty} [${p.status}]`)
    .join("; ");
}

function summarizeLabor(labor) {
  if (!labor || labor.length === 0) return "";
  return labor.map((l) => `${l.labor_code ? `${l.labor_code}: ` : ""}${l.labor_name}`).join("; ");
}

export default function ExportDataButton() {
  const supabase = createClient();
  const [working, setWorking] = useState(false);

  const handleExport = async () => {
    setWorking(true);
    try {
      const { data: claims, error } = await supabase
        .from("claims")
        .select("*, branches(name), claim_parts(*), claim_labor(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!claims || claims.length === 0) {
        alert("No claims to export.");
        return;
      }

      const rows = claims.map((c) => ({
        "Warranty Claim ID": c.claim_number,
        "Status": c.status,
        "Branch": c.branches?.name || "",
        "VIN": c.vin,
        "Mileage (km)": c.mileage ?? "",
        "Plate": c.plate,
        "Work Order (Sub-Dealer)": c.work_order_number || "",
        "Work Order (Dealer)": c.dealer_work_order_number || "",
        "Creation Date": c.created_at ? new Date(c.created_at).toLocaleString() : "",
        "Reception Date": c.reception_date || "",
        "Customer Complaint": c.customer_complaint || "",
        "Cause of Defect": c.cause_of_defect || "",
        "Correction": c.correction || "",
        "Parts": summarizeParts(c.claim_parts),
        "Labor": summarizeLabor(c.claim_labor),
        "Comment": c.comment || "",
      }));

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows);

      worksheet["!cols"] = [
        { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 19 }, { wch: 10 }, { wch: 12 },
        { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 34 }, { wch: 34 },
        { wch: 34 }, { wch: 40 }, { wch: 30 }, { wch: 24 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Claims");
      XLSX.writeFile(workbook, `warranty-claims-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      alert("Export failed — please try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={working}
      title="Export every claim you can see to an Excel spreadsheet"
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
    >
      {working ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
      {working ? "Exporting…" : "Export Data"}
    </button>
  );
}
