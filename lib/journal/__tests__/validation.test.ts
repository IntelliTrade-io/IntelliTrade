import { describe, expect, it } from "vitest";

import {
  CreateTradeSchema,
  JournalExportQuerySchema,
  ReplaceTradeLegsSchema,
  ReviewSaveSchema,
  TradeLegSchema,
  TradeQuerySchema,
  UpdateTradeSchema,
} from "../validation";

const accountId = "10000000-0000-0000-0000-000000000001";
const instrumentId = "20000000-0000-0000-0000-000000000001";

describe("TradeLegSchema", () => {
  it("applies exact fee and slippage defaults", () => {
    expect(
      TradeLegSchema.parse({
        side: "buy",
        qty: 1,
        price: 100,
        executed_at: "2026-03-01T10:00:00.000Z",
      }),
    ).toEqual({
      side: "buy",
      qty: 1,
      price: 100,
      fee: 0,
      slippage: 0,
      executed_at: "2026-03-01T10:00:00.000Z",
    });
  });

  it.each([
    ["quantity", { qty: 0 }, "qty"],
    ["negative quantity", { qty: -1 }, "qty"],
    ["price", { price: 0 }, "price"],
    ["negative fee", { fee: -1 }, "fee"],
    ["negative slippage", { slippage: -1 }, "slippage"],
    ["timestamp without offset", { executed_at: "2026-03-01T10:00" }, "executed_at"],
  ])("rejects invalid %s", (_name, override, path) => {
    const result = TradeLegSchema.safeParse({
      side: "buy",
      qty: 1,
      price: 100,
      fee: 0,
      slippage: 0,
      executed_at: "2026-03-01T10:00:00.000Z",
      ...override,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([path]);
    }
  });
});

describe("CreateTradeSchema", () => {
  it("preserves optional strategy and notes while applying array defaults", () => {
    expect(
      CreateTradeSchema.parse({
        account_id: accountId,
        instrument_id: instrumentId,
        strategy_id: null,
        setup: null,
        bias: "long",
        thesis: null,
        risk_per_trade: null,
        target_r: null,
        opened_at: "2026-03-01T10:00:00.000Z",
        legs: [
          {
            side: "buy",
            qty: 1,
            price: 100,
            executed_at: "2026-03-01T10:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      account_id: accountId,
      instrument_id: instrumentId,
      strategy_id: null,
      setup: null,
      bias: "long",
      thesis: null,
      risk_per_trade: null,
      target_r: null,
      tags: [],
      opened_at: "2026-03-01T10:00:00.000Z",
      screenshot_urls: [],
      legs: [
        {
          side: "buy",
          qty: 1,
          price: 100,
          fee: 0,
          slippage: 0,
          executed_at: "2026-03-01T10:00:00.000Z",
        },
      ],
    });
  });

  it("accepts negative risk and target values as the canonical schema does", () => {
    const parsed = CreateTradeSchema.parse({
      account_id: accountId,
      instrument_id: instrumentId,
      bias: "short",
      risk_per_trade: -100,
      target_r: -2,
      opened_at: "2026-03-01T10:00:00.000Z",
      legs: [
        {
          side: "sell",
          qty: 1,
          price: 100,
          executed_at: "2026-03-01T10:00:00.000Z",
        },
      ],
    });

    expect(parsed.risk_per_trade).toBe(-100);
    expect(parsed.target_r).toBe(-2);
  });

  it("rejects invalid UUIDs, timestamps, and empty legs", () => {
    const result = CreateTradeSchema.safeParse({
      account_id: "account",
      instrument_id: "instrument",
      bias: "long",
      opened_at: "not-a-timestamp",
      legs: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ["account_id"],
        ["instrument_id"],
        ["opened_at"],
        ["legs"],
      ]);
    }
  });
});

describe("UpdateTradeSchema", () => {
  it("accepts an empty object at schema level", () => {
    expect(UpdateTradeSchema.parse({})).toEqual({});
  });

  it("rejects legs, screenshots, and other unknown keys", () => {
    const result = UpdateTradeSchema.safeParse({
      legs: [],
      screenshot_urls: [],
      unknown: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          code: "unrecognized_keys",
          keys: ["legs", "screenshot_urls", "unknown"],
          path: [],
        }),
      ]);
    }
  });
});

describe("ReplaceTradeLegsSchema", () => {
  it("requires one or more strict validated legs", () => {
    expect(ReplaceTradeLegsSchema.safeParse({ legs: [] }).success).toBe(false);
    expect(
      ReplaceTradeLegsSchema.safeParse({
        legs: [
          {
            side: "sell",
            qty: 1,
            price: 100,
            executed_at: "invalid",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ReplaceTradeLegsSchema.safeParse({ legs: [], extra: true }).success,
    ).toBe(false);
  });
});

describe("ReviewSaveSchema", () => {
  it("accepts optional null notes and the 5000-character boundary", () => {
    expect(
      ReviewSaveSchema.parse({
        period: "weekly",
        period_start: "2026-03-01",
        period_end: "2026-03-07",
        notes: null,
      }).notes,
    ).toBeNull();
    expect(
      ReviewSaveSchema.parse({
        period: "monthly",
        period_start: "2026-03-01",
        period_end: "2026-03-31",
        notes: "x".repeat(5000),
      }).notes,
    ).toHaveLength(5000);
  });

  it("rejects reversed ranges and oversized notes", () => {
    expect(
      ReviewSaveSchema.safeParse({
        period: "weekly",
        period_start: "2026-03-08",
        period_end: "2026-03-01",
        notes: "x".repeat(5001),
      }).success,
    ).toBe(false);
  });

  it("preserves regex-only calendar validation", () => {
    expect(
      ReviewSaveSchema.parse({
        period: "weekly",
        period_start: "2026-99-01",
        period_end: "2026-99-07",
      }),
    ).toEqual({
      period: "weekly",
      period_start: "2026-99-01",
      period_end: "2026-99-07",
    });
  });
});

describe("JournalExportQuerySchema", () => {
  it("normalizes blank or missing periods to null", () => {
    const base = {
      resource: "trades",
      format: "csv",
      from: "2026-03-01",
      to: "2026-03-31",
    };

    expect(JournalExportQuerySchema.parse({ ...base, period: "" }).period).toBeNull();
    expect(JournalExportQuerySchema.parse(base).period).toBeNull();
  });

  it("rejects invalid formats, periods, and reversed ranges", () => {
    expect(
      JournalExportQuerySchema.safeParse({
        resource: "trades",
        format: "pdf",
        from: "2026-03-31",
        to: "2026-03-01",
        period: "daily",
      }).success,
    ).toBe(false);
  });
});

describe("TradeQuerySchema", () => {
  it("coerces pagination, retains declared filters, and splits tags without trimming", () => {
    expect(
      TradeQuerySchema.parse({
        page: "2",
        limit: "25",
        from: "from",
        to: "to",
        instrument: "asset-id",
        strategy: "strategy-id",
        asset_class: "fx",
        result: "win",
        search: "macro",
        tags: "fx, breakout",
      }),
    ).toEqual({
      page: 2,
      limit: 25,
      from: "from",
      to: "to",
      instrument: "asset-id",
      strategy: "strategy-id",
      asset_class: "fx",
      result: "win",
      search: "macro",
      tags: ["fx", " breakout"],
    });
  });

  it("defaults pagination and rejects breakeven result classification", () => {
    expect(TradeQuerySchema.parse({})).toEqual({ page: 1, limit: 50 });
    expect(TradeQuerySchema.safeParse({ result: "breakeven" }).success).toBe(
      false,
    );
  });
});
