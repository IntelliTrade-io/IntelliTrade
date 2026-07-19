import { describe, it, expect } from "vitest";
import {
  approxConf,
  pairState,
  getCanonicalPair,
  computeExpressions,
  computeMatrixCell,
  scanState,
  scanConfidence,
  type Scores,
  type PairsDetail,
} from "./strength";

function scores(map: Record<string, number>): Scores {
  return Object.fromEntries(
    Object.entries(map).map(([code, score]) => [
      code,
      { score, rawScore: score, bias: score > 15 ? "Strong" : score < -15 ? "Weak" : "Neutral" } as const,
    ]),
  );
}

describe("approxConf", () => {
  it("averages absolute magnitudes and rounds", () => {
    expect(approxConf(40, -20)).toBe(30);
    expect(approxConf(-33, 0)).toBe(17); // 16.5 rounds up
    expect(approxConf(0, 0)).toBe(0);
  });
});

describe("pairState", () => {
  it("is Bullish only when base leads by more than 15", () => {
    expect(pairState(20, 0)).toBe("Bullish");
    expect(pairState(15, 0)).toBe("Neutral"); // boundary is exclusive
  });
  it("is Bearish only when quote leads by more than 15", () => {
    expect(pairState(0, 20)).toBe("Bearish");
    expect(pairState(0, 15)).toBe("Neutral");
  });
});

describe("getCanonicalPair", () => {
  it("keeps market convention regardless of argument order", () => {
    expect(getCanonicalPair("USD", "EUR")).toEqual({ base: "EUR", quote: "USD" });
    expect(getCanonicalPair("EUR", "USD")).toEqual({ base: "EUR", quote: "USD" });
    expect(getCanonicalPair("JPY", "USD")).toEqual({ base: "USD", quote: "JPY" });
  });
  it("falls back to alphabetical for non-standard pairs", () => {
    expect(getCanonicalPair("ZZZ", "AAA")).toEqual({ base: "AAA", quote: "ZZZ" });
  });
});

describe("computeExpressions", () => {
  it("emits a pair only when one side is strong (>15) and the other weak (<-15)", () => {
    const exprs = computeExpressions(scores({ EUR: 40, USD: -30, GBP: 10, JPY: -10 }));
    expect(exprs).toHaveLength(1);
    expect(exprs[0]!.symbol).toBe("EUR/USD");
    expect(exprs[0]!.state).toBe("Bullish");
    expect(exprs[0]!.summary).toBe("EUR strong vs USD weak");
  });

  it("marks the pair Bearish when the strong currency is the quote", () => {
    const exprs = computeExpressions(scores({ EUR: -40, USD: 30 }));
    expect(exprs).toHaveLength(1);
    expect(exprs[0]!.symbol).toBe("EUR/USD");
    expect(exprs[0]!.state).toBe("Bearish");
  });

  it("computes spread, confidence, and opportunity from the two magnitudes", () => {
    const expr = computeExpressions(scores({ EUR: 40, USD: -20 }))[0]!;
    expect(expr.spread).toBe(60);
    expect(expr.confidence).toBe(30);
    expect(expr.opportunity).toBe(18); // 60 * 30 / 100
  });

  it("returns the top 6 by opportunity when many qualify", () => {
    const s = scores({ EUR: 90, GBP: 80, AUD: 70, USD: -90, JPY: -80, CAD: -70 });
    const exprs = computeExpressions(s);
    expect(exprs).toHaveLength(6); // 9 qualifying combos capped at 6
    const opps = exprs.map((e) => e.opportunity);
    expect(opps).toEqual([...opps].sort((a, b) => b - a));
  });

  it("ignores currencies missing from the score map", () => {
    expect(computeExpressions(scores({ EUR: 40 }))).toHaveLength(0);
  });
});

describe("computeMatrixCell", () => {
  it("canonicalizes the pair and derives state from canonical base vs quote", () => {
    const cell = computeMatrixCell("USD", "EUR", scores({ EUR: 30, USD: -10 }));
    expect(cell.symbol).toBe("EUR/USD");
    expect(cell.state).toBe("Bullish");
    expect(cell.spread).toBe(40);
    expect(cell.confidence).toBe(20);
    expect(cell.source).toBe("approximation");
  });

  it("treats missing scores as 0", () => {
    const cell = computeMatrixCell("EUR", "USD", scores({}));
    expect(cell.state).toBe("Neutral");
    expect(cell.spread).toBe(0);
  });
});

describe("scanState / scanConfidence", () => {
  it("maps scanner trend strings and rejects garbage", () => {
    expect(scanState("bullish")).toBe("Bullish");
    expect(scanState("bearish")).toBe("Bearish");
    expect(scanState("neutral")).toBe("Neutral");
    expect(scanState("")).toBeNull();
    expect(scanState(undefined)).toBeNull();
    expect(scanState("BULLISH")).toBeNull();
  });

  it("clamps and rounds confidence, rejecting non-finite values", () => {
    expect(scanConfidence(66.666)).toBe(67);
    expect(scanConfidence(0)).toBe(0);
    expect(scanConfidence(120)).toBe(100);
    expect(scanConfidence(-5)).toBe(0);
    expect(scanConfidence(NaN)).toBeNull();
    expect(scanConfidence(undefined)).toBeNull();
  });
});

describe("computeExpressions with stored pair data", () => {
  const s = scores({ EUR: 40, USD: -30, GBP: 20, JPY: -25 });

  it("uses the scanner's combined state and confidence, not the approximation", () => {
    const pairs: PairsDetail = {
      EURUSD: { pair: "bullish", confidence: 80, d1: "bullish", h4: "bullish" },
      GBPJPY: { pair: "neutral", confidence: 0, d1: "bullish", h4: "bearish" },
    };
    const exprs = computeExpressions(s, pairs);
    expect(exprs).toHaveLength(1);
    const e = exprs[0]!;
    expect(e.symbol).toBe("EUR/USD");
    expect(e.source).toBe("scanner");
    expect(e.confidence).toBe(80);
    expect(e.spread).toBe(70); // |40| + |-30|, unchanged as the divergence display
    expect(e.opportunity).toBe(56); // 70 * 80 / 100
    expect(e.tfSlow).toBe("Bullish");
    expect(e.tfFast).toBe("Bullish");
  });

  it("ranks by real confidence — high-spread pairs no longer always win", () => {
    // Handoff mismatch example: the approximation ranked the widest spread
    // first; real MTFA confidence must reorder.
    const sc = scores({ AUD: 100, NZD: -100, CAD: -81 });
    const pairs: PairsDetail = {
      AUDNZD: { pair: "bearish", confidence: 65 },
      AUDCAD: { pair: "bullish", confidence: 100 },
    };
    const exprs = computeExpressions(sc, pairs);
    expect(exprs.map((e) => e.symbol)).toEqual(["AUD/CAD", "AUD/NZD"]);
    expect(exprs[0]!.opportunity).toBeGreaterThan(exprs[1]!.opportunity);
  });

  it("takes direction from the scanner even when the score gate would disagree", () => {
    // Both currencies mid-range: the approximation's strong/weak gate would
    // drop this pair entirely; the scanner's confirmed read keeps it.
    const sc = scores({ EUR: 10, USD: -5 });
    const pairs: PairsDetail = { EURUSD: { pair: "bearish", confidence: 40 } };
    const exprs = computeExpressions(sc, pairs);
    expect(exprs).toHaveLength(1);
    expect(exprs[0]!.state).toBe("Bearish");
    expect(exprs[0]!.summary).toBe("USD strong vs EUR weak");
  });

  it("returns empty when the scanner confirms nothing (no silent fallback)", () => {
    const pairs: PairsDetail = {
      EURUSD: { pair: "neutral", confidence: 0 },
      GBPJPY: { pair: "neutral", confidence: 0 },
    };
    expect(computeExpressions(s, pairs)).toHaveLength(0);
  });

  it("falls back to the approximation when pair data is absent or unusable", () => {
    const approx = computeExpressions(s);
    expect(computeExpressions(s, null)).toEqual(approx);
    expect(computeExpressions(s, {})).toEqual(approx);
    expect(computeExpressions(s, { EURUSD: { pair: "garbage" } })).toEqual(approx);
    expect(approx.every((e) => e.source === "approximation")).toBe(true);
  });

  it("maps intraday h1/m15 states onto the timeframe fields", () => {
    const pairs: PairsDetail = {
      EURUSD: { pair: "bullish", confidence: 50, h1: "bullish", m15: "bearish" },
    };
    const e = computeExpressions(s, pairs)[0]!;
    expect(e.tfSlow).toBe("Bullish");
    expect(e.tfFast).toBe("Bearish");
  });
});

describe("computeMatrixCell with stored pair data", () => {
  const s = scores({ EUR: 30, USD: -10 });

  it("uses the stored state and confidence for the cell", () => {
    const pairs: PairsDetail = { EURUSD: { pair: "bearish", confidence: 55 } };
    const cell = computeMatrixCell("USD", "EUR", s, pairs);
    expect(cell.state).toBe("Bearish");
    expect(cell.confidence).toBe(55);
    expect(cell.source).toBe("scanner");
    expect(cell.spread).toBe(40); // divergence display still from scores
  });

  it("keeps a truthful stored Neutral with 0% instead of approximating", () => {
    const pairs: PairsDetail = { EURUSD: { pair: "neutral", confidence: 0 } };
    const cell = computeMatrixCell("EUR", "USD", s, pairs);
    expect(cell.state).toBe("Neutral");
    expect(cell.confidence).toBe(0);
    expect(cell.source).toBe("scanner");
  });

  it("falls back per cell when that pair has no stored detail", () => {
    const pairs: PairsDetail = { GBPJPY: { pair: "bullish", confidence: 70 } };
    const cell = computeMatrixCell("EUR", "USD", s, pairs);
    expect(cell.source).toBe("approximation");
    expect(cell.state).toBe("Bullish");
    expect(cell.confidence).toBe(20);
  });
});
