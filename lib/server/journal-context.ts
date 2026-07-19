// Journal market-context stamp (phase J2) — the journal's differentiator.
//
// Every trade auto-captures what IntelliTrade's own meters read at entry time:
// the daily and intraday currency-strength snapshots (per-currency rank + the
// scanner's combined pair read) and, for EURUSD, the newest S&R opportunity
// grade. The stamp is written once into journal_trades.context (an opaque JSONB
// passthrough) and never recomputed.
//
// extractTradeContext is pure and unit-tested; buildTradeContext wraps it with
// the service-role fetch (the snapshot tables are service-role-only). NOTHING
// here ever throws — a missing/malformed input degrades to a smaller stamp, and
// the worst case is { v: 1, capturedAt }.

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CURRENCIES,
  STANDARD_PAIRS,
  scanState,
  scanConfidence,
  type PairsDetail,
} from "@/lib/strength";
import type { SnapshotCurrencies } from "@/lib/strength-teaser";

/** Bump when the stamp shape changes; readers branch on it. */
export const CONTEXT_VERSION = 1 as const;

/** A currency-strength snapshot row (daily or intraday), as selected. */
export interface ContextSnapshotRow {
  created_at?: string | null;
  currencies_weighted?: SnapshotCurrencies | null;
  pairs?: PairsDetail | null;
}

/** The newest sr_opportunities row for the symbol (EURUSD only), as selected. */
export interface ContextSrRow {
  dynamic_grade?: string | null;
  status?: string | null;
}

interface CurrencyRank {
  score: number;
  rank: number;
}

/**
 * Rank the eight majors that carry a finite score, strongest first (rank 1 =
 * highest score). Currencies without a usable score are dropped, so a partial
 * snapshot still ranks whatever it has.
 */
function rankCurrencies(currencies: SnapshotCurrencies | null | undefined): Map<string, CurrencyRank> {
  const scored: Array<{ code: string; score: number }> = [];
  for (const code of CURRENCIES) {
    const raw = currencies?.[code]?.score;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      scored.push({ code, score: raw });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const ranks = new Map<string, CurrencyRank>();
  scored.forEach((c, i) => ranks.set(c.code, { score: c.score, rank: i + 1 }));
  return ranks;
}

/**
 * The scanner's combined read for `symbol` from a snapshot's pairs JSONB, or
 * null when the symbol is not a standard pair or the entry is missing/malformed.
 * Requires a parseable combined state; confidence is included when parseable.
 */
function extractPair(
  symbol: string,
  pairs: PairsDetail | null | undefined,
): { state: string; confidence?: number } | null {
  if (!STANDARD_PAIRS.has(symbol)) return null;
  const detail = pairs?.[symbol];
  if (!detail) return null;
  const state = scanState(detail.pair);
  if (state === null) return null;
  const confidence = scanConfidence(detail.confidence);
  const out: { state: string; confidence?: number } = { state };
  if (confidence !== null) out.confidence = confidence;
  return out;
}

interface DailyStamp {
  snapshotAt?: string;
  base?: { code: string; score: number; rank: number };
  quote?: { code: string; score: number; rank: number };
  pair?: { state: string; confidence?: number };
}

interface IntradayStamp {
  snapshotAt?: string;
  pair?: { state: string; confidence?: number };
}

/** Base/quote sub-stamps for a daily row, only when BOTH currencies rank. */
function currencyStamp(
  symbol: string,
  currencies: SnapshotCurrencies | null | undefined,
): Pick<DailyStamp, "base" | "quote"> {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(-3);
  const ranks = rankCurrencies(currencies);
  const baseRank = ranks.get(base);
  const quoteRank = ranks.get(quote);
  if (!baseRank || !quoteRank) return {};
  return {
    base: { code: base, score: baseRank.score, rank: baseRank.rank },
    quote: { code: quote, score: quoteRank.score, rank: quoteRank.rank },
  };
}

/**
 * Shape the market-context stamp from already-fetched rows. Pure; never throws.
 * Any part that is missing or malformed is omitted; the worst case is the
 * two-field object { v, capturedAt }.
 */
export function extractTradeContext(
  symbol: string,
  dailyRow: ContextSnapshotRow | null | undefined,
  intradayRow: ContextSnapshotRow | null | undefined,
  srRow: ContextSrRow | null | undefined,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    v: CONTEXT_VERSION,
    capturedAt: new Date().toISOString(),
  };

  try {
    if (dailyRow) {
      const daily: DailyStamp = {};
      if (typeof dailyRow.created_at === "string") daily.snapshotAt = dailyRow.created_at;
      Object.assign(daily, currencyStamp(symbol, dailyRow.currencies_weighted));
      const pair = extractPair(symbol, dailyRow.pairs);
      if (pair) daily.pair = pair;
      if (Object.keys(daily).length > 0) context.daily = daily;
    }

    if (intradayRow) {
      const intraday: IntradayStamp = {};
      if (typeof intradayRow.created_at === "string") intraday.snapshotAt = intradayRow.created_at;
      const pair = extractPair(symbol, intradayRow.pairs);
      if (pair) intraday.pair = pair;
      if (Object.keys(intraday).length > 0) context.intraday = intraday;
    }

    // Zone grade is EURUSD-only (the S&R model's current scope).
    if (symbol === "EURUSD" && srRow) {
      const grade = typeof srRow.dynamic_grade === "string" ? srRow.dynamic_grade : null;
      const status = typeof srRow.status === "string" ? srRow.status : null;
      if (grade !== null && status !== null) context.zone = { grade, status };
    }
  } catch {
    // Defensive: never let a malformed row break trade creation. The stamp is a
    // best-effort snapshot, not a source of truth.
  }

  return context;
}

async function fetchLatestSnapshot(type: "daily" | "intraday"): Promise<ContextSnapshotRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("currency_strength_snapshots")
      .select("created_at, currencies_weighted, pairs")
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return null;
    return (data?.[0] as ContextSnapshotRow | undefined) ?? null;
  } catch {
    return null;
  }
}

async function fetchLatestZone(symbol: string): Promise<ContextSrRow | null> {
  if (symbol !== "EURUSD") return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("sr_opportunities")
      .select("dynamic_grade, status")
      .eq("symbol", symbol)
      .order("calculated_at", { ascending: false })
      .limit(1);
    if (error) return null; // defensive about column availability
    return (data?.[0] as ContextSrRow | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest daily + intraday strength snapshots (and, for EURUSD, the
 * newest S&R opportunity) and shape them into the trade-context stamp. Each
 * fetch degrades independently to null on any failure, so a partial outage
 * simply produces a smaller stamp rather than blocking trade creation.
 */
export async function buildTradeContext(symbol: string): Promise<Record<string, unknown>> {
  const [dailyRow, intradayRow, srRow] = await Promise.all([
    fetchLatestSnapshot("daily"),
    fetchLatestSnapshot("intraday"),
    fetchLatestZone(symbol),
  ]);
  return extractTradeContext(symbol, dailyRow, intradayRow, srRow);
}
