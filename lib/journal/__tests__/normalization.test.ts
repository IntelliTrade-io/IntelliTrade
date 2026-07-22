import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCreateTradePayload,
  buildJournalExportQuery,
  buildPersistedReviewAutoStats,
  buildReplaceTradeLegsPayload,
  buildReviewSavePayload,
  buildReviewSaveRecord,
  buildReviewStatsSnapshotFromDashboardStats,
  buildUpdateTradePayload,
  createInitialJournalExportFormValues,
  createInitialTradeFormValues,
  createInitialTradeLegEditFormValues,
  createInitialUpdateTradeFormValues,
  normalizeStoredReviewStats,
  toDateTimeLocalInputValue,
} from "../normalization";

const accountId = "10000000-0000-0000-0000-000000000001";
const instrumentId = "20000000-0000-0000-0000-000000000001";

describe("create-trade normalization", () => {
  it("preserves exact initial defaults and shared leg timestamp", () => {
    const values = createInitialTradeFormValues({
      account_id: accountId,
      instrument_id: instrumentId,
    });

    expect(values).toEqual({
      account_id: accountId,
      instrument_id: instrumentId,
      strategy_id: "",
      setup: "",
      bias: "long",
      thesis: "",
      risk_per_trade: "",
      target_r: "",
      tags: "",
      opened_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      legs: [
        {
          client_id: expect.any(String),
          side: "buy",
          qty: "",
          price: "",
          fee: "0",
          slippage: "0",
          executed_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
          ),
        },
      ],
    });
    expect(values.legs[0]?.executed_at).toBe(values.opened_at);
  });

  it("builds the exact normalized payload for optional strategy and notes", () => {
    const result = buildCreateTradePayload({
      account_id: accountId,
      instrument_id: instrumentId,
      strategy_id: "  ",
      setup: "  ",
      bias: "long",
      thesis: "  Retest held.  ",
      risk_per_trade: "",
      target_r: "2.5",
      tags: " fx, breakout, ,macro ",
      opened_at: "2026-03-12T10:30:00.000Z",
      legs: [
        {
          client_id: "leg-1",
          side: "buy",
          qty: "1.5",
          price: "100.25",
          fee: "1",
          slippage: "0.25",
          executed_at: "2026-03-12T10:30:00.000Z",
        },
      ],
    });

    expect(result).toEqual({
      success: true,
      data: {
        account_id: accountId,
        instrument_id: instrumentId,
        strategy_id: null,
        setup: null,
        bias: "long",
        thesis: "Retest held.",
        risk_per_trade: null,
        target_r: 2.5,
        tags: ["fx", "breakout", "macro"],
        opened_at: "2026-03-12T10:30:00.000Z",
        screenshot_urls: [],
        legs: [
          {
            side: "buy",
            qty: 1.5,
            price: 100.25,
            fee: 1,
            slippage: 0.25,
            executed_at: "2026-03-12T10:30:00.000Z",
          },
        ],
      },
    });
  });

  it("returns the first error for each exact nested field path", () => {
    const result = buildCreateTradePayload({
      account_id: "bad",
      instrument_id: "bad",
      strategy_id: "",
      setup: "",
      bias: "long",
      thesis: "",
      risk_per_trade: "not-number",
      target_r: "",
      tags: "",
      opened_at: "invalid",
      legs: [
        {
          client_id: "leg-1",
          side: "buy",
          qty: "0",
          price: "",
          fee: "-1",
          slippage: "-1",
          executed_at: "invalid",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.fieldErrors)).toEqual([
        "account_id",
        "instrument_id",
        "risk_per_trade",
        "opened_at",
        "legs.0.qty",
        "legs.0.price",
        "legs.0.fee",
        "legs.0.slippage",
        "legs.0.executed_at",
      ]);
    }
  });
});

describe("update and leg normalization", () => {
  it("maps nullable trade detail fields into exact editable values", () => {
    const openedAt = "2026-03-12T08:00:00.000Z";

    expect(
      createInitialUpdateTradeFormValues({
        account_id: "account-1",
        instrument_id: "instrument-1",
        strategy_id: null,
        setup: null,
        bias: "short",
        thesis: null,
        risk_per_trade: null,
        target_r: 2,
        tags: ["equity", "fade"],
        opened_at: openedAt,
      }),
    ).toEqual({
      account_id: "account-1",
      instrument_id: "instrument-1",
      strategy_id: "",
      setup: "",
      bias: "short",
      thesis: "",
      risk_per_trade: "",
      target_r: "2",
      tags: "equity, fade",
      opened_at: toDateTimeLocalInputValue(new Date(openedAt)),
    });
  });

  it("normalizes supported update fields and rejects invalid values", () => {
    expect(
      buildUpdateTradePayload({
        account_id: accountId,
        instrument_id: instrumentId,
        strategy_id: "",
        setup: "  Failed auction  ",
        bias: "short",
        thesis: "  Rejected prior high.  ",
        risk_per_trade: "120",
        target_r: "1.8",
        tags: "equity, fade",
        opened_at: "2026-03-12T08:00:00.000Z",
      }),
    ).toEqual({
      success: true,
      data: {
        account_id: accountId,
        instrument_id: instrumentId,
        strategy_id: null,
        setup: "Failed auction",
        bias: "short",
        thesis: "Rejected prior high.",
        risk_per_trade: 120,
        target_r: 1.8,
        tags: ["equity", "fade"],
        opened_at: "2026-03-12T08:00:00.000Z",
      },
    });

    const invalid = buildUpdateTradePayload({
      account_id: "bad",
      instrument_id: "bad",
      strategy_id: "",
      setup: "",
      bias: "long",
      thesis: "",
      risk_per_trade: "abc",
      target_r: "",
      tags: "",
      opened_at: "bad",
    });
    expect(invalid.success).toBe(false);
  });

  it("maps existing legs with null-cost fallbacks and normalizes replacement", () => {
    const values = createInitialTradeLegEditFormValues([
      {
        id: "leg-1",
        side: "sell",
        qty: 1.5,
        price: 43000.5,
        fee: null,
        slippage: null,
        executed_at: "2026-02-03T08:16:00.000Z",
      },
    ]);

    expect(values).toEqual({
      legs: [
        {
          client_id: "leg-1",
          side: "sell",
          qty: "1.5",
          price: "43000.5",
          fee: "0",
          slippage: "0",
          executed_at: toDateTimeLocalInputValue(
            new Date("2026-02-03T08:16:00.000Z"),
          ),
        },
      ],
    });

    expect(buildReplaceTradeLegsPayload(values)).toEqual({
      success: true,
      data: {
        legs: [
          {
            side: "sell",
            qty: 1.5,
            price: 43000.5,
            fee: 0,
            slippage: 0,
            executed_at: new Date(
              values.legs[0]?.executed_at ?? "",
            ).toISOString(),
          },
        ],
      },
    });
  });
});

describe("review normalization", () => {
  it("normalizes JSON numeric strings, legacy counts, and unsupported keys", () => {
    expect(
      normalizeStoredReviewStats(
        JSON.stringify({
          trades: "3",
          closed_trades: "2",
          net_pnl_closed: "125.5",
          wins: 2,
          unsupported_keys: "legacy_key",
          notes: "Imported snapshot.",
        }),
      ),
    ).toEqual({
      total_trades: 3,
      closed_trades: 2,
      open_trades: null,
      partially_closed_trades: null,
      net_pnl_closed: 125.5,
      avg_r_closed_or_resolved: null,
      completeness: "partial",
      unsupported_keys: ["wins", "legacy_key"],
      notes: [
        "Imported snapshot.",
        'Legacy "trades" was mapped into total trades.',
        "Saved auto_stats are partial, so only supported fields are shown.",
        "Unsupported saved stats keys are hidden: wins, legacy_key.",
      ],
    });
  });

  it("returns exact missing snapshots for absent and invalid values", () => {
    expect(normalizeStoredReviewStats(null)).toEqual({
      total_trades: null,
      closed_trades: null,
      open_trades: null,
      partially_closed_trades: null,
      net_pnl_closed: null,
      avg_r_closed_or_resolved: null,
      completeness: "missing",
      unsupported_keys: [],
      notes: ["No saved auto_stats snapshot is stored for this review."],
    });
    expect(normalizeStoredReviewStats("{invalid").notes).toEqual([
      "Stored auto_stats could not be parsed into a supported object.",
    ]);
  });

  it("builds supported live and persisted snapshot shapes exactly", () => {
    const snapshot = buildReviewStatsSnapshotFromDashboardStats(
      {
        total_trades: 5,
        closed_trades: 3,
        open_trades: 1,
        partially_closed_trades: 1,
        net_pnl_closed: 420,
        avg_r_closed_or_resolved: 1.1,
        equity: [],
        assumptions: {
          equity_basis: "realized_net_to_date",
          avg_r_basis: "closed_or_partially_closed_with_risk",
          open_trade_costs_included: true,
          notes: [],
        },
      },
      ["Current realized period stats."],
    );

    expect(buildPersistedReviewAutoStats(snapshot)).toEqual({
      total_trades: 5,
      closed_trades: 3,
      open_trades: 1,
      partially_closed_trades: 1,
      net_pnl_closed: 420,
      avg_r_closed_or_resolved: 1.1,
      completeness: "supported",
      unsupported_keys: [],
      notes: ["Current realized period stats."],
    });
  });

  it("trims optional notes and builds the persistence record", () => {
    const payload = buildReviewSavePayload({
      period: "weekly",
      period_start: " 2026-03-02 ",
      period_end: " 2026-03-08 ",
      notes: "   ",
    });

    expect(payload).toEqual({
      success: true,
      data: {
        period: "weekly",
        period_start: "2026-03-02",
        period_end: "2026-03-08",
        notes: null,
      },
    });
    if (!payload.success) {
      throw new Error("Expected review normalization success.");
    }

    expect(
      buildReviewSaveRecord("user-1", payload.data, {
        total_trades: 1,
        closed_trades: 1,
        open_trades: 0,
        partially_closed_trades: 0,
        net_pnl_closed: 10,
        avg_r_closed_or_resolved: 1,
        completeness: "supported",
        unsupported_keys: [],
        notes: [],
      }),
    ).toEqual({
      user_id: "user-1",
      period: "weekly",
      period_start: "2026-03-02",
      period_end: "2026-03-08",
      notes: null,
      auto_stats: {
        total_trades: 1,
        closed_trades: 1,
        open_trades: 0,
        partially_closed_trades: 0,
        net_pnl_closed: 10,
        avg_r_closed_or_resolved: 1,
        completeness: "supported",
        unsupported_keys: [],
        notes: [],
      },
    });
  });
});

describe("export query normalization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates the canonical local-month-through-today defaults", () => {
    const today = new Date("2026-03-18T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const localStartOfMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    );

    expect(createInitialJournalExportFormValues()).toEqual({
      resource: "trades",
      format: "csv",
      from: localStartOfMonth.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
      period: "",
    });
  });

  it("drops period for trades and preserves it for reviews", () => {
    expect(
      buildJournalExportQuery({
        resource: "trades",
        format: "csv",
        from: " 2026-03-01 ",
        to: " 2026-03-31 ",
        period: "weekly",
      }),
    ).toEqual({
      success: true,
      data: {
        resource: "trades",
        format: "csv",
        from: "2026-03-01",
        to: "2026-03-31",
        period: null,
      },
    });
    expect(
      buildJournalExportQuery({
        resource: "reviews",
        format: "json",
        from: "2026-03-01",
        to: "2026-03-31",
        period: "monthly",
      }),
    ).toEqual({
      success: true,
      data: {
        resource: "reviews",
        format: "json",
        from: "2026-03-01",
        to: "2026-03-31",
        period: "monthly",
      },
    });
  });
});
