import { describe, it, expect } from "vitest";
import { bandFor, computeRegimeFlips, latestRegimeFlips } from "./strengthRegime";

const CCY = ["EUR", "USD"] as const;

function pt(ts: string, scores: Record<string, number>) {
  return { ts, ...scores };
}

describe("bandFor", () => {
  it("uses ±15 inclusive band edges", () => {
    expect(bandFor(15)).toBe("Strong");
    expect(bandFor(14.9)).toBe("Neutral");
    expect(bandFor(-15)).toBe("Weak");
    expect(bandFor(-14.9)).toBe("Neutral");
    expect(bandFor(0)).toBe("Neutral");
  });
});

describe("computeRegimeFlips", () => {
  it("emits a flip at the first point inside the new band", () => {
    const flips = computeRegimeFlips(
      [
        pt("t1", { EUR: 10, USD: 0 }),
        pt("t2", { EUR: 20, USD: 0 }),
        pt("t3", { EUR: 30, USD: 0 }),
      ],
      CCY,
    );
    expect(flips).toEqual([{ code: "EUR", from: "Neutral", to: "Strong", ts: "t2", score: 20 }]);
  });

  it("does not emit a flip for the series' starting band", () => {
    expect(computeRegimeFlips([pt("t1", { EUR: 80, USD: -80 })], CCY)).toEqual([]);
  });

  it("tracks multiple currencies independently and in order", () => {
    const flips = computeRegimeFlips(
      [
        pt("t1", { EUR: 0, USD: 20 }),
        pt("t2", { EUR: -20, USD: 20 }),
        pt("t3", { EUR: -20, USD: -20 }),
      ],
      CCY,
    );
    expect(flips.map((f) => `${f.code}:${f.from}->${f.to}@${f.ts}`)).toEqual([
      "EUR:Neutral->Weak@t2",
      "USD:Strong->Weak@t3",
    ]);
  });

  it("records direct Strong->Weak crossings without a synthetic Neutral step", () => {
    const flips = computeRegimeFlips([pt("t1", { EUR: 40, USD: 0 }), pt("t2", { EUR: -40, USD: 0 })], CCY);
    expect(flips).toEqual([{ code: "EUR", from: "Strong", to: "Weak", ts: "t2", score: -40 }]);
  });

  it("skips missing or non-numeric scores without losing band state", () => {
    const flips = computeRegimeFlips(
      [
        pt("t1", { EUR: 20 }),
        { ts: "t2", EUR: "bad" as unknown as number },
        pt("t3", { EUR: -20 }),
      ],
      CCY,
    );
    expect(flips).toEqual([{ code: "EUR", from: "Strong", to: "Weak", ts: "t3", score: -20 }]);
  });
});

describe("latestRegimeFlips", () => {
  it("returns the newest flips first, capped at the limit", () => {
    const points = [
      pt("t1", { EUR: 0 }),
      pt("t2", { EUR: 20 }),
      pt("t3", { EUR: 0 }),
      pt("t4", { EUR: -20 }),
    ];
    const flips = latestRegimeFlips(points, CCY, 2);
    expect(flips.map((f) => f.ts)).toEqual(["t4", "t3"]);
  });
});
