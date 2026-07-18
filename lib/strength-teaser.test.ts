import { describe, it, expect } from "vitest";
import { buildTeaserReadings, summariseExtremes, type SnapshotCurrencies } from "./strength-teaser";

const full = (overrides: SnapshotCurrencies = {}): SnapshotCurrencies => ({
  USD: { score: -2.5, bias: "Neutral" },
  EUR: { score: -66.9, bias: "Weak" },
  GBP: { score: 100, bias: "Strong" },
  JPY: { score: -100, bias: "Weak" },
  AUD: { score: -61.9, bias: "Weak" },
  NZD: { score: 100, bias: "Strong" },
  CAD: { score: 45.3, bias: "Strong" },
  CHF: { score: 0, bias: "Neutral" },
  ...overrides,
});

describe("buildTeaserReadings", () => {
  it("ranks strongest first with clamped, rounded scores", () => {
    const readings = buildTeaserReadings(full({ GBP: { score: 123.45, bias: "Strong" } }));
    expect(readings).toHaveLength(8);
    expect(readings[0]).toMatchObject({ code: "GBP", score: 100 });
    expect(readings[readings.length - 1]).toMatchObject({ code: "JPY", score: -100 });
    const scores = readings.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("returns [] when any currency is missing a numeric score", () => {
    expect(buildTeaserReadings(full({ CHF: {} }))).toEqual([]);
    expect(buildTeaserReadings(full({ CHF: undefined }))).toEqual([]);
    expect(buildTeaserReadings(null)).toEqual([]);
    expect(
      buildTeaserReadings(full({ CHF: { score: NaN, bias: "Neutral" } })),
    ).toEqual([]);
  });

  it("uses the scanner bias and falls back to score bands", () => {
    const readings = buildTeaserReadings(
      full({ USD: { score: 40 }, CHF: { score: -20 }, CAD: { score: 5, bias: "bogus" } }),
    );
    const byCode = Object.fromEntries(readings.map((r) => [r.code, r]));
    expect(byCode.USD?.bias).toBe("Strong"); // no bias field, score > 15
    expect(byCode.CHF?.bias).toBe("Weak"); // no bias field, score < -15
    expect(byCode.CAD?.bias).toBe("Neutral"); // invalid bias, |score| within band
    expect(byCode.EUR?.bias).toBe("Weak"); // scanner-provided bias wins
  });

  it("computes per-currency deltas vs the previous snapshot", () => {
    const readings = buildTeaserReadings(full(), full({ GBP: { score: 80 }, JPY: { score: -50 } }));
    const byCode = Object.fromEntries(readings.map((r) => [r.code, r]));
    expect(byCode.GBP?.delta).toBe(20);
    expect(byCode.JPY?.delta).toBe(-50);
    expect(byCode.USD?.delta).toBe(0);
  });

  it("leaves delta null without a previous snapshot or previous score", () => {
    const noPrev = buildTeaserReadings(full());
    expect(noPrev.every((r) => r.delta === null)).toBe(true);

    const partialPrev = buildTeaserReadings(full(), { GBP: { score: 90 } });
    const byCode = Object.fromEntries(partialPrev.map((r) => [r.code, r]));
    expect(byCode.GBP?.delta).toBe(10);
    expect(byCode.EUR?.delta).toBeNull();
  });
});

describe("summariseExtremes", () => {
  it("picks up to two currencies per side from the ranked list", () => {
    const { strongest, weakest } = summariseExtremes(buildTeaserReadings(full()));
    expect(strongest).toEqual(["GBP", "NZD"]);
    expect(weakest).toEqual(["EUR", "JPY"]);
  });

  it("returns empty sides when everything is neutral", () => {
    const neutral: SnapshotCurrencies = Object.fromEntries(
      ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"].map((c) => [
        c,
        { score: 0, bias: "Neutral" },
      ]),
    );
    const { strongest, weakest } = summariseExtremes(buildTeaserReadings(neutral));
    expect(strongest).toEqual([]);
    expect(weakest).toEqual([]);
  });
});
