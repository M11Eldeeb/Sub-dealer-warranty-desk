"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusTag, Header, fmt, cardSubtitle, combinedWorkOrder, isAgeing, AgeingBadge, ReturnedDaysBadge, daysSinceReturned } from "@/components/ui";
import ExportDataButton from "@/components/ExportDataButton";
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
    if (!["dealer", "admin"].includes(prof.role)) return router.push("/dashboard/sub-dealer");
    setProfile(prof);

    const { data: claimsData } = await supabase
      .from("claims")
      .select("*, branches(name), claim_attachments(count), claim_parts(name, status, created_at), claim_labor(name:labor_name, created_at)")
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

  if (loading) return <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-sm">
            {[
              ["needs_review", "Needs Review"],
              ["active", "Ongoing"],
              ["history", "History"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 ${
                  filter === key ? "bg-[#111111] text-white" : "text-[#4D4D4D]"
                }`}
              >
                {label}
                <span className={`px-1.5 rounded-full text-[10px] ${filter === key ? "bg-white/20" : "bg-[#E0E0E0]"}`}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search claims or branches..."
                className="pl-8 pr-3 py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-64"
              />
            </div>
            <ClaimsToolbar
              state={toolbar}
              onChange={setToolbar}
              statusOptions={STATUS_OPTIONS}
              branches={branchList}
              sortOptions={SORT_OPTIONS}
            />
            <ExportDataButton />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#6E6E6E]">
            <AlertCircle className="mx-auto mb-2" size={24} />
            No claims here.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/claims/${c.id}`}
                className="bg-[#FFFFFF] border border-[#E0E0E0] rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
                style={{ borderLeft: "4px solid #E4002B" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-[#6E6E6E]">{c.claim_number} · {c.branches?.name}</div>
                    <div className="font-bold text-[#111111] mt-0.5">WO# {combinedWorkOrder(c)}</div>
                    <div className="text-sm text-[#4D4D4D] mt-0.5 font-mono">
                      {c.vin} · {c.plate}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAgeing(c) ? (
                      <AgeingBadge days={daysSinceReturned(c)} />
                    ) : (
                      daysSinceReturned(c) !== null && <ReturnedDaysBadge days={daysSinceReturned(c)} />
                    )}
                    <StatusTag status={c.status} parts={c.claim_parts} />
                  </div>
                </div>
                <div className="text-sm text-[#262626] mt-3 line-clamp-2">{cardSubtitle(c.claim_parts, c.claim_labor)}</div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[#6E6E6E]">
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
                  <span className="ml-auto">{fmt(c.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
