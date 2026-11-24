"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { STATUS } from "@/lib/status-meta";

const num = (n, digits = 2) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const uniq = (xs) => [...new Set(xs.filter(Boolean))];

/** A matcher for a search box: every word typed must appear somewhere in the row's texts (any case; "-" and spaces ignored). */
const textMatcher = (query) => {
  const norm = (t) => String(t ?? "").toLowerCase().replace(/[\s-]+/g, "");
  const words = query.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  return (texts) => {
    if (!words.length) return true;
    const hay = texts.map(norm).join("|");
    return words.every((w) => hay.includes(w));
  };
};

const statusPill = (s) => {
  const spec = STATUS[s];
  return (
    <span key={s} className="pill inline-flex px-2 py-0.5 rounded-full text-[0.6875rem] font-bold whitespace-nowrap" style={{ "--pill-fg": spec?.color || "#656970", "--pill-bg": spec?.bg || "#F1F2F4" }}>
      {spec?.label || s}
    </span>
  );
};

/**
 * The list behind a chart: what you get when you click a bar, a slice or a part.
 *  spec.kind "claims": the claims picked by spec.claimFilter, one row per dealer work order + VIN (the -1 / -2 claims of one
 *    work order share a row). With spec.revenue the row also shows what was paid to the sub-dealer and the dealer's revenue
 *    (the batch minus the labor approved, the same figure as "Work order by work order").
 *  spec.kind "parts": one row per part picked by spec.partFilter(part, claim).
 */
export default function DrillDown({ spec, data, workOrders, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [q, setQ] = useState("");
  const searchRef = useRef(null);
  useEffect(() => {
    // put the cursor in the search box on a computer (not on a phone, where it would pop the keyboard up)
    if (window.matchMedia?.("(hover: hover)").matches) searchRef.current?.focus();
  }, []);

  const claimById = useMemo(() => new Map((data?.claimList || []).map((c) => [c.id, c])), [data]);
  const byKey = useMemo(() => new Map((workOrders?.rows || []).map((r) => [r.key, r])), [workOrders]);

  const content = useMemo(() => {
    if (spec.kind === "parts") {
      const rows = (data?.partList || []).map((p) => ({ p, c: claimById.get(p.c) })).filter((x) => x.c && spec.partFilter(x.p, x.c));
      rows.sort((a, b) => (a.c.dwo || "").localeCompare(b.c.dwo || "") || a.p.name.localeCompare(b.p.name));
      const hit = textMatcher(q);
      return { all: rows.length, parts: rows.filter(({ p, c }) => hit([c.dwo, c.wo, c.n, c.vin, p.name])) };
    }
    const groups = new Map();
    for (const c of (data?.claimList || []).filter(spec.claimFilter)) {
      const g = groups.get(c.k) || { key: c.k, claims: [] };
      g.claims.push(c);
      groups.set(c.k, g);
    }
    const rows = [...groups.values()].map((g) => {
      const la = g.claims.filter((c) => c.la != null);
      return { ...g, paid: la.length ? la.reduce((s, c) => s + c.la, 0) : null, dealer: byKey.get(g.key)?.dealerRevenue ?? null };
    });
    rows.sort((a, b) => (a.claims[0].dwo || "~").localeCompare(b.claims[0].dwo || "~") || a.claims[0].n.localeCompare(b.claims[0].n));
    const hit = textMatcher(q);
    return { all: rows.length, groups: rows.filter((g) => hit(g.claims.flatMap((c) => [c.dwo, c.wo, c.n, c.vin, STATUS[c.st]?.label, c.st]))) };
  }, [spec, data, claimById, byKey, q]);

  const loadingMoney = spec.revenue && workOrders === undefined;
  const count = content.parts ? content.parts.length : content.groups.length;
  const noun = content.parts ? (count === 1 ? "part" : "parts") : count === 1 ? "work order" : "work orders";
  const paidTotal = content.groups ? content.groups.reduce((s, g) => s + (g.paid || 0), 0) : 0;
  const withDealer = content.groups ? content.groups.filter((g) => g.dealer != null) : [];
  const dealerTotal = withDealer.reduce((s, g) => s + g.dealer, 0);
  const noBatch = content.groups ? content.groups.length - withDealer.length : 0; // work orders with no dealer revenue (yet)

  const empty = <span className="text-[#6E6E6E]">—</span>;
  // No revenue figure is shown as 0: it says why it is missing (no dealer work order yet, or the claims batch has nothing on it yet).
  const missing = (g) => {
    const why = !g.claims.some((c) => c.dwo) ? "No dealer WO yet" : workOrders === null || workOrders?.batchAvailable === false ? "Batch not available" : "Batch not updated yet";
    return <span className="text-[0.6875rem] font-semibold text-[#8F5500] bg-[#FCF1DA] rounded-full px-2 py-0.5 whitespace-nowrap">{why}</span>;
  };
  const woCell = (c) => c || <span className="font-sans font-normal text-[#6E6E6E]">not yet</span>;

  return (
    <div className="print:hidden fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/45" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={spec.title} className="bg-white w-full sm:max-w-4xl max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-black text-[#111111]">{spec.title}</h2>
            <p className="mt-0.5 text-xs text-[#6E6E6E]">
              {q.trim() ? `${count} of ${content.all}` : count} {noun}
              {spec.subtitle ? ` · ${spec.subtitle}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="tap-icon shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#4D4D4D] hover:bg-[#F1F2F4]">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-3">
          <label className="flex items-center gap-2 rounded-full border border-[#E4E4E8] bg-[#FAFAFB] px-3.5 py-2 focus-within:border-[#111111] transition-colors">
            <Search size={15} className="shrink-0 text-[#6E6E6E]" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={content.parts ? "Search work order, claim, part or VIN" : "Search work order, claim, VIN or status"}
              aria-label="Search this list"
              className="w-full bg-transparent text-sm text-[#111111] placeholder:text-[#ADADAD] focus:outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="shrink-0 text-[#6E6E6E] hover:text-[#111111]">
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        <div className="overflow-auto px-5 sm:px-6 pb-5">
          {count === 0 ? (
            <p className="py-10 text-center text-sm text-[#6E6E6E]">{q.trim() ? "Nothing matches that search." : "Nothing here."}</p>
          ) : content.parts ? (
            <table className="w-full min-w-[40rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#ECECEC] text-[0.6875rem] font-bold uppercase tracking-wide text-[#6E6E6E]">
                  <th className="py-2 pr-3">Dealer WO</th>
                  <th className="py-2 pr-3">Sub-dealer WO</th>
                  <th className="py-2 pr-3">Part</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2">Claim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {content.parts.map(({ p, c }, i) => (
                  <tr key={`${p.c}-${i}`} className="align-top">
                    <td className="py-2.5 pr-3 font-mono font-semibold whitespace-nowrap text-[#111111]">{woCell(c.dwo)}</td>
                    <td className="py-2.5 pr-3 font-mono whitespace-nowrap text-[#6E6E6E]">{c.wo || "—"}</td>
                    <td className="py-2.5 pr-3 font-semibold text-[#262626]">{p.name}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{p.qty}</td>
                    <td className="py-2.5 whitespace-nowrap">
                      <Link href={`/claims/${c.id}`} className="font-bold text-[#E4002B] hover:underline">
                        {c.n}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={`w-full text-left text-[13px] ${spec.revenue ? "min-w-[46rem]" : "min-w-[34rem]"}`}>
              <thead>
                <tr className="border-b border-[#ECECEC] text-[0.6875rem] font-bold uppercase tracking-wide text-[#6E6E6E]">
                  <th className="py-2 pr-3">Dealer WO</th>
                  <th className="py-2 pr-3">Sub-dealer WO</th>
                  <th className="py-2 pr-3">Claim</th>
                  <th className="py-2 pr-3">Status</th>
                  {spec.revenue && <th className="py-2 pr-3 text-right">Sub-dealer revenue</th>}
                  {spec.revenue && <th className="py-2 text-right">Dealer revenue</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {content.groups.map((g) => (
                  <tr key={g.key} className="align-top">
                    <td className="py-2.5 pr-3 font-mono font-semibold whitespace-nowrap text-[#111111]">{uniq(g.claims.map((c) => c.dwo)).join(", ") || woCell(null)}</td>
                    <td className="py-2.5 pr-3 font-mono whitespace-nowrap text-[#6E6E6E]">{uniq(g.claims.map((c) => c.wo)).join(", ") || "—"}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {g.claims.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && ", "}
                          <Link href={`/claims/${c.id}`} className="font-bold text-[#E4002B] hover:underline">
                            {c.n}
                          </Link>
                        </span>
                      ))}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">{uniq(g.claims.map((c) => c.st)).map(statusPill)}</div>
                    </td>
                    {spec.revenue && <td className="py-2.5 pr-3 text-right tabular-nums">{g.paid != null ? num(g.paid) : empty}</td>}
                    {spec.revenue && (
                      <td className={`py-2.5 text-right font-bold tabular-nums ${g.dealer != null && g.dealer < 0 ? "text-[#B23A32]" : "text-[#111111]"}`}>
                        {loadingMoney ? <span className="font-normal text-[#6E6E6E]">…</span> : g.dealer != null ? num(g.dealer) : missing(g)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {spec.revenue && (
                <tfoot>
                  <tr className="border-t-2 border-[#ECECEC] font-black text-[#111111]">
                    <td className="pt-3 pr-3" colSpan={4}>
                      Total
                    </td>
                    <td className="pt-3 pr-3 text-right tabular-nums">{num(paidTotal)}</td>
                    <td className="pt-3 text-right tabular-nums">
                      {loadingMoney ? "…" : withDealer.length ? num(dealerTotal) : <span className="text-xs font-semibold text-[#6E6E6E]">Not available yet</span>}
                      {!loadingMoney && withDealer.length > 0 && noBatch > 0 && (
                        <div className="text-[0.6875rem] font-normal text-[#6E6E6E]">
                          {noBatch} work order{noBatch === 1 ? "" : "s"} not counted yet
                        </div>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          {spec.revenue && (
            <p className="mt-3 text-[0.6875rem] text-[#6E6E6E] leading-relaxed">
              Amounts in SAR. Sub-dealer revenue = the labor approved to the sub-dealer (VAT incl.). Dealer revenue = what the claims batch pays for the work order minus that labor. Where the batch has nothing on the work order yet, no figure is shown (and none is added to the total).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
