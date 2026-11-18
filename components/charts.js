// Small chart pieces for the home dashboard, drawn with plain HTML and SVG (no chart library). Colours that must follow the
// light / dark appearance use `currentColor` or the page's own classes.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-08" -> "Aug" (and the year when it is a January or the first month shown). */
export const monthLabel = (key, withYear = false) => {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1];
};

/** Vertical bars, one per month. The newest bar is the strong colour. */
export function ColumnChart({ data, color = "#E4002B", format = (v) => v, height = 150, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={ariaLabel || "Bar chart"} className="flex items-end gap-1.5 sm:gap-2" style={{ height: height + 34 }}>
      {data.map((d, i) => {
        const last = i === data.length - 1;
        const h = Math.max(d.value > 0 ? 4 : 0, Math.round((d.value / max) * height));
        return (
          <div key={d.label} className="group flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${d.label}: ${format(d.value)}`}>
            <span className={`mb-1 text-[0.6875rem] font-bold tabular-nums ${d.value ? "text-[#111111]" : "text-[#ADADAD]"}`}>{d.value ? format(d.value) : "0"}</span>
            <div className="w-full rounded-t-lg rounded-b-sm transition-[height] duration-500" style={{ height: h, background: last ? color : `color-mix(in srgb, ${color} 38%, transparent)` }} />
            <span className={`mt-1.5 text-[0.6875rem] ${last ? "font-bold text-[#111111]" : "text-[#6E6E6E]"}`}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A ring split into slices (or one value out of one). `center` is the big text in the middle. */
export function Donut({ slices, size = 150, thickness = 16, center, ariaLabel }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel || "Ring chart"} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth={thickness} />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * c;
              const gap = slices.filter((x) => x.value > 0).length > 1 ? 3 : 0;
              const el = (
                <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="butt" strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`} strokeDashoffset={-offset}>
                  <title>{`${s.label}: ${s.value}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <div className="text-2xl font-black text-[#111111] leading-none tabular-nums">{center.value}</div>
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
      center={{ value: value == null ? "—" : `${Math.round(pct * 100)}%`, label }}
      ariaLabel={`${label || "Share"}: ${value == null ? "no data" : `${Math.round(pct * 100)} percent`}`}
    />
  );
}

/** Horizontal bars with a label and a value on each. */
export function HBars({ rows, color = "#E4002B", format = (v) => v, emptyText = "Nothing yet." }) {
  if (!rows.length) return <p className="text-sm text-[#6E6E6E]">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold text-[#262626] truncate" title={r.label}>
              {r.label}
            </span>
            <span className="font-bold text-[#111111] tabular-nums shrink-0">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[#E0E0E0] overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color || color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
