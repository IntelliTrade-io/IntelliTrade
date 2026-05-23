import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ─── Config ──────────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const DAILY_LOOKBACK = 20;    // trading days → proxy for D1
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

async function fetchFromFastForex(): Promise<StrengthPayload | null> {
  const apiKey = process.env.FASTFOREX_API_KEY;
  if (!apiKey) {
    console.error("[currency-strength] FASTFOREX_API_KEY not set");
    return null;
  }

  const to   = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0]; // 42 days back → ~30 trading days

  const symbols = CURRENCIES.filter((c) => c !== "USD").join(",");
  const url = `https://api.fastforex.io/time-series?from=${from}&to=${to}&base=USD&symbols=${symbols}&api_key=${apiKey}`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      console.error(`[currency-strength] FastForex ${res.status}: ${await res.text()}`);
      return null;
    }

    const json = await res.json();
    // FastForex returns { base, results: { "2024-01-01": { EUR: 0.923, ... } }, ms }
    const timeSeries: Record<string, Record<string, number>> =
      json.results ?? json.data ?? json.series ?? {};

    if (Object.keys(timeSeries).length === 0) {
      console.error("[currency-strength] Empty time-series from FastForex");
      return null;
    }

    const daily    = computeStrength(timeSeries, DAILY_LOOKBACK);
    const intraday = computeStrength(timeSeries, INTRADAY_LOOKBACK);

    if (!daily || !intraday) return null;

    return { daily, intraday, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[currency-strength] Fetch error:", err);
    return null;
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
  const type = new URL(request.url).searchParams.get("type") === "intraday"
    ? "intraday"
    : "daily";

  const cache    = await readCache();
  const cacheAge = cache ? Date.now() - new Date(cache.updated_at).getTime() : Infinity;

  let payload = cache?.data ?? null;

  if (!payload || cacheAge > CACHE_TTL_MS) {
    const fresh = await fetchFromFastForex();
    if (fresh) {
      payload = fresh;
      writeCache(fresh);
    } else if (payload) {
      console.warn("[currency-strength] Serving stale cache (FastForex fetch failed)");
    } else {
      return NextResponse.json({ error: "No data available" }, { status: 503 });
    }
  }

  return NextResponse.json({
    currencies: type === "intraday" ? payload.intraday : payload.daily,
    type,
    fetchedAt: payload.fetchedAt,
    cacheAgeSeconds: Math.round((Date.now() - new Date(payload.fetchedAt).getTime()) / 1000),
  });
}
