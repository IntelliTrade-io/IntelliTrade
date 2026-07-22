import type {
  JournalDashboardStats,
  JournalReviewStatsSnapshot,
  JournalTradeResolution,
  TradeLegRow,
  TradeRow,
} from "./types";
import { buildReviewStatsSnapshotFromDashboardStats } from "./normalization";

export type Leg = {
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee?: number;
  slippage?: number;
};

export type Bias = "long" | "short";

export type TradeListRecord = {
  id: string;
  opened_at: string;
  bias: Bias;
  risk_per_trade: number | null;
  strategies: { name: string | null } | null;
  instruments: { symbol: string | null } | null;
  legs: Array<{
    qty: number;
    price: number;
    side: "buy" | "sell";
    fee?: number | null;
    slippage?: number | null;
  }> | null;
};

export type TradeStatsRecord = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  bias: Bias;
  risk_per_trade: number | null;
  trade_legs: TradeLegRow[] | null;
};

export function aggregateTrade(
  legs: Leg[],
  _bias: Bias,
  contractSize = 1,
) {
  let buyQty = 0;
  let buyCost = 0;
  let sellQty = 0;
  let sellProceeds = 0;
  let fees = 0;
  let slippage = 0;

  for (const leg of legs) {
    if (leg.side === "buy") {
      buyQty += leg.qty;
      buyCost += leg.qty * leg.price * contractSize;
    } else {
      sellQty += leg.qty;
      sellProceeds += leg.qty * leg.price * contractSize;
    }

    fees += leg.fee ?? 0;
    slippage += leg.slippage ?? 0;
  }

  const netPos = buyQty - sellQty;
  const avgBuy = buyQty ? buyCost / (buyQty * contractSize) : 0;
  const avgSell = sellQty
    ? sellProceeds / (sellQty * contractSize)
    : 0;
  const matchedQty = Math.min(buyQty, sellQty);
  const pnlGross = (avgSell - avgBuy) * matchedQty * contractSize;
  const pnlNet = pnlGross - fees - slippage;

  return {
    avgBuy,
    avgSell,
    pnlGross,
    pnlNet,
    fees,
    slippage,
    netPos,
  };
}

export function rMultiple(
  pnlNet: number,
  riskAmount?: number | null,
) {
  if (!riskAmount || riskAmount === 0) {
    return null;
  }

  return pnlNet / riskAmount;
}

export function normalizeLegs(legs: TradeLegRow[] | null | undefined) {
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
      const leftTime = left.executed_at
        ? new Date(left.executed_at).getTime()
        : 0;
      const rightTime = right.executed_at
        ? new Date(right.executed_at).getTime()
        : 0;
      return leftTime - rightTime;
    });
}

export function getDisplayEntryExit(
  aggregate: ReturnType<typeof aggregateTrade>,
  bias: Bias,
) {
  if (bias === "long") {
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

export function getTradeSides(bias: Bias) {
  if (bias === "long") {
    return {
      entrySide: "buy" as const,
      exitSide: "sell" as const,
    };
  }

  return {
    entrySide: "sell" as const,
    exitSide: "buy" as const,
  };
}

export function sumLegQtyBySide(
  legs: Array<Pick<TradeLegRow, "side" | "qty">>,
  side: "buy" | "sell",
) {
  return legs
    .filter((leg) => leg.side === side)
    .reduce((sum, leg) => sum + leg.qty, 0);
}

export function getTradeResolution(
  legs: ReturnType<typeof normalizeLegs>,
  bias: Bias,
): JournalTradeResolution {
  const { entrySide, exitSide } = getTradeSides(bias);
  const entryQty = sumLegQtyBySide(legs, entrySide);
  const exitQty = sumLegQtyBySide(legs, exitSide);
  const resolvedQty = Math.min(entryQty, exitQty);
  const remainingQty = Math.max(entryQty - exitQty, 0);

  if (resolvedQty <= Number.EPSILON) {
    return "open";
  }

  if (remainingQty <= Number.EPSILON) {
    return "closed";
  }

  return "partially_closed";
}

export function getEquityTimestamp(
  record: Pick<TradeStatsRecord, "opened_at" | "closed_at" | "bias">,
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

export function mapTradeList(records: TradeListRecord[]): TradeRow[] {
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

export function buildEquityCurve(
  rows: Array<{ opened_at: string; pnl_net: number }>,
) {
  return rows
    .slice()
    .sort(
      (left, right) =>
        new Date(left.opened_at).getTime() -
        new Date(right.opened_at).getTime(),
    )
    .reduce<Array<{ d: string; v: number }>>((points, row, index) => {
      const previous = index > 0 ? (points[index - 1]?.v ?? 0) : 0;
      points.push({
        d: row.opened_at,
        v: previous + (row.pnl_net ?? 0),
      });
      return points;
    }, []);
}

export function buildJournalDashboardStats(
  records: TradeStatsRecord[],
): JournalDashboardStats {
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

    if (resolution === "closed") {
      closedTrades += 1;
      netPnlClosed += aggregate.pnlNet;
    } else if (resolution === "partially_closed") {
      partiallyClosedTrades += 1;
    } else {
      openTrades += 1;
    }

    if (resolution !== "open") {
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
  };
}

export function filterTradeStatsRecordsByPeriod(
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
      "Uses the current realized net-to-date foundation and excludes unrealized mark-to-market.",
    ],
  );
}
