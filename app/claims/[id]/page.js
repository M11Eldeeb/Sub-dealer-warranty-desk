"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusTag, STATUS, fmt, PART_STATUS, PART_STATUS_OPTIONS, SUPPLYING_LOCATIONS } from "@/components/ui";
import DownloadAttachmentsButton from "@/components/DownloadAttachmentsButton";
import {
  ChevronLeft, ChevronRight, Check, X, RotateCcw, Package, Wrench, Clock,
  FileText, History, Paperclip, Plus, CheckCircle2,
} from "lucide-react";

export default function ClaimDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [claim, setClaim] = useState(null);
  const [parts, setParts] = useState([]);
  const [labor, setLabor] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [showReturnBox, setShowReturnBox] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editParts, setEditParts] = useState(null);
  const [removedPartIds, setRemovedPartIds] = useState([]);
  const [editLabor, setEditLabor] = useState(null);
  const [removedLaborIds, setRemovedLaborIds] = useState([]);
  const [trackingDrafts, setTrackingDrafts] = useState({});
  const [etaDrafts, setEtaDrafts] = useState({});
  const [locationDrafts, setLocationDrafts] = useState({});
  const [supersedingDrafts, setSupersedingDrafts] = useState({});
  const [dealerWorkOrder, setDealerWorkOrder] = useState("");
  const [partsError, setPartsError] = useState("");
  const [newFiles, setNewFiles] = useState([]);
  const [afterRepairFiles, setAfterRepairFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [fileUrls, setFileUrls] = useState({});
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [returnRequests, setReturnRequests] = useState([]);
  const [showReturnPartBox, setShowReturnPartBox] = useState(false);
  const [selectedReturnParts, setSelectedReturnParts] = useState([]);
  const [returnPartReason, setReturnPartReason] = useState("");

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(prof);

    const { data: claimData } = await supabase.from("claims").select("*, branches(name)").eq("id", params.id).single();
    setClaim(claimData);

    const { data: partsData } = await supabase.from("claim_parts").select("*").eq("claim_id", params.id);
    setParts(partsData || []);

    const { data: returnData } = await supabase.from("part_return_requests").select("*").eq("claim_id", params.id);
    setReturnRequests(returnData || []);

    const { data: laborData } = await supabase.from("claim_labor").select("*").eq("claim_id", params.id);
    setLabor(laborData || []);

    const { data: attData } = await supabase.from("claim_attachments").select("*").eq("claim_id", params.id).order("uploaded_at");
    setAttachments(attData || []);

    const { data: logData } = await supabase.from("claim_status_log").select("*").eq("claim_id", params.id).order("at", { ascending: false });
    setLog(logData || []);

    // Render the page now — evidence thumbnails can pop in a moment later,
    // no need to hold up VIN/parts/labor/history on file-signing round trips.
    setLoading(false);

    if (attData?.length) {
      const { data: signedUrls } = await supabase.storage
        .from("evidence")
        .createSignedUrls(attData.map((a) => a.file_path), 3600);
      const urlMap = {};
      attData.forEach((a, i) => {
        urlMap[a.id] = signedUrls?.[i]?.signedUrl;
      });
      setFileUrls(urlMap);
    } else {
      setFileUrls({});
    }
  };

  useEffect(() => {
    load();
  }, [params.id]);

  useEffect(() => {
    if (!claim) return;
    if (claim.status === "returned" && !editData) {
      setEditData({
        vin: claim.vin,
        mileage: claim.mileage,
        plate: claim.plate,
        work_order_number: claim.work_order_number,
        reception_date: claim.reception_date,
        customer_complaint: claim.customer_complaint,
        cause_of_defect: claim.cause_of_defect,
        correction: claim.correction,
        comment: claim.comment,
      });
    }
    if (claim.status !== "returned" && editData) {
      setEditData(null);
    }
  }, [claim]);

  useEffect(() => {
    if (!claim || loading) return;
    if (claim.status === "returned" && !editParts) {
      setEditParts(parts.map((p) => ({ id: p.id, name: p.name, partNumber: p.part_number || "", qty: p.qty })));
      setRemovedPartIds([]);
    }
    if (claim.status !== "returned" && editParts) {
      setEditParts(null);
      setRemovedPartIds([]);
    }
  }, [claim, parts, loading]);

  useEffect(() => {
    if (!claim || loading) return;
    if (claim.status === "returned" && !editLabor) {
      setEditLabor(labor.map((l) => ({ id: l.id, code: l.labor_code || "", name: l.labor_name })));
      setRemovedLaborIds([]);
    }
    if (claim.status !== "returned" && editLabor) {
      setEditLabor(null);
      setRemovedLaborIds([]);
    }
  }, [claim, labor, loading]);

  useEffect(() => {
    const tracking = {};
    const eta = {};
    const location = {};
    const superseding = {};
    parts.forEach((p) => {
      tracking[p.id] = p.tracking_number || "";
      eta[p.id] = p.eta || "";
      location[p.id] = p.supplying_location || "";
      superseding[p.id] = p.superseding_part_number || "";
    });
    setTrackingDrafts(tracking);
    setEtaDrafts(eta);
    setLocationDrafts(location);
    setSupersedingDrafts(superseding);
  }, [parts]);

  const addLog = async (from_status, to_status, note) => {
    await supabase.from("claim_status_log").insert({
      claim_id: claim.id,
      from_status,
      to_status,
      actor_name: profile.full_name,
      note,
    });
  };

  const setStatus = async (status) => {
    await supabase.from("claims").update({ status }).eq("id", claim.id);
  };

  const handleApprove = async () => {
    if (!dealerWorkOrder.trim()) return;
    await supabase.from("claims").update({ dealer_work_order_number: dealerWorkOrder }).eq("id", claim.id);
    await setStatus("awaiting_parts");
    await addLog(claim.status, "approved", `Approved. Dealer Work Order # ${dealerWorkOrder}`);
    await addLog("approved", "awaiting_parts", "Tracking parts shipment.");
    setDealerWorkOrder("");
    load();
  };

  const handleReturn = async () => {
    if (!note.trim()) return;
    await setStatus("returned");
    await addLog(claim.status, "returned", note);
    setNote("");
    setShowReturnBox(false);
    load();
  };

  const handleReject = async () => {
    if (!note.trim()) return;
    await setStatus("rejected");
    await addLog(claim.status, "rejected", note);
    setNote("");
    setShowRejectBox(false);
    load();
  };

  const FIELD_LABELS = {
    vin: "VIN",
    mileage: "Mileage",
    plate: "Plate Number",
    work_order_number: "Work Order Number",
    reception_date: "Reception Date",
    customer_complaint: "Customer Complaint",
    cause_of_defect: "Cause of Defect",
    correction: "Correction",
    comment: "Comment",
  };
  const SHORT_FIELDS = ["vin", "mileage", "plate", "work_order_number", "reception_date"];

  const handleSaveAndResubmit = async () => {
    if (!editData) return;
    setSaving(true);

    const changeNotes = [];

    // Field-level diffs
    for (const key of Object.keys(FIELD_LABELS)) {
      const oldVal = String(claim[key] ?? "");
      const newVal = String(editData[key] ?? "");
      if (oldVal === newVal) continue;
      changeNotes.push(
        SHORT_FIELDS.includes(key)
          ? `${FIELD_LABELS[key]} changed from "${oldVal}" to "${newVal}"`
          : `${FIELD_LABELS[key]} updated`
      );
    }

    await supabase
      .from("claims")
      .update({ ...editData, mileage: parseInt(editData.mileage, 10), status: "submitted" })
      .eq("id", claim.id);

    // Part-level diffs
    if (editParts) {
      for (const p of editParts) {
        if (!p.name.trim()) continue;
        if (p.id) {
          const orig = parts.find((op) => op.id === p.id);
          if (orig && (orig.name !== p.name || (orig.part_number || "") !== p.partNumber || String(orig.qty) !== String(p.qty))) {
            changeNotes.push(`Part updated: ${p.name}`);
          }
          await supabase
            .from("claim_parts")
            .update({ name: p.name, part_number: p.partNumber || null, qty: parseInt(p.qty, 10) || 1 })
            .eq("id", p.id);
        } else {
          changeNotes.push(`Part added: ${p.name}`);
          await supabase.from("claim_parts").insert({
            claim_id: claim.id,
            name: p.name,
            part_number: p.partNumber || null,
            qty: parseInt(p.qty, 10) || 1,
          });
        }
      }
      for (const id of removedPartIds) {
        const orig = parts.find((p) => p.id === id);
        changeNotes.push(`Part removed: ${orig ? orig.name : id}`);
        await supabase.from("claim_parts").delete().eq("id", id);
      }
    }

    // Labor-level diffs
    if (editLabor) {
      for (const l of editLabor) {
        if (!l.name.trim()) continue;
        if (l.id) {
          const orig = labor.find((ol) => ol.id === l.id);
          if (orig && (orig.labor_name !== l.name || (orig.labor_code || "") !== l.code)) {
            changeNotes.push(`Labor line updated: ${l.name}`);
          }
          await supabase.from("claim_labor").update({ labor_name: l.name, labor_code: l.code || null }).eq("id", l.id);
        } else {
          changeNotes.push(`Labor line added: ${l.name}`);
          await supabase.from("claim_labor").insert({ claim_id: claim.id, labor_name: l.name, labor_code: l.code || null });
        }
      }
      for (const id of removedLaborIds) {
        const orig = labor.find((l) => l.id === id);
        changeNotes.push(`Labor line removed: ${orig ? orig.labor_name : id}`);
        await supabase.from("claim_labor").delete().eq("id", id);
      }
    }

    // New evidence
    for (const file of newFiles) {
      const path = `${claim.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("evidence").upload(path, file);
      if (!uploadError) {
        changeNotes.push(`Attachment added: ${file.name}`);
        await supabase.from("claim_attachments").insert({
          claim_id: claim.id,
          file_path: path,
          file_name: file.name,
          stage: "evidence_before",
          uploaded_by: profile.id,
        });
      }
    }

    for (const changeNote of changeNotes) {
      await addLog(claim.status, claim.status, changeNote);
    }

    await addLog(claim.status, "submitted", "Edited and resubmitted.");
    setNewFiles([]);
    setSaving(false);
    load();
  };

  const updateEditPart = (index, field, value) => {
    setEditParts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const removeEditPart = (index) => {
    const p = editParts[index];
    if (p.id) setRemovedPartIds((prev) => [...prev, p.id]);
    setEditParts((prev) => prev.filter((_, i) => i !== index));
  };

  const addEditPart = () => setEditParts((prev) => [...prev, { id: null, name: "", partNumber: "", qty: 1 }]);

  const updateEditLabor = (index, field, value) => {
    setEditLabor((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const removeEditLabor = (index) => {
    const l = editLabor[index];
    if (l.id) setRemovedLaborIds((prev) => [...prev, l.id]);
    setEditLabor((prev) => prev.filter((_, i) => i !== index));
  };

  const addEditLabor = () => setEditLabor((prev) => [...prev, { id: null, code: "", name: "" }]);

  const handlePartStatusChange = async (part, status) => {
    const { error } = await supabase.from("claim_parts").update({ status }).eq("id", part.id);
    if (error) {
      setPartsError(error.message);
      return;
    }
    setPartsError("");
    await addLog(claim.status, claim.status, `Part '${part.name}' status changed to ${status}`);
    load();
  };

  const saveTrackingNumber = async (part) => {
    const value = trackingDrafts[part.id] ?? "";
    if ((part.tracking_number || "") === value) return;
    const { error } = await supabase.from("claim_parts").update({ tracking_number: value || null }).eq("id", part.id);
    if (error) {
      setPartsError(error.message);
      return;
    }
    setPartsError("");
    await addLog(claim.status, claim.status, `Tracking number set for '${part.name}': ${value || "(cleared)"}`);
    load();
  };

  const saveEta = async (part) => {
    const value = etaDrafts[part.id] ?? "";
    if ((part.eta || "") === value) return;
    const { error } = await supabase.from("claim_parts").update({ eta: value || null }).eq("id", part.id);
    if (error) {
      setPartsError(error.message);
      return;
    }
    setPartsError("");
    await addLog(claim.status, claim.status, `ETA set for '${part.name}': ${value || "(cleared)"}`);
    load();
  };

  const saveLocation = async (part, value) => {
    if ((part.supplying_location || "") === value) return;
    const { error } = await supabase.from("claim_parts").update({ supplying_location: value || null }).eq("id", part.id);
    if (error) {
      setPartsError(error.message);
      return;
    }
    setPartsError("");
    await addLog(claim.status, claim.status, `Supplying location set for '${part.name}': ${value || "(cleared)"}`);
    load();
  };

  const saveSuperseding = async (part) => {
    const value = supersedingDrafts[part.id] ?? "";
    if ((part.superseding_part_number || "") === value) return;
    const { error } = await supabase.from("claim_parts").update({ superseding_part_number: value || null }).eq("id", part.id);
    if (error) {
      setPartsError(error.message);
      return;
    }
    setPartsError("");
    await addLog(claim.status, claim.status, `Superseding part number set for '${part.name}': ${value || "(cleared)"}`);
    load();
  };

  const toggleReturnPart = (partId) => {
    setSelectedReturnParts((prev) => (prev.includes(partId) ? prev.filter((id) => id !== partId) : [...prev, partId]));
  };

  const submitReturnParts = async () => {
    if (selectedReturnParts.length === 0 || !returnPartReason.trim()) return;
    for (const partId of selectedReturnParts) {
      const part = parts.find((p) => p.id === partId);
      await supabase.from("claim_parts").update({ status: "Parts Return" }).eq("id", partId);
      await supabase.from("part_return_requests").insert({
        claim_id: claim.id,
        claim_part_id: partId,
        reason: returnPartReason.trim(),
        requested_by: profile.id,
      });
      await addLog(claim.status, claim.status, `Return requested for part '${part?.name}': ${returnPartReason.trim()}`);
    }
    setSelectedReturnParts([]);
    setReturnPartReason("");
    setShowReturnPartBox(false);
    load();
  };

  const handleConfirmPartsReceived = async () => {
    const allCancelled = parts.length > 0 && parts.every((p) => p.status === "Cancelled");
    if (allCancelled) {
      await setStatus("closed");
      await addLog(claim.status, "closed", "All parts cancelled — sub-dealer confirmed, no repair needed. Claim closed.");
    } else {
      await setStatus("parts_arrived");
      await addLog(claim.status, "parts_arrived", "All parts received at branch.");
    }
    load();
  };

  const handleSubmitAfterRepair = async (fileList) => {
    if (!fileList.length) return;
    const files = [...fileList];
    for (const file of files) {
      const path = `${claim.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("evidence").upload(path, file);
      if (!uploadError) {
        await supabase.from("claim_attachments").insert({
          claim_id: claim.id,
          file_path: path,
          file_name: file.name,
          stage: "after_repair",
          uploaded_by: profile.id,
        });
        await addLog(claim.status, claim.status, `After-repair attachment added: ${file.name}`);
      }
    }
    await setStatus("repair_submitted");
    await addLog(claim.status, "repair_submitted", "After-repair evidence submitted. Awaiting dealer closure.");
    setAfterRepairFiles([]);
    load();
  };

  const handleCloseClaim = async () => {
    await setStatus("closed");
    await addLog(claim.status, "closed", "Claim closed by dealer.");
    load();
  };

  const handleReturnAfterRepair = async () => {
    if (!note.trim()) return;
    await setStatus("parts_arrived");
    await addLog(claim.status, "parts_arrived", note);
    setNote("");
    setShowReturnBox(false);
    load();
  };

  const handleDeleteAttachment = async (attachmentId, filePath, fileName) => {
    await supabase.storage.from("evidence").remove([filePath]);
    await supabase.from("claim_attachments").delete().eq("id", attachmentId);
    await addLog(claim.status, claim.status, `Attachment removed: ${fileName}`);
    load();
  };

  const viewFile = async (path) => {
    const { data } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const isImage = (name) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);
  const isVideo = (name) => /\.(mp4|mov|webm|ogg|m4v)$/i.test(name);
  const viewableAttachments = attachments.filter((a) => isImage(a.file_name) || isVideo(a.file_name));
  const openLightbox = (attachmentId) => setLightboxIndex(viewableAttachments.findIndex((a) => a.id === attachmentId));
  const showPrev = () => setLightboxIndex((i) => (i - 1 + viewableAttachments.length) % viewableAttachments.length);
  const showNext = () => setLightboxIndex((i) => (i + 1) % viewableAttachments.length);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, viewableAttachments.length]);

  if (loading || !claim) return <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">Loading…</div>;

  const s = STATUS[claim.status];
  const stampFor = { rejected: ["REJECTED", "#B23A32"], closed: ["CLOSED", "#2E7D46"] };
  const role = profile.role;

  return (
    <div className="min-h-screen bg-[#F4F4F4] px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => {
            router.refresh();
            router.back();
          }}
          className="flex items-center gap-1 text-sm text-[#4D4D4D] hover:text-[#111111] mb-4"
        >
          <ChevronLeft size={16} /> Back to claims
        </button>

        <div className="relative bg-[#FFFFFF] border border-[#E0E0E0] rounded-lg p-6 overflow-hidden" style={{ borderLeft: `5px solid ${s.color}` }}>
          {stampFor[claim.status] && (
            <div
              className="absolute top-6 right-6 border-4 rounded px-3 py-1 text-lg font-black uppercase tracking-widest opacity-80 select-none pointer-events-none"
              style={{ color: stampFor[claim.status][1], borderColor: stampFor[claim.status][1], transform: "rotate(-8deg)" }}
            >
              {stampFor[claim.status][0]}
            </div>
          )}

          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-xs text-[#6E6E6E]">{claim.claim_number}</div>
              <h2 className="text-xl font-black text-[#111111] mt-0.5">WO# {claim.work_order_number}</h2>
            </div>
            <StatusTag status={claim.status} parts={parts} />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <Info label="VIN" value={claim.vin} mono />
            <Info label="Mileage" value={`${claim.mileage?.toLocaleString()} km`} />
            <Info label="Plate" value={claim.plate} />
            <Info label="Reception Date" value={claim.reception_date} />
            <Info label="Branch" value={claim.branches?.name} />
            {claim.dealer_work_order_number && <Info label="Dealer WO#" value={claim.dealer_work_order_number} mono />}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1">Customer Complaint</div>
              <p className="text-sm text-[#1A1A1A]">{claim.customer_complaint}</p>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1">Cause of Defect</div>
              <p className="text-sm text-[#1A1A1A]">{claim.cause_of_defect}</p>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1">Correction</div>
              <p className="text-sm text-[#1A1A1A]">{claim.correction}</p>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1">Comment</div>
              <p className="text-sm text-[#1A1A1A]">{claim.comment}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E]">Evidence</div>
              <DownloadAttachmentsButton claimNumber={claim.claim_number} attachments={attachments} />
            </div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => {
                const canDelete = role === "sub_dealer" && claim.status === "returned" && a.stage === "evidence_before";
                const url = fileUrls[a.id];
                const isMedia = isImage(a.file_name) || isVideo(a.file_name);

                if (isMedia && url) {
                  return (
                    <div key={a.id} className="relative">
                      <button
                        onClick={() => openLightbox(a.id)}
                        title={a.file_name}
                        className={`w-20 h-20 rounded-lg overflow-hidden border hover:ring-2 hover:ring-[#E4002B] transition-shadow block ${
                          a.stage === "after_repair" ? "border-[#A9D9C9]" : "border-[#E0E0E0]"
                        }`}
                      >
                        {isImage(a.file_name) ? (
                          <img src={url} alt={a.file_name} className="w-full h-full object-cover" />
                        ) : (
                          <video src={url} muted className="w-full h-full object-cover" />
                        )}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteAttachment(a.id, a.file_path, a.file_name)}
                          title="Remove this file"
                          className="absolute -top-1.5 -right-1.5 bg-white text-[#B23A32] border border-[#F2C9A8] rounded-full p-0.5 shadow-sm hover:bg-[#FAE4E2]"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={a.id}
                    className={`text-xs pl-2.5 pr-1.5 py-1.5 rounded flex items-center gap-1.5 font-mono ${
                      a.stage === "after_repair" ? "bg-[#E5F3E8] text-[#2E7D46]" : "bg-white text-[#4D4D4D] border border-[#E0E0E0]"
                    }`}
                  >
                    <button onClick={() => viewFile(a.file_path)} className="flex items-center gap-1.5 hover:underline">
                      <FileText size={12} /> {a.file_name}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteAttachment(a.id, a.file_path, a.file_name)}
                        title="Remove this file"
                        className="ml-0.5 text-[#B23A32] hover:bg-[#FAE4E2] rounded p-0.5"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              {attachments.length === 0 && <span className="text-xs text-[#6E6E6E]">No files yet.</span>}
            </div>
          </div>

          {labor.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Labor</div>
              <div className="space-y-1.5">
                {labor.map((l) => (
                  <div key={l.id} className="text-sm bg-white border border-[#E0E0E0] rounded px-3 py-2">
                    <span className="font-medium text-[#111111]">{l.labor_name}</span>
                    {l.labor_code && <span className="text-[#6E6E6E] font-mono text-xs ml-2">{l.labor_code}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {parts.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Parts</div>
              <div className="space-y-1.5">
                {parts.map((p) => {
                  const partStatus = PART_STATUS[p.status] || PART_STATUS["Waiting Action"];
                  const returnRequest = returnRequests.find((r) => r.claim_part_id === p.id);
                  return (
                    <div key={p.id} className="text-sm bg-white border border-[#E0E0E0] rounded px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-[#111111]">{p.name}</span>
                          <span className="text-[#6E6E6E] font-mono text-xs ml-2">
                            {p.part_number} × {p.qty}
                          </span>
                          {p.tracking_number && <span className="text-[#6E6E6E] font-mono text-xs ml-2">· #{p.tracking_number}</span>}
                          {p.eta && <span className="text-[#6E6E6E] font-mono text-xs ml-2">· ETA {p.eta}</span>}
                        </div>
                        <span className="text-xs font-bold flex items-center gap-1" style={{ color: partStatus.color }}>
                          <partStatus.icon size={13} /> {partStatus.label}
                        </span>
                      </div>
                      {(p.supplying_location || p.superseding_part_number) && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {p.supplying_location && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[#5B4FB0] bg-[#EAE7FA] px-2 py-0.5 rounded-full">
                              From {p.supplying_location}
                            </span>
                          )}
                          {p.superseding_part_number && (
                            <span className="text-[10px] font-mono text-[#6E6E6E] bg-[#F1F2F4] px-2 py-0.5 rounded-full">
                              Superseded by {p.superseding_part_number}
                            </span>
                          )}
                        </div>
                      )}
                      {returnRequest && (
                        <div className="mt-1.5 text-xs bg-[#FDEBE0] text-[#C4551B] border border-[#F2C9A8] rounded p-2">
                          <span className="font-bold">Return reason: </span>
                          {returnRequest.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5">
          {role === "sub_dealer" &&
            !["closed", "rejected"].includes(claim.status) &&
            parts.some((p) => p.status === "Supplied to Sub-Dealer") &&
            (!showReturnPartBox ? (
              <button
                onClick={() => setShowReturnPartBox(true)}
                className="mb-3 flex items-center gap-1.5 px-4 py-2 rounded font-bold text-xs uppercase tracking-wide text-[#B23A32] bg-white border border-[#B23A32] hover:bg-[#FAE4E2]"
              >
                <RotateCcw size={14} /> Return Part
              </button>
            ) : (
              <div className="bg-white border border-[#E0E0E0] rounded-lg p-4 mb-3">
                <div className="text-sm font-bold text-[#111111] mb-2">Select the part(s) to return</div>
                <div className="space-y-1.5 mb-3">
                  {parts
                    .filter((p) => p.status === "Supplied to Sub-Dealer")
                    .map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedReturnParts.includes(p.id)}
                          onChange={() => toggleReturnPart(p.id)}
                          className="accent-[#E4002B]"
                        />
                        {p.name} <span className="text-[#6E6E6E] font-mono text-xs">{p.part_number}</span>
                      </label>
                    ))}
                </div>
                {selectedReturnParts.length > 0 && (
                  <textarea
                    value={returnPartReason}
                    onChange={(e) => setReturnPartReason(e.target.value)}
                    rows={2}
                    placeholder="Why are you returning this part?"
                    className="input resize-none text-sm mb-2"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={submitReturnParts}
                    disabled={selectedReturnParts.length === 0 || !returnPartReason.trim()}
                    className="px-4 py-2 rounded font-bold text-xs uppercase tracking-wide text-white bg-[#B23A32] hover:bg-[#9A2E28] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm Return
                  </button>
                  <button
                    onClick={() => {
                      setShowReturnPartBox(false);
                      setSelectedReturnParts([]);
                      setReturnPartReason("");
                    }}
                    className="px-4 py-2 rounded font-bold text-xs uppercase tracking-wide text-[#6E6E6E] hover:bg-[#F4F4F4]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}

          {role === "dealer" && claim.status === "submitted" && (
            <div className="space-y-3">
              <div className="bg-white border border-[#E0E0E0] rounded-lg p-3">
                <label className="block text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">Dealer Work Order Number</label>
                <input
                  value={dealerWorkOrder}
                  onChange={(e) => setDealerWorkOrder(e.target.value)}
                  placeholder="Required to approve"
                  className="input"
                />
              </div>
              <div className="flex gap-3">
                <ActionBtn
                  color="#2E7D46"
                  icon={Check}
                  label="Approve"
                  onClick={handleApprove}
                  disabled={!dealerWorkOrder.trim()}
                />
                <ActionBtn color="#C4551B" icon={RotateCcw} label="Return for Edit" onClick={() => setShowReturnBox((v) => !v)} />
                <ActionBtn color="#B23A32" icon={X} label="Reject" onClick={() => setShowRejectBox((v) => !v)} />
              </div>
              {showReturnBox && (
                <NoteBox
                  placeholder="Explain what the sub-dealer needs to fix or add..."
                  value={note}
                  onChange={setNote}
                  onSubmit={handleReturn}
                  color="#C4551B"
                  label="Send back"
                />
              )}
              {showRejectBox && (
                <NoteBox placeholder="Reason for rejection..." value={note} onChange={setNote} onSubmit={handleReject} color="#B23A32" label="Confirm rejection" />
              )}
            </div>
          )}

          {(role === "dealer" || role === "parts_team") && claim.status === "awaiting_parts" && (
            <div className="bg-[#EAE7FA] border border-[#D3CDF2] rounded-lg p-4">
              <div className="text-sm font-bold text-[#5B4FB0] mb-2 flex items-center gap-2">
                <Package size={15} /> Update parts shipment
              </div>
              {partsError && (
                <div className="text-xs text-[#B23A32] bg-[#FAE4E2] border border-[#F2C9A8] rounded p-2 mb-2">{partsError}</div>
              )}
              <div className="space-y-2">
                {parts.map((p) => (
                  <div key={p.id} className="bg-white rounded px-3 py-2 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#111111]">{p.name}</span>
                      <span className="text-[#6E6E6E] font-mono text-xs">{p.part_number}</span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={p.status}
                        onChange={(e) => handlePartStatusChange(p, e.target.value)}
                        className="input text-xs flex-1"
                      >
                        {PART_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <input
                        value={trackingDrafts[p.id] ?? ""}
                        onChange={(e) => setTrackingDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={() => saveTrackingNumber(p)}
                        placeholder="Tracking number"
                        className="input text-xs flex-1 font-mono"
                      />
                      <input
                        type="date"
                        value={etaDrafts[p.id] ?? ""}
                        onChange={(e) => setEtaDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={() => saveEta(p)}
                        title="ETA"
                        className="input text-xs flex-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={locationDrafts[p.id] ?? ""}
                        onChange={(e) => {
                          setLocationDrafts((prev) => ({ ...prev, [p.id]: e.target.value }));
                          saveLocation(p, e.target.value);
                        }}
                        className="input text-xs flex-1"
                      >
                        <option value="">Supplying location…</option>
                        {SUPPLYING_LOCATIONS.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                      {p.status === "VOR" && (
                        <input
                          value={supersedingDrafts[p.id] ?? ""}
                          onChange={(e) => setSupersedingDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => saveSuperseding(p)}
                          placeholder="Superseding part # (optional)"
                          className="input text-xs flex-1 font-mono"
                        />
                      )}
                    </div>
                  </div>
                ))}
                {parts.every((p) => p.status === "Supplied to Sub-Dealer" || p.status === "Cancelled") && (
                  <div className="text-xs text-[#5B4FB0]">All parts shipped or cancelled — waiting on sub-dealer to confirm receipt.</div>
                )}
              </div>
            </div>
          )}

          {role === "sub_dealer" && claim.status === "returned" && editData && (
            <div className="bg-white border border-[#E0E0E0] rounded-lg p-5">
              {log.find((l) => l.to_status === "returned" && l.from_status !== "returned")?.note && (
                <div className="text-sm bg-[#FDEBE0] text-[#C4551B] border border-[#F2C9A8] rounded p-3 mb-4">
                  <span className="font-bold">Dealer's note: </span>
                  {log.find((l) => l.to_status === "returned" && l.from_status !== "returned").note}
                </div>
              )}
              <div className="text-sm font-bold text-[#111111] mb-3">Edit claim details</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="VIN">
                    <input className="input font-mono" value={editData.vin} onChange={(e) => setEditData({ ...editData, vin: e.target.value })} />
                  </Field>
                  <Field label="Mileage (km)">
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={editData.mileage}
                      onChange={(e) => setEditData({ ...editData, mileage: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plate Number">
                    <input className="input" value={editData.plate} onChange={(e) => setEditData({ ...editData, plate: e.target.value })} />
                  </Field>
                  <Field label="Work Order Number">
                    <input
                      className="input"
                      value={editData.work_order_number}
                      onChange={(e) => setEditData({ ...editData, work_order_number: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Reception Date">
                  <input
                    type="date"
                    className="input"
                    value={editData.reception_date}
                    onChange={(e) => setEditData({ ...editData, reception_date: e.target.value })}
                  />
                </Field>
                <Field label="Customer Complaint">
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={editData.customer_complaint}
                    onChange={(e) => setEditData({ ...editData, customer_complaint: e.target.value })}
                  />
                </Field>
                <Field label="Cause of Defect">
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={editData.cause_of_defect}
                    onChange={(e) => setEditData({ ...editData, cause_of_defect: e.target.value })}
                  />
                </Field>
                <Field label="Correction">
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={editData.correction}
                    onChange={(e) => setEditData({ ...editData, correction: e.target.value })}
                  />
                </Field>

                {editLabor && (
                  <Field label="Labor Code and Name">
                    <div className="space-y-2">
                      {editLabor.map((l, i) => (
                        <div key={l.id ?? `new-${i}`} className="flex gap-2">
                          <input
                            value={l.code}
                            onChange={(e) => updateEditLabor(i, "code", e.target.value)}
                            placeholder="Labor code"
                            className="input flex-1 font-mono"
                          />
                          <input
                            value={l.name}
                            onChange={(e) => updateEditLabor(i, "name", e.target.value)}
                            placeholder="Labor name"
                            className="input flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => removeEditLabor(i)}
                            disabled={editLabor.length === 1}
                            title="Remove labor line"
                            className="text-[#B23A32] hover:bg-[#FAE4E2] rounded p-2 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addEditLabor}
                        className="flex items-center gap-1 text-xs font-bold text-[#E4002B] hover:underline"
                      >
                        <Plus size={13} /> Add another labor line
                      </button>
                    </div>
                  </Field>
                )}

                {editParts && (
                  <Field label="Part Number and Name (optional — leave empty for labor-only claims)">
                    <div className="space-y-2">
                      {editParts.map((p, i) => (
                        <div key={p.id ?? `new-${i}`} className="flex gap-2">
                          <input
                            value={p.name}
                            onChange={(e) => updateEditPart(i, "name", e.target.value)}
                            placeholder="Part name"
                            className="input flex-1"
                          />
                          <input
                            value={p.partNumber}
                            onChange={(e) => updateEditPart(i, "partNumber", e.target.value)}
                            placeholder="Part number"
                            className="input flex-1 font-mono"
                          />
                          <input
                            type="number"
                            min="1"
                            value={p.qty}
                            onChange={(e) => updateEditPart(i, "qty", e.target.value)}
                            className="input w-16"
                          />
                          <button
                            type="button"
                            onClick={() => removeEditPart(i)}
                            title="Remove part"
                            className="text-[#B23A32] hover:bg-[#FAE4E2] rounded p-2 shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addEditPart}
                        className="flex items-center gap-1 text-xs font-bold text-[#E4002B] hover:underline"
                      >
                        <Plus size={13} /> {editParts.length === 0 ? "Add a part" : "Add another part"}
                      </button>
                    </div>
                  </Field>
                )}

                <Field label="Add more evidence (optional)">
                  <label className="flex items-center gap-2 border border-dashed border-[#C7C7C7] rounded px-3 py-3 text-sm text-[#6E6E6E] cursor-pointer hover:border-[#E4002B] hover:text-[#E4002B] transition-colors">
                    <Paperclip size={15} />
                    {newFiles.length ? `${newFiles.length} file(s) added` : "Attach additional photos or reports"}
                    <input type="file" multiple className="hidden" onChange={(e) => setNewFiles([...e.target.files])} />
                  </label>
                </Field>

                <Field label="Comment">
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={editData.comment}
                    onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
                  />
                </Field>
              </div>
              <button
                onClick={handleSaveAndResubmit}
                disabled={saving}
                className="mt-4 px-5 py-2.5 rounded font-bold text-sm uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:opacity-50"
              >
                {saving ? "Submitting…" : "Save & Resubmit Claim"}
              </button>
            </div>
          )}

          {role === "sub_dealer" && claim.status === "awaiting_parts" && (
            <div className="bg-[#EAE7FA] border border-[#D3CDF2] rounded-lg p-4 text-sm text-[#5B4FB0]">
              <div className="font-bold mb-1 flex items-center gap-2">
                <Clock size={15} /> Tracking parts
              </div>
              {parts.length > 0 && parts.every((p) => p.status === "Cancelled") ? (
                <>All parts on this claim were cancelled — no repair needed.</>
              ) : (
                <>{parts.filter((p) => p.status === "Supplied to Sub-Dealer").length}/{parts.length} parts supplied to your branch.</>
              )}
              {parts.length > 0 && parts.every((p) => p.status === "Supplied to Sub-Dealer" || p.status === "Cancelled") && (
                <button
                  onClick={handleConfirmPartsReceived}
                  className="mt-3 block w-fit px-4 py-2 rounded font-bold text-xs uppercase tracking-wide text-white bg-[#5B4FB0] hover:bg-[#4A3F9A]"
                >
                  {parts.every((p) => p.status === "Cancelled") ? "Confirm — Close Claim" : "Confirm all parts received"}
                </button>
              )}
            </div>
          )}

          {role === "sub_dealer" && claim.status === "parts_arrived" && (
            <div className="bg-[#E1F2EE] border border-[#C3E5DD] rounded-lg p-4">
              <div className="text-sm font-bold text-[#1E7A6B] mb-2 flex items-center gap-2">
                <Wrench size={15} /> Submit after-repair evidence
              </div>
              <label className="flex items-center gap-2 border border-dashed border-[#9BC9BE] rounded px-3 py-3 text-sm text-[#1E7A6B] cursor-pointer hover:bg-white transition-colors">
                <Paperclip size={15} />
                {afterRepairFiles.length ? `${afterRepairFiles.length} file(s) attached` : "Attach completed repair photos / signed work order"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setAfterRepairFiles((prev) => [...prev, ...e.target.files])}
                />
              </label>
              {afterRepairFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {afterRepairFiles.map((f, i) => (
                    <span key={i} className="text-xs bg-white border border-[#C3E5DD] pl-2 pr-1 py-1 rounded font-mono flex items-center gap-1">
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setAfterRepairFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-[#B23A32] hover:bg-[#FAE4E2] rounded p-0.5"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => handleSubmitAfterRepair(afterRepairFiles)}
                disabled={afterRepairFiles.length === 0}
                className="mt-3 px-4 py-2 rounded font-bold text-xs uppercase tracking-wide text-white bg-[#1E7A6B] hover:bg-[#175D53] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit After Repair
              </button>
            </div>
          )}

          {role === "dealer" && claim.status === "repair_submitted" && (
            <div className="bg-[#E0F2FE] border border-[#B8E4F5] rounded-lg p-4 space-y-3">
              <div className="text-sm font-bold text-[#0E7490] mb-2 flex items-center gap-2">
                <CheckCircle2 size={15} /> After-repair evidence submitted
              </div>
              <p className="text-sm text-[#0E7490]">Review the evidence above, then close the claim, or return it if something's wrong.</p>
              <div className="flex gap-3">
                <ActionBtn color="#2E7D46" icon={Check} label="Close Claim" onClick={handleCloseClaim} />
                <ActionBtn color="#C4551B" icon={RotateCcw} label="Return to Sub-Dealer" onClick={() => setShowReturnBox((v) => !v)} />
              </div>
              {showReturnBox && (
                <NoteBox
                  placeholder="Explain what's wrong with the after-repair evidence..."
                  value={note}
                  onChange={setNote}
                  onSubmit={handleReturnAfterRepair}
                  color="#C4551B"
                  label="Send back"
                />
              )}
            </div>
          )}

          {role === "sub_dealer" && claim.status === "repair_submitted" && (
            <div className="bg-[#E0F2FE] border border-[#B8E4F5] rounded-lg p-4 text-sm text-[#0E7490] flex items-center gap-2">
              <Clock size={15} /> After-repair evidence submitted — waiting on the dealer to close this claim.
            </div>
          )}

          {(claim.status === "closed" || claim.status === "rejected") && (
            <div className="text-sm text-[#6E6E6E] flex items-center gap-2">
              <History size={15} /> {claim.status === "closed" ? "Closed" : "Rejected"} — retained in claim history for reference.
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2 flex items-center gap-1.5">
            <History size={13} /> Claim History
          </div>
          <div className="space-y-2">
            {log.map((l) => (
              <div key={l.id} className="flex gap-3 text-sm">
                <div className="text-xs text-[#6E6E6E] w-32 shrink-0 pt-0.5 font-mono">{fmt(l.at)}</div>
                <div>
                  <span className="font-bold text-[#111111]">{l.actor_name}</span>
                  <span className="text-[#4D4D4D]"> — {l.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lightboxIndex !== null && viewableAttachments[lightboxIndex] && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center px-4" onClick={() => setLightboxIndex(null)}>
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
          >
            <X size={20} />
          </button>

          {viewableAttachments.length > 1 && (
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
            {isImage(viewableAttachments[lightboxIndex].file_name) ? (
              <img
                src={fileUrls[viewableAttachments[lightboxIndex].id]}
                alt={viewableAttachments[lightboxIndex].file_name}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            ) : (
              <video
                src={fileUrls[viewableAttachments[lightboxIndex].id]}
                controls
                autoPlay
                className="max-h-[75vh] max-w-full rounded-lg"
              />
            )}
            <div className="text-white/90 text-sm mt-3 font-mono">
              {viewableAttachments[lightboxIndex].file_name}
              {viewableAttachments.length > 1 && (
                <span className="text-white/50"> · {lightboxIndex + 1} / {viewableAttachments.length}</span>
              )}
            </div>
          </div>

          {viewableAttachments.length > 1 && (
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

function Info({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E]">{label}</div>
      <div className={`text-[#111111] ${mono ? "font-mono text-xs mt-0.5" : ""}`}>{value}</div>
    </div>
  );
}

function ActionBtn({ color, icon: Icon, label, onClick, wide, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded font-bold text-xs uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${
        wide ? "w-full" : ""
      }`}
      style={{ background: color }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function NoteBox({ placeholder, value, onChange, onSubmit, color, label }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-lg p-3">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className="input resize-none text-sm" />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="mt-2 px-4 py-2 rounded font-bold text-xs uppercase tracking-wide text-white disabled:opacity-40"
        style={{ background: color }}
      >
        {label}
      </button>
    </div>
  );
}
