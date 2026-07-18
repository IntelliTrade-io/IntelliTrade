// Pure math for the free economic-calendar recap: how much the market moved
// on the day of a past high-impact release. CurrencyFreaks historical rates
// are end-of-day "units of currency per USD", so the measurable move is the
// release-day close vs the previous trading day's close of the event
// currency's primary USD pair. Daily granularity is stated on the page; this
// is a historical reaction figure, never a forward-looking signal.

/** Primary USD pair per event currency, in market-convention orientation. */
export interface PairSpec {
  /** Display label, e.g. "EUR/USD". */
  pair: string;
  /** Whether the event currency is the base ("ccy") or USD is ("usd"). */
  base: "ccy" | "usd";
}

// USD events have no "USD pair" of their own; EUR/USD is the most liquid
// dollar pair and the conventional proxy, and every row labels its pair so
// nothing is implied.
export const CURRENCY_TO_PAIR: Record<string, PairSpec> = {
  USD: { pair: "EUR/USD", base: "ccy" },
  EUR: { pair: "EUR/USD", base: "ccy" },
  GBP: { pair: "GBP/USD", base: "ccy" },
  AUD: { pair: "AUD/USD", base: "ccy" },
  NZD: { pair: "NZD/USD", base: "ccy" },
  JPY: { pair: "USD/JPY", base: "usd" },
  CAD: { pair: "USD/CAD", base: "usd" },
  CHF: { pair: "USD/CHF", base: "usd" },
  CNY: { pair: "USD/CNH", base: "usd" },
};

/** CurrencyFreaks symbol whose rate the pair math needs (the non-USD leg). */
export function cfSymbolForCurrency(currency: string): string | null {
  const spec = CURRENCY_TO_PAIR[currency];
  if (!spec) return null;
  const [a, b] = spec.pair.split("/");
  const leg = a === "USD" ? b : a;
  if (!leg) return null;
  // CNH trades offshore but CurrencyFreaks quotes CNY.
  return leg === "CNH" ? "CNY" : leg;
}

/**
 * Percent move of the pair from the previous trading day's close to the
 * release day's close. Rates are "currency units per USD" (i.e. USD/CCY).
 * Returns null when either rate is missing or non-positive, or when the two
 * rates are identical (stale weekend/holiday snapshots must not render as a
 * confident 0.00%).
 */
export function pairMovePct(
  spec: PairSpec,
  rateOnDay: number | null,
  ratePrevDay: number | null,
): number | null {
  if (
    rateOnDay === null || ratePrevDay === null ||
    !isFinite(rateOnDay) || !isFinite(ratePrevDay) ||
    rateOnDay <= 0 || ratePrevDay <= 0
  ) {
    return null;
  }
  if (rateOnDay === ratePrevDay) return null;
  // USD-base pair (USD/CCY) moves with the raw rate; CCY-base (CCY/USD) is
  // the inverse.
  const pct =
    spec.base === "usd"
      ? (rateOnDay - ratePrevDay) / ratePrevDay
      : ratePrevDay / rateOnDay - 1;
  return pct * 100;
}

/**
 * Previous trading day (UTC calendar) for a YYYY-MM-DD date: weekends roll
 * back to Friday. Holidays are not modelled; a stale holiday rate is caught
 * by the identical-rates guard in pairMovePct.
 */
export function prevTradingDayUtc(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
