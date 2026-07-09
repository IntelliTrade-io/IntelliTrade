export interface ChartLogicalRange {
  from: number;
  to: number;
}

export function getSupportResistanceChartMinHeight(compact: boolean): number {
  return compact ? 270 : 460;
}

export function getSupportResistanceChartViewportHeight(host: HTMLElement | null, fallbackHeight: number): number {
  return Math.max(fallbackHeight, Math.round(host?.clientHeight ?? 0));
}

export function buildSupportResistanceVisibleLogicalRange(candleCount: number): ChartLogicalRange | null {
  if (candleCount <= 0) {
    return null;
  }

  const sidePadding = candleCount < 32 ? 2 : Math.max(2, Math.round(candleCount * 0.08));

  return {
    from: -sidePadding,
    to: candleCount - 1 + sidePadding,
  };
}
