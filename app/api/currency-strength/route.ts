import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ─── Config ──────────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const DAILY_LOOKBACK = 6;     // trading days (~2 weeks calendar) → proxy for D1
const INTRADAY_LOOKBACK = 3;  // trading days → proxy for H1/M15

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = (typeof CURRENCIES)[number];

export type CurrencyStrength = {
  score: number;            // -100 to +100 (relative to peers)
  bias: "Strong" | "Weak" | "Neutral";
  rawScore: number;         // raw avg % change
};

type StrengthPayload = {
  daily: Record<Currency, CurrencyStrength>;
  intraday: Record<Currency, CurrencyStrength>;
  fetchedAt: string;
};

// ─── Rate helpers ─────────────────────────────────────────────────────────────
//
// FastForex time-series with base=USD returns:
//   { "EUR": 0.923 } → 1 USD = 0.923 EUR
//
// getRate(base, quote) = how many QUOTE per 1 BASE

function getRate(
  base: string,
  quote: string,
  usdRates: Record<string, number>,
): number {
  if (base === quote) return 1;
  if (base === "USD") return usdRates[quote];          // 1 USD = X quote
  if (quote === "USD") return 1 / usdRates[base];     // 1 base = Y USD
  return usdRates[quote] / usdRates[base];             // cross
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function computeStrength(
  timeSeries: Record<string, Record<string, number>>,
  lookbackDays: number,
): Record<Currency, CurrencyStrength> | null {
  // Filter weekdays only and sort
  const dates = Object.keys(timeSeries)
    .filter((d) => {
      const day = new Date(d + "T12:00:00Z").getUTCDay();
      return day !== 0 && day !== 6;
    })
    .sort();

  if (dates.length < lookbackDays + 1) return null;

  const recentRates = timeSeries[dates[dates.length - 1]];
  const pastRates   = timeSeries[dates[Math.max(0, dates.length - 1 - lookbackDays)]];

  // For each currency: avg % change vs all 7 others
  const rawScores: Record<string, number> = {};

  for (const currency of CURRENCIES) {
    let total = 0;
    let count = 0;

    for (const other of CURRENCIES) {
      if (other === currency) continue;

      const now  = getRate(currency, other, recentRates);
      const past = getRate(currency, other, pastRates);

      if (past > 0 && now > 0) {
        total += ((now - past) / past) * 100;
        count++;
      }
    }

    rawScores[currency] = count > 0 ? total / count : 0;
  }

  // Normalize: scale so the strongest/weakest hits ±100
  const maxAbs = Math.max(...Object.values(rawScores).map(Math.abs), 0.001);

  const result = {} as Record<Currency, CurrencyStrength>;

  for (const currency of CURRENCIES) {
    const raw   = rawScores[currency];
    const score = Math.round((raw / maxAbs) * 100 * 10) / 10;
    const bias: CurrencyStrength["bias"] =
      score > 15 ? "Strong" : score < -15 ? "Weak" : "Neutral";

    result[currency] = { score, bias, rawScore: Math.round(raw * 1000) / 1000 };
  }

  return result;
}

// ─── FastForex fetch ──────────────────────────────────────────────────────────

async function fetchFromFastForex(): Promise<
  { payload: StrengthPayload } | { error: string }
> {
  const apiKey = process.env.FASTFOREX_API_KEY;
  if (!apiKey) return { error: "FASTFOREX_API_KEY not set" };

  const end   = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const nonUSD = CURRENCIES.filter((c) => c !== "USD");

  try {
    // FastForex time-series only accepts one target currency per call — run in parallel
    const results = await Promise.all(
      nonUSD.map(async (currency) => {
        const url = `https://api.fastforex.io/time-series?from=USD&to=${currency}&start=${start}&end=${end}&api_key=${apiKey}`;
        const res  = await fetch(url, { cache: "no-store" });
        const text = await res.text();

        if (!res.ok) {
          throw new Error(`FastForex HTTP ${res.status} for USD/${currency}: ${text}`);
        }

        let json: Record<string, unknown>;
        try { json = JSON.parse(text); }
        catch { throw new Error(`FastForex non-JSON for ${currency}: ${text.slice(0, 100)}`); }

        // Response: { results: { "EUR": { "2026-05-10": 0.8498, ... } } }
        const currencyBlock = (json.results as Record<string, Record<string, number>>)?.[currency] ?? {};
        return { currency, raw: currencyBlock };
      }),
    );

    // Merge into { "2024-01-01": { EUR: 0.923, GBP: 0.789, ... }, ... }
    const timeSeries: Record<string, Record<string, number>> = {};

    for (const { currency, raw } of results) {
      for (const [date, value] of Object.entries(raw)) {
        if (!timeSeries[date]) timeSeries[date] = {};
        // raw is now { "2026-05-10": 0.8498, ... } — plain date → rate
        timeSeries[date][currency] = typeof value === "number" ? value : 0;
      }
    }

    if (Object.keys(timeSeries).length === 0) {
      return { error: `All FastForex calls returned empty results. First raw: ${JSON.stringify(results[0]?.raw).slice(0, 200)}` };
    }

    const daily    = computeStrength(timeSeries, DAILY_LOOKBACK);
    const intraday = computeStrength(timeSeries, INTRADAY_LOOKBACK);

    if (!daily || !intraday) {
      return { error: `Not enough trading days. Got ${Object.keys(timeSeries).length}, need ${DAILY_LOOKBACK + 1}` };
    }

    return { payload: { daily, intraday, fetchedAt: new Date().toISOString() } };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── Cache (Supabase scanner_results) ────────────────────────────────────────

async function readCache(): Promise<{ data: StrengthPayload; updated_at: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("scanner_results")
      .select("data, updated_at")
      .eq("key", "currency_strength")
      .single();

    if (error || !data) return null;
    return data as { data: StrengthPayload; updated_at: string };
  } catch {
    return null;
  }
}

function writeCache(payload: StrengthPayload): void {
  supabaseAdmin
    .from("scanner_results")
    .upsert({ key: "currency_strength", data: payload, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error("[currency-strength] Cache write failed:", error.message);
    });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type") === "intraday" ? "intraday" : "daily";


  const cache    = await readCache();
  const cacheAge = cache ? Date.now() - new Date(cache.updated_at).getTime() : Infinity;

  let payload = cache?.data ?? null;

  if (!payload || cacheAge > CACHE_TTL_MS) {
    const result = await fetchFromFastForex();
    if ("payload" in result) {
      payload = result.payload;
      writeCache(result.payload);
    } else if (payload) {
      console.warn("[currency-strength] Serving stale cache:", result.error);
    } else {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
  }

  return NextResponse.json({
    currencies: type === "intraday" ? payload.intraday : payload.daily,
    type,
    fetchedAt: payload.fetchedAt,
    cacheAgeSeconds: Math.round((Date.now() - new Date(payload.fetchedAt).getTime()) / 1000),
  });
}
