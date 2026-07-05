// Lot-size calculator domain math, extracted from the calculator component
// (refactor plan 5.5) so the money math is unit-tested. The component keeps
// only fetch orchestration and UI state.

export const normalizePair = (pair: string) => pair.replace("/", "").toUpperCase();

export const parsePair = (pair: string) => {
  const s = normalizePair(pair);
  if (s.length !== 6) throw new Error("Pair must be like 'EURUSD' or 'EUR/USD'");
  return { base: s.slice(0, 3), quote: s.slice(3, 6) };
};

// Pip size per instrument (your broker may differ for metals/CFDs/crypto)
export const pipSizeFor = (p: string) => {
  const s = normalizePair(p);
  if (s.endsWith("JPY")) return 0.01; // FX JPY pairs: 0.01
  if (s.startsWith("XAU")) return 0.01; // XAUUSD: $0.01 per oz
  if (s.startsWith("XAG")) return 0.01; // XAGUSD: $0.01 per oz
  if (s.startsWith("WTI")) return 0.01; // WTIUSD: $0.01 per barrel (only if supported elsewhere)
  if (s.startsWith("BTC")) return 1; // define "pip" = $1
  if (s.startsWith("ETH")) return 1; // define "pip" = $1
  return 0.0001; // Most FX
};

// Contract size per lot (typical broker conventions; adjust if needed)
export const contractSizeFor = (p: string) => {
  const s = normalizePair(p);
  if (s.startsWith("XAU")) return 100; // 1 lot = 100 oz
  if (s.startsWith("XAG")) return 5000; // 1 lot = 5,000 oz
  if (s.startsWith("WTI")) return 1000; // 1 lot = 1,000 barrels
  if (s.startsWith("BTC")) return 1; // 1 lot = 1 BTC (broker dependent)
  if (s.startsWith("ETH")) return 1; // 1 lot = 1 ETH (broker dependent)
  return 100000; // FX: 1 lot = 100,000 units
};

export const PREFERRED_BASES = [
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  // extended asset codes that CurrencyFreaks lists when available
  "XAU",
  "XAG",
  "BTC",
  "ETH",
];

export function composePairsFrom(codes: Set<string>) {
  // Keep only codes we actually have
  const avail = PREFERRED_BASES.filter((c) => codes.has(c));

  const fxMajors = [
    // majors vs USD in both directions
    ...["EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "JPY"]
      .filter((c) => c !== "USD" && avail.includes(c) && avail.includes("USD"))
      .flatMap((c) => [`${c}USD`, `USD${c}`]),
  ];

  const popularCrossPairsDefs: Array<[string, string]> = [
    ["EUR", "GBP"],
    ["EUR", "JPY"],
    ["GBP", "JPY"],
    ["EUR", "AUD"],
    ["EUR", "CAD"],
    ["EUR", "CHF"],
    ["EUR", "NZD"],
    ["GBP", "AUD"],
    ["GBP", "CAD"],
    ["GBP", "CHF"],
    ["GBP", "NZD"],
    ["AUD", "JPY"],
    ["CAD", "JPY"],
    ["CHF", "JPY"],
    ["NZD", "JPY"],
  ];

  const crosses = popularCrossPairsDefs
    .filter(([a, b]) => avail.includes(a) && avail.includes(b))
    .map(([a, b]) => `${a}${b}`);

  const metalsCrypto = ["XAU", "XAG", "BTC", "ETH"]
    .filter((c) => avail.includes(c) && avail.includes("USD"))
    .map((c) => `${c}USD`);

  return Array.from(new Set([...fxMajors, ...crosses, ...metalsCrypto])).sort();
}

/**
 * BASE/QUOTE rate (quote units per base unit) from a USD-based rates map,
 * as returned by /api/rates ({ [code]: "units per USD" }).
 * Throws on missing/invalid rates.
 */
export function rateFromUsdRates(base: string, quote: string, rates: Record<string, string>): number {
  const usdToBase = base === "USD" ? 1 : parseFloat(rates[base]);
  const usdToQuote = quote === "USD" ? 1 : parseFloat(rates[quote]);

  if (!isFinite(usdToBase) || !isFinite(usdToQuote)) throw new Error("Invalid API rates");

  if (base === "USD") return usdToQuote;
  if (quote === "USD") return 1 / usdToBase;
  return usdToQuote / usdToBase;
}

export interface LotSizeInputs {
  /** Account balance in account currency. */
  balance: number;
  /** Risk per trade as a percentage of balance (e.g. 1 for 1%). */
  riskPercent: number;
  /** Stop-loss distance in pips. */
  stopLossPips: number;
  /** Instrument, e.g. "EURUSD" or "EUR/USD". */
  pair: string;
  /** Rate converting the pair's quote currency into the account currency (1 when identical). */
  quoteToAccount: number;
}

export interface LotSizeResult {
  /** Amount at risk, in account currency. */
  riskAmount: number;
  /** Value of one pip for one lot, in account currency. */
  pipValuePerLot: number;
  /** Position size in lots. */
  lots: number;
}

export function computeLotSize({ balance, riskPercent, stopLossPips, pair, quoteToAccount }: LotSizeInputs): LotSizeResult {
  const cleanPair = normalizePair(pair);
  const pipSize = pipSizeFor(cleanPair);
  const contractSize = contractSizeFor(cleanPair);

  const riskAmount = balance * (riskPercent / 100);

  // Pip value per UNIT in QUOTE currency is pipSize (for FX/CFDs);
  // convert into ACCOUNT currency, then scale to one lot.
  const pipValuePerLot = pipSize * quoteToAccount * contractSize;

  const riskPerLot = stopLossPips * pipValuePerLot;
  if (!isFinite(riskPerLot) || riskPerLot <= 0) {
    throw new Error("Calculated risk per lot is invalid.");
  }

  return { riskAmount, pipValuePerLot, lots: riskAmount / riskPerLot };
}
