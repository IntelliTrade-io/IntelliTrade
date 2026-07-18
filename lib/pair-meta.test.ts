import { describe, it, expect } from "vitest";
import {
  PER_PAIR_SYMBOLS,
  pairToSlug,
  slugToPair,
  isSupportedPairSlug,
  currencyName,
  assetClassFor,
  pipValuePerLotQuote,
  describePair,
  pairExample,
} from "./pair-meta";

describe("PER_PAIR_SYMBOLS", () => {
  it("covers majors, crosses, metals and crypto", () => {
    expect(PER_PAIR_SYMBOLS).toContain("EURUSD");
    expect(PER_PAIR_SYMBOLS).toContain("USDJPY");
    expect(PER_PAIR_SYMBOLS).toContain("GBPJPY");
    expect(PER_PAIR_SYMBOLS).toContain("XAUUSD");
    expect(PER_PAIR_SYMBOLS).toContain("XAGUSD");
    expect(PER_PAIR_SYMBOLS).toContain("BTCUSD");
    expect(PER_PAIR_SYMBOLS).toContain("ETHUSD");
  });
  it("is unique and non-empty", () => {
    expect(PER_PAIR_SYMBOLS.length).toBeGreaterThan(20);
    expect(new Set(PER_PAIR_SYMBOLS).size).toBe(PER_PAIR_SYMBOLS.length);
  });
  it("every symbol is a valid 6-char uppercase pair", () => {
    for (const s of PER_PAIR_SYMBOLS) expect(s).toMatch(/^[A-Z]{6}$/);
  });
});

describe("slug <-> pair", () => {
  it("round-trips", () => {
    expect(pairToSlug("EUR/USD")).toBe("eurusd");
    expect(slugToPair("eurusd")).toBe("EURUSD");
    for (const s of PER_PAIR_SYMBOLS) expect(slugToPair(pairToSlug(s))).toBe(s);
  });
  it("validates supported slugs", () => {
    expect(isSupportedPairSlug("eurusd")).toBe(true);
    expect(isSupportedPairSlug("EURUSD")).toBe(true);
    expect(isSupportedPairSlug("zzzzzz")).toBe(false);
    expect(isSupportedPairSlug("eur")).toBe(false);
  });
});

describe("currencyName", () => {
  it("maps known codes", () => {
    expect(currencyName("EUR")).toBe("Euro");
    expect(currencyName("XAU")).toBe("Gold");
    expect(currencyName("BTC")).toBe("Bitcoin");
  });
  it("falls back to the code", () => {
    expect(currencyName("ZZZ")).toBe("ZZZ");
  });
});

describe("assetClassFor", () => {
  it("classifies", () => {
    expect(assetClassFor("EURUSD")).toBe("fx-major");
    expect(assetClassFor("USDJPY")).toBe("fx-major");
    expect(assetClassFor("EURGBP")).toBe("fx-cross");
    expect(assetClassFor("GBPJPY")).toBe("fx-cross");
    expect(assetClassFor("XAUUSD")).toBe("metal");
    expect(assetClassFor("BTCUSD")).toBe("crypto");
  });
});

describe("pipValuePerLotQuote", () => {
  it("is exact contract x pip, in quote currency", () => {
    expect(pipValuePerLotQuote("EURUSD")).toBeCloseTo(10, 10); // 100000 * 0.0001
    expect(pipValuePerLotQuote("USDJPY")).toBeCloseTo(1000, 10); // 100000 * 0.01 JPY
    expect(pipValuePerLotQuote("XAUUSD")).toBeCloseTo(1, 10); // 100 * 0.01
    expect(pipValuePerLotQuote("XAGUSD")).toBeCloseTo(50, 10); // 5000 * 0.01
    expect(pipValuePerLotQuote("BTCUSD")).toBeCloseTo(1, 10); // 1 * 1
  });
});

describe("describePair", () => {
  it("describes EURUSD", () => {
    const m = describePair("eur/usd");
    expect(m).toMatchObject({
      pair: "EURUSD",
      slug: "eurusd",
      display: "EUR/USD",
      base: "EUR",
      quote: "USD",
      baseName: "Euro",
      quoteName: "US Dollar",
      longName: "Euro / US Dollar",
      assetClass: "fx-major",
      pipSize: 0.0001,
      contractSize: 100000,
      unitLabel: "EUR",
      pipValueQuote: 10,
      isJpy: false,
    });
  });
  it("flags JPY quote convention", () => {
    expect(describePair("USDJPY").isJpy).toBe(true);
    expect(describePair("GBPJPY").isJpy).toBe(true);
  });
});

describe("pairExample", () => {
  it("computes an exact USD-quoted lot result", () => {
    const ex = pairExample("EURUSD");
    // $5000, 1% = $50 risk, 30-pip stop, $10/pip/lot -> $300/lot -> 0.1667 lots
    expect(ex.riskAmount).toBe(50);
    expect(ex.stopPips).toBe(30);
    expect(ex.riskPerLot).toBeCloseTo(300, 10);
    expect(ex.lots).toBeCloseTo(50 / 300, 10);
    expect(ex.quote).toBe("USD");
  });
  it("uses a wider stop for metals and crypto", () => {
    expect(pairExample("XAUUSD").stopPips).toBe(200);
    expect(pairExample("BTCUSD").stopPips).toBe(300);
  });
  it("gold: $100 risk-equivalent math holds", () => {
    // XAUUSD pip value $1/lot, 200-pip stop -> $200/lot risk -> 0.25 lots at $50
    const ex = pairExample("XAUUSD");
    expect(ex.riskPerLot).toBeCloseTo(200, 10);
    expect(ex.lots).toBeCloseTo(0.25, 10);
  });
});
