import { describe, expect, it } from 'vitest';

import {
  buildJournalExportFileName,
  buildJournalExportQuery,
  readDownloadFileName,
  serializeReviewExportCsv,
  serializeTradeExportCsv,
} from '../exports';

describe('buildJournalExportQuery', () => {
  it('drops the review period filter for trade exports', () => {
    const result = buildJournalExportQuery({
      resource: 'trades',
      format: 'csv',
      from: '2026-03-01',
      to: '2026-03-31',
      period: 'weekly',
    });

    expect(result).toEqual({
      success: true,
      data: {
        resource: 'trades',
        format: 'csv',
        from: '2026-03-01',
        to: '2026-03-31',
        period: null,
      },
    });
  });

  it('returns field errors for an invalid date range', () => {
    const result = buildJournalExportQuery({
      resource: 'reviews',
      format: 'json',
      from: '2026-03-31',
      to: '2026-03-01',
      period: 'monthly',
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected validation failure.');
    }

    expect(result.fieldErrors.to?.[0]).toMatch(/on or after/i);
  });
});

describe('serializeTradeExportCsv', () => {
  it('serializes safe trade export fields and escapes lists', () => {
    const csv = serializeTradeExportCsv([
      {
        trade_id: 'trade-1',
        opened_at: '2026-03-03T08:00:00.000Z',
        closed_at: null,
        account: 'Macro Account',
        broker: 'IBKR',
        symbol: 'EURUSD',
        asset_class: 'fx',
        strategy: 'London Breakout',
        setup: 'Compression Break',
        thesis: 'Retest held, then expanded.',
        bias: 'long',
        resolution: 'open',
        qty: 1,
        avg_entry: 1.0832,
        avg_exit: null,
        pnl_net: -2,
        r: null,
        risk_per_trade: 100,
        target_r: 2,
        fees_total: 1,
        slippage_total: 1,
        tags: ['fx', 'breakout'],
      },
    ]);

    expect(csv).toContain('trade_id,opened_at,closed_at');
    expect(csv).toContain('trade-1');
    expect(csv).toContain('fx | breakout');
    expect(csv).not.toContain('user_id');
  });
});

describe('serializeReviewExportCsv', () => {
  it('serializes normalized review snapshot fields only', () => {
    const csv = serializeReviewExportCsv([
      {
        review_id: 'review-1',
        period: 'weekly',
        period_start: '2026-03-02',
        period_end: '2026-03-08',
        notes: 'Stayed patient.',
        created_at: '2026-03-09T09:00:00.000Z',
        snapshot_completeness: 'supported',
        total_trades: 4,
        closed_trades: 2,
        open_trades: 1,
        partially_closed_trades: 1,
        net_pnl_closed: 250,
        avg_r_closed_or_resolved: 1.2,
        unsupported_keys: ['legacy_key'],
        snapshot_notes: ['Computed from stored auto_stats.'],
      },
    ]);

    expect(csv).toContain('review_id,period,period_start');
    expect(csv).toContain('legacy_key');
    expect(csv).toContain('Computed from stored auto_stats.');
  });
});

describe('download metadata helpers', () => {
  it('builds stable export file names and reads content-disposition names', () => {
    const fallback = buildJournalExportFileName({
      resource: 'reviews',
      format: 'json',
      from: '2026-03-01',
      to: '2026-03-31',
      period: 'monthly',
    });

    expect(fallback).toBe('journal-reviews-monthly-2026-03-01-to-2026-03-31.json');
    expect(
      readDownloadFileName(
        'attachment; filename="journal-trades-2026-03-01-to-2026-03-31.csv"',
        fallback,
      ),
    ).toBe('journal-trades-2026-03-01-to-2026-03-31.csv');
  });
});
