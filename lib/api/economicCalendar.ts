// Server-side fetcher for the free economic-calendar recap page. Past
// high-impact rows only, each with the release-day market reaction of the
// event currency's primary USD pair. The forward-looking calendar (upcoming
// schedule, all impact levels, filters, live countdowns, event detail) stays
// subscription-gated behind /api/economic-events. Server components import
// this directly (plan 5.2: no HTTP round-trip to our own API routes).
//
// Reaction figures come from CurrencyFreaks end-of-day historical rates
// (works on our plan; see lib/api/priceHistory.ts for the same pattern). The
// API key stays server-only (audit H7) — never import this from a client
// component.
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dedupeEventRows, COUNTRY_TO_CURRENCY, COUNTRY_TO_REGION } from "@/lib/calendar";
import {
  CURRENCY_TO_PAIR,
  cfSymbolForCurrency,
  pairMovePct,
  prevTradingDayUtc,
} from "@/lib/event-impact";

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

export interface RecapEvent extends FreeCalendarEvent {
  /** Primary USD pair the reaction is measured on, e.g. "EUR/USD". */
  pair: string | null;
  /** Release-day close vs previous trading day close, percent. Null when no
   *  clean daily figure exists (missing/stale rates, unmapped currency). */
  movePct: number | null;
}

export interface FreeCalendarData {
  /** High-impact events already released today (UTC), newest last. No
   *  reaction figure — the release day has no close yet. */
  todayReleased: FreeCalendarEvent[];
  /** Past days' high-impact events with reaction figures, newest first. */
  recent: RecapEvent[];
}

/** Days of history the recap shows. */
const RECAP_WINDOW_DAYS = 14;

/** All non-USD legs the pair map can need, fetched per date in one call. */
const CF_SYMBOLS = ["EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY"];

const CF_BASE = "https://api.currencyfreaks.com/v2.0/rates";

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

/** Historical rates ("units per USD") for one date; null on any failure.
 *  Historical rates for a past date never change, so cache for a day. */
async function fetchRatesForDate(
  apiKey: string,
  date: string,
): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      `${CF_BASE}/historical?apikey=${apiKey}&date=${date}&symbols=${CF_SYMBOLS.join(",")}`,
      { next: { revalidate: 86_400 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, string> };
    if (!data.rates) return null;
    const out: Record<string, number> = {};
    for (const [sym, raw] of Object.entries(data.rates)) {
      const n = parseFloat(raw);
      if (isFinite(n) && n > 0) out[sym] = n;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Past high-impact events (today's releases plus the prior two weeks), with
 * release-day reaction figures for the prior days. Returns empty lists on any
 * database failure so the page renders its empty state instead of erroring.
 */
export async function getFreeCalendarRecap(now: Date = new Date()): Promise<FreeCalendarData> {
  try {
    const windowStart = new Date(now);
    windowStart.setUTCHours(0, 0, 0, 0);
    windowStart.setUTCDate(windowStart.getUTCDate() - RECAP_WINDOW_DAYS);

    const { data, error } = await supabaseAdmin
      .from("economic_events")
      .select('id, "scraperID", country, title, agency, date_time_utc, impact')
      .gte("date_time_utc", windowStart.toISOString())
      .lte("date_time_utc", now.toISOString())
      .in("impact", ["High", "high"])
      .order("date_time_utc", { ascending: true });

    if (error) {
      console.error("Free calendar recap fetch error:", error);
      return { todayReleased: [], recent: [] };
    }

    const rows = dedupeEventRows((data ?? []) as EventRow[]).filter(
      (row) => row.title !== "View current release",
    );

    const todayUtc = now.toISOString().slice(0, 10);
    const todayRows = rows.filter((r) => r.date_time_utc?.slice(0, 10) === todayUtc);
    const pastRows = rows.filter((r) => (r.date_time_utc?.slice(0, 10) ?? "") < todayUtc);

    // One CurrencyFreaks call per distinct date involved (event day + its
    // previous trading day), each cached for a day.
    const apiKey = process.env.CURRENCYFREAKS_API_KEY ?? process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
    const dates = new Set<string>();
    for (const row of pastRows) {
      const day = row.date_time_utc?.slice(0, 10);
      if (!day) continue;
      dates.add(day);
      dates.add(prevTradingDayUtc(day));
    }

    const ratesByDate = new Map<string, Record<string, number> | null>();
    if (apiKey && dates.size > 0) {
      await Promise.all(
        [...dates].map(async (date) => {
          ratesByDate.set(date, await fetchRatesForDate(apiKey, date));
        }),
      );
    }

    const recent: RecapEvent[] = pastRows
      .map((row) => {
        const base = toFreeEvent(row);
        const spec = CURRENCY_TO_PAIR[base.currency];
        const leg = cfSymbolForCurrency(base.currency);
        const day = base.dateTimeUtc.slice(0, 10);
        const onDay = spec && leg ? ratesByDate.get(day)?.[leg] ?? null : null;
        const prevDay = spec && leg ? ratesByDate.get(prevTradingDayUtc(day))?.[leg] ?? null : null;
        return {
          ...base,
          pair: spec?.pair ?? null,
          movePct: spec ? pairMovePct(spec, onDay, prevDay) : null,
        };
      })
      .reverse(); // newest first

    return { todayReleased: todayRows.map(toFreeEvent), recent };
  } catch (err) {
    console.error("Free calendar recap fetch failed:", err);
    return { todayReleased: [], recent: [] };
  }
}
