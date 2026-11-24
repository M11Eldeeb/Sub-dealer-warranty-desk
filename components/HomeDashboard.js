"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, ClipboardList, Timer, Wallet, Landmark, AlertCircle, Receipt } from "lucide-react";
import { ColumnChart, Donut, Ring, HBars, CountUp, StaticProvider, useStatic, monthLabel } from "@/components/charts";
import { STATUS } from "@/lib/status-meta";
import { MessageCard, WeatherCard, CalendarCard } from "@/components/DailyWidgets";
import DrillDown from "@/components/DrillDown";

const RANGES = [
  ["1", "1 month"],
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

// A column that scrolls on its own on wide screens (the wheel over it moves only it); its scrollbar shows only while in use.
const SCROLL = "xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pr-1.5 xl:pb-2 fade-scroll";

/** Keeps a column's scrollbar visible while it scrolls (and a moment after), so it fades only when unused. */
function flashScrollbar(e) {
  const el = e.currentTarget;
  el.classList.add("is-scrolling");
  clearTimeout(el._fade);
  el._fade = setTimeout(() => el.classList.remove("is-scrolling"), 900);
}

const ease = [0.22, 1, 0.36, 1];
// Cards come up from the bottom of the screen one after another (like a story feed), then their numbers and charts fill in.
const rise = (i = 0) => ({ initial: { opacity: 0, y: 56 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.75, delay: Math.min(i, 12) * 0.08, ease } });

/** A white card with a title, used for every widget. */
function Card({ title, subtitle, action, className = "", children, index = 0 }) {
  const stat = useStatic();
  return (
    <motion.section {...(stat ? {} : rise(index))} className={`break-inside-avoid bg-white border border-[#ECECEC] rounded-[1.25rem] p-5 ${className}`}>
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
  const stat = useStatic();
  return (
    <motion.div {...(stat ? {} : rise(index))} className="break-inside-avoid tint rounded-[1.25rem] p-5" style={{ "--tint": tint }}>
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

/** The three requests behind the dashboard for a period: the analytics, the revenue (cached figures first) and the work orders. */
function useDashboardData(range) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [revenue, setRevenue] = useState(undefined); // undefined = loading, null = could not be read, otherwise the branch rows
  const [revenueFresh, setRevenueFresh] = useState(false); // the figures are the freshly worked-out ones (not only last time's)

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    fetch(`/api/analytics?range=${range}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setData(d);
        // the money figures worked out last time arrive in the same answer, so those cards appear with the others
        setRevenue((cur) => (cur === undefined && d.revenueCached ? d.revenueCached : cur));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [range]);

  // The money comes from the self-audit system too, so the fresh figures take a few seconds: they fill in on their own and the
  // numbers settle on them if anything changed.
  useEffect(() => {
    let alive = true;
    fetch("/api/revenue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (alive) {
          setRevenue(d.rows || []);
          setRevenueFresh(true);
        }
      })
      .catch(() => {
        if (alive) {
          setRevenue((cur) => (cur === undefined ? null : cur));
          setRevenueFresh(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // Work order by work order also asks the self-audit system (the claims batch), so it loads apart.
  const [workOrders, setWorkOrders] = useState(undefined); // undefined = loading, null = could not be read, otherwise { rows, batchAvailable }
  useEffect(() => {
    let alive = true;
    setWorkOrders(undefined);
    fetch(`/api/work-orders?range=${range}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setWorkOrders(d))
      .catch(() => alive && setWorkOrders(null));
    return () => {
      alive = false;
    };
  }, [range]);

  return { data, failed, revenue, revenueFresh, workOrders };
}

export default function HomeDashboard({ profile }) {
  const [range, setRange] = useState("6");
  const { data, failed, revenue, workOrders } = useDashboardData(range);
  return <HomeView profile={profile} range={range} setRange={setRange} data={data} failed={failed} revenue={revenue} workOrders={workOrders} />;
}

const RANGE_NAMES = { 1: "This month", 3: "Last 3 months", 6: "Last 6 months", 12: "Last 12 months", all: "All time" };
const fullMonth = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/**
 * The dashboard as a printable report (Export dashboard): the same cards without the navigation, the side widgets and the
 * click-through, finished and still, headed with the period and the export date. Opens the print window by itself once
 * everything is loaded; "Save as PDF" there gives the file.
 */
export function ReportDashboard({ range = "6" }) {
  const { data, failed, revenue, revenueFresh, workOrders } = useDashboardData(range);
  const ready = !!data && revenueFresh && workOrders !== undefined;
  const months = data?.months || [];
  const period = RANGE_NAMES[range] || RANGE_NAMES[6];
  const span = months.length ? (months.length === 1 ? fullMonth(months[0]) : `${fullMonth(months[0])} to ${fullMonth(months[months.length - 1])}`) : "";
  const exported = new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // light colours whatever the person's appearance, and the file name the print window suggests
  useEffect(() => {
    const root = document.documentElement;
    const before = { theme: root.getAttribute("data-theme"), look: root.getAttribute("data-look") };
    root.setAttribute("data-theme", "light");
    root.setAttribute("data-look", "new");
    return () => {
      before.theme ? root.setAttribute("data-theme", before.theme) : root.removeAttribute("data-theme");
      before.look ? root.setAttribute("data-look", before.look) : root.removeAttribute("data-look");
    };
  }, []);
  useEffect(() => {
    document.title = `Sub-dealer dashboard - ${period} - ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })}`;
  }, [period]);

  const printed = useRef(false);
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 900); // a moment for the charts and fonts to settle
    return () => clearTimeout(t);
  }, [ready]);

  return (
    <HomeView
      report={{ period, span, exported, ready, print: () => window.print() }}
      range={range}
      setRange={() => {}}
      data={ready ? data : null}
      failed={failed}
      revenue={ready ? revenue : undefined}
      workOrders={ready ? workOrders : undefined}
    />
  );
}

/**
 * On a wide screen the side widgets are shrunk, if need be, to the height of the window, so all three show without scrolling.
 * (CSS zoom re-flows the layout, so the cards simply get a little smaller.)
 */
function useFitHeight(outer, inner) {
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      if (!window.matchMedia("(min-width: 1280px)").matches) {
        i.style.zoom = "";
        return;
      }
      i.style.zoom = "1";
      const natural = i.offsetHeight;
      const cs = getComputedStyle(o);
      const room = o.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const z = Math.max(0.6, Math.min(1, room / natural));
      i.style.zoom = z < 1 ? String(Math.floor(z * 100) / 100) : "";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [outer, inner]);
}

/** The page itself, from the numbers it is given (so it can be drawn from sample data too). */
export function HomeView({ profile, range, setRange, data, failed, revenue, workOrders, weatherSample = null, report = null }) {
  // in the printed report nothing is clickable; in the interactive file (sent by e-mail) the charts open their lists like on the site
  const still = !!report && !report.interactive;
  const pick = (fn) => (still ? undefined : fn);
  // the list behind a chart (a bar, a slice or a part that was clicked), or null
  const [drill, setDrill] = useState(null);
  const longMonth = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const openMonth = (list, i, title, filterKey, revenue) => {
    const month = list[i].month;
    setDrill({ title: `${title} ${longMonth(month)}`, kind: "claims", revenue, claimFilter: (c) => c[filterKey] === month });
  };
  const openStage = (slice) => setDrill({ title: slice.label, subtitle: slice.key === "closed" ? "closed claims" : "", kind: "claims", revenue: slice.key === "closed", claimFilter: (c) => c.g === slice.key });
  const partClaimIds = (name) => new Set((data?.partList || []).filter((p) => p.name === name).map((p) => p.c));
  const asideRef = useRef(null);
  const asideInner = useRef(null);
  useFitHeight(asideRef, asideInner);
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

  const page = (
    // On a wide screen the page itself does not scroll: the middle cards and the side widgets are two columns that scroll apart.
    <div className={report ? "report-page w-full px-4 py-4" : "max-w-[88rem] mx-auto px-4 sm:px-6 py-5 sm:py-7 xl:h-[100dvh] xl:flex xl:flex-col xl:pt-4 xl:pb-4"}>
      {report && (
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5 pb-4 border-b border-[#E4E4E8]">
          <div className="flex items-center gap-3">
            <img src={report.logo || "/mg-logo.png"} alt="" width="40" height="40" className="w-10 h-10 rounded-xl bg-white border border-[#ECECEC] p-1" />
            <div>
              <h1 className="text-xl font-black text-[#111111] leading-tight">Sub-dealer dashboard</h1>
              <p className="text-xs text-[#6E6E6E]">How the claims, the money and the time are going</p>
            </div>
          </div>
          <div className="text-right text-xs text-[#4D4D4D]">
            <div className="text-sm font-black text-[#111111]">
              {report.period}
              {report.span ? ` · ${report.span}` : ""}
            </div>
            <div className="mt-0.5">Exported {report.exported}</div>
            {report.revenueAt && <div className="mt-0.5">Revenue figures as of {report.revenueAt}</div>}
            {report.interactive && <div className="print:hidden mt-1 text-[#6E6E6E]">Click a bar, a slice or a part to see its work orders.</div>}
            <button type="button" onClick={report.print} disabled={!report.ready} className="print:hidden mt-2 px-4 py-2 rounded-full bg-[#111111] text-white text-xs font-bold disabled:opacity-40">
              {report.ready ? "Save as PDF / Print" : "Preparing the report…"}
            </button>
          </div>
        </div>
      )}
      <div className={`flex items-start justify-between gap-4 flex-wrap mb-6 xl:mb-4 xl:shrink-0 ${report ? "hidden" : ""}`}>
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
        <div role="alert" className="mb-5 xl:shrink-0 text-sm rounded-2xl border p-4 flex items-start gap-2 bg-[#FDEBE0] border-[#F2C9A8] text-[#C4551B]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> The numbers could not be loaded. Refresh the page.
        </div>
      )}

      <div className={report ? "grid grid-cols-1 gap-5" : "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem] xl:grid-rows-[minmax(0,1fr)] gap-5 items-start xl:items-stretch xl:flex-1 xl:min-h-0"}>
        <div onScroll={report ? undefined : flashScrollbar} className={`min-w-0 space-y-5 ${report ? "" : SCROLL}`}>
          {/* the four big numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {revenue === undefined ? (
              <>
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
              </>
            ) : (
              <>
                <StatCard index={0} Icon={Wallet} tint="#E4002B" label={`Revenue to ${branchName}`} value={revenue === null || !revenue.length ? "—" : <CountUp value={toBranch} format={sar} />} note="Closed claims and Free Service, VAT incl." />
                <StatCard index={1} Icon={Landmark} tint="#F29D38" label="Dealer revenue" value={revenue === null || !revenue.length ? "—" : <CountUp value={dealerTotal} format={sar} />} note="Labor + parts + Free Service" />
              </>
            )}
            {data ? (
              <>
                <StatCard index={2} Icon={ClipboardList} tint="#5B6270" label="Claims" value={<CountUp value={data.totals.claims} />} note={`${data.totals.open} open · ${data.totals.closed} closed · ${data.totals.rejected} rejected`} />
                <StatCard index={3} Icon={Timer} tint="#2E9E5B" label="Average lead time" value={data.totals.avgLeadHours == null ? "—" : <CountUp value={data.totals.avgLeadHours} format={span} />} note={`All steps added up, ${data.leadTimes.total.n} closed claims`} />
              </>
            ) : (
              <>
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
              </>
            )}
          </div>

          {/* what waits for you */}
          {/* (not in the printed report: it is analytics only) */}
          <motion.section {...rise(4)} className={`bg-white border border-[#ECECEC] rounded-[1.25rem] p-5 ${report ? "hidden" : ""}`}>
            <h2 className="text-sm font-bold text-[#111111]">Needs your action</h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {(data?.actions || [null, null, null, null]).map((a, i) =>
                a ? (
                  <li key={a.key}>
                    <Link href={a.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 bg-[#F7F7F8] hover:bg-[#EFEFF1] transition-colors ${a.count > 0 ? "" : "opacity-60 hover:opacity-100"}`}>
                      <span className={`min-w-8 h-8 px-2 rounded-lg flex items-center justify-center text-sm font-black tabular-nums ${a.count > 0 ? "bg-[#E4002B] text-white" : "bg-white text-[#6E6E6E]"}`}>{a.count}</span>
                      <span className="text-[0.8125rem] font-semibold text-[#262626] leading-snug">{a.label}</span>
                      <ArrowUpRight size={14} className="ml-auto shrink-0 text-[#ADADAD] group-hover:text-[#111111] transition-colors" aria-hidden="true" />
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

          {!data ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <Skeleton className="lg:col-span-7 h-72" />
              <Skeleton className="lg:col-span-5 h-72" />
              <Skeleton className="lg:col-span-5 h-64" />
              <Skeleton className="lg:col-span-7 h-64" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <Card index={4} className="lg:col-span-7" title="Claims over time" subtitle={`Claims the sub-dealer opened each month${still ? "" : " · click a month to see them"}`}>
                <ColumnChart onSelect={pick((i) => openMonth(data.claimsPerMonth, i, "Claims opened in", "cm", true))} data={data.claimsPerMonth.map((m, i) => ({ label: monthLabel(m.month, i === 0 || m.month.endsWith("-01")), value: m.value }))} ariaLabel="Claims opened per month" />
              </Card>

              <Card index={5} className="lg:col-span-5" title="Where the claims stand" subtitle="Every claim by its stage">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <Donut size={148} thickness={17} slices={data.board} onSelect={pick((s) => openStage(s))} center={{ value: data.totals.claims, label: "claims" }} ariaLabel="Claims by stage" />
                  <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
                    {data.board.map((b) => (
                      <li key={b.key}>
                        <button type="button" onClick={pick(() => openStage(b))} title={still ? undefined : "Click to see the work orders"} className="w-full flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 text-left hover:bg-black/[0.04] transition-colors">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                          <span className="text-[#4D4D4D] truncate">{b.label}</span>
                          <span className="ml-auto font-bold text-[#111111] tabular-nums">{b.value}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Card index={6} className="lg:col-span-5" title="First time right & rejection" subtitle="Of the claims the dealer has decided on">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <Ring value={data.quality.firstTimeRightRate} color="#2E9E5B" restColor="#F29D38" label="first time right" onSelect={pick((key) => setDrill(key === "share" ? { title: "First time right", subtitle: "approved with no sending back or rejection", kind: "claims", revenue: false, claimFilter: (c) => c.q === "right" } : { title: "Not first time right", subtitle: "sent back or rejected at least once", kind: "claims", revenue: false, claimFilter: (c) => c.q === "other" }))} />
                  <dl className="flex-1 min-w-0 space-y-3 text-sm">
                    <Fact label="Decided on" value={<CountUp value={data.quality.decided} />} />
                    <Fact label="Sent back at least once" value={`${data.quality.returned} · ${pct(data.quality.returnedRate)}`} />
                    <Fact label="Rejected" value={`${data.quality.rejected} · ${pct(data.quality.rejectionRate)}`} tone="#E4002B" />
                  </dl>
                </div>
              </Card>

              <Card index={7} className="lg:col-span-7" title="Lead time, A to Z">
                <LeadTime lead={data.leadTimes} />
              </Card>

              <Card index={8} className="lg:col-span-5" title="Labor approved over time" subtitle={`Approved to the sub-dealer each month (SAR, VAT incl.)${still ? "" : " · click a month"}`}>
                <ColumnChart onSelect={pick((i) => openMonth(data.laborPerMonth, i, "Labor approved in", "dm", true))} format={(v) => num(v)} data={data.laborPerMonth.map((m, i) => ({ label: monthLabel(m.month, i === 0 || m.month.endsWith("-01")), value: m.value }))} ariaLabel="Labor approved per month" />
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
                      <span className="text-xl font-black text-[#111111] tabular-nums"><CountUp value={dealerTotal} format={sar} delay={0.4} /></span>
                    </div>
                  </div>
                )}
              </Card>

              <Card index={10} className="lg:col-span-6" title="Most replaced parts" subtitle={`By quantity on the claims${still ? "" : " · click a part"}`}>
                <HBars onSelect={pick((row) => { const ids = partClaimIds(row.label); setDrill({ title: row.label, subtitle: "claims that replaced it", kind: "claims", revenue: true, claimFilter: (c) => ids.has(c.id) }); })} rows={data.topParts.map((p) => ({ label: p.name, value: p.qty }))} format={(v) => `${v}×`} emptyText="No parts on these claims yet." />
              </Card>

              <Card index={11} className="lg:col-span-6" title="Defective parts returned" subtitle="Closed claims: parts sent back to the dealer">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <Donut
                    size={132}
                    thickness={15}
                    slices={[
                      { key: "returned", label: "Returned", value: data.defected.returned, color: "#2E9E5B" },
                      { key: "pending", label: "Still at the sub-dealer", value: data.defected.pending, color: "#F29D38" },
                    ]}
                    onSelect={pick((s) => setDrill({ title: s.key === "returned" ? "Parts returned to the dealer" : "Parts still at the sub-dealer", subtitle: "on closed claims", kind: "parts", partFilter: (p, c) => c.st === "closed" && p.back === (s.key === "returned") }))}
                    center={{ value: data.defected.total ? (data.defected.returned / data.defected.total) * 100 : "—", format: (v) => `${Math.round(v)}%`, label: "returned" }}
                    ariaLabel="Defective parts returned"
                  />
                  <dl className="flex-1 min-w-0 space-y-3 text-sm">
                    <Fact label="Parts on closed claims" value={<CountUp value={data.defected.total} />} />
                    <Fact label="Back at the dealer" value={<CountUp value={data.defected.returned} />} tone="#2E9E5B" />
                    <Fact label="Still at the sub-dealer" value={<CountUp value={data.defected.pending} />} tone="#F29D38" />
                  </dl>
                </div>
              </Card>

              <Card index={12} className="lg:col-span-12" title="Work order by work order" subtitle="Each work order next to what the dealer's claims batch holds for the same car" action={workOrders?.rows ? <span className="px-2.5 py-1 rounded-full bg-[#F1F2F4] text-[0.6875rem] font-bold text-[#6E6E6E]">{workOrders.rows.length} work orders</span> : null}>
                {workOrders === undefined ? <Skeleton className="h-48" /> : workOrders === null ? <p className="text-sm text-[#6E6E6E]">The work orders could not be loaded right now.</p> : <WorkOrders data={workOrders} />}
              </Card>

              <Card index={13} className="lg:col-span-12" title="Latest closed work orders" subtitle="What was approved to the sub-dealer, and whether it is invoiced yet">
                <Recent rows={data.recent} />
              </Card>
            </div>
          )}
          <p className="px-2 pb-2 text-[0.6875rem] text-[#6E6E6E] leading-relaxed">
            Figures count the claims opened in the period shown. Revenue is for all closed claims. Parts and Free Service figures come from the claims batch and the invoicing in the Self-Audit system.
          </p>
        </div>

        {/* the side panel: today's reminder, the weather and the calendar, all in view */}
        <aside ref={asideRef} onScroll={flashScrollbar} className={`${SCROLL} ${report ? "hidden" : ""}`}>
          <div ref={asideInner} className="space-y-2.5">
          <MessageCard index={1} closedThisWeek={data?.closedThisWeek ?? null} waiting={data ? data.actions.reduce((s, a) => s + a.count, 0) : null} />
          <WeatherCard index={2} sample={weatherSample} />
          <CalendarCard index={3} />
          </div>
        </aside>
      </div>
      {drill && data && !still && <DrillDown spec={drill} data={data} workOrders={workOrders} onClose={() => setDrill(null)} />}
    </div>
  );
  return report ? <StaticProvider value={true}>{page}</StaticProvider> : page;
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
  const stat = useStatic();
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
                <b className="text-[#111111]">{span(s.avgHours)}</b> average · {span(s.medianHours)} median{s.n ? ` · ${s.n}${s.working ? " replies" : ""}` : ""}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-[#E0E0E0] overflow-hidden">
              <motion.div className="h-full rounded-full bg-[#E4002B]" initial={stat ? false : { width: 0 }} animate={{ width: `${s.avgHours ? Math.max(3, (s.avgHours / max) * 100) : 0}%` }} transition={{ duration: 0.85, delay: 0.25 + i * 0.09, ease }} style={{ opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 pt-3 border-t border-[#EEEEEE] flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs font-semibold text-[#6E6E6E]">Total, all steps added up ({lead.total.n} claims)</span>
        <span className="text-lg font-black text-[#111111] tabular-nums whitespace-nowrap">
          {span(lead.total.avgHours)} <span className="text-xs font-semibold text-[#6E6E6E]">average · {span(lead.total.medianHours)} median</span>
        </span>
      </div>
    </div>
  );
}

const statusPill = (s) => {
  const spec = STATUS[s];
  return (
    <span key={s} className="pill inline-flex px-2 py-0.5 rounded-full text-[0.6875rem] font-bold whitespace-nowrap" style={{ "--pill-fg": spec?.color || "#656970", "--pill-bg": spec?.bg || "#F1F2F4" }}>
      {spec?.label || s}
    </span>
  );
};

/** One row per dealer work order and VIN: the sub-dealer's side, the batch's side, and what the dealer is left with. */
function WorkOrders({ data }) {
  const stat = useStatic();
  const [showAll, setAll] = useState(false);
  const all = showAll || stat;
  const { rows, batchAvailable } = data;
  if (!rows.length) return <p className="text-sm text-[#6E6E6E]">No claims in this period.</p>;
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[54rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#ECECEC] text-[0.6875rem] font-bold uppercase tracking-wide text-[#6E6E6E]">
              <th className="py-2 pr-3">Dealer WO</th>
              <th className="py-2 pr-3">Sub-dealer WO</th>
              <th className="py-2 pr-3">Opened</th>
              <th className="py-2 pr-3">Sub-dealer status</th>
              <th className="py-2 pr-3 text-right">Settled with sub-dealer</th>
              <th className="py-2 pr-3 text-right">Paid on the batch</th>
              <th className="py-2 pr-3">Batch status</th>
              <th className="py-2 text-right">Revenue to dealer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {shown.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="py-2.5 pr-3 font-mono font-semibold whitespace-nowrap text-[#111111]">
                  {r.claimId ? (
                    <Link href={`/claims/${r.claimId}`} className="hover:text-[#E4002B] transition-colors">
                      {r.workOrder || <span className="font-sans font-normal text-[#6E6E6E]">No dealer WO yet</span>}
                    </Link>
                  ) : (
                    r.workOrder || <span className="font-sans font-normal text-[#6E6E6E]">No dealer WO yet</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-[#6E6E6E]">{r.subWorkOrders.join(", ") || "—"}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-[#6E6E6E]">{day(r.created)}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex flex-wrap gap-1">{r.statuses.map(statusPill)}</div>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{r.approved != null ? num(r.approved, 2) : "—"}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {r.batch ? (
                    <>
                      {num(r.batch.sar, 2)}
                      <div className="text-[0.6875rem] text-[#6E6E6E]">${num(r.batch.usd, 2)}</div>
                    </>
                  ) : (
                    <span className="text-[#6E6E6E]">{!batchAvailable ? "not available" : r.workOrder ? "not on batch" : "—"}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  {r.batch?.statuses?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.batch.statuses.map((s) => (
                        <span key={s} className="inline-flex px-2 py-0.5 rounded-full text-[0.6875rem] font-bold whitespace-nowrap" style={/settled/i.test(s) ? { background: "#E5F3E8", color: "#1E6B35" } : { background: "#F1F2F4", color: "#656970" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`py-2.5 text-right font-bold tabular-nums ${r.dealerRevenue != null && r.dealerRevenue < 0 ? "text-[#B23A32]" : "text-[#111111]"}`}>{r.dealerRevenue != null ? num(r.dealerRevenue, 2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[0.6875rem] text-[#6E6E6E]">Amounts in SAR (batch dollars × 3.75). Revenue to dealer = paid on the batch minus the labor approved to the sub-dealer. A work order with several claims (-1, -2) is one row.</p>
      {rows.length > 12 && !stat && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-bold text-[#E4002B] hover:underline">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
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
