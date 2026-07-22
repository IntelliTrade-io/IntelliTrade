export type TradeRow = {
  id: string;
  opened_at: string;
  symbol: string | null;
  side: 'long' | 'short';
  qty: number;
  avg_entry: number | null;
  avg_exit: number | null;
  pnl_net: number;
  r: number | null;
  strategy: string | null;
};

export type EquityPoint = {
  d: string;
  v: number;
};

export type JournalTradeResolution = 'open' | 'partially_closed' | 'closed';
export type JournalReviewPeriod = 'weekly' | 'monthly';
export type JournalReviewStatsSnapshotCompleteness = 'missing' | 'partial' | 'supported';
export type JournalReviewStatsSource = 'stored_auto_stats' | 'current_period_realized_foundation';
export type JournalExportResource = 'trades' | 'reviews';
export type JournalExportFormat = 'csv' | 'json';

export type JournalStatsAssumptions = {
  equity_basis: 'realized_net_to_date';
  avg_r_basis: 'closed_or_partially_closed_with_risk';
  open_trade_costs_included: boolean;
  notes: string[];
};

export type JournalDashboardStats = {
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  partially_closed_trades: number;
  net_pnl_closed: number;
  avg_r_closed_or_resolved: number | null;
  equity: EquityPoint[];
  assumptions: JournalStatsAssumptions;
};

export type JournalReviewStatsSnapshot = {
  total_trades: number | null;
  closed_trades: number | null;
  open_trades: number | null;
  partially_closed_trades: number | null;
  net_pnl_closed: number | null;
  avg_r_closed_or_resolved: number | null;
  completeness: JournalReviewStatsSnapshotCompleteness;
  unsupported_keys: string[];
  notes: string[];
};

export type JournalReviewStatsContext = {
  source: JournalReviewStatsSource;
  snapshot: JournalReviewStatsSnapshot;
};

export type JournalReviewRecord = {
  id: string;
  period: JournalReviewPeriod;
  period_start: string;
  period_end: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  stored_stats: JournalReviewStatsContext;
  current_period_stats: JournalReviewStatsContext;
};

export type JournalPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type JournalListResponse = {
  data: TradeRow[];
  pagination: JournalPagination;
};

export type JournalCreateTradeResponse = {
  id: string;
};

export type JournalUpdateTradeResponse = {
  ok: true;
  id: string;
};

export type JournalDeleteTradeCleanup =
  | 'not_needed'
  | 'complete'
  | 'failed';

export type JournalDeleteTradeResponse = {
  ok: true;
  id: string;
  screenshot_cleanup: JournalDeleteTradeCleanup;
  cleanup_error: string | null;
};

export type JournalReplaceTradeLegsResponse = {
  ok: true;
  trade_id: string;
  leg_count: number;
};

export type JournalSaveReviewResponse = {
  id: string;
  action: 'created' | 'updated';
};

export type JournalTradeScreenshotUploadResponse = {
  ok: true;
  uploaded: number;
  screenshot_paths: string[];
};

export type JournalExportScope = {
  resource: JournalExportResource;
  format: JournalExportFormat;
  from: string;
  to: string;
  period: JournalReviewPeriod | null;
};

export type JournalTradeExportRow = {
  trade_id: string;
  opened_at: string;
  closed_at: string | null;
  account: string | null;
  broker: string | null;
  symbol: string | null;
  asset_class: 'fx' | 'crypto' | 'equity' | 'index' | 'commodity' | null;
  strategy: string | null;
  setup: string | null;
  thesis: string | null;
  bias: 'long' | 'short';
  resolution: JournalTradeResolution;
  qty: number;
  avg_entry: number | null;
  avg_exit: number | null;
  pnl_net: number;
  r: number | null;
  risk_per_trade: number | null;
  target_r: number | null;
  fees_total: number;
  slippage_total: number;
  tags: string[];
};

export type JournalReviewExportRow = {
  review_id: string;
  period: JournalReviewPeriod;
  period_start: string;
  period_end: string;
  notes: string | null;
  created_at: string | null;
  snapshot_completeness: JournalReviewStatsSnapshotCompleteness;
  total_trades: number | null;
  closed_trades: number | null;
  open_trades: number | null;
  partially_closed_trades: number | null;
  net_pnl_closed: number | null;
  avg_r_closed_or_resolved: number | null;
  unsupported_keys: string[];
  snapshot_notes: string[];
};

export type JournalTradesExportDocument = {
  resource: 'trades';
  format: 'json';
  exported_at: string;
  scope: Omit<JournalExportScope, 'resource' | 'format' | 'period'>;
  rows: JournalTradeExportRow[];
  notes: string[];
};

export type JournalReviewsExportDocument = {
  resource: 'reviews';
  format: 'json';
  exported_at: string;
  scope: Pick<JournalExportScope, 'from' | 'to' | 'period'>;
  rows: JournalReviewExportRow[];
  notes: string[];
};

export type JournalExportDocument =
  | JournalTradesExportDocument
  | JournalReviewsExportDocument;

export type JournalLookupOption = {
  id: string;
  label: string;
  description?: string | null;
};

export type JournalTradeFormLookups = {
  accounts: JournalLookupOption[];
  instruments: JournalLookupOption[];
  strategies: JournalLookupOption[];
};

export type TradeLegRow = {
  id?: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fee?: number | null;
  slippage?: number | null;
  executed_at?: string;
};

export type TradeScreenshotAsset = {
  path: string;
  signed_url: string | null;
  status: 'available' | 'unavailable';
};

export type TradeDetailMetrics = {
  qty: number;
  avg_entry: number | null;
  avg_exit: number | null;
  pnl_net: number;
  pnl_gross: number;
  r: number | null;
  fees_total: number;
  slippage_total: number;
  net_position: number;
};

export type TradeDetailResponse = {
  id: string;
  account_id: string;
  account_name: string | null;
  account_broker: string | null;
  instrument_id: string;
  symbol: string | null;
  asset_class: 'fx' | 'crypto' | 'equity' | 'index' | 'commodity' | null;
  strategy_id: string | null;
  strategy_name: string | null;
  setup: string | null;
  bias: 'long' | 'short';
  thesis: string | null;
  risk_per_trade: number | null;
  target_r: number | null;
  tags: string[];
  opened_at: string;
  closed_at: string | null;
  screenshot_urls: string[];
  screenshots: TradeScreenshotAsset[];
  trade_legs: TradeLegRow[];
  metrics: TradeDetailMetrics;
};
