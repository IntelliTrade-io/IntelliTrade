// Economic-calendar domain logic, extracted from the dashboard calendar panel
// (refactor plan 5.5). Timezone and "now" are injectable so the date math is
// unit-testable; defaults preserve the panel's original behavior.
import type { CalendarEvent, ImpactLevel } from "@/types/domain/calendar";

export function getUserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Europe/Amsterdam";
  }
}
const USER_TZ = getUserTz();

export function formatDateLabel(isoUtc: string, tz: string = USER_TZ): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: tz }).format(new Date(isoUtc));
}

export function formatTimeLabel(isoUtc: string, tz: string = USER_TZ): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false }).format(new Date(isoUtc));
}

export function dateInTz(isoUtc: string, tz: string = USER_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoUtc));
}

export function todayInTz(tz: string = USER_TZ, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function weekRangeInTz(offsetWeeks = 0, tz: string = USER_TZ, now: Date = new Date()): { start: string; end: string } {
  const today = todayInTz(tz, now);
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + daysToMon + offsetWeeks * 7);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

export function upcomingEnd(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// -- Country maps --
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", EU: "EUR", GB: "GBP", JP: "JPY", AU: "AUD",
  CA: "CAD", CH: "CHF", NZ: "NZD", CN: "CNY", IN: "INR",
  KR: "KRW", MX: "MXN", BR: "BRL", ZA: "ZAR", RU: "RUB",
  TR: "TRY", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  SG: "SGD", HK: "HKD", TH: "THB", ID: "IDR", MY: "MYR",
  PH: "PHP", IL: "ILS", CZ: "CZK", HU: "HUF", RO: "RON",
};

export const COUNTRY_TO_REGION: Record<string, string> = {
  US: "United States", EU: "Euro Area", GB: "United Kingdom",
  JP: "Japan", AU: "Australia", CA: "Canada", CH: "Switzerland",
  NZ: "New Zealand", CN: "China", IN: "India", KR: "South Korea",
  MX: "Mexico", BR: "Brazil", ZA: "South Africa", RU: "Russia",
  TR: "Turkey", SE: "Sweden", NO: "Norway", DK: "Denmark",
  PL: "Poland", SG: "Singapore", HK: "Hong Kong", TH: "Thailand",
  ID: "Indonesia", MY: "Malaysia", PH: "Philippines", IL: "Israel",
  CZ: "Czech Republic", HU: "Hungary", RO: "Romania",
};

export function toImpactLevel(raw: string): ImpactLevel {
  const map: Record<string, ImpactLevel> = {
    High: "high", Medium: "medium", Low: "low",
    high: "high", medium: "medium", low: "low",
  };
  return map[raw] ?? "low";
}

// -- API shape --
export interface ApiEvent {
  id: string | number;
  source?: string;
  agency?: string;
  country?: string;
  title: string;
  date_time_utc: string;
  event_local_tz?: string;
  impact: string;
  url?: string;
  extras?: Record<string, unknown>;
  default_dashboard?: boolean;
  event_group_key?: string | null;
  event_group_title?: string | null;
  event_group_type?: string | null;
  event_group_priority?: number | null;
  trader_relevance_score?: number | null;
  asset_focus?: string[];
  source_reliability?: string | null;
  time_confidence?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  lkg_used?: boolean | null;
  curated_fallback_reviewed_at?: string | null;
  curated_fallback_age_days?: number | null;
  curated_fallback_max_age_days?: number | null;
  post_release_status?: string | null;
  schedule_confidence?: string | null;
  bls_selected_source_path?: string | null;
}

export function toCalendarEvent(e: ApiEvent, tz: string = USER_TZ): CalendarEvent {
  const country = e.country ?? "EU";
  const extras = (e.extras ?? {}) as Record<string, unknown>;

  return {
    id: String(e.id),
    isoDateTime: e.date_time_utc,
    currency: COUNTRY_TO_CURRENCY[country] ?? country,
    region: COUNTRY_TO_REGION[country] ?? country,
    flagCode: country.toLowerCase(),
    title: e.title,
    impact: toImpactLevel(e.impact),
    agency: (e.agency as string) ?? "",
    source: (e.source as string) ?? "",
    rawUrl: (e.url as string) ?? "",
    dateLabel: formatDateLabel(e.date_time_utc, tz),
    timeLabel: formatTimeLabel(e.date_time_utc, tz),
    extras: {
      release_time_local: (extras.release_time_local as string) ?? "",
      event_local_tz: e.event_local_tz ?? "UTC",
      time_confidence: e.time_confidence ?? (extras.time_confidence as string) ?? "",
      category: (extras.category as string) ?? "",
      source_url_standardized: e.source_url ?? (extras.source_url_standardized as string) ?? (e.url as string) ?? "",
      event_description: (extras.event_description as string) ?? "",
      pair_relevance: (extras.pair_relevance as { primary_fx_pairs: string[]; related_assets: string[] }) ?? { primary_fx_pairs: [], related_assets: [] },
      // speaker fields
      speaker_event: (extras.speaker_event as boolean) ?? false,
      speaker_name: (extras.speaker_name as string) ?? "",
      speaker_role: (extras.speaker_role as string) ?? "",
      speaker_institution: (extras.speaker_institution as string) ?? "",
      speaker_priority: (extras.speaker_priority as number) ?? null,
      speech_topic: (extras.speech_topic as string) ?? "",
      policy_relevance: (extras.policy_relevance as string) ?? "",
    },
    defaultDashboard: e.default_dashboard ?? false,
    eventGroupKey: e.event_group_key ?? null,
    eventGroupTitle: e.event_group_title ?? null,
    eventGroupType: e.event_group_type ?? null,
    eventGroupPriority: e.event_group_priority ?? null,
    traderRelevanceScore: e.trader_relevance_score ?? null,
    assetFocus: e.asset_focus ?? [],
    sourceReliability: e.source_reliability ?? null,
    sourceName: e.source_name ?? null,
    sourceUrl: e.source_url ?? null,
    lkgUsed: e.lkg_used ?? null,
    curatedFallbackReviewedAt: e.curated_fallback_reviewed_at ?? null,
    curatedFallbackAgeDays: e.curated_fallback_age_days ?? null,
    curatedFallbackMaxAgeDays: e.curated_fallback_max_age_days ?? null,
    postReleaseStatus: e.post_release_status ?? null,
    scheduleConfidence: e.schedule_confidence ?? null,
    blsSelectedSourcePath: e.bls_selected_source_path ?? null,
  };
}

/**
 * Dedup safety net shared by the premium events route and the free teaser:
 * groups on (country, title, UTC-date) and keeps the first row per group.
 * Input must be ordered by date_time_utc ascending — the earliest time per
 * group is the corrected version (e.g. 09:00 UTC not 11:00 UTC for fixed
 * Eurostat events).
 */
export function dedupeEventRows<T extends { country?: string | null; title?: string | null; date_time_utc?: string | null }>(
  rows: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const dateStr = row.date_time_utc?.slice(0, 10) ?? "";
    const key = `${row.country}|${row.title}|${dateStr}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return Array.from(seen.values());
}

/**
 * Splits rows into today's events and later upcoming events on the UTC day
 * boundary. The free teaser renders on the server without knowing the
 * visitor's timezone, so "today" must be a zone everyone agrees on — UTC,
 * stated on the page. Rows before the current UTC day are dropped.
 */
export function splitTodayUpcoming<T extends { date_time_utc?: string | null }>(
  rows: T[],
  now: Date = new Date(),
): { today: T[]; upcoming: T[] } {
  const todayUtc = now.toISOString().slice(0, 10);
  const today: T[] = [];
  const upcoming: T[] = [];
  for (const row of rows) {
    const day = row.date_time_utc?.slice(0, 10) ?? "";
    if (day === todayUtc) today.push(row);
    else if (day > todayUtc) upcoming.push(row);
  }
  return { today, upcoming };
}

// -- PMI clustering --
export const IMPACT_RANK: Record<ImpactLevel, number> = { high: 3, medium: 2, low: 1 };

export interface PmiCluster {
  groupKey: string;
  groupTitle: string;
  groupPriority: number;
  highestImpact: ImpactLevel;
  firstTime: number;
  events: CalendarEvent[];
  currencies: string[];
  assets: string[];
}

export type ListItem =
  | { type: "event"; event: CalendarEvent }
  | { type: "cluster"; cluster: PmiCluster };

export function buildListItems(events: CalendarEvent[]): ListItem[] {
  const clusterMap = new Map<string, CalendarEvent[]>();
  const standalone: CalendarEvent[] = [];

  for (const ev of events) {
    if (ev.eventGroupType === "pmi_cluster" && ev.eventGroupKey) {
      const arr = clusterMap.get(ev.eventGroupKey) ?? [];
      arr.push(ev);
      clusterMap.set(ev.eventGroupKey, arr);
    } else {
      standalone.push(ev);
    }
  }

  const clusters: PmiCluster[] = [];
  for (const [groupKey, clusterEvents] of clusterMap) {
    const first = clusterEvents[0];
    if (!first) continue;
    const highestImpact = clusterEvents.reduce<ImpactLevel>(
      (acc, ev) => (IMPACT_RANK[ev.impact] > IMPACT_RANK[acc] ? ev.impact : acc),
      "low",
    );
    const firstTime = Math.min(...clusterEvents.map((ev) => new Date(ev.isoDateTime).getTime()));
    clusters.push({
      groupKey,
      groupTitle: first.eventGroupTitle ?? groupKey,
      groupPriority: first.eventGroupPriority ?? 99,
      highestImpact,
      firstTime,
      events: clusterEvents,
      currencies: [...new Set(clusterEvents.map((ev) => ev.currency))],
      assets: [...new Set(clusterEvents.flatMap((ev) => ev.assetFocus))],
    });
  }

  const items: ListItem[] = [
    ...standalone.map((event) => ({ type: "event" as const, event })),
    ...clusters.map((cluster) => ({ type: "cluster" as const, cluster })),
  ];

  items.sort((a, b) => {
    const at = a.type === "event" ? new Date(a.event.isoDateTime).getTime() : a.cluster.firstTime;
    const bt = b.type === "event" ? new Date(b.event.isoDateTime).getTime() : b.cluster.firstTime;
    return at - bt;
  });

  return items;
}

// -- Panel filter pipeline --
// One shared pipeline for the event list AND the view-mode count badges, so a
// badge can never claim more events than the list actually renders.

export interface EventFilterOptions {
  moversOnly: boolean;
  dateFilter: DateFilter;
  /** Currency code, or "All". */
  currency: string;
  impact: Record<ImpactLevel, boolean>;
  query: string;
}

export function filterEvents(
  events: CalendarEvent[],
  opts: EventFilterOptions,
  tz: string = USER_TZ,
  now: Date = new Date(),
): CalendarEvent[] {
  const q = opts.query.trim().toLowerCase();
  return events.filter((event) => {
    if (opts.moversOnly && !event.defaultDashboard) return false;
    if (!matchesDateFilter(event.isoDateTime, opts.dateFilter, tz, now)) return false;
    if (opts.currency !== "All" && event.currency !== opts.currency) return false;
    if (!opts.impact[event.impact]) return false;
    if (q) {
      const haystack = `${event.title} ${event.currency} ${event.region} ${event.agency}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Grace period before a released event is dropped from the live list. */
export const ELAPSED_GRACE_MS = 4000;

/** Drops items whose scheduled time passed more than the grace period ago.
 *  `nowMs === null` (before the client clock mounts) keeps everything. */
export function dropElapsedItems(items: ListItem[], nowMs: number | null, graceMs: number = ELAPSED_GRACE_MS): ListItem[] {
  if (nowMs === null) return items;
  return items.filter((item) => {
    const t = item.type === "event" ? new Date(item.event.isoDateTime).getTime() : item.cluster.firstTime;
    return nowMs - t < graceMs;
  });
}

// -- Date filters --
export type DateFilter = "today" | "this_week" | "next_week" | "upcoming";

export const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  today: "Today",
  this_week: "This week",
  next_week: "Next week",
  upcoming: "Upcoming",
};

export function matchesDateFilter(
  isoUtc: string,
  filter: DateFilter,
  tz: string = USER_TZ,
  now: Date = new Date(),
): boolean {
  const evDate = dateInTz(isoUtc, tz);
  const today = todayInTz(tz, now);
  if (filter === "today") return evDate === today;
  if (filter === "this_week") {
    const { start, end } = weekRangeInTz(0, tz, now);
    return evDate >= start && evDate <= end;
  }
  if (filter === "next_week") {
    const { start, end } = weekRangeInTz(1, tz, now);
    return evDate >= start && evDate <= end;
  }
  if (filter === "upcoming") return evDate >= today && evDate <= upcomingEnd(now);
  return true;
}
