"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/lib/use-page-title";
import { createClient } from "@/lib/supabase/client";
import { LoadingShell, Header } from "@/components/ui";
import { ResponsiveRows } from "@/components/defect-returns";
import { ChevronLeft, Search, Loader2, Send, PackageCheck, CheckCircle2 } from "lucide-react";

// Closed claims, and rejected claims whose parts had already been supplied: the defective parts are sent back once the claim is finished.
const ELIGIBLE = ["closed", "rejected"];
const SUPPLIED = "Supplied to Sub-Dealer";
// A rejected claim only owes the parts that really reached the branch.
const owed = (claim) => (claim.status === "rejected" ? claim.claim_parts.filter((p) => p.status === SUPPLIED || p.defected_arrived_at) : claim.claim_parts);

export default function NewDefectReturnPage() {
  usePageTitle("New defected parts return");
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1 choose claims, 2 confirm the parts
  const [query, setQuery] = useState("");
  const [pickedClaims, setPickedClaims] = useState(new Set());
  const [pickedParts, setPickedParts] = useState(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || prof.role !== "sub_dealer") return router.push("/dashboard/defect-returns");
      setProfile(prof);

      const [{ data: c }, { data: open }] = await Promise.all([
        supabase
          .from("claims")
          .select("id, claim_number, vin, work_order_number, dealer_work_order_number, status, created_at, claim_parts(id, name, part_number, qty, status, defected_arrived_at)")
          .eq("kind", "claim")
          .in("status", ELIGIBLE)
          .order("created_at", { ascending: false }),
        supabase.from("defect_return_items").select("part_id, defect_returns(status)").eq("decision", "pending"),
      ]);
      const reserved = new Set((open || []).filter((i) => i.defect_returns?.status === "submitted").map((i) => i.part_id));
      const list = (c || [])
        .map((claim) => ({ ...claim, claim_parts: owed(claim) }))
        .map((claim) => ({
          ...claim,
          total: claim.claim_parts.length,
          arrivedCount: claim.claim_parts.filter((p) => p.defected_arrived_at).length,
          parts: claim.claim_parts.filter((p) => !p.defected_arrived_at && !reserved.has(p.id)),
          // already handled: shown faded, cannot be picked again
          locked: claim.claim_parts.filter((p) => p.defected_arrived_at || reserved.has(p.id)).map((p) => ({ ...p, state: p.defected_arrived_at ? "arrived" : "sent" })),
        }))
        .filter((claim) => claim.total > 0)
        .sort((a, b) => (b.parts.length > 0) - (a.parts.length > 0));
      setClaims(list);
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => claims.filter((c) => !q || [c.claim_number, c.vin, c.work_order_number, c.dealer_work_order_number, ...c.parts.map((p) => p.name)].some((v) => (v || "").toLowerCase().includes(q))),
    [claims, q]
  );
  const selectable = visible.filter((c) => c.parts.length > 0);
  const allVisiblePicked = selectable.length > 0 && selectable.every((c) => pickedClaims.has(c.id));
  const availableCount = claims.filter((c) => c.parts.length > 0).length;

  const toggleClaim = (id) =>
    setPickedClaims((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAllVisible = () =>
    setPickedClaims((s) => {
      const n = new Set(s);
      selectable.forEach((c) => (allVisiblePicked ? n.delete(c.id) : n.add(c.id)));
      return n;
    });

  // Step 2 rows: every part of every chosen claim
  const rows = claims
    .filter((c) => pickedClaims.has(c.id))
    .flatMap((c) => [...c.parts.map((p) => ({ ...p, claim: c })), ...c.locked.map((p) => ({ ...p, claim: c }))]);

  const goConfirm = () => {
    setPickedParts(new Set(rows.filter((r) => !r.state).map((r) => r.id)));
    setError("");
    setStep(2);
    window.scrollTo({ top: 0 });
  };
  const togglePart = (id) =>
    setPickedParts((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const partIds = rows.filter((r) => pickedParts.has(r.id)).map((r) => r.id);
  const claimCount = new Set(rows.filter((r) => pickedParts.has(r.id)).map((r) => r.claim.id)).size;

  const submit = async () => {
    if (!partIds.length || saving) return;
    setSaving(true);
    setError("");
    const { data: id, error: rpcError } = await supabase.rpc("create_defect_return", { p_part_ids: partIds, p_note: note.trim() });
    if (rpcError || !id) {
      setSaving(false);
      return setError(rpcError?.message || "Could not send the request.");
    }
    await fetch("/api/notify-defect-return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnId: id, event: "submitted" }) }).catch(() => {});
    router.push(`/defect-returns/${id}`);
  };

  if (loading) return <LoadingShell cards={3} />;

  const columns = [
    {
      key: "include",
      label: "Send",
      render: (r) =>
        r.state ? (
          <span className="text-xs font-semibold text-[#6E6E6E] whitespace-nowrap">{r.state === "arrived" ? "Already arrived" : "Already sent"}</span>
        ) : (
          <input type="checkbox" className="accent-[#E4002B] w-5 h-5" checked={pickedParts.has(r.id)} onChange={() => togglePart(r.id)} aria-label={`Include ${r.name} of ${r.claim.claim_number}`} />
        ),
      hideLabelOnCard: true,
    },
    { key: "claim", label: "Claim", render: (r) => <span className="font-mono text-xs">{r.claim.claim_number}</span> },
    { key: "wo", label: "Sub-dealer WO", render: (r) => <span className="font-mono text-xs">{r.claim.work_order_number || "—"}</span> },
    { key: "dwo", label: "Dealer WO", render: (r) => <span className="font-mono text-xs">{r.claim.dealer_work_order_number || "—"}</span> },
    { key: "part", label: "Part", render: (r) => <span className="font-semibold text-[#111111]">{r.name}</span> },
    { key: "pn", label: "Part number", render: (r) => <span className="font-mono text-xs">{r.part_number || "—"}</span> },
    { key: "qty", label: "Qty", render: (r) => r.qty },
  ];

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div role="main" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 page-in">
        <button onClick={() => (step === 2 ? setStep(1) : router.push("/dashboard/defect-returns"))} disabled={saving} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111] mb-4 disabled:opacity-50">
          <ChevronLeft size={16} /> {step === 2 ? "Choose claims" : "Defected parts"}
        </button>

        <h1 className="text-xl font-bold text-[#111111] mb-1">New defected parts return</h1>
        <p className="text-sm text-[#6E6E6E] mb-5">{step === 1 ? "Step 1 of 2 — choose the claims whose defective parts you are sending." : "Step 2 of 2 — check the parts below, then send the request."}</p>

        {step === 1 && (
          <>
            {availableCount === 0 && claims.length === 0 ? (
              <div className="bg-white border border-[#E0E0E0] rounded-lg p-8 text-center text-[#6E6E6E]">
                <PackageCheck className="mx-auto mb-2" size={26} />
                No claim has defective parts waiting to be returned. A claim shows up here once it is closed, or rejected after its parts were supplied.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="relative w-full sm:w-80">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search claims"
                      placeholder="Search claim, work order, VIN or part..."
                      className="pl-8 pr-3 py-3 sm:py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-full"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#111111] cursor-pointer">
                    <input type="checkbox" className="accent-[#E4002B] w-5 h-5" checked={allVisiblePicked} onChange={toggleAllVisible} />
                    Select all{q ? " shown" : ""} ({selectable.length})
                  </label>
                </div>

                <ul className="space-y-2" aria-label="Claims with parts to return">
                  {visible.map((c) => {
                    const done = c.parts.length === 0;
                    const on = !done && pickedClaims.has(c.id);
                    const sentCount = c.locked.filter((p) => p.state === "sent").length;
                    return (
                      <li key={c.id}>
                        <label className={`flex items-start gap-3 rounded-lg border p-3 transition-colors bg-white ${done ? "border-[#E0E0E0] opacity-50 cursor-not-allowed" : `cursor-pointer ${on ? "border-[#E4002B] ring-1 ring-[#E4002B]" : "border-[#E0E0E0] hover:border-[#111111]"}`}`}>
                          <input type="checkbox" className="accent-[#E4002B] w-5 h-5 mt-0.5 shrink-0" checked={on} disabled={done} onChange={() => toggleClaim(c.id)} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-mono text-xs text-[#6E6E6E]">{c.claim_number}</span>
                              {c.locked.length > 0 && (
                                <span className="text-xs font-semibold text-[#2E7D46]">
                                  {c.arrivedCount > 0 && `${c.arrivedCount}/${c.total} already arrived to dealer`}
                                  {c.arrivedCount > 0 && sentCount > 0 && " · "}
                                  {sentCount > 0 && `${sentCount} sent, waiting for check`}
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-[#111111] break-words">
                              WO# {[c.work_order_number, c.dealer_work_order_number].filter(Boolean).join(" / ")}
                            </div>
                            <div className="text-xs text-[#4D4D4D] font-mono mt-0.5">{c.vin}</div>
                            <div className="text-sm text-[#262626] mt-1.5 break-words">
                              {done ? `All ${c.total} part${c.total === 1 ? "" : "s"} already sent: ${c.locked.map((p) => p.name).join(", ")}` : `${c.parts.length} part${c.parts.length === 1 ? "" : "s"}: ${c.parts.map((p) => p.name).join(", ")}`}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                  {visible.length === 0 && <li className="text-center py-10 text-[#6E6E6E]">No claim matches your search.</li>}
                </ul>

                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  <button onClick={goConfirm} disabled={pickedClaims.size === 0} className="flex items-center gap-2 px-5 py-2.5 rounded font-bold text-sm text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:bg-[#D0D0D0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                    Review {pickedClaims.size > 0 ? `${pickedClaims.size} claim${pickedClaims.size === 1 ? "" : "s"}` : "selection"}
                  </button>
                  {pickedClaims.size === 0 && <span className="text-xs text-[#6E6E6E]">Tick at least one claim.</span>}
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <ResponsiveRows columns={columns} rows={rows} rowKey={(r) => r.id} rowClass={(r) => (!r.state && pickedParts.has(r.id) ? "" : "opacity-50")} />
            <p className="mt-3 text-sm text-[#4D4D4D]" role="status">
              <CheckCircle2 size={14} className="inline -mt-0.5 mr-1 text-[#2E7D46]" />
              {partIds.length} part{partIds.length === 1 ? "" : "s"} from {claimCount} claim{claimCount === 1 ? "" : "s"} will be sent. Untick a part you are not sending this time.
            </p>

            <label className="block mt-5">
              <span className="block text-xs font-semibold text-[#6E6E6E] mb-1.5">Note for the warranty officers (optional)</span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: sent with the courier on Sunday, 2 boxes." className="input resize-none" disabled={saving} />
            </label>

            {error && (
              <div role="alert" className="note-in text-sm text-[#B23A32] mt-3">
                {error}
              </div>
            )}

            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <button onClick={submit} disabled={!partIds.length || saving} className="flex items-center gap-2 px-5 py-2.5 rounded font-bold text-sm text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:bg-[#D0D0D0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {saving ? "Sending…" : "Send return request"}
              </button>
              <button onClick={() => setStep(1)} disabled={saving} className="px-4 py-2.5 rounded border border-[#E0E0E0] text-sm font-semibold text-[#4D4D4D] hover:border-[#111111] disabled:opacity-50">
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
