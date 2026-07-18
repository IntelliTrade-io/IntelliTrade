// Server-side 1d/7d/30d change figures for the prices-today pages, computed
// from CurrencyFreaks latest + historical rates. Fetched in the pages' server
// components so the figures are server-rendered, crawlable text (same rationale
// as marketContext.ts). Historical rates for a past date never change, so those
// fetches cache for a day; the latest quote follows the pages' ISR cadence.
//
// The API key stays server-only (audit H7); this module must never be imported
// from a client component — client code takes the computed figures as props.

export type PriceChangeFigures = {
  /** Current USD price of the asset. */
  current: number;
  /** Percent change vs 1/7/30 days ago; null when that lookback is unavailable. */
  d1: number | null;
  d7: number | null;
  d30: number | null;
};

type CfSymbol = "XAU" | "XAG" | "BTC" | "ETH";

const CF_BASE = "https://api.currencyfreaks.com/v2.0/rates";

/** CurrencyFreaks rates are "units per USD"; asset price in USD is the inverse. */
function priceFromRates(rates: unknown, symbol: string): number | null {
  if (typeof rates !== "object" || rates === null) return null;
  const perUsd = parseFloat((rates as Record<string, string>)[symbol] ?? "");
  if (!isFinite(perUsd) || perUsd <= 0) return null;
  return 1 / perUsd;
}

async function fetchPrice(
  apiKey: string,
  symbol: CfSymbol,
  date: string | null,
  revalidate: number,
): Promise<number | null> {
  const url =
    date === null
      ? `${CF_BASE}/latest?apikey=${apiKey}&symbols=${symbol}`
      : `${CF_BASE}/historical?apikey=${apiKey}&date=${date}&symbols=${symbol}`;
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: unknown };
    return priceFromRates(data.rates, symbol);
  } catch {
    return null;
  }
}

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const pctChange = (now: number, then: number | null): number | null =>
  then === null || then <= 0 ? null : ((now - then) / then) * 100;

/**
 * Current price plus percent change vs 1, 7 and 30 days ago. Returns null when
 * no current quote is available; individual lookbacks degrade to null so the
 * page renders what it has and fabricates nothing.
 */
export async function fetchPriceChangeFigures(symbol: CfSymbol): Promise<PriceChangeFigures | null> {
  const apiKey = process.env.CURRENCYFREAKS_API_KEY ?? process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
  if (!apiKey) return null;

  const [current, p1, p7, p30] = await Promise.all([
    fetchPrice(apiKey, symbol, null, 300),
    fetchPrice(apiKey, symbol, isoDaysAgo(1), 86_400),
    fetchPrice(apiKey, symbol, isoDaysAgo(7), 86_400),
    fetchPrice(apiKey, symbol, isoDaysAgo(30), 86_400),
  ]);
  if (current === null) return null;

  return {
    current,
    d1: pctChange(current, p1),
    d7: pctChange(current, p7),
    d30: pctChange(current, p30),
  };
}
