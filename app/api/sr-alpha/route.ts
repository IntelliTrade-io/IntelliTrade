import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSubscription } from "@/lib/auth/requireSubscription";
import type { CandleData, SupportResistanceZone } from "@/components/support-resistance/types";

export const dynamic = "force-dynamic";

const SYMBOL = "EURUSD";
const ASSET_ID = "fx.eurusd.spot";
const CANDLE_LIMIT = 300; // M15 bars for the chart

// Grade label + a short educational summary, derived from the scored row.
const GRADE_LABEL: Record<string, string> = {
  a_plus: "A+",
  elite_green: "Elite Green",
  green: "Green",
  watch: "Watch",
  blue: "Informational",
  blocked: "Blocked",
};

const STRENGTH_LABEL: Record<string, string> = {
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
};

/** Parse the first R multiple out of the research text (e.g. "0.50R to 1.00R" -> 0.5). */
function parseFirstR(text: string | null): number {
  if (!text) return 0;
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m?.[1] ? parseFloat(m[1]) : 0;
}

/** Parse a second R multiple if the text is a range (e.g. "0.50R to 1.00R" -> 1.0). */
function parseSecondR(text: string | null): number | undefined {
  if (!text) return undefined;
  const nums = text.match(/(\d+(?:\.\d+)?)/g);
  return nums?.[1] !== undefined ? parseFloat(nums[1]) : undefined;
}

type ZoneJoin = {
  zone_low: number | null;
  zone_high: number | null;
  zone_mid: number | null;
  atr_at_creation: number | null;
  zone_created_time: string | null;
  is_active: boolean | null;
  touch_count: number | null;
};

type OppRow = {
  id: string;
  zone_id: string | null;
  symbol: string;
  timeframe: string;
  zone_side: string;
  static_strength: string;
  dynamic_grade: string;
  status: string;
  score: number | null;
  research_reaction_low: number | null;
  research_reaction_high: number | null;
  typical_minimum_r: string | null;
  target_r_context: number | null;
  stop_buffer_atr: number | null;
  session_quality: string | null;
  approach_quality: string | null;
  current_session: string | null;
  close_reclaim: boolean | null;
  reclaim_confirmed_at: string | null;
  model_version: string;
  calculated_at: string;
  notes: string | null;
  sr_zones: ZoneJoin | null;
};

function mapZone(row: OppRow): SupportResistanceZone {
  const zone = row.sr_zones;
  const gradeLabel = GRADE_LABEL[row.dynamic_grade] ?? row.dynamic_grade;
  const strengthLabel = STRENGTH_LABEL[row.static_strength] ?? row.static_strength;

  // The detector can emit very wide bands (band = full pivot spread), which draw
  // as chart-covering rectangles. A real support shelf is tight — clamp the band
  // to a sane half-width around its midpoint. Prefer ATR-at-creation; fall back to
  // ~12 pips. [TODO: fix at source in backend/zone_detector so DB zones are tight.]
  const rawLow = zone?.zone_low ?? 0;
  const rawHigh = zone?.zone_high ?? 0;
  const mid = zone?.zone_mid ?? (rawLow + rawHigh) / 2;
  const maxHalf = zone?.atr_at_creation ? zone.atr_at_creation * 0.6 : 0.0012;
  const tooWide = rawHigh - rawLow > maxHalf * 2;
  const zoneLow = tooWide ? mid - maxHalf : rawLow;
  const zoneHigh = tooWide ? mid + maxHalf : rawHigh;

  return {
    id: row.zone_id ?? row.id,
    assetId: ASSET_ID,
    providerAlias: "mt5",
    pair: row.symbol,
    timeframe: row.timeframe,
    zoneSide: (row.zone_side as SupportResistanceZone["zoneSide"]) ?? "support",
    zoneLow,
    zoneHigh,
    zoneLabel: `${row.symbol} ${strengthLabel.toLowerCase()} support`,
    staticStrength: row.static_strength as SupportResistanceZone["staticStrength"],
    dynamicGrade: row.dynamic_grade as SupportResistanceZone["dynamicGrade"],
    reactionRange: {
      min: row.research_reaction_low ?? 0,
      max: row.research_reaction_high ?? 0,
    },
    typicalMinimumR: parseFirstR(row.typical_minimum_r),
    typicalMaximumR: parseSecondR(row.typical_minimum_r),
    sessionQuality: row.session_quality ?? "—",
    approachQuality: row.approach_quality ?? "—",
    status: row.status,
    stopBufferAtr: row.stop_buffer_atr ?? 0.3,
    firstReactionTargetR: row.target_r_context ?? 0.5,
    lastUpdated: row.calculated_at,
    modelVersion: row.model_version,
    createdTime: zone?.zone_created_time ?? null,
    closeReclaim: Boolean(row.close_reclaim),
    reclaimConfirmedAt: row.reclaim_confirmed_at ?? null,
    notes: row.notes ?? undefined,
    educationalSummary: `${strengthLabel} static shelf graded ${gradeLabel} on the ${
      row.current_session ?? "current"
    } session.`,
  };
}

export async function GET() {
  const denied = await requireSubscription();
  if (denied) return denied;
  try {
    // Active zones only — the worker's prune guarantees active == the latest run.
    const { data: oppData, error: oppErr } = await supabaseAdmin
      .from("sr_opportunities")
      .select(
        "id, zone_id, symbol, timeframe, zone_side, static_strength, dynamic_grade, status, score, " +
          "research_reaction_low, research_reaction_high, typical_minimum_r, target_r_context, " +
          "stop_buffer_atr, session_quality, approach_quality, current_session, close_reclaim, " +
          "reclaim_confirmed_at, model_version, calculated_at, notes, " +
          "sr_zones!inner(zone_low, zone_high, zone_mid, atr_at_creation, zone_created_time, is_active, touch_count)",
      )
      .eq("symbol", SYMBOL)
      .eq("sr_zones.is_active", true)
      .order("calculated_at", { ascending: false });

    if (oppErr) {
      return NextResponse.json({ error: oppErr.message, zones: [], candles: [] }, { status: 500 });
    }

    const zones = ((oppData ?? []) as unknown as OppRow[]).map(mapZone);

    // Latest M15 candles for the chart (ascending time, unique).
    const { data: candleData, error: candleErr } = await supabaseAdmin
      .from("market_candles")
      .select("time, open, high, low, close")
      .eq("symbol", SYMBOL)
      .eq("timeframe", "M15")
      .order("time", { ascending: false })
      .limit(CANDLE_LIMIT);

    if (candleErr) {
      // zones are still useful without the chart
      return NextResponse.json({ zones, candles: [], candleError: candleErr.message });
    }

    // lightweight-charts is strict: times must be valid whole seconds, strictly
    // ascending, and unique — one bad/duplicate/unordered row makes setData throw
    // and the whole chart fails to render. So validate + sort + dedupe defensively.
    const seen = new Set<number>();
    const candles: CandleData[] = ((candleData ?? []) as Array<Record<string, number | string>>)
      .map((c) => {
        // Supabase timestamptz may arrive as "2026-07-01T20:00:00+00:00" or
        // "2026-07-01 20:00:00+00" — normalize the space form to ISO.
        const raw = String(c.time).replace(" ", "T");
        const ms = Date.parse(raw);
        return {
          time: Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        };
      })
      .filter(
        (c) =>
          Number.isFinite(c.time) &&
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close),
      )
      .sort((a, b) => a.time - b.time) // ascending (DB returned newest-first)
      .filter((c) => {
        if (seen.has(c.time)) return false; // drop duplicate timestamps
        seen.add(c.time);
        return true;
      });

    const calculatedAt = zones[0]?.lastUpdated ?? null;

    return NextResponse.json({ zones, candles, calculatedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message, zones: [], candles: [] }, { status: 500 });
  }
}
