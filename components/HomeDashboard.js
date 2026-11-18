"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, ClipboardList, Timer, Wallet, Landmark, AlertCircle, Receipt } from "lucide-react";
import { ColumnChart, Donut, Ring, HBars, monthLabel } from "@/components/charts";

const RANGES = [
  ["3", "3 months"],
  ["6", "6 months"],
  ["12", "12 months"],
  ["all", "All time"],
];

const num = (n, digits = 0) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sar = (n, digits = 0) => `SAR ${num(n, digits)}`;
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
/** 31.5 hours -> "31.5 h"; 350 hours -> "14.6 d". */
const span = (hours) => (hours == null ? "—" : hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short" }) : "—");

const ease = [0.23, 1, 0.32, 1];
const rise = (i = 0) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay: Math.min(i, 10) * 0.045, ease } });

/** A white card with a title, used for every widget. */
function Card({ title, subtitle, action, className = "", children, index = 0 }) {
  return (
    <motion.section {...rise(index)} className={`bg-white border border-[#ECECEC] rounded-[1.25rem] p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#111111]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#6E6E6E]">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}

/** A big number on a softly tinted card. */
function StatCard({ label, value, note, tint, Icon, index }) {
  return (
    <motion.div {...rise(index)} className="tint rounded-[1.25rem] p-5" style={{ "--tint": tint }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#4D4D4D]">{label}</span>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ color: tint, background: `color-mix(in srgb, ${tint} 16%, transparent)` }}>
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 text-[1.6rem] leading-none font-black text-[#111111] tabular-nums">{value}</div>
      <div className="mt-2 text-xs text-[#6E6E6E]">{note}</div>
    </motion.div>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`skeleton rounded-[1.25rem] ${className}`} />;
}

export default function HomeDashboard({ profile }) {
  const [range, setRange] = useState("6");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [revenue, setRevenue] = useState(undefined); // undefined = loading, null = could not be read, otherwise the branch rows

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    fetch(`/api/analytics?range=${range}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [range]);

  // The money comes from the self-audit system too, so it takes a few seconds: it fills in on its own.
  useEffect(() => {
    let alive = true;
    fetch("/api/revenue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setRevenue(d.rows || []))
      .catch(() => alive && setRevenue(null));
    return () => {
      alive = false;
    };
  }, []);

  return <HomeView profile={profile} range={range} setRange={setRange} data={data} failed={failed} revenue={revenue} />;
}

/** The page itself, from the numbers it is given (so it can be drawn from sample data too). */
export function HomeView({ profile, range, setRange, data, failed, revenue }) {
  const first = (profile?.full_name || "").split(/\s+/)[0];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // revenue, added up over the branches
  const sum = (key) => (revenue || []).reduce((s, r) => s + Number(r[key] || 0), 0);
  const known = (key) => (revenue || []).every((r) => r[key] != null);
  const branchName = revenue && revenue.length === 1 ? revenue[0].branch_name : "the branches";
  const toBranch = sum("warranty_total") + sum("free_service_total");
  const labor = sum("dealer_revenue");
  const parts = known("parts_revenue") ? sum("parts_revenue") : null;
  const free = known("fs_revenue") ? sum("fs_revenue") : null;
  const dealerTotal = labor + (parts || 0) + (free || 0);

  return (
    <div className="max-w-[88rem] mx-auto px-4 sm:px-6 py-5 sm:py-7">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl sm:text-[1.7rem] font-black text-[#111111] leading-tight">
            {greeting}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="mt-1 text-sm text-[#6E6E6E]">Sub-dealer analytics: how the claims, the money and the time are going.</p>
        </div>
        <div role="group" aria-label="Period" className="flex items-center gap-1 bg-white border border-[#ECECEC] rounded-full p-1 text-xs">
          {RANGES.map(([key, label]) => (
            <button key={key} onClick={() => setRange(key)} aria-pressed={range === key} className={`px-3.5 py-1.5 rounded-full font-bold transition-colors ${range === key ? "bg-[#111111] text-white" : "text-[#4D4D4D] hover:text-[#111111]"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <div role="alert" className="mb-5 text-sm rounded-2xl border p-4 flex items-start gap-2 bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> The numbers could not be loaded. Refresh the page.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem] gap-5 items-start">
        <div className="min-w-0 space-y-5">
          {/* the four big numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {revenue === undefined ? (
              <>
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
              </>
            ) : (
              <>
                <StatCard index={0} Icon={Wallet} tint="#E4002B" label={`Revenue to ${branchName}`} value={revenue === null || !revenue.length ? "—" : sar(toBranch)} note="Closed claims and Free Service, VAT incl." />
                <StatCard index={1} Icon={Landmark} tint="#F29D38" label="Dealer revenue" value={revenue === null || !revenue.length ? "—" : sar(dealerTotal)} note="Labor + parts + Free Service" />
              </>
            )}
            {data ? (
              <>
                <StatCard index={2} Icon={ClipboardList} tint="#5B6270" label="Claims" value={num(data.totals.claims)} note={`${data.totals.open} open · ${data.totals.closed} closed · ${data.totals.rejected} rejected`} />
                <StatCard index={3} Icon={Timer} tint="#2E9E5B" label="Average lead time" value={span(data.totals.avgLeadHours)} note={`Opened to closed, ${data.leadTimes.total.n} claims`} />
              </>
            ) : (
              <>
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
              </>
            )}
          </div>

          {!data ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <Skeleton className="lg:col-span-7 h-72" />
              <Skeleton className="lg:col-span-5 h-72" />
              <Skeleton className="lg:col-span-5 h-64" />
              <Skeleton className="lg:col-span-7 h-64" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <Card index={4} className="lg:col-span-7" title="Claims over time" subtitle="Claims the sub-dealer opened each month">
                <ColumnChart data={data.claimsPerMonth.map((m, i) => ({ label: monthLabel(m.month, i === 0 || m.month.endsWith("-01")), value: m.value }))} ariaLabel="Claims opened per month" />
              </Card>

              <Card index={5} className="lg:col-span-5" title="Where the claims stand" subtitle="Every claim by its stage">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <Donut size={148} thickness={17} slices={data.board} center={{ value: data.totals.claims, label: "claims" }} ariaLabel="Claims by stage" />
                  <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
                    {data.board.map((b) => (
                      <li key={b.key} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                        <span className="text-[#4D4D4D] truncate">{b.label}</span>
                        <span className="ml-auto font-bold text-[#111111] tabular-nums">{b.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Card index={6} className="lg:col-span-5" title="First time right & rejection" subtitle="Of the claims the dealer has decided on">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <Ring value={data.quality.firstTimeRightRate} color="#2E9E5B" label="first time right" />
                  <dl className="flex-1 min-w-0 space-y-3 text-sm">
                    <Fact label="Decided on" value={num(data.quality.decided)} />
                    <Fact label="Sent back at least once" value={`${data.quality.returned} · ${pct(data.quality.returnedRate)}`} />
                    <Fact label="Rejected" value={`${data.quality.rejected} · ${pct(data.quality.rejectionRate)}`} tone="#E4002B" />
                  </dl>
                </div>
              </Card>

              <Card index={7} className="lg:col-span-7" title="Lead time, A to Z" subtitle="Average time of each step, from the sub-dealer opening a claim to the dealer closing it">
                <LeadTime lead={data.leadTimes} />
              </Card>

              <Card index={8} className="lg:col-span-5" title="Labor approved over time" subtitle="Approved to the sub-dealer each month (SAR, VAT incl.)">
                <ColumnChart color="#111111" format={(v) => num(v)} data={data.laborPerMonth.map((m, i) => ({ label: monthLabel(m.month, i === 0 || m.month.endsWith("-01")), value: m.value }))} ariaLabel="Labor approved per month" />
              </Card>

              <Card index={9} className="lg:col-span-7" title="Dealer revenue" subtitle="What the dealer earns on closed claims (all time)">
                {revenue === undefined ? (
                  <Skeleton className="h-40" />
                ) : revenue === null || !revenue.length ? (
                  <p className="text-sm text-[#6E6E6E]">The revenue figures are not available right now.</p>
                ) : (
                  <div className="space-y-4">
                    <HBars
                      format={(v) => sar(v)}
                      rows={[
                        { label: "Warranty labor (billed 180 SAR/h, paid 110 SAR/h)", value: labor, color: "#111111" },
                        { label: "Warranty parts", value: parts || 0, color: "#E4002B" },
                        { label: "Free Service (invoiced minus paid)", value: Math.max(free || 0, 0), color: "#F29D38" },
                      ]}
                    />
                    <div className="flex items-end justify-between gap-3 pt-3 border-t border-[#EEEEEE]">
                      <span className="text-xs text-[#6E6E6E]">
                        {sum("warranty_count")} warranty claims and {sum("free_service_count")} Free Service closed
                        {parts == null || free == null ? " · some figures are not available right now" : ""}
                      </span>
                      <span className="text-xl font-black text-[#111111] tabular-nums">{sar(dealerTotal)}</span>
                    </div>
                  </div>
                )}
              </Card>

              <Card index={10} className="lg:col-span-6" title="Most replaced parts" subtitle="By quantity on the claims">
                <HBars rows={data.topParts.map((p) => ({ label: p.name, value: p.qty }))} format={(v) => `${v}×`} emptyText="No parts on these claims yet." />
              </Card>

              <Card index={11} className="lg:col-span-6" title="Defective parts returned" subtitle="Closed claims: parts sent back to the dealer">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <Donut
                    size={132}
                    thickness={15}
                    slices={[
                      { label: "Returned", value: data.defected.returned, color: "#2E9E5B" },
                      { label: "Still at the sub-dealer", value: data.defected.pending, color: "#F29D38" },
                    ]}
                    center={{ value: data.defected.total ? `${Math.round((data.defected.returned / data.defected.total) * 100)}%` : "—", label: "returned" }}
                    ariaLabel="Defective parts returned"
                  />
                  <dl className="flex-1 min-w-0 space-y-3 text-sm">
                    <Fact label="Parts on closed claims" value={num(data.defected.total)} />
                    <Fact label="Back at the dealer" value={num(data.defected.returned)} tone="#2E9E5B" />
                    <Fact label="Still at the sub-dealer" value={num(data.defected.pending)} tone="#F29D38" />
                  </dl>
                </div>
              </Card>

              <Card index={12} className="lg:col-span-12" title="Latest closed work orders" subtitle="What was approved to the sub-dealer, and whether it is invoiced yet">
                <Recent rows={data.recent} />
              </Card>
            </div>
          )}
        </div>

        {/* the side panel: what waits for you */}
        <aside className="xl:sticky xl:top-5 space-y-5">
          <motion.section {...rise(2)} className="bg-white border border-[#ECECEC] rounded-[1.25rem] p-5">
            <h2 className="text-sm font-bold text-[#111111]">Needs your action</h2>
            <p className="mt-0.5 text-xs text-[#6E6E6E]">Right now</p>
            <ul className="mt-4 space-y-1.5">
              {(data?.actions || [null, null, null, null, null]).map((a, i) =>
                a ? (
                  <li key={a.key}>
                    <Link href={a.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${a.count > 0 ? "hover:bg-[#F4F4F4]" : "opacity-60 hover:opacity-100 hover:bg-[#F4F4F4]"}`}>
                      <span className={`min-w-8 h-8 px-2 rounded-lg flex items-center justify-center text-sm font-black tabular-nums ${a.count > 0 ? "bg-[#E4002B] text-white" : "bg-[#F1F2F4] text-[#6E6E6E]"}`}>{a.count}</span>
                      <span className="text-sm font-semibold text-[#262626] leading-snug">{a.label}</span>
                      <ArrowUpRight size={15} className="ml-auto text-[#ADADAD] group-hover:text-[#111111] transition-colors" aria-hidden="true" />
                    </Link>
                  </li>
                ) : (
                  <li key={i}>
                    <Skeleton className="h-12 !rounded-xl" />
                  </li>
                )
              )}
            </ul>
          </motion.section>
          <p className="px-2 text-[0.6875rem] text-[#6E6E6E] leading-relaxed">
            Figures count the claims opened in the period chosen above. Revenue is for all closed claims. Parts and Free Service figures come from the claims batch and the invoicing in the Self-Audit system.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F0F0F0] pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-[#6E6E6E]">{label}</dt>
      <dd className="font-black tabular-nums" style={{ color: tone || undefined }}>
        <span className={tone ? "" : "text-[#111111]"}>{value}</span>
      </dd>
    </div>
  );
}

/** Each step as a bar sized by its average, with the median beside it. */
function LeadTime({ lead }) {
  const max = Math.max(1, ...lead.steps.map((s) => s.avgHours || 0));
  return (
    <div>
      <ol className="space-y-3">
        {lead.steps.map((s, i) => (
          <li key={s.key} title={s.hint}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-[#262626]">
                <span className="text-[#ADADAD] mr-1.5">{i + 1}</span>
                {s.label}
              </span>
              <span className="text-[#6E6E6E] tabular-nums">
                <b className="text-[#111111]">{span(s.avgHours)}</b> average · {span(s.medianHours)} median{s.n ? ` · ${s.n}` : ""}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-[#E0E0E0] overflow-hidden">
              <div className="h-full rounded-full bg-[#E4002B] transition-[width] duration-500" style={{ width: `${s.avgHours ? Math.max(3, (s.avgHours / max) * 100) : 0}%`, opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 pt-3 border-t border-[#EEEEEE] flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-[#6E6E6E]">From opening to closing ({lead.total.n} claims)</span>
        <span className="text-lg font-black text-[#111111] tabular-nums">
          {span(lead.total.avgHours)} <span className="text-xs font-semibold text-[#6E6E6E]">average · {span(lead.total.medianHours)} median</span>
        </span>
      </div>
    </div>
  );
}

function Recent({ rows }) {
  if (!rows.length) return <p className="text-sm text-[#6E6E6E]">Nothing has been closed in this period.</p>;
  return (
    <ul className="divide-y divide-[#F0F0F0]">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/claims/${r.id}`} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-[#F7F7F7] transition-colors">
            <span className="w-9 h-9 rounded-xl bg-[#F1F2F4] flex items-center justify-center text-[#6E6E6E] shrink-0">
              <Receipt size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#111111] truncate">
                {r.claim_number} <span className="font-mono text-xs font-normal text-[#6E6E6E]">{[r.work_order, r.dealer_work_order].filter(Boolean).join(" / ")}</span>
              </span>
              <span className="block text-xs text-[#6E6E6E]">Closed {day(r.closed_at)}</span>
            </span>
            <span className="text-sm font-black text-[#111111] tabular-nums">{r.labor_amount == null ? "—" : sar(r.labor_amount, 2)}</span>
            <span className={`hidden sm:inline-flex px-2.5 py-1 rounded-full text-[0.6875rem] font-bold ${r.invoiced ? "bg-[#E5F3E8] text-[#1E6B35]" : "bg-[#FCF1DA] text-[#8F5500]"}`}>{r.invoiced ? "Invoiced" : "Not invoiced"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
