// Regime-change history for the Daily CSM panel: derives per-currency band
// transitions (Strong / Neutral / Weak) from the history endpoint's score
// series. Frontend-only, same contract as lib/strengthInterpretation.ts — it
// never alters scores, it only labels them. Band edges reuse WATCH_T (±15),
// the same threshold the interpretation layer uses for "directional at all".

import { WATCH_T } from "./strengthInterpretation";

export type RegimeBand = "Strong" | "Neutral" | "Weak";

export type RegimeFlip = {
  code: string;
  from: RegimeBand;
  to: RegimeBand;
  /** Timestamp of the first snapshot inside the new band. */
  ts: string;
  /** Score at that snapshot. */
  score: number;
};

/** Score series point as served by /api/currency-strength-history. */
export type RegimeHistoryPoint = { ts: string } & Record<string, number | string>;

export function bandFor(score: number): RegimeBand {
  if (score >= WATCH_T) return "Strong";
  if (score <= -WATCH_T) return "Weak";
  return "Neutral";
}

/**
 * All band transitions in the series, oldest → newest. A flip is recorded at
 * the first point inside the new band; the series' first point sets the
 * starting band without emitting a flip.
 */
export function computeRegimeFlips(
  points: RegimeHistoryPoint[],
  currencies: readonly string[],
): RegimeFlip[] {
  const flips: RegimeFlip[] = [];
  const current = new Map<string, RegimeBand>();

  for (const point of points) {
    for (const code of currencies) {
      const raw = point[code];
      if (typeof raw !== "number" || !isFinite(raw)) continue;
      const band = bandFor(raw);
      const prev = current.get(code);
      if (prev === undefined) {
        current.set(code, band);
        continue;
      }
      if (band !== prev) {
        flips.push({ code, from: prev, to: band, ts: String(point.ts), score: raw });
        current.set(code, band);
      }
    }
  }

  return flips;
}

/** The newest `limit` flips, newest first — what the panel renders. */
export function latestRegimeFlips(
  points: RegimeHistoryPoint[],
  currencies: readonly string[],
  limit = 8,
): RegimeFlip[] {
  return computeRegimeFlips(points, currencies).slice(-limit).reverse();
}
