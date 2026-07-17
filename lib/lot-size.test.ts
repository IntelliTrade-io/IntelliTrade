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
  computeMargin,
  computePositionSize,
  defaultBrokerSettingsFor,
  floorToLotGrid,
  formatLots,
  formatUnits,
  unitLabelFor,
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

describe("computeMargin", () => {
  it("classic FX case: EURUSD, USD account, 1:30", () => {
    // units = 100,000 EUR; notional = 100,000 * 1.08 = 108,000 USD; margin = 3,600
    const r = computeMargin({ pair: "EURUSD", lots: 1, leverage: 30, baseToAccount: 1.08 });
    expect(r.units).toBe(100_000);
    expect(r.notional).toBeCloseTo(108_000);
    expect(r.margin).toBeCloseTo(3_600);
    expect(r.marginPercent).toBeCloseTo(100 / 30);
  });

  it("scales with lots and leverage", () => {
    const r = computeMargin({ pair: "EURUSD", lots: 0.5, leverage: 100, baseToAccount: 1.1 });
    // units 50,000; notional 55,000; margin 550
    expect(r.notional).toBeCloseTo(55_000);
    expect(r.margin).toBeCloseTo(550);
  });

  it("base == account: no conversion (rate 1)", () => {
    const r = computeMargin({ pair: "USDJPY", lots: 1, leverage: 50, baseToAccount: 1 });
    // units 100,000 USD; notional 100,000; margin 2,000
    expect(r.notional).toBe(100_000);
    expect(r.margin).toBeCloseTo(2_000);
  });

  it("gold: 100 oz per lot at 2400", () => {
    const r = computeMargin({ pair: "XAUUSD", lots: 1, leverage: 20, baseToAccount: 2_400 });
    // units 100 oz; notional 240,000; margin 12,000
    expect(r.units).toBe(100);
    expect(r.notional).toBeCloseTo(240_000);
    expect(r.margin).toBeCloseTo(12_000);
  });

  it("rejects non-positive leverage", () => {
    expect(() =>
      computeMargin({ pair: "EURUSD", lots: 1, leverage: 0, baseToAccount: 1.08 }),
    ).toThrow("Leverage");
  });
});

// ─── Exact vs broker-ready position sizing ────────────────────────────────────

describe("unitLabelFor", () => {
  it("labels metals, crypto, FX and unknowns", () => {
    expect(unitLabelFor("XAUUSD")).toBe("oz");
    expect(unitLabelFor("XAGUSD")).toBe("oz");
    expect(unitLabelFor("BTCUSD")).toBe("BTC");
    expect(unitLabelFor("ETHUSD")).toBe("ETH");
    expect(unitLabelFor("EURUSD")).toBe("EUR");
    expect(unitLabelFor("GBPJPY")).toBe("GBP");
    expect(unitLabelFor("US30")).toBe("units");
  });
});

describe("floorToLotGrid", () => {
  it("floors to the minLot + k*lotStep grid", () => {
    expect(floorToLotGrid(0.578034682, 0.01, 0.01)).toBe(0.57);
    expect(floorToLotGrid(0.0166667, 0.01, 0.01)).toBe(0.01);
    expect(floorToLotGrid(0.25, 0.1, 0.1)).toBe(0.2);
    expect(floorToLotGrid(0.12345, 0.001, 0.001)).toBe(0.123);
    expect(floorToLotGrid(0.123456, 0.0001, 0.0001)).toBe(0.1234);
  });

  it("does not let float noise turn an exact boundary into the step below", () => {
    // 0.50 must stay 0.50 (the classic 0.49 float trap)
    expect(floorToLotGrid(0.5, 0.01, 0.01)).toBe(0.5);
    expect(floorToLotGrid(0.1 + 0.2, 0.01, 0.01)).toBe(0.3); // 0.30000000000000004
    expect(floorToLotGrid(0.57, 0.01, 0.01)).toBe(0.57);
    expect(floorToLotGrid(3, 1, 1)).toBe(3);
  });

  it("handles values immediately above and below boundaries", () => {
    expect(floorToLotGrid(0.5099, 0.01, 0.01)).toBe(0.5);
    expect(floorToLotGrid(0.510001, 0.01, 0.01)).toBe(0.51);
    expect(floorToLotGrid(0.0999, 0.01, 0.1)).toBe(0.01); // above min, below first step
    expect(floorToLotGrid(0.1999, 0.1, 0.1)).toBe(0.1);
  });

  it("respects a minimum lot that is not equal to the lot step", () => {
    // grid: 0.05, 0.15, 0.25, ...
    expect(floorToLotGrid(0.2, 0.05, 0.1)).toBe(0.15);
    expect(floorToLotGrid(0.15, 0.05, 0.1)).toBe(0.15);
    expect(floorToLotGrid(0.06, 0.05, 0.1)).toBe(0.05);
    expect(floorToLotGrid(0.04, 0.05, 0.1)).toBeNull();
  });

  it("handles a floating-point lot step such as 0.3", () => {
    // grid: 0.3, 0.6, 0.9, ...
    expect(floorToLotGrid(0.9, 0.3, 0.3)).toBe(0.9);
    expect(floorToLotGrid(0.89, 0.3, 0.3)).toBe(0.6);
    expect(floorToLotGrid(0.3, 0.3, 0.3)).toBe(0.3);
  });

  it("returns null below the minimum", () => {
    expect(floorToLotGrid(0.004, 0.01, 0.01)).toBeNull();
  });
});

describe("computePositionSize", () => {
  const xauBroker = { contractSize: 100, minLot: 0.01, lotStep: 0.01 };

  it("XAUUSD baseline: 200-pip stop lands exactly on the grid", () => {
    const r = computePositionSize({
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "pips", pips: 200 },
      broker: xauBroker,
    });
    expect(r.targetRisk).toBe(100);
    expect(r.exactLots).toBeCloseTo(0.5, 10);
    expect(r.exactUnits).toBeCloseTo(50, 10);
    expect(r.brokerLots).toBe(0.5);
    expect(r.brokerUnits).toBeCloseTo(50, 10);
    expect(r.actualRisk).toBeCloseTo(100, 10);
    expect(r.actualRiskPercent).toBeCloseTo(1, 10);
    expect(r.exactIsExecutable).toBe(true);
    expect(r.unitLabel).toBe("oz");
  });

  it("XAUUSD wide stop: entry 3350 / stop 3290 (the confirmed failing case)", () => {
    const r = computePositionSize({
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "price", entryPrice: 3350, stopLossPrice: 3290 },
      broker: xauBroker,
    });
    expect(r.priceDistance).toBeCloseTo(60, 10);
    expect(r.stopDistancePips).toBeCloseTo(6000, 8);
    expect(r.exactLots).toBeCloseTo(0.0166667, 6);
    expect(formatLots(r.exactLots)).toBe("0.0167");
    expect(r.exactUnits).toBeCloseTo(1.6667, 4);
    expect(r.brokerLots).toBe(0.01);
    expect(r.brokerUnits).toBeCloseTo(1, 10);
    expect(r.actualRisk).toBeCloseTo(60, 8);
    expect(r.actualRiskPercent).toBeCloseTo(0.6, 8);
    expect(r.nextLots).toBe(0.02);
    expect(r.nextRisk).toBeCloseTo(120, 8);
    expect(r.nextRiskPercent).toBeCloseTo(1.2, 8);
    expect(r.nextExceedsTarget).toBe(true);
    expect(r.exactIsExecutable).toBe(false);
  });

  it("rounding-up regression: 173-pip stop must execute at 0.57, not 0.58", () => {
    const r = computePositionSize({
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "pips", pips: 173 },
      broker: xauBroker,
    });
    expect(r.pipValuePerLot).toBeCloseTo(1, 10); // $1 per pip per lot
    expect(r.exactLots).toBeCloseTo(0.5780347, 6);
    expect(r.brokerLots).toBe(0.57);
    expect(r.brokerLots).not.toBe(0.58);
    expect(r.actualRisk).toBeCloseTo(98.61, 2);
    expect(r.nextLots).toBe(0.58);
    expect(r.nextRisk).toBeCloseTo(100.34, 2);
    expect(r.nextExceedsTarget).toBe(true);
  });

  it("contract-size variation: lots change, underlying exposure stays the same", () => {
    const base = {
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "price", entryPrice: 3350, stopLossPrice: 3290 } as const,
    };
    const with100 = computePositionSize({ ...base, broker: { contractSize: 100, minLot: 0.01, lotStep: 0.01 } });
    const with10 = computePositionSize({ ...base, broker: { contractSize: 10, minLot: 0.01, lotStep: 0.01 } });
    expect(with100.exactLots).toBeCloseTo(0.0166667, 6);
    expect(with10.exactLots).toBeCloseTo(0.166667, 5);
    expect(with100.exactUnits).toBeCloseTo(1.6667, 4);
    expect(with10.exactUnits).toBeCloseTo(1.6667, 4);
    expect(with10.exactUnits).toBeCloseTo(with100.exactUnits, 8);
  });

  it("lot-step variations respect the grid", () => {
    const base = {
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "pips", pips: 173 } as const, // exact 0.5780347
    };
    expect(computePositionSize({ ...base, broker: { minLot: 0.1, lotStep: 0.1 } }).brokerLots).toBe(0.5);
    expect(computePositionSize({ ...base, broker: { minLot: 0.01, lotStep: 0.01 } }).brokerLots).toBe(0.57);
    expect(computePositionSize({ ...base, broker: { minLot: 0.001, lotStep: 0.001 } }).brokerLots).toBe(0.578);
    expect(computePositionSize({ ...base, broker: { minLot: 0.0001, lotStep: 0.0001 } }).brokerLots).toBe(0.578);
    expect(computePositionSize({ ...base, broker: { minLot: 1, lotStep: 1 } }).brokerLots).toBeNull();
  });

  it("below broker minimum: never rounds up, reports the minimum's risk", () => {
    // exact = 0.0166 lots with a 0.1 minimum -> below minimum
    const r = computePositionSize({
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "pips", pips: 6000 },
      broker: { contractSize: 100, minLot: 0.1, lotStep: 0.1 },
    });
    expect(r.exactLots).toBeCloseTo(0.0166667, 6);
    expect(r.belowMinimum).toBe(true);
    expect(r.brokerLots).toBeNull();
    expect(r.actualRisk).toBeNull();
    expect(r.minLotRisk).toBeCloseTo(600, 8);
    expect(r.minLotRiskPercent).toBeCloseTo(6, 8);
    expect(r.nextLots).toBe(0.1);
    expect(r.nextExceedsTarget).toBe(true);
  });

  it("below the default 0.01 minimum behaves the same", () => {
    // 5,000-pip XAU stop on a tiny balance: exact = 5 / 5000 = 0.001 lots
    const r = computePositionSize({
      balance: 500,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: 1,
      stop: { mode: "pips", pips: 5000 },
      broker: xauBroker,
    });
    expect(r.exactLots).toBeCloseTo(0.001, 10);
    expect(r.belowMinimum).toBe(true);
    expect(r.brokerLots).toBeNull();
    expect(r.minLotRisk).toBeCloseTo(50, 8); // 0.01 lots x 5000 pips x $1
    expect(r.nextLots).toBe(0.01);
  });

  it("price mode and pip mode are equivalent for the same distance", () => {
    const common = { balance: 10_000, riskPercent: 1, pair: "XAUUSD", quoteToAccount: 1, broker: xauBroker };
    const pips200 = computePositionSize({ ...common, stop: { mode: "pips", pips: 200 } });
    const price200 = computePositionSize({ ...common, stop: { mode: "price", entryPrice: 3348, stopLossPrice: 3350 } });
    expect(price200.exactLots).toBeCloseTo(pips200.exactLots, 10);
    expect(price200.stopDistancePips).toBeCloseTo(200, 8);

    const pips6000 = computePositionSize({ ...common, stop: { mode: "pips", pips: 6000 } });
    const price6000 = computePositionSize({ ...common, stop: { mode: "price", entryPrice: 3350, stopLossPrice: 3290 } });
    expect(price6000.exactLots).toBeCloseTo(pips6000.exactLots, 10);
    expect(price6000.stopDistancePips).toBeCloseTo(6000, 6);
  });

  it("short and long price stops give the same absolute distance", () => {
    const common = { balance: 10_000, riskPercent: 1, pair: "XAUUSD", quoteToAccount: 1, broker: xauBroker };
    const long = computePositionSize({ ...common, stop: { mode: "price", entryPrice: 3350, stopLossPrice: 3290 } });
    const short = computePositionSize({ ...common, stop: { mode: "price", entryPrice: 3290, stopLossPrice: 3350 } });
    expect(short.exactLots).toBeCloseTo(long.exactLots, 12);
  });

  it("non-USD account uses the mocked conversion deterministically", () => {
    // EUR account, XAUUSD, mocked EURUSD 1.1435 -> USD->EUR ~ 0.874507
    const usdToEur = 1 / 1.1435;
    const r = computePositionSize({
      balance: 10_000,
      riskPercent: 1,
      pair: "XAUUSD",
      quoteToAccount: usdToEur,
      stop: { mode: "pips", pips: 200 },
      broker: xauBroker,
    });
    expect(r.targetRisk).toBe(100); // EUR
    const riskPerLotEur = 200 * usdToEur; // 200 pips x $1/pip/lot converted to EUR
    expect(r.riskPerLot).toBeCloseTo(riskPerLotEur, 10);
    expect(r.exactLots).toBeCloseTo(100 / riskPerLotEur, 10); // ~0.57175
    expect(r.brokerLots).toBe(0.57);
    expect(r.actualRisk).toBeCloseTo(0.57 * riskPerLotEur, 10);
    expect(r.actualRisk!).toBeLessThanOrEqual(r.targetRisk + 1e-9);
  });

  it("rejects identical entry and stop prices", () => {
    expect(() =>
      computePositionSize({
        balance: 10_000,
        riskPercent: 1,
        pair: "XAUUSD",
        quoteToAccount: 1,
        stop: { mode: "price", entryPrice: 3350, stopLossPrice: 3350 },
      }),
    ).toThrow("identical");
  });

  it("invariant: a broker-ready position never exceeds the target risk", () => {
    const pairs = ["EURUSD", "GBPJPY", "XAUUSD", "XAGUSD", "BTCUSD"];
    const balances = [500, 10_000, 250_000];
    const risks = [0.25, 1, 2.5];
    const stops = [7, 30, 173, 6000];
    const brokers = [
      undefined,
      { minLot: 0.01, lotStep: 0.01 },
      { minLot: 0.1, lotStep: 0.1 },
      { minLot: 0.05, lotStep: 0.1 },
      { minLot: 0.001, lotStep: 0.001 },
      { contractSize: 10, minLot: 0.01, lotStep: 0.01 },
      { minLot: 0.3, lotStep: 0.3 },
    ];
    const rates = [1, 0.874507, 1 / 150];
    for (const pair of pairs)
      for (const balance of balances)
        for (const riskPercent of risks)
          for (const pips of stops)
            for (const broker of brokers)
              for (const quoteToAccount of rates) {
                const r = computePositionSize({
                  balance,
                  riskPercent,
                  pair,
                  quoteToAccount,
                  stop: { mode: "pips", pips },
                  broker,
                });
                if (r.brokerLots !== null) {
                  expect(r.actualRisk!).toBeLessThanOrEqual(r.targetRisk * (1 + 1e-8) + 1e-8);
                }
              }
  });

  it("defaults come from the instrument specification", () => {
    expect(defaultBrokerSettingsFor("XAUUSD")).toEqual({ contractSize: 100, minLot: 0.01, lotStep: 0.01 });
    expect(defaultBrokerSettingsFor("EURUSD")).toEqual({ contractSize: 100_000, minLot: 0.01, lotStep: 0.01 });
  });

  it("matches computeLotSize's exact math for existing instruments (regression)", () => {
    const cases = [
      { pair: "EURUSD", quoteToAccount: 1, pips: 50 },
      { pair: "GBPJPY", quoteToAccount: 1 / 150, pips: 30 },
      { pair: "XAUUSD", quoteToAccount: 1, pips: 100 },
      { pair: "XAGUSD", quoteToAccount: 1, pips: 80 },
      { pair: "BTCUSD", quoteToAccount: 1, pips: 500 },
      { pair: "EURUSD", quoteToAccount: 0.9, pips: 20 },
    ];
    for (const c of cases) {
      const legacy = computeLotSize({
        balance: 10_000,
        riskPercent: 1,
        stopLossPips: c.pips,
        pair: c.pair,
        quoteToAccount: c.quoteToAccount,
      });
      const next = computePositionSize({
        balance: 10_000,
        riskPercent: 1,
        pair: c.pair,
        quoteToAccount: c.quoteToAccount,
        stop: { mode: "pips", pips: c.pips },
      });
      expect(next.exactLots).toBeCloseTo(legacy.lots, 12);
      expect(next.pipValuePerLot).toBeCloseTo(legacy.pipValuePerLot, 12);
      expect(next.targetRisk).toBeCloseTo(legacy.riskAmount, 12);
    }
  });
});

describe("formatLots", () => {
  it("keeps two decimals for ordinary sizes", () => {
    expect(formatLots(0.5)).toBe("0.50");
    expect(formatLots(1.25)).toBe("1.25");
    expect(formatLots(0.57)).toBe("0.57");
    expect(formatLots(0.02)).toBe("0.02");
  });
  it("extends precision for small sizes instead of distorting them", () => {
    expect(formatLots(0.0166667)).toBe("0.0167");
    expect(formatLots(0.5780347)).toBe("0.578");
    expect(formatLots(0.001234)).toBe("0.00123");
  });
});

describe("formatUnits", () => {
  it("shows sensible precision by magnitude", () => {
    expect(formatUnits(1.6666667)).toBe("1.667");
    expect(formatUnits(50)).toBe("50");
    expect(formatUnits(1)).toBe("1");
    expect(formatUnits(100_000)).toBe("100,000");
    expect(formatUnits(16666.67)).toBe("16,667");
  });
});
