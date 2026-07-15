// Frontend-only interpretation layer for the Daily CSM panel.
//
// Everything here is derived from values the panel already receives — the
// current score snapshot and the existing strength-history endpoint. It never
// alters scores, rankings, confidence, or any backend output; it only maps
// them to product-facing labels (bias, watchlist, regime, health, window).

import { CURRENCIES, getCanonicalPair, type Scores, type Expression } from "./strength";

// Score bands (mirrors of the display scale, -100..100)
export const STRONG_T = 70;
export const CONFIRMED_T = 50;
export const ACTIVE_T = 30;
export const WATCH_T = 15;

// Movement heuristics (daily history snapshots are hourly)
const LOOKBACK_POINTS = 24; // compare against ~1 day back
const FADE_DELTA = 10; // score loss vs lookback that reads as "fading"
const MATURE_REFRESHES = 48; // ~2 days holding a confirmed directional score

export type HistoryPointLike = { ts: string } & Record<string, number | string>;

export type StrengthMovement = {
  /** Score change vs the lookback snapshot. */
  delta: number;
  /** Crossed from inside the neutral band to a directional score within the lookback. */
  enteredWatch: boolean;
  /** Consecutive recent snapshots holding |score| >= CONFIRMED_T in the current direction. */
  directionalRefreshes: number;
  hasHistory: boolean;
};

export type InterpStage = "fresh" | "confirmed" | "mature" | "fading" | "none";
export type InterpTone = "positive" | "negative" | "watch" | "fading" | "neutral";

export type CurrencyInterpretation = {
  code: string;
  label: string;
  tone: InterpTone;
  stage: InterpStage;
};

// ─── Movement from existing history points ───────────────────────────────────

export function computeMovements(
  points: HistoryPointLike[],
): Record<string, StrengthMovement> {
  const out: Record<string, StrengthMovement> = {};
  if (!points || points.length < 2) return out;

  const last = points[points.length - 1];
  const back = points[Math.max(0, points.length - 1 - LOOKBACK_POINTS)];
  if (!last || !back) return out;

  for (const code of CURRENCIES) {
    const now = last[code];
    const prev = back[code];
    if (typeof now !== "number" || typeof prev !== "number") continue;

    let run = 0;
    if (now !== 0) {
      const dir = Math.sign(now);
      for (let i = points.length - 1; i >= 0; i--) {
        const s = points[i]?.[code];
        if (typeof s !== "number" || Math.abs(s) < CONFIRMED_T || Math.sign(s) !== dir) break;
        run++;
      }
    }

    out[code] = {
      delta: now - prev,
      enteredWatch: Math.abs(prev) < ACTIVE_T && Math.abs(now) >= ACTIVE_T,
      directionalRefreshes: run,
      hasHistory: true,
    };
  }
  return out;
}

// ─── Per-currency badge ───────────────────────────────────────────────────────

export function interpretCurrency(
  code: string,
  score: number,
  movement?: StrengthMovement,
): CurrencyInterpretation {
  const abs = Math.abs(score);
  const positive = score >= 0;
  const m = movement?.hasHistory ? movement : undefined;

  const weakening = m ? (positive ? m.delta < -FADE_DELTA : m.delta > FADE_DELTA) : false;
  const strengthening = m ? (positive ? m.delta > FADE_DELTA : m.delta < -FADE_DELTA) : false;
  const mature = (m?.directionalRefreshes ?? 0) >= MATURE_REFRESHES;
  const fresh = m?.enteredWatch ?? false;

  if (abs < WATCH_T) {
    return { code, label: "Neutral", tone: "neutral", stage: "none" };
  }

  if (abs < ACTIVE_T) {
    return strengthening
      ? { code, label: "Early Watchlist", tone: "watch", stage: "fresh" }
      : { code, label: "Neutral", tone: "neutral", stage: "none" };
  }

  // Directional zone: weakened vs previous state but still directional → Fading.
  // Strong-magnitude scores keep their strength label instead.
  if (weakening && abs < STRONG_T) {
    return positive
      ? { code, label: "Fading", tone: "fading", stage: "fading" }
      : { code, label: "Fading Weak", tone: "fading", stage: "fading" };
  }

  if (positive) {
    if (abs >= STRONG_T) {
      const label = mature ? "Mature / Strong" : fresh ? "Fresh / Strong" : m ? "Confirmed / Strong" : "Strong";
      return { code, label, tone: "positive", stage: mature ? "mature" : fresh ? "fresh" : "confirmed" };
    }
    if (abs >= CONFIRMED_T) {
      const label = mature ? "Mature" : fresh ? "Fresh" : "Confirmed";
      return { code, label, tone: "positive", stage: mature ? "mature" : fresh ? "fresh" : "confirmed" };
    }
    return fresh
      ? { code, label: "Fresh", tone: "watch", stage: "fresh" }
      : { code, label: "Active", tone: "positive", stage: "confirmed" };
  }

  if (abs >= STRONG_T) {
    return mature
      ? { code, label: "Extended Weak", tone: "negative", stage: "mature" }
      : { code, label: "Strong Weak", tone: "negative", stage: "confirmed" };
  }
  if (abs >= CONFIRMED_T) {
    const label = mature ? "Mature Weak" : "Confirmed Weak";
    return { code, label, tone: "negative", stage: mature ? "mature" : "confirmed" };
  }
  return fresh
    ? { code, label: "Fresh Weak", tone: "watch", stage: "fresh" }
    : { code, label: "Weak", tone: "negative", stage: "confirmed" };
}

export function interpretAll(
  scores: Scores,
  movements: Record<string, StrengthMovement>,
): Record<string, CurrencyInterpretation> {
  const out: Record<string, CurrencyInterpretation> = {};
  for (const [code, cs] of Object.entries(scores)) {
    out[code] = interpretCurrency(code, cs.score, movements[code]);
  }
  return out;
}

// ─── Summary strip ────────────────────────────────────────────────────────────

export type RegimeStatus = "Fresh" | "Confirmed" | "Mature" | "Fading";
export type TrendHealth = "Stable" | "Expanding" | "Slightly Fading" | "Valid";
export type GapStrength = "Active" | "Strong" | "Extended";

export type SummaryStrip = {
  bias: { strongest: string[]; weakest: string[]; note: string };
  watchlist: { pairs: string[]; note: string };
  regime: { status: RegimeStatus; note: string };
  health: { status: TrendHealth; note: string };
  window: { value: string; note: string };
  gap: { status: GapStrength; note: string };
};

function pickExtremes(sorted: [string, number][]): { strongest: string[]; weakest: string[] } {
  const strongest = sorted.filter(([, s]) => s >= CONFIRMED_T).slice(0, 2).map(([c]) => c);
  if (strongest.length === 0) {
    const top = sorted[0];
    if (top && top[1] >= ACTIVE_T) strongest.push(top[0]);
  }
  const weakAsc = [...sorted].reverse();
  const weakest = weakAsc.filter(([, s]) => s <= -CONFIRMED_T).slice(0, 2).map(([c]) => c);
  if (weakest.length === 0) {
    const bottom = weakAsc[0];
    if (bottom && bottom[1] <= -ACTIVE_T) weakest.push(bottom[0]);
  }
  return { strongest, weakest };
}

export function buildSummaryStrip(
  scores: Scores,
  interps: Record<string, CurrencyInterpretation>,
  expressions: Expression[],
  movements: Record<string, StrengthMovement>,
): SummaryStrip {
  const sorted: [string, number][] = Object.entries(scores)
    .map(([c, cs]): [string, number] => [c, cs.score])
    .sort((a, b) => b[1] - a[1]);

  const { strongest, weakest } = pickExtremes(sorted);

  const topScore = sorted[0]?.[1] ?? 0;
  const bottomScore = sorted[sorted.length - 1]?.[1] ?? 0;
  const gapValue = topScore - bottomScore;

  const highConviction =
    strongest.some((c) => (scores[c]?.score ?? 0) >= CONFIRMED_T) &&
    weakest.some((c) => (scores[c]?.score ?? 0) <= -CONFIRMED_T);
  const biasNote =
    strongest.length === 0 && weakest.length === 0
      ? "No dominant bias yet"
      : highConviction
      ? "High conviction continuation"
      : "Directional bias forming";

  // Early watchlist: currencies building early strength, paired against the
  // opposite extreme so the user gets pair names, not method hints.
  const watchPairs: string[] = [];
  for (const [code] of sorted) {
    const interp = interps[code];
    if (!interp || interp.stage !== "fresh") continue;
    const rising = (scores[code]?.score ?? 0) >= 0;
    const partners = rising ? weakest : strongest;
    for (const partner of partners) {
      const { base, quote } = getCanonicalPair(code, partner);
      const symbol = `${base}${quote}`;
      if (!watchPairs.includes(symbol)) watchPairs.push(symbol);
      if (watchPairs.length >= 4) break;
    }
    if (watchPairs.length >= 4) break;
  }
  if (watchPairs.length === 0) {
    for (const expr of expressions.slice(0, 4)) {
      watchPairs.push(expr.symbol.replace("/", ""));
    }
  }

  // Regime: read the leaders (both extremes) as a group.
  const leaderStages = [...strongest, ...weakest]
    .map((c) => interps[c]?.stage)
    .filter((s): s is InterpStage => Boolean(s));
  const fadingCount = leaderStages.filter((s) => s === "fading").length;
  let regime: RegimeStatus;
  if (leaderStages.length > 0 && fadingCount >= Math.ceil(leaderStages.length / 2)) {
    regime = "Fading";
  } else if (leaderStages.includes("fresh")) {
    regime = "Fresh";
  } else if (leaderStages.includes("mature")) {
    regime = "Mature";
  } else {
    regime = "Confirmed";
  }
  const regimeNote =
    regime === "Fresh"
      ? "New trend impulse"
      : regime === "Mature"
      ? "Established bias, later stage"
      : regime === "Fading"
      ? "Bias cooling, still directional"
      : "Bias remains active";

  // Trend health: is the strength gap holding, widening, or easing?
  const topCode = sorted[0]?.[0];
  const bottomCode = sorted[sorted.length - 1]?.[0];
  const topMove = topCode ? movements[topCode] : undefined;
  const bottomMove = bottomCode ? movements[bottomCode] : undefined;
  let health: TrendHealth;
  let healthNote: string;
  if (!topMove?.hasHistory || !bottomMove?.hasHistory) {
    health = "Valid";
    healthNote = "Bias remains supported";
  } else {
    const gapDelta = topMove.delta - bottomMove.delta;
    if (gapDelta > 8) {
      health = "Expanding";
      healthNote = "Strength gap widening";
    } else if (gapDelta < -8) {
      health = "Slightly Fading";
      healthNote = "Momentum easing, bias intact";
    } else {
      health = "Stable";
      healthNote = "Momentum remains aligned";
    }
  }

  const windowValue = regime === "Fresh" || regime === "Confirmed" ? "3–5 days" : "1–3 days";

  const gapStatus: GapStrength = gapValue >= 120 ? "Extended" : gapValue >= 80 ? "Strong" : "Active";
  const gapNote =
    gapStatus === "Extended"
      ? "Stretched, avoid chasing"
      : gapStatus === "Strong"
      ? "Strength gap remains clear"
      : "Gap present, still developing";

  return {
    bias: { strongest, weakest, note: biasNote },
    watchlist: { pairs: watchPairs.slice(0, 4), note: "Leading names building early" },
    regime: { status: regime, note: regimeNote },
    health: { status: health, note: healthNote },
    window: { value: windowValue, note: "Best used as watchlist context" },
    gap: { status: gapStatus, note: gapNote },
  };
}

// ─── Expression card metadata ─────────────────────────────────────────────────

export type ExpressionMeta = {
  status: "Fresh" | "Confirmed" | "Mature" | "Fading";
  window: string;
  health: "Stable" | "Extended" | "Slightly fading";
  use: string;
};

export function interpretExpression(
  expr: Expression,
  interps: Record<string, CurrencyInterpretation>,
): ExpressionMeta {
  const stages = [interps[expr.baseCode]?.stage, interps[expr.quoteCode]?.stage];

  const status: ExpressionMeta["status"] = stages.includes("fading")
    ? "Fading"
    : stages.includes("mature")
    ? "Mature"
    : stages.includes("fresh")
    ? "Fresh"
    : "Confirmed";

  const window = status === "Fresh" || status === "Confirmed" ? "3–5d" : "1–3d";
  const health: ExpressionMeta["health"] =
    status === "Mature" ? "Extended" : status === "Fading" ? "Slightly fading" : "Stable";

  const bullish = expr.state === "Bullish";
  const use = bullish
    ? status === "Mature"
      ? "Avoid chasing"
      : status === "Fading"
      ? "Wait for confirmation"
      : "Look for setups"
    : status === "Mature"
    ? "Fade rallies"
    : status === "Fading"
    ? "Wait for setup"
    : "Look for shorts";

  return { status, window, health, use };
}
