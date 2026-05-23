"use client";

import { useCallback, useEffect, useState } from "react";
import { Radar, RefreshCw, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { IconAction, PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
type Currency = (typeof CURRENCIES)[number];

type CurrencyStrength = {
  score: number;
  bias: "Strong" | "Weak" | "Neutral";
  rawScore: number;
};

type ApiResponse = {
  currencies: Record<Currency, CurrencyStrength>;
  type: string;
  fetchedAt: string;
  cacheAgeSeconds: number;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StrengthBar({ score }: { score: number }) {
  const clamped    = Math.max(-100, Math.min(100, score));
  const isPositive = clamped >= 0;
  const pct        = Math.abs(clamped) / 2; // 0–50% of total width

  return (
    <div className="relative h-1.5 w-full rounded-full bg-white/8">
      {/* Centre tick */}
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-white/18" />
      {/* Fill */}
      <div
        className={cn(
          "absolute top-0 h-full rounded-full transition-all duration-500",
          isPositive ? "left-1/2 bg-emerald-400/75" : "right-1/2 bg-rose-400/75",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BiasChip({ bias }: { bias: "Strong" | "Weak" | "Neutral" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[52px] items-center justify-center rounded-full border px-2 text-[9px] font-semibold uppercase tracking-widest",
        bias === "Strong"
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
          : bias === "Weak"
            ? "border-rose-400/20 bg-rose-500/10 text-rose-300"
            : "border-white/10 bg-white/[0.04] text-white/35",
      )}
    >
      {bias}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-1 flex-col justify-around gap-2">
      {CURRENCIES.map((c) => (
        <div key={c} className="flex animate-pulse items-center gap-3">
          <div className="h-4 w-10 rounded bg-white/8" />
          <div className="h-1.5 flex-1 rounded-full bg-white/8" />
          <div className="h-4 w-8 rounded bg-white/8" />
          <div className="h-5 w-14 rounded-full bg-white/8" />
        </div>
      ))}
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60)   return "Just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface StrengthPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
  variant?: "daily" | "intraday";
}

export function EmbeddedStrengthPanel({
  panel,
  onToggleLock,
  onRemove,
  variant = "daily",
}: StrengthPanelProps) {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [tick, setTick]       = useState(0);

  const isIntraday = variant === "intraday";

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/currency-strength?type=${isIntraday ? "intraday" : "daily"}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [isIntraday]);

  useEffect(() => { load(); }, [load, tick]);

  // Sort strongest → weakest
  const sorted = data
    ? ([...CURRENCIES] as Currency[]).sort(
        (a, b) => (data.currencies[b]?.score ?? 0) - (data.currencies[a]?.score ?? 0),
      )
    : ([...CURRENCIES] as Currency[]);

  return (
    <WidgetShell
      title={isIntraday ? "Currency strength · intraday" : "Currency strength · daily"}
      subtitle={
        isIntraday
          ? "3-day relative momentum across 8 major currencies."
          : "20-day relative momentum across 8 major currencies."
      }
      className="h-full"
      contentClassName="min-h-0"
      headerRight={
        <>
          <Pill active>
            {isIntraday ? (
              <Waves className="h-3.5 w-3.5" />
            ) : (
              <Radar className="h-3.5 w-3.5" />
            )}
            {isIntraday ? "Intraday" : "Daily"}
          </Pill>
          <IconAction
            label="Refresh data"
            onClick={() => setTick((k) => k + 1)}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </IconAction>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">

        {/* Header row */}
        {!loading && !error && data && (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/30">
              {isIntraday ? "3-day momentum" : "20-day momentum"}
            </span>
            <span className="text-[10px] text-white/28">
              Updated {formatAge(data.cacheAgeSeconds)}
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-white/40">Failed to load strength data.</p>
              <button
                type="button"
                onClick={() => setTick((k) => k + 1)}
                className="mt-3 text-xs text-violet-400 underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Data rows */}
        {!loading && !error && data && (
          <div className="flex flex-1 flex-col justify-around gap-1.5 overflow-y-auto">
            {sorted.map((currency) => {
              const info = data.currencies[currency];
              if (!info) return null;
              return (
                <div key={currency} className="flex items-center gap-3">
                  {/* Currency name */}
                  <div className="w-10 shrink-0 text-sm font-semibold tracking-wide text-white">
                    {currency}
                  </div>

                  {/* Bar */}
                  <div className="flex-1">
                    <StrengthBar score={info.score} />
                  </div>

                  {/* Score */}
                  <div
                    className={cn(
                      "w-10 shrink-0 text-right text-sm font-medium tabular-nums",
                      info.bias === "Strong"
                        ? "text-emerald-300"
                        : info.bias === "Weak"
                          ? "text-rose-300"
                          : "text-white/38",
                    )}
                  >
                    {info.score > 0 ? "+" : ""}
                    {info.score.toFixed(0)}
                  </div>

                  {/* Bias */}
                  <div className="shrink-0">
                    <BiasChip bias={info.bias} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WidgetShell>
  );
}

export function CurrencyStrengthPanel(props: Omit<StrengthPanelProps, "variant">) {
  return <EmbeddedStrengthPanel {...props} variant="daily" />;
}

export function CurrencyStrengthIntradayPanel(props: Omit<StrengthPanelProps, "variant">) {
  return <EmbeddedStrengthPanel {...props} variant="intraday" />;
}
