// Currency-strength pair math, extracted from the dashboard strength panel
// (refactor plan 5.5) so it can be unit-tested in isolation.

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;

// Standard market-convention pairs (base first). Used to detect "Inv" in the matrix.
export const STANDARD_PAIRS = new Set([
  "EURUSD","GBPUSD","AUDUSD","NZDUSD","USDJPY","USDCHF","USDCAD",
  "EURGBP","EURJPY","EURAUD","EURNZD","EURCHF","EURCAD",
  "GBPJPY","GBPAUD","GBPNZD","GBPCHF","GBPCAD",
  "AUDJPY","AUDNZD","AUDCHF","AUDCAD",
  "NZDJPY","NZDCHF","NZDCAD",
  "CHFJPY","CADJPY","CADCHF",
]);

export type CurrencyStrength = { score: number; bias: "Strong" | "Weak" | "Neutral"; rawScore: number };
export type Scores = Record<string, CurrencyStrength>;

export type PairScanState = "Bullish" | "Bearish" | "Neutral";

/**
 * Per-pair detail as stored in the scanner snapshot's `pairs` JSONB. Daily
 * snapshots carry d1/h4 timeframe states; intraday snapshots carry h1/m15.
 * `pair` is the scanner's combined (MTFA-confirmed) read and `confidence` its
 * multi-timeframe confidence on a 0-100 scale (0 when timeframes conflict).
 */
export type PairDetail = {
  pair?: string;
  confidence?: number;
  d1?: string;
  h4?: string;
  h1?: string;
  m15?: string;
};
export type PairsDetail = Record<string, PairDetail | undefined>;

export type Expression = {
  symbol: string;
  baseCode: string;
  quoteCode: string;
  state: "Bullish" | "Bearish";
  summary: string;
  confidence: number;
  spread: number;
  opportunity: number;
  /** "scanner" when built from stored MTFA pair data; "approximation" otherwise. */
  source: "scanner" | "approximation";
  /** Real timeframe states when source is "scanner" (D1/H4 daily, H1/M15 intraday). */
  tfSlow?: PairScanState;
  tfFast?: PairScanState;
};

export type CellData = {
  symbol: string;
  state: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  spread: number;
  isInverse: boolean;
  /** "scanner" when state/confidence come from stored MTFA data. */
  source: "scanner" | "approximation";
};

/** Approximate confidence from score magnitudes. Requires MTFA for accuracy. */
export function approxConf(scoreA: number, scoreB: number): number {
  return Math.round((Math.abs(scoreA) + Math.abs(scoreB)) / 2);
}

/** Scanner trend string ("bullish") → display state, or null when unparseable. */
export function scanState(raw: string | undefined): PairScanState | null {
  if (raw === "bullish") return "Bullish";
  if (raw === "bearish") return "Bearish";
  if (raw === "neutral") return "Neutral";
  return null;
}

/** Scanner confidence (0-100 float) → clamped integer, or null when absent. */
export function scanConfidence(raw: number | undefined): number | null {
  if (typeof raw !== "number" || !isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** True when at least one entry in `pairs` has a parseable combined state. */
function hasUsablePairData(pairs: PairsDetail | null | undefined): pairs is PairsDetail {
  if (!pairs) return false;
  for (const detail of Object.values(pairs)) {
    if (detail && scanState(detail.pair) !== null) return true;
  }
  return false;
}

export function pairState(baseScore: number, quoteScore: number): "Bullish" | "Bearish" | "Neutral" {
  const diff = baseScore - quoteScore;
  if (diff > 15) return "Bullish";
  if (diff < -15) return "Bearish";
  return "Neutral";
}

export function getCanonicalPair(a: string, b: string): { base: string; quote: string } {
  if (STANDARD_PAIRS.has(a + b)) return { base: a, quote: b };
  if (STANDARD_PAIRS.has(b + a)) return { base: b, quote: a };
  return a < b ? { base: a, quote: b } : { base: b, quote: a };
}

function computeExpressionsApprox(scores: Scores): Expression[] {
  const exprs: Expression[] = [];
  const list = CURRENCIES.filter((c) => c in scores);

  // Unordered pairs only — each canonical pair appears once
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a === undefined || b === undefined) continue;
      const sa = scores[a]?.score, sb = scores[b]?.score;
      if (sa === undefined || sb === undefined) continue;

      const oneStrongOneWeak = (sa > 15 && sb < -15) || (sb > 15 && sa < -15);
      if (!oneStrongOneWeak) continue;

      const { base, quote } = getCanonicalPair(a, b);
      const bs = scores[base]?.score ?? 0;
      const qs = scores[quote]?.score ?? 0;
      const state: "Bullish" | "Bearish" = bs > qs ? "Bullish" : "Bearish";

      const strongCode = sa > sb ? a : b;
      const weakCode = sa < sb ? a : b;
      const spread = Math.round((Math.abs(sa) + Math.abs(sb)) * 10) / 10;
      const confidence = approxConf(sa, sb);
      const opportunity = Math.round(spread * confidence / 100 * 10) / 10;

      exprs.push({
        symbol: `${base}/${quote}`,
        baseCode: base, quoteCode: quote,
        state,
        summary: `${strongCode} strong vs ${weakCode} weak`,
        confidence, spread, opportunity,
        source: "approximation",
      });
    }
  }

  return exprs.sort((a, b) => b.opportunity - a.opportunity).slice(0, 6);
}

function computeExpressionsFromPairs(scores: Scores, pairs: PairsDetail): Expression[] {
  const exprs: Expression[] = [];
  const list = CURRENCIES.filter((c) => c in scores);

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a === undefined || b === undefined) continue;

      const { base, quote } = getCanonicalPair(a, b);
      const detail = pairs[base + quote];
      const state = scanState(detail?.pair);
      const confidence = detail === undefined ? null : scanConfidence(detail.confidence);
      // Only pairs the scanner confirmed (both timeframes aligned) qualify.
      if (!detail || state === null || state === "Neutral" || confidence === null) continue;

      const sa = scores[a]?.score ?? 0;
      const sb = scores[b]?.score ?? 0;
      const spread = Math.round((Math.abs(sa) + Math.abs(sb)) * 10) / 10;
      const opportunity = Math.round(spread * confidence / 100 * 10) / 10;
      const strongCode = state === "Bullish" ? base : quote;
      const weakCode = state === "Bullish" ? quote : base;

      exprs.push({
        symbol: `${base}/${quote}`,
        baseCode: base, quoteCode: quote,
        state,
        summary: `${strongCode} strong vs ${weakCode} weak`,
        confidence, spread, opportunity,
        source: "scanner",
        tfSlow: scanState(detail.d1 ?? detail.h1) ?? undefined,
        tfFast: scanState(detail.h4 ?? detail.m15) ?? undefined,
      });
    }
  }

  return exprs.sort((a, b) => b.opportunity - a.opportunity).slice(0, 6);
}

/**
 * Best expressions. With usable stored pair data the scanner's combined state
 * and MTFA confidence rank the pairs (an empty result then means "nothing
 * confirmed", not missing data); otherwise falls back to the score-magnitude
 * approximation.
 */
export function computeExpressions(scores: Scores, pairs?: PairsDetail | null): Expression[] {
  if (hasUsablePairData(pairs)) return computeExpressionsFromPairs(scores, pairs);
  return computeExpressionsApprox(scores);
}

export function computeMatrixCell(
  base: string,
  quote: string,
  scores: Scores,
  pairs?: PairsDetail | null,
): CellData {
  const { base: cb, quote: cq } = getCanonicalPair(base, quote);
  const bs = scores[cb]?.score ?? 0;
  const qs = scores[cq]?.score ?? 0;
  const spread = Math.round((Math.abs(bs) + Math.abs(qs)) * 10) / 10;

  // Real scanner read per cell when stored; approximation otherwise. A stored
  // Neutral with confidence 0 is a truthful "timeframes conflict" read.
  const detail = pairs?.[cb + cq];
  const realState = scanState(detail?.pair);
  const realConfidence = detail === undefined ? null : scanConfidence(detail?.confidence);
  if (realState !== null && realConfidence !== null) {
    return { symbol: `${cb}/${cq}`, state: realState, confidence: realConfidence, spread, isInverse: false, source: "scanner" };
  }

  const state = pairState(bs, qs);
  const confidence = approxConf(bs, qs);
  return { symbol: `${cb}/${cq}`, state, confidence, spread, isInverse: false, source: "approximation" };
}
