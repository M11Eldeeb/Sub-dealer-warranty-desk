"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/ui";
import DriveStatus from "@/components/DriveStatus";
import EmailTemplates from "@/components/EmailTemplates";
import { ChevronLeft, Mail, CheckCircle2, AlertCircle, Loader2, Send, BadgeCheck, Lock, LockOpen } from "lucide-react";

const FLAGS = {
  connected: ["ok", "The email sender is connected."],
  cancelled: ["warn", "The Google sign-in was cancelled, so nothing was connected."],
  "not-configured": ["warn", "Google sign-in is not set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing)."],
  "bad-state": ["warn", "That sign-in could not be verified. Please try connecting again."],
  "no-refresh-token": ["warn", "Google did not give a lasting connection. Remove this app's access in that Google account's settings, then connect again."],
  "wrong-account": ["warn", "That is not a company (@jiadmotors.com) mailbox. Sign in with the mailbox the emails should come from."],
  "no-send-permission": ["warn", "The permission to send email was not ticked on the Google screen. Connect again and keep every box ticked."],
  failed: ["warn", "Connecting the email sender failed. Please try again; if it keeps failing, check the Google settings."],
};

const fmtTime = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flag, setFlag] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [freeService, setFreeService] = useState(null);
  const [togglingFs, setTogglingFs] = useState(false);
  const [fsError, setFsError] = useState("");

  const loadFreeService = () =>
    fetch("/api/free-service/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setFreeService)
      .catch(() => {});

  const toggleFreeService = async () => {
    setTogglingFs(true);
    setFsError("");
    const res = await fetch("/api/free-service/lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: !freeService?.open }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setFsError(data.error || "Could not change it.");
    await loadFreeService();
    setTogglingFs(false);
  };

  const loadStatus = () =>
    fetch("/api/google-mail/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof || !["dealer", "admin"].includes(prof.role)) return router.push("/");
      setProfile(prof);
      const p = new URLSearchParams(window.location.search);
      if (p.get("mail")) setFlag({ key: p.get("mail"), detail: p.get("detail") });
      await loadStatus();
      await loadFreeService();
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/google-mail/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    setTestResult(res.ok ? { ok: true, text: `Test sent to ${data.sentTo} from ${data.from}. Check your inbox (and spam).` } : { ok: false, text: data.error || "The test email failed." });
    loadStatus();
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#F4F4F4] flex items-center justify-center text-[#6E6E6E]">
        <div className="w-5 h-5 rounded-full border-2 border-[#E0E0E0] border-t-[#E4002B] animate-spin mr-2" /> Loading…
      </div>
    );

  const [kind, text] = flag ? FLAGS[flag.key] || ["warn", "Email: " + flag.key] : [null, null];
  const banner = (ok) => (ok ? "note-in bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "note-in bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]");
  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 page-in">
        <button onClick={() => router.push("/dashboard/dealer")} className="flex items-center gap-1 text-sm text-[#6E6E6E] hover:text-[#111111] mb-4">
          <ChevronLeft size={16} /> Back
        </button>
        <h2 className="text-xl font-black text-[#111111] uppercase tracking-wide mb-1">Settings</h2>
        <p className="text-sm text-[#6E6E6E] mb-6">Google Drive storage and email settings.</p>

        <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Google Drive</div>
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-4 mb-6">
          <DriveStatus role={profile?.role} />
        </div>

        <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Free Service approvals</div>
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#111111] text-white flex items-center justify-center shrink-0">
              <BadgeCheck size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black uppercase tracking-wide text-sm text-[#111111]">Sub-dealer access</div>
              <p className="text-xs text-[#6E6E6E] mt-0.5">
                While locked, only the dealer and admins can see and create Free Service requests, so it can be tested safely. Open it when testing is done.
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {freeService?.open ? <LockOpen size={16} className="text-[#2E7D46]" /> : <Lock size={16} className="text-[#C4551B]" />}
                  <span className="font-bold text-[#111111]">{freeService?.open ? "Open for sub-dealers" : "Locked for sub-dealers"}</span>
                </div>
                {isAdmin ? (
                  <button
                    onClick={toggleFreeService}
                    disabled={togglingFs}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60 transition-colors ${freeService?.open ? "bg-[#111111] hover:bg-[#2A2A2A]" : "bg-[#E4002B] hover:bg-[#B8001F]"}`}
                  >
                    {togglingFs && <Loader2 size={13} className="animate-spin" />} {freeService?.open ? "Lock it again" : "Open for sub-dealers"}
                  </button>
                ) : (
                  <span className="text-xs text-[#6E6E6E]">Only an admin can change this.</span>
                )}
              </div>
              {fsError && <div className="note-in mt-2 text-xs text-[#C4551B]">{fsError}</div>}
            </div>
          </div>
        </div>

        <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Email</div>
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#111111] text-white flex items-center justify-center shrink-0">
              <Mail size={17} />
            </div>
            <div>
              <div className="font-black uppercase tracking-wide text-sm text-[#111111]">Email sender</div>
              <p className="text-xs text-[#6E6E6E] mt-0.5">
                The company mailbox WarrantyDesk sends from - for example when a claim is sent to the technical team, and for reminders. It can only send; it cannot read anything in the mailbox.
              </p>
            </div>
          </div>

          {flag && (
            <div className={`text-xs rounded-lg border p-3 flex items-start gap-2 ${banner(kind === "ok")}`}>
              {kind === "ok" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
              <div>
                {text}
                {flag.detail && <div className="mt-1 opacity-80 break-words font-mono">{flag.detail}</div>}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-[#4D4D4D]">
              {status?.connected ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#2E7D46] mr-2 align-middle" />
                  Sending as <b className="text-[#111111]">{status.accountEmail}</b>
                </>
              ) : (
                <span className="text-[#C4551B]">Not connected yet - no emails are sent until an admin connects a mailbox.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {status?.connected && (
                <button
                  onClick={sendTest}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#111111] disabled:opacity-60 transition-colors"
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {testing ? "Sending…" : "Send a test to me"}
                </button>
              )}
              {isAdmin ? (
                <a href="/api/google-mail/connect" className="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] transition-colors">
                  {status?.connected ? "Reconnect" : "Connect the email sender"}
                </a>
              ) : (
                !status?.connected && <span className="text-xs text-[#6E6E6E]">Ask an admin to connect it.</span>
              )}
            </div>
          </div>

          {testResult && <div className={`text-xs rounded-lg border p-3 ${banner(testResult.ok)}`}>{testResult.text}</div>}
        </div>

        <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mt-8 mb-1">Automatic emails</div>
        <p className="text-xs text-[#6E6E6E] mb-3">Click an email to change its wording, who it goes to and who is copied. Changes apply to the next email sent.</p>
        <div className="note-in text-xs rounded-lg border border-[#E0E0E0] bg-white p-3 mb-3 flex items-start gap-2">
          {status?.lastRun ? (
            <>
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${status.lastRun.outcome === "ok" ? "bg-[#2E7D46]" : "bg-[#C4551B]"}`} />
              <div className="text-[#4D4D4D]">
                Daily reminder job last ran <b className="text-[#111111]">{fmtTime(status.lastRun.ran_at)}</b>
                {status.lastRun.outcome === "ok" && (
                  <> - sent {status.lastRun.summary?.partsReminders ?? 0} parts, {status.lastRun.summary?.technicalReminders ?? 0} technical and {status.lastRun.summary?.returnedReminders ?? 0} returned-claim reminders.</>
                )}
                {status.lastRun.outcome === "error" && <> - some reminders failed: {(status.lastRun.summary?.errors || []).join("; ")}</>}
                {status.lastRun.outcome === "unauthorized" && (
                  <> - it was refused (wrong secret), so no reminders were sent.</>
                )}
              </div>
            </>
          ) : (
            <div className="text-[#4D4D4D]">The daily reminder job has not been recorded yet. It runs every day at 9:00 AM Saudi time.</div>
          )}
        </div>
        <EmailTemplates />

        {status?.recent?.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Recent emails</div>
            <div className="bg-white border border-[#E0E0E0] rounded-lg divide-y divide-[#EEEEEE]">
              {status.recent.map((m) => (
                <div key={m.id} className="p-3 text-xs flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-[#111111] truncate">{m.subject}</div>
                    <div className="text-[#6E6E6E] truncate">To: {m.recipients.join(", ")}</div>
                    {m.error && <div className="text-[#B23A32] mt-0.5 break-words">{m.error}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold uppercase tracking-wide ${m.status === "sent" ? "text-[#2E7D46]" : "text-[#B23A32]"}`}>{m.status}</div>
                    <div className="text-[#6E6E6E]">{fmtTime(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
