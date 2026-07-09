import { describe, it, expect } from "vitest";
import {
  approxConf,
  pairState,
  getCanonicalPair,
  computeExpressions,
  computeMatrixCell,
  type Scores,
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
  });

  it("treats missing scores as 0", () => {
    const cell = computeMatrixCell("EUR", "USD", scores({}));
    expect(cell.state).toBe("Neutral");
    expect(cell.spread).toBe(0);
  });
});
