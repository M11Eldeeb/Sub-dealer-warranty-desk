"use client";
import { usePageTitle } from "@/lib/use-page-title";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LoadingShell, StatusTag, Header, Tabs, ClaimGrid, ClaimCard, fmt, cardSubtitle, combinedWorkOrder, isAgeing, AgeingBadge, ReturnedDaysBadge, daysSinceReturned, defectedSummary } from "@/components/ui";
import FreeServiceButton from "@/components/FreeServiceButton";
import ClaimsToolbar, { DEFAULT_FILTER_STATE, applyClaimsFilterSort } from "@/components/ClaimsToolbar";
import { Paperclip, Package, Search, AlertCircle, CheckCircle2 } from "lucide-react";

const STATUS_OPTIONS = [
  "submitted", "returned", "rejected", "approved", "awaiting_parts",
  "parts_arrived", "repair_submitted", "closed",
];
const SORT_OPTIONS = [
  { value: "created_at", label: "Creation Date" },
  { value: "reception_date", label: "Reception Date" },
  { value: "status", label: "Status" },
  { value: "claim_number", label: "Claim Number" },
  { value: "branch", label: "Branch" },
];

export default function DealerDashboard() {
  usePageTitle("Claims");
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState("needs_review");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [toolbar, setToolbar] = useState(DEFAULT_FILTER_STATE);

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!prof) return router.push("/login?setup=1");
    if (!["dealer", "admin", "manager"].includes(prof.role)) return router.push("/dashboard/sub-dealer");
    setProfile(prof);

    const { data: claimsData } = await supabase
      .from("claims")
      .select("*, branches(name), claim_attachments(count), claim_parts(name, status, created_at, defected_arrived_at), claim_labor(name:labor_name, created_at)")
      .eq("kind", "claim")
      .order("created_at", { ascending: false });

    setClaims(claimsData || []);
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

  const counts = {
    needs_review: claims.filter((c) => ["submitted", "waiting_pa", "repair_submitted"].includes(c.status)).length,
    active: claims.filter((c) => !["closed", "rejected"].includes(c.status)).length,
    history: claims.filter((c) => ["closed", "rejected"].includes(c.status)).length,
  };

  const branchList = Array.from(
    new Map(claims.filter((c) => c.branches).map((c) => [c.branch_id, { id: c.branch_id, name: c.branches.name }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const tabFiltered = claims.filter((c) => {
    if (filter === "needs_review" && !["submitted", "waiting_pa", "repair_submitted"].includes(c.status)) return false;
    if (filter === "active" && ["closed", "rejected"].includes(c.status)) return false;
    if (filter === "history" && !["closed", "rejected"].includes(c.status)) return false;
    if (query && !`${c.work_order_number} ${c.vin} ${c.plate} ${c.claim_number} ${c.branches?.name}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const filtered = applyClaimsFilterSort(tabFiltered, toolbar);

  if (loading) return <LoadingShell />;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div role="main" className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 page-in">
        <h1 className="sr-only">Warranty claims</h1>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: "needs_review", label: "Needs Review", count: counts.needs_review },
              { key: "active", label: "Ongoing", count: counts.active },
              { key: "history", label: "History", count: counts.history },
            ]}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search claims or branches"
                placeholder="Search claims or branches..."
                className="pl-8 pr-3 py-3 sm:py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-full sm:w-64"
              />
            </div>
            <ClaimsToolbar
              state={toolbar}
              onChange={setToolbar}
              statusOptions={STATUS_OPTIONS}
              branches={branchList}
              sortOptions={SORT_OPTIONS}
            />
            <FreeServiceButton role={profile?.role} userId={profile?.id} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#6E6E6E]">
            <AlertCircle className="mx-auto mb-2" size={24} />
            No claims here.
          </div>
        ) : (
          <ClaimGrid animKey={filter}>
            {filtered.map((c) => (
              <ClaimCard key={c.id} claimId={c.id}>
                <Link href={`/claims/${c.id}`} className="claim-card group relative block p-4 overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#FF2447] to-[#B8001F] scale-y-0 group-hover:scale-y-100 origin-center transition-transform duration-300"
                  />
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0 break-words">
                      <div className="font-mono text-xs text-[#6E6E6E]">{c.claim_number} · {c.branches?.name}</div>
                      <div className="font-bold text-[#111111] mt-0.5 group-hover:text-[#E4002B] transition-colors">WO# {combinedWorkOrder(c)}</div>
                      <div className="text-sm text-[#4D4D4D] mt-0.5 font-mono">
                        {c.vin} · {c.plate}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isAgeing(c) ? (
                        <AgeingBadge days={daysSinceReturned(c)} />
                      ) : (
                        daysSinceReturned(c) !== null && <ReturnedDaysBadge days={daysSinceReturned(c)} />
                      )}
                      <StatusTag status={c.status} parts={c.claim_parts} />
                    </div>
                  </div>
                  <div className="text-sm text-[#262626] mt-3 line-clamp-2">{cardSubtitle(c.claim_parts, c.claim_labor)}</div>
                  <div className="flex items-center gap-x-4 gap-y-1 mt-3 text-xs text-[#6E6E6E] flex-wrap">
                    <span className="flex items-center gap-1">
                      <Paperclip size={12} />
                      {c.claim_attachments?.[0]?.count ?? 0}
                    </span>
                    {c.claim_parts?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Package size={12} />
                        {c.claim_parts.filter((p) => p.status === "Supplied to Sub-Dealer" || p.status === "Cancelled").length}/{c.claim_parts.length} resolved
                      </span>
                    )}
                    {c.technical_verified && (
                      <span className="flex items-center gap-1 text-[#2E7D46] font-bold">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    )}
                    {(() => {
                      const d = defectedSummary(c);
                      if (!d) return null;
                      if (d.all)
                        return (
                          <span className="flex items-center gap-1 text-[#5B4FB0] font-bold">
                            <CheckCircle2 size={12} /> Defected Part Arrived
                          </span>
                        );
                      if (d.arrived > 0)
                        return (
                          <span className="flex items-center gap-1 text-[#5B4FB0] font-bold">
                            <CheckCircle2 size={12} /> Defected parts: {d.arrived}/{d.total} arrived to dealer
                          </span>
                        );
                      return null;
                    })()}
                    <span className="ml-auto">{fmt(c.created_at)}</span>
                  </div>
                </Link>
              </ClaimCard>
            ))}
          </ClaimGrid>
        )}
      </div>
    </div>
  );
}
