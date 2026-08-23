"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/ui";
import { ChevronLeft, Shuffle } from "lucide-react";

const randomPassword = () =>
  Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5).toUpperCase() + "!" + Math.floor(Math.random() * 100);

export default function CreateAccountPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("sub_dealer");
  const [branchMode, setBranchMode] = useState("existing"); // existing | new
  const [branchId, setBranchId] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAbbreviation, setNewBranchAbbreviation] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successInfo, setSuccessInfo] = useState(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || prof.role !== "dealer") return router.push("/");
      setProfile(prof);

      const { data: branchData } = await supabase.from("branches").select("*").order("name");
      setBranches(branchData || []);
      if (branchData?.length) setBranchId(branchData[0].id);

      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const canSubmit =
    fullName &&
    email &&
    password.length >= 6 &&
    (role !== "sub_dealer" ||
      (branchMode === "existing" ? branchId : newBranchName.trim() && newBranchAbbreviation.trim().length === 3)) &&
    !saving;

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    setSuccessInfo(null);

    const res = await fetch("/api/admin-create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        password,
        role,
        branchId: role === "sub_dealer" && branchMode === "existing" ? branchId : null,
        newBranchName: role === "sub_dealer" && branchMode === "new" ? newBranchName.trim() : null,
        newBranchAbbreviation: role === "sub_dealer" && branchMode === "new" ? newBranchAbbreviation.trim().toUpperCase() : null,
      }),
    });
    const data = await res.json();

    setSaving(false);
    if (!res.ok) return setError(data.error || "Something went wrong.");

    setSuccessInfo({ email, password, fullName, role });
    setFullName("");
    setEmail("");
    setPassword("");
    setNewBranchName("");
    setNewBranchAbbreviation("");

    if (role === "sub_dealer" && branchMode === "new") {
      const { data: branchData } = await supabase.from("branches").select("*").order("name");
      setBranches(branchData || []);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => {
            router.refresh();
            router.push("/dashboard/dealer");
          }}
          className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111] mb-4"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide mb-1">Create Account</h2>
        <p className="text-sm text-[#6E6E6E] mb-6">Create a login for a dealer, sub-dealer, or parts team member.</p>

        {successInfo && (
          <div className="bg-[#E5F3E8] border border-[#C3E0C9] rounded-lg p-4 mb-5 text-sm">
            <div className="font-bold text-[#2E7D46] mb-2">Account created for {successInfo.fullName}</div>
            <div className="text-[#2E7D46]">
              Share these credentials with them directly (email, WhatsApp, in person) — this is the only time the password is shown:
            </div>
            <div className="bg-white rounded p-2.5 mt-2 font-mono text-xs space-y-1">
              <div>Email: {successInfo.email}</div>
              <div>Password: {successInfo.password}</div>
              <div>Role: {successInfo.role.replace("_", "-")}</div>
            </div>
          </div>
        )}

        <div className="space-y-4 bg-white border border-[#E0E0E0] rounded-lg p-5">
          <Field label="Full name">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="input" />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="input" />
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="input" />
              <button
                type="button"
                onClick={() => setPassword(randomPassword())}
                title="Generate a random password"
                className="px-3 rounded border border-[#E0E0E0] text-[#6E6E6E] hover:border-[#E4002B] hover:text-[#E4002B] shrink-0"
              >
                <Shuffle size={16} />
              </button>
            </div>
          </Field>

          <Field label="Role">
            <div className="flex gap-2">
              {["sub_dealer", "dealer", "parts_team", "technical_team"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide border ${
                    role === r ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                  }`}
                >
                  {r === "sub_dealer" ? "Sub-Dealer" : r === "dealer" ? "Dealer" : r === "parts_team" ? "Parts Team" : "Technical Team"}
                </button>
              ))}
            </div>
          </Field>

          {role === "sub_dealer" && (
            <Field label="Branch">
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setBranchMode("existing")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide border ${
                    branchMode === "existing" ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                  }`}
                >
                  Existing branch
                </button>
                <button
                  type="button"
                  onClick={() => setBranchMode("new")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide border ${
                    branchMode === "new" ? "bg-[#111111] text-white border-[#111111]" : "border-[#E0E0E0] text-[#6E6E6E]"
                  }`}
                >
                  New branch
                </button>
              </div>
              {branchMode === "existing" ? (
                branches.length > 0 ? (
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input">
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-[#6E6E6E]">No branches yet — switch to "New branch".</div>
                )
              ) : (
                <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="Branch / shop name" className="input" />
              )}
              {branchMode === "new" && (
                <input
                  value={newBranchAbbreviation}
                  onChange={(e) => setNewBranchAbbreviation(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="3-letter abbreviation (e.g. NAG)"
                  maxLength={3}
                  className="input font-mono mt-2"
                />
              )}
            </Field>
          )}
        </div>

        {error && <div className="text-sm text-[#B23A32] mt-3">{error}</div>}

        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="mt-5 px-5 py-2.5 rounded font-bold text-sm uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:bg-[#D0D0D0] disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Creating…" : "Create Account"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
