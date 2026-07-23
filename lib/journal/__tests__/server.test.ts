import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  buildJournalReviewsExportDocument,
  buildJournalTradesExportDocument,
  buildEquityCurve,
  buildJournalDashboardStats,
  deleteTradeWithScreenshotCleanup,
  getTradeUpdatePayload,
  mapReviewExportRows,
  mapTradeDetail,
  mapTradeExportRows,
  replaceTradeLegsForTrade,
  saveJournalReview,
} from '../server';

type TradeStatsFixture = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  bias: 'long' | 'short';
  risk_per_trade: number | null;
  trade_legs: Array<{
    side: 'buy' | 'sell';
    qty: number;
    price: number;
    fee: number;
    slippage: number;
    executed_at: string;
  }>;
};

function createReviewSaveSupabaseStub({
  trades,
  existingReviewId = null,
}: {
  trades: TradeStatsFixture[];
  existingReviewId?: string | null;
}) {
  const state = {
    insertedPayload: null as Record<string, unknown> | null,
    updatedPayload: null as Record<string, unknown> | null,
  };

  const client = {
    from(table: string) {
      if (table === 'trades') {
        return {
          select() {
            return {
              async order() {
                return { data: trades, error: null };
              },
            };
          },
        };
      }

      if (table === 'reviews') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          async maybeSingle() {
                            return {
                              data: existingReviewId ? { id: existingReviewId } : null,
                              error: null,
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            state.updatedPayload = payload;

            return {
              eq() {
                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: { id: existingReviewId ?? 'review-updated' },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            state.insertedPayload = payload;

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: { id: 'review-created' },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table in stub: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, state };
}

function createDeleteTradeSupabaseStub({
  existingTrade = {
    id: 'trade-1',
    screenshot_urls: ['journal/user-1/trades/trade-1/1-before.png'],
  },
  deleteError = null,
  cleanupError = null,
}: {
  existingTrade?: { id: string; screenshot_urls: string[] } | null;
  deleteError?: { message: string } | null;
  cleanupError?: { message: string } | null;
}) {
  const state = {
    removedPaths: null as string[] | null,
  };

  const client = {
    from(table: string) {
      if (table !== 'trades') {
        throw new Error(`Unexpected table in delete stub: ${table}`);
      }

      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: existingTrade,
                    error: null,
                  };
                },
              };
            },
          };
        },
        delete() {
          return {
            eq() {
              return {
                select() {
                  return {
                    async maybeSingle() {
                      return {
                        data: deleteError ? null : existingTrade ? { id: existingTrade.id } : null,
                        error: deleteError,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          async remove(paths: string[]) {
            state.removedPaths = paths;
            return {
              data: cleanupError ? null : [],
              error: cleanupError,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, state };
}

function createReplaceTradeLegsSupabaseStub({
  existingTrade = {
    id: 'trade-1',
    trade_legs: [
      {
        id: 'leg-1',
        side: 'buy' as const,
        qty: 1,
        price: 100,
        fee: 1,
        slippage: 0,
        executed_at: '2026-03-01T09:00:00.000Z',
      },
    ],
  },
  insertError = null,
  restoreError = null,
}: {
  existingTrade?: {
    id: string;
    trade_legs: Array<{
      id: string;
      side: 'buy' | 'sell';
      qty: number;
      price: number;
      fee: number;
      slippage: number;
      executed_at: string;
    }>;
  } | null;
  insertError?: { message: string } | null;
  restoreError?: { message: string } | null;
}) {
  const state = {
    insertedPayloads: [] as Array<Record<string, unknown> | Array<Record<string, unknown>>>,
    deleteCalls: 0,
  };
  let insertCallCount = 0;

  const client = {
    from(table: string) {
      if (table === 'trades') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: existingTrade,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'trade_legs') {
        return {
          delete() {
            state.deleteCalls += 1;

            return {
              async eq() {
                return {
                  data: null,
                  error: null,
                };
              },
            };
          },
          insert(payload: Array<Record<string, unknown>>) {
            insertCallCount += 1;
            state.insertedPayloads.push(payload);

            return Promise.resolve({
              data: null,
              error:
                insertCallCount === 1 ? insertError : restoreError,
            });
          },
        };
      }

      throw new Error(`Unexpected table in replace stub: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, state };
}

describe('buildEquityCurve', () => {
  it('accumulates pnl in chronological order', () => {
    const curve = buildEquityCurve([
      { opened_at: '2026-02-03T00:00:00.000Z', pnl_net: 100 },
      { opened_at: '2026-02-04T00:00:00.000Z', pnl_net: -40 },
      { opened_at: '2026-02-05T00:00:00.000Z', pnl_net: 90 },
    ]);

    expect(curve).toEqual([
      { d: '2026-02-03T00:00:00.000Z', v: 100 },
      { d: '2026-02-04T00:00:00.000Z', v: 60 },
      { d: '2026-02-05T00:00:00.000Z', v: 150 },
    ]);
  });
});

describe('buildJournalDashboardStats', () => {
  it('classifies open, partially closed, and closed trades and builds realized equity from the full trade set', () => {
    const stats = buildJournalDashboardStats([
      {
        id: 'trade-open',
        opened_at: '2026-03-01T09:00:00.000Z',
        closed_at: null,
        bias: 'long',
        risk_per_trade: 100,
        trade_legs: [
          {
            side: 'buy',
            qty: 1,
            price: 100,
            fee: 2,
            slippage: 1,
            executed_at: '2026-03-01T09:00:00.000Z',
          },
        ],
      },
      {
        id: 'trade-partial',
        opened_at: '2026-03-02T09:00:00.000Z',
        closed_at: null,
        bias: 'long',
        risk_per_trade: 2,
        trade_legs: [
          {
            side: 'buy',
            qty: 2,
            price: 100,
            fee: 1,
            slippage: 0,
            executed_at: '2026-03-02T09:00:00.000Z',
          },
          {
            side: 'sell',
            qty: 1,
            price: 105,
            fee: 1,
            slippage: 0,
            executed_at: '2026-03-04T10:00:00.000Z',
          },
        ],
      },
      {
        id: 'trade-closed',
        opened_at: '2026-03-03T09:00:00.000Z',
        closed_at: '2026-03-05T11:00:00.000Z',
        bias: 'short',
        risk_per_trade: 4,
        trade_legs: [
          {
            side: 'sell',
            qty: 1,
            price: 200,
            fee: 1,
            slippage: 0,
            executed_at: '2026-03-03T09:00:00.000Z',
          },
          {
            side: 'buy',
            qty: 1,
            price: 190,
            fee: 1,
            slippage: 0,
            executed_at: '2026-03-05T11:00:00.000Z',
          },
        ],
      },
    ]);

    expect(stats.total_trades).toBe(3);
    expect(stats.open_trades).toBe(1);
    expect(stats.partially_closed_trades).toBe(1);
    expect(stats.closed_trades).toBe(1);
    expect(stats.net_pnl_closed).toBeCloseTo(8, 6);
    expect(stats.avg_r_closed_or_resolved).toBeCloseTo(1.75, 6);
    expect(stats.equity).toEqual([
      { d: '2026-03-01T09:00:00.000Z', v: -3 },
      { d: '2026-03-04T10:00:00.000Z', v: 0 },
      { d: '2026-03-05T11:00:00.000Z', v: 8 },
    ]);
    expect(stats.assumptions.equity_basis).toBe('realized_net_to_date');
    expect(stats.assumptions.open_trade_costs_included).toBe(true);
  });
});

describe('getTradeUpdatePayload', () => {
  it('removes unsupported undefined fields', () => {
    expect(
      getTradeUpdatePayload({
        thesis: 'Updated thesis',
        target_r: 2.2,
      }),
    ).toEqual({
      thesis: 'Updated thesis',
      target_r: 2.2,
    });
  });

  it('rejects trade leg updates for now', () => {
    expect(() =>
      getTradeUpdatePayload({
        legs: [
          {
            side: 'buy',
            qty: 1,
            price: 1.1,
            fee: 0,
            slippage: 0,
            executed_at: '2026-02-03T08:16:00.000Z',
          },
        ],
      }),
    ).toThrow(/not yet supported/);
  });

  it('rejects raw screenshot path updates outside the dedicated upload route', () => {
    expect(() =>
      getTradeUpdatePayload({
        screenshot_urls: ['journal/user-1/trades/trade-1/1-chart.png'],
      }),
    ).toThrow(/dedicated screenshot upload route/i);
  });
});

describe('deleteTradeWithScreenshotCleanup', () => {
  it('deletes the trade and removes stored screenshots when cleanup succeeds', async () => {
    const { client, state } = createDeleteTradeSupabaseStub({});

    const result = await deleteTradeWithScreenshotCleanup(client, 'trade-1');

    expect(result).toEqual({
      id: 'trade-1',
      screenshot_cleanup: 'complete',
      cleanup_error: null,
    });
    expect(state.removedPaths).toEqual([
      'journal/user-1/trades/trade-1/1-before.png',
    ]);
  });

  it('returns a best-effort cleanup warning when storage removal fails after delete', async () => {
    const { client, state } = createDeleteTradeSupabaseStub({
      cleanupError: { message: 'Bucket policy denied remove.' },
    });

    const result = await deleteTradeWithScreenshotCleanup(client, 'trade-1');

    expect(result).toEqual({
      id: 'trade-1',
      screenshot_cleanup: 'failed',
      cleanup_error: 'Bucket policy denied remove.',
    });
    expect(state.removedPaths).toEqual([
      'journal/user-1/trades/trade-1/1-before.png',
    ]);
  });

  it('skips storage cleanup when the trade has no screenshots', async () => {
    const { client, state } = createDeleteTradeSupabaseStub({
      existingTrade: {
        id: 'trade-1',
        screenshot_urls: [],
      },
    });

    const result = await deleteTradeWithScreenshotCleanup(client, 'trade-1');

    expect(result).toEqual({
      id: 'trade-1',
      screenshot_cleanup: 'not_needed',
      cleanup_error: null,
    });
    expect(state.removedPaths).toBeNull();
  });
});

describe('replaceTradeLegsForTrade', () => {
  it('replaces the full leg set for an owned trade', async () => {
    const { client, state } = createReplaceTradeLegsSupabaseStub({});

    const result = await replaceTradeLegsForTrade(client, 'trade-1', [
      {
        side: 'buy',
        qty: 1,
        price: 101,
        fee: 1,
        slippage: 0,
        executed_at: '2026-03-02T09:00:00.000Z',
      },
      {
        side: 'sell',
        qty: 1,
        price: 106,
        fee: 1,
        slippage: 0,
        executed_at: '2026-03-02T10:00:00.000Z',
      },
    ]);

    expect(result).toEqual({
      trade_id: 'trade-1',
      leg_count: 2,
    });
    expect(state.deleteCalls).toBe(1);
    expect(state.insertedPayloads).toHaveLength(1);
  });

  it('restores previous legs when replacement insert fails', async () => {
    const { client, state } = createReplaceTradeLegsSupabaseStub({
      insertError: { message: 'Insert failed.' },
    });

    await expect(
      replaceTradeLegsForTrade(client, 'trade-1', [
        {
          side: 'buy',
          qty: 2,
          price: 110,
          fee: 1,
          slippage: 0,
          executed_at: '2026-03-02T09:00:00.000Z',
        },
      ]),
    ).rejects.toThrow(/previous legs were restored/i);

    expect(state.insertedPayloads).toHaveLength(2);
  });
});

describe('mapTradeDetail', () => {
  it('maps joined trade detail data into derived display metrics', () => {
    const trade = mapTradeDetail({
      id: 'trade-1',
      account_id: 'account-1',
      accounts: { name: 'Macro Account', broker: 'IBKR' },
      instrument_id: 'instrument-1',
      instruments: { symbol: 'EURUSD', asset_class: 'fx' },
      strategy_id: 'strategy-1',
      strategies: { name: 'London Breakout' },
      setup: 'Compression Break',
      bias: 'long',
      thesis: 'Retest held above London range high.',
      risk_per_trade: 100,
      target_r: 2,
      tags: ['fx', 'london'],
      opened_at: '2026-03-12T08:00:00.000Z',
      closed_at: '2026-03-12T10:00:00.000Z',
      screenshot_urls: ['journal/demo/eurusd-before.png'],
      trade_legs: [
        {
          id: 'leg-2',
          side: 'sell',
          qty: 1,
          price: 1.11,
          fee: 1,
          slippage: 0.5,
          executed_at: '2026-03-12T10:00:00.000Z',
        },
        {
          id: 'leg-1',
          side: 'buy',
          qty: 1,
          price: 1.1,
          fee: 1,
          slippage: 0.5,
          executed_at: '2026-03-12T08:00:00.000Z',
        },
      ],
    });

    expect(trade.symbol).toBe('EURUSD');
    expect(trade.strategy_name).toBe('London Breakout');
    expect(trade.trade_legs[0]?.id).toBe('leg-1');
    expect(trade.screenshot_urls).toEqual(['journal/demo/eurusd-before.png']);
    expect(trade.screenshots).toEqual([]);
    expect(trade.metrics.avg_entry).toBeCloseTo(1.1, 6);
    expect(trade.metrics.avg_exit).toBeCloseTo(1.11, 6);
    expect(trade.metrics.pnl_net).toBeCloseTo(0.01 - 3, 6);
    expect(trade.metrics.r).toBeCloseTo((0.01 - 3) / 100, 6);
  });
});

describe('export mapping helpers', () => {
  it('maps trade export rows without leaking user-scoped internal fields', () => {
    const rows = mapTradeExportRows([
      {
        id: 'trade-1',
        opened_at: '2026-03-12T08:00:00.000Z',
        closed_at: '2026-03-12T10:00:00.000Z',
        bias: 'long',
        setup: 'Compression Break',
        thesis: 'Retest above range high.',
        risk_per_trade: 100,
        target_r: 2,
        tags: ['fx', 'london'],
        accounts: { name: 'Macro Account', broker: 'IBKR' },
        instruments: { symbol: 'EURUSD', asset_class: 'fx' },
        strategies: { name: 'London Breakout' },
        trade_legs: [
          {
            side: 'buy',
            qty: 1,
            price: 1.1,
            fee: 1,
            slippage: 0.5,
            executed_at: '2026-03-12T08:00:00.000Z',
          },
          {
            side: 'sell',
            qty: 1,
            price: 1.11,
            fee: 1,
            slippage: 0.5,
            executed_at: '2026-03-12T10:00:00.000Z',
          },
        ],
      },
    ]);

    expect(rows).toEqual([
      {
        trade_id: 'trade-1',
        opened_at: '2026-03-12T08:00:00.000Z',
        closed_at: '2026-03-12T10:00:00.000Z',
        account: 'Macro Account',
        broker: 'IBKR',
        symbol: 'EURUSD',
        asset_class: 'fx',
        strategy: 'London Breakout',
        setup: 'Compression Break',
        thesis: 'Retest above range high.',
        bias: 'long',
        resolution: 'closed',
        qty: 1,
        avg_entry: 1.1,
        avg_exit: 1.11,
        pnl_net: 0.01 - 3,
        r: (0.01 - 3) / 100,
        risk_per_trade: 100,
        target_r: 2,
        fees_total: 2,
        slippage_total: 1,
        tags: ['fx', 'london'],
      },
    ]);
  });

  it('maps review export rows from the persisted normalized snapshot only', () => {
    const rows = mapReviewExportRows([
      {
        id: 'review-1',
        period: 'weekly',
        period_start: '2026-03-02',
        period_end: '2026-03-08',
        notes: 'Stayed selective.',
        auto_stats: {
          total_trades: 3,
          closed_trades: 1,
          open_trades: 1,
          partially_closed_trades: 1,
          net_pnl_closed: 120,
          avg_r_closed_or_resolved: 0.8,
        },
        created_at: '2026-03-09T10:00:00.000Z',
      },
    ]);

    expect(rows).toEqual([
      {
        review_id: 'review-1',
        period: 'weekly',
        period_start: '2026-03-02',
        period_end: '2026-03-08',
        notes: 'Stayed selective.',
        created_at: '2026-03-09T10:00:00.000Z',
        snapshot_completeness: 'supported',
        total_trades: 3,
        closed_trades: 1,
        open_trades: 1,
        partially_closed_trades: 1,
        net_pnl_closed: 120,
        avg_r_closed_or_resolved: 0.8,
        unsupported_keys: [],
        snapshot_notes: [],
      },
    ]);
  });

  it('builds honest json export documents for trades and reviews', () => {
    expect(
      buildJournalTradesExportDocument(
        {
          from: '2026-03-01',
          to: '2026-03-31',
        },
        [],
      ),
    ).toMatchObject({
      resource: 'trades',
      format: 'json',
      scope: {
        from: '2026-03-01',
        to: '2026-03-31',
      },
      rows: [],
    });

    expect(
      buildJournalReviewsExportDocument(
        {
          from: '2026-03-01',
          to: '2026-03-31',
          period: 'monthly',
        },
        [],
      ),
    ).toMatchObject({
      resource: 'reviews',
      format: 'json',
      scope: {
        from: '2026-03-01',
        to: '2026-03-31',
        period: 'monthly',
      },
      rows: [],
    });
  });
});

describe('saveJournalReview', () => {
  it('creates a new review row when the unique period key does not exist', async () => {
    const { client, state } = createReviewSaveSupabaseStub({
      trades: [
        {
          id: 'trade-1',
          opened_at: '2026-03-03T08:00:00.000Z',
          closed_at: '2026-03-03T09:00:00.000Z',
          bias: 'long',
          risk_per_trade: 10,
          trade_legs: [
            {
              side: 'buy',
              qty: 1,
              price: 100,
              fee: 1,
              slippage: 0,
              executed_at: '2026-03-03T08:00:00.000Z',
            },
            {
              side: 'sell',
              qty: 1,
              price: 112,
              fee: 1,
              slippage: 0,
              executed_at: '2026-03-03T09:00:00.000Z',
            },
          ],
        },
        {
          id: 'trade-2',
          opened_at: '2026-03-05T10:00:00.000Z',
          closed_at: null,
          bias: 'long',
          risk_per_trade: 25,
          trade_legs: [
            {
              side: 'buy',
              qty: 1,
              price: 200,
              fee: 2,
              slippage: 1,
              executed_at: '2026-03-05T10:00:00.000Z',
            },
          ],
        },
      ],
    });

    const result = await saveJournalReview(client, 'user-1', {
      period: 'weekly',
      period_start: '2026-03-02',
      period_end: '2026-03-08',
      notes: 'Review notes',
    });

    expect(result).toEqual({
      id: 'review-created',
      action: 'created',
      auto_stats: {
        total_trades: 2,
        closed_trades: 1,
        open_trades: 1,
        partially_closed_trades: 0,
        net_pnl_closed: 10,
        avg_r_closed_or_resolved: 1,
        completeness: 'supported',
        unsupported_keys: [],
        notes: [
          'Computed from trades opened between 2026-03-02 and 2026-03-08.',
          'Uses the current realized net-to-date foundation and excludes unrealized mark-to-market.',
        ],
      },
    });
    expect(state.updatedPayload).toBeNull();
    expect(state.insertedPayload).toMatchObject({
      user_id: 'user-1',
      period: 'weekly',
      period_start: '2026-03-02',
      period_end: '2026-03-08',
      notes: 'Review notes',
    });
    expect(state.insertedPayload?.auto_stats).toEqual(result.auto_stats);
  });

  it('updates the existing review for the same user, period, and period start', async () => {
    const { client, state } = createReviewSaveSupabaseStub({
      existingReviewId: 'review-existing',
      trades: [
        {
          id: 'trade-1',
          opened_at: '2026-03-01T08:00:00.000Z',
          closed_at: null,
          bias: 'short',
          risk_per_trade: 20,
          trade_legs: [
            {
              side: 'sell',
              qty: 2,
              price: 50,
              fee: 1,
              slippage: 0,
              executed_at: '2026-03-01T08:00:00.000Z',
            },
            {
              side: 'buy',
              qty: 1,
              price: 45,
              fee: 1,
              slippage: 0,
              executed_at: '2026-03-02T08:00:00.000Z',
            },
          ],
        },
      ],
    });

    const result = await saveJournalReview(client, 'user-1', {
      period: 'monthly',
      period_start: '2026-03-01',
      period_end: '2026-03-31',
      notes: 'Updated notes',
    });

    expect(result.action).toBe('updated');
    expect(result.id).toBe('review-existing');
    expect(state.insertedPayload).toBeNull();
    expect(state.updatedPayload).toMatchObject({
      user_id: 'user-1',
      period: 'monthly',
      period_start: '2026-03-01',
      period_end: '2026-03-31',
      notes: 'Updated notes',
    });
    expect(state.updatedPayload?.auto_stats).toEqual({
      total_trades: 1,
      closed_trades: 0,
      open_trades: 0,
      partially_closed_trades: 1,
      net_pnl_closed: 0,
      avg_r_closed_or_resolved: 0.15,
      completeness: 'supported',
      unsupported_keys: [],
      notes: [
        'Computed from trades opened between 2026-03-01 and 2026-03-31.',
        'Uses the current realized net-to-date foundation and excludes unrealized mark-to-market.',
      ],
    });
  });
});
