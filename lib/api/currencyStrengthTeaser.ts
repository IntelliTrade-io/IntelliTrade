// Server-side fetcher for the free currency-strength teaser page. Free tier
// shows yesterday's final daily reading only (delayed by design, owner call:
// no live data outside Pro); the live meter, intraday readings and history
// stay subscription-gated behind /api/currency-strength*. Server components
// import this directly (plan 5.2: no HTTP round-trip to our own API routes).
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildTeaserReadings,
  type SnapshotCurrencies,
  type TeaserReading,
} from "@/lib/strength-teaser";

export interface StrengthTeaserData {
  /** Ranked readings, strongest first. */
  readings: TeaserReading[];
  /** Creation time of the snapshot shown (yesterday's last daily run), ISO. */
  snapshotAtUtc: string;
  /** Creation time of the delta baseline (the prior day's last reading), ISO;
   *  null when no usable baseline exists and deltas are omitted. */
  previousAtUtc: string | null;
}

/** Max age of the delta baseline relative to the shown snapshot. Keeps the
 *  "1-day change" honest across weekends but drops it after longer gaps. */
const MAX_BASELINE_GAP_DAYS = 4;

interface SnapshotRow {
  created_at: string;
  currencies_weighted: SnapshotCurrencies | null;
}

async function lastDailyRowBefore(isoCutoff: string): Promise<SnapshotRow | null> {
  const { data, error } = await supabaseAdmin
    .from("currency_strength_snapshots")
    .select("created_at, currencies_weighted")
    .eq("type", "daily")
    .lt("created_at", isoCutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("Strength teaser snapshot fetch error:", error);
    return null;
  }
  return (data?.[0] as SnapshotRow | undefined) ?? null;
}

function utcDayStart(iso: string): Date {
  const day = new Date(iso);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

/**
 * Yesterday's final daily strength reading with day-over-day deltas. Returns
 * null on any failure or incomplete snapshot so the page renders its
 * unavailable state instead of erroring.
 */
export async function getStrengthTeaser(now: Date = new Date()): Promise<StrengthTeaserData | null> {
  try {
    const todayStart = utcDayStart(now.toISOString());
    const snapshot = await lastDailyRowBefore(todayStart.toISOString());
    if (!snapshot) return null;

    const snapshotDayStart = utcDayStart(snapshot.created_at);
    const previous = await lastDailyRowBefore(snapshotDayStart.toISOString());

    const gapMs = previous
      ? snapshotDayStart.getTime() - utcDayStart(previous.created_at).getTime()
      : Infinity;
    const usableBaseline =
      previous && gapMs <= MAX_BASELINE_GAP_DAYS * 86_400_000 ? previous : null;

    const readings = buildTeaserReadings(
      snapshot.currencies_weighted,
      usableBaseline?.currencies_weighted,
    );
    if (readings.length === 0) return null;

    return {
      readings,
      snapshotAtUtc: snapshot.created_at,
      previousAtUtc: usableBaseline?.created_at ?? null,
    };
  } catch (err) {
    console.error("Strength teaser fetch failed:", err);
    return null;
  }
}
