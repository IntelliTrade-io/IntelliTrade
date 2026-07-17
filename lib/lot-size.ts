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
  const usdToBase = base === "USD" ? 1 : parseFloat(rates[base] ?? "");
  const usdToQuote = quote === "USD" ? 1 : parseFloat(rates[quote] ?? "");

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

export interface PipValueInputs {
  /** Instrument, e.g. "EURUSD" or "EUR/USD". */
  pair: string;
  /** Position size in standard lots (1 = one standard lot). */
  lots: number;
  /** Rate converting the pair's quote currency into the account currency (1 when identical). */
  quoteToAccount: number;
}

export interface PipValueResult {
  /** Pip value for one standard lot, in account currency. */
  perStandardLot: number;
  /** Pip value for one mini lot (0.1), in account currency. */
  perMiniLot: number;
  /** Pip value for one micro lot (0.01), in account currency. */
  perMicroLot: number;
  /** Pip value for the entered position size, in account currency. */
  forLots: number;
}

/**
 * Pip value in the account currency for a given instrument and position size.
 * Same money math as computeLotSize's pipValuePerLot, exposed standalone for
 * the pip value calculator: pip value per lot = pipSize x contractSize x
 * (quote->account rate), then scaled by the number of lots.
 */
export function computePipValue({ pair, lots, quoteToAccount }: PipValueInputs): PipValueResult {
  const cleanPair = normalizePair(pair);
  const perStandardLot = pipSizeFor(cleanPair) * contractSizeFor(cleanPair) * quoteToAccount;

  if (!isFinite(perStandardLot) || perStandardLot <= 0) {
    throw new Error("Calculated pip value is invalid.");
  }

  return {
    perStandardLot,
    perMiniLot: perStandardLot * 0.1,
    perMicroLot: perStandardLot * 0.01,
    forLots: perStandardLot * lots,
  };
}

export interface MarginInputs {
  /** Instrument, e.g. "EURUSD" or "EUR/USD". */
  pair: string;
  /** Position size in standard lots. */
  lots: number;
  /** Leverage ratio (e.g. 30 for 1:30). */
  leverage: number;
  /** Rate converting the pair's BASE currency into the account currency (1 when identical). */
  baseToAccount: number;
}

export interface MarginResult {
  /** Position size in base-currency units (lots x contract size). */
  units: number;
  /** Notional position value, in account currency. */
  notional: number;
  /** Required margin, in account currency. */
  margin: number;
  /** Margin requirement as a percentage of notional (100 / leverage). */
  marginPercent: number;
}

/**
 * Required margin for a leveraged position, in the account currency.
 * Notional = units x (base->account rate); margin = notional / leverage.
 * Base-to-account (not quote-to-account) because the position's notional value
 * is measured in the base currency.
 */
export function computeMargin({ pair, lots, leverage, baseToAccount }: MarginInputs): MarginResult {
  if (!isFinite(leverage) || leverage <= 0) {
    throw new Error("Leverage must be greater than zero.");
  }
  const units = lots * contractSizeFor(normalizePair(pair));
  const notional = units * baseToAccount;
  if (!isFinite(notional) || notional <= 0) {
    throw new Error("Calculated notional value is invalid.");
  }
  return {
    units,
    notional,
    margin: notional / leverage,
    marginPercent: 100 / leverage,
  };
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

// ─── Exact vs broker-ready position sizing ────────────────────────────────────
// The free calculator used to round the exact lot size with toFixed(2) before
// display, which silently rounded 0.0166667 up to 0.02 and presented the target
// risk as if it were the risk of that rounded position. The functions below keep
// the exact mathematical size and the broker-executable size as separate values,
// and never round upward past the target risk.

/** Human unit label for a position's underlying exposure. */
export const unitLabelFor = (p: string): string => {
  const s = normalizePair(p);
  if (s.startsWith("XAU") || s.startsWith("XAG")) return "oz";
  if (s.startsWith("WTI")) return "barrels";
  if (s.startsWith("BTC")) return "BTC";
  if (s.startsWith("ETH")) return "ETH";
  if (/^[A-Z]{6}$/.test(s)) return s.slice(0, 3); // FX: base-currency units
  return "units";
};

export interface BrokerSettings {
  /** Units per 1.00 lot (e.g. 100 oz for standard XAUUSD). */
  contractSize: number;
  /** Smallest tradeable volume (e.g. 0.01). */
  minLot: number;
  /** Volume increment above the minimum (e.g. 0.01). */
  lotStep: number;
}

/** Standard MT4/MT5-style defaults for an instrument. */
export const defaultBrokerSettingsFor = (p: string): BrokerSettings => ({
  contractSize: contractSizeFor(p),
  minLot: 0.01,
  lotStep: 0.01,
});

/** Snap tiny float noise off a lot number (broker steps never need >8 dp). */
export const roundLots = (x: number): number => Math.round(x * 1e8) / 1e8;

/**
 * Largest broker-valid volume that does not exceed exactLots. Valid volumes sit
 * on the grid minLot + k * lotStep (k >= 0). Returns null when exactLots is
 * below the minimum. The epsilon terms absorb float error so an exact 0.50
 * never floors to 0.49; they can only overshoot by a sub-nanolote amount.
 */
export function floorToLotGrid(exactLots: number, minLot: number, lotStep: number): number | null {
  if (!isFinite(exactLots) || !isFinite(minLot) || !isFinite(lotStep) || minLot <= 0 || lotStep <= 0) {
    return null;
  }
  if (exactLots + 1e-9 < minLot) return null;
  const q = (exactLots - minLot) / lotStep;
  const steps = Math.floor(q + 1e-9 + Math.abs(q) * 1e-12);
  return roundLots(minLot + steps * lotStep);
}

export type StopInput =
  | { mode: "pips"; pips: number }
  | { mode: "price"; entryPrice: number; stopLossPrice: number };

export interface PositionSizeInputs {
  /** Account balance in account currency. */
  balance: number;
  /** Risk per trade as a percentage of balance (e.g. 1 for 1%). */
  riskPercent: number;
  /** Instrument, e.g. "EURUSD" or "XAU/USD". */
  pair: string;
  /** Rate converting the pair's quote currency into the account currency (1 when identical). */
  quoteToAccount: number;
  /** Stop distance as pips or as entry + stop-loss prices. */
  stop: StopInput;
  /** Broker overrides; instrument defaults fill anything omitted. */
  broker?: Partial<BrokerSettings>;
}

export interface PositionSizeResult {
  /** balance x riskPercent / 100, in account currency. */
  targetRisk: number;
  /** Stop distance expressed in pips (derived in price mode). */
  stopDistancePips: number;
  /** Stop distance expressed as a quote-currency price move. */
  priceDistance: number;
  pipSize: number;
  contractSize: number;
  minLot: number;
  lotStep: number;
  /** Value of one pip for 1.00 lot, in account currency. */
  pipValuePerLot: number;
  /** Loss at the stop for 1.00 lot, in account currency. */
  riskPerLot: number;
  /** Unrounded mathematical size. May not be executable. */
  exactLots: number;
  exactUnits: number;
  unitLabel: string;
  /** Largest executable volume within target risk; null when below minLot. */
  brokerLots: number | null;
  brokerUnits: number | null;
  actualRisk: number | null;
  actualRiskPercent: number | null;
  belowMinimum: boolean;
  /** Risk the broker's minimum lot would carry (shown in the below-minimum state). */
  minLotRisk: number;
  minLotRiskPercent: number;
  /** One step above brokerLots (or the minimum lot when below minimum). */
  nextLots: number;
  nextRisk: number;
  nextRiskPercent: number;
  nextExceedsTarget: boolean;
  /** True when the exact size already sits on the broker grid. */
  exactIsExecutable: boolean;
}

export function computePositionSize({
  balance,
  riskPercent,
  pair,
  quoteToAccount,
  stop,
  broker,
}: PositionSizeInputs): PositionSizeResult {
  if (!isFinite(balance) || balance <= 0) throw new Error("Account balance must be greater than zero.");
  if (!isFinite(riskPercent) || riskPercent <= 0) throw new Error("Risk percentage must be greater than zero.");
  if (!isFinite(quoteToAccount) || quoteToAccount <= 0) throw new Error("Conversion rate is invalid.");

  const cleanPair = normalizePair(pair);
  const pipSize = pipSizeFor(cleanPair);
  const defaults = defaultBrokerSettingsFor(cleanPair);
  const contractSize = broker?.contractSize ?? defaults.contractSize;
  const minLot = broker?.minLot ?? defaults.minLot;
  const lotStep = broker?.lotStep ?? defaults.lotStep;
  if (!isFinite(contractSize) || contractSize <= 0) throw new Error("Contract size must be greater than zero.");
  if (!isFinite(minLot) || minLot <= 0) throw new Error("Minimum lot must be greater than zero.");
  if (!isFinite(lotStep) || lotStep <= 0) throw new Error("Lot step must be greater than zero.");

  let priceDistance: number;
  let stopDistancePips: number;
  if (stop.mode === "pips") {
    if (!isFinite(stop.pips) || stop.pips <= 0) throw new Error("Stop distance must be greater than zero.");
    stopDistancePips = stop.pips;
    priceDistance = stop.pips * pipSize;
  } else {
    if (!isFinite(stop.entryPrice) || stop.entryPrice <= 0) throw new Error("Entry price must be greater than zero.");
    if (!isFinite(stop.stopLossPrice) || stop.stopLossPrice <= 0) throw new Error("Stop-loss price must be greater than zero.");
    if (stop.entryPrice === stop.stopLossPrice) throw new Error("Entry price and stop-loss price cannot be identical.");
    priceDistance = Math.abs(stop.entryPrice - stop.stopLossPrice);
    stopDistancePips = priceDistance / pipSize;
  }

  const targetRisk = balance * (riskPercent / 100);
  const pipValuePerLot = pipSize * contractSize * quoteToAccount;
  const riskPerLot = priceDistance * contractSize * quoteToAccount;
  if (!isFinite(riskPerLot) || riskPerLot <= 0) throw new Error("Calculated risk per lot is invalid.");

  const exactLots = targetRisk / riskPerLot;
  const exactUnits = exactLots * contractSize;

  const brokerLots = floorToLotGrid(exactLots, minLot, lotStep);
  const belowMinimum = brokerLots === null;
  const actualRisk = brokerLots === null ? null : brokerLots * riskPerLot;

  const nextLots = brokerLots === null ? roundLots(minLot) : roundLots(brokerLots + lotStep);
  const nextRisk = nextLots * riskPerLot;

  const minLotRisk = minLot * riskPerLot;

  return {
    targetRisk,
    stopDistancePips,
    priceDistance,
    pipSize,
    contractSize,
    minLot,
    lotStep,
    pipValuePerLot,
    riskPerLot,
    exactLots,
    exactUnits,
    unitLabel: unitLabelFor(cleanPair),
    brokerLots,
    brokerUnits: brokerLots === null ? null : brokerLots * contractSize,
    actualRisk,
    actualRiskPercent: actualRisk === null ? null : (actualRisk / balance) * 100,
    belowMinimum,
    minLotRisk,
    minLotRiskPercent: (minLotRisk / balance) * 100,
    nextLots,
    nextRisk,
    nextRiskPercent: (nextRisk / balance) * 100,
    nextExceedsTarget: nextRisk > targetRisk * (1 + 1e-9),
    exactIsExecutable: brokerLots !== null && Math.abs(brokerLots - exactLots) <= Math.max(1e-9, exactLots * 1e-9),
  };
}

// ─── Display formatting ───────────────────────────────────────────────────────
// toFixed(2) on a raw lot size is exactly the bug this module replaces: it must
// only ever be applied to already-separated display values, never fed back into
// downstream math.

/**
 * Lot size for display: at least 2 decimals, and enough decimals to keep three
 * significant digits for small sizes (0.0166667 -> "0.0167", 0.5 -> "0.50").
 */
export function formatLots(lots: number): string {
  if (!isFinite(lots)) return "0";
  const abs = Math.abs(lots);
  let decimals = 2;
  if (abs > 0 && abs < 1) {
    const firstSignificant = Math.ceil(-Math.log10(abs));
    decimals = Math.min(Math.max(2, firstSignificant + 2), 6);
  }
  let s = lots.toFixed(decimals);
  while (s.includes(".") && s.endsWith("0") && (s.split(".")[1]?.length ?? 0) > 2) s = s.slice(0, -1);
  return s;
}

/**
 * Underlying exposure for display: grouped thousands, up to four significant
 * digits below 1,000 (1.6666667 -> "1.667", 50 -> "50", 100000 -> "100,000").
 */
export function formatUnits(units: number): string {
  if (!isFinite(units)) return "0";
  const abs = Math.abs(units);
  let decimals = 0;
  if (abs > 0 && abs < 1000) {
    const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 0;
    decimals = Math.min(Math.max(4 - intDigits, 0), 4);
  }
  return units.toLocaleString("en-US", { maximumFractionDigits: decimals });
}
