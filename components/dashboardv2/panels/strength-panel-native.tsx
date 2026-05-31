"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { WidgetShell } from "../ui/widget-shell";
import { IconAction, PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;

// Standard market-convention pairs (base first). Used to detect "Inv" in the matrix.
const STANDARD_PAIRS = new Set([
  "EURUSD","GBPUSD","AUDUSD","NZDUSD","USDJPY","USDCHF","USDCAD",
  "EURGBP","EURJPY","EURAUD","EURNZD","EURCHF","EURCAD",
  "GBPJPY","GBPAUD","GBPNZD","GBPCHF","GBPCAD",
  "AUDJPY","AUDNZD","AUDCHF","AUDCAD",
  "NZDJPY","NZDCHF","NZDCAD",
  "CHFJPY","CADJPY","CADCHF",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type CurrencyStrength = { score: number; bias: "Strong" | "Weak" | "Neutral"; rawScore: number };
type Scores = Record<string, CurrencyStrength>;

type Expression = {
  symbol: string;
  baseCode: string;
  quoteCode: string;
  state: "Bullish" | "Bearish";
  summary: string;
  confidence: number;
  spread: number;
  opportunity: number;
};

type CellData = {
  symbol: string;
  state: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  spread: number;
  isInverse: boolean;
};

// ─── Computation ──────────────────────────────────────────────────────────────

/** Approximate confidence from score magnitudes. Requires MTFA for accuracy. */
function approxConf(scoreA: number, scoreB: number): number {
  return Math.round((Math.abs(scoreA) + Math.abs(scoreB)) / 2);
}

function pairState(baseScore: number, quoteScore: number): "Bullish" | "Bearish" | "Neutral" {
  const diff = baseScore - quoteScore;
  if (diff > 15) return "Bullish";
  if (diff < -15) return "Bearish";
  return "Neutral";
}

function computeExpressions(scores: Scores): Expression[] {
  const exprs: Expression[] = [];
  const list = CURRENCIES.filter((c) => c in scores);

  for (let i = 0; i < list.length; i++) {
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const base = list[i];
      const quote = list[j];
      const bs = scores[base].score;
      const qs = scores[quote].score;

      // Only qualify if one is firmly strong and the other firmly weak
      const baseStrong = bs > 15;
      const quoteWeak  = qs < -15;
      const baseWeak   = bs < -15;
      const quoteStrong = qs > 15;

      if (!((baseStrong && quoteWeak) || (baseWeak && quoteStrong))) continue;

      const state: "Bullish" | "Bearish" = baseStrong ? "Bullish" : "Bearish";
      const summary = baseStrong
        ? `${base} strong vs ${quote} weak`
        : `${base} weak vs ${quote} strong`;

      const spread = Math.round((Math.abs(bs) + Math.abs(qs)) * 10) / 10;
      const confidence = approxConf(bs, qs);
      const opportunity = Math.round(spread * confidence / 100 * 10) / 10;

      exprs.push({ symbol: `${base}/${quote}`, baseCode: base, quoteCode: quote, state, summary, confidence, spread, opportunity });
    }
  }

  // Sort by opportunity desc, take top 6
  return exprs.sort((a, b) => b.opportunity - a.opportunity).slice(0, 6);
}

function computeMatrixCell(base: string, quote: string, scores: Scores): CellData {
  const bs = scores[base]?.score ?? 0;
  const qs = scores[quote]?.score ?? 0;
  const state = pairState(bs, qs);
  const spread = Math.round((Math.abs(bs) + Math.abs(qs)) * 10) / 10;
  const confidence = approxConf(bs, qs);
  const isInverse = !STANDARD_PAIRS.has(base + quote) && STANDARD_PAIRS.has(quote + base);
  return { symbol: `${base}/${quote}`, state, confidence, spread, isInverse };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceRing({ pct, small }: { pct: number; small?: boolean }) {
  const angle = (pct / 100) * 360;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full p-[2px] ${small ? "h-6 w-6" : "h-8 w-8"}`}
      style={{
        background: `conic-gradient(from 180deg, #c0c5d69e 0deg, #9e809985 ${angle}deg, #ffffff12 ${angle}deg)`,
      }}
    >
      <div className={`flex h-full w-full items-center justify-center rounded-full bg-[#0a0b0ef5] font-mono text-white/70 ${small ? "text-[8px]" : "text-[10px]"}`}>
        {pct}
      </div>
    </div>
  );
}

function StrengthBar({ score }: { score: number }) {
  const pct = Math.min(Math.abs(score), 100);
  const isPos = score >= 0;
  const isSolid = pct >= 95;

  return (
    <div className="relative flex h-3 w-full items-center overflow-hidden rounded-full"
      style={{ background: "linear-gradient(#ffffff14,#ffffff05 34%,#0000002e),linear-gradient(90deg,#181a1fd1,#101216e6)", boxShadow: "inset 0 1px #ffffff24,inset 0 -4px 10px #00000047" }}>
      {/* center line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
      {/* fill */}
      <div
        className="absolute top-0 bottom-0 rounded-full"
        style={{
          width: `${pct / 2}%`,
          left: isPos ? "50%" : undefined,
          right: isPos ? undefined : "50%",
          marginRight: isPos ? undefined : `${50 - pct / 2}%`,
          background: isPos
            ? isSolid
              ? "linear-gradient(#ffffff2e,#ffffff08 42%,#0000001a),linear-gradient(90deg,#4cff72fa,#2afa67fc 44%,#1af45efc)"
              : "linear-gradient(#ffffff2e,#ffffff08 42%,#0000001a),linear-gradient(90deg,#ffd36ef2,#c6ff6cf7 26%,#6cff84fa 60%,#14f460fc)"
            : isSolid
              ? "linear-gradient(#ffffff2e,#ffffff08 42%,#0000001a),linear-gradient(90deg,#ff3636fa,#ff2e2efc 44%,#ff2222fc)"
              : "linear-gradient(#ffffff2e,#ffffff08 42%,#0000001a),linear-gradient(90deg,#ff1c1cfc,#ff5c5cfa 34%,#ffa24ef5 72%,#ffd36ef2)",
          boxShadow: isPos
            ? "inset 0 1px #ffffff24,0 0 8px #68ff801a,0 0 16px #2ef46214"
            : "inset 0 1px #ffffff24,0 0 8px #ff4e4e1a,0 0 16px #ff363614",
        }}
      />
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const str = `${score >= 0 ? "+" : ""}${score.toFixed(1)}`;
  return (
    <div className="inline-flex min-w-[4rem] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-xs font-semibold text-white/90">
      {str}
    </div>
  );
}

function BiasChip({ state }: { state: "Bullish" | "Bearish" | "Neutral" | "Strong" | "Weak" }) {
  const cls =
    state === "Bullish" || state === "Strong"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : state === "Bearish" || state === "Weak"
      ? "border-red-400/20 bg-red-500/10 text-red-200"
      : "border-white/10 bg-white/[0.04] text-white/50";
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {state}
    </span>
  );
}

// ─── Ladder ───────────────────────────────────────────────────────────────────

function LadderRow({ code, data }: { code: string; data: CurrencyStrength; rank?: number }) {
  const conf = Math.min(Math.round(Math.abs(data.score)), 100);
  return (
    <article
      className="grid items-center gap-2 rounded-[1.35rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(11,12,15,0.9),rgba(9,10,13,0.92))] px-3 py-2 transition-all hover:border-white/12 hover:-translate-y-px"
      style={{ gridTemplateColumns: "3rem 1fr 4.5rem 3rem" }}
    >
      {/* Code */}
      <div className="inline-flex min-h-[2rem] min-w-[2.6rem] items-center justify-center rounded-full border border-white/10 bg-black/30 font-mono text-xs font-semibold text-white/90">
        {code}
      </div>
      {/* Bar */}
      <StrengthBar score={data.score} />
      {/* Score */}
      <ScorePill score={data.score} />
      {/* Confidence ring */}
      <div className="flex justify-end">
        <ConfidenceRing pct={conf} />
      </div>
    </article>
  );
}

// ─── Expressions ──────────────────────────────────────────────────────────────

function ExpressionCard({ expr }: { expr: Expression }) {
  const isBullish = expr.state === "Bullish";
  return (
    <article className="flex flex-col items-center gap-2">
      {/* Orb — aspect-ratio 1 circle matching original */}
      <div
        className="relative flex w-full max-w-[90px] flex-col items-center justify-center gap-1.5 rounded-full border border-white/[0.06] p-2.5 transition-all hover:-translate-y-1"
        style={{
          aspectRatio: "1",
          background: "linear-gradient(#ffffff0b,transparent 24%),linear-gradient(#101115f0 0%,#0a0b0ee6 100%)",
          boxShadow: isBullish
            ? "0 0 0 1px #68ff800f,0 0 8px 2px #68ff801a,0 0 16px 6px #2ef46209,inset 0 1px #ffffff0a"
            : "0 0 0 1px #ff6a6a0d,0 0 8px 2px #ff6a6a14,0 0 16px 6px #dd424208,inset 0 1px #ffffff0a",
        }}
      >
        {/* Inner radial highlight */}
        <div className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle at 30% 18%,#ffffff10,transparent 18%),linear-gradient(#ffffff08,transparent 22%)" }} />

        <div className="relative z-10 text-center">
          <div className="font-semibold tracking-tight text-white text-xs leading-tight">{expr.symbol}</div>
          <div className="mt-0.5 text-[8px] text-white/40 leading-tight">{expr.summary}</div>
        </div>

        <BiasChip state={expr.state} />
        <ConfidenceRing pct={expr.confidence} small />
      </div>

      {/* Stats below orb */}
      <div className="grid w-full grid-cols-2 gap-1 text-center text-[10px]">
        <div>
          <div className="text-white/30 uppercase tracking-[0.14em]">Opp</div>
          <div className="font-mono text-white/72 font-semibold">{expr.opportunity}</div>
        </div>
        <div>
          <div className="text-white/30 uppercase tracking-[0.14em]">Spread</div>
          <div className="font-mono text-white/72 font-semibold">{expr.spread}</div>
        </div>
      </div>
    </article>
  );
}

// ─── Matrix ───────────────────────────────────────────────────────────────────

function MatrixCell({ cell, isBlank }: { cell?: CellData; isBlank?: boolean }) {
  if (isBlank || !cell) {
    return <div className="min-h-[5rem] rounded-[1.1rem] border border-white/[0.07] bg-[#09090d6b] opacity-40" />;
  }
  const stateClass =
    cell.state === "Bullish"
      ? "text-emerald-200 bg-[linear-gradient(#22744261,#16402870)]"
      : cell.state === "Bearish"
      ? "text-red-200 bg-[linear-gradient(#822c2c5c,#4e18186b)]"
      : "text-white/60 bg-[#1b1c2157]";
  return (
    <div className="min-h-[5rem] rounded-[1.1rem] border border-white/[0.07] bg-[linear-gradient(#0c0d10c2,#090a0cad)] p-2">
      <div className="flex items-start justify-between gap-1">
        <span className="font-mono text-[10px] text-white/60">{cell.symbol}</span>
        {cell.isInverse && <span className="text-[8px] text-white/30">Inv</span>}
      </div>
      <div className={`mt-1 rounded-full border border-white/10 px-1.5 py-0.5 text-center text-[10px] font-bold ${stateClass}`}>
        {cell.state}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] text-white/38">
        <span>{cell.confidence}%</span>
        <span>{cell.spread}</span>
      </div>
    </div>
  );
}

// ─── Intraday-specific ───────────────────────────────────────────────────────

function SummaryGrid({ scores, expressions }: { scores: Scores; expressions: Expression[] }) {
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const biggestMover = Object.entries(scores).sort((a, b) => Math.abs(b[1].rawScore) - Math.abs(a[1].rawScore))[0];
  const topExpr = expressions[0];

  const cards = [
    { label: "Strongest right now", value: strongest ? `${strongest[0]} ${strongest[1].score > 0 ? "+" : ""}${strongest[1].score.toFixed(1)}` : "—", detail: "Current leadership" },
    { label: "Weakest right now", value: weakest ? `${weakest[0]} ${weakest[1].score.toFixed(1)}` : "—", detail: "Current laggard" },
    { label: "Biggest mover", value: biggestMover ? biggestMover[0] : "—", detail: "Highest raw change" },
    {
      label: "Strongest divergence",
      value: topExpr ? `${topExpr.spread} spread` : "—",
      detail: topExpr ? `${topExpr.summary} · ${topExpr.confidence}%` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((c) => (
        <div key={c.label} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.18em] text-white/34">{c.label}</div>
          <div className="mt-1 text-sm font-semibold text-white leading-tight">{c.value}</div>
          <div className="mt-0.5 text-[10px] text-white/40 leading-snug truncate">{c.detail}</div>
        </div>
      ))}
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="flex h-28 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.02] text-center px-4">
      <div>
        <div className="text-xs font-medium text-white/30">Strength chart</div>
        <div className="mt-1 text-[10px] text-white/20 leading-relaxed">
          Requires time-series snapshots — see dev handoff
        </div>
      </div>
    </div>
  );
}

function IntradayExpressionRow({ expr }: { expr: Expression }) {
  const isBullish = expr.state === "Bullish";
  const stateColor = isBullish ? "text-emerald-300 border-emerald-400/20 bg-emerald-500/10"
    : "text-red-300 border-red-400/20 bg-red-500/10";
  // H1 / M15 approximated from bias — needs real MTFA data
  const tfState = isBullish ? "BULLISH / BULLISH" : "BEARISH / BEARISH";

  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(11,12,15,0.9),rgba(9,10,13,0.92))] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-white/90">{expr.symbol}</div>
          <div className="mt-0.5 text-[10px] text-white/42 leading-tight">{expr.summary}</div>
        </div>
        <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${stateColor}`}>
          {expr.state}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-white/40">
        <span>{expr.spread} spread · {expr.confidence}%</span>
        <span className={`font-mono font-semibold ${isBullish ? "text-emerald-300/70" : "text-red-300/70"}`}>{tfState}</span>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface StrengthPanelNativeProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
  variant?: "daily" | "intraday";
}

function useStrengthData(variant: "daily" | "intraday", tick: number) {
  const [data, setData] = useState<{ currencies: Scores; fetchedAt: string; cacheAgeSeconds: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/currency-strength?type=${variant}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [variant, tick]);

  return { data, loading, error };
}

export function StrengthPanelNative({ panel, onToggleLock, onRemove, variant = "daily" }: StrengthPanelNativeProps) {
  const [tick, setTick] = useState(0);
  const [showMatrix, setShowMatrix] = useState(false);
  const { data, loading, error } = useStrengthData(variant, tick);

  const scores = data?.currencies ?? {};
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const expressions = data ? computeExpressions(scores) : [];
  const available = CURRENCIES.filter((c) => c in scores);

  const ago = data
    ? data.cacheAgeSeconds < 60 ? `${data.cacheAgeSeconds}s ago` : `${Math.round(data.cacheAgeSeconds / 60)}m ago`
    : null;

  return (
    <WidgetShell
      title={variant === "intraday" ? "Currency strength · intraday" : "Currency strength · daily"}
      className="h-full"
      subtitle={ago ?? undefined}
      contentClassName="min-h-0 overflow-y-auto"
      headerRight={
        <>
          <IconAction label="Reload" onClick={() => setTick((v) => v + 1)}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </IconAction>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      {loading && !data && (
        <div className="flex h-32 items-center justify-center text-sm text-white/30">Loading…</div>
      )}
      {error && !data && (
        <div className="flex h-32 items-center justify-center text-sm text-red-400/70">{error}</div>
      )}

      {data && variant === "intraday" && (
        <div className="space-y-3">
          {/* ── Summary bar ── */}
          <SummaryGrid scores={scores} expressions={expressions} />

          {/* ── Chart placeholder ── */}
          <ChartPlaceholder />

          {/* ── Top 3 expressions ── */}
          {expressions.length > 0 && (
            <section>
              <div className="mb-2">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">Secondary read</div>
                <div className="mt-0.5 text-sm font-semibold text-white">Current pair expressions</div>
              </div>
              <div className="space-y-2">
                {expressions.slice(0, 3).map((expr) => <IntradayExpressionRow key={expr.symbol} expr={expr} />)}
              </div>
              <details className="mt-2 group">
                <summary className="flex cursor-pointer list-none items-center justify-center">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/30 font-mono text-[11px] text-white/50 hover:border-white/20 hover:text-white/70">i</span>
                </summary>
                <div className="mt-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/46">
                  <p>Strength is derived from cross-pair aggregation, centered on a fixed -100 to 100 scale. H1/M15 states are approximated from current scores — real multi-timeframe data requires the OANDA scanner.</p>
                </div>
              </details>
            </section>
          )}

        </div>
      )}

      {data && variant === "daily" && (
        <div className="space-y-4">

          {/* ── Ranked ladder ── */}
          <section>
            <div className="mb-2 flex items-end justify-between gap-2">
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">Currency Strength Meter</div>
                <div className="mt-0.5 text-sm font-semibold text-white">Ranked strength ladder</div>
              </div>
            </div>
            <div className="mb-1 grid px-1 text-[9px] uppercase tracking-[0.16em] text-white/24"
              style={{ gridTemplateColumns: "3rem 1fr 4.5rem 3rem" }}>
              <span>CCY</span>
              <span className="text-center">Strength</span>
              <span className="text-center">Score</span>
              <span className="text-right">Conf</span>
            </div>
            <div className="space-y-1.5">
              {sorted.map(([code, cs], i) => (
                <LadderRow key={code} code={code} data={cs} rank={i + 1} />
              ))}
            </div>
            <details className="mt-3 group">
              <summary className="flex cursor-pointer list-none items-center justify-center">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/30 font-mono text-[11px] text-white/50 hover:border-white/20 hover:text-white/70">i</span>
              </summary>
              <div className="mt-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/46">
                <p>The ladder ranks currencies from the resulting filtered pair alignment and confidence-weighted strength output.</p>
                <p className="mt-1.5">The ladder is not a buy or sell signal. It is a clean read of relative strength and weakness across the current market snapshot.</p>
              </div>
            </details>
          </section>

          {/* ── Best expressions ── */}
          {expressions.length > 0 && (
            <section>
              <div className="mb-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">Pair view</div>
                <div className="mt-0.5 text-sm font-semibold text-white">Best expressions</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {expressions.map((expr) => (
                  <ExpressionCard key={expr.symbol} expr={expr} />
                ))}
              </div>
            </section>
          )}

          {/* ── Matrix toggle ── */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowMatrix((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 text-xs font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white/80"
            >
              {showMatrix ? "Hide" : "Show"} advanced pair matrix
            </button>
          </div>

          {/* ── Advanced pair matrix ── */}
          {showMatrix && available.length > 0 && (
            <section>
              <div className="mb-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">Deep detail</div>
                <div className="mt-0.5 text-sm font-semibold text-white">Advanced pair matrix</div>
              </div>
              <div className="overflow-x-auto pb-2">
                <table className="border-separate" style={{ borderSpacing: "0.4rem", minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] uppercase tracking-[0.14em] text-white/38 pr-1">Base</th>
                      {available.map((c) => (
                        <th key={c} className="text-left text-[10px] uppercase tracking-[0.14em] text-white/38">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {available.map((base) => (
                      <tr key={base}>
                        <th className="text-left text-[10px] uppercase tracking-[0.14em] text-white/38 pr-2 whitespace-nowrap">{base}</th>
                        {available.map((quote) => (
                          <td key={quote} className="p-0">
                            {base === quote
                              ? <MatrixCell isBlank />
                              : <MatrixCell cell={computeMatrixCell(base, quote, scores)} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      )}
    </WidgetShell>
  );
}

export function CurrencyStrengthPanelNative(props: Omit<StrengthPanelNativeProps, "variant">) {
  return <StrengthPanelNative {...props} variant="daily" />;
}

export function CurrencyStrengthIntradayPanelNative(props: Omit<StrengthPanelNativeProps, "variant">) {
  return <StrengthPanelNative {...props} variant="intraday" />;
}
