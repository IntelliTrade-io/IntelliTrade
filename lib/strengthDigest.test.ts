import { describe, it, expect } from "vitest";
import { buildWeeklyDigest, renderDigestText } from "./strengthDigest";
import type { Scores } from "./strength";

function scores(map: Record<string, number>): Scores {
  return Object.fromEntries(
    Object.entries(map).map(([code, score]) => [
      code,
      { score, rawScore: score, bias: "Neutral" } as const,
    ]),
  );
}

const week = [
  { ts: "2026-07-13T20:00:00Z", EUR: 10, USD: 30, JPY: -5 },
  { ts: "2026-07-15T20:00:00Z", EUR: 25, USD: 10, JPY: -20 },
  { ts: "2026-07-17T20:00:00Z", EUR: 60, USD: -20, JPY: -40 },
];

const latest = scores({ EUR: 60, USD: -20, JPY: -40 });

describe("buildWeeklyDigest", () => {
  it("names the leader and laggard from the latest reading", () => {
    const d = buildWeeklyDigest({ points: week, scores: latest, snapshotAtUtc: "2026-07-17T20:00:00Z" });
    expect(d.subject).toBe("Weekly strength recap: EUR led, JPY lagged");
    expect(d.bullets[0]).toContain("EUR closed the week as the strongest");
    expect(d.bullets[0]).toContain("(+60.0)");
    expect(d.bullets[0]).toContain("JPY read weakest (-40.0)");
  });

  it("reports biggest weekly gainer and decline from the window deltas", () => {
    const d = buildWeeklyDigest({ points: week, scores: latest, snapshotAtUtc: "2026-07-17T20:00:00Z" });
    expect(d.bullets).toContainEqual(expect.stringContaining("Biggest gainer on the week: EUR, +50.0"));
    expect(d.bullets).toContainEqual(expect.stringContaining("Biggest decline: USD, -50.0"));
  });

  it("summarizes confirmed pairs from stored detail, picking the top confidence", () => {
    const d = buildWeeklyDigest({
      points: week,
      scores: latest,
      pairs: {
        EURUSD: { pair: "bullish", confidence: 80 },
        EURJPY: { pair: "bullish", confidence: 95 },
        USDJPY: { pair: "neutral", confidence: 0 },
      },
      snapshotAtUtc: "2026-07-17T20:00:00Z",
    });
    const pairBullet = d.bullets.find((b) => b.includes("timeframe agreement"))!;
    expect(pairBullet).toContain("2 pairs in timeframe agreement");
    expect(pairBullet).toContain("EURJPY (bullish, confidence 95/100)");
  });

  it("states a mixed close when nothing is confirmed", () => {
    const d = buildWeeklyDigest({
      points: week,
      scores: latest,
      pairs: { EURUSD: { pair: "neutral", confidence: 0 } },
      snapshotAtUtc: "2026-07-17T20:00:00Z",
    });
    expect(d.bullets).toContainEqual(expect.stringContaining("no pairs in timeframe agreement"));
  });

  it("lists regime changes with dates", () => {
    const d = buildWeeklyDigest({ points: week, scores: latest, snapshotAtUtc: "2026-07-17T20:00:00Z" });
    // EUR 10 -> 25 crosses into Strong on the 15th; USD 30 -> 10 leaves Strong; USD -> -20 into Weak on 17th; JPY -5 -> -20 into Weak.
    expect(d.regimeChanges).toContainEqual(expect.stringContaining("EUR moved Neutral → Strong on Jul 15"));
    expect(d.regimeChanges).toContainEqual(expect.stringContaining("USD moved Neutral → Weak on Jul 17"));
  });

  it("degrades to a generic subject on a single-currency reading", () => {
    const d = buildWeeklyDigest({ points: [], scores: scores({ EUR: 10 }), snapshotAtUtc: "2026-07-17T20:00:00Z" });
    expect(d.subject).toBe("Weekly strength recap");
    expect(d.bullets).toHaveLength(0);
  });
});

describe("renderDigestText", () => {
  it("renders subject, dateline, bullets, regime section, and disclaimer", () => {
    const text = renderDigestText(
      buildWeeklyDigest({ points: week, scores: latest, snapshotAtUtc: "2026-07-17T20:00:00Z" }),
    );
    expect(text).toContain("Weekly strength recap: EUR led, JPY lagged");
    expect(text).toContain("Reading of Jul 17 (UTC)");
    expect(text).toContain("Regime changes this week:");
    expect(text).toContain("not a trade recommendation");
  });
});
