import { describe, expect, it } from "vitest";

import {
  aggregateTrade,
  buildCurrentReviewStatsSnapshot,
  buildEquityCurve,
  buildJournalDashboardStats,
  getDisplayEntryExit,
  getEquityTimestamp,
  getTradeResolution,
  mapTradeList,
  normalizeLegs,
  rMultiple,
} from "../calculations";
import {
  calculationParityFixtures,
  dashboardStatsParityFixture,
} from "./fixtures";

describe("aggregateTrade canonical parity", () => {
  it.each(calculationParityFixtures)(
    "returns exact output for $name",
    ({ bias, legs, expected }) => {
      expect(aggregateTrade(legs, bias)).toEqual(expected);
    },
  );

  it("does not change arithmetic based on long or short bias", () => {
    const legs = [
      { side: "buy" as const, qty: 1, price: 90 },
      { side: "sell" as const, qty: 1, price: 100 },
    ];

    expect(aggregateTrade(legs, "long")).toEqual(
      aggregateTrade(legs, "short"),
    );
  });

  it("uses contract size only when a caller explicitly supplies it", () => {
    const legs = [
      { side: "buy" as const, qty: 1, price: 100 },
      { side: "sell" as const, qty: 1, price: 110 },
    ];

    expect(aggregateTrade(legs, "long").pnlGross).toBe(10);
    expect(aggregateTrade(legs, "long", 50).pnlGross).toBe(500);
  });

  it("preserves JavaScript precision without rounding", () => {
    expect(
      aggregateTrade(
        [
          { side: "buy", qty: 0.1, price: 0.1 },
          { side: "buy", qty: 0.2, price: 0.2 },
          { side: "sell", qty: 0.3, price: 0.3 },
        ],
        "long",
      ),
    ).toEqual({
      avgBuy: 0.16666666666666669,
      avgSell: 0.3,
      pnlGross: 0.03999999999999999,
      pnlNet: 0.03999999999999999,
      fees: 0,
      slippage: 0,
      netPos: 5.551115123125783e-17,
    });
  });
});

describe("R-multiple canonical parity", () => {
  it("returns exact profit, loss, and breakeven ratios", () => {
    expect(rMultiple(100, 50)).toBe(2);
    expect(rMultiple(-100, 50)).toBe(-2);
    expect(rMultiple(0, 50)).toBe(0);
  });

  it("returns null for missing or zero risk and preserves negative risk", () => {
    expect(rMultiple(100)).toBeNull();
    expect(rMultiple(100, null)).toBeNull();
    expect(rMultiple(100, 0)).toBeNull();
    expect(rMultiple(100, -50)).toBe(-2);
  });
});

describe("trade normalization and presentation", () => {
  const normalized = normalizeLegs([
    {
      id: "later",
      side: "sell",
      qty: 1,
      price: 110,
      fee: null,
      slippage: null,
      executed_at: "2026-03-02T00:00:00.000Z",
    },
    {
      id: "missing-time",
      side: "buy",
      qty: 1,
      price: 100,
    },
    {
      id: "earlier",
      side: "buy",
      qty: 1,
      price: 100,
      executed_at: "2026-03-01T00:00:00.000Z",
    },
  ]);

  it("normalizes costs and sorts missing timestamps as epoch zero", () => {
    expect(normalized).toEqual([
      {
        id: "missing-time",
        side: "buy",
        qty: 1,
        price: 100,
        fee: 0,
        slippage: 0,
        executed_at: undefined,
      },
      {
        id: "earlier",
        side: "buy",
        qty: 1,
        price: 100,
        fee: 0,
        slippage: 0,
        executed_at: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "later",
        side: "sell",
        qty: 1,
        price: 110,
        fee: 0,
        slippage: 0,
        executed_at: "2026-03-02T00:00:00.000Z",
      },
    ]);
  });

  it("maps long and short entry/exit display averages", () => {
    const aggregate = aggregateTrade(
      [
        { side: "buy", qty: 1, price: 90 },
        { side: "sell", qty: 1, price: 100 },
      ],
      "long",
    );

    expect(getDisplayEntryExit(aggregate, "long")).toEqual({
      avgEntry: 90,
      avgExit: 100,
    });
    expect(getDisplayEntryExit(aggregate, "short")).toEqual({
      avgEntry: 100,
      avgExit: 90,
    });
  });

  it("classifies open, partial, closed, and over-exited positions", () => {
    const leg = (
      side: "buy" | "sell",
      qty: number,
    ) => normalizeLegs([{ side, qty, price: 100 }]);

    expect(getTradeResolution(leg("buy", 1), "long")).toBe("open");
    expect(
      getTradeResolution(
        normalizeLegs([
          { side: "buy", qty: 2, price: 100 },
          { side: "sell", qty: 1, price: 100 },
        ]),
        "long",
      ),
    ).toBe("partially_closed");
    expect(
      getTradeResolution(
        normalizeLegs([
          { side: "buy", qty: 1, price: 100 },
          { side: "sell", qty: 1, price: 100 },
        ]),
        "long",
      ),
    ).toBe("closed");
    expect(
      getTradeResolution(
        normalizeLegs([
          { side: "buy", qty: 1, price: 100 },
          { side: "sell", qty: 2, price: 100 },
        ]),
        "long",
      ),
    ).toBe("closed");
  });

  it("uses close time, then final exit time, then open time for equity", () => {
    const legs = normalizeLegs([
      {
        side: "sell",
        qty: 1,
        price: 110,
        executed_at: "2026-03-02T00:00:00.000Z",
      },
    ]);
    const record = {
      opened_at: "2026-03-01T00:00:00.000Z",
      closed_at: null,
      bias: "long" as const,
    };

    expect(getEquityTimestamp(record, legs)).toBe(
      "2026-03-02T00:00:00.000Z",
    );
    expect(getEquityTimestamp({ ...record, closed_at: "closed" }, legs)).toBe(
      "closed",
    );
    expect(getEquityTimestamp(record, [])).toBe(record.opened_at);
  });
});

describe("derived list, dashboard, and review parity", () => {
  it("maps list values with exact long/short direction and null fallbacks", () => {
    expect(
      mapTradeList([
        {
          id: "short-1",
          opened_at: "2026-03-01T00:00:00.000Z",
          bias: "short",
          risk_per_trade: 5,
          strategies: null,
          instruments: { symbol: null },
          legs: [
            { side: "sell", qty: 1, price: 100 },
            { side: "buy", qty: 1, price: 90 },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "short-1",
        opened_at: "2026-03-01T00:00:00.000Z",
        symbol: null,
        side: "short",
        qty: 1,
        avg_entry: 100,
        avg_exit: 90,
        pnl_net: 10,
        r: 2,
        strategy: null,
      },
    ]);
  });

  it("accumulates equity in timestamp order without rounding", () => {
    expect(
      buildEquityCurve([
        { opened_at: "2026-02-05T00:00:00.000Z", pnl_net: 90 },
        { opened_at: "2026-02-03T00:00:00.000Z", pnl_net: 100 },
        { opened_at: "2026-02-04T00:00:00.000Z", pnl_net: -40 },
      ]),
    ).toEqual([
      { d: "2026-02-03T00:00:00.000Z", v: 100 },
      { d: "2026-02-04T00:00:00.000Z", v: 60 },
      { d: "2026-02-05T00:00:00.000Z", v: 150 },
    ]);
  });

  it("matches the canonical full-set dashboard fixture exactly", () => {
    expect(buildJournalDashboardStats(dashboardStatsParityFixture)).toEqual({
      total_trades: 3,
      closed_trades: 1,
      open_trades: 1,
      partially_closed_trades: 1,
      net_pnl_closed: 8,
      avg_r_closed_or_resolved: 1.75,
      equity: [
        { d: "2026-03-01T09:00:00.000Z", v: -3 },
        { d: "2026-03-04T10:00:00.000Z", v: 0 },
        { d: "2026-03-05T11:00:00.000Z", v: 8 },
      ],
      assumptions: {
        equity_basis: "realized_net_to_date",
        avg_r_basis: "closed_or_partially_closed_with_risk",
        open_trade_costs_included: true,
        notes: [
          "Equity uses all authenticated trades rather than the current list page.",
          "Closed trades contribute full matched PnL minus recorded fees and slippage.",
          "Partially closed trades contribute matched PnL and all recorded costs to date.",
          "Open trades contribute recorded fees and slippage only; unrealized mark-to-market is excluded.",
        ],
      },
    });
  });

  it("filters review stats by inclusive UTC opened-date boundaries", () => {
    const snapshot = buildCurrentReviewStatsSnapshot(
      dashboardStatsParityFixture,
      "2026-03-02",
      "2026-03-03",
    );

    expect(snapshot).toEqual({
      total_trades: 2,
      closed_trades: 1,
      open_trades: 0,
      partially_closed_trades: 1,
      net_pnl_closed: 8,
      avg_r_closed_or_resolved: 1.75,
      completeness: "supported",
      unsupported_keys: [],
      notes: [
        "Computed from trades opened between 2026-03-02 and 2026-03-03.",
        "Uses the current realized net-to-date foundation and excludes unrealized mark-to-market.",
      ],
    });
  });
});
