"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Save, Send, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";

const ROLE_LABEL = { admin: "Admin", dealer: "Dealer", technical_team: "Technical Team", parts_team: "Parts Team", sub_dealer: "Sub-Dealer" };

const toDraft = (t) => ({
  ...t,
  config: {
    to: { ...t.config.to, extraText: t.config.to.extra.join(", ") },
    cc: { ...t.config.cc, extraText: t.config.cc.extra.join(", ") },
  },
});

const fromDraft = (d) => ({
  key: d.key,
  enabled: d.enabled,
  subject: d.subject,
  body: d.body,
  include_details: d.include_details,
  include_button: d.include_button,
  config: {
    to: { roles: d.config.to.roles, users: d.config.to.users, extra: splitEmails(d.config.to.extraText) },
    cc: { roles: d.config.cc.roles, users: d.config.cc.users, extra: splitEmails(d.config.cc.extraText), trigger: !!d.config.cc.trigger },
  },
});

const splitEmails = (text) =>
  String(text || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

const chip = (on) =>
  `px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${on ? "bg-[#111111] text-white border-[#111111]" : "bg-white text-[#4D4D4D] border-[#E0E0E0] hover:border-[#111111]"}`;

function Recipients({ title, list, onChange, users, roles, triggerLabel }) {
  const set = (patch) => onChange({ ...list, ...patch });
  return (
    <div className="border border-[#EEEEEE] rounded-lg p-3 space-y-3">
      <div className="text-xs font-black uppercase tracking-wide text-[#111111]">{title}</div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">Everyone with the role</div>
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <button key={r} type="button" onClick={() => set({ roles: toggle(list.roles, r) })} className={chip(list.roles.includes(r))}>
              {ROLE_LABEL[r] || r}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">Specific people</div>
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => (
            <button key={u.id} type="button" onClick={() => set({ users: toggle(list.users, u.id) })} title={u.email} className={chip(list.users.includes(u.id))}>
              {u.name}
            </button>
          ))}
        </div>
      </div>
      {triggerLabel && (
        <label className="flex items-center gap-2 text-xs text-[#111111] cursor-pointer">
          <input type="checkbox" checked={!!list.trigger} onChange={(e) => set({ trigger: e.target.checked })} />
          {triggerLabel}
        </label>
      )}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">Other email addresses (separate with commas)</div>
        <input
          value={list.extraText}
          onChange={(e) => set({ extraText: e.target.value })}
          placeholder="name@jiadmotors.com, another@example.com"
          className="w-full px-3 py-2 rounded-md border border-[#E0E0E0] text-sm outline-none focus:border-[#E4002B]"
        />
      </div>
    </div>
  );
}

function TemplateCard({ draft, saved, setDraft, users, roles, placeholders, onSave, onReset, onTest, state }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef(null);
  const dirty = JSON.stringify(fromDraft(draft)) !== JSON.stringify(fromDraft(saved));

  const insert = (token) => {
    const el = bodyRef.current;
    const at = el ? el.selectionStart : draft.body.length;
    const end = el ? el.selectionEnd : at;
    const next = draft.body.slice(0, at) + token + draft.body.slice(end);
    setDraft({ ...draft, body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  const summary = (list) => {
    const parts = [...list.roles.map((r) => ROLE_LABEL[r] || r), ...list.users.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean), ...splitEmails(list.extraText)];
    if (list.trigger) parts.push("the person who triggered it");
    return parts.length ? parts.join(", ") : "nobody";
  };

  return (
    <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full p-4 flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-black uppercase tracking-wide text-sm text-[#111111]">{draft.label}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${draft.enabled ? "bg-[#E5F3E8] text-[#2E7D46]" : "bg-[#F1F2F4] text-[#6E6E6E]"}`}>{draft.enabled ? "On" : "Off"}</span>
            {dirty && <span className="text-[10px] font-bold uppercase tracking-wide text-[#C4551B]">Unsaved changes</span>}
          </div>
          <div className="text-xs text-[#6E6E6E] mt-0.5">{draft.when}</div>
          <div className="text-xs text-[#4D4D4D] mt-1 truncate">
            To: <b>{summary(draft.config.to)}</b>
            {(draft.config.cc.roles.length > 0 || draft.config.cc.users.length > 0 || draft.config.cc.trigger || draft.config.cc.extraText.trim()) && (
              <>
                {" "}
                · Cc: <b>{summary(draft.config.cc)}</b>
              </>
            )}
          </div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-[#6E6E6E] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[#EEEEEE] p-4 space-y-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-[#111111] cursor-pointer">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
            Send this email automatically
          </label>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">Subject</label>
            <input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#E0E0E0] text-sm outline-none focus:border-[#E4002B]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-[#6E6E6E] mb-1.5">Message</label>
            <textarea
              ref={bodyRef}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 rounded-md border border-[#E0E0E0] text-sm outline-none focus:border-[#E4002B] leading-relaxed"
            />
            <div className="mt-1.5 text-[11px] text-[#6E6E6E]">Click to add claim details into the message or subject:</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {placeholders.map(([token, label]) => (
                <button key={token} type="button" onClick={() => insert(token)} title={label} className="px-2 py-1 rounded border border-[#E0E0E0] text-[11px] font-mono text-[#4D4D4D] hover:border-[#111111]">
                  {token}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-[#111111] cursor-pointer">
              <input type="checkbox" checked={draft.include_details} onChange={(e) => setDraft({ ...draft, include_details: e.target.checked })} />
              Include the claim details table
            </label>
            <label className="flex items-center gap-2 text-sm text-[#111111] cursor-pointer">
              <input type="checkbox" checked={draft.include_button} onChange={(e) => setDraft({ ...draft, include_button: e.target.checked })} />
              Include the &quot;Open the claim&quot; button
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Recipients title="To" list={draft.config.to} onChange={(to) => setDraft({ ...draft, config: { ...draft.config, to } })} users={users} roles={roles} />
            <Recipients
              title="Cc"
              list={draft.config.cc}
              onChange={(cc) => setDraft({ ...draft, config: { ...draft.config, cc } })}
              users={users}
              roles={roles}
              triggerLabel="The person who triggered it (who sent / approved the claim)"
            />
          </div>

          {state?.message && (
            <div className={`text-xs rounded-lg border p-3 flex items-start gap-2 ${state.ok ? "bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]"}`}>
              {state.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
              {state.message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!!state?.busy || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:bg-[#D0D0D0] disabled:cursor-not-allowed transition-colors"
            >
              {state?.busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={!!state?.busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#E0E0E0] text-xs font-bold uppercase tracking-wide text-[#111111] hover:border-[#111111] disabled:opacity-60 transition-colors"
            >
              {state?.busy === "test" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send a test to me
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={!!state?.busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wide text-[#6E6E6E] hover:text-[#111111] disabled:opacity-60 transition-colors"
            >
              {state?.busy === "reset" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Settings: edit the automatic emails - on/off, subject, message, To and Cc. */
export default function EmailTemplates() {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saved, setSaved] = useState({});
  const [states, setStates] = useState({});
  const [error, setError] = useState("");

  const applyTemplates = (templates) => {
    setSaved((s) => ({ ...s, ...Object.fromEntries(templates.map((t) => [t.key, toDraft(t)])) }));
    setDrafts((d) => ({ ...d, ...Object.fromEntries(templates.map((t) => [t.key, toDraft(t)])) }));
  };

  useEffect(() => {
    fetch("/api/email-templates", { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error || "Could not load the emails.");
        return json;
      })
      .then((json) => {
        setData(json);
        applyTemplates(json.templates);
      })
      .catch((e) => setError(e.message));
  }, []);

  const mark = (key, patch) => setStates((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const call = async (key, kind, run) => {
    mark(key, { busy: kind, message: "" });
    try {
      const res = await run();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      return json;
    } catch (e) {
      mark(key, { busy: null, ok: false, message: e.message });
      return null;
    }
  };

  const save = async (key) => {
    const json = await call(key, "save", () => fetch("/api/email-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fromDraft(drafts[key])) }));
    if (!json) return;
    applyTemplates([json.template]);
    mark(key, { busy: null, ok: true, message: "Saved. The next email of this kind uses these settings." });
  };

  const reset = async (key) => {
    const json = await call(key, "reset", () => fetch(`/api/email-templates?key=${key}`, { method: "DELETE" }));
    if (!json) return;
    applyTemplates([json.template]);
    mark(key, { busy: null, ok: true, message: "Back to the default wording and recipients." });
  };

  const test = async (key) => {
    const json = await call(key, "test", () => fetch("/api/email-templates/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fromDraft(drafts[key])) }));
    if (json) mark(key, { busy: null, ok: true, message: `Test sent to ${json.sentTo} (to you only). Check your inbox.` });
  };

  if (error) return <div className="text-sm text-[#B23A32]">{error}</div>;
  if (!data) return <div className="text-sm text-[#6E6E6E]">Loading emails…</div>;

  return (
    <div className="space-y-3">
      {data.templates.map((t) => (
        <TemplateCard
          key={t.key}
          draft={drafts[t.key]}
          saved={saved[t.key]}
          setDraft={(d) => setDrafts((all) => ({ ...all, [t.key]: d }))}
          users={data.users}
          roles={data.roles}
          placeholders={data.placeholders}
          onSave={() => save(t.key)}
          onReset={() => reset(t.key)}
          onTest={() => test(t.key)}
          state={states[t.key]}
        />
      ))}
    </div>
  );
}
