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

export type Expression = {
  symbol: string;
  baseCode: string;
  quoteCode: string;
  state: "Bullish" | "Bearish";
  summary: string;
  confidence: number;
  spread: number;
  opportunity: number;
};

export type CellData = {
  symbol: string;
  state: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  spread: number;
  isInverse: boolean;
};

/** Approximate confidence from score magnitudes. Requires MTFA for accuracy. */
export function approxConf(scoreA: number, scoreB: number): number {
  return Math.round((Math.abs(scoreA) + Math.abs(scoreB)) / 2);
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

export function computeExpressions(scores: Scores): Expression[] {
  const exprs: Expression[] = [];
  const list = CURRENCIES.filter((c) => c in scores);

  // Unordered pairs only — each canonical pair appears once
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const sa = scores[a].score, sb = scores[b].score;

      const oneStrongOneWeak = (sa > 15 && sb < -15) || (sb > 15 && sa < -15);
      if (!oneStrongOneWeak) continue;

      const { base, quote } = getCanonicalPair(a, b);
      const bs = scores[base].score;
      const qs = scores[quote].score;
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
      });
    }
  }

  return exprs.sort((a, b) => b.opportunity - a.opportunity).slice(0, 6);
}

export function computeMatrixCell(base: string, quote: string, scores: Scores): CellData {
  const { base: cb, quote: cq } = getCanonicalPair(base, quote);
  const bs = scores[cb]?.score ?? 0;
  const qs = scores[cq]?.score ?? 0;
  const state = pairState(bs, qs);
  const spread = Math.round((Math.abs(bs) + Math.abs(qs)) * 10) / 10;
  const confidence = approxConf(bs, qs);
  return { symbol: `${cb}/${cq}`, state, confidence, spread, isInverse: false };
}
