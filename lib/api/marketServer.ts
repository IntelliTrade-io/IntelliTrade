// Server-side market-data fetchers for the price pages (plan 5.2: server
// components fetch directly, no HTTP round-trip to our own routes). Each value
// is fetched once per revalidate window and shared by every visitor; the
// client components are seeded with these values and only poll for refreshes.
// Upstream URLs are built exactly like the /api/rates, /api/dxy and
// /api/fred-yield routes so the Next data cache is shared between both paths.
// All return null on any failure — callers render a fallback, never throw.

const CF_LATEST = "https://api.currencyfreaks.com/v2.0/rates/latest";

// ICE U.S. Dollar Index weights (shared with /api/dxy).
export const DXY_WEIGHTS: Record<string, number> = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
};
const DXY_MULTIPLIER = 50.14348112;

function cfApiKey(): string | undefined {
  // Server-only var preferred; legacy public fallback until the Vercel env
  // rename + key rotation lands (audit H7).
  return (
    process.env.CURRENCYFREAKS_API_KEY ??
    process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY
  );
}

async function cfRates(
  symbols: string,
  revalidate: number,
): Promise<Record<string, string> | null> {
  const apiKey = cfApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(`${CF_LATEST}?apikey=${apiKey}&symbols=${symbols}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.rates ?? null;
  } catch {
    return null;
  }
}

/** USD price of an asset (XAU, XAG, BTC …): CurrencyFreaks quotes units per USD. */
export async function getUsdPrice(symbol: string): Promise<number | null> {
  const rates = await cfRates(symbol, 60);
  const perUsd = parseFloat(rates?.[symbol] ?? "");
  if (!isFinite(perUsd) || perUsd <= 0) return null;
  return 1 / perUsd;
}

/**
 * DXY = 50.14348112 × EUR^0.576 × JPY^0.136 × GBP^0.119 × CAD^0.091 × SEK^0.042 × CHF^0.036
 * CurrencyFreaks rates are X-per-USD, which maps directly to the formula.
 */
export async function getDxy(): Promise<number | null> {
  const rates = await cfRates(Object.keys(DXY_WEIGHTS).join(","), 300);
  if (!rates) return null;
  let dxy = DXY_MULTIPLIER;
  for (const [currency, weight] of Object.entries(DXY_WEIGHTS)) {
    const rate = parseFloat(rates[currency] ?? "");
    if (!isFinite(rate) || rate <= 0) return null;
    dxy *= Math.pow(rate, weight);
  }
  return Math.round(dxy * 100) / 100;
}

/** Latest US 10-year Treasury yield from FRED; null when unavailable or not yet released. */
export async function getTenYearYield(): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${apiKey}&sort_order=desc&limit=1&file_type=json`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.observations?.[0]?.value as string | undefined;
    // FRED returns "." when data isn't released yet (weekends/holidays).
    if (!raw || raw === ".") return null;
    const value = parseFloat(raw);
    return isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
