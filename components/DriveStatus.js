"use client";
import { useEffect, useState } from "react";
import { HardDrive, CheckCircle2, AlertCircle } from "lucide-react";

const FLAGS = {
  connected: ["ok", "Google Drive is connected. New evidence now goes to the Sub Dealer Claims folder."],
  cancelled: ["warn", "Google sign-in was cancelled. Google Drive is not connected."],
  "not-configured": ["warn", "Google sign-in is not set up on this site yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing)."],
  "bad-state": ["warn", "The Google sign-in could not be verified. Please try connecting again."],
  "no-refresh-token": ["warn", "Google did not give a lasting connection. Remove this app's access in your Google account and connect again."],
  "wrong-account": ["warn", "Please connect with your @jiadmotors.com Google account."],
  failed: ["warn", "Connecting to Google Drive failed."],
};

/** Admin/dealer dashboard strip: is the company Google Drive connected, and (for admins) a button to connect it. */
export default function DriveStatus({ role }) {
  const [status, setStatus] = useState(null);
  const [flag, setFlag] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("drive")) setFlag({ key: p.get("drive"), detail: p.get("detail") });
    fetch("/api/google-drive/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status) return null;
  const [kind, text] = flag ? FLAGS[flag.key] || ["warn", "Google Drive: " + flag.key] : [null, null];

  return (
    <div className="space-y-2">
      {flag && (
        <div className={`text-xs rounded-lg border p-3 flex items-start gap-2 ${kind === "ok" ? "bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]"}`}>
          {kind === "ok" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          <div>
            {text}
            {flag.detail && <div className="mt-1 opacity-80 break-words">{flag.detail}</div>}
          </div>
        </div>
      )}
      {status.connected ? (
        <div className="text-xs text-[#6E6E6E] flex items-center gap-1.5">
          <HardDrive size={13} className="text-[#2E7D46]" />
          Evidence is saved to Google Drive (Sub Dealer Claims) as <b className="text-[#111111]">{status.accountEmail}</b>
          {status.rootFolderId && (
            <a href={`https://drive.google.com/drive/folders/${status.rootFolderId}`} target="_blank" rel="noreferrer" className="ml-2 underline hover:text-[#111111]">
              Open folder
            </a>
          )}
          {role === "admin" && (
            <a href="/api/google-drive/connect" className="ml-2 underline hover:text-[#111111]">
              Reconnect
            </a>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-[#4D4D4D] flex items-center gap-2">
            <HardDrive size={14} className="text-[#C77700]" />
            Google Drive is not connected — evidence is still being saved in the website's own storage (limited space).
          </div>
          {role === "admin" && status.configured && (
            <a href="/api/google-drive/connect" className="px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#FF2447] transition-colors">
              Connect Google Drive
            </a>
          )}
          {role === "admin" && !status.configured && <span className="text-xs text-[#B23A32]">Google sign-in is not set up on this site yet.</span>}
        </div>
      )}
    </div>
  );
}
