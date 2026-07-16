// Entry Assist evaluator — PURE function, no I/O, no memory, no DB writes. It
// recomputes candidate state deterministically from the snapshot window on every
// request; that is how state "persists" across requests, refreshes and restarts.
//
// Founder-locked conventions (do not silently change the counting):
//   - persist2 = TWO qualifying snapshots in total; the crossover snapshot is the
//     FIRST. Earliest Confirmed is therefore crossover+1, never crossover+2.
//   - cooldown = 4 snapshots from crossover creation, per symbol, suppressing NEW
//     crossover events only (never lifecycle updates to an existing candidate).
//   - session end removes immediately (no cross-session continuation).
//   - Fading is a customer-facing lifecycle state visible for at most 2 snapshots
//     (~30 min at the 15-min cadence), not a research threshold.

import { isInSession, sessionCustomerLabel } from "./sessions";
import { VARIANTS, isStrictVariant, type EntryAssistRule } from "./rulebook";
import type { NormalizedSnapshot, PairLabel } from "./snapshots";

export type CandidateState = "watching" | "confirmed" | "fading";
export type Direction = "bullish" | "bearish";

export interface EvaluatedCandidate {
  ruleId: string;
  symbol: string; // "GBPUSD"
  baseCode: string;
  quoteCode: string;
  direction: Direction;
  state: CandidateState;
  sessionLabel: string;
  variantIsStrict: boolean; // internal — drives the STRICT-only reason in dto
  updatedAt: string; // ISO of the newest evaluated snapshot
}

const EMA_ALPHA = 0.5; // span-3 EMA: alpha = 2/(3+1)
const COOLDOWN_SNAPSHOTS = 4;
const STALE_MS = 35 * 60 * 1000; // newest snapshot older than this -> zero candidates
const FADING_MAX_SNAPSHOTS = 2;

/**
 * Pair alignment for a snapshot. Uses the scanner's trusted multi-timeframe pair
 * label when present; only when the label is missing does it fall back to the
 * confirmed-equivalent sign check on the gap (bullish when the base is stronger
 * and the gap is positive, bearish mirrored, neutral when tied). "neutral" is
 * never treated as aligned.
 */
function alignmentAt(snap: NormalizedSnapshot, symbol: string, gap: number): PairLabel {
  const label = snap.pairLabels[symbol];
  if (label === "bullish" || label === "bearish" || label === "neutral") return label;
  // Fallback: pair label absent for this snapshot -> derive from gap sign.
  if (gap > 0) return "bullish";
  if (gap < 0) return "bearish";
  return "neutral";
}

function momentumHolds(ema: number, direction: Direction, level: number): boolean {
  return direction === "bullish" ? ema >= level : ema <= -level;
}

function changeOpposesDirection(changeTwo: number | null, direction: Direction): boolean {
  if (changeTwo === null) return false;
  return direction === "bullish" ? changeTwo < 0 : changeTwo > 0;
}

interface Candidate {
  direction: Direction;
  state: CandidateState;
  fadeCounter: number;
}

/** Newest snapshot older than STALE_MS, or no snapshots at all. */
export function isStale(snapshots: NormalizedSnapshot[], now: Date): boolean {
  if (snapshots.length === 0) return true;
  const newest = snapshots[snapshots.length - 1];
  if (!newest) return true;
  return now.getTime() - newest.asof.getTime() > STALE_MS;
}

function evaluateRule(
  rule: EntryAssistRule,
  snapshots: NormalizedSnapshot[],
  updatedAt: string,
): EvaluatedCandidate | null {
  const base = rule.symbol.slice(0, 3);
  const quote = rule.symbol.slice(3, 6);
  const level = VARIANTS[rule.variant].entryGap;

  const emaSeries: number[] = [];
  let candidate: Candidate | null = null;
  let lastCrossoverIndex = -Infinity;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    if (!snap) continue;

    const baseScore = snap.scores[base];
    const quoteScore = snap.scores[quote];

    // Required scores missing/invalid -> removal + EMA continuity break.
    if (typeof baseScore !== "number" || typeof quoteScore !== "number") {
      candidate = null;
      emaSeries.length = 0;
      continue;
    }

    const gap = baseScore - quoteScore;
    const prev = emaSeries.length ? emaSeries[emaSeries.length - 1]! : null;
    const cur = prev === null ? gap : EMA_ALPHA * gap + (1 - EMA_ALPHA) * prev;
    const twoAgo = emaSeries.length >= 2 ? emaSeries[emaSeries.length - 2]! : null;
    const changeTwo = twoAgo === null ? null : cur - twoAgo;
    emaSeries.push(cur);

    const alignment = alignmentAt(snap, rule.symbol, gap);
    const inSession = isInSession(snap.asof, rule.session);

    // ── New crossover (only when no active candidate and cooldown has cleared) ──
    const bullCross =
      prev !== null && prev < level && cur >= level && changeTwo !== null && changeTwo >= 0;
    const bearCross =
      prev !== null && prev > -level && cur <= -level && changeTwo !== null && changeTwo <= 0;

    const cooldownClear = i - lastCrossoverIndex > COOLDOWN_SNAPSHOTS;

    if (candidate === null) {
      if (cooldownClear && bullCross && inSession && alignment === "bullish") {
        candidate = { direction: "bullish", state: "watching", fadeCounter: 0 };
        lastCrossoverIndex = i;
      } else if (cooldownClear && bearCross && inSession && alignment === "bearish") {
        candidate = { direction: "bearish", state: "watching", fadeCounter: 0 };
        lastCrossoverIndex = i;
      }
      // On the crossover snapshot we only create; transitions run next snapshot.
      continue;
    }

    // ── Lifecycle transitions for an existing candidate ──
    const dir = candidate.direction;
    const aligned = alignment === dir; // neutral or inverted both fail

    if (candidate.state === "watching") {
      // persist2: the immediately following snapshot is the second qualifying one.
      const confirmed = inSession && aligned && momentumHolds(cur, dir, level);
      if (confirmed) {
        candidate.state = "confirmed";
      } else {
        candidate = null; // failed to confirm -> removed (never a faked confirm)
      }
      continue;
    }

    if (candidate.state === "confirmed") {
      if (!inSession || !aligned) {
        candidate = null; // session end or alignment invalidation -> immediate removal
        continue;
      }
      const weakening = !momentumHolds(cur, dir, level) || changeOpposesDirection(changeTwo, dir);
      if (weakening) {
        candidate.state = "fading";
        candidate.fadeCounter = 0;
      }
      continue;
    }

    // candidate.state === "fading"
    if (!inSession || !aligned) {
      candidate = null; // alignment inversion / session end removes immediately (no fading carry)
      continue;
    }
    candidate.fadeCounter += 1;
    if (candidate.fadeCounter >= FADING_MAX_SNAPSHOTS) {
      candidate = null;
    }
  }

  if (!candidate) return null;

  return {
    ruleId: rule.id,
    symbol: rule.symbol,
    baseCode: base,
    quoteCode: quote,
    direction: candidate.direction,
    state: candidate.state,
    sessionLabel: sessionCustomerLabel(rule.session),
    variantIsStrict: isStrictVariant(rule.variant),
    updatedAt,
  };
}

/**
 * Evaluate every supplied rule against the snapshot window. Stale or empty data
 * yields zero candidates (not even Watching). Callers pass only the rules that
 * feature flags allow; this function never widens that set.
 */
export function evaluateRules(
  snapshots: NormalizedSnapshot[],
  rules: readonly EntryAssistRule[],
  now: Date,
): EvaluatedCandidate[] {
  if (isStale(snapshots, now)) return [];

  // Defensive normalization: dedupe on asof (keep latest created_at) and sort
  // ascending, even if the caller handed us out-of-order or duplicate rows.
  const byAsof = new Map<number, NormalizedSnapshot>();
  for (const snap of snapshots) {
    if (!(snap.asof instanceof Date) || Number.isNaN(snap.asof.getTime())) continue;
    const key = snap.asof.getTime();
    const existing = byAsof.get(key);
    if (!existing || snap.createdAt > existing.createdAt) byAsof.set(key, snap);
  }
  const ordered = [...byAsof.values()].sort((a, b) => a.asof.getTime() - b.asof.getTime());
  if (ordered.length === 0) return [];
  const newest = ordered[ordered.length - 1]!;
  const updatedAt = newest.asof.toISOString();

  const out: EvaluatedCandidate[] = [];
  for (const rule of rules) {
    const candidate = evaluateRule(rule, ordered, updatedAt);
    if (candidate) out.push(candidate);
  }
  return out;
}
