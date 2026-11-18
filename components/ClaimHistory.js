"use client";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Who wrote a comment, as a label. (The dealer and the admin work the same side.) */
const ROLE_LABEL = {
  sub_dealer: { label: "Sub-dealer", fg: "#0E7490", bg: "#E0F2FE" },
  dealer: { label: "Dealer", fg: "#5B4FB0", bg: "#EAE7FA" },
  admin: { label: "Dealer", fg: "#5B4FB0", bg: "#EAE7FA" },
  technical_team: { label: "Technical team", fg: "#6D28D9", bg: "#EDE7FC" },
  parts_team: { label: "Parts team", fg: "#1E7A6B", bg: "#E0F3EF" },
};

const stamp = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The text of a history line. A comment reads like every other entry, marked "Comment:" and with who wrote it. */
export function historyText(entry) {
  if (entry.kind !== "comment") return entry.note;
  const role = ROLE_LABEL[entry.actor_role]?.label;
  return `${role ? `(${role}) ` : ""}Comment: ${entry.note}`;
}

/** One line of a claim's history: the same look for a status change, a note or a comment. */
export function HistoryEntry({ entry, formatDate }) {
  return (
    <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 text-sm">
      <div className="text-xs text-[#6E6E6E] sm:w-32 sm:shrink-0 sm:pt-0.5 font-mono">{formatDate ? formatDate(entry.at) : stamp(entry.at)}</div>
      <div className="min-w-0 break-words whitespace-pre-wrap">
        <span className="font-bold text-[#111111]">{entry.actor_name}</span>
        <span className="text-[#4D4D4D]"> — {historyText(entry)}</span>
      </div>
    </div>
  );
}

/**
 * Add a comment to a claim's history, at any time and whatever the claim's status. It is saved as a history entry, so it shows
 * in the history straight away for everyone who can see the claim. Not shown to managers (they only read).
 */
export function CommentBox({ claimId, status, profile, onPosted }) {
  const supabase = createClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!profile || !["sub_dealer", "dealer", "admin", "parts_team", "technical_team"].includes(profile.role)) return null;

  const post = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("claim_status_log").insert({
      claim_id: claimId,
      from_status: status,
      to_status: status,
      actor_name: profile.full_name,
      actor_role: profile.role,
      kind: "comment",
      note: body,
    });
    setBusy(false);
    if (err) return setError("The comment could not be saved. Please try again.");
    setText("");
    await onPosted?.();
  };

  return (
    <div className="mb-4">
      <label htmlFor="claim-comment" className="sr-only">
        Add a comment to this claim's history
      </label>
      <textarea
        id="claim-comment"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") post();
        }}
        rows={2}
        maxLength={2000}
        placeholder="Add a comment to the history… (anyone on this claim will see it)"
        className="input resize-none"
        disabled={busy}
      />
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <button
          onClick={post}
          disabled={!text.trim() || busy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#E4002B] hover:bg-[#B8001F] text-white text-xs font-bold disabled:bg-[#D0D0D0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Add comment
        </button>
        {error && (
          <span role="alert" className="text-xs text-[#B23A32]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
