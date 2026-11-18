"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Small chart pieces for the home dashboard, drawn with plain HTML and SVG (no chart library). Everything animates in when it
// first appears: bars grow up from the baseline, rings sweep round, numbers count up from zero. Colours that must follow the
// light / dark appearance use `currentColor` or the page's own classes.

const EASE = [0.22, 1, 0.36, 1];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-08" -> "Aug" (and the year when it is a January or the first month shown). */
export const monthLabel = (key, withYear = false) => {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1];
};

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up from zero to `value` (instantly when the person asked for less motion). `format` draws it. */
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString("en-US"), duration = 1000, delay = 0 }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(() => (typeof window === "undefined" ? target : 0));
  useEffect(() => {
    if (reducedMotion()) return setShown(target);
    let raf;
    const t0 = performance.now() + delay * 1000;
    const tick = (now) => {
      if (now < t0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, (now - t0) / duration);
      setShown(target * (1 - Math.pow(1 - p, 3))); // ease out: fast at first, settles on the number
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return <span className="tabular-nums">{format(Number.isInteger(target) ? Math.round(shown) : shown)}</span>; // whole numbers stay whole while counting
}

/** Vertical bars, one per month. The newest bar is the strong colour. */
export function ColumnChart({ data, color = "#E4002B", format = (v) => v, height = 150, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={ariaLabel || "Bar chart"} className="flex items-end gap-1.5 sm:gap-2" style={{ height: height + 34 }}>
      {data.map((d, i) => {
        const last = i === data.length - 1;
        const h = Math.max(d.value > 0 ? 4 : 0, Math.round((d.value / max) * height));
        const delay = 0.25 + i * 0.07;
        return (
          <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${d.label}: ${format(d.value)}`}>
            <span className={`mb-1 text-[0.6875rem] font-bold tabular-nums ${d.value ? "text-[#111111]" : "text-[#ADADAD]"}`}>
              <CountUp value={d.value} format={format} delay={delay} duration={900} />
            </span>
            <motion.div
              className="w-full rounded-t-lg rounded-b-sm"
              initial={{ height: 0 }}
              animate={{ height: h }}
              transition={{ duration: 0.85, delay, ease: EASE }}
              style={{ background: last ? color : `color-mix(in srgb, ${color} 38%, transparent)` }}
            />
            <span className={`mt-1.5 text-[0.6875rem] ${last ? "font-bold text-[#111111]" : "text-[#6E6E6E]"}`}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A ring split into slices. `center` is the big text in the middle: { value, label, format? } (a number counts up). */
export function Donut({ slices, size = 150, thickness = 16, center, ariaLabel }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const live = slices.filter((x) => x.value > 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel || "Ring chart"} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth={thickness} />
        {total > 0 &&
          live.map((s, i) => {
            const len = (s.value / total) * c;
            const gap = live.length > 1 ? 3 : 0;
            const el = (
              <motion.circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDashoffset={-offset}
                initial={{ strokeDasharray: `0 ${c}` }}
                animate={{ strokeDasharray: `${Math.max(len - gap, 0.5)} ${c}` }}
                transition={{ duration: 0.9, delay: 0.2 + i * 0.12, ease: EASE }}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </motion.circle>
            );
            offset += len;
            return el;
          })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <div className="text-2xl font-black text-[#111111] leading-none tabular-nums">
            {typeof center.value === "number" ? <CountUp value={center.value} format={center.format} delay={0.3} /> : center.value}
          </div>
          {center.label && <div className="mt-1 text-[0.6875rem] font-semibold text-[#6E6E6E]">{center.label}</div>}
        </div>
      )}
    </div>
  );
}

/** One progress ring (a share out of 100%). */
export function Ring({ value, color = "#E4002B", size = 132, thickness = 14, label }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <Donut
      size={size}
      thickness={thickness}
      slices={[{ label: label || "Share", value: pct, color }, { label: "Rest", value: 1 - pct, color: "transparent" }]}
      center={{ value: value == null ? "—" : pct * 100, format: (v) => `${Math.round(v)}%`, label }}
      ariaLabel={`${label || "Share"}: ${value == null ? "no data" : `${Math.round(pct * 100)} percent`}`}
    />
  );
}

/** Horizontal bars with a label and a value on each. They grow from the left and the values count up. */
export function HBars({ rows, color = "#E4002B", format = (v) => v, emptyText = "Nothing yet." }) {
  if (!rows.length) return <p className="text-sm text-[#6E6E6E]">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold text-[#262626] truncate" title={r.label}>
              {r.label}
            </span>
            <span className="font-bold text-[#111111] tabular-nums shrink-0">
              <CountUp value={r.value} format={format} delay={0.2 + i * 0.07} />
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[#E0E0E0] overflow-hidden">
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.07, ease: EASE }} style={{ background: r.color || color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
