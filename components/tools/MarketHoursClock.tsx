"use client";

import { useEffect, useState } from "react";
import { getSessionStates, isMarketOpen, formatDuration } from "@/lib/sessions";

// Live forex session clock. Renders nothing time-dependent until mounted so the
// server-rendered HTML and first client render match (no hydration mismatch);
// then ticks every second. All session logic is DST-correct (see lib/sessions).
interface MarketHoursClockProps {
  className?: string;
}

function rgb([r, g, b]: [number, number, number], a = 1) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default function MarketHoursClock({ className }: MarketHoursClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className={`flex h-64 items-center justify-center text-sm text-white/30 ${className || ""}`}>
        Loading session clock…
      </div>
    );
  }

  const states = getSessionStates(now);
  const marketOpen = isMarketOpen(states);
  const openNow = states.filter((s) => s.isOpen);

  // Headline sub-text: which centres are open, or when the next one opens.
  let subline: string;
  if (openNow.length > 0) {
    subline = `${openNow.map((s) => s.city).join(" · ")} ${openNow.length === 1 ? "session" : "sessions"} open now`;
  } else {
    const next = [...states].sort((a, b) => a.minutesUntilChange - b.minutesUntilChange)[0]!;
    subline = `Next open: ${next.city} in ${formatDuration(next.minutesUntilChange)}`;
  }

  return (
    <div className={`w-full text-white ${className || ""}`}>
      {/* Headline status */}
      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-5 sm:p-6 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]">
        <div className="flex items-center justify-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 rounded-full ${marketOpen ? "bg-emerald-400" : "bg-red-400"}`}
            style={{ boxShadow: marketOpen ? "0 0 12px rgba(52,211,153,0.7)" : "0 0 12px rgba(248,113,113,0.6)" }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/50">Forex market</span>
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {marketOpen ? "Open" : "Closed"}
        </p>
        <p className="mt-1.5 text-sm text-white/45">{subline}</p>
      </div>

      {/* Session cards */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {states.map((s) => (
          <div
            key={s.key}
            className="relative overflow-hidden rounded-[22px] border p-4"
            style={{
              borderColor: s.isOpen ? rgb(s.accent, 0.4) : "rgba(255,255,255,0.08)",
              background: s.isOpen ? rgb(s.accent, 0.08) : "rgba(255,255,255,0.02)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{s.label}</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  color: s.isOpen ? rgb(s.accent) : "rgba(255,255,255,0.4)",
                  background: s.isOpen ? rgb(s.accent, 0.14) : "rgba(255,255,255,0.05)",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.isOpen ? rgb(s.accent) : "rgba(255,255,255,0.4)" }} />
                {s.isOpen ? "Open" : "Closed"}
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-white">{s.localTime}</p>
            <p className="mt-1 text-[11px] text-white/40">
              {s.isOpen ? "Closes" : "Opens"} in {formatDuration(s.minutesUntilChange)}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] text-white/28">
        Session hours are the commonly-cited market-centre business hours and adjust automatically for
        daylight saving. Conventions vary by an hour between sources.
      </p>
    </div>
  );
}
