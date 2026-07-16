// Snapshot access for Entry Assist — server only. Reads intraday currency
// strength snapshots via the service-role client and normalizes them into a
// clean, ordered window for the pure evaluator. Deliberately does NOT reuse the
// daily-fallback behavior of /api/currency-strength: no intraday rows means an
// honest "unavailable", never fabricated or mock candidates.

import { supabaseAdmin } from "@/lib/supabase/admin";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;

export type PairLabel = "bullish" | "bearish" | "neutral";

export interface NormalizedSnapshot {
  asof: Date;
  scores: Record<string, number>; // currency -> weighted score (-100..100)
  pairLabels: Record<string, PairLabel>; // symbol (e.g. "GBPUSD") -> scanner pair label
  createdAt: string; // raw created_at, used only to break asof dedupe ties
}

interface RawRow {
  pairs?: Record<string, { pair?: string } | null> | null;
  currencies_weighted?: Record<string, { score?: number } | null> | null;
  run_info?: { ts_utc?: string } | null;
  created_at?: string | null;
}

const WINDOW_MS = 14 * 60 * 60 * 1000; // 14h lookback
const ROW_CAP = 64;

/** Fetch and normalize the intraday snapshot window (oldest -> newest). */
export async function fetchIntradaySnapshots(now: Date = new Date()): Promise<NormalizedSnapshot[]> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("currency_strength_snapshots")
    .select("pairs, currencies_weighted, run_info, created_at")
    .eq("type", "intraday")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(ROW_CAP);

  if (error) throw new Error(error.message);
  if (!data) return [];

  return normalizeSnapshots(data as RawRow[]);
}

function parseAsof(row: RawRow): Date | null {
  const raw = row.run_info?.ts_utc ?? row.created_at ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseScores(row: RawRow): Record<string, number> {
  const out: Record<string, number> = {};
  const cw = row.currencies_weighted ?? {};
  for (const c of CURRENCIES) {
    const score = cw?.[c]?.score;
    if (typeof score === "number" && Number.isFinite(score)) out[c] = score;
  }
  return out;
}

function parsePairLabels(row: RawRow): Record<string, PairLabel> {
  const out: Record<string, PairLabel> = {};
  const pairs = row.pairs ?? {};
  for (const [symbol, entry] of Object.entries(pairs)) {
    const label = entry?.pair;
    if (label === "bullish" || label === "bearish" || label === "neutral") {
      out[symbol] = label;
    }
  }
  return out;
}

/**
 * Pure normalization (exported for tests): drop rows with an unparseable asof,
 * dedupe on asof keeping the latest created_at, and sort ascending by asof.
 */
export function normalizeSnapshots(rows: RawRow[]): NormalizedSnapshot[] {
  const byAsof = new Map<number, NormalizedSnapshot>();

  for (const row of rows) {
    const asof = parseAsof(row);
    if (!asof) continue; // invalid timestamp -> drop
    const snap: NormalizedSnapshot = {
      asof,
      scores: parseScores(row),
      pairLabels: parsePairLabels(row),
      createdAt: row.created_at ?? asof.toISOString(),
    };
    const key = asof.getTime();
    const existing = byAsof.get(key);
    if (!existing || snap.createdAt > existing.createdAt) byAsof.set(key, snap);
  }

  return [...byAsof.values()].sort((a, b) => a.asof.getTime() - b.asof.getTime());
}
