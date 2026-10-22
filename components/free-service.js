"use client";
import { useRef, useState } from "react";
import { Paperclip, UploadCloud, X, Download, ExternalLink, FileText, Loader2, AlertCircle } from "lucide-react";
import { attachmentUrl } from "@/lib/evidence-upload";

/** Free Service statuses: wording the sub-dealer and the dealer both understand. */
export const FS_STATUS = {
  submitted: { label: "Awaiting approval", color: "#C77700", bg: "#FCF1DA" },
  returned: { label: "Returned for edit", color: "#C4551B", bg: "#FDEBE0" },
  rejected: { label: "Rejected", color: "#B23A32", bg: "#FAE4E2" },
  approved: { label: "Approved · invoice needed", color: "#2A62B0", bg: "#E4EDFA" },
  invoice_submitted: { label: "Invoice under review", color: "#0E7490", bg: "#E0F2FE" },
  invoice_returned: { label: "Invoice returned", color: "#C4551B", bg: "#FDEBE0" },
  closed: { label: "Completed", color: "#1E7A6B", bg: "#E1F2EE" },
};

export function FsStatusTag({ status }) {
  const s = FS_STATUS[status] || { label: status, color: "#6E6E6E", bg: "#F1F2F4" };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: s.color, background: s.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export const formatSar = (n) => (n == null ? "—" : `SAR ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export const isImageName = (name) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name || "");

/** A labelled value in the details card. */
export function Fact({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E]">{label}</div>
      <div className={`mt-0.5 text-sm text-[#111111] break-words ${mono ? "font-mono" : "font-medium"}`}>{value || "—"}</div>
    </div>
  );
}

/** Picks files (click or drop) and lists them before they are sent. Used on the request form. */
export function FilePicker({ files, onChange, disabled, label = "Attach files" }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const add = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    onChange([...files, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))]);
  };
  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1 text-center rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
          over ? "border-[#E4002B] bg-[#FFF5F6]" : "border-[#D5D5D5] bg-[#FAFAFA] hover:border-[#E4002B] hover:bg-[#FFF5F6]"
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        <UploadCloud size={22} className="text-[#E4002B]" />
        <span className="text-sm font-bold text-[#111111]">{label}</span>
        <span className="text-xs text-[#6E6E6E]">Click to choose, or drop files here — photos, PDFs, videos</span>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 divide-y divide-[#EEEEEE] border border-[#E0E0E0] rounded-lg overflow-hidden bg-white">
          {files.map((f, i) => (
            <li key={`${f.name}:${f.size}:${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Paperclip size={14} className="text-[#6E6E6E] shrink-0" />
              <span className="truncate flex-1 min-w-0">{f.name}</span>
              <span className="text-[11px] text-[#6E6E6E] shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} disabled={disabled} title="Remove" className="no-press p-1 rounded text-[#B23A32] hover:bg-[#FAE4E2] shrink-0">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The files already saved on a request (for one stage): thumbnails for photos, a row for everything else.
 * When `editable`, files can be removed and more added straight away.
 */
export function SavedFiles({ title, hint, attachments, editable, uploading, error, onAdd, onRemove, emptyText = "Nothing attached yet." }) {
  const input = useRef(null);
  return (
    <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#111111]">{title}</h3>
          {hint && <p className="text-xs text-[#6E6E6E] mt-0.5">{hint}</p>}
        </div>
        {editable && (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#111111] disabled:opacity-60 transition-colors"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} {uploading ? "Uploading…" : "Add files"}
            </button>
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                e.target.value = "";
                if (list.length) onAdd(list);
              }}
            />
          </>
        )}
      </div>

      {error && (
        <div className="note-in mt-3 text-xs text-[#C4551B] bg-[#FDEBE0] border border-[#F2C9A8] rounded p-2 flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="mt-3 text-sm text-[#6E6E6E]">{emptyText}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border border-[#EEEEEE] rounded-lg p-2 bg-[#FAFAFA] min-w-0">
              <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-md overflow-hidden bg-white border border-[#E0E0E0] shrink-0 flex items-center justify-center">
                {isImageName(a.file_name) ? <img src={attachmentUrl(a.id)} alt="" className="w-full h-full object-cover" loading="lazy" /> : <FileText size={20} className="text-[#6E6E6E]" />}
              </a>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[#111111] truncate" title={a.file_name}>
                  {a.file_name}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px]">
                  <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#4D4D4D] hover:text-[#E4002B]">
                    <ExternalLink size={11} /> Open
                  </a>
                  <a href={attachmentUrl(a.id, { download: true })} className="flex items-center gap-1 text-[#4D4D4D] hover:text-[#E4002B]">
                    <Download size={11} /> Download
                  </a>
                </div>
              </div>
              {editable && (
                <button type="button" onClick={() => onRemove(a)} title="Remove" className="no-press p-1.5 rounded text-[#B23A32] hover:bg-[#FAE4E2] shrink-0">
                  <X size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
