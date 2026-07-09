import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSubscription } from "@/lib/auth/requireSubscription";

export const dynamic = "force-dynamic";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
type Currency = (typeof CURRENCIES)[number];

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min — scanner runs every 15 min

export type CurrencyStrength = {
  score: number;
  bias: "Strong" | "Weak" | "Neutral";
  rawScore: number;
};

type StrengthPayload = {
  daily: Record<Currency, CurrencyStrength>;
  intraday: Record<Currency, CurrencyStrength>;
  fetchedAt: string;          // daily run timestamp (legacy field, kept for cache compat)
  fetchedAtIntraday?: string; // intraday run timestamp
};

// ─── Transform scanner output → CurrencyStrength ─────────────────────────────

function transformSnapshot(
  currencies: Record<string, { score?: number; bias?: string }>,
): Record<Currency, CurrencyStrength> {
  const result = {} as Record<Currency, CurrencyStrength>;
  for (const currency of CURRENCIES) {
    const c = currencies?.[currency];
    result[currency] = {
      score: c?.score ?? 0,
      bias: (c?.bias as CurrencyStrength["bias"]) ?? "Neutral",
      rawScore: 0,
    };
  }
  return result;
}

// ─── Read latest scanner snapshots ───────────────────────────────────────────

async function fetchFromScanner(): Promise<
  { payload: StrengthPayload } | { error: string }
> {
  const [dailyRes, intradayRes] = await Promise.all([
    supabaseAdmin
      .from("currency_strength_snapshots")
      .select("currencies_weighted, run_info")
      .eq("type", "daily")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabaseAdmin
      .from("currency_strength_snapshots")
      .select("currencies_weighted, run_info")
      .eq("type", "intraday")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const dailyRow    = dailyRes.data;
  const intradayRow = intradayRes.data;

  if (!dailyRow) {
    return { error: "No daily scanner snapshot available — VPS scanner may not have run yet." };
  }

  // Fall back to daily data when intraday not yet available
  const intraday = intradayRow
    ? transformSnapshot(intradayRow.currencies_weighted)
    : transformSnapshot(dailyRow.currencies_weighted);

  return {
    payload: {
      daily:    transformSnapshot(dailyRow.currencies_weighted),
      intraday,
      fetchedAt: dailyRow.run_info?.ts_utc ?? new Date().toISOString(),
      fetchedAtIntraday: intradayRow?.run_info?.ts_utc ?? dailyRow.run_info?.ts_utc ?? new Date().toISOString(),
    },
  };
}

// ─── scanner_results short-TTL cache ─────────────────────────────────────────

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
  const denied = await requireSubscription();
  if (denied) return denied;

  const type = new URL(request.url).searchParams.get("type") === "intraday" ? "intraday" : "daily";

  const cache    = await readCache();
  const cacheAge = cache ? Date.now() - new Date(cache.updated_at).getTime() : Infinity;

  let payload = cache?.data ?? null;

  if (!payload || cacheAge > CACHE_TTL_MS) {
    const result = await fetchFromScanner();
    if ("payload" in result) {
      payload = result.payload;
      writeCache(result.payload);
    } else if (payload) {
      console.warn("[currency-strength] Serving stale cache:", result.error);
    } else {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
  }

  // Intraday responses carry the intraday run's own timestamp; older cache rows
  // predating fetchedAtIntraday fall back to the daily timestamp.
  const fetchedAt = type === "intraday" ? (payload.fetchedAtIntraday ?? payload.fetchedAt) : payload.fetchedAt;

  return NextResponse.json({
    currencies: type === "intraday" ? payload.intraday : payload.daily,
    type,
    fetchedAt,
    cacheAgeSeconds: Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000),
  });
}
