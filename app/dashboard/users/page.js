"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/ui";
import { ChevronLeft, UserPlus, KeyRound, Trash2, Copy, Check, AlertCircle, Loader2 } from "lucide-react";

const ROLE_ORDER = ["admin", "dealer", "technical_team", "parts_team", "sub_dealer"];
const ROLE_LABEL = { admin: "Admin", dealer: "Dealer", sub_dealer: "Sub-Dealer", parts_team: "Parts Team", technical_team: "Technical Team" };

export default function UsersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null); // `${action}:${userId}`
  const [notice, setNotice] = useState(null); // { tone, text }
  const [temp, setTemp] = useState(null); // { name, email, password }
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // user

  const load = async () => {
    const res = await fetch("/api/admin-users", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setLoadError(data.error || "Could not load the users.");
    setUsers(data.users);
    setMe(data.me);
    setMyRole(data.myRole);
  };

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || !["dealer", "admin"].includes(prof.role)) return router.push("/");
      setProfile(prof);
      await load();
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const canManage = (u) => myRole === "admin" || u.role !== "admin";

  const resetPassword = async (u) => {
    setBusy(`reset:${u.id}`);
    setNotice(null);
    setTemp(null);
    const res = await fetch("/api/admin-users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setNotice({ tone: "bad", text: data.error || "Could not reset the password." });
    setTemp({ name: u.fullName, email: u.email, password: data.tempPassword });
    setCopied(false);
  };

  const deleteUser = async (u) => {
    setConfirmDelete(null);
    setBusy(`delete:${u.id}`);
    setNotice(null);
    const res = await fetch("/api/admin-users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setNotice({ tone: "bad", text: data.error || "Could not delete the account." });
    setNotice({ tone: "good", text: `${u.fullName} (${u.email}) was deleted.` });
    await load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${temp.email}\nPassword: ${temp.password}`);
      setCopied(true);
    } catch {
      // clipboard blocked: the password is on screen anyway
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">
        <div className="w-5 h-5 rounded-full border-2 border-[#E0E0E0] border-t-[#E4002B] animate-spin mr-2" /> Loading…
      </div>
    );

  const q = query.trim().toLowerCase();
  const shown = users.filter((u) => !q || [u.fullName, u.email, u.branch, ROLE_LABEL[u.role]].some((v) => (v || "").toLowerCase().includes(q)));
  const groups = [...ROLE_ORDER, ...new Set(shown.map((u) => u.role).filter((r) => !ROLE_ORDER.includes(r)))]
    .map((role) => ({ role, members: shown.filter((u) => u.role === role) }))
    .filter((g) => g.members.length > 0);

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 page-in">
        <button onClick={() => router.push("/dashboard/dealer")} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111] mb-4">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide mb-1">User settings</h2>
            <p className="text-sm text-[#6E6E6E]">Everyone who can sign in to the website. Add accounts, reset a password or delete an account.</p>
          </div>
          <Link
            href="/dashboard/dealer/create-account"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] active:scale-95 transition-all"
          >
            <UserPlus size={14} /> Add user
          </Link>
        </div>

        {loadError && <div className="text-sm text-[#B23A32] mb-4">{loadError}</div>}

        {notice && (
          <div
            className={`note-in text-sm rounded-lg border p-3 mb-4 flex items-start gap-2 ${
              notice.tone === "good" ? "bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]"
            }`}
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {notice.text}
          </div>
        )}

        {temp && (
          <div className="note-in bg-[#E5F3E8] border border-[#C3E0C9] rounded-lg p-4 mb-4 text-sm">
            <div className="font-bold text-[#2E7D46] mb-1">New password for {temp.name}</div>
            <div className="text-[#2E7D46]">Share it with them directly. This is the only time it is shown.</div>
            <div className="bg-white rounded p-2.5 mt-2 font-mono text-xs space-y-1">
              <div>Email: {temp.email}</div>
              <div>Password: {temp.password}</div>
            </div>
            <button onClick={copy} className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#2E7D46] hover:underline">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, role or branch…"
          className="mb-3 px-3 py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-full sm:w-80"
        />

        <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden">
          {shown.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#6E6E6E]">No users match.</div>
          ) : (
            <div>
              {groups.map((g) => (
                <div key={g.role}>
                  <div className="px-4 py-2 bg-[#FAFAFA] border-b border-[#EEEEEE] text-[10px] font-black uppercase tracking-widest text-[#6E6E6E]">
                    {ROLE_LABEL[g.role] || g.role} <span className="font-bold">({g.members.length})</span>
                  </div>
                  <ul className="divide-y divide-[#EEEEEE] border-b border-[#EEEEEE] last:border-b-0">
                    {g.members.map((u) => (
                <li key={u.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#111111] truncate">
                      {u.fullName}
                      {u.id === me && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E]">you</span>}
                    </div>
                    <div className="text-xs text-[#6E6E6E] truncate">{u.email || "no email"}</div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {u.branch && <span className="text-xs text-[#4D4D4D]">{u.branch}</span>}
                    </div>
                  </div>
                  {canManage(u) && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => resetPassword(u)}
                        disabled={!!busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#111111] disabled:opacity-60 transition-colors"
                      >
                        {busy === `reset:${u.id}` ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Reset password
                      </button>
                      {u.id !== me && (
                        <button
                          onClick={() => setConfirmDelete(u)}
                          disabled={!!busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#F2C9C5] text-xs font-bold uppercase tracking-wide text-[#B23A32] hover:bg-[#FAE4E2] disabled:opacity-60 transition-colors"
                        >
                          {busy === `delete:${u.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="fade-in fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="dialog-in bg-white rounded-lg p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="font-black uppercase tracking-wide text-[#111111] mb-2">Delete account?</div>
            <p className="text-sm text-[#4D4D4D] mb-4">
              <b>{confirmDelete.fullName}</b> ({confirmDelete.email}) will no longer be able to sign in. If they have claims or history on record the account cannot be deleted - reset their password instead.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide">
                Cancel
              </button>
              <button onClick={() => deleteUser(confirmDelete)} className="px-4 py-2 rounded-md bg-[#B23A32] hover:bg-[#8F2E27] text-white text-xs font-bold uppercase tracking-wide">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
