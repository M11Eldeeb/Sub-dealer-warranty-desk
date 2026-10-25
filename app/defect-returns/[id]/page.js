"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { usePageTitle } from "@/lib/use-page-title";
import { createClient } from "@/lib/supabase/client";
import { LoadingShell, Header, fmt } from "@/components/ui";
import { DrStatusTag, DecisionChip, ResponsiveRows } from "@/components/defect-returns";
import { ChevronLeft, Check, XCircle, RotateCcw, Loader2, Ban, CheckCheck, AlertCircle, Lock } from "lucide-react";

export default function DefectReturnDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [ret, setRet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  usePageTitle(ret ? ret.return_number : "Defected parts return");

  const load = async () => {
    const { data } = await supabase
      .from("defect_returns")
      .select(
        "id, return_number, status, note, created_at, completed_at, branch_id, branches(name), defect_return_items(id, decision, decided_at, claim_id, part_id, claims(claim_number, work_order_number, dealer_work_order_number, vin), claim_parts(name, part_number, qty))"
      )
      .eq("id", params.id)
      .maybeSingle();
    if (!data) {
      setMissing(true);
      return null;
    }
    data.defect_return_items.sort((a, b) => (a.claims?.claim_number || "").localeCompare(b.claims?.claim_number || "") || (a.claim_parts?.name || "").localeCompare(b.claim_parts?.name || ""));
    setRet(data);
    return data;
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
      await load();
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <LoadingShell cards={2} />;

  if (missing || !ret)
    return (
      <div className="min-h-screen bg-[#F4F4F4]">
        <Header profile={profile} onSignOut={signOut} />
        <div role="main" className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Lock className="mx-auto mb-3 text-[#6E6E6E]" size={26} />
          <h1 className="font-bold text-[#111111]">Return not found</h1>
          <p className="text-sm text-[#6E6E6E] mt-1">It may not exist, or it belongs to another branch.</p>
          <Link href="/dashboard/defect-returns" className="mt-4 inline-block text-sm font-bold text-[#E4002B] hover:underline">
            Back to defected parts
          </Link>
        </div>
      </div>
    );

  const isOfficer = ["dealer", "admin"].includes(profile.role);
  const isSub = profile.role === "sub_dealer";
  const items = ret.defect_return_items;
  const arrived = items.filter((i) => i.decision === "arrived").length;
  const notReceived = items.filter((i) => i.decision === "not_received").length;
  const pending = items.filter((i) => i.decision === "pending").length;
  const claimCount = new Set(items.map((i) => i.claim_id)).size;
  const canReview = isOfficer && ret.status !== "cancelled";
  const canCancel = isSub && ret.status === "submitted" && pending === items.length;

  const decide = async (item, decision) => {
    if (busy) return;
    setBusy(item.id + decision);
    setMessage(null);
    const wasOpen = ret.status === "submitted";
    const { data: newStatus, error } = await supabase.rpc("review_defect_return_item", { p_item: item.id, p_decision: decision });
    if (error) {
      setBusy(null);
      return setMessage({ ok: false, text: error.message });
    }
    await load();
    if (wasOpen && newStatus === "completed") await tellSubDealer();
    setBusy(null);
  };

  const markAllArrived = async () => {
    if (busy) return;
    setBusy("all");
    setMessage(null);
    let last = null;
    for (const it of items.filter((i) => i.decision === "pending")) {
      const { data, error } = await supabase.rpc("review_defect_return_item", { p_item: it.id, p_decision: "arrived" });
      if (error) {
        setMessage({ ok: false, text: error.message });
        break;
      }
      last = data;
    }
    await load();
    if (last === "completed") await tellSubDealer();
    setBusy(null);
  };

  const tellSubDealer = async () => {
    try {
      const res = await fetch("/api/notify-defect-return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnId: ret.id, event: "completed" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ ok: false, text: `Saved, but the email to the sub-dealer failed: ${data.error || "unknown error"}` });
    } catch {
      setMessage({ ok: false, text: "Saved, but the email to the sub-dealer could not be sent (network error)." });
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    const { error } = await supabase.rpc("cancel_defect_return", { p_id: ret.id });
    if (error) setMessage({ ok: false, text: error.message });
    await load();
    setConfirmCancel(false);
    setBusy(null);
  };

  const columns = [
    { key: "claim", label: "Claim", render: (i) => <Link href={`/claims/${i.claim_id}`} className="font-mono text-xs text-[#E4002B] hover:underline">{i.claims?.claim_number}</Link> },
    { key: "wo", label: "Sub-dealer WO", render: (i) => <span className="font-mono text-xs">{i.claims?.work_order_number || "—"}</span> },
    { key: "dwo", label: "Dealer WO", render: (i) => <span className="font-mono text-xs">{i.claims?.dealer_work_order_number || "—"}</span> },
    { key: "part", label: "Part", render: (i) => <span className="font-semibold text-[#111111]">{i.claim_parts?.name}</span> },
    { key: "pn", label: "Part number", render: (i) => <span className="font-mono text-xs">{i.claim_parts?.part_number || "—"}</span> },
    { key: "qty", label: "Qty", render: (i) => i.claim_parts?.qty },
    { key: "state", label: "Status", render: (i) => <DecisionChip decision={i.decision} /> },
    ...(canReview
      ? [
          {
            key: "act",
            label: "Check",
            className: "sm:text-right",
            render: (i) => (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <button onClick={() => decide(i, "arrived")} disabled={!!busy || i.decision === "arrived"} className="no-press tap-auto flex items-center gap-1 px-2.5 min-h-9 rounded-md border border-[#B8DEC1] text-xs font-bold text-[#2E7D46] hover:bg-[#E5F3E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {busy === i.id + "arrived" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Arrived
                </button>
                <button onClick={() => decide(i, "not_received")} disabled={!!busy || i.decision === "not_received"} className="no-press tap-auto flex items-center gap-1 px-2.5 min-h-9 rounded-md border border-[#F2C9C5] text-xs font-bold text-[#B23A32] hover:bg-[#FAE4E2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {busy === i.id + "not_received" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Not received
                </button>
                {i.decision !== "pending" && (
                  <button onClick={() => decide(i, "pending")} disabled={!!busy} aria-label="Undo this check" title="Undo" className="no-press tap-auto tap-icon p-1.5 rounded-md text-[#6E6E6E] hover:bg-[#F1F2F4] disabled:opacity-40">
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div role="main" className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 page-in space-y-4">
        <button onClick={() => router.push("/dashboard/defect-returns")} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111]">
          <ChevronLeft size={16} /> Defected parts
        </button>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-mono text-xs text-[#6E6E6E]">
              {ret.return_number} · {ret.branches?.name}
            </div>
            <h1 className="text-xl font-bold text-[#111111]">
              {items.length} part{items.length === 1 ? "" : "s"} from {claimCount} claim{claimCount === 1 ? "" : "s"}
            </h1>
            <div className="text-xs text-[#6E6E6E] mt-0.5">Sent {fmt(ret.created_at)}</div>
          </div>
          <DrStatusTag status={ret.status} />
        </div>

        {message && (
          <div role="alert" className={`note-in text-xs rounded-lg border p-3 flex items-start gap-2 ${message.ok ? "bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]"}`}>
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {message.text}
          </div>
        )}

        {/* progress */}
        <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5" aria-label="Progress">
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <div className="font-bold text-[#111111]">
              {arrived} of {items.length} arrived to dealer
            </div>
            <div className="text-[#6E6E6E]">
              {ret.status === "cancelled" ? "Cancelled by the sub-dealer" : `${pending} not checked yet${notReceived ? ` · ${notReceived} not received` : ""}`}
            </div>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#E0E0E0] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={arrived} aria-label="Parts arrived">
            <div className="h-full bg-[#2E7D46] transition-[width] duration-300" style={{ width: `${items.length ? Math.round((arrived / items.length) * 100) : 0}%` }} />
          </div>
          {ret.note && (
            <p className="mt-3 text-sm text-[#262626] whitespace-pre-wrap break-words">
              <span className="text-xs font-semibold text-[#6E6E6E] block">Note from the sub-dealer</span>
              {ret.note}
            </p>
          )}
          {canReview && pending > 0 && (
            <div className="mt-4">
              <button onClick={markAllArrived} disabled={!!busy} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#2E7D46] hover:bg-[#256A3B] text-white text-xs font-bold disabled:opacity-50 transition-colors">
                {busy === "all" ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={14} />} Mark all {pending} remaining as arrived
              </button>
            </div>
          )}
        </section>

        <ResponsiveRows columns={columns} rows={items} rowKey={(i) => i.id} />

        {isOfficer && ret.status === "submitted" && <p className="text-xs text-[#6E6E6E]">Mark each part as it is checked. The claim records it as arrived to the dealer, and the sub-dealer is told once every part has been checked.</p>}

        {canCancel && (
          <section className="bg-white border border-[#E0E0E0] rounded-lg p-4 sm:p-5">
            {!confirmCancel ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-[#4D4D4D]">Sent by mistake? You can cancel it until the officers start checking.</p>
                <button onClick={() => setConfirmCancel(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#F2C9C5] text-xs font-bold text-[#B23A32] hover:bg-[#FAE4E2] transition-colors">
                  <Ban size={13} /> Cancel request
                </button>
              </div>
            ) : (
              <div className="note-in space-y-3">
                <p className="text-sm text-[#262626]">Cancel this return request? The parts go back to your list and you can send them in a new request.</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={cancel} disabled={!!busy} className="flex items-center gap-2 px-4 py-2.5 rounded bg-[#B23A32] hover:opacity-90 text-white text-xs font-bold disabled:opacity-50">
                    {busy === "cancel" ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Yes, cancel it
                  </button>
                  <button onClick={() => setConfirmCancel(false)} className="px-4 py-2.5 rounded border border-[#E0E0E0] text-xs font-bold text-[#4D4D4D] hover:border-[#111111]">
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
