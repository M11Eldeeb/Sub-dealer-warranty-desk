"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusTag, Header, fmt, getPartsSummary } from "@/components/ui";
import { Paperclip, Package, Search, AlertCircle } from "lucide-react";

export default function PartsTeamDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState("needs_action");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof) return router.push("/login?setup=1");
      if (prof.role !== "parts_team") return router.push("/");
      setProfile(prof);

      // RLS already restricts this to approved claims only (awaiting_parts, parts_arrived, closed).
      const { data: claimsData } = await supabase
        .from("claims")
        .select("*, branches(name), claim_attachments(count), claim_parts(status)")
        .order("created_at", { ascending: false });

      setClaims(claimsData || []);
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const isFullyShipped = (c) => getPartsSummary(c.claim_parts)?.label === "All Parts Shipped";

  const counts = {
    needs_action: claims.filter((c) => c.status === "awaiting_parts" && !isFullyShipped(c)).length,
    all_shipped: claims.filter((c) => c.status === "awaiting_parts" && isFullyShipped(c)).length,
    history: claims.filter((c) => c.status === "closed").length,
  };

  const filtered = claims
    .filter((c) => {
      if (filter === "needs_action" && !(c.status === "awaiting_parts" && !isFullyShipped(c))) return false;
      if (filter === "all_shipped" && !(c.status === "awaiting_parts" && isFullyShipped(c))) return false;
      if (filter === "history" && c.status !== "closed") return false;
      if (query && !`${c.work_order_number} ${c.vin} ${c.plate} ${c.claim_number} ${c.branches?.name}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) =>
      filter === "needs_action" || filter === "all_shipped"
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at)
    );

  if (loading) return <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-sm">
            {[
              ["needs_action", "Needs Action"],
              ["all_shipped", "All Parts Shipped"],
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
                    <div className="font-bold text-[#111111] mt-0.5">WO# {c.work_order_number}</div>
                    <div className="text-sm text-[#4D4D4D] mt-0.5 font-mono">
                      {c.vin} · {c.plate}
                    </div>
                  </div>
                  <StatusTag status={c.status} parts={c.claim_parts} />
                </div>
                <div className="text-sm text-[#262626] mt-3 line-clamp-2">{c.customer_complaint}</div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[#6E6E6E]">
                  <span className="flex items-center gap-1">
                    <Paperclip size={12} />
                    {c.claim_attachments?.[0]?.count ?? 0}
                  </span>
                  {c.claim_parts?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Package size={12} />
                      {c.claim_parts.filter((p) => p.status === "Shipped to branch" || p.status === "Cancelled").length}/{c.claim_parts.length} resolved
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
