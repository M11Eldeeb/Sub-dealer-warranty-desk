"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sanitizeFileName } from "@/components/ui";
import { ChevronLeft, ChevronRight, Paperclip, X, Plus } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

export default function NewClaimPage() {
  const router = useRouter();
  const supabase = createClient();

  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [plate, setPlate] = useState("");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [branchAbbreviation, setBranchAbbreviation] = useState(null);
  const [receptionDate, setReceptionDate] = useState(today());
  const [customerComplaint, setCustomerComplaint] = useState("");
  const [causeOfDefect, setCauseOfDefect] = useState("");
  const [correction, setCorrection] = useState("");
  const [comment, setComment] = useState("");
  const [parts, setParts] = useState([]);
  const [labor, setLabor] = useState([{ code: "", name: "" }]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("branch_id").eq("id", user.id).single();
      if (!prof?.branch_id) return;
      const { data: branch } = await supabase.from("branches").select("abbreviation").eq("id", prof.branch_id).single();
      if (branch?.abbreviation) setBranchAbbreviation(branch.abbreviation);
    })();
  }, []);


  const validParts = parts.filter((p) => p.name.trim());
  const validLabor = labor.filter((l) => l.name.trim());
  const canSubmit =
    vin &&
    mileage &&
    plate &&
    workOrderNumber &&
    receptionDate &&
    customerComplaint &&
    causeOfDefect &&
    correction &&
    validLabor.length > 0 &&
    !saving;

  const [previewUrls, setPreviewUrls] = useState([]);
  useEffect(() => {
    const urls = files.map((f) => (f.type.startsWith("image/") || f.type.startsWith("video/") ? URL.createObjectURL(f) : null));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  const previewLocalFile = (file) => {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
  };

  const isMediaFile = (f) => f.type.startsWith("image/") || f.type.startsWith("video/");
  const mediaEntries = files.map((f, i) => ({ file: f, url: previewUrls[i], index: i })).filter((m) => m.url);
  const [lightboxPos, setLightboxPos] = useState(null);
  const openLightboxForFile = (fileIndex) => {
    const pos = mediaEntries.findIndex((m) => m.index === fileIndex);
    if (pos !== -1) setLightboxPos(pos);
  };
  const showPrev = () => setLightboxPos((p) => (p - 1 + mediaEntries.length) % mediaEntries.length);
  const showNext = () => setLightboxPos((p) => (p + 1) % mediaEntries.length);

  useEffect(() => {
    if (lightboxPos === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxPos(null);
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxPos, mediaEntries.length]);

  const updatePart = (i, field, value) => {
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  };

  const updateLabor = (i, field, value) => {
    setLabor((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    const { data: claim, error: claimError } = await supabase
      .from("claims")
      .insert({
        branch_id: profile.branch_id,
        created_by: profile.id,
        vin,
        mileage: parseInt(mileage, 10),
        plate,
        work_order_number: branchAbbreviation ? `${branchAbbreviation}-${workOrderNumber}` : workOrderNumber,
        reception_date: receptionDate,
        customer_complaint: customerComplaint,
        cause_of_defect: causeOfDefect,
        correction,
        comment: comment.trim() || "Sub Dealer Submitted",
        status: "submitted",
      })
      .select()
      .single();

    if (claimError) {
      setSaving(false);
      return setError(claimError.message);
    }

    for (const p of validParts) {
      await supabase.from("claim_parts").insert({
        claim_id: claim.id,
        name: p.name,
        part_number: p.partNumber || null,
        qty: parseInt(p.qty, 10) || 1,
      });
    }

    for (const l of validLabor) {
      await supabase.from("claim_labor").insert({
        claim_id: claim.id,
        labor_code: l.code || null,
        labor_name: l.name,
      });
    }

    for (const file of files) {
      const path = `${claim.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("evidence").upload(path, file);
      if (uploadError) {
        setError(`Claim created, but "${file.name}" failed to upload: ${uploadError.message}`);
        continue;
      }
      await supabase.from("claim_attachments").insert({
        claim_id: claim.id,
        file_path: path,
        file_name: file.name,
        stage: "evidence_before",
        uploaded_by: profile.id,
      });
    }

    await supabase.from("claim_status_log").insert([
      { claim_id: claim.id, from_status: null, to_status: "draft", actor_name: profile.full_name, note: "Claim created" },
      { claim_id: claim.id, from_status: "draft", to_status: "submitted", actor_name: profile.full_name, note: "Submitted for review" },
    ]);

    setSaving(false);
    router.push(`/claims/${claim.id}`);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#F4F4F4] px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => {
            router.refresh();
            router.back();
          }}
          className="flex items-center gap-1 text-sm text-[#4D4D4D] hover:text-[#111111] mb-4"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide mb-1">New Warranty Claim</h2>
        <p className="text-sm text-[#6E6E6E] mb-6">Fill in vehicle and repair details, then attach supporting evidence.</p>

        <div className="space-y-4 bg-white border border-[#E0E0E0] rounded-lg p-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="VIN">
              <input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17-character VIN" className="input font-mono" />
            </Field>
            <Field label="Mileage (km)">
              <input type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="45000" className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plate Number">
              <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC 1234" className="input" />
            </Field>
            <Field label="Work Order Number (Sub-Dealer)">
              {branchAbbreviation ? (
                <div className="flex">
                  <span className="flex items-center px-3 rounded-l border border-r-0 border-[#E0E0E0] bg-[#F1F2F4] text-sm font-mono font-bold text-[#4D4D4D]">
                    {branchAbbreviation}-
                  </span>
                  <input
                    value={workOrderNumber}
                    onChange={(e) => setWorkOrderNumber(e.target.value)}
                    placeholder="12345"
                    className="input rounded-l-none"
                  />
                </div>
              ) : (
                <input value={workOrderNumber} onChange={(e) => setWorkOrderNumber(e.target.value)} placeholder="WO-2026-0451" className="input" />
              )}
            </Field>
          </div>
          <Field label="Reception Date">
            <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} className="input" />
          </Field>
          <Field label="Customer Complaint">
            <textarea
              value={customerComplaint}
              onChange={(e) => setCustomerComplaint(e.target.value)}
              rows={2}
              placeholder="What the customer reported..."
              className="input resize-none"
            />
          </Field>
          <Field label="Cause of Defect">
            <textarea
              value={causeOfDefect}
              onChange={(e) => setCauseOfDefect(e.target.value)}
              rows={2}
              placeholder="Diagnosis / root cause..."
              className="input resize-none"
            />
          </Field>
          <Field label="Correction">
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              rows={2}
              placeholder="Repair action taken..."
              className="input resize-none"
            />
          </Field>

          <Field label="Labor Code and Name">
            <div className="space-y-2">
              {labor.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.code}
                    onChange={(e) => updateLabor(i, "code", e.target.value)}
                    placeholder="Labor code"
                    className="input flex-1 font-mono"
                  />
                  <input
                    value={l.name}
                    onChange={(e) => updateLabor(i, "name", e.target.value)}
                    placeholder="Labor name"
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setLabor((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={labor.length === 1}
                    title="Remove labor line"
                    className="text-[#B23A32] hover:bg-[#FAE4E2] rounded p-2 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLabor((prev) => [...prev, { code: "", name: "" }])}
                className="flex items-center gap-1 text-xs font-bold text-[#E4002B] hover:underline"
              >
                <Plus size={13} /> Add another labor line
              </button>
            </div>
          </Field>

          <Field label="Part Number and Name (optional — leave empty for labor-only claims)">
            <div className="space-y-2">
              {parts.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={p.name}
                    onChange={(e) => updatePart(i, "name", e.target.value)}
                    placeholder="Part name"
                    className="input flex-1"
                  />
                  <input
                    value={p.partNumber}
                    onChange={(e) => updatePart(i, "partNumber", e.target.value)}
                    placeholder="Part number"
                    className="input flex-1 font-mono"
                  />
                  <input
                    type="number"
                    min="1"
                    value={p.qty}
                    onChange={(e) => updatePart(i, "qty", e.target.value)}
                    className="input w-16"
                  />
                  <button
                    type="button"
                    onClick={() => setParts((prev) => prev.filter((_, idx) => idx !== i))}
                    title="Remove part"
                    className="text-[#B23A32] hover:bg-[#FAE4E2] rounded p-2 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setParts((prev) => [...prev, { name: "", partNumber: "", qty: 1 }])}
                className="flex items-center gap-1 text-xs font-bold text-[#E4002B] hover:underline"
              >
                <Plus size={13} /> {parts.length === 0 ? "Add a part" : "Add another part"}
              </button>
            </div>
          </Field>

          <Field label="Attachments">
            <label className="flex items-center gap-2 border border-dashed border-[#C7C7C7] rounded px-3 py-3 text-sm text-[#6E6E6E] cursor-pointer hover:border-[#E4002B] hover:text-[#E4002B] transition-colors">
              <Paperclip size={15} />
              {files.length ? `${files.length} file(s) attached` : "Attach photos, videos, or diagnostic reports"}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setFiles((prev) => [...prev, ...e.target.files])}
              />
            </label>
            {files.length > 0 && (
              <>
                <div className="border border-[#E0E0E0] rounded-lg divide-y divide-[#E0E0E0] mt-2 overflow-hidden">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-white">
                      <button
                        type="button"
                        onClick={() => (isMediaFile(f) ? openLightboxForFile(i) : previewLocalFile(f))}
                        className="text-xs font-mono text-[#1A1A1A] hover:underline text-left truncate"
                      >
                        {f.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        title="Remove"
                        className="text-[#B23A32] hover:bg-[#FAE4E2] rounded p-1 shrink-0 ml-2"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {previewUrls.some((u) => u) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {files.map((f, i) =>
                      previewUrls[i] ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => openLightboxForFile(i)}
                          className="w-20 h-20 rounded-lg overflow-hidden border border-[#E0E0E0] hover:ring-2 hover:ring-[#E4002B] transition-shadow shrink-0"
                          title={f.name}
                        >
                          {f.type.startsWith("image/") ? (
                            <img src={previewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                          ) : (
                            <video src={previewUrls[i]} muted className="w-full h-full object-cover" />
                          )}
                        </button>
                      ) : null
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="text-xs font-bold text-[#B23A32] hover:underline mt-2"
                >
                  Clear all attachments
                </button>
              </>
            )}
          </Field>

          <Field label="Comment (optional)">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder='Leave blank to record as "Sub Dealer Submitted"'
              className="input resize-none"
            />
          </Field>
        </div>

        {error && <div className="text-sm text-[#B23A32] mt-3">{error}</div>}

        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="mt-5 px-5 py-2.5 rounded font-bold text-sm uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:bg-[#D0D0D0] disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Submitting…" : "Submit Claim"}
        </button>
      </div>

      {lightboxPos !== null && mediaEntries[lightboxPos] && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center px-4" onClick={() => setLightboxPos(null)}>
          <button
            onClick={() => setLightboxPos(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
          >
            <X size={20} />
          </button>

          {mediaEntries.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showPrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full flex flex-col items-center">
            {mediaEntries[lightboxPos].file.type.startsWith("image/") ? (
              <img
                src={mediaEntries[lightboxPos].url}
                alt={mediaEntries[lightboxPos].file.name}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            ) : (
              <video src={mediaEntries[lightboxPos].url} controls autoPlay className="max-h-[75vh] max-w-full rounded-lg" />
            )}
            <div className="text-white/90 text-sm mt-3 font-mono">
              {mediaEntries[lightboxPos].file.name}
              {mediaEntries.length > 1 && (
                <span className="text-white/50"> · {lightboxPos + 1} / {mediaEntries.length}</span>
              )}
            </div>
          </div>

          {mediaEntries.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
