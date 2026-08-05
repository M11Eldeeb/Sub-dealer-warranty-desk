"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Header, fmt, PART_STATUS, PART_STATUS_OPTIONS } from "@/components/ui";
import DownloadAllButton from "@/components/DownloadAllButton";
import { Search, AlertCircle, ExternalLink } from "lucide-react";

export default function PartsTeamDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [parts, setParts] = useState([]);
  const [filter, setFilter] = useState("Waiting Action");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [trackingDrafts, setTrackingDrafts] = useState({});
  const [etaDrafts, setEtaDrafts] = useState({});
  const [rowError, setRowError] = useState("");

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!prof || prof.role !== "parts_team") return router.push("/");
    setProfile(prof);

    // RLS already restricts this to parts on approved claims (awaiting_parts, parts_arrived, closed).
    const { data: partsData } = await supabase
      .from("claim_parts")
      .select("*, claims(claim_number, dealer_work_order_number, status, branches(name))")
      .order("created_at", { ascending: true });

    setParts(partsData || []);

    const tracking = {};
    const eta = {};
    (partsData || []).forEach((p) => {
      tracking[p.id] = p.tracking_number || "";
      eta[p.id] = p.eta || "";
    });
    setTrackingDrafts(tracking);
    setEtaDrafts(eta);

    setLoading(false);
  };

  useEffect(() => {
    load();
    const onPopState = () => load(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const addLog = async (claimId, statusUnchanged, note) => {
    await supabase.from("claim_status_log").insert({
      claim_id: claimId,
      from_status: statusUnchanged,
      to_status: statusUnchanged,
      actor_name: profile.full_name,
      note,
    });
  };

  const handlePartStatusChange = async (part, newStatus) => {
    const { error } = await supabase.from("claim_parts").update({ status: newStatus }).eq("id", part.id);
    if (error) {
      setRowError(error.message);
      return;
    }
    setRowError("");
    await addLog(part.claim_id, part.claims.status, `Part '${part.name}' status changed to ${newStatus}`);

    const { data: freshParts } = await supabase.from("claim_parts").select("status").eq("claim_id", part.claim_id);
    if (freshParts?.length && freshParts.every((p) => p.status === "Cancelled")) {
      await supabase.from("claims").update({ status: "closed" }).eq("id", part.claim_id);
      await addLog(part.claim_id, "closed", "All parts cancelled — job card closed automatically.");
    }

    load();
  };

  const saveTrackingNumber = async (part) => {
    const value = trackingDrafts[part.id] ?? "";
    if ((part.tracking_number || "") === value) return;
    const { error } = await supabase.from("claim_parts").update({ tracking_number: value || null }).eq("id", part.id);
    if (error) {
      setRowError(error.message);
      return;
    }
    setRowError("");
    await addLog(part.claim_id, part.claims.status, `Tracking number set for '${part.name}': ${value || "(cleared)"}`);
    load();
  };

  const saveEta = async (part) => {
    const value = etaDrafts[part.id] ?? "";
    if ((part.eta || "") === value) return;
    const { error } = await supabase.from("claim_parts").update({ eta: value || null }).eq("id", part.id);
    if (error) {
      setRowError(error.message);
      return;
    }
    setRowError("");
    await addLog(part.claim_id, part.claims.status, `ETA set for '${part.name}': ${value || "(cleared)"}`);
    load();
  };

  const counts = {};
  PART_STATUS_OPTIONS.forEach((s) => {
    counts[s] = parts.filter((p) => p.status === s).length;
  });

  const filtered = parts.filter((p) => {
    if (p.status !== filter) return false;
    if (
      query &&
      !`${p.name} ${p.part_number} ${p.claims?.claim_number} ${p.claims?.dealer_work_order_number} ${p.claims?.branches?.name}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  if (loading) return <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-sm flex-wrap">
            {PART_STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 ${
                  filter === s ? "bg-[#111111] text-white" : "text-[#4D4D4D]"
                }`}
              >
                {PART_STATUS[s].label}
                <span className={`px-1.5 rounded-full text-[10px] ${filter === s ? "bg-white/20" : "bg-[#E0E0E0]"}`}>{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search parts, claims, WO#, branch..."
                className="pl-8 pr-3 py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-64"
              />
            </div>
            <DownloadAllButton />
          </div>
        </div>

        {rowError && <div className="text-xs text-[#B23A32] bg-[#FAE4E2] border border-[#F2C9A8] rounded p-2 mb-3">{rowError}</div>}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#6E6E6E]">
            <AlertCircle className="mx-auto mb-2" size={24} />
            No parts here.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white border border-[#E0E0E0] rounded-lg p-4" style={{ borderLeft: "4px solid #E4002B" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-mono text-xs text-[#6E6E6E]">
                    {p.claims?.claim_number} · {p.claims?.branches?.name}
                  </div>
                  <Link href={`/claims/${p.claim_id}`} className="text-[#6E6E6E] hover:text-[#E4002B] shrink-0" title="View full claim">
                    <ExternalLink size={13} />
                  </Link>
                </div>
                {p.claims?.dealer_work_order_number && (
                  <div className="text-xs text-[#6E6E6E] font-mono mt-0.5">Dealer WO# {p.claims.dealer_work_order_number}</div>
                )}

                <div className="mt-2">
                  <div className="font-bold text-[#111111]">{p.name}</div>
                  <div className="text-xs text-[#6E6E6E] font-mono">
                    {p.part_number} × {p.qty}
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
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
                </div>
                <div className="flex gap-2 mt-2">
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

                <div className="text-[10px] text-[#6E6E6E] mt-2">Added {fmt(p.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
