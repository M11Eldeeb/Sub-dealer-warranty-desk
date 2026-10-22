"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header, fmt } from "@/components/ui";
import { FsStatusTag, Fact, SavedFiles, formatSar, FS_STATUS, RequiredDocsEditor, UploadProgress, docOf, docFileName, missingDocs } from "@/components/free-service";
import { uploadEvidence, removeAttachment, syncClaimFolder } from "@/lib/evidence-upload";
import { ChevronLeft, Check, CornerUpLeft, XCircle, Loader2, Send, Info, CheckCircle2, AlertCircle, Receipt, Lock, Ban } from "lucide-react";

// Work orders are stored with the branch prefix (BAS-123); the edit box shows only the number after it.
const stripBranchPrefix = (value, abbreviation) => {
  const v = String(value || "").trim();
  const p = abbreviation ? `${abbreviation}-` : "";
  return p && v.toUpperCase().startsWith(p.toUpperCase()) ? v.slice(p.length).trim() : v;
};

export default function FreeServiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [claim, setClaim] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const [busy, setBusy] = useState(null);
  const [mode, setMode] = useState(null); // staff: approve | return | reject
  const [note, setNote] = useState("");
  const [dealerPrefix, setDealerPrefix] = useState("HER");
  const [dealerWO, setDealerWO] = useState("");
  const [amount, setAmount] = useState("");
  const [uploadingStage, setUploadingStage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [fileError, setFileError] = useState({});
  const [message, setMessage] = useState(null); // { ok, text }

  const [edit, setEdit] = useState({ workOrder: "", vin: "", mileage: "", service: "", comment: "" });

  const load = async (resetEdit = false) => {
    const { data: c } = await supabase.from("claims").select("*, branches(name, abbreviation)").eq("id", params.id).eq("kind", "free_service").maybeSingle();
    if (!c) {
      setMissing(true);
      return false;
    }
    setClaim(c);
    if (resetEdit) setEdit({ workOrder: stripBranchPrefix(c.work_order_number || "", c.branches?.abbreviation), vin: c.vin || "", mileage: String(c.mileage ?? ""), service: c.service_requested || "", comment: c.comment || "" });
    const [{ data: a }, { data: l }] = await Promise.all([
      supabase.from("claim_attachments").select("*").eq("claim_id", c.id).order("uploaded_at", { ascending: true }),
      supabase.from("claim_status_log").select("*").eq("claim_id", c.id).order("at", { ascending: false }),
    ]);
    setAttachments(a || []);
    setLog(l || []);
    return true;
  };

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || !["sub_dealer", "dealer", "admin", "manager"].includes(prof.role)) return router.push("/");
      setProfile(prof);
      await load(true);
      const failed = new URLSearchParams(window.location.search).get("uploadFailed");
      if (failed) setFileError({ evidence_before: `These files did not upload: ${failed}. Add them again below.` });
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">
        <div className="w-5 h-5 rounded-full border-2 border-[#E0E0E0] border-t-[#E4002B] animate-spin mr-2" /> Loading…
      </div>
    );

  const isSub = profile?.role === "sub_dealer";
  const isViewer = profile?.role === "manager"; // read only: no decisions, no edits
  const isStaff = !isSub && !isViewer;
  const back = isSub ? "/dashboard/free-service" : "/dashboard/free-service";

  if (missing || !claim)
    return (
      <div className="min-h-screen bg-[#F4F4F4]">
        <Header profile={profile} onSignOut={signOut} />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Lock className="mx-auto mb-3 text-[#6E6E6E]" size={26} />
          <div className="font-black uppercase tracking-wide text-[#111111]">Request not found</div>
          <p className="text-sm text-[#6E6E6E] mt-1">It may not exist, or Free Service is not open to you yet.</p>
          <button onClick={() => router.push(back)} className="mt-4 text-sm font-bold text-[#E4002B] hover:underline">
            Back to Free Service
          </button>
        </div>
      </div>
    );

  const status = claim.status;
  const evidence = attachments.filter((a) => a.stage === "evidence_before");
  const invoices = attachments.filter((a) => a.stage === "after_repair");
  const latestNote = (to) => log.find((l) => l.to_status === to)?.note || "";

  const addLog = (from, to, text) => supabase.from("claim_status_log").insert({ claim_id: claim.id, from_status: from, to_status: to, actor_name: profile.full_name, note: text });

  // E-mail for the step. Never blocks the step; shows a note if it failed.
  const notify = async (event, reason) => {
    try {
      const res = await fetch("/api/notify-free-service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: claim.id, event, reason }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return `The step was saved, but the notification email failed: ${data.error || "unknown error"}`;
    } catch {
      return "The step was saved, but the notification email could not be sent (network error).";
    }
    return null;
  };

  // Runs one step: update the request, write the log, send the e-mail, reload.
  const step = async (name, { patch, to, logText, event, reason, after }) => {
    if (busy) return;
    setBusy(name);
    setMessage(null);
    try {
      const { error } = await supabase.from("claims").update(patch).eq("id", claim.id);
      if (error) return setMessage({ ok: false, text: error.message });
      await addLog(status, to, logText);
      if (after) await after();
      const warning = await notify(event, reason);
      await load(true);
      setMode(null);
      setNote("");
      setMessage(warning ? { ok: false, text: warning } : null);
    } finally {
      setBusy(null);
    }
  };

  const fullDealerWO = dealerPrefix.trim() ? `${dealerPrefix.trim()}-${dealerWO.trim()}` : dealerWO.trim();
  const amountNumber = Number(amount);
  const amountOk = amount !== "" && Number.isFinite(amountNumber) && amountNumber > 0;

  const approveRequest = () =>
    step("approve", {
      patch: { status: "approved", dealer_work_order_number: fullDealerWO, approved_amount: Math.round(amountNumber * 100) / 100 },
      to: "approved",
      logText: `Approved. Dealer Work Order # ${fullDealerWO}. Approved amount ${formatSar(amountNumber)}.`,
      event: "approved",
      after: () => syncClaimFolder(claim.id),
    });
  const approveInvoice = () => step("approve", { patch: { status: "closed" }, to: "closed", logText: "Invoice approved — Free Service completed.", event: "completed" });
  const returnIt = (invoicePhase) =>
    step("return", {
      patch: invoicePhase ? { status: "invoice_returned" } : { status: "returned", returned_since: new Date().toISOString() },
      to: invoicePhase ? "invoice_returned" : "returned",
      logText: note.trim(),
      event: invoicePhase ? "invoice_returned" : "returned",
      reason: note.trim(),
    });
  const rejectIt = () => step("reject", { patch: { status: "rejected" }, to: "rejected", logText: note.trim(), event: "rejected", reason: note.trim() });

  const woPrefix = claim.branches?.abbreviation ? `${claim.branches.abbreviation}-` : "";
  const docsMissing = missingDocs(evidence);
  const editValid = edit.workOrder.trim() && edit.vin.trim() && edit.service.trim() && edit.mileage !== "" && Number(edit.mileage) >= 0 && docsMissing.length === 0;
  const resubmit = () =>
    step("resubmit", {
      patch: { status: "submitted", work_order_number: `${woPrefix}${stripBranchPrefix(edit.workOrder, woPrefix.slice(0, -1))}`, vin: edit.vin.trim().toUpperCase(), mileage: Number(edit.mileage), service_requested: edit.service.trim(), comment: edit.comment.trim() || null },
      to: "submitted",
      logText: "Corrected and resubmitted.",
      event: "submitted",
    });
  const cancelIt = () => step("cancel", { patch: { status: "cancelled" }, to: "cancelled", logText: "Cancelled by the sub-dealer.", event: "cancelled" });
  const submitInvoice = () => step("invoice", { patch: { status: "invoice_submitted" }, to: "invoice_submitted", logText: "Invoice uploaded.", event: "invoice_submitted" });

  const addFiles = async (stage, files, nameOf = (file) => file.name) => {
    setUploadingStage(stage);
    setUploadProgress({ current: 0, total: files.length, fraction: 0 });
    setFileError((e) => ({ ...e, [stage]: "" }));
    const { failed } = await uploadEvidence({ supabase, claimId: claim.id, uploadedBy: profile.id, stage, items: files.map((file) => ({ file, name: nameOf(file) })), onProgress: setUploadProgress });
    if (failed.length) setFileError((e) => ({ ...e, [stage]: failed.map((f) => `${f.name}: ${f.message}`).join("; ") }));
    await load(); // the typed-in details stay as they are
    setUploadingStage(null);
    setUploadProgress(null);
  };
  const addDocFile = (doc, file) => addFiles("evidence_before", [file], (f) => docFileName(doc, f));
  const removeFile = async (stage, att) => {
    setFileError((e) => ({ ...e, [stage]: "" }));
    try {
      await removeAttachment(att.id);
    } catch (err) {
      setFileError((e) => ({ ...e, [stage]: err.message }));
    }
    await load();
  };

  const uploading = !!uploadingStage; // the buttons that send things stay faded until every file is saved
  const canCancel = isSub && ["returned", "invoice_returned"].includes(status);
  const evidenceEditable = isSub && status === "returned";
  const invoiceEditable = isSub && ["approved", "invoice_returned"].includes(status);
  const showInvoice = ["approved", "invoice_submitted", "invoice_returned", "closed"].includes(status);

  // ---- what happens next, in words ----------------------------------------------------------
  const banner = (() => {
    if (status === "cancelled") return { tone: "info", title: "Cancelled", text: isSub ? "You cancelled this request." : "The sub-dealer cancelled this request." };
    if (isViewer) return status === "rejected" || status === "returned" || status === "invoice_returned" ? { tone: status === "rejected" ? "bad" : "warn", title: FS_STATUS[status]?.label, text: latestNote(status) } : { tone: "info", title: FS_STATUS[status]?.label || status, text: "You can view this request but not change it." };
    if (status === "submitted") return isSub ? { tone: "info", title: "Waiting for the dealer", text: "Your request was sent. You will get an email as soon as it is approved, returned or rejected." } : { tone: "action", title: "Needs your decision", text: "Review the details and files below, then approve, return for edit or reject." };
    if (status === "returned") return isSub ? { tone: "warn", title: "Returned for edit", text: latestNote("returned"), hint: "Correct the details or files below, then resubmit." } : { tone: "info", title: "Waiting for the sub-dealer", text: "Returned for edit.", hint: latestNote("returned") };
    if (status === "approved") return isSub ? { tone: "good", title: `Approved — ${formatSar(claim.approved_amount)}`, text: "Upload your invoice below so we can complete the request." } : { tone: "info", title: "Approved — waiting for the invoice", text: `The sub-dealer was asked to upload the invoice (${formatSar(claim.approved_amount)}).` };
    if (status === "invoice_submitted") return isSub ? { tone: "info", title: "Invoice under review", text: "The dealer is checking your invoice. You will get an email with the result." } : { tone: "action", title: "Invoice needs your decision", text: "Check the invoice below, then approve it, return it for edit or reject it." };
    if (status === "invoice_returned") return isSub ? { tone: "warn", title: "Invoice returned", text: latestNote("invoice_returned"), hint: "Upload the corrected invoice below and send it again." } : { tone: "info", title: "Waiting for a corrected invoice", text: latestNote("invoice_returned") };
    if (status === "closed") return { tone: "good", title: "Completed", text: `Approved amount ${formatSar(claim.approved_amount)}. Nothing more to do.` };
    if (status === "rejected") return { tone: "bad", title: "Rejected", text: latestNote("rejected") };
    if (status === "cancelled") return { tone: "info", title: "Cancelled", text: isSub ? "You cancelled this request." : "The sub-dealer cancelled this request." };
    return null;
  })();
  const tones = {
    info: ["#F1F6FC", "#CFE0F5", "#2A62B0", Info],
    action: ["#FFF5F6", "#F8C9D0", "#B8001F", AlertCircle],
    warn: ["#FDEBE0", "#F2C9A8", "#C4551B", AlertCircle],
    good: ["#E8F5EC", "#B8DEC1", "#2E7D46", CheckCircle2],
    bad: ["#FAE4E2", "#F2C9C5", "#B23A32", XCircle],
  };

  const decisionPhase = isStaff && status === "submitted" ? "request" : isStaff && status === "invoice_submitted" ? "invoice" : null;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8 page-in space-y-4">
        <button onClick={() => router.push(back)} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111]">
          <ChevronLeft size={16} /> Free Service
        </button>

        {/* Title */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-mono text-xs text-[#6E6E6E]">
              {claim.claim_number} · {claim.branches?.name}
            </div>
            <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide break-words">WO# {[claim.work_order_number, claim.dealer_work_order_number].filter(Boolean).join(" / ")}</h2>
          </div>
          <FsStatusTag status={status} />
        </div>

        {message && (
          <div className={`note-in text-xs rounded-lg border p-3 flex items-start gap-2 ${message.ok ? "bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]"}`}>
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {message.text}
          </div>
        )}

        {/* What happens next */}
        {banner && (() => {
          const [bg, border, color, Icon] = tones[banner.tone];
          return (
            <div className="note-in rounded-lg border p-4 flex items-start gap-3" style={{ background: bg, borderColor: border }}>
              <Icon size={18} className="mt-0.5 shrink-0" style={{ color }} />
              <div className="min-w-0">
                <div className="text-sm font-black uppercase tracking-wide" style={{ color }}>
                  {banner.title}
                </div>
                {banner.text && <p className="text-sm mt-1 text-[#262626] whitespace-pre-wrap break-words">{banner.text}</p>}
                {banner.hint && <p className="text-xs mt-1 text-[#4D4D4D] break-words">{banner.hint}</p>}
              </div>
            </div>
          );
        })()}

        {/* Details */}
        <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#111111] mb-3">Details</h3>
          {evidenceEditable ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Work order (sub-dealer)">
                <div className="flex">
                  {woPrefix && <span className="flex items-center px-3 rounded-l border border-r-0 border-[#E0E0E0] bg-[#F1F2F4] text-sm font-mono font-bold text-[#4D4D4D]">{woPrefix}</span>}
                  <input className={`input ${woPrefix ? "rounded-l-none" : ""}`} value={edit.workOrder} onChange={(e) => setEdit({ ...edit, workOrder: e.target.value })} />
                </div>
              </Field>
              <Field label="VIN">
                <input className="input font-mono uppercase" value={edit.vin} onChange={(e) => setEdit({ ...edit, vin: e.target.value })} />
              </Field>
              <Field label="Mileage (km)">
                <input className="input" type="number" min="0" inputMode="numeric" value={edit.mileage} onChange={(e) => setEdit({ ...edit, mileage: e.target.value })} />
              </Field>
              <div className="sm:col-span-3">
                <Field label="Service requested">
                  <input className="input" value={edit.service} onChange={(e) => setEdit({ ...edit, service: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
              <Fact label="Work order (sub-dealer)" value={claim.work_order_number} mono />
              <Fact label="VIN" value={claim.vin} mono />
              <Fact label="Mileage" value={`${Number(claim.mileage ?? 0).toLocaleString("en-US")} km`} />
              <Fact label="Branch" value={claim.branches?.name} />
              <Fact label="Work order (dealer)" value={claim.dealer_work_order_number} mono />
              <Fact label="Approved amount" value={claim.approved_amount != null ? formatSar(claim.approved_amount) : null} />
              <Fact label="Requested" value={fmt(claim.created_at)} />
              <div className="col-span-2 sm:col-span-3">
                <Fact label="Service requested" value={claim.service_requested} />
              </div>
              {claim.comment && (
                <div className="col-span-2 sm:col-span-3">
                  <Fact label="Comment" value={claim.comment} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Files */}
        <SavedFiles
          title="Supporting files"
          hint={evidenceEditable ? "Make sure all four required files are there, then resubmit." : "Files sent with the request."}
          attachments={evidenceEditable ? evidence.filter((a) => !docOf(a.file_name)) : evidence}
          editable={evidenceEditable}
          uploading={uploadingStage === "evidence_before"}
          error={fileError.evidence_before}
          onAdd={(files) => addFiles("evidence_before", files)}
          onRemove={(a) => removeFile("evidence_before", a)}
          zipName={`${claim.claim_number} - ${claim.work_order_number} - supporting files`}
          emptyText={evidenceEditable ? "No other files." : "Nothing attached yet."}
        >
          {evidenceEditable && <RequiredDocsEditor attachments={evidence} uploading={uploading} onAddDoc={addDocFile} onRemove={(a) => removeFile("evidence_before", a)} />}
          {evidenceEditable && evidence.some((a) => !docOf(a.file_name)) && <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E]">Other files</div>}
        </SavedFiles>

        {evidenceEditable && (
          <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#111111]">Comment (optional)</h3>
            <p className="text-xs text-[#6E6E6E] mt-0.5">Anything the dealer should know. It stays here while you add files.</p>
            <textarea rows={3} className="input resize-none mt-3" value={edit.comment} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} placeholder="Add a comment..." />
          </section>
        )}

        {showInvoice && (
          <SavedFiles
            title="Invoice"
            hint={invoiceEditable ? "Upload the invoice (photo or PDF), then send it for review." : "The invoice uploaded by the sub-dealer."}
            attachments={invoices}
            editable={invoiceEditable}
            uploading={uploadingStage === "after_repair"}
            error={fileError.after_repair}
            onAdd={(files) => addFiles("after_repair", files)}
            onRemove={(a) => removeFile("after_repair", a)}
            zipName={`${claim.claim_number} - ${claim.work_order_number} - invoice`}
            emptyText="No invoice uploaded yet."
          />
        )}

        {/* Sub-dealer actions */}
        {uploading && <UploadProgress progress={uploadProgress} />}
        {evidenceEditable && (
          <ActionBar>
            <PrimaryButton onClick={resubmit} disabled={!!busy || uploading || !editValid} loading={busy === "resubmit"} icon={Send} label="Resubmit for approval" />
            {uploading ? (
              <span className="text-xs text-[#6E6E6E]">Waiting for the upload to finish…</span>
            ) : (
              docsMissing.length > 0 && <span className="text-xs text-[#C4551B]">Still needed: {docsMissing.map((d) => d.label).join(", ")}.</span>
            )}
          </ActionBar>
        )}
        {invoiceEditable && (
          <ActionBar>
            <PrimaryButton onClick={submitInvoice} disabled={!!busy || uploading || invoices.length === 0} loading={busy === "invoice"} icon={Receipt} label="Send invoice for review" />
            {uploading ? <span className="text-xs text-[#6E6E6E]">Waiting for the upload to finish…</span> : invoices.length === 0 && <span className="text-xs text-[#6E6E6E]">Upload the invoice first.</span>}
          </ActionBar>
        )}
        {canCancel && (
          <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
            {!confirmCancel ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-[#4D4D4D]">No longer needed? You can cancel this request. It moves to History.</p>
                <button onClick={() => setConfirmCancel(true)} disabled={!!busy || uploading} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#F2C9C5] text-xs font-bold uppercase tracking-wide text-[#B23A32] hover:bg-[#FAE4E2] disabled:opacity-40 transition-colors">
                  <Ban size={13} /> Cancel request
                </button>
              </div>
            ) : (
              <div className="note-in space-y-3">
                <p className="text-sm text-[#262626]">Cancel this Free Service request? The dealer is told, and you cannot reopen it - you would need to send a new request.</p>
                <div className="flex gap-2 flex-wrap">
                  <PrimaryButton onClick={cancelIt} disabled={!!busy} loading={busy === "cancel"} icon={Ban} label="Yes, cancel it" color="#B23A32" />
                  <button onClick={() => setConfirmCancel(false)} disabled={!!busy} className="px-4 py-2.5 rounded border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#4D4D4D] hover:border-[#111111]">
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Dealer / admin decision */}
        {decisionPhase && (
          <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#111111] mb-3">{decisionPhase === "invoice" ? "Decision on the invoice" : "Your decision"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <DecisionButton active={mode === "approve"} color="#2E7D46" icon={Check} label={decisionPhase === "invoice" ? "Approve & complete" : "Approve"} onClick={() => setMode(mode === "approve" ? null : "approve")} />
              <DecisionButton active={mode === "return"} color="#B45309" icon={CornerUpLeft} label="Return for edit" onClick={() => setMode(mode === "return" ? null : "return")} />
              <DecisionButton active={mode === "reject"} color="#B23A32" icon={XCircle} label="Reject" onClick={() => setMode(mode === "reject" ? null : "reject")} />
            </div>

            {mode === "approve" && decisionPhase === "request" && (
              <div className="note-in mt-4 space-y-3 border-t border-[#EEEEEE] pt-4">
                <Field label="Dealer work order number">
                  <div className="flex gap-2">
                    <input value={dealerPrefix} onChange={(e) => setDealerPrefix(e.target.value.toUpperCase())} placeholder="HER" title="Prefix — usually HER, but editable" className="input font-mono font-bold w-20 text-center" />
                    <span className="flex items-center text-[#6E6E6E] font-bold">-</span>
                    <input value={dealerWO} onChange={(e) => setDealerWO(e.target.value)} placeholder="Required to approve" className="input flex-1" />
                  </div>
                </Field>
                <Field label="Approved amount (Saudi riyals)">
                  <div className="flex">
                    <span className="flex items-center px-3 rounded-l border border-r-0 border-[#E0E0E0] bg-[#F1F2F4] text-sm font-mono font-bold text-[#4D4D4D]">SAR</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input rounded-l-none" />
                  </div>
                </Field>
                <PrimaryButton onClick={approveRequest} disabled={!!busy || !dealerWO.trim() || !amountOk} loading={busy === "approve"} icon={Check} label="Confirm approval" color="#2E7D46" />
              </div>
            )}

            {mode === "approve" && decisionPhase === "invoice" && (
              <div className="note-in mt-4 space-y-3 border-t border-[#EEEEEE] pt-4">
                <p className="text-sm text-[#4D4D4D]">
                  Approving the invoice completes this Free Service ({formatSar(claim.approved_amount)}). The sub-dealer is notified.
                </p>
                <PrimaryButton onClick={approveInvoice} disabled={!!busy} loading={busy === "approve"} icon={Check} label="Confirm — complete" color="#2E7D46" />
              </div>
            )}

            {(mode === "return" || mode === "reject") && (
              <div className="note-in mt-4 space-y-3 border-t border-[#EEEEEE] pt-4">
                <Field label={mode === "return" ? "What should the sub-dealer fix?" : "Reason for rejecting"}>
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "return" ? "Explain what needs to change…" : "Explain why it is rejected…"} className="input resize-none" />
                </Field>
                {mode === "return" ? (
                  <PrimaryButton onClick={() => returnIt(decisionPhase === "invoice")} disabled={!!busy || !note.trim()} loading={busy === "return"} icon={CornerUpLeft} label="Send back for edit" color="#B45309" />
                ) : (
                  <PrimaryButton onClick={rejectIt} disabled={!!busy || !note.trim()} loading={busy === "reject"} icon={XCircle} label="Reject" color="#B23A32" />
                )}
              </div>
            )}
          </section>
        )}

        {/* History */}
        <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#111111] mb-3">History</h3>
          <ol className="space-y-3">
            {log.map((l) => (
              <li key={l.id} className="flex gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-[#E4002B] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#262626] break-words">
                    <span className="font-bold text-[#111111]">{l.actor_name}</span> — {l.note || l.to_status}
                  </div>
                  <div className="text-[11px] text-[#6E6E6E] font-mono">{fmt(l.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ActionBar({ children }) {
  return <div className="flex items-center gap-3 flex-wrap">{children}</div>;
}

function PrimaryButton({ onClick, disabled, loading, icon: Icon, label, color = "#E4002B" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded font-bold text-sm uppercase tracking-wide text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      style={{ background: color }}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />} {label}
    </button>
  );
}

function DecisionButton({ active, color, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-bold text-xs uppercase tracking-wide transition-colors"
      style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: color, color }}
    >
      <Icon size={15} /> {label}
    </button>
  );
}
