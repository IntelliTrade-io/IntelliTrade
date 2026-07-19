// Weekly strength digest generator — pure shaping, no I/O. Turns a week of
// daily snapshot history (the /api/currency-strength-history point shape) plus
// the latest reading into the newsletter body ("The weekly strength recap")
// promised by the signup form, and doubles as the source for a public recap
// post. The send/publish step lives with the caller once an email provider is
// wired up.
//
// Language rules: measurement of what happened, never forecasts or
// recommendations. Every sentence must survive the not-a-signals-service test.

import type { Scores } from "./strength";
import { CURRENCIES, scanState, scanConfidence, type PairsDetail } from "./strength";
import { computeRegimeFlips, type RegimeHistoryPoint } from "./strengthRegime";

export type DigestInput = {
  /** Oldest → newest daily history points covering the week. */
  points: RegimeHistoryPoint[];
  /** The latest daily reading's per-currency scores. */
  scores: Scores;
  /** The latest daily reading's stored per-pair detail (may be null). */
  pairs?: PairsDetail | null;
  /** ISO timestamp of the latest reading, for the dateline. */
  snapshotAtUtc: string;
};

export type Digest = {
  subject: string;
  dateline: string;
  bullets: string[];
  regimeChanges: string[];
  disclaimer: string;
};

const fmtScore = (n: number): string => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

/** Largest score change over the window per currency, from the history points. */
function weeklyDeltas(points: RegimeHistoryPoint[]): Map<string, number> {
  const deltas = new Map<string, number>();
  if (points.length < 2) return deltas;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (const code of CURRENCIES) {
    const a = first[code];
    const b = last[code];
    if (typeof a === "number" && typeof b === "number" && isFinite(a) && isFinite(b)) {
      deltas.set(code, Math.round((b - a) * 10) / 10);
    }
  }
  return deltas;
}

export function buildWeeklyDigest(input: DigestInput): Digest {
  const { points, scores, pairs, snapshotAtUtc } = input;

  const ranked = CURRENCIES.filter((c) => c in scores).sort(
    (a, b) => (scores[b]?.score ?? 0) - (scores[a]?.score ?? 0),
  );
  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];

  const deltas = weeklyDeltas(points);
  let riser: string | null = null;
  let faller: string | null = null;
  for (const [code, d] of deltas) {
    if (riser === null || d > (deltas.get(riser) ?? -Infinity)) riser = code;
    if (faller === null || d < (deltas.get(faller) ?? Infinity)) faller = code;
  }

  const bullets: string[] = [];
  if (leader && laggard && leader !== laggard) {
    bullets.push(
      `${leader} closed the week as the strongest of the eight majors (${fmtScore(scores[leader]!.score)}); ${laggard} read weakest (${fmtScore(scores[laggard]!.score)}).`,
    );
  }
  if (riser && deltas.get(riser)! > 0) {
    bullets.push(`Biggest gainer on the week: ${riser}, ${fmtScore(deltas.get(riser)!)} points.`);
  }
  if (faller && deltas.get(faller)! < 0 && faller !== riser) {
    bullets.push(`Biggest decline: ${faller}, ${fmtScore(deltas.get(faller)!)} points.`);
  }

  // Confirmed pairs from the stored scanner detail: count + the highest-
  // confidence read, described as a measurement of the week's close.
  if (pairs) {
    let confirmed = 0;
    let top: { symbol: string; state: string; confidence: number } | null = null;
    for (const [symbol, detail] of Object.entries(pairs)) {
      const state = scanState(detail?.pair);
      const confidence = detail === undefined ? null : scanConfidence(detail.confidence);
      if (!state || state === "Neutral" || confidence === null) continue;
      confirmed += 1;
      if (!top || confidence > top.confidence) {
        top = { symbol, state: state.toLowerCase(), confidence };
      }
    }
    if (confirmed > 0 && top) {
      bullets.push(
        `The scanner ended the week with ${confirmed} pair${confirmed === 1 ? "" : "s"} in timeframe agreement; the cleanest read was ${top.symbol} (${top.state}, confidence ${top.confidence}/100).`,
      );
    } else {
      bullets.push("The scanner ended the week with no pairs in timeframe agreement — a mixed close.");
    }
  }

  const regimeChanges = computeRegimeFlips(points, CURRENCIES).map(
    (f) => `${f.code} moved ${f.from} → ${f.to} on ${fmtDay(f.ts)} (score ${fmtScore(f.score)}).`,
  );

  return {
    subject: leader && laggard && leader !== laggard
      ? `Weekly strength recap: ${leader} led, ${laggard} lagged`
      : "Weekly strength recap",
    dateline: `Reading of ${fmtDay(snapshotAtUtc)} (UTC), measured across all 28 major pairs.`,
    bullets,
    regimeChanges,
    disclaimer:
      "This recap measures what already happened in the market. It is not a trade recommendation, forecast, or signal.",
  };
}

/** Plain-text rendering — works as an email body and as a paste-anywhere recap. */
export function renderDigestText(d: Digest): string {
  const lines: string[] = [d.subject, "", d.dateline, ""];
  for (const b of d.bullets) lines.push(`• ${b}`);
  if (d.regimeChanges.length > 0) {
    lines.push("", "Regime changes this week:");
    for (const r of d.regimeChanges) lines.push(`• ${r}`);
  }
  lines.push("", d.disclaimer);
  return lines.join("\n");
}
