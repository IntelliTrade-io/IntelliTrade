import { describe, it, expect } from "vitest";
import {
  CURRENCY_TO_PAIR,
  cfSymbolForCurrency,
  pairMovePct,
  prevTradingDayUtc,
} from "./event-impact";

describe("cfSymbolForCurrency", () => {
  it("returns the non-USD leg of the pair", () => {
    expect(cfSymbolForCurrency("EUR")).toBe("EUR");
    expect(cfSymbolForCurrency("JPY")).toBe("JPY");
    // USD events proxy via EUR/USD, so the fetched symbol is EUR
    expect(cfSymbolForCurrency("USD")).toBe("EUR");
    // CNH pair label, CNY CurrencyFreaks symbol
    expect(cfSymbolForCurrency("CNY")).toBe("CNY");
  });

  it("returns null for unmapped currencies", () => {
    expect(cfSymbolForCurrency("TRY")).toBeNull();
  });
});

describe("pairMovePct", () => {
  const eur = CURRENCY_TO_PAIR.EUR!; // ccy-base (EUR/USD)
  const jpy = CURRENCY_TO_PAIR.JPY!; // usd-base (USD/JPY)

  it("usd-base pair moves with the raw per-USD rate", () => {
    // USD/JPY 150 -> 153 = +2%
    expect(pairMovePct(jpy, 153, 150)).toBeCloseTo(2, 10);
  });

  it("ccy-base pair is the inverse of the per-USD rate", () => {
    // rate = EUR per USD. 0.95 -> 0.9268: EUR/USD 1.0526 -> 1.0789 = +2.5%
    const pct = pairMovePct(eur, 0.9268292682926829, 0.95);
    expect(pct).toBeCloseTo(2.5, 10);
  });

  it("returns null on missing, non-positive or identical rates", () => {
    expect(pairMovePct(eur, null, 0.95)).toBeNull();
    expect(pairMovePct(eur, 0.95, null)).toBeNull();
    expect(pairMovePct(eur, 0, 0.95)).toBeNull();
    // identical = stale weekend/holiday snapshot, not a real 0.00%
    expect(pairMovePct(eur, 0.95, 0.95)).toBeNull();
  });
});

describe("prevTradingDayUtc", () => {
  it("weekday rolls back one day", () => {
    expect(prevTradingDayUtc("2026-07-15")).toBe("2026-07-14"); // Wed -> Tue
  });

  it("Monday rolls back to Friday", () => {
    expect(prevTradingDayUtc("2026-07-20")).toBe("2026-07-17");
  });

  it("weekend dates roll back to Friday", () => {
    expect(prevTradingDayUtc("2026-07-18")).toBe("2026-07-17"); // Sat
    expect(prevTradingDayUtc("2026-07-19")).toBe("2026-07-17"); // Sun
  });
});
