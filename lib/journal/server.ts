import { SupabaseClient } from '@supabase/supabase-js';

import {
  buildPersistedReviewAutoStats,
  buildReviewSaveRecord,
  buildReviewStatsSnapshotFromDashboardStats,
  normalizeStoredReviewStats,
} from '@/lib/journal/normalization';
import {
  JOURNAL_SCREENSHOTS_BUCKET,
  mergeTradeScreenshotPaths,
} from '@/lib/journal/uploads';
import {
  JournalDeleteTradeCleanup,
  JournalDashboardStats,
  JournalExportScope,
  JournalReviewExportRow,
  JournalReviewRecord,
  JournalReviewStatsSnapshot,
  JournalReviewPeriod,
  JournalReviewsExportDocument,
  JournalTradeFormLookups,
  JournalTradeExportRow,
  JournalTradeResolution,
  JournalTradesExportDocument,
  TradeDetailResponse,
  TradeLegRow,
  TradeScreenshotAsset,
} from '@/lib/journal/types';
import { aggregateTrade, rMultiple } from '@/lib/journal/calculations';
import {
  CreateTrade,
  JournalExportQuery,
  ReplaceTradeLegs,
  ReviewSave,
  TradeQuery,
  UpdateTrade,
} from '@/lib/journal/validation';

const tradeListSelect = `
  id,
  opened_at,
  bias,
  risk_per_trade,
  strategy_id,
  instrument_id,
  strategies(name),
  instruments(symbol),
  legs:trade_legs(qty, price, side, fee, slippage, executed_at)
`;

const tradeDetailSelect = `
  id,
  account_id,
  accounts(name, broker),
  instrument_id,
  instruments(symbol, asset_class),
  strategy_id,
  strategies(name),
  setup,
  bias,
  thesis,
  risk_per_trade,
  target_r,
  tags,
  opened_at,
  closed_at,
  screenshot_urls,
  trade_legs(id, side, qty, price, fee, slippage, executed_at)
`;

const tradeStatsSelect = `
  id,
  opened_at,
  closed_at,
  bias,
  risk_per_trade,
  trade_legs(qty, price, side, fee, slippage, executed_at)
`;

const reviewSelect = `
  id,
  period,
  period_start,
  period_end,
  notes,
  auto_stats,
  created_at
`;

const tradeExportSelect = `
  id,
  opened_at,
  closed_at,
  bias,
  setup,
  thesis,
  risk_per_trade,
  target_r,
  tags,
  accounts(name, broker),
  instruments(symbol, asset_class),
  strategies(name),
  trade_legs(qty, price, side, fee, slippage, executed_at)
`;

type TradeListRecord = {
  id: string;
  opened_at: string;
  bias: 'long' | 'short';
  risk_per_trade: number | null;
  strategies: { name: string | null } | null;
  instruments: { symbol: string | null } | null;
  legs: Array<{
    qty: number;
    price: number;
    side: 'buy' | 'sell';
    fee?: number | null;
    slippage?: number | null;
  }> | null;
};

type TradeDetailRecord = {
  id: string;
  account_id: string;
  accounts: { name: string | null; broker: string | null } | null;
  instrument_id: string;
  instruments: { symbol: string | null; asset_class: TradeDetailResponse['asset_class'] } | null;
  strategy_id: string | null;
  strategies: { name: string | null } | null;
  setup: string | null;
  bias: 'long' | 'short';
  thesis: string | null;
  risk_per_trade: number | null;
  target_r: number | null;
  tags: string[] | null;
  opened_at: string;
  closed_at: string | null;
  screenshot_urls: string[] | null;
  trade_legs: TradeLegRow[] | null;
};

type TradeStatsRecord = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  bias: 'long' | 'short';
  risk_per_trade: number | null;
  trade_legs: TradeLegRow[] | null;
};

type ReviewRecord = {
  id: string;
  period: JournalReviewPeriod;
  period_start: string;
  period_end: string;
  notes: string | null;
  auto_stats: unknown;
  created_at: string | null;
};

type TradeExportRecord = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  bias: 'long' | 'short';
  setup: string | null;
  thesis: string | null;
  risk_per_trade: number | null;
  target_r: number | null;
  tags: string[] | null;
  accounts: { name: string | null; broker: string | null } | null;
  instruments: {
    symbol: string | null;
    asset_class: TradeDetailResponse['asset_class'];
  } | null;
  strategies: { name: string | null } | null;
  trade_legs: TradeLegRow[] | null;
};

type TradeScreenshotStateRecord = {
  id: string;
  screenshot_urls: string[] | null;
};

type TradeDeleteResult = {
  id: string;
  screenshot_cleanup: JournalDeleteTradeCleanup;
  cleanup_error: string | null;
};

type TradeLegStateRecord = {
  id: string;
  trade_legs: TradeLegRow[] | null;
};

export function getTradeListSelect() {
  return tradeListSelect;
}

export function getTradeDetailSelect() {
  return tradeDetailSelect;
}

export function getTradeStatsSelect() {
  return tradeStatsSelect;
}

export function getReviewSelect() {
  return reviewSelect;
}

export function getTradeExportSelect() {
  return tradeExportSelect;
}

export async function getTradeFormLookups(supabase: SupabaseClient): Promise<JournalTradeFormLookups> {
  const [accountsResult, instrumentsResult, strategiesResult] = await Promise.all([
    supabase.from('accounts').select('id, name, broker, base_currency').order('name', { ascending: true }),
    supabase.from('instruments').select('id, symbol, asset_class, quote_currency').order('symbol', { ascending: true }),
    supabase.from('strategies').select('id, name, description').order('name', { ascending: true }),
  ]);

  if (accountsResult.error) {
    throw new Error(`Failed to load accounts: ${accountsResult.error.message}`);
  }

  if (instrumentsResult.error) {
    throw new Error(`Failed to load instruments: ${instrumentsResult.error.message}`);
  }

  if (strategiesResult.error) {
    throw new Error(`Failed to load strategies: ${strategiesResult.error.message}`);
  }

  return {
    accounts: (accountsResult.data ?? []).map((account) => ({
      id: account.id,
      label: account.broker ? `${account.name} | ${account.broker}` : account.name,
      description: account.base_currency,
    })),
    instruments: (instrumentsResult.data ?? []).map((instrument) => ({
      id: instrument.id,
      label: `${instrument.symbol} | ${instrument.asset_class}`,
      description: instrument.quote_currency,
    })),
    strategies: (strategiesResult.data ?? []).map((strategy) => ({
      id: strategy.id,
      label: strategy.name,
      description: strategy.description,
    })),
  };
}

function normalizeLegs(legs: TradeLegRow[] | null | undefined) {
  return (legs ?? [])
    .map((leg) => ({
      id: leg.id,
      side: leg.side,
      qty: leg.qty,
      price: leg.price,
      fee: leg.fee ?? 0,
      slippage: leg.slippage ?? 0,
      executed_at: leg.executed_at,
    }))
    .sort((left, right) => {
      const leftTime = left.executed_at ? new Date(left.executed_at).getTime() : 0;
      const rightTime = right.executed_at ? new Date(right.executed_at).getTime() : 0;
      return leftTime - rightTime;
    });
}

function getDisplayEntryExit(aggregate: ReturnType<typeof aggregateTrade>, bias: 'long' | 'short') {
  if (bias === 'long') {
    return {
      avgEntry: aggregate.avgBuy || null,
      avgExit: aggregate.avgSell || null,
    };
  }

  return {
    avgEntry: aggregate.avgSell || null,
    avgExit: aggregate.avgBuy || null,
  };
}

function getTradeSides(bias: 'long' | 'short') {
  if (bias === 'long') {
    return {
      entrySide: 'buy' as const,
      exitSide: 'sell' as const,
    };
  }

  return {
    entrySide: 'sell' as const,
    exitSide: 'buy' as const,
  };
}

function sumLegQtyBySide(
  legs: Array<Pick<TradeLegRow, 'side' | 'qty'>>,
  side: 'buy' | 'sell',
) {
  return legs
    .filter((leg) => leg.side === side)
    .reduce((sum, leg) => sum + leg.qty, 0);
}

function getTradeResolution(
  legs: ReturnType<typeof normalizeLegs>,
  bias: 'long' | 'short',
): JournalTradeResolution {
  const { entrySide, exitSide } = getTradeSides(bias);
  const entryQty = sumLegQtyBySide(legs, entrySide);
  const exitQty = sumLegQtyBySide(legs, exitSide);
  const resolvedQty = Math.min(entryQty, exitQty);
  const remainingQty = Math.max(entryQty - exitQty, 0);

  if (resolvedQty <= Number.EPSILON) {
    return 'open';
  }

  if (remainingQty <= Number.EPSILON) {
    return 'closed';
  }

  return 'partially_closed';
}

function getEquityTimestamp(
  record: Pick<TradeStatsRecord, 'opened_at' | 'closed_at' | 'bias'>,
  legs: ReturnType<typeof normalizeLegs>,
) {
  const { exitSide } = getTradeSides(record.bias);
  const lastExitAt = legs
    .filter((leg) => leg.side === exitSide)
    .map((leg) => leg.executed_at)
    .filter((value): value is string => Boolean(value))
    .at(-1);

  return record.closed_at ?? lastExitAt ?? record.opened_at;
}

export function applyTradeListFilters<
  TBuilder extends {
    gte: (column: string, value: string) => TBuilder;
    lte: (column: string, value: string) => TBuilder;
  },
>(builder: TBuilder, query: TradeQuery) {
  let nextBuilder = builder;

  if (query.from) {
    nextBuilder = nextBuilder.gte('opened_at', query.from);
  }

  if (query.to) {
    nextBuilder = nextBuilder.lte('opened_at', query.to);
  }

  return nextBuilder;
}

export function mapTradeList(records: TradeListRecord[]) {
  return records.map((trade) => {
    const normalizedLegs = (trade.legs ?? []).map((leg) => ({
      qty: leg.qty,
      price: leg.price,
      side: leg.side,
      fee: leg.fee ?? undefined,
      slippage: leg.slippage ?? undefined,
    }));
    const aggregate = aggregateTrade(normalizedLegs, trade.bias);
    const { entrySide } = getTradeSides(trade.bias);
    const entryQty = sumLegQtyBySide(normalizedLegs, entrySide);
    const displayAverages = getDisplayEntryExit(aggregate, trade.bias);

    return {
      id: trade.id,
      opened_at: trade.opened_at,
      symbol: trade.instruments?.symbol ?? null,
      side: trade.bias,
      qty: entryQty,
      avg_entry: displayAverages.avgEntry,
      avg_exit: displayAverages.avgExit,
      pnl_net: aggregate.pnlNet || 0,
      r: rMultiple(aggregate.pnlNet, trade.risk_per_trade),
      strategy: trade.strategies?.name ?? null,
    };
  });
}

export function buildEquityCurve(rows: Array<{ opened_at: string; pnl_net: number }>) {
  return rows
    .slice()
    .sort((left, right) => new Date(left.opened_at).getTime() - new Date(right.opened_at).getTime())
    .reduce<Array<{ d: string; v: number }>>((points, row, index) => {
      const previous = index > 0 ? points[index - 1]?.v ?? 0 : 0;
      points.push({
        d: row.opened_at,
        v: previous + (row.pnl_net ?? 0),
      });
      return points;
    }, []);
}

export function buildJournalDashboardStats(records: TradeStatsRecord[]): JournalDashboardStats {
  const equityRows: Array<{ opened_at: string; pnl_net: number }> = [];
  let closedTrades = 0;
  let openTrades = 0;
  let partiallyClosedTrades = 0;
  let netPnlClosed = 0;
  const resolvedRValues: number[] = [];

  for (const record of records) {
    const normalizedLegs = normalizeLegs(record.trade_legs);
    const aggregate = aggregateTrade(
      normalizedLegs.map((leg) => ({
        side: leg.side,
        qty: leg.qty,
        price: leg.price,
        fee: leg.fee ?? undefined,
        slippage: leg.slippage ?? undefined,
      })),
      record.bias,
    );
    const resolution = getTradeResolution(normalizedLegs, record.bias);

    if (resolution === 'closed') {
      closedTrades += 1;
      netPnlClosed += aggregate.pnlNet;
    } else if (resolution === 'partially_closed') {
      partiallyClosedTrades += 1;
    } else {
      openTrades += 1;
    }

    if (resolution !== 'open') {
      const resolvedR = rMultiple(aggregate.pnlNet, record.risk_per_trade);
      if (resolvedR != null) {
        resolvedRValues.push(resolvedR);
      }
    }

    equityRows.push({
      opened_at: getEquityTimestamp(record, normalizedLegs),
      pnl_net: aggregate.pnlNet,
    });
  }

  return {
    total_trades: records.length,
    closed_trades: closedTrades,
    open_trades: openTrades,
    partially_closed_trades: partiallyClosedTrades,
    net_pnl_closed: netPnlClosed,
    avg_r_closed_or_resolved:
      resolvedRValues.length > 0
        ? resolvedRValues.reduce((sum, value) => sum + value, 0) /
          resolvedRValues.length
        : null,
    equity: buildEquityCurve(equityRows),
    assumptions: {
      equity_basis: 'realized_net_to_date',
      avg_r_basis: 'closed_or_partially_closed_with_risk',
      open_trade_costs_included: true,
      notes: [
        'Equity uses all authenticated trades rather than the current list page.',
        'Closed trades contribute full matched PnL minus recorded fees and slippage.',
        'Partially closed trades contribute matched PnL and all recorded costs to date.',
        'Open trades contribute recorded fees and slippage only; unrealized mark-to-market is excluded.',
      ],
    },
  };
}

function filterTradeStatsRecordsByPeriod(
  records: TradeStatsRecord[],
  periodStart: string,
  periodEnd: string,
) {
  const startTime = Date.parse(`${periodStart}T00:00:00.000Z`);
  const endTime = Date.parse(`${periodEnd}T23:59:59.999Z`);

  return records.filter((record) => {
    const openedTime = Date.parse(record.opened_at);
    return openedTime >= startTime && openedTime <= endTime;
  });
}

export function buildCurrentReviewStatsSnapshot(
  records: TradeStatsRecord[],
  periodStart: string,
  periodEnd: string,
): JournalReviewStatsSnapshot {
  const periodTradeRecords = filterTradeStatsRecordsByPeriod(
    records,
    periodStart,
    periodEnd,
  );

  return buildReviewStatsSnapshotFromDashboardStats(
    buildJournalDashboardStats(periodTradeRecords),
    [
      `Computed from trades opened between ${periodStart} and ${periodEnd}.`,
      'Uses the current realized net-to-date foundation and excludes unrealized mark-to-market.',
    ],
  );
}

function mapReviewRecord(
  record: ReviewRecord,
  tradeStatsRecords: TradeStatsRecord[],
): JournalReviewRecord {
  return {
    id: record.id,
    period: record.period,
    period_start: record.period_start,
    period_end: record.period_end,
    notes: record.notes,
    created_at: record.created_at,
    updated_at: null,
    stored_stats: {
      source: 'stored_auto_stats',
      snapshot: normalizeStoredReviewStats(record.auto_stats),
    },
    current_period_stats: {
      source: 'current_period_realized_foundation',
      snapshot: buildCurrentReviewStatsSnapshot(
        tradeStatsRecords,
        record.period_start,
        record.period_end,
      ),
    },
  };
}

export function mapTradeExportRows(
  records: TradeExportRecord[],
): JournalTradeExportRow[] {
  return records.map((record) => {
    const normalizedLegs = normalizeLegs(record.trade_legs);
    const aggregate = aggregateTrade(
      normalizedLegs.map((leg) => ({
        side: leg.side,
        qty: leg.qty,
        price: leg.price,
        fee: leg.fee ?? undefined,
        slippage: leg.slippage ?? undefined,
      })),
      record.bias,
    );
    const displayAverages = getDisplayEntryExit(aggregate, record.bias);
    const { entrySide } = getTradeSides(record.bias);
    const entryQty = sumLegQtyBySide(normalizedLegs, entrySide);

    return {
      trade_id: record.id,
      opened_at: record.opened_at,
      closed_at: record.closed_at,
      account: record.accounts?.name ?? null,
      broker: record.accounts?.broker ?? null,
      symbol: record.instruments?.symbol ?? null,
      asset_class: record.instruments?.asset_class ?? null,
      strategy: record.strategies?.name ?? null,
      setup: record.setup,
      thesis: record.thesis,
      bias: record.bias,
      resolution: getTradeResolution(normalizedLegs, record.bias),
      qty: entryQty,
      avg_entry: displayAverages.avgEntry,
      avg_exit: displayAverages.avgExit,
      pnl_net: aggregate.pnlNet,
      r: rMultiple(aggregate.pnlNet, record.risk_per_trade),
      risk_per_trade: record.risk_per_trade,
      target_r: record.target_r,
      fees_total: aggregate.fees,
      slippage_total: aggregate.slippage,
      tags: record.tags ?? [],
    };
  });
}

export function mapReviewExportRows(
  records: ReviewRecord[],
): JournalReviewExportRow[] {
  return records.map((record) => {
    const snapshot = normalizeStoredReviewStats(record.auto_stats);

    return {
      review_id: record.id,
      period: record.period,
      period_start: record.period_start,
      period_end: record.period_end,
      notes: record.notes,
      created_at: record.created_at,
      snapshot_completeness: snapshot.completeness,
      total_trades: snapshot.total_trades,
      closed_trades: snapshot.closed_trades,
      open_trades: snapshot.open_trades,
      partially_closed_trades: snapshot.partially_closed_trades,
      net_pnl_closed: snapshot.net_pnl_closed,
      avg_r_closed_or_resolved: snapshot.avg_r_closed_or_resolved,
      unsupported_keys: snapshot.unsupported_keys,
      snapshot_notes: snapshot.notes,
    };
  });
}

async function resolveTradeScreenshots(
  supabase: SupabaseClient,
  screenshotPaths: string[],
): Promise<TradeScreenshotAsset[]> {
  return Promise.all(
    screenshotPaths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from(JOURNAL_SCREENSHOTS_BUCKET)
        .createSignedUrl(path, 60 * 60);

      if (error || !data?.signedUrl) {
        return {
          path,
          signed_url: null,
          status: 'unavailable' as const,
        };
      }

      return {
        path,
        signed_url: data.signedUrl,
        status: 'available' as const,
      };
    }),
  );
}

export function mapTradeDetail(record: TradeDetailRecord): TradeDetailResponse {
  const normalizedLegs = normalizeLegs(record.trade_legs);
  const aggregate = aggregateTrade(
    normalizedLegs.map((leg) => ({
      side: leg.side,
      qty: leg.qty,
      price: leg.price,
      fee: leg.fee ?? undefined,
      slippage: leg.slippage ?? undefined,
    })),
    record.bias,
  );
  const displayAverages = getDisplayEntryExit(aggregate, record.bias);
  const { entrySide } = getTradeSides(record.bias);
  const entryQty = sumLegQtyBySide(normalizedLegs, entrySide);

  return {
    id: record.id,
    account_id: record.account_id,
    account_name: record.accounts?.name ?? null,
    account_broker: record.accounts?.broker ?? null,
    instrument_id: record.instrument_id,
    symbol: record.instruments?.symbol ?? null,
    asset_class: record.instruments?.asset_class ?? null,
    strategy_id: record.strategy_id,
    strategy_name: record.strategies?.name ?? null,
    setup: record.setup,
    bias: record.bias,
    thesis: record.thesis,
    risk_per_trade: record.risk_per_trade,
    target_r: record.target_r,
    tags: record.tags ?? [],
    opened_at: record.opened_at,
    closed_at: record.closed_at,
    screenshot_urls: record.screenshot_urls ?? [],
    screenshots: [],
    trade_legs: normalizedLegs,
    metrics: {
      qty: entryQty,
      avg_entry: displayAverages.avgEntry,
      avg_exit: displayAverages.avgExit,
      pnl_net: aggregate.pnlNet,
      pnl_gross: aggregate.pnlGross,
      r: rMultiple(aggregate.pnlNet, record.risk_per_trade),
      fees_total: aggregate.fees,
      slippage_total: aggregate.slippage,
      net_position: aggregate.netPos,
    },
  };
}

export async function getTradeDetailById(supabase: SupabaseClient, tradeId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(getTradeDetailSelect())
    .eq('id', tradeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load trade detail: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const trade = mapTradeDetail(data as unknown as TradeDetailRecord);

  return {
    ...trade,
    screenshots: await resolveTradeScreenshots(supabase, trade.screenshot_urls),
  };
}

export async function getTradeScreenshotStateById(
  supabase: SupabaseClient,
  tradeId: string,
) {
  const { data, error } = await supabase
    .from('trades')
    .select('id, screenshot_urls')
    .eq('id', tradeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load trade screenshot state: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    screenshot_urls:
      (data as unknown as TradeScreenshotStateRecord).screenshot_urls ?? [],
  };
}

export async function getTradeLegStateById(
  supabase: SupabaseClient,
  tradeId: string,
) {
  const { data, error } = await supabase
    .from('trades')
    .select('id, trade_legs(id, side, qty, price, fee, slippage, executed_at)')
    .eq('id', tradeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load trade leg state: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    trade_legs: normalizeLegs(
      (data as unknown as TradeLegStateRecord).trade_legs ?? [],
    ),
  };
}

export async function saveTradeScreenshotPaths(
  supabase: SupabaseClient,
  tradeId: string,
  existingPaths: string[] | null | undefined,
  newPaths: string[],
) {
  const screenshotPaths = mergeTradeScreenshotPaths(existingPaths, newPaths);
  const { data, error } = await supabase
    .from('trades')
    .update({ screenshot_urls: screenshotPaths })
    .eq('id', tradeId)
    .select('id, screenshot_urls')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to persist trade screenshots: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    screenshot_urls:
      (data as unknown as TradeScreenshotStateRecord).screenshot_urls ?? [],
  };
}

export async function deleteTradeWithScreenshotCleanup(
  supabase: SupabaseClient,
  tradeId: string,
): Promise<TradeDeleteResult | null> {
  const trade = await getTradeScreenshotStateById(supabase, tradeId);

  if (!trade) {
    return null;
  }

  const { data, error } = await supabase
    .from('trades')
    .delete()
    .eq('id', tradeId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete trade: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (trade.screenshot_urls.length === 0) {
    return {
      id: data.id,
      screenshot_cleanup: 'not_needed',
      cleanup_error: null,
    };
  }

  const { error: cleanupError } = await supabase.storage
    .from(JOURNAL_SCREENSHOTS_BUCKET)
    .remove(trade.screenshot_urls);

  return {
    id: data.id,
    screenshot_cleanup: cleanupError ? 'failed' : 'complete',
    cleanup_error: cleanupError?.message ?? null,
  };
}

export async function getJournalDashboardStats(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('trades')
    .select(getTradeStatsSelect())
    .order('opened_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load journal stats: ${error.message}`);
  }

  return buildJournalDashboardStats((data ?? []) as unknown as TradeStatsRecord[]);
}

export async function replaceTradeLegsForTrade(
  supabase: SupabaseClient,
  tradeId: string,
  legs: ReplaceTradeLegs['legs'],
) {
  const trade = await getTradeLegStateById(supabase, tradeId);

  if (!trade) {
    return null;
  }

  const previousLegs = trade.trade_legs.map((leg) => ({
    side: leg.side,
    qty: leg.qty,
    price: leg.price,
    fee: leg.fee ?? 0,
    slippage: leg.slippage ?? 0,
    executed_at: leg.executed_at ?? new Date().toISOString(),
  }));

  const { error: deleteError } = await supabase
    .from('trade_legs')
    .delete()
    .eq('trade_id', tradeId);

  if (deleteError) {
    throw new Error(`Failed to clear existing trade legs: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase
    .from('trade_legs')
    .insert(getTradeLegInsertPayload(tradeId, legs));

  if (insertError) {
    if (previousLegs.length > 0) {
      const { error: restoreError } = await supabase
        .from('trade_legs')
        .insert(getTradeLegInsertPayload(tradeId, previousLegs));

      if (restoreError) {
        throw new Error(
          `Trade leg replacement failed and previous legs could not be restored: ${restoreError.message}`,
        );
      }

      throw new Error(
        `Trade leg replacement failed. Previous legs were restored: ${insertError.message}`,
      );
    }

    throw new Error(`Failed to save replacement trade legs: ${insertError.message}`);
  }

  return {
    trade_id: tradeId,
    leg_count: legs.length,
  };
}

export async function getJournalReviews(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('reviews')
    .select(getReviewSelect())
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load reviews: ${error.message}`);
  }

  const reviewRecords = (data ?? []) as unknown as ReviewRecord[];

  if (reviewRecords.length === 0) {
    return [] as JournalReviewRecord[];
  }

  const { data: tradesData, error: tradesError } = await supabase
    .from('trades')
    .select(getTradeStatsSelect())
    .order('opened_at', { ascending: true });

  if (tradesError) {
    throw new Error(`Failed to load review trade context: ${tradesError.message}`);
  }

  const tradeStatsRecords = (tradesData ?? []) as unknown as TradeStatsRecord[];
  return reviewRecords.map((record) => mapReviewRecord(record, tradeStatsRecords));
}

export async function getJournalTradeExportRows(
  supabase: SupabaseClient,
  scope: Pick<JournalExportScope, 'from' | 'to'>,
) {
  const { data, error } = await supabase
    .from('trades')
    .select(getTradeExportSelect())
    .gte('opened_at', `${scope.from}T00:00:00.000Z`)
    .lte('opened_at', `${scope.to}T23:59:59.999Z`)
    .order('opened_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load trade export data: ${error.message}`);
  }

  return mapTradeExportRows((data ?? []) as unknown as TradeExportRecord[]);
}

export async function getJournalReviewExportRows(
  supabase: SupabaseClient,
  scope: Pick<JournalExportScope, 'from' | 'to' | 'period'>,
) {
  let builder = supabase
    .from('reviews')
    .select(getReviewSelect())
    .gte('period_start', scope.from)
    .lte('period_end', scope.to)
    .order('period_start', { ascending: true })
    .order('created_at', { ascending: true });

  if (scope.period) {
    builder = builder.eq('period', scope.period);
  }

  const { data, error } = await builder;

  if (error) {
    throw new Error(`Failed to load review export data: ${error.message}`);
  }

  return mapReviewExportRows((data ?? []) as unknown as ReviewRecord[]);
}

export function buildJournalTradesExportDocument(
  scope: Pick<JournalExportQuery, 'from' | 'to'>,
  rows: JournalTradeExportRow[],
): JournalTradesExportDocument {
  return {
    resource: 'trades',
    format: 'json',
    exported_at: new Date().toISOString(),
    scope,
    rows,
    notes: [
      'Trade exports are trade-level only in the current export contract; execution legs are not exported as separate rows.',
      'Derived fields use the same realized math already used by the authenticated journal UI.',
      'Screenshot URLs, storage paths, and media payloads are intentionally excluded.',
    ],
  };
}

export function buildJournalReviewsExportDocument(
  scope: Pick<JournalExportQuery, 'from' | 'to' | 'period'>,
  rows: JournalReviewExportRow[],
): JournalReviewsExportDocument {
  return {
    resource: 'reviews',
    format: 'json',
    exported_at: new Date().toISOString(),
    scope,
    rows,
    notes: [
      'Review exports include the persisted review row plus the normalized stored auto_stats snapshot.',
      'Current live period snapshots are not exported in the current export contract.',
      'Unsupported legacy auto_stats keys remain hidden from the normalized export fields.',
    ],
  };
}

export async function saveJournalReview(
  supabase: SupabaseClient,
  userId: string,
  input: ReviewSave,
) {
  const { data: tradeStatsData, error: tradeStatsError } = await supabase
    .from('trades')
    .select(getTradeStatsSelect())
    .order('opened_at', { ascending: true });

  if (tradeStatsError) {
    throw new Error(
      `Failed to load review stats context: ${tradeStatsError.message}`,
    );
  }

  const currentSnapshot = buildCurrentReviewStatsSnapshot(
    (tradeStatsData ?? []) as unknown as TradeStatsRecord[],
    input.period_start,
    input.period_end,
  );
  const autoStats = buildPersistedReviewAutoStats(currentSnapshot);
  const reviewRecord = buildReviewSaveRecord(userId, input, autoStats);

  const { data: existingReview, error: existingError } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', userId)
    .eq('period', input.period)
    .eq('period_start', input.period_start)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check existing review: ${existingError.message}`);
  }

  if (existingReview?.id) {
    const { data: updatedReview, error: updateError } = await supabase
      .from('reviews')
      .update(reviewRecord)
      .eq('id', existingReview.id)
      .select('id')
      .single();

    if (updateError) {
      throw new Error(`Failed to update review: ${updateError.message}`);
    }

    return {
      id: updatedReview.id,
      action: 'updated' as const,
      auto_stats: autoStats,
    };
  }

  const { data: createdReview, error: insertError } = await supabase
    .from('reviews')
    .insert(reviewRecord)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create review: ${insertError.message}`);
  }

  return {
    id: createdReview.id,
    action: 'created' as const,
    auto_stats: autoStats,
  };
}

export async function assertOwnedTradeReferences(
  supabase: SupabaseClient,
  input: Pick<CreateTrade, 'account_id' | 'instrument_id' | 'strategy_id'> | Pick<UpdateTrade, 'account_id' | 'instrument_id' | 'strategy_id'>,
) {
  const checks = [
    { table: 'accounts', value: input.account_id, label: 'account' },
    { table: 'instruments', value: input.instrument_id, label: 'instrument' },
    { table: 'strategies', value: input.strategy_id, label: 'strategy' },
  ] as const;

  for (const check of checks) {
    if (!check.value) {
      continue;
    }

    const { data, error } = await supabase.from(check.table).select('id').eq('id', check.value).maybeSingle();

    if (error) {
      throw new Error(`Failed to verify ${check.label} ownership.`);
    }

    if (!data) {
      throw new Error(`Selected ${check.label} is not available to the current user.`);
    }
  }
}

export function getTradeInsertPayload(userId: string, body: CreateTrade) {
  return {
    user_id: userId,
    account_id: body.account_id,
    instrument_id: body.instrument_id,
    strategy_id: body.strategy_id ?? null,
    setup: body.setup ?? null,
    bias: body.bias,
    thesis: body.thesis ?? null,
    risk_per_trade: body.risk_per_trade ?? null,
    target_r: body.target_r ?? null,
    tags: body.tags ?? [],
    opened_at: body.opened_at,
    screenshot_urls: body.screenshot_urls ?? [],
  };
}

export function getTradeLegInsertPayload(tradeId: string, legs: CreateTrade['legs']) {
  return legs.map((leg) => ({
    trade_id: tradeId,
    side: leg.side,
    qty: leg.qty,
    price: leg.price,
    fee: leg.fee ?? 0,
    slippage: leg.slippage ?? 0,
    executed_at: leg.executed_at,
  }));
}

type TradeUpdatePayloadInput = UpdateTrade & {
  legs?: CreateTrade['legs'];
  screenshot_urls?: string[];
};

export function getTradeUpdatePayload(body: TradeUpdatePayloadInput) {
  if (body.legs) {
    throw new Error('Trade leg updates are not yet supported by PATCH /api/journal/[id].');
  }

  if (body.screenshot_urls) {
    throw new Error(
      'Screenshot updates must go through the dedicated screenshot upload route.',
    );
  }

  return Object.fromEntries(
    Object.entries({
      account_id: body.account_id,
      instrument_id: body.instrument_id,
      strategy_id: body.strategy_id,
      setup: body.setup,
      bias: body.bias,
      thesis: body.thesis,
      risk_per_trade: body.risk_per_trade,
      target_r: body.target_r,
      tags: body.tags,
      opened_at: body.opened_at,
    }).filter(([, value]) => value !== undefined),
  );
}
