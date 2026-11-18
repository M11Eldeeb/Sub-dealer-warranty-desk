"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sun, Cloud, CloudSun, CloudRain, CloudDrizzle, CloudLightning, CloudFog, Snowflake, Wind, Droplets, ChevronLeft, ChevronRight, Sparkles, MapPin, CheckCircle2 } from "lucide-react";
import { CountUp } from "@/components/charts";

const ease = [0.22, 1, 0.36, 1];
const rise = (i = 0) => ({ initial: { opacity: 0, y: 56 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.75, delay: Math.min(i, 12) * 0.08, ease } });

// ---- the message of the day -----------------------------------------------------------------------------------------------

const MESSAGES = [
  "Live. Laugh. Love.",
  "Small steps every day add up to big results.",
  "Today is a good day to close a few claims.",
  "Calm minds fix more than rushed ones.",
  "You are doing better than you think.",
  "Progress, not perfection.",
  "Be the reason a customer drives away happy.",
  "Every claim solved is a driver back on the road.",
  "Start where you are. Use what you have. Do what you can.",
  "A good team makes hard days feel lighter.",
  "Kind words cost nothing and mean everything.",
  "Focus on the next right step.",
  "Great work is built one detail at a time.",
  "Smile. It changes the whole workshop.",
  "Gratitude turns a busy day into a good one.",
  "Your effort today is tomorrow's easy day.",
  "Done is better than perfect, and clear is better than done.",
  "Be patient with yourself, and generous with others.",
  "Hard days build the strongest teams.",
  "The best time to follow up was yesterday. The next best is now.",
  "Make today count.",
  "Good things take time. Keep going.",
  "You make complicated things simple. Thank you.",
  "Energy flows where focus goes.",
  "Courage is simply the next small action.",
  "Plant a good deed today and watch it grow.",
  "A tidy list is a calm mind.",
  "Every expert was once a beginner.",
  "Treat every claim like it belongs to someone you love.",
  "Quality is doing it right when no one is watching.",
  "Breathe. You have handled harder days than this.",
  "The little things are the big things.",
  "Choose joy, then get the work done.",
  "Teamwork turns promises into results.",
  "Be proud of how far you have come.",
  "Today's problems are tomorrow's stories.",
  "Honesty and speed make the best pair.",
  "Take a sip of water, stretch, and carry on.",
  "Be the calm in someone else's busy day.",
  "Each day is a fresh page. Write something good.",
  "Success is a habit, not a moment.",
  "Care about the details and the big picture will take care of itself.",
  "Respect the process; enjoy the result.",
  "A thankful heart finds a reason to smile everywhere.",
  "Dream big, start small, begin today.",
  "Work hard, be kind, and good things follow.",
  "You are the heart of this team.",
  "One clear message can save an hour of waiting.",
  "Celebrate the small wins. They add up.",
  "Stay curious, stay humble, stay moving.",
  "Live well. Laugh often. Love what you do.",
];

/** One message per day (the same all day for everyone), moving on at midnight Saudi time. */
function messageOfTheDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  return MESSAGES[dayNumber % MESSAGES.length];
}

/** The red hero card: a nice message for today, and where the day stands. */
export function MessageCard({ closedThisWeek, waiting, index = 0 }) {
  const text = messageOfTheDay();
  return (
    <motion.section
      {...rise(index)}
      className="relative overflow-hidden rounded-[1.25rem] p-4 text-white"
      style={{ background: "linear-gradient(140deg, #F2223F 0%, #C4001F 55%, #8F0016 100%)", boxShadow: "0 18px 36px -18px rgba(228,0,43,0.7)" }}
    >
      <span aria-hidden="true" className="absolute -right-8 -top-10 w-40 h-40 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -right-2 bottom-[-3.5rem] w-32 h-32 rounded-full bg-black/10" />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/75">
          <Sparkles size={13} aria-hidden="true" /> Today&apos;s reminder
        </div>
        <p className="mt-2 text-[1.2rem] leading-snug font-black tracking-tight">{text}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          {closedThisWeek != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1.5 backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.18)" }}>
              <CheckCircle2 size={13} aria-hidden="true" /> <CountUp value={closedThisWeek} delay={0.5} /> closed this week
            </span>
          )}
          {waiting != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: "rgba(0,0,0,0.22)" }}>
              <CountUp value={waiting} delay={0.6} /> waiting for you
            </span>
          )}
        </div>
      </div>
    </motion.section>
  );
}

// ---- the weather ---------------------------------------------------------------------------------------------------------

const CITY = { name: "Jeddah", lat: 21.4858, lon: 39.1925 };

// WMO weather codes (what Open-Meteo returns) -> an icon and a word
function describe(code) {
  if (code === 0) return { Icon: Sun, text: "Clear sky" };
  if (code === 1) return { Icon: Sun, text: "Mostly clear" };
  if (code === 2) return { Icon: CloudSun, text: "Partly cloudy" };
  if (code === 3) return { Icon: Cloud, text: "Cloudy" };
  if (code === 45 || code === 48) return { Icon: CloudFog, text: "Fog" };
  if (code >= 51 && code <= 57) return { Icon: CloudDrizzle, text: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { Icon: CloudRain, text: "Rain" };
  if (code >= 71 && code <= 77) return { Icon: Snowflake, text: "Snow" };
  if (code >= 95) return { Icon: CloudLightning, text: "Thunderstorm" };
  return { Icon: Cloud, text: "Cloudy" };
}

const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" });

/** Today's weather and the next days. Open-Meteo (free, no key); asked once every 15 minutes at most. `sample` is only for previews. */
export function WeatherCard({ index = 0, sample = null }) {
  const [w, setW] = useState(sample);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (sample) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem("weather") || "null");
      if (saved && Date.now() - saved.at < 15 * 60 * 1000) {
        setW(saved.data);
        return;
      }
    } catch {}
    let alive = true;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}` +
      "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FRiyadh&forecast_days=4";
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        const data = {
          temp: d.current.temperature_2m,
          humidity: d.current.relative_humidity_2m,
          wind: d.current.wind_speed_10m,
          code: d.current.weather_code,
          days: d.daily.time.map((t, i) => ({ date: t, code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i] })),
        };
        setW(data);
        try {
          sessionStorage.setItem("weather", JSON.stringify({ at: Date.now(), data }));
        } catch {}
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [sample]);

  const now = w ? describe(w.code) : null;
  return (
    <motion.section {...rise(index)} className="tint rounded-[1.25rem] p-4" style={{ "--tint": "#5B8DEF" }}>
      <div className="flex items-center justify-between text-xs font-bold text-[#4D4D4D]">
        <span className="flex items-center gap-1.5">
          <MapPin size={13} aria-hidden="true" /> {CITY.name}
        </span>
        <span className="text-[#6E6E6E] font-semibold">Weather</span>
      </div>
      {failed ? (
        <p className="mt-4 text-sm text-[#6E6E6E]">The weather is not available right now.</p>
      ) : !w ? (
        <div className="mt-4 space-y-2">
          <div className="skeleton h-10 w-28 rounded-xl" />
          <div className="skeleton h-4 w-40 rounded" />
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[2.2rem] leading-none font-black text-[#111111] tabular-nums">
                <CountUp value={w.temp} format={(v) => `${Math.round(v)}°`} />
              </div>
              <div className="mt-1 text-sm font-semibold text-[#262626]">{now.text}</div>
            </div>
            <now.Icon size={44} strokeWidth={1.5} className="text-[#5B8DEF]" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-[#4D4D4D]">
            <span className="flex items-center gap-1">
              <Droplets size={13} aria-hidden="true" /> {Math.round(w.humidity)}%
            </span>
            <span className="flex items-center gap-1">
              <Wind size={13} aria-hidden="true" /> {Math.round(w.wind)} km/h
            </span>
            <span className="ml-auto font-semibold">
              H {Math.round(w.days[0].max)}° · L {Math.round(w.days[0].min)}°
            </span>
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {w.days.slice(1, 4).map((d) => {
              const x = describe(d.code);
              return (
                <li key={d.date} className="rounded-xl bg-white/60 px-2 py-1.5 text-center" style={{ background: "color-mix(in srgb, var(--tint) 10%, transparent)" }}>
                  <div className="text-[0.6875rem] font-bold text-[#6E6E6E]">{dayName(d.date)}</div>
                  <x.Icon size={18} strokeWidth={1.8} className="mx-auto my-0.5 text-[#5B8DEF]" aria-hidden="true" />
                  <div className="text-[0.6875rem] font-bold text-[#111111] tabular-nums">
                    {Math.round(d.max)}° <span className="font-semibold text-[#6E6E6E]">{Math.round(d.min)}°</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </motion.section>
  );
}

// ---- the calendar --------------------------------------------------------------------------------------------------------

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]; // the week starts on Sunday
const hijri = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });

/** A month you can page through, with today marked and the weekend (Friday, Saturday) softer. */
export function CalendarCard({ index = 0 }) {
  const [offset, setOffset] = useState(0);
  const [today, setToday] = useState(null);
  useEffect(() => {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
    setToday({ y, m, d });
  }, []);

  const base = today || { y: new Date().getFullYear(), m: new Date().getMonth() + 1, d: 0 };
  const first = new Date(Date.UTC(base.y, base.m - 1 + offset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const startDay = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array(startDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const isToday = (d) => today && d === today.d && month + 1 === today.m && year === today.y;
  const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <motion.section {...rise(index)} className="bg-white border border-[#ECECEC] rounded-[1.25rem] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#111111]">{title}</h2>
          {today && offset === 0 && <p className="mt-0.5 text-xs text-[#6E6E6E]">{hijri.format(new Date())}</p>}
        </div>
        <div className="flex items-center gap-1">
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="px-2 py-1 rounded-lg text-[0.6875rem] font-bold text-[#E4002B] hover:bg-[#F4F4F4]">
              Today
            </button>
          )}
          <button onClick={() => setOffset((o) => o - 1)} aria-label="Previous month" className="tap-icon p-1.5 rounded-lg text-[#6E6E6E] hover:bg-[#F4F4F4]">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setOffset((o) => o + 1)} aria-label="Next month" className="tap-icon p-1.5 rounded-lg text-[#6E6E6E] hover:bg-[#F4F4F4]">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className={`text-[0.6875rem] font-bold pb-0.5 ${i >= 5 ? "text-[#ADADAD]" : "text-[#6E6E6E]"}`}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const weekend = i % 7 === 5 || i % 7 === 6;
          return (
            <div key={i} className="flex items-center justify-center">
              {d && (
                <span
                  className={`w-7 h-6 flex items-center justify-center rounded-full text-xs tabular-nums transition-colors ${
                    isToday(d) ? "bg-[#E4002B] text-white font-black shadow-[0_6px_14px_-6px_rgba(228,0,43,0.8)]" : weekend ? "text-[#ADADAD] font-semibold" : "text-[#262626] font-semibold hover:bg-[#F4F4F4]"
                  }`}
                >
                  {d}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
