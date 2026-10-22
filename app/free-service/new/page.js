"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/ui";
import { FilePicker } from "@/components/free-service";
import { uploadEvidence } from "@/lib/evidence-upload";
import { ChevronLeft, Loader2, Send, Lock } from "lucide-react";

export default function NewFreeServicePage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const [workOrder, setWorkOrder] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [service, setService] = useState("");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || !["sub_dealer", "dealer", "admin"].includes(prof.role)) return router.push("/");
      setProfile(prof);

      const status = await fetch("/api/free-service/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!status?.canUse) {
        setLocked(true);
        return setLoading(false);
      }

      const { data: branchData } = await supabase.from("branches").select("id, name, abbreviation").order("name");
      setBranches(branchData || []);
      setBranchId(prof.role === "sub_dealer" ? prof.branch_id : branchData?.[0]?.id || "");
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const branch = branches.find((b) => b.id === branchId);
  const prefix = branch?.abbreviation ? `${branch.abbreviation}-` : "";
  const isStaff = profile && profile.role !== "sub_dealer";
  const canSubmit = !!branchId && workOrder.trim() && vin.trim() && service.trim() && mileage !== "" && Number(mileage) >= 0 && files.length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    setStep("Creating the request…");
    const { data: id, error: createError } = await supabase.rpc("create_free_service", {
      p_branch_id: branchId,
      p_vin: vin.trim().toUpperCase(),
      p_mileage: Number(mileage),
      p_work_order: `${prefix}${workOrder.trim()}`,
      p_service: service.trim(),
      p_comment: comment.trim(),
    });
    if (createError || !id) {
      setSaving(false);
      setStep("");
      return setError(createError?.message || "Could not create the request.");
    }

    setStep(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    const { failed } = await uploadEvidence({
      supabase,
      claimId: id,
      uploadedBy: profile.id,
      stage: "evidence_before",
      items: files.map((file) => ({ file, name: file.name })),
    });
    if (failed.length > 0) {
      // The request exists; send them to it so the missing files can be added there.
      router.push(`/free-service/${id}?uploadFailed=${encodeURIComponent(failed.map((f) => f.name).join(", "))}`);
      return;
    }

    await fetch("/api/notify-free-service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: id, event: "submitted" }) }).catch(() => {});
    router.push(`/free-service/${id}`);
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">
        <div className="w-5 h-5 rounded-full border-2 border-[#E0E0E0] border-t-[#E4002B] animate-spin mr-2" /> Loading…
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 page-in">
        <button onClick={() => router.push("/dashboard/free-service")} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111] mb-4">
          <ChevronLeft size={16} /> Free Service
        </button>

        {locked ? (
          <div className="bg-white border border-[#E0E0E0] rounded-lg p-8 text-center">
            <Lock className="mx-auto mb-3 text-[#6E6E6E]" size={26} />
            <div className="font-black uppercase tracking-wide text-[#111111]">Not available yet</div>
            <p className="text-sm text-[#6E6E6E] mt-1">Free Service approvals are being tested and will open soon.</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide mb-1">New Free Service approval</h2>
            <p className="text-sm text-[#6E6E6E] mb-6">Enter the work order, VIN and mileage, then attach the supporting files. The dealer reviews it and replies here.</p>

            <div className="space-y-4 bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
              {isStaff && (
                <Field label="Sub-dealer branch">
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input" disabled={saving}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Work order number (sub-dealer)">
                <div className="flex">
                  {prefix && <span className="flex items-center px-3 rounded-l border border-r-0 border-[#E0E0E0] bg-[#F1F2F4] text-sm font-mono font-bold text-[#4D4D4D]">{prefix}</span>}
                  <input value={workOrder} onChange={(e) => setWorkOrder(e.target.value)} placeholder="12345" className={`input ${prefix ? "rounded-l-none" : ""}`} disabled={saving} />
                </div>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="VIN">
                  <input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17-character VIN" className="input font-mono uppercase" disabled={saving} />
                </Field>
                <Field label="Mileage (km)">
                  <input type="number" min="0" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="45000" className="input" disabled={saving} />
                </Field>
              </div>
              <Field label="Service requested">
                <input value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. 10,000 km free service" className="input" disabled={saving} />
              </Field>
              <Field label="Comment (optional)">
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Anything the dealer should know..." className="input resize-none" disabled={saving} />
              </Field>
              <Field label="Attachments">
                <FilePicker files={files} onChange={setFiles} disabled={saving} />
              </Field>
            </div>

            {error && <div className="note-in text-sm text-[#B23A32] mt-3">{error}</div>}

            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-5 py-2.5 rounded font-bold text-sm uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:bg-[#D0D0D0] disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {saving ? step || "Submitting…" : "Submit for approval"}
              </button>
              {!files.length && <span className="text-xs text-[#6E6E6E]">Attach at least one file to submit.</span>}
            </div>
          </>
        )}
      </div>
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
