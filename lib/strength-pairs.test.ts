import { describe, it, expect } from "vitest";
import { buildTeaserReadings, type SnapshotCurrencies } from "./strength-teaser";
import {
  STRENGTH_PAIR_SYMBOLS,
  buildPairStrengthView,
  relatedStrengthPairs,
  strengthPairFromSlug,
  strengthPairToSlug,
  type SnapshotPairs,
} from "./strength-pairs";

const snapshot: SnapshotCurrencies = {
  USD: { score: -2.5, bias: "Neutral" },
  EUR: { score: -66.9, bias: "Weak" },
  GBP: { score: 100, bias: "Strong" },
  JPY: { score: -100, bias: "Weak" },
  AUD: { score: -61.9, bias: "Weak" },
  NZD: { score: 100, bias: "Strong" },
  CAD: { score: 45.3, bias: "Strong" },
  CHF: { score: 0, bias: "Neutral" },
};

const readings = buildTeaserReadings(snapshot);

describe("slug mapping", () => {
  it("covers all 28 standard pairs and round-trips", () => {
    expect(STRENGTH_PAIR_SYMBOLS).toHaveLength(28);
    for (const symbol of STRENGTH_PAIR_SYMBOLS) {
      expect(strengthPairFromSlug(strengthPairToSlug(symbol))).toBe(symbol);
    }
  });

  it("rejects unknown and non-canonical slugs", () => {
    expect(strengthPairFromSlug("usdeur")).toBeNull(); // inverse of a standard pair
    expect(strengthPairFromSlug("xauusd")).toBeNull(); // not an FX major pair
    expect(strengthPairFromSlug("nonsense")).toBeNull();
  });
});

describe("buildPairStrengthView", () => {
  it("ranks both legs and computes the differential toward the base", () => {
    const view = buildPairStrengthView("GBPJPY", readings);
    expect(view).not.toBeNull();
    expect(view!.display).toBe("GBP/JPY");
    expect(view!.baseReading.code).toBe("GBP");
    expect(view!.baseReading.rank).toBe(1);
    expect(view!.quoteReading.code).toBe("JPY");
    expect(view!.quoteReading.rank).toBe(8);
    expect(view!.differential).toBe(200);
  });

  it("returns a negative differential when the quote read stronger", () => {
    const view = buildPairStrengthView("EURUSD", readings);
    expect(view!.differential).toBeCloseTo(-64.4, 5);
  });

  it("returns null for unknown symbols or missing readings", () => {
    expect(buildPairStrengthView("USDEUR", readings)).toBeNull();
    expect(buildPairStrengthView("EURUSD", [])).toBeNull();
  });

  it("parses scanner detail and drops malformed fields", () => {
    const pairs: SnapshotPairs = {
      EURUSD: {
        d1: "bullish",
        h4: "bearish",
        pair: "neutral",
        confidence: 50.4,
        last_bos_d1: 1.14729,
        last_bos_d1_time: "2026-07-02 00:00:00+00:00",
        last_bos_h4: 0, // scanner writes 0 when no BOS found
        last_bos_h4_time: "",
      },
    };
    const detail = buildPairStrengthView("EURUSD", readings, pairs)!.detail;
    expect(detail).toEqual({
      d1: "bullish",
      h4: "bearish",
      combined: "neutral",
      confidence: 50,
      bosD1: { level: 1.14729, timeUtc: "2026-07-02 00:00:00+00:00" },
      bosH4: null,
    });
  });

  it("returns null detail when the pair entry is absent or empty", () => {
    expect(buildPairStrengthView("EURUSD", readings, {})!.detail).toBeNull();
    expect(
      buildPairStrengthView("EURUSD", readings, { EURUSD: { d1: "garbage", h4: undefined } })!.detail,
    ).toBeNull();
  });
});

describe("relatedStrengthPairs", () => {
  it("returns siblings sharing a currency, excluding self", () => {
    const related = relatedStrengthPairs("EURUSD");
    expect(related).not.toContain("EURUSD");
    expect(related.length).toBeGreaterThan(0);
    expect(related.length).toBeLessThanOrEqual(8);
    for (const s of related) {
      expect(s.includes("EUR") || s.includes("USD")).toBe(true);
    }
  });
});
