// Pure per-pair shaping for the /currency-strength/[pair] SEO pages: slug
// mapping for the 28 standard major pairs and extraction of one pair's view
// (both currencies' readings, differential, scanner detail) from a daily
// snapshot. No I/O here — the fetch lives in lib/api/currencyStrengthTeaser.ts.

import { STANDARD_PAIRS } from "./strength";
import type { TeaserReading } from "./strength-teaser";

/** All 28 standard pairs of the eight majors, in a stable order. */
export const STRENGTH_PAIR_SYMBOLS: string[] = [...STANDARD_PAIRS].sort();

/** URL slug for a symbol, matching the calculator convention: "EURUSD" -> "eurusd". */
export const strengthPairToSlug = (symbol: string): string => symbol.toLowerCase();

/** Canonical symbol for a slug, or null when it is not a standard major pair. */
export function strengthPairFromSlug(slug: string): string | null {
  const symbol = slug.toUpperCase();
  return STANDARD_PAIRS.has(symbol) ? symbol : null;
}

export type PairTrend = "bullish" | "bearish" | "neutral";

/** Raw per-pair entry in the snapshot's `pairs` JSONB. */
export type SnapshotPairDetail = {
  d1?: string;
  h4?: string;
  pair?: string;
  confidence?: number;
  last_bos_d1?: number;
  last_bos_h4?: number;
  last_bos_d1_time?: string;
  last_bos_h4_time?: string;
};

export type SnapshotPairs = Record<string, SnapshotPairDetail | undefined>;

export type BosMark = { level: number; timeUtc: string };

export type PairScanDetail = {
  d1: PairTrend | null;
  h4: PairTrend | null;
  /** The scanner's combined read for the pair (its `pair` field). */
  combined: PairTrend | null;
  /** Multi-timeframe confidence, 0-100; null when absent. */
  confidence: number | null;
  bosD1: BosMark | null;
  bosH4: BosMark | null;
};

export type RankedReading = TeaserReading & { rank: number };

export type PairStrengthView = {
  symbol: string;
  base: string;
  quote: string;
  display: string;
  baseReading: RankedReading;
  quoteReading: RankedReading;
  /** Base score minus quote score, one decimal. Positive = base read stronger. */
  differential: number;
  detail: PairScanDetail | null;
};

function parseTrend(raw: string | undefined): PairTrend | null {
  return raw === "bullish" || raw === "bearish" || raw === "neutral" ? raw : null;
}

function parseBos(level: number | undefined, time: string | undefined): BosMark | null {
  if (typeof level !== "number" || !isFinite(level) || level <= 0) return null;
  if (typeof time !== "string" || time.length === 0 || isNaN(new Date(time).getTime())) return null;
  return { level, timeUtc: time };
}

function parseDetail(raw: SnapshotPairDetail | undefined): PairScanDetail | null {
  if (!raw) return null;
  const detail: PairScanDetail = {
    d1: parseTrend(raw.d1),
    h4: parseTrend(raw.h4),
    combined: parseTrend(raw.pair),
    confidence:
      typeof raw.confidence === "number" && isFinite(raw.confidence)
        ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
        : null,
    bosD1: parseBos(raw.last_bos_d1, raw.last_bos_d1_time),
    bosH4: parseBos(raw.last_bos_h4, raw.last_bos_h4_time),
  };
  const empty =
    detail.d1 === null &&
    detail.h4 === null &&
    detail.combined === null &&
    detail.confidence === null &&
    detail.bosD1 === null &&
    detail.bosH4 === null;
  return empty ? null : detail;
}

/**
 * One pair's view of a daily reading. `readings` must be the ranked output of
 * buildTeaserReadings (strongest first). Returns null when the symbol is not a
 * standard pair or either currency is missing from the readings.
 */
export function buildPairStrengthView(
  symbol: string,
  readings: TeaserReading[],
  pairs?: SnapshotPairs | null,
): PairStrengthView | null {
  if (!STANDARD_PAIRS.has(symbol)) return null;
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);

  const baseIdx = readings.findIndex((r) => r.code === base);
  const quoteIdx = readings.findIndex((r) => r.code === quote);
  if (baseIdx === -1 || quoteIdx === -1) return null;

  const baseReading = { ...readings[baseIdx]!, rank: baseIdx + 1 };
  const quoteReading = { ...readings[quoteIdx]!, rank: quoteIdx + 1 };

  return {
    symbol,
    base,
    quote,
    display: `${base}/${quote}`,
    baseReading,
    quoteReading,
    differential: Math.round((baseReading.score - quoteReading.score) * 10) / 10,
    detail: parseDetail(pairs?.[symbol]),
  };
}

/** Sibling pairs sharing a currency with `symbol`, for internal linking. */
export function relatedStrengthPairs(symbol: string, limit = 8): string[] {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  return STRENGTH_PAIR_SYMBOLS.filter(
    (s) => s !== symbol && (s.includes(base) || s.includes(quote)),
  ).slice(0, limit);
}
