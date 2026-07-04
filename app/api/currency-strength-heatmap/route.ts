import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSubscription } from "@/lib/auth/requireSubscription";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
type Currency = (typeof CURRENCIES)[number];

type CurrencyStrength = {
  score: number;
  bias: "Strong" | "Weak" | "Neutral";
  rawScore: number;
};

type StrengthPayload = {
  daily: Record<Currency, CurrencyStrength>;
  intraday: Record<Currency, CurrencyStrength>;
  fetchedAt: string;
};

// ─── Heatmap format ───────────────────────────────────────────────────────────
//
// The iframe HTML apps expect currencies in this shape:
//   { currencies_raw: { USD: { bias, score, strong_w, weak_w, considered_w, avg_conf }, ... },
//     currencies_weighted: { ... } }
//
// We derive strong_w / weak_w from the normalized score.

type HeatmapCurrency = {
  bias: string;
  score: number;
  strong_w: number;
  weak_w: number;
  considered_w: number;
  avg_conf: number;
};

type HeatmapCurrencies = {
  currencies_raw: Record<Currency, HeatmapCurrency>;
  currencies_weighted: Record<Currency, HeatmapCurrency>;
};

function toHeatmapCurrency(cs: CurrencyStrength): HeatmapCurrency {
  const PEERS = 7; // each currency compared against 7 others
  const strong_w = cs.score > 0 ? (cs.score / 100) * PEERS : 0;
  const weak_w   = cs.score < 0 ? (Math.abs(cs.score) / 100) * PEERS : 0;

  return {
    bias:         cs.bias,
    score:        cs.score,
    strong_w:     Math.round(strong_w * 100) / 100,
    weak_w:       Math.round(weak_w   * 100) / 100,
    considered_w: PEERS,
    avg_conf:     0,
  };
}

function buildHeatmap(data: Record<Currency, CurrencyStrength>): HeatmapCurrencies {
  const entries = CURRENCIES.map((c) => [c, toHeatmapCurrency(data[c])] as const);
  const currencies_raw      = Object.fromEntries(entries) as Record<Currency, HeatmapCurrency>;
  const currencies_weighted = Object.fromEntries(entries) as Record<Currency, HeatmapCurrency>;
  return { currencies_raw, currencies_weighted };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

async function readCache(): Promise<StrengthPayload | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("scanner_results")
      .select("data")
      .eq("key", "currency_strength")
      .single();

    if (error || !data) return null;
    return (data as { data: StrengthPayload }).data;
  } catch {
    return null;
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const url    = new URL(request.url);
  const type   = url.searchParams.get("type") === "intraday" ? "intraday" : "daily";

  const payload = await readCache();

  if (!payload) {
    // No cached data yet — return a minimal stub so the iframe falls back to mock
    return NextResponse.json(null, { status: 404 });
  }

  const currencies = type === "intraday" ? payload.intraday : payload.daily;
  const heatmap    = buildHeatmap(currencies);

  return NextResponse.json(heatmap, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}
