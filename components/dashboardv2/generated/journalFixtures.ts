type DemoAccountSeed = {
  id: string;
  name: string;
  broker: string;
  base_currency: string;
};

type DemoInstrumentSeed = {
  id: string;
  symbol: string;
  asset_class: 'fx' | 'crypto' | 'equity' | 'index' | 'commodity';
  tick_size: number;
  contract_size: number;
  quote_currency: string;
};

type DemoStrategySeed = {
  id: string;
  name: string;
  description: string;
};

type DemoTradeLegSeed = {
  id: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fee: number;
  slippage: number;
  executed_at: string;
};

type DemoTradeSeed = {
  id: string;
  account_id: string;
  instrument_id: string;
  strategy_id: string | null;
  setup: string | null;
  bias: 'long' | 'short';
  thesis: string | null;
  risk_per_trade: number | null;
  target_r: number | null;
  tags: string[];
  opened_at: string;
  closed_at: string | null;
  screenshot_urls: string[];
  legs: DemoTradeLegSeed[];
};

type DemoReviewSeed = {
  id: string;
  period: 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  notes: string;
  auto_stats: Record<string, unknown>;
};

const fixtureIds = {
  accounts: {
    discretionary: '10000000-0000-0000-0000-000000000001',
  },
  instruments: {
    eurusd: '20000000-0000-0000-0000-000000000001',
    xauusd: '20000000-0000-0000-0000-000000000002',
    btcusd: '20000000-0000-0000-0000-000000000003',
    nq1: '20000000-0000-0000-0000-000000000004',
  },
  strategies: {
    londonBreakout: '30000000-0000-0000-0000-000000000001',
    meanReversion: '30000000-0000-0000-0000-000000000002',
    cryptoRange: '30000000-0000-0000-0000-000000000003',
  },
  trades: {
    eurusd: '40000000-0000-0000-0000-000000000001',
    xauusd: '40000000-0000-0000-0000-000000000002',
    btcusd: '40000000-0000-0000-0000-000000000003',
    nq1: '40000000-0000-0000-0000-000000000004',
  },
  reviews: {
    weekly: '50000000-0000-0000-0000-000000000001',
    monthly: '50000000-0000-0000-0000-000000000002',
  },
};

export function createJournalDemoFixtures(userId: string) {
  const accounts: Array<DemoAccountSeed & { user_id: string }> = [
    {
      id: fixtureIds.accounts.discretionary,
      user_id: userId,
      name: 'Intelli Macro',
      broker: 'Interactive Brokers',
      base_currency: 'USD',
    },
  ];

  const instruments: Array<DemoInstrumentSeed & { user_id: string }> = [
    {
      id: fixtureIds.instruments.eurusd,
      user_id: userId,
      symbol: 'EURUSD',
      asset_class: 'fx',
      tick_size: 0.00001,
      contract_size: 100000,
      quote_currency: 'USD',
    },
    {
      id: fixtureIds.instruments.xauusd,
      user_id: userId,
      symbol: 'XAUUSD',
      asset_class: 'commodity',
      tick_size: 0.01,
      contract_size: 100,
      quote_currency: 'USD',
    },
    {
      id: fixtureIds.instruments.btcusd,
      user_id: userId,
      symbol: 'BTCUSD',
      asset_class: 'crypto',
      tick_size: 0.01,
      contract_size: 1,
      quote_currency: 'USD',
    },
    {
      id: fixtureIds.instruments.nq1,
      user_id: userId,
      symbol: 'NQ1!',
      asset_class: 'index',
      tick_size: 0.25,
      contract_size: 20,
      quote_currency: 'USD',
    },
  ];

  const strategies: Array<DemoStrategySeed & { user_id: string }> = [
    {
      id: fixtureIds.strategies.londonBreakout,
      user_id: userId,
      name: 'London Expansion',
      description: 'Trade post-open continuation after compression and liquidity sweep.',
    },
    {
      id: fixtureIds.strategies.meanReversion,
      user_id: userId,
      name: 'Mean Reversion Fade',
      description: 'Fade stretched intraday moves into major higher-timeframe levels.',
    },
    {
      id: fixtureIds.strategies.cryptoRange,
      user_id: userId,
      name: 'Weekend Range Rotation',
      description: 'Trade range extremes in thinner crypto sessions with hard invalidation.',
    },
  ];

  const trades: Array<Omit<DemoTradeSeed, 'legs'> & { user_id: string }> = [
    {
      id: fixtureIds.trades.eurusd,
      user_id: userId,
      account_id: fixtureIds.accounts.discretionary,
      instrument_id: fixtureIds.instruments.eurusd,
      strategy_id: fixtureIds.strategies.londonBreakout,
      setup: 'Compression Break',
      bias: 'long',
      thesis: 'Euro held above London low, DXY softened, and the retest held after CPI impulse.',
      risk_per_trade: 180,
      target_r: 2.4,
      tags: ['fx', 'london', 'breakout', 'a-setup'],
      opened_at: '2026-02-03T08:16:00.000Z',
      closed_at: '2026-02-03T12:40:00.000Z',
      screenshot_urls: ['journal/demo/eurusd-before.png', 'journal/demo/eurusd-exit.png'],
    },
    {
      id: fixtureIds.trades.xauusd,
      user_id: userId,
      account_id: fixtureIds.accounts.discretionary,
      instrument_id: fixtureIds.instruments.xauusd,
      strategy_id: fixtureIds.strategies.meanReversion,
      setup: 'NY Liquidity Fade',
      bias: 'short',
      thesis: 'Gold tagged prior day high into a hot CPI unwind; expected mean reversion back to VWAP.',
      risk_per_trade: 240,
      target_r: 1.5,
      tags: ['gold', 'new-york', 'fade'],
      opened_at: '2026-02-05T14:08:00.000Z',
      closed_at: '2026-02-05T16:02:00.000Z',
      screenshot_urls: ['journal/demo/xauusd-before.png'],
    },
    {
      id: fixtureIds.trades.btcusd,
      user_id: userId,
      account_id: fixtureIds.accounts.discretionary,
      instrument_id: fixtureIds.instruments.btcusd,
      strategy_id: fixtureIds.strategies.cryptoRange,
      setup: 'Weekend Rotation',
      bias: 'long',
      thesis: 'Attempted long from local range low, but there was no real spot bid and invalidation hit fast.',
      risk_per_trade: 320,
      target_r: 2.1,
      tags: ['crypto', 'weekend', 'range', 'loss'],
      opened_at: '2026-02-08T19:42:00.000Z',
      closed_at: '2026-02-08T21:03:00.000Z',
      screenshot_urls: ['journal/demo/btcusd-before.png'],
    },
    {
      id: fixtureIds.trades.nq1,
      user_id: userId,
      account_id: fixtureIds.accounts.discretionary,
      instrument_id: fixtureIds.instruments.nq1,
      strategy_id: fixtureIds.strategies.londonBreakout,
      setup: 'US Trend Pullback',
      bias: 'short',
      thesis: 'Index futures failed to reclaim opening drive high; trend resumed after shallow pullback.',
      risk_per_trade: 260,
      target_r: 2.8,
      tags: ['index', 'trend', 'partial-close'],
      opened_at: '2026-02-11T15:05:00.000Z',
      closed_at: '2026-02-11T18:12:00.000Z',
      screenshot_urls: ['journal/demo/nq-before.png', 'journal/demo/nq-scale-out.png'],
    },
  ];

  const tradeLegs: Array<DemoTradeLegSeed & { trade_id: string }> = [
    {
      id: '60000000-0000-0000-0000-000000000001',
      trade_id: fixtureIds.trades.eurusd,
      side: 'buy',
      qty: 1,
      price: 1.0832,
      fee: 2.1,
      slippage: 0.4,
      executed_at: '2026-02-03T08:16:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000002',
      trade_id: fixtureIds.trades.eurusd,
      side: 'sell',
      qty: 0.5,
      price: 1.0868,
      fee: 1.2,
      slippage: 0.2,
      executed_at: '2026-02-03T10:01:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000003',
      trade_id: fixtureIds.trades.eurusd,
      side: 'sell',
      qty: 0.5,
      price: 1.0895,
      fee: 1.2,
      slippage: 0.2,
      executed_at: '2026-02-03T12:40:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000004',
      trade_id: fixtureIds.trades.xauusd,
      side: 'sell',
      qty: 0.2,
      price: 2058.4,
      fee: 1.4,
      slippage: 0.5,
      executed_at: '2026-02-05T14:08:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000005',
      trade_id: fixtureIds.trades.xauusd,
      side: 'buy',
      qty: 0.2,
      price: 2061.7,
      fee: 1.4,
      slippage: 0.6,
      executed_at: '2026-02-05T16:02:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000006',
      trade_id: fixtureIds.trades.btcusd,
      side: 'buy',
      qty: 0.05,
      price: 67880,
      fee: 9.8,
      slippage: 4.5,
      executed_at: '2026-02-08T19:42:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000007',
      trade_id: fixtureIds.trades.btcusd,
      side: 'sell',
      qty: 0.05,
      price: 67320,
      fee: 9.6,
      slippage: 6.2,
      executed_at: '2026-02-08T21:03:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000008',
      trade_id: fixtureIds.trades.nq1,
      side: 'sell',
      qty: 2,
      price: 21568.5,
      fee: 3.2,
      slippage: 0.5,
      executed_at: '2026-02-11T15:05:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000009',
      trade_id: fixtureIds.trades.nq1,
      side: 'buy',
      qty: 1,
      price: 21512.25,
      fee: 1.8,
      slippage: 0.25,
      executed_at: '2026-02-11T16:24:00.000Z',
    },
    {
      id: '60000000-0000-0000-0000-000000000010',
      trade_id: fixtureIds.trades.nq1,
      side: 'buy',
      qty: 1,
      price: 21486.75,
      fee: 1.8,
      slippage: 0.25,
      executed_at: '2026-02-11T18:12:00.000Z',
    },
  ];

  const reviews: Array<DemoReviewSeed & { user_id: string }> = [
    {
      id: fixtureIds.reviews.weekly,
      user_id: userId,
      period: 'weekly',
      period_start: '2026-02-02',
      period_end: '2026-02-08',
      notes:
        'Best execution came from waiting for structured retests in London. Biggest process mistake was forcing the BTC weekend long without confirmation.',
      auto_stats: {
        trades: 3,
        wins: 1,
        losses: 2,
        win_rate: 33.3,
        net_r: -0.4,
      },
    },
    {
      id: fixtureIds.reviews.monthly,
      user_id: userId,
      period: 'monthly',
      period_start: '2026-02-01',
      period_end: '2026-02-28',
      notes:
        'Macro directional trades performed best when the thesis aligned with session momentum. Continue reducing low-liquidity crypto participation.',
      auto_stats: {
        trades: 4,
        wins: 2,
        losses: 2,
        win_rate: 50,
        net_r: 2.1,
      },
    },
  ];

  return {
    accounts,
    instruments,
    strategies,
    trades,
    tradeLegs,
    reviews,
  };
}
