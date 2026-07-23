import { describe, expect, it } from 'vitest';

import {
  buildTradeScreenshotPath,
  mergeTradeScreenshotPaths,
  sanitizeScreenshotFileName,
  validateScreenshotCandidate,
} from '../uploads';

describe('journal uploads', () => {
  it('sanitizes screenshot file names', () => {
    expect(sanitizeScreenshotFileName('BTC Chart Final!!.png')).toBe('btc-chart-final-.png');
  });

  it('builds a namespaced screenshot path', () => {
    const path = buildTradeScreenshotPath({
      userId: 'user-1',
      tradeId: 'trade-1',
      fileName: 'EURUSD setup.png',
      timestamp: 123,
    });

    expect(path).toBe('journal/user-1/trades/trade-1/123-eurusd-setup.png');
  });

  it('rejects oversized uploads', () => {
    const result = validateScreenshotCandidate({
      name: 'chart.png',
      type: 'image/png',
      size: 9 * 1024 * 1024,
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/8 MB/);
  });

  it('rejects empty or unsupported files', () => {
    const empty = validateScreenshotCandidate({
      name: 'chart.png',
      type: 'image/png',
      size: 0,
    });
    const unsupported = validateScreenshotCandidate({
      name: 'chart.gif',
      type: 'image/gif',
      size: 1024,
    });

    expect(empty.valid).toBe(false);
    expect(empty.errors[0]).toMatch(/must not be empty/i);
    expect(unsupported.valid).toBe(false);
    expect(unsupported.errors[0]).toMatch(/Only PNG, JPEG, and WebP/i);
  });

  it('merges stable screenshot paths without duplicates', () => {
    expect(
      mergeTradeScreenshotPaths(
        ['journal/user-1/trades/trade-1/1-before.png'],
        [
          'journal/user-1/trades/trade-1/1-before.png',
          'journal/user-1/trades/trade-1/2-after.png',
        ],
      ),
    ).toEqual([
      'journal/user-1/trades/trade-1/1-before.png',
      'journal/user-1/trades/trade-1/2-after.png',
    ]);
  });
});
