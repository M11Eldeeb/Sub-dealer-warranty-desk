"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePageTitle } from "@/lib/use-page-title";
import { createClient } from "@/lib/supabase/client";
import { LoadingShell, Header } from "@/components/ui";
import { ResponsiveRows, Chip } from "@/components/defect-returns";
import DialogFocus from "@/components/DialogFocus";
import { amountOf, grnOf, closedOn, buildBillWorkbook, readBillSheet, matchBillRows } from "@/lib/billing";
import { Search, FileSpreadsheet, Upload, Loader2, X, Undo2, AlertCircle, CheckCircle2, Receipt } from "lucide-react";

const SELECT =
  "id, claim_number, kind, status, work_order_number, dealer_work_order_number, labor_amount, approved_amount, closed_at, updated_at, sub_invoiced_at, sub_invoice_no, sub_invoice_amount, sub_invoice_date, branches(name)";

const sar = (n) => `SAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", year: "numeric" }) : "—");
const selectable = (r) => !r.sub_invoiced_at && r.amount != null;

const CHIP = {
  ready: { label: "Ready to invoice", color: "#8F5500", bg: "#FCF1DA" },
  invoiced: { label: "Invoiced", color: "#1E6B35", bg: "#E5F3E8" },
  noAmount: { label: "No amount", color: "#A63A32", bg: "#FAE4E2" },
};

export default function BillingPage() {
  usePageTitle("Sub-dealer bill");
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // all | claim | free_service
  const [show, setShow] = useState("all"); // all | todo | invoiced
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [undoId, setUndoId] = useState(null);

  const loadRows = async () => {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("claims").select(SELECT).eq("status", "closed").order("id").range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    setRows(all.map((r) => ({ ...r, grn: grnOf(r), amount: amountOf(r), closed: closedOn(r) })));
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
      try {
        await loadRows();
      } catch {
        setMessage({ ok: false, text: "Could not load the closed claims. Refresh the page." });
      }
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <LoadingShell />;

  const todo = rows.filter((r) => !r.sub_invoiced_at);
  const invoiced = rows.filter((r) => r.sub_invoiced_at);
  const sum = (list) => list.reduce((s, r) => s + (r.amount || 0), 0);

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => (type === "all" ? true : r.kind === type))
    .filter((r) => (show === "all" ? true : show === "todo" ? !r.sub_invoiced_at : !!r.sub_invoiced_at))
    .filter((r) => !q || [r.claim_number, r.grn, r.work_order_number, r.dealer_work_order_number, r.sub_invoice_no].some((v) => (v || "").toLowerCase().includes(q)))
    // what still needs invoicing first, the invoiced ones (faded) after it; newest closed first inside each
    .sort((a, b) => (a.sub_invoiced_at ? 1 : 0) - (b.sub_invoiced_at ? 1 : 0) || Date.parse(b.closed || 0) - Date.parse(a.closed || 0));

  const pickable = shown.filter(selectable);
  const picked = rows.filter((r) => selected.has(r.id) && selectable(r));
  const pickedTotal = Math.round(picked.reduce((s, r) => s + Math.round(r.amount * 100), 0)) / 100;
  const allShownPicked = pickable.length > 0 && pickable.every((r) => selected.has(r.id));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownPicked) pickable.forEach((r) => next.delete(r.id));
      else pickable.forEach((r) => next.add(r.id));
      return next;
    });

  const exportBill = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const items = [...picked]
        .sort((a, b) => Date.parse(a.closed || 0) - Date.parse(b.closed || 0) || a.claim_number.localeCompare(b.claim_number))
        .map((r) => ({ grn: r.grn, claimNumber: r.claim_number, kind: r.kind, branchName: r.branches?.name, amount: r.amount, closed: r.closed }));
      const { book, total } = buildBillWorkbook(XLSX, items);
      const branches = [...new Set(items.map((i) => i.branchName).filter(Boolean))];
      const slug = branches.length === 1 ? branches[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "sub-dealers";
      XLSX.writeFile(book, `payment-bill-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setMessage({ ok: true, text: `Bill exported: ${items.length} item${items.length === 1 ? "" : "s"}, ${sar(total)}. When the sub-dealer's invoices are in, import the sheet to mark them as invoiced.` });
    } catch {
      setMessage({ ok: false, text: "The export failed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id) => {
    if (undoId !== id) {
      setUndoId(id);
      setTimeout(() => setUndoId((cur) => (cur === id ? null : cur)), 4000);
      return;
    }
    setUndoId(null);
    const { error } = await supabase.rpc("unmark_sub_dealer_invoiced", { p_ids: [id] });
    if (error) return setMessage({ ok: false, text: error.message });
    await loadRows();
  };

  const columns = [
    {
      key: "pick",
      label: (
        <input type="checkbox" checked={allShownPicked} onChange={toggleAll} disabled={pickable.length === 0} aria-label="Select every claim shown that is not invoiced yet" className="w-4 h-4 accent-[#E4002B]" />
      ),
      hideLabelOnCard: true,
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id) && selectable(r)}
          onChange={() => toggle(r.id)}
          disabled={!selectable(r)}
          aria-label={`Select ${r.claim_number}`}
          title={r.sub_invoiced_at ? "Already invoiced with the sub-dealer" : r.amount == null ? "This claim has no amount yet" : undefined}
          className="w-4 h-4 accent-[#E4002B] disabled:cursor-not-allowed"
        />
      ),
    },
    {
      key: "claim",
      label: "Claim",
      render: (r) => (
        <Link href={r.kind === "free_service" ? `/free-service/${r.id}` : `/claims/${r.id}`} className="font-mono text-xs text-[#E4002B] hover:underline">
          {r.claim_number}
        </Link>
      ),
    },
    { key: "type", label: "Type", render: (r) => <span className="text-xs">{r.kind === "free_service" ? "Free Service" : "Warranty"}</span> },
    { key: "grn", label: "GRN NO.", render: (r) => <span className="font-mono text-xs">{r.grn || "—"}</span> },
    { key: "closed", label: "Closed", render: (r) => <span className="text-xs">{day(r.closed)}</span> },
    { key: "amount", label: "Amount", className: "sm:text-right", render: (r) => <span className="font-mono text-xs font-bold">{r.amount == null ? "—" : sar(r.amount)}</span> },
    {
      key: "state",
      label: "Status",
      render: (r) =>
        r.sub_invoiced_at ? (
          <div className="flex items-center gap-2 flex-wrap justify-end sm:justify-start">
            <Chip spec={CHIP.invoiced} />
            <span className="text-[0.6875rem] text-[#6E6E6E]">{[r.sub_invoice_no && `No. ${r.sub_invoice_no}`, r.sub_invoice_date ? day(r.sub_invoice_date) : day(r.sub_invoiced_at)].filter(Boolean).join(" · ")}</span>
            <button onClick={() => undo(r.id)} aria-label={`Remove the invoiced mark from ${r.claim_number}`} title="Remove the invoiced mark" className="no-press tap-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6875rem] font-bold text-[#6E6E6E] hover:bg-[#F1F2F4]">
              <Undo2 size={11} /> {undoId === r.id ? "Sure?" : "Undo"}
            </button>
          </div>
        ) : (
          <Chip spec={r.amount == null ? CHIP.noAmount : CHIP.ready} />
        ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <div role="main" className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-28 page-in">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h1 className="text-xl font-bold text-[#111111] mb-1">Sub-dealer bill</h1>
            <p className="text-sm text-[#6E6E6E]">Pick closed claims and Free Service requests, then export one bill to pay the sub-dealer. Import the sheet back to mark them as invoiced.</p>
          </div>
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors">
            <Upload size={14} /> Import invoiced sheet
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-[#E0E0E0] rounded-lg px-4 py-3">
            <div className="text-[0.6875rem] font-bold text-[#6E6E6E]">Ready to invoice</div>
            <div className="font-mono font-bold text-[#111111]">{sar(sum(todo))}</div>
            <div className="text-[0.6875rem] text-[#6E6E6E]">{todo.length} closed</div>
          </div>
          <div className="bg-white border border-[#E0E0E0] rounded-lg px-4 py-3">
            <div className="text-[0.6875rem] font-bold text-[#6E6E6E]">Invoiced with the sub-dealer</div>
            <div className="font-mono font-bold text-[#1E6B35]">{sar(sum(invoiced))}</div>
            <div className="text-[0.6875rem] text-[#6E6E6E]">{invoiced.length} closed</div>
          </div>
        </div>

        {message && (
          <div role="alert" className={`note-in mb-4 text-xs rounded-lg border p-3 flex items-start gap-2 ${message.ok ? "bg-[#E5F3E8] border-[#B8DEC1] text-[#2E7D46]" : "bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]"}`}>
            {message.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />} {message.text}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E6E]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search claim, GRN, work order or invoice number" placeholder="Search claim, GRN or invoice no..." className="pl-8 pr-3 py-3 sm:py-2 rounded-lg border border-[#E0E0E0] text-sm bg-white outline-none focus:border-[#E4002B] w-full" />
          </div>
          <Segment value={type} onChange={setType} label="Type" options={[["all", "All types"], ["claim", "Warranty"], ["free_service", "Free Service"]]} />
          <Segment value={show} onChange={setShow} label="Show" options={[["all", "All"], ["todo", "To invoice"], ["invoiced", "Invoiced"]]} />
        </div>

        {shown.length === 0 ? (
          <div className="text-center py-16 text-[#6E6E6E]">
            <Receipt className="mx-auto mb-2" size={24} />
            Nothing closed matches this.
          </div>
        ) : (
          <ResponsiveRows columns={columns} rows={shown} rowKey={(r) => r.id} rowClass={(r) => (r.sub_invoiced_at ? "opacity-50" : "")} />
        )}
      </div>

      {/* what is picked: the total, and the export */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E0E0E0] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#111111]">{picked.length} selected</div>
            <div className="font-mono font-bold text-sm text-[#111111]">{sar(pickedTotal)} <span className="font-sans font-normal text-[0.6875rem] text-[#6E6E6E]">VAT included</span></div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {picked.length > 0 && (
              <button onClick={() => setSelected(new Set())} className="px-3 py-2 rounded-md text-xs font-bold text-[#6E6E6E] hover:bg-[#F1F2F4]">
                Clear
              </button>
            )}
            <button onClick={exportBill} disabled={!picked.length || busy} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-bold text-xs text-white bg-gradient-to-r from-[#FF2447] to-[#C4001F] hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Export bill (Excel)
            </button>
          </div>
        </div>
      </div>

      {importOpen && (
        <ImportDialog
          claims={rows}
          onClose={() => setImportOpen(false)}
          onDone={async (text) => {
            setImportOpen(false);
            setSelected(new Set());
            await loadRows();
            setMessage({ ok: true, text });
          }}
        />
      )}
    </div>
  );
}

function Segment({ value, onChange, label, options }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 bg-white border border-[#E0E0E0] rounded-lg p-1 text-xs">
      {options.map(([key, text]) => (
        <button key={key} onClick={() => onChange(key)} aria-pressed={value === key} className={`px-2.5 py-1.5 rounded-md font-bold transition-colors ${value === key ? "bg-[#111111] text-white" : "text-[#4D4D4D] hover:text-[#111111]"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

const RESULT = {
  ok: { label: "Will be marked", color: "#1E6B35", bg: "#E5F3E8" },
  already: { label: "Already invoiced", color: "#696969", bg: "#F1F2F4" },
  not_found: { label: "Not in the portal", color: "#A63A32", bg: "#FAE4E2" },
  no_grn: { label: "No GRN found", color: "#A63A32", bg: "#FAE4E2" },
  extra: { label: "No claim left on this GRN", color: "#8F5500", bg: "#FCF1DA" },
};

/** Import a bill sheet: read it, pair every row with a closed claim by GRN, show what will happen, then mark them invoiced. */
function ImportDialog({ claims, onClose, onDone }) {
  const supabase = createClient();
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const onFile = async (file) => {
    setError("");
    setResults(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const parsed = readBillSheet(XLSX, new Uint8Array(await file.arrayBuffer()));
      if (parsed.error) return setError(parsed.error);
      if (!parsed.rows.length) return setError("The table has no rows.");
      const matched = matchBillRows(parsed.rows, claims);
      setResults(matched);
      // rows whose amount is far from the approved one are left unticked: look at them first
      setChecked(new Set(matched.filter((m) => m.status === "ok" && Math.abs(m.diff ?? 0) <= 1).map((m) => m.row.line)));
    } catch {
      setError("That file could not be read.");
    }
  };

  const counts = results ? results.reduce((o, m) => ((o[m.status] = (o[m.status] || 0) + 1), o), {}) : {};
  const toMark = results ? results.filter((m) => m.status === "ok" && checked.has(m.row.line)) : [];

  const confirm = async () => {
    if (!toMark.length || busy) return;
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.rpc("mark_sub_dealer_invoiced", {
      p_items: toMark.map((m) => ({ id: m.claim.id, invoice_no: m.row.invoiceNo, amount: m.row.amount, date: m.row.date })),
    });
    setBusy(false);
    if (err) return setError(err.message);
    const skipped = data?.skipped?.length || 0;
    onDone(`Marked ${data?.marked ?? 0} as invoiced with the sub-dealer.${skipped ? ` ${skipped} skipped (already invoiced or not closed).` : ""}`);
  };

  const columns = [
    {
      key: "c",
      label: "",
      hideLabelOnCard: true,
      render: (m) => (
        <input
          type="checkbox"
          checked={checked.has(m.row.line)}
          disabled={m.status !== "ok"}
          onChange={() =>
            setChecked((prev) => {
              const next = new Set(prev);
              next.has(m.row.line) ? next.delete(m.row.line) : next.add(m.row.line);
              return next;
            })
          }
          aria-label={`Mark line ${m.row.line}`}
          className="w-4 h-4 accent-[#E4002B] disabled:cursor-not-allowed"
        />
      ),
    },
    { key: "grn", label: "GRN NO.", render: (m) => <span className="font-mono text-xs">{m.row.grn || m.row.grnText || "—"}</span> },
    { key: "inv", label: "Invoice No.", render: (m) => <span className="font-mono text-xs">{m.row.invoiceNo || "—"}</span> },
    { key: "amt", label: "Sheet amount", className: "sm:text-right", render: (m) => <span className="font-mono text-xs">{m.row.amount == null ? "—" : m.row.amount.toFixed(2)}</span> },
    { key: "claim", label: "Claim", render: (m) => <span className="font-mono text-xs">{m.claim ? `${m.claim.claim_number} · ${amountOf(m.claim)?.toFixed(2)}` : "—"}</span> },
    {
      key: "diff",
      label: "Difference",
      className: "sm:text-right",
      render: (m) => (m.diff == null ? <span className="text-xs">—</span> : <span className={`font-mono text-xs ${Math.abs(m.diff) > 1 ? "font-bold text-[#C4551B]" : "text-[#6E6E6E]"}`}>{m.diff > 0 ? "+" : ""}{m.diff.toFixed(2)}</span>),
    },
    { key: "res", label: "Result", render: (m) => <Chip spec={RESULT[m.status]} /> },
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label="Import invoiced sheet" className="fade-in fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <DialogFocus onClose={onClose} />
      <div className="dialog-in bg-white text-[#111111] rounded-lg p-5 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-base font-bold">Import invoiced sheet</h2>
          <button onClick={onClose} aria-label="Close" className="tap-icon p-1.5 rounded-md text-[#6E6E6E] hover:bg-[#F1F2F4]">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[#6E6E6E] mb-4">
          Choose the bill sheet with the sub-dealer's invoice numbers. Each row is paired with a closed claim by its GRN NO. (sub-dealer work order, then HER work order). The claims are only marked as invoiced; the payment itself is made later.
        </p>

        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#D0D0D0] hover:border-[#E4002B] rounded-lg py-6 text-sm font-bold text-[#4D4D4D] cursor-pointer transition-colors">
          <Upload size={16} /> {fileName || "Choose an Excel file (.xlsx)"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>

        {error && (
          <div role="alert" className="note-in mt-3 text-xs rounded-lg border p-3 flex items-start gap-2 bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {results && (
          <>
            <div className="mt-4 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-[#4D4D4D]">
              <b>{results.length} rows</b>
              <span className="text-[#1E6B35]">{counts.ok || 0} ready</span>
              {counts.already > 0 && <span>{counts.already} already invoiced</span>}
              {(counts.not_found || 0) + (counts.no_grn || 0) + (counts.extra || 0) > 0 && <span className="text-[#A63A32]">{(counts.not_found || 0) + (counts.no_grn || 0) + (counts.extra || 0)} not matched</span>}
            </div>
            <p className="mt-1 text-[0.6875rem] text-[#6E6E6E]">A row whose amount differs from the approved one by more than 1.00 SAR is left unticked: check it first.</p>
            <div className="mt-3">
              <ResponsiveRows columns={columns} rows={results} rowKey={(m) => m.row.line} rowClass={(m) => (m.status === "ok" ? "" : "opacity-60")} />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-md border border-[#E0E0E0] text-xs font-bold">
                Cancel
              </button>
              <button onClick={confirm} disabled={!toMark.length || busy} className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-[#2E7D46] hover:bg-[#256A3B] text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark {toMark.length} as invoiced
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
