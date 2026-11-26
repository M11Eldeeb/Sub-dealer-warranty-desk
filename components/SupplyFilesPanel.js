"use client";
import { Loader2 } from "lucide-react";
import { uploadEvidence } from "@/lib/evidence-upload";

/**
 * The files the parts team must attach before a part can be marked "Supplied to Sub-Dealer": the part requisition and the waybill.
 * Each one is asked for only while the claim has none yet; one upload covers every part on the claim.
 */
export const SUPPLY_FILES = [
  { kind: "requisition", stage: "part_requisition", label: "Part requisition", prefix: "Requisition" },
  { kind: "waybill", stage: "part_waybill", label: "Waybill", prefix: "Waybill" },
];

export const EMPTY_SUPPLY_FILES = { requisition: [], waybill: [] };

/** Which files this claim still needs: `has` is { requisition, waybill } for what the claim already holds, `done` what this attempt already sent. */
export function supplyNeeds(has, done = {}) {
  return SUPPLY_FILES.filter((f) => !has[f.kind] && !done[f.kind]);
}

/**
 * Uploads the chosen files, one kind after the other. Returns { done, error }: `done` holds the kinds that went up (so a retry asks
 * only for the rest), `error` the message to show when something did not upload.
 */
export async function uploadSupplyFiles({ supabase, claimId, claimNumber, uploadedBy, needs, files }) {
  const done = {};
  for (const f of needs) {
    const list = files[f.kind] || [];
    const { failed } = await uploadEvidence({
      supabase,
      claimId,
      uploadedBy,
      stage: f.stage,
      items: list.map((file) => ({ file, name: `${f.prefix} - ${claimNumber} - ${file.name}` })),
    });
    if (failed.length < list.length) done[f.kind] = true;
    if (failed.length > 0) return { done, error: failed.map((x) => `${x.name}: ${x.message}`).join("; ") };
  }
  return { done, error: "" };
}

export default function SupplyFilesPanel({ needs, files, onFiles, boxKey, busy, onConfirm, onCancel, where = "" }) {
  const ready = needs.every((f) => (files[f.kind] || []).length > 0);
  return (
    <div className="bg-[#F4F4F4] border border-[#E0E0E0] rounded p-2 mt-2 space-y-2">
      <div className="text-xs font-bold text-[#111111]">
        To mark this part "Supplied to Sub-Dealer", attach the {needs.map((f) => f.label.toLowerCase()).join(" and the ")} — covers every part on this claim, and joins the sub-dealer&apos;s evidence{where}.
      </div>
      {needs.map((f) => (
        <div key={f.kind} className="space-y-1">
          <div className="text-[0.6875rem] font-bold text-[#4D4D4D]">
            {f.label} <span className="text-[#E4002B]">*</span>
          </div>
          <input
            type="file"
            multiple
            key={`${f.kind}-${boxKey}`}
            aria-label={f.label}
            onChange={(e) => onFiles(f.kind, Array.from(e.target.files || []))}
            className="text-xs"
          />
          {(files[f.kind] || []).length > 0 && (
            <div className="text-[0.6875rem] text-[#6E6E6E]">
              {files[f.kind].length} file(s) ready: {files[f.kind].map((x) => x.name).join(", ")}
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={!ready || busy}
          className="px-3 py-1.5 rounded font-bold text-[0.6875rem] text-white bg-[#5B4FB0] hover:bg-[#4A3F9A] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {busy && <Loader2 size={11} className="animate-spin" />}
          {busy ? "Uploading…" : "Confirm"}
        </button>
        <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 rounded font-bold text-[0.6875rem] text-[#6E6E6E] hover:bg-[#E0E0E0]">
          Cancel
        </button>
      </div>
    </div>
  );
}
