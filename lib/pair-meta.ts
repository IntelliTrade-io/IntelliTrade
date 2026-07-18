// Per-pair calculator SEO page metadata (IMPROVEMENTS: "Per-pair calculator SEO
// pages"). Pure descriptors + illustrative example math for the static
// `/lotsizecalculator/[pair]` routes. No live data, no React — kept here so the
// route file stays a thin server component and the money-ish math is unit-tested.

import {
  PREFERRED_BASES,
  composePairsFrom,
  contractSizeFor,
  normalizePair,
  parsePair,
  pipSizeFor,
  unitLabelFor,
} from "./lot-size";

// Full universe of per-pair pages we statically generate. Derived from the same
// composePairsFrom the live calculator uses, but over the COMPLETE preferred-base
// set so the build is deterministic and never depends on the runtime
// CurrencyFreaks list. Majors (both directions), popular crosses, gold, silver,
// BTC and ETH — 33 symbols.
export const PER_PAIR_SYMBOLS: string[] = composePairsFrom(new Set(PREFERRED_BASES));

/** URL slug for a symbol: lowercase, no slash. "EUR/USD" -> "eurusd". */
export const pairToSlug = (pair: string): string => normalizePair(pair).toLowerCase();

/** Canonical symbol for a slug: uppercase, slash-stripped. "eurusd" -> "EURUSD". */
export const slugToPair = (slug: string): string => normalizePair(slug);

/** True when a slug maps to a symbol we generate a page for. */
export const isSupportedPairSlug = (slug: string): boolean =>
  PER_PAIR_SYMBOLS.includes(slugToPair(slug));

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  NZD: "New Zealand Dollar",
  XAU: "Gold",
  XAG: "Silver",
  BTC: "Bitcoin",
  ETH: "Ethereum",
};

/** Human name for a 3-letter code ("EUR" -> "Euro"), falling back to the code. */
export const currencyName = (code: string): string =>
  CURRENCY_NAMES[normalizePair(code).slice(0, 3)] ?? normalizePair(code).slice(0, 3);

export type AssetClass = "metal" | "crypto" | "fx-major" | "fx-cross";

export function assetClassFor(pair: string): AssetClass {
  const { base, quote } = parsePair(pair);
  if (base === "XAU" || base === "XAG") return "metal";
  if (base === "BTC" || base === "ETH") return "crypto";
  if (base === "USD" || quote === "USD") return "fx-major";
  return "fx-cross";
}

/**
 * Pip value of one 1.00 lot expressed in the pair's QUOTE currency. This is
 * exact and needs no live rate: contractSize x pipSize. For a USD-quoted
 * instrument the number is already in dollars (EURUSD -> 10 USD, XAUUSD -> 1
 * USD, XAGUSD -> 50 USD). For a non-USD quote it is in that quote currency
 * (USDJPY -> 1000 JPY), which the calculator converts to the account currency
 * live.
 */
export const pipValuePerLotQuote = (pair: string): number =>
  contractSizeFor(pair) * pipSizeFor(pair);

export interface PairMeta {
  /** "EURUSD" */
  pair: string;
  /** "eurusd" */
  slug: string;
  /** "EUR/USD" */
  display: string;
  base: string;
  quote: string;
  /** "Euro" */
  baseName: string;
  /** "US Dollar" */
  quoteName: string;
  /** "Euro / US Dollar" */
  longName: string;
  assetClass: AssetClass;
  /** e.g. 0.0001 */
  pipSize: number;
  /** e.g. 100000 */
  contractSize: number;
  /** what one 1.00 lot represents: "EUR", "oz", "BTC" */
  unitLabel: string;
  /** pip value of 1.00 lot in the quote currency (exact) */
  pipValueQuote: number;
  isJpy: boolean;
}

export function describePair(pairInput: string): PairMeta {
  const pair = normalizePair(pairInput);
  const { base, quote } = parsePair(pair);
  return {
    pair,
    slug: pairToSlug(pair),
    display: `${base}/${quote}`,
    base,
    quote,
    baseName: currencyName(base),
    quoteName: currencyName(quote),
    longName: `${currencyName(base)} / ${currencyName(quote)}`,
    assetClass: assetClassFor(pair),
    pipSize: pipSizeFor(pair),
    contractSize: contractSizeFor(pair),
    unitLabel: unitLabelFor(pair),
    pipValueQuote: pipValuePerLotQuote(pair),
    isJpy: pair.endsWith("JPY"),
  };
}

export interface PipValueLots {
  /** pip value of a 1.00 (standard) lot, in the quote currency */
  standard: number;
  /** pip value of a 0.10 (mini) lot */
  mini: number;
  /** pip value of a 0.01 (micro) lot */
  micro: number;
  quote: string;
}

/**
 * Pip value per standard / mini / micro lot, in the pair's quote currency
 * (exact, no live rate). Standard is contractSize x pipSize; mini and micro
 * scale linearly. For a USD-quoted pair these are already dollars; otherwise the
 * pip value calculator converts them to the account currency live.
 */
export function pipValueLots(pairInput: string): PipValueLots {
  const meta = describePair(pairInput);
  const standard = meta.pipValueQuote;
  return {
    standard,
    mini: standard / 10,
    micro: standard / 100,
    quote: meta.quote,
  };
}

export interface PairExample {
  balance: number;
  riskPercent: number;
  /** balance x riskPercent% */
  riskAmount: number;
  stopPips: number;
  /** pip value of 1.00 lot, in the quote currency */
  pipValueQuote: number;
  quote: string;
  /** stopPips x pipValueQuote — risk of one full lot, in quote currency */
  riskPerLot: number;
  /** riskAmount / riskPerLot, valid when account currency == quote currency */
  lots: number;
}

/**
 * Illustrative worked example for a pair, computed entirely in the quote
 * currency so it is exact without any live rate. The lot result is valid when
 * the account currency equals the quote currency; when it differs the
 * calculator applies live conversion (the page copy says so). Metals and crypto
 * use a wider stop that suits their pip conventions.
 */
export function pairExample(pairInput: string): PairExample {
  const meta = describePair(pairInput);
  const balance = 5000;
  const riskPercent = 1;
  const riskAmount = (balance * riskPercent) / 100; // 50

  // Stop distance chosen to read naturally per asset class.
  const stopPips =
    meta.assetClass === "metal" ? 200 : meta.assetClass === "crypto" ? 300 : 30;

  const pipValueQuote = meta.pipValueQuote;
  const riskPerLot = stopPips * pipValueQuote;
  const lots = riskPerLot > 0 ? riskAmount / riskPerLot : 0;

  return {
    balance,
    riskPercent,
    riskAmount,
    stopPips,
    pipValueQuote,
    quote: meta.quote,
    riskPerLot,
    lots,
  };
}
