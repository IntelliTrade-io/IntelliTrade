import { describe, it, expect } from "vitest";
import { computeCompounding, MAX_PERIODS } from "./compounding";

describe("computeCompounding", () => {
  it("classic case: 1000 at 2%/period for 10 periods", () => {
    const r = computeCompounding({ startingBalance: 1000, ratePercent: 2, periods: 10 });
    // 1000 * 1.02^10 ≈ 1218.99
    expect(r.finalBalance).toBeCloseTo(1218.99, 1);
    expect(r.totalContributions).toBe(0);
    expect(r.totalGain).toBeCloseTo(218.99, 1);
    expect(r.totalReturnPercent).toBeCloseTo(21.899, 1);
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0]!).toMatchObject({ period: 1, start: 1000 });
    expect(r.rows[0]!.end).toBeCloseTo(1020);
    expect(r.rows[9]!.end).toBeCloseTo(r.finalBalance);
  });

  it("chains each period's end into the next period's start", () => {
    const r = computeCompounding({ startingBalance: 500, ratePercent: 5, periods: 3 });
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i]!.start).toBeCloseTo(r.rows[i - 1]!.end);
    }
  });

  it("applies a per-period contribution at period end", () => {
    const r = computeCompounding({ startingBalance: 1000, ratePercent: 0, periods: 3, contribution: 100 });
    // 0% growth: pure additions → 1300
    expect(r.finalBalance).toBeCloseTo(1300);
    expect(r.totalContributions).toBe(300);
    expect(r.totalGain).toBeCloseTo(0);
    expect(r.rows[0]!.end).toBeCloseTo(1100);
  });

  it("handles negative returns (drawdown)", () => {
    const r = computeCompounding({ startingBalance: 1000, ratePercent: -10, periods: 2 });
    // 1000 * 0.9^2 = 810
    expect(r.finalBalance).toBeCloseTo(810);
    expect(r.totalGain).toBeCloseTo(-190);
  });

  it("clamps periods to MAX_PERIODS and flags capped", () => {
    const r = computeCompounding({ startingBalance: 1000, ratePercent: 1, periods: MAX_PERIODS + 50 });
    expect(r.rows).toHaveLength(MAX_PERIODS);
    expect(r.capped).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(() => computeCompounding({ startingBalance: -1, ratePercent: 2, periods: 5 })).toThrow("Starting balance");
    expect(() => computeCompounding({ startingBalance: 1000, ratePercent: 2, periods: 0 })).toThrow("Periods");
  });
});
