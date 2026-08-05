"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download, Loader2 } from "lucide-react";

export default function DownloadAttachmentsButton({ claimNumber, attachments }) {
  const supabase = createClient();
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");

  const handleDownload = async () => {
    if (!attachments || attachments.length === 0) return;
    setWorking(true);
    setProgress("Preparing…");

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        setProgress(`File ${i + 1} of ${attachments.length}…`);
        try {
          const { data: blob } = await supabase.storage.from("evidence").download(att.file_path);
          if (blob) {
            const prefix = att.stage === "after_repair" ? "after_repair_" : "";
            zip.file(`${prefix}${att.file_name}`, blob);
          }
        } catch {
          // Skip a file that fails to download rather than aborting the whole zip
        }
      }

      setProgress("Zipping…");
      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${claimNumber}-attachments.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setProgress("Download failed — try again.");
      setTimeout(() => setProgress(""), 3000);
    } finally {
      setWorking(false);
    }
  };

  if (!attachments || attachments.length === 0) return null;

  return (
    <button
      onClick={handleDownload}
      disabled={working}
      title="Download all evidence for this claim as one zip file"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase tracking-wide text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
    >
      {working ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {working ? progress || "Preparing…" : `Download All (${attachments.length})`}
    </button>
  );
}
