// Server-side fetcher for the free economic-calendar teaser page. High-impact
// rows only — the full calendar (all impact levels, filters, live countdowns,
// event detail) stays subscription-gated behind /api/economic-events. Server
// components import this directly (plan 5.2: no HTTP round-trip to our own
// API routes).
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  COUNTRY_TO_CURRENCY,
  COUNTRY_TO_REGION,
  dedupeEventRows,
  splitTodayUpcoming,
} from "@/lib/calendar";

export interface FreeCalendarEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  region: string;
  agency: string;
  /** ISO timestamp in UTC. */
  dateTimeUtc: string;
}

export interface FreeCalendarData {
  today: FreeCalendarEvent[];
  upcoming: FreeCalendarEvent[];
}

/** Days ahead the "coming up" list looks. */
const UPCOMING_WINDOW_DAYS = 7;
/** Cap so a data-dense week cannot balloon the static page. */
const UPCOMING_MAX_ROWS = 12;

interface EventRow {
  id: number;
  scraperID?: string | null;
  country?: string | null;
  title?: string | null;
  agency?: string | null;
  date_time_utc?: string | null;
  impact?: string | null;
}

function toFreeEvent(row: EventRow): FreeCalendarEvent {
  const country = row.country ?? "EU";
  return {
    id: row.scraperID ?? String(row.id),
    title: row.title ?? "",
    country,
    currency: COUNTRY_TO_CURRENCY[country] ?? country,
    region: COUNTRY_TO_REGION[country] ?? country,
    agency: row.agency ?? "",
    dateTimeUtc: row.date_time_utc ?? "",
  };
}

/**
 * Today's high-impact events plus the next week's high-impact schedule, UTC
 * day boundaries. Returns empty lists on any failure so the static page still
 * renders (with its empty state) instead of failing the build.
 */
export async function getFreeCalendarHighImpact(now: Date = new Date()): Promise<FreeCalendarData> {
  try {
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(startOfToday);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + UPCOMING_WINDOW_DAYS + 1);

    const { data, error } = await supabaseAdmin
      .from("economic_events")
      .select('id, "scraperID", country, title, agency, date_time_utc, impact')
      .gte("date_time_utc", startOfToday.toISOString())
      .lt("date_time_utc", windowEnd.toISOString())
      .in("impact", ["High", "high"])
      .order("date_time_utc", { ascending: true });

    if (error) {
      console.error("Free calendar fetch error:", error);
      return { today: [], upcoming: [] };
    }

    const rows = dedupeEventRows((data ?? []) as EventRow[]).filter(
      (row) => row.title !== "View current release",
    );
    const { today, upcoming } = splitTodayUpcoming(rows, now);
    return {
      today: today.map(toFreeEvent),
      upcoming: upcoming.slice(0, UPCOMING_MAX_ROWS).map(toFreeEvent),
    };
  } catch (err) {
    console.error("Free calendar fetch failed:", err);
    return { today: [], upcoming: [] };
  }
}
