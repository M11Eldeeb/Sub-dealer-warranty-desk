"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wrench } from "lucide-react";

export default function CompleteProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("sub_dealer");
  const [branchName, setBranchName] = useState("");

  const roleToPath = (r) => {
    if (r === "dealer") return "/dashboard/dealer";
    if (r === "parts_team") return "/dashboard/parts-team";
    if (r === "technical_team") return "/dashboard/technical-team";
    return "/dashboard/sub-dealer";
  };

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      // If a profile already exists (e.g. they refreshed this page), just move on.
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile) {
        router.push(roleToPath(profile.role));
        return;
      }
      setChecking(false);
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return router.push("/login");
    }

    let branchId = null;
    if (role === "sub_dealer") {
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .insert({ name: branchName })
        .select()
        .single();
      if (branchError) {
        setSaving(false);
        return setError(branchError.message);
      }
      branchId = branch.id;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: user.id, full_name: fullName, role, branch_id: branchId });

    setSaving(false);
    if (profileError) return setError(profileError.message);

    router.push(roleToPath(role));
    router.refresh();
  };

  if (checking) return <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F4F4] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-9 h-9 rounded bg-[#E4002B] flex items-center justify-center">
            <Wrench size={18} className="text-white" />
          </div>
          <div className="font-black uppercase tracking-wide text-[#111111]">WarrantyDesk</div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-lg p-6">
          <h2 className="font-bold text-[#111111] mb-1">One last step</h2>
          <p className="text-sm text-[#6E6E6E] mb-5">Tell us who you are so we can set up your account.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input className="input" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole("sub_dealer")}
                className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide border ${
                  role === "sub_dealer" ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                }`}
              >
                Sub-Dealer
              </button>
              <button
                type="button"
                onClick={() => setRole("dealer")}
                className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide border ${
                  role === "dealer" ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                }`}
              >
                Dealer
              </button>
              <button
                type="button"
                onClick={() => setRole("parts_team")}
                className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide border ${
                  role === "parts_team" ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                }`}
              >
                Parts Team
              </button>
              <button
                type="button"
                onClick={() => setRole("technical_team")}
                className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide border ${
                  role === "technical_team" ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                }`}
              >
                Technical Team
              </button>
            </div>
            {role === "sub_dealer" && (
              <input
                className="input"
                placeholder="Branch / shop name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                required
              />
            )}
            {error && <div className="text-xs text-[#B23A32]">{error}</div>}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-md font-bold text-sm uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
