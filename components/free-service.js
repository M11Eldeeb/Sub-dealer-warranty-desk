"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, UploadCloud, X, Download, ExternalLink, FileText, Loader2, AlertCircle, CheckCircle2, Circle, Image as ImageIcon } from "lucide-react";
import { attachmentUrl } from "@/lib/evidence-upload";

/** Free Service statuses: wording the sub-dealer and the dealer both understand. */
export const FS_STATUS = {
  submitted: { label: "Awaiting approval", color: "#9A5C00", bg: "#FCF1DA" },
  returned: { label: "Returned for edit", color: "#A84917", bg: "#FDEBE0" },
  rejected: { label: "Rejected", color: "#B23A32", bg: "#FAE4E2" },
  approved: { label: "Approved · invoice needed", color: "#2A62B0", bg: "#E4EDFA" },
  invoice_submitted: { label: "Invoice under review", color: "#0E7490", bg: "#E0F2FE" },
  invoice_returned: { label: "Invoice returned", color: "#A84917", bg: "#FDEBE0" },
  closed: { label: "Completed", color: "#1D7466", bg: "#E1F2EE" },
  cancelled: { label: "Cancelled", color: "#696969", bg: "#F1F2F4" },
};

export function FsStatusTag({ status }) {
  const s = FS_STATUS[status] || { label: status, color: "#696969", bg: "#F1F2F4" };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: s.color, background: s.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export const formatSar = (n) => (n == null ? "—" : `SAR ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export const isImageName = (name) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name || "");

/** The four files every Free Service request must come with. The label becomes the start of the stored file name. */
export const FS_DOCS = [
  { key: "registration", label: "Registration Photo", hint: "Photo of the vehicle registration card", accept: "image/*", kind: "image" },
  { key: "vin", label: "VIN Photo", hint: "Photo of the VIN plate", accept: "image/*", kind: "image" },
  { key: "mileage", label: "Mileage Photo", hint: "Photo of the odometer", accept: "image/*", kind: "image" },
  { key: "contract", label: "Free Service Contract", hint: "The contract, as a PDF", accept: "application/pdf,.pdf", kind: "pdf" },
];

export const docFileName = (doc, file) => `${doc.label} - ${file.name}`;
export const docOf = (fileName) => FS_DOCS.find((d) => String(fileName || "").toLowerCase().startsWith(`${d.label.toLowerCase()} - `)) || null;
export const missingDocs = (attachments) => FS_DOCS.filter((d) => !attachments.some((a) => docOf(a.file_name)?.key === d.key));

/** Does this file fit the slot (photos for photo slots, PDF for the contract)? */
export const fitsDoc = (doc, file) => (doc.kind === "image" ? file.type.startsWith("image/") || isImageName(file.name) : file.type === "application/pdf" || /\.pdf$/i.test(file.name));

/** "Uploading file 2 of 4" with a bar that fills as the bytes go up. */
export function UploadProgress({ progress }) {
  if (!progress) return null;
  const pct = Math.max(2, Math.min(100, Math.round((progress.fraction || 0) * 100)));
  return (
    <div className="note-in rounded-lg border border-[#CFE0F5] bg-[#F1F6FC] p-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#2A62B0]">
        <span className="flex items-center gap-2 min-w-0">
          <Loader2 size={13} className="animate-spin shrink-0" />
          <span className="truncate">{progress.saving ? "Saving your files…" : progress.current ? `Uploading file ${progress.current} of ${progress.total}` : "Getting ready…"}</span>
        </span>
        <span className="shrink-0">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[#D5E3F5] overflow-hidden">
        <div className="h-full rounded-full bg-[#2A62B0] transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
      </div>
      {progress.name && !progress.saving && <div className="mt-1.5 text-[11px] text-[#4D4D4D] truncate">{progress.name}</div>}
      <div className="mt-1 text-[11px] text-[#6E6E6E]">Please keep this page open until it finishes.</div>
    </div>
  );
}

/** A labelled value in the details card. */
export function Fact({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#6E6E6E]">{label}</div>
      <div className={`mt-0.5 text-sm text-[#111111] break-words ${mono ? "font-mono" : "font-medium"}`}>{value || "—"}</div>
    </div>
  );
}

/** One required file on the request form: choose it, see it, swap it. */
export function DocSlot({ doc, file, onChange, disabled }) {
  const input = useRef(null);
  const [problem, setProblem] = useState("");
  const preview = useMemo(() => (file && doc.kind === "image" ? URL.createObjectURL(file) : null), [file, doc.kind]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (list) => {
    const picked = list?.[0];
    if (!picked) return;
    if (!fitsDoc(doc, picked)) return setProblem(doc.kind === "image" ? "Please choose a photo." : "Please choose a PDF file.");
    setProblem("");
    onChange(picked);
  };

  return (
    <div className={`rounded-lg border p-3 transition-colors ${file ? "border-[#B8DEC1] bg-[#F5FBF7]" : "border-[#E0E0E0] bg-white"}`}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-md overflow-hidden bg-white border border-[#E0E0E0] shrink-0 flex items-center justify-center">
          {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : file ? <FileText size={20} className="text-[#2E7D46]" /> : doc.kind === "image" ? <ImageIcon size={20} className="text-[#A0A0A0]" /> : <FileText size={20} className="text-[#A0A0A0]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-bold text-[#111111]">
            {file ? <CheckCircle2 size={14} className="text-[#2E7D46] shrink-0" /> : <Circle size={14} className="text-[#C0C0C0] shrink-0" />}
            {doc.label}
          </div>
          <div className="text-xs text-[#6E6E6E] truncate">{file ? file.name : doc.hint}</div>
        </div>
        {file ? (
          <button type="button" onClick={() => onChange(null)} disabled={disabled} title="Remove" className="no-press tap-icon p-1.5 rounded text-[#B23A32] hover:bg-[#FAE4E2] shrink-0 disabled:opacity-50">
            <X size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#E4002B] hover:text-[#E4002B] disabled:opacity-50 transition-colors shrink-0"
          >
            <UploadCloud size={13} /> Choose
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={doc.accept}
          className="hidden"
          onChange={(e) => {
            pick(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>
      {problem && <div className="note-in mt-2 text-xs text-[#C4551B]">{problem}</div>}
    </div>
  );
}

/** Picks extra files (click or drop) and lists them before they are sent. */
export function FilePicker({ files, onChange, disabled, label = "Attach files", hint = "Click to choose, or drop files here" }) {
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
        className={`flex flex-col items-center justify-center gap-1 text-center rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors ${
          over ? "border-[#E4002B] bg-[#FFF5F6]" : "border-[#D5D5D5] bg-[#FAFAFA] hover:border-[#E4002B] hover:bg-[#FFF5F6]"
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        <UploadCloud size={20} className="text-[#E4002B]" />
        <span className="text-sm font-bold text-[#111111]">{label}</span>
        <span className="text-xs text-[#6E6E6E]">{hint}</span>
        <input
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
              <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} disabled={disabled} title="Remove" className="no-press tap-icon p-1 rounded text-[#B23A32] hover:bg-[#FAE4E2] shrink-0">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Downloads a set of saved files as one zip (instead of one by one). */
export function DownloadAllButton({ attachments, zipName }) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  if (!attachments || attachments.length < 2) return null;

  const run = async () => {
    setWorking(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const used = new Set();
      for (let i = 0; i < attachments.length; i++) {
        setProgress(`File ${i + 1} of ${attachments.length}…`);
        try {
          const res = await fetch(attachmentUrl(attachments[i].id));
          if (!res.ok) continue;
          let name = attachments[i].file_name;
          while (used.has(name)) name = `${i + 1}-${name}`;
          used.add(name);
          zip.file(name, await res.blob());
        } catch {
          // skip a file that cannot be fetched instead of failing the whole zip
        }
      }
      setProgress("Zipping…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${zipName || "files"}.zip`.replace(/[\\/:*?"<>|]+/g, "_");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setWorking(false);
      setProgress("");
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={working}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#111111] disabled:opacity-60 transition-colors"
    >
      {working ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {working ? progress || "Preparing…" : `Download all (${attachments.length})`}
    </button>
  );
}

function FileRow({ a, editable, onRemove }) {
  const doc = docOf(a.file_name);
  const shown = doc ? a.file_name.slice(doc.label.length + 3) : a.file_name;
  return (
    <li className="flex items-center gap-3 border border-[#EEEEEE] rounded-lg p-2 bg-[#FAFAFA] min-w-0">
      <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-md overflow-hidden bg-white border border-[#E0E0E0] shrink-0 flex items-center justify-center">
        {isImageName(a.file_name) ? <img src={attachmentUrl(a.id)} alt="" className="w-full h-full object-cover" loading="lazy" /> : <FileText size={20} className="text-[#6E6E6E]" />}
      </a>
      <div className="min-w-0 flex-1">
        {doc && <div className="text-[11px] font-black uppercase tracking-wide text-[#E4002B]">{doc.label}</div>}
        <div className="text-sm font-medium text-[#111111] truncate" title={shown}>
          {shown}
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
        <button type="button" onClick={() => onRemove(a)} title="Remove" className="no-press tap-icon p-1.5 rounded text-[#B23A32] hover:bg-[#FAE4E2] shrink-0">
          <X size={15} />
        </button>
      )}
    </li>
  );
}

/**
 * The files already saved on a request (for one stage), with a Download all button.
 * When `editable`, files can be removed and more added straight away.
 */
export function SavedFiles({ title, hint, attachments, editable, uploading, error, onAdd, onRemove, zipName, emptyText = "Nothing attached yet.", children }) {
  const input = useRef(null);
  return (
    <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#111111]">{title}</h3>
          {hint && <p className="text-xs text-[#6E6E6E] mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DownloadAllButton attachments={attachments} zipName={zipName} />
          {editable && onAdd && (
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
      </div>

      {children}

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
            <FileRow key={a.id} a={a} editable={editable} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** When a request is returned: the four required files with their state, plus a way to add or replace each. */
export function RequiredDocsEditor({ attachments, uploading, onAddDoc, onRemove }) {
  return (
    <div className="mt-3 space-y-2">
      {FS_DOCS.map((doc) => {
        const have = attachments.filter((a) => docOf(a.file_name)?.key === doc.key);
        return (
          <DocUploadRow key={doc.key} doc={doc} have={have} uploading={uploading} onAddDoc={onAddDoc} onRemove={onRemove} />
        );
      })}
    </div>
  );
}

function DocUploadRow({ doc, have, uploading, onAddDoc, onRemove }) {
  const input = useRef(null);
  const [problem, setProblem] = useState("");
  const done = have.length > 0;
  return (
    <div className={`rounded-lg border p-3 ${done ? "border-[#B8DEC1] bg-[#F5FBF7]" : "border-[#F2C9A8] bg-[#FFF8F3]"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[#111111] min-w-0 flex-1">
          {done ? <CheckCircle2 size={14} className="text-[#2E7D46] shrink-0" /> : <AlertCircle size={14} className="text-[#C4551B] shrink-0" />}
          {doc.label}
          {!done && <span className="text-[11px] font-bold text-[#C4551B] uppercase tracking-wide">missing</span>}
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E0E0E0] bg-white text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#E4002B] hover:text-[#E4002B] disabled:opacity-50 transition-colors"
        >
          <UploadCloud size={13} /> {done ? "Add another" : "Choose"}
        </button>
        <input
          ref={input}
          type="file"
          accept={doc.accept}
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            if (!fitsDoc(doc, picked)) return setProblem(doc.kind === "image" ? "Please choose a photo." : "Please choose a PDF file.");
            setProblem("");
            onAddDoc(doc, picked);
          }}
        />
      </div>
      {have.map((a) => (
        <div key={a.id} className="mt-2 flex items-center gap-2 text-xs">
          <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="truncate text-[#4D4D4D] hover:text-[#E4002B] underline-offset-2 hover:underline min-w-0 flex-1">
            {a.file_name.slice(doc.label.length + 3)}
          </a>
          <button type="button" onClick={() => onRemove(a)} title="Remove" className="no-press tap-icon p-1 rounded text-[#B23A32] hover:bg-[#FAE4E2] shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
      {problem && <div className="note-in mt-2 text-xs text-[#C4551B]">{problem}</div>}
    </div>
  );
}
