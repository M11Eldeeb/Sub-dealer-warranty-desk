"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePageTitle } from "@/lib/use-page-title";
import { createClient } from "@/lib/supabase/client";
import { LoadingShell, Header, Tabs, ClaimGrid, ClaimCard, fmt } from "@/components/ui";
import { DrStatusTag } from "@/components/defect-returns";
import { Plus, Search, PackageOpen, Package } from "lucide-react";

export default function DefectReturnsListPage() {
  usePageTitle("Defected parts");
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
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

      const { data } = await supabase
        .from("defect_returns")
        .select("id, return_number, status, note, created_at, completed_at, branches(name), defect_return_items(decision, claim_id)")
        .order("created_at", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <LoadingShell />;

  const isSub = profile?.role === "sub_dealer";
  const open = rows.filter((r) => r.status === "submitted");
  const done = rows.filter((r) => r.status !== "submitted");
  const tabs = [
    { key: "open", label: isSub ? "Sent to the dealer" : "Needs checking", count: open.length },
    { key: "history", label: "History", count: done.length },
  ];
  const q = query.trim().toLowerCase();
  const shown = (filter === "open" ? open : done).filter((r) => !q || [r.return_number, r.branches?.name].some((v) => (v || "").toLowerCase().includes(q)));

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div role="main" className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 page-in">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h1 className="text-xl font-bold text-[#111111] mb-1">Defected parts returns</h1>
            <p className="text-sm text-[#6E6E6E]">
              {isSub ? "Send the defective parts back to the dealer branch. The warranty officers check each part when it arrives." : "Check the parts sub-dealers send back and mark each one as arrived."}
            </p>
          </div>
          {isSub && (
            <Link href="/defect-returns/new" className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white bg-gradient-to-r from-[#FF2447] to-[#C4001F] hover:opacity-95 transition-opacity">
              <Plus size={14} /> New return request
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Tabs value={filter} onChange={setFilter} tabs={tabs} layoutId="dr-tab-pill" />
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search returns"
              placeholder="Search return number or branch..."
              className="pl-8 pr-3 py-3 sm:py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-full sm:w-72"
            />
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="text-center py-16 text-[#6E6E6E]">
            <PackageOpen className="mx-auto mb-2" size={24} />
            {filter === "open" ? (isSub ? "No return is waiting at the dealer." : "Nothing to check right now.") : "Nothing here yet."}
          </div>
        ) : (
          <ClaimGrid animKey={filter}>
            {shown.map((r) => {
              const items = r.defect_return_items || [];
              const arrived = items.filter((i) => i.decision === "arrived").length;
              const checked = items.filter((i) => i.decision !== "pending").length;
              const claims = new Set(items.map((i) => i.claim_id)).size;
              return (
                <ClaimCard key={r.id} claimId={r.id}>
                  <Link href={`/defect-returns/${r.id}`} className="claim-card group relative block p-4 overflow-hidden">
                    <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-[#6E6E6E]">
                          {r.return_number} · {r.branches?.name}
                        </div>
                        <div className="font-bold text-[#111111] mt-0.5 group-hover:text-[#E4002B] transition-colors">
                          {items.length} part{items.length === 1 ? "" : "s"} from {claims} claim{claims === 1 ? "" : "s"}
                        </div>
                        <div className="text-sm text-[#4D4D4D] mt-0.5">{r.status === "cancelled" ? "Cancelled by the sub-dealer" : `${arrived} arrived · ${checked} of ${items.length} checked`}</div>
                      </div>
                      <DrStatusTag status={r.status} />
                    </div>
                    {r.status !== "cancelled" && items.length > 0 && (
                      <div className="mt-3 h-1.5 rounded-full bg-[#E0E0E0] overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-[#2E7D46] transition-[width] duration-300" style={{ width: `${Math.round((arrived / items.length) * 100)}%` }} />
                      </div>
                    )}
                    <div className="flex items-center gap-x-4 mt-3 text-xs text-[#6E6E6E]">
                      <span className="flex items-center gap-1">
                        <Package size={12} /> {items.length}
                      </span>
                      <span className="ml-auto">{fmt(r.created_at)}</span>
                    </div>
                  </Link>
                </ClaimCard>
              );
            })}
          </ClaimGrid>
        )}
      </div>
    </div>
  );
}
