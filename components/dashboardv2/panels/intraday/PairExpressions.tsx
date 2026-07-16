"use client";

import { useMemo, useState } from "react";
import { computeExpressions, type Scores, type Expression } from "@/lib/strength";
import type { PublicEntryAssistCandidate } from "@/types/domain/entry-assist";
import type { CCY } from "@/lib/intradayFilters";

// Pair expressions derived from the strength scores. These are a plain read of
// relative strength; they never imply Entry Assist on their own. A distinct
// violet chip appears only when a Tier 1 Entry Assist candidate matches the pair.

const STATE_LABEL: Record<PublicEntryAssistCandidate["state"], string> = {
  watching: "Watching",
  confirmed: "Confirmed",
  fading: "Fading",
};

function BiasChip({ state }: { state: Expression["state"] }) {
  const cls =
    state === "Bullish"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : "border-red-400/20 bg-red-500/10 text-red-200";
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {state}
    </span>
  );
}

function ExpressionCard({
  expr,
  match,
  onFocusPair,
}: {
  expr: Expression;
  match?: PublicEntryAssistCandidate;
  onFocusPair: (base: CCY, quote: CCY) => void;
}) {
  const strongCode = expr.state === "Bullish" ? expr.baseCode : expr.quoteCode;
  const weakCode = expr.state === "Bullish" ? expr.quoteCode : expr.baseCode;

  return (
    <article className="rounded-[16px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(11,12,15,0.9),rgba(9,10,13,0.92))] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-white/90">{expr.symbol}</div>
          <div className="mt-0.5 text-[10px] text-white/45">
            {strongCode} strong · {weakCode} weak
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <BiasChip state={expr.state} />
          {match && (
            <span className="inline-flex h-6 items-center rounded-full border border-violet-400/30 bg-violet-500/[0.12] px-2 text-[10px] font-bold uppercase tracking-wider text-violet-100">
              {STATE_LABEL[match.state]}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/45">Strength gap: {Math.round(expr.spread)}</span>
        <button
          type="button"
          onClick={() => onFocusPair(expr.baseCode as CCY, expr.quoteCode as CCY)}
          className="inline-flex h-8 items-center rounded-full border border-white/10 bg-black/30 px-3 text-[11px] font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        >
          Focus pair
        </button>
      </div>
    </article>
  );
}

interface PairExpressionsProps {
  scores: Scores;
  candidates: PublicEntryAssistCandidate[];
  onFocusPair: (base: CCY, quote: CCY) => void;
}

export function PairExpressions({ scores, candidates, onFocusPair }: PairExpressionsProps) {
  const [expanded, setExpanded] = useState(false);
  const expressions = useMemo(() => computeExpressions(scores), [scores]);
  const matchBySymbol = useMemo(() => {
    const map = new Map<string, PublicEntryAssistCandidate>();
    for (const c of candidates) map.set(c.symbol, c);
    return map;
  }, [candidates]);

  if (expressions.length === 0) return null;

  const shown = expanded ? expressions.slice(0, 6) : expressions.slice(0, 3);
  const canExpand = expressions.length > 3;

  return (
    <section>
      <div className="mb-2 text-sm font-semibold text-white">Pair expressions</div>
      <div className="space-y-2">
        {shown.map((expr) => (
          <ExpressionCard
            key={expr.symbol}
            expr={expr}
            match={matchBySymbol.get(expr.symbol)}
            onFocusPair={onFocusPair}
          />
        ))}
      </div>
      {canExpand && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-8 items-center rounded-full border border-white/10 bg-black/30 px-4 text-[11px] font-semibold text-white/55 transition-all hover:border-white/20 hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          >
            {expanded ? "View less" : "View more"}
          </button>
        </div>
      )}
    </section>
  );
}
