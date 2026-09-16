"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusTag, Header, Tabs, ClaimGrid, ClaimCard, fmt, cardSubtitle, combinedWorkOrder } from "@/components/ui";
import { Paperclip, Search, AlertCircle, CheckCircle2 } from "lucide-react";

export default function TechnicalTeamDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState("needs_review");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!prof || prof.role !== "technical_team") return router.push("/");
    setProfile(prof);

    // RLS already restricts this to claims currently in technical review, or ones this role has verified before.
    const { data: claimsData } = await supabase
      .from("claims")
      .select("*, branches(name), claim_attachments(count)")
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
    needs_review: claims.filter((c) => c.status === "technical_review").length,
    verified: claims.filter((c) => c.technical_verified).length,
  };

  const filtered = claims
    .filter((c) => {
      if (filter === "needs_review" && c.status !== "technical_review") return false;
      if (filter === "verified" && !c.technical_verified) return false;
      if (
        query &&
        !`${c.work_order_number} ${c.vin} ${c.plate} ${c.claim_number} ${c.branches?.name}`.toLowerCase().includes(query.toLowerCase())
      )
        return false;
      return true;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (loading)
    return (
      <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">
        <div className="w-5 h-5 rounded-full border-2 border-[#E0E0E0] border-t-[#E4002B] animate-spin mr-2" /> Loading…
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: "needs_review", label: "Needs Review", count: counts.needs_review },
              { key: "verified", label: "Verified", count: counts.verified },
            ]}
          />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search claims or branches..."
              className="pl-8 pr-3 py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-64"
            />
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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-[#6E6E6E]">{c.claim_number} · {c.branches?.name}</div>
                      <div className="font-bold text-[#111111] mt-0.5 group-hover:text-[#E4002B] transition-colors">WO# {combinedWorkOrder(c)}</div>
                      <div className="text-sm text-[#4D4D4D] mt-0.5 font-mono">
                        {c.vin} · {c.plate}
                      </div>
                    </div>
                    <StatusTag status={c.status} />
                  </div>
                  <div className="text-sm text-[#262626] mt-3 line-clamp-2">{cardSubtitle(c.claim_parts, c.claim_labor) || c.customer_complaint}</div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-[#6E6E6E]">
                    <span className="flex items-center gap-1">
                      <Paperclip size={12} />
                      {c.claim_attachments?.[0]?.count ?? 0}
                    </span>
                    {c.technical_verified && (
                      <span className="flex items-center gap-1 text-[#2E7D46] font-bold">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    )}
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
