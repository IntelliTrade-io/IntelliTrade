// Shared market-data fetchers for the price pages and widgets (plan 5.2).
// All return null on any failure — callers render a fallback, never throw.

import { apiGet } from "./client";

/**
 * USD price of an asset via /api/rates, which returns CurrencyFreaks-shaped
 * { rates: { [symbol]: "units per USD" } } — so price = 1 / rate.
 */
export async function fetchUsdPrice(symbol: string): Promise<number | null> {
  try {
    const json = await apiGet<{ rates?: Record<string, string> }>(
      `/api/rates?symbols=${symbol}`,
    );
    const perUsd = parseFloat(json.rates?.[symbol] ?? "");
    if (!isFinite(perUsd) || perUsd <= 0) return null;
    return 1 / perUsd;
  } catch {
    return null;
  }
}

export async function fetchDxy(): Promise<number | null> {
  try {
    const json = await apiGet<{ dxy?: number | null }>("/api/dxy");
    return json.dxy ?? null;
  } catch {
    return null;
  }
}

export async function fetchTenYearYield(): Promise<number | null> {
  try {
    const json = await apiGet<{ yield?: number | null }>("/api/fred-yield");
    return json.yield ?? null;
  } catch {
    return null;
  }
}
