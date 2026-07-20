import { describe, it, expect } from "vitest";
import {
  aggregateTrade,
  buildLegInsertRows,
  matchedQuantity,
  realizedPnl,
  realizedStats,
  remainingOpenQty,
  rMultiple,
  tradeStatus,
  tradeFromRow,
  validateNewTrade,
  validateReplaceLegs,
  validateTradeUpdate,
  type LegInput,
  type MathLeg,
  type StatsTrade,
} from "./journal-trades";

// ---------------------------------------------------------------------------
// buildLegInsertRows — must emit a UNIFORM key set (PostgREST PGRST102 guard)
// ---------------------------------------------------------------------------

describe("buildLegInsertRows", () => {
  const NOW = "2026-07-20T15:00:00.000Z";

  it("gives every row an identical key set even when executedAt is mixed", () => {
    const legs: LegInput[] = [
      { side: "buy", qty: 1, price: 1.09, fee: 0, executedAt: "2026-07-19T10:00:00Z" },
      { side: "sell", qty: 1, price: 1.1, fee: 0 }, // no executedAt (the close leg)
    ];
    const rows = buildLegInsertRows(legs, "trade-1", "user-1", NOW);
    const keySets = rows.map((r) => Object.keys(r).sort().join(","));
    expect(new Set(keySets).size).toBe(1); // all rows share one key set
    expect(rows[0]!.executed_at).toBe("2026-07-19T10:00:00Z"); // preserved
    expect(rows[1]!.executed_at).toBe(NOW); // defaulted
  });

  it("stamps trade_id/user_id and carries fee through", () => {
    const rows = buildLegInsertRows([{ side: "buy", qty: 2, price: 5, fee: 1.5 }], "t", "u", NOW);
    expect(rows[0]).toEqual({
      trade_id: "t",
      user_id: "u",
      side: "buy",
      qty: 2,
      price: 5,
      fee: 1.5,
      executed_at: NOW,
    });
  });
});

// ---------------------------------------------------------------------------
// PnL math (ported from donor lib/trades/math.test.ts, slippage removed)
// ---------------------------------------------------------------------------

describe("aggregateTrade / realizedPnl", () => {
  it("handles partial closes for long trades", () => {
    const legs: MathLeg[] = [
      { side: "buy", qty: 1, price: 1.1, fee: 2 },
      { side: "sell", qty: 0.5, price: 1.11, fee: 1 },
      { side: "sell", qty: 0.5, price: 1.12, fee: 1 },
    ];
    const agg = aggregateTrade(legs);
    expect(agg.avgBuy).toBeCloseTo(1.1, 6);
    expect(agg.avgSell).toBeCloseTo(1.115, 6);
    // gross 0.015, fees 4 (2+1+1); slippage dropped vs donor.
    expect(agg.netPnl).toBeCloseTo(0.015 - 4, 6);
    expect(agg.netPosition).toBe(0);
    expect(realizedPnl("long", legs)).toBeCloseTo(0.015 - 4, 6);
  });

  it("returns positive pnl for profitable short trades", () => {
    const legs: MathLeg[] = [
      { side: "sell", qty: 1, price: 200, fee: 1 },
      { side: "buy", qty: 1, price: 190, fee: 1 },
    ];
    const agg = aggregateTrade(legs);
    expect(agg.avgSell).toBeCloseTo(200, 6);
    expect(agg.avgBuy).toBeCloseTo(190, 6);
    expect(agg.netPnl).toBeCloseTo(8, 6);
    expect(realizedPnl("short", legs)).toBeCloseTo(8, 6);
  });

  it("treats fees as optional (default 0)", () => {
    const legs: MathLeg[] = [
      { side: "buy", qty: 2, price: 10 },
      { side: "sell", qty: 2, price: 12 },
    ];
    expect(realizedPnl("long", legs)).toBeCloseTo(4, 6); // (12-10)*2, no fees
  });
});

describe("matchedQuantity", () => {
  it("is the min of buy and sell volume", () => {
    expect(
      matchedQuantity([
        { side: "buy", qty: 3, price: 1 },
        { side: "sell", qty: 1, price: 1 },
      ]),
    ).toBe(1);
    expect(matchedQuantity([{ side: "buy", qty: 3, price: 1 }])).toBe(0);
  });
});

describe("rMultiple", () => {
  it("returns null when R cannot be computed", () => {
    expect(rMultiple(100, null)).toBeNull();
    expect(rMultiple(100, 0)).toBeNull();
  });
  it("divides net pnl by risk", () => {
    expect(rMultiple(200, 100)).toBe(2);
    expect(rMultiple(-50, 100)).toBe(-0.5);
  });
});

describe("tradeStatus", () => {
  it("is open when only opening legs exist", () => {
    expect(tradeStatus("long", [{ side: "buy", qty: 1, price: 10 }])).toBe("open");
    expect(tradeStatus("short", [{ side: "sell", qty: 1, price: 10 }])).toBe("open");
  });

  it("is partial when the position is only partly closed", () => {
    expect(
      tradeStatus("long", [
        { side: "buy", qty: 2, price: 10 },
        { side: "sell", qty: 1, price: 11 },
      ]),
    ).toBe("partial");
    expect(
      tradeStatus("short", [
        { side: "sell", qty: 2, price: 10 },
        { side: "buy", qty: 1, price: 9 },
      ]),
    ).toBe("partial");
  });

  it("is closed when the position is flat", () => {
    expect(
      tradeStatus("long", [
        { side: "buy", qty: 1, price: 10 },
        { side: "sell", qty: 1, price: 11 },
      ]),
    ).toBe("closed");
    expect(
      tradeStatus("short", [
        { side: "sell", qty: 1, price: 10 },
        { side: "buy", qty: 1, price: 9 },
      ]),
    ).toBe("closed");
  });
});

describe("realizedStats", () => {
  it("aggregates open/partial/closed counts, pnl and win-rate", () => {
    const trades: StatsTrade[] = [
      // closed win (long): +2
      { bias: "long", legs: [{ side: "buy", qty: 1, price: 10 }, { side: "sell", qty: 1, price: 12 }] },
      // closed loss (short): -3
      { bias: "short", legs: [{ side: "sell", qty: 1, price: 10 }, { side: "buy", qty: 1, price: 13 }] },
      // partial (long): realized +1 on the closed half
      { bias: "long", legs: [{ side: "buy", qty: 2, price: 10 }, { side: "sell", qty: 1, price: 11 }] },
      // open (long): nothing realized
      { bias: "long", legs: [{ side: "buy", qty: 1, price: 10 }] },
    ];
    const stats = realizedStats(trades);
    expect(stats.totalTrades).toBe(4);
    expect(stats.openTrades).toBe(1);
    expect(stats.partialTrades).toBe(1);
    expect(stats.closedTrades).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBeCloseTo(0.5, 6);
    // 2 - 3 + 1 = 0 realized across closed+partial
    expect(stats.totalRealizedPnl).toBeCloseTo(0, 6);
  });

  it("returns null win-rate with no closed trades", () => {
    const stats = realizedStats([{ bias: "long", legs: [{ side: "buy", qty: 1, price: 10 }] }]);
    expect(stats.closedTrades).toBe(0);
    expect(stats.winRate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const validNewTrade = {
  symbol: "eurusd",
  bias: "long",
  setup: "  breakout  ",
  thesis: "London open continuation",
  risk_per_trade: 100,
  target_r: 2,
  tags: ["trend", "trend", "  "],
  legs: [
    { side: "buy", qty: 1, price: 1.1, fee: 2 },
    { side: "sell", qty: 1, price: 1.12, fee: 2, executed_at: "2026-07-19T10:00:00Z" },
  ],
};

describe("validateNewTrade", () => {
  it("accepts a valid payload, uppercases symbol, trims, de-dupes tags", () => {
    const r = validateNewTrade(validNewTrade);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.symbol).toBe("EURUSD");
      expect(r.value.setup).toBe("breakout");
      expect(r.value.tags).toEqual(["trend"]);
      expect(r.value.riskPerTrade).toBe(100);
      expect(r.value.legs).toHaveLength(2);
      expect(r.value.legs[1]?.executedAt).toBe("2026-07-19T10:00:00Z");
      expect(r.value.legs[0]?.fee).toBe(2);
    }
  });

  it("rejects a non-object body", () => {
    expect(validateNewTrade(null).ok).toBe(false);
    expect(validateNewTrade("nope").ok).toBe(false);
  });

  it("rejects a missing or malformed symbol", () => {
    expect(validateNewTrade({ ...validNewTrade, symbol: "" }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, symbol: "AB" }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, symbol: "EUR-USD" }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, symbol: "X".repeat(16) }).ok).toBe(false);
  });

  it("rejects an unknown bias", () => {
    expect(validateNewTrade({ ...validNewTrade, bias: "flat" }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, bias: undefined }).ok).toBe(false);
  });

  it("enforces setup and thesis length caps", () => {
    expect(validateNewTrade({ ...validNewTrade, setup: "x".repeat(121) }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, thesis: "x".repeat(2001) }).ok).toBe(false);
  });

  it("treats empty optional text as null", () => {
    const r = validateNewTrade({ ...validNewTrade, setup: "   ", thesis: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.setup).toBeNull();
      expect(r.value.thesis).toBeNull();
    }
  });

  it("rejects non-positive risk_per_trade / target_r", () => {
    expect(validateNewTrade({ ...validNewTrade, risk_per_trade: 0 }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, risk_per_trade: -1 }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, target_r: -2 }).ok).toBe(false);
  });

  it("allows omitted risk_per_trade / target_r (null)", () => {
    const { risk_per_trade, target_r, ...rest } = validNewTrade;
    void risk_per_trade;
    void target_r;
    const r = validateNewTrade(rest);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.riskPerTrade).toBeNull();
      expect(r.value.targetR).toBeNull();
    }
  });

  it("rejects too many tags and overlong tags", () => {
    expect(validateNewTrade({ ...validNewTrade, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, tags: ["x".repeat(41)] }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, tags: "trend" }).ok).toBe(false);
  });

  it("requires between 1 and 20 legs", () => {
    expect(validateNewTrade({ ...validNewTrade, legs: [] }).ok).toBe(false);
    expect(
      validateNewTrade({
        ...validNewTrade,
        legs: Array.from({ length: 21 }, () => ({ side: "buy", qty: 1, price: 1 })),
      }).ok,
    ).toBe(false);
  });

  it("validates each leg's fields", () => {
    expect(validateNewTrade({ ...validNewTrade, legs: [{ side: "hold", qty: 1, price: 1 }] }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, legs: [{ side: "buy", qty: 0, price: 1 }] }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, legs: [{ side: "buy", qty: 1, price: -1 }] }).ok).toBe(false);
    expect(validateNewTrade({ ...validNewTrade, legs: [{ side: "buy", qty: 1, price: 1, fee: -1 }] }).ok).toBe(false);
    expect(
      validateNewTrade({ ...validNewTrade, legs: [{ side: "buy", qty: 1, price: 1, executed_at: "nope" }] }).ok,
    ).toBe(false);
  });

  it("rejects a malformed opened_at", () => {
    expect(validateNewTrade({ ...validNewTrade, opened_at: "yesterday" }).ok).toBe(false);
    const r = validateNewTrade({ ...validNewTrade, opened_at: "2026-07-19T10:00:00Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.openedAt).toBe("2026-07-19T10:00:00Z");
  });
});

describe("validateTradeUpdate", () => {
  it("accepts a partial subset and ignores unknown keys", () => {
    const r = validateTradeUpdate({ setup: "  new setup  ", foo: "ignored" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.setup).toBe("new setup");
      expect("thesis" in r.value).toBe(false);
    }
  });

  it("rejects an empty update", () => {
    expect(validateTradeUpdate({}).ok).toBe(false);
    expect(validateTradeUpdate({ foo: 1 }).ok).toBe(false);
  });

  it("allows clearing risk with null and re-opening with closed_at null", () => {
    const r = validateTradeUpdate({ risk_per_trade: null, closed_at: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.riskPerTrade).toBeNull();
      expect(r.value.closedAt).toBeNull();
    }
  });

  it("validates closed_at when provided", () => {
    expect(validateTradeUpdate({ closed_at: "not-a-date" }).ok).toBe(false);
    const r = validateTradeUpdate({ closed_at: "2026-07-19T12:00:00Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.closedAt).toBe("2026-07-19T12:00:00Z");
  });

  it("rejects a bad risk value in an update", () => {
    expect(validateTradeUpdate({ risk_per_trade: -5 }).ok).toBe(false);
  });
});

describe("validateReplaceLegs", () => {
  it("accepts a valid full replacement", () => {
    const r = validateReplaceLegs({ legs: [{ side: "buy", qty: 1, price: 10 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.legs).toHaveLength(1);
  });

  it("rejects empty or oversized leg arrays", () => {
    expect(validateReplaceLegs({ legs: [] }).ok).toBe(false);
    expect(validateReplaceLegs({ legs: "nope" }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

describe("tradeFromRow", () => {
  it("maps snake_case rows (numeric strings) to the domain type", () => {
    const trade = tradeFromRow(
      {
        id: "t1",
        user_id: "u1",
        symbol: "EURUSD",
        bias: "long",
        setup: null,
        thesis: null,
        risk_per_trade: "100.00",
        target_r: "2.00",
        tags: ["trend"],
        opened_at: "2026-07-19T10:00:00Z",
        closed_at: null,
        context: { csm: { eur: 5 } },
        created_at: "2026-07-19T10:00:00Z",
        updated_at: "2026-07-19T10:00:00Z",
      },
      [
        {
          id: "l1",
          trade_id: "t1",
          user_id: "u1",
          side: "buy",
          qty: "1.000000",
          price: "1.100000",
          fee: "2.00",
          executed_at: "2026-07-19T10:00:00Z",
          created_at: "2026-07-19T10:00:00Z",
        },
      ],
    );
    expect(trade.riskPerTrade).toBe(100);
    expect(trade.targetR).toBe(2);
    expect(trade.context).toEqual({ csm: { eur: 5 } });
    expect(trade.legs[0]?.qty).toBe(1);
    expect(trade.legs[0]?.fee).toBe(2);
  });

  it("defaults missing tags/context and empty legs", () => {
    const trade = tradeFromRow({
      id: "t2",
      user_id: "u1",
      symbol: "XAUUSD",
      bias: "short",
      setup: null,
      thesis: null,
      risk_per_trade: null,
      target_r: null,
      tags: null,
      opened_at: "2026-07-19T10:00:00Z",
      closed_at: null,
      context: null,
      created_at: "2026-07-19T10:00:00Z",
      updated_at: "2026-07-19T10:00:00Z",
    });
    expect(trade.tags).toEqual([]);
    expect(trade.context).toEqual({});
    expect(trade.legs).toEqual([]);
    expect(trade.riskPerTrade).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// remainingOpenQty — used by the journal UI to prefill a closing leg.
// ---------------------------------------------------------------------------

describe("remainingOpenQty", () => {
  it("returns the full opening size for an untouched long trade", () => {
    expect(remainingOpenQty("long", [{ side: "buy", qty: 2, price: 1.1 }])).toBeCloseTo(2, 9);
  });

  it("returns the full opening size for an untouched short trade", () => {
    expect(remainingOpenQty("short", [{ side: "sell", qty: 3, price: 200 }])).toBeCloseTo(3, 9);
  });

  it("nets partial closes off a long position", () => {
    const legs: MathLeg[] = [
      { side: "buy", qty: 2, price: 1.1 },
      { side: "sell", qty: 0.5, price: 1.12 },
    ];
    expect(remainingOpenQty("long", legs)).toBeCloseTo(1.5, 9);
  });

  it("nets partial closes off a short position", () => {
    const legs: MathLeg[] = [
      { side: "sell", qty: 3, price: 200 },
      { side: "buy", qty: 1, price: 190 },
    ];
    expect(remainingOpenQty("short", legs)).toBeCloseTo(2, 9);
  });

  it("clamps a fully- or over-closed trade to zero", () => {
    const closed: MathLeg[] = [
      { side: "buy", qty: 1, price: 1.1 },
      { side: "sell", qty: 1, price: 1.2 },
    ];
    expect(remainingOpenQty("long", closed)).toBe(0);
    const over: MathLeg[] = [
      { side: "sell", qty: 1, price: 200 },
      { side: "buy", qty: 1.5, price: 190 },
    ];
    expect(remainingOpenQty("short", over)).toBe(0);
  });
});
