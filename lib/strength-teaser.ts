// Pure shaping for the free currency-strength teaser page: turns a raw
// scanner snapshot (currencies_weighted JSON) into ranked display readings.
// No I/O here — the Supabase fetch lives in lib/api/currencyStrengthTeaser.ts.

import { CURRENCIES } from "./strength";

export type TeaserBias = "Strong" | "Weak" | "Neutral";

export type TeaserReading = {
  code: string;
  /** Clamped to -100..100, rounded to one decimal. */
  score: number;
  bias: TeaserBias;
  /** Score change vs the previous day's reading; null when unavailable. */
  delta: number | null;
};

type SnapshotCurrency = { score?: number; bias?: string };
export type SnapshotCurrencies = Record<string, SnapshotCurrency | undefined>;

/** Neutral band matches the pair-state threshold in lib/strength.ts. */
const NEUTRAL_BAND = 15;

function clampScore(n: number): number {
  return Math.max(-100, Math.min(100, Math.round(n * 10) / 10));
}

function biasFor(raw: string | undefined, score: number): TeaserBias {
  if (raw === "Strong" || raw === "Weak" || raw === "Neutral") return raw;
  if (score > NEUTRAL_BAND) return "Strong";
  if (score < -NEUTRAL_BAND) return "Weak";
  return "Neutral";
}

/**
 * Ranked readings (strongest first) for all eight majors. Returns [] when any
 * currency is missing a numeric score, so the page never renders a partial
 * meter from a malformed snapshot.
 */
export function buildTeaserReadings(
  currencies: SnapshotCurrencies | null | undefined,
  previous?: SnapshotCurrencies | null,
): TeaserReading[] {
  const readings: TeaserReading[] = [];
  for (const code of CURRENCIES) {
    const raw = currencies?.[code]?.score;
    if (typeof raw !== "number" || !isFinite(raw)) return [];
    const score = clampScore(raw);
    const prevRaw = previous?.[code]?.score;
    const delta =
      typeof prevRaw === "number" && isFinite(prevRaw)
        ? Math.round((score - clampScore(prevRaw)) * 10) / 10
        : null;
    readings.push({ code, score, bias: biasFor(currencies?.[code]?.bias, score), delta });
  }
  return readings.sort((a, b) => b.score - a.score);
}

/** Currencies at the directional extremes, for the summary line. */
export function summariseExtremes(readings: TeaserReading[]): {
  strongest: string[];
  weakest: string[];
} {
  return {
    strongest: readings.filter((r) => r.bias === "Strong").slice(0, 2).map((r) => r.code),
    weakest: readings.filter((r) => r.bias === "Weak").slice(-2).map((r) => r.code),
  };
}
