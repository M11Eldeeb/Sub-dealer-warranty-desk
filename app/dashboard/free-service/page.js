"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Header, Tabs, ClaimGrid, ClaimCard, fmt } from "@/components/ui";
import { FsStatusTag, formatSar } from "@/components/free-service";
import { ChevronLeft, Plus, Search, Paperclip, Lock, Inbox } from "lucide-react";

const WITH_DEALER = ["submitted", "invoice_submitted"];
const WITH_SUB_DEALER = ["returned", "invoice_returned", "approved"];
const FINISHED = ["closed", "rejected", "cancelled"];

export default function FreeServiceListPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [filter, setFilter] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || !["sub_dealer", "dealer", "admin", "manager"].includes(prof.role)) return router.push("/");
      setProfile(prof);
      setFilter(prof.role === "sub_dealer" ? "sub_dealer" : "dealer");

      const status = await fetch("/api/free-service/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!status?.canUse) {
        setLocked(true);
        return setLoading(false);
      }

      const { data } = await supabase
        .from("claims")
        .select("id, claim_number, status, vin, mileage, service_requested, work_order_number, dealer_work_order_number, approved_amount, created_at, updated_at, branches(name), claim_attachments(count)")
        .eq("kind", "free_service")
        .order("updated_at", { ascending: false });
      setRows(data || []);
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
  const groups = {
    dealer: WITH_DEALER,
    sub_dealer: WITH_SUB_DEALER,
    done: FINISHED,
  };
  const count = (key) => rows.filter((r) => groups[key].includes(r.status)).length;
  const tabs = isSub
    ? [
        { key: "sub_dealer", label: "Needs your action", count: count("sub_dealer") },
        { key: "dealer", label: "Under review", count: count("dealer") },
        { key: "done", label: "History", count: count("done") },
      ]
    : [
        { key: "dealer", label: "Needs review", count: count("dealer") },
        { key: "sub_dealer", label: "Waiting on sub-dealer", count: count("sub_dealer") },
        { key: "done", label: "History", count: count("done") },
      ];

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => groups[filter]?.includes(r.status))
    .filter((r) => !q || [r.claim_number, r.vin, r.work_order_number, r.dealer_work_order_number, r.branches?.name].some((v) => (v || "").toLowerCase().includes(q)));

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 page-in">
        <button onClick={() => router.push(isSub ? "/dashboard/sub-dealer" : "/dashboard/dealer")} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111] mb-4">
          <ChevronLeft size={16} /> Claims
        </button>

        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide mb-1">Free Service approvals</h2>
            <p className="text-sm text-[#6E6E6E]">Request approval for a free service, then upload the invoice once it is approved.</p>
          </div>
          {!locked && profile?.role === "sub_dealer" && (
            <Link
              href="/free-service/new"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide text-white bg-gradient-to-r from-[#FF2447] to-[#C4001F] hover:opacity-95 transition-opacity"
            >
              <Plus size={14} /> New request
            </Link>
          )}
        </div>

        {locked ? (
          <div className="bg-white border border-[#E0E0E0] rounded-lg p-8 text-center">
            <Lock className="mx-auto mb-3 text-[#6E6E6E]" size={26} />
            <div className="font-black uppercase tracking-wide text-[#111111]">Not available yet</div>
            <p className="text-sm text-[#6E6E6E] mt-1">Free Service approvals are being tested and will open soon.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <Tabs value={filter} onChange={setFilter} tabs={tabs} layoutId="fs-tab-pill" />
              <div className="relative w-full sm:w-auto">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search work order, VIN or branch..."
                  className="pl-8 pr-3 py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-full sm:w-72"
                />
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="text-center py-16 text-[#6E6E6E]">
                <Inbox className="mx-auto mb-2" size={24} />
                Nothing here.
              </div>
            ) : (
              <ClaimGrid animKey={filter}>
                {shown.map((r) => (
                  <ClaimCard key={r.id} claimId={r.id}>
                    <Link href={`/free-service/${r.id}`} className="claim-card group relative block p-4 overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#FF2447] to-[#B8001F] scale-y-0 group-hover:scale-y-100 origin-center transition-transform duration-300" />
                      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                        <div className="min-w-0 break-words">
                          <div className="font-mono text-xs text-[#6E6E6E]">
                            {r.claim_number} · {r.branches?.name}
                          </div>
                          <div className="font-bold text-[#111111] mt-0.5 group-hover:text-[#E4002B] transition-colors">
                            WO# {[r.work_order_number, r.dealer_work_order_number].filter(Boolean).join(" / ")}
                          </div>
                          {r.service_requested && <div className="text-sm text-[#262626] mt-0.5">{r.service_requested}</div>}
                          <div className="text-sm text-[#4D4D4D] mt-0.5 font-mono">
                            {r.vin} · {Number(r.mileage ?? 0).toLocaleString("en-US")} km
                          </div>
                        </div>
                        <FsStatusTag status={r.status} />
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 mt-3 text-xs text-[#6E6E6E] flex-wrap">
                        <span className="flex items-center gap-1">
                          <Paperclip size={12} />
                          {r.claim_attachments?.[0]?.count ?? 0}
                        </span>
                        {r.approved_amount != null && <span className="font-bold text-[#1E7A6B]">{formatSar(r.approved_amount)}</span>}
                        <span className="ml-auto">{fmt(r.created_at)}</span>
                      </div>
                    </Link>
                  </ClaimCard>
                ))}
              </ClaimGrid>
            )}
          </>
        )}
      </div>
    </div>
  );
}
