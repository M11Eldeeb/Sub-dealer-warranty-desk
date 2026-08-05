"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download, Loader2 } from "lucide-react";

function buildSummary(claim) {
  const lines = [];
  lines.push(`Claim: ${claim.claim_number}`);
  lines.push(`Status: ${claim.status}`);
  lines.push(`Branch: ${claim.branches?.name || "—"}`);
  lines.push(`Work Order (Sub-Dealer): ${claim.work_order_number || "—"}`);
  lines.push(`Work Order (Dealer): ${claim.dealer_work_order_number || "—"}`);
  lines.push("");
  lines.push(`VIN: ${claim.vin}`);
  lines.push(`Mileage: ${claim.mileage ?? "—"} km`);
  lines.push(`Plate: ${claim.plate}`);
  lines.push(`Reception Date: ${claim.reception_date}`);
  lines.push("");
  lines.push(`Customer Complaint:\n${claim.customer_complaint || "—"}`);
  lines.push("");
  lines.push(`Cause of Defect:\n${claim.cause_of_defect || "—"}`);
  lines.push("");
  lines.push(`Correction:\n${claim.correction || "—"}`);
  lines.push("");
  lines.push(`Comment:\n${claim.comment || "—"}`);
  lines.push("");

  lines.push(`Parts:`);
  if (claim.claim_parts?.length) {
    claim.claim_parts.forEach((p) => {
      lines.push(
        `- ${p.name} (${p.part_number || "no part #"}) x${p.qty} — ${p.status}${p.tracking_number ? ` — tracking ${p.tracking_number}` : ""}${p.eta ? ` — ETA ${p.eta}` : ""}`
      );
    });
  } else {
    lines.push("(none)");
  }
  lines.push("");

  lines.push(`Labor:`);
  if (claim.claim_labor?.length) {
    claim.claim_labor.forEach((l) => {
      lines.push(`- ${l.labor_code || "no code"}: ${l.labor_name}`);
    });
  } else {
    lines.push("(none)");
  }
  lines.push("");

  lines.push(`History:`);
  const sortedLog = [...(claim.claim_status_log || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  sortedLog.forEach((l) => {
    lines.push(`[${new Date(l.at).toLocaleString()}] ${l.actor_name} — ${l.note}`);
  });

  return lines.join("\n");
}

export default function DownloadAllButton() {
  const supabase = createClient();
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");

  const handleDownload = async () => {
    setWorking(true);
    setProgress("Fetching claims…");

    try {
      const { data: claims, error } = await supabase
        .from("claims")
        .select("*, branches(name), claim_parts(*), claim_labor(*), claim_attachments(*), claim_status_log(*)")
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!claims || claims.length === 0) {
        setProgress("No claims to export.");
        setTimeout(() => setProgress(""), 2500);
        setWorking(false);
        return;
      }

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (let i = 0; i < claims.length; i++) {
        const claim = claims[i];
        setProgress(`Claim ${i + 1} of ${claims.length}: ${claim.claim_number}…`);

        const folder = zip.folder(claim.claim_number.replace(/[^a-zA-Z0-9-_]/g, "_"));
        folder.file("summary.txt", buildSummary(claim));

        if (claim.claim_attachments?.length) {
          const evidenceFolder = folder.folder("evidence");
          for (const att of claim.claim_attachments) {
            try {
              const { data: blob } = await supabase.storage.from("evidence").download(att.file_path);
              if (blob) {
                const prefix = att.stage === "after_repair" ? "after_repair_" : "";
                evidenceFolder.file(`${prefix}${att.file_name}`, blob);
              }
            } catch {
              // Skip files that fail to download rather than aborting the whole export
            }
          }
        }
      }

      setProgress("Zipping…");
      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `warranty-claims-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress("Done.");
      setTimeout(() => setProgress(""), 2000);
    } catch (err) {
      setProgress("Export failed — try again.");
      setTimeout(() => setProgress(""), 3000);
    } finally {
      setWorking(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={working}
      title="Download every claim you can see, with all evidence, as one zip file"
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
    >
      {working ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      {working ? progress || "Preparing…" : "Download All"}
    </button>
  );
}
