import { describe, it, expect } from "vitest";
import {
  normalizePair,
  parsePair,
  pipSizeFor,
  contractSizeFor,
  composePairsFrom,
  rateFromUsdRates,
  computeLotSize,
  computePipValue,
} from "./lot-size";

describe("pair parsing", () => {
  it("normalizes slashes and case", () => {
    expect(normalizePair("eur/usd")).toBe("EURUSD");
  });
  it("splits base and quote", () => {
    expect(parsePair("EUR/USD")).toEqual({ base: "EUR", quote: "USD" });
  });
  it("rejects malformed pairs", () => {
    expect(() => parsePair("EURUS")).toThrow();
  });
});

describe("instrument conventions", () => {
  it("pip sizes", () => {
    expect(pipSizeFor("EURUSD")).toBe(0.0001);
    expect(pipSizeFor("USDJPY")).toBe(0.01);
    expect(pipSizeFor("XAUUSD")).toBe(0.01);
    expect(pipSizeFor("BTCUSD")).toBe(1);
  });
  it("contract sizes", () => {
    expect(contractSizeFor("EURUSD")).toBe(100000);
    expect(contractSizeFor("XAUUSD")).toBe(100);
    expect(contractSizeFor("XAGUSD")).toBe(5000);
    expect(contractSizeFor("ETHUSD")).toBe(1);
  });
});

describe("composePairsFrom", () => {
  it("builds majors both ways, crosses, and metals only from available codes", () => {
    const pairs = composePairsFrom(new Set(["EUR", "USD", "JPY", "XAU"]));
    expect(pairs).toContain("EURUSD");
    expect(pairs).toContain("USDEUR");
    expect(pairs).toContain("EURJPY");
    expect(pairs).toContain("XAUUSD");
    expect(pairs).not.toContain("GBPUSD"); // GBP not available
  });
  it("returns nothing without USD", () => {
    expect(composePairsFrom(new Set(["EUR", "GBP"]))).toEqual(["EURGBP"]);
  });
});

describe("rateFromUsdRates", () => {
  // /api/rates values are "units per USD"
  const rates = { EUR: "0.90", JPY: "150", GBP: "0.80" };

  it("USD base: returns quote per USD", () => {
    expect(rateFromUsdRates("USD", "JPY", rates)).toBe(150);
  });
  it("USD quote: inverts the base rate", () => {
    expect(rateFromUsdRates("EUR", "USD", rates)).toBeCloseTo(1 / 0.9);
  });
  it("cross: quote-per-USD over base-per-USD", () => {
    expect(rateFromUsdRates("EUR", "JPY", rates)).toBeCloseTo(150 / 0.9);
  });
  it("throws on missing rate", () => {
    expect(() => rateFromUsdRates("AUD", "USD", rates)).toThrow("Invalid API rates");
  });
});

describe("computeLotSize", () => {
  it("classic FX case: USD account, EURUSD", () => {
    // 10,000 balance, 1% risk = 100 at risk; 50-pip stop;
    // pip/lot = 0.0001 * 1 * 100,000 = 10 → risk/lot 500 → 0.2 lots
    const r = computeLotSize({ balance: 10_000, riskPercent: 1, stopLossPips: 50, pair: "EURUSD", quoteToAccount: 1 });
    expect(r.riskAmount).toBe(100);
    expect(r.pipValuePerLot).toBe(10);
    expect(r.lots).toBeCloseTo(0.2);
  });

  it("applies quote->account conversion (EUR account, EURUSD)", () => {
    // USD quote converted to EUR at 0.9: pip/lot = 9 EUR
    const r = computeLotSize({ balance: 9_000, riskPercent: 2, stopLossPips: 20, pair: "EUR/USD", quoteToAccount: 0.9 });
    expect(r.pipValuePerLot).toBeCloseTo(9);
    expect(r.riskAmount).toBe(180);
    expect(r.lots).toBeCloseTo(180 / (20 * 9));
  });

  it("JPY pair uses 0.01 pip size", () => {
    // pip/lot = 0.01 * quoteToAccount * 100,000
    const r = computeLotSize({ balance: 10_000, riskPercent: 1, stopLossPips: 30, pair: "USDJPY", quoteToAccount: 1 / 150 });
    expect(r.pipValuePerLot).toBeCloseTo(1000 / 150);
    expect(r.lots).toBeCloseTo(100 / (30 * (1000 / 150)));
  });

  it("gold contract: 100 oz per lot", () => {
    const r = computeLotSize({ balance: 5_000, riskPercent: 1, stopLossPips: 100, pair: "XAUUSD", quoteToAccount: 1 });
    // pip/lot = 0.01 * 100 = 1 → risk/lot 100 → 0.5 lots
    expect(r.pipValuePerLot).toBe(1);
    expect(r.lots).toBeCloseTo(0.5);
  });

  it("rejects non-positive risk per lot", () => {
    expect(() =>
      computeLotSize({ balance: 1_000, riskPercent: 1, stopLossPips: 0, pair: "EURUSD", quoteToAccount: 1 }),
    ).toThrow("risk per lot");
  });
});

describe("computePipValue", () => {
  it("classic FX case: USD account, EURUSD (pip/lot = 10)", () => {
    const r = computePipValue({ pair: "EURUSD", lots: 1, quoteToAccount: 1 });
    expect(r.perStandardLot).toBe(10);
    expect(r.perMiniLot).toBeCloseTo(1);
    expect(r.perMicroLot).toBeCloseTo(0.1);
    expect(r.forLots).toBe(10);
  });

  it("scales by position size", () => {
    const r = computePipValue({ pair: "EURUSD", lots: 2.5, quoteToAccount: 1 });
    expect(r.forLots).toBeCloseTo(25);
  });

  it("applies quote->account conversion (EUR account, EURUSD at 0.9)", () => {
    const r = computePipValue({ pair: "EUR/USD", lots: 1, quoteToAccount: 0.9 });
    expect(r.perStandardLot).toBeCloseTo(9);
  });

  it("JPY pair uses 0.01 pip size", () => {
    const r = computePipValue({ pair: "USDJPY", lots: 1, quoteToAccount: 1 / 150 });
    expect(r.perStandardLot).toBeCloseTo(1000 / 150);
  });

  it("gold contract: 100 oz per lot → pip value 1", () => {
    const r = computePipValue({ pair: "XAUUSD", lots: 1, quoteToAccount: 1 });
    expect(r.perStandardLot).toBe(1);
  });
});
