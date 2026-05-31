"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart2, CalendarDays, ChevronDown, CircleDot, Search, Star, Waves, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetShell } from "../ui/widget-shell";
import { Pill, SmallAction } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import { CalendarRow } from "../ui/calendar-row";
import { DetailDrawer } from "../ui/detail-drawer";
import { impactMeta } from "../constants";
import type { CalendarEvent, ImpactLevel, Panel } from "../types";

interface CalendarPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

// -- Timezone --
function getUserTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Amsterdam"; }
}
const USER_TZ = getUserTz();

function formatDateLabel(isoUtc: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: USER_TZ }).format(new Date(isoUtc));
}

function formatTimeLabel(isoUtc: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: USER_TZ, hour12: false }).format(new Date(isoUtc));
}

function dateInTz(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: USER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoUtc));
}

function todayInTz(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: USER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function weekRangeInTz(offsetWeeks = 0): { start: string; end: string } {
  const today = todayInTz();
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + daysToMon + offsetWeeks * 7);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

function upcomingEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// -- Country maps --
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", EU: "EUR", GB: "GBP", JP: "JPY", AU: "AUD",
  CA: "CAD", CH: "CHF", NZ: "NZD", CN: "CNY", IN: "INR",
  KR: "KRW", MX: "MXN", BR: "BRL", ZA: "ZAR", RU: "RUB",
  TR: "TRY", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  SG: "SGD", HK: "HKD", TH: "THB", ID: "IDR", MY: "MYR",
  PH: "PHP", IL: "ILS", CZ: "CZK", HU: "HUF", RO: "RON",
};

const COUNTRY_TO_REGION: Record<string, string> = {
  US: "United States", EU: "Euro Area", GB: "United Kingdom",
  JP: "Japan", AU: "Australia", CA: "Canada", CH: "Switzerland",
  NZ: "New Zealand", CN: "China", IN: "India", KR: "South Korea",
  MX: "Mexico", BR: "Brazil", ZA: "South Africa", RU: "Russia",
  TR: "Turkey", SE: "Sweden", NO: "Norway", DK: "Denmark",
  PL: "Poland", SG: "Singapore", HK: "Hong Kong", TH: "Thailand",
  ID: "Indonesia", MY: "Malaysia", PH: "Philippines", IL: "Israel",
  CZ: "Czech Republic", HU: "Hungary", RO: "Romania",
};

function toImpactLevel(raw: string): ImpactLevel {
  const map: Record<string, ImpactLevel> = {
    High: "high", Medium: "medium", Low: "low",
    high: "high", medium: "medium", low: "low",
  };
  return map[raw] ?? "low";
}

// -- API shape --
interface ApiEvent {
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

function toCalendarEvent(e: ApiEvent): CalendarEvent {
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
    dateLabel: formatDateLabel(e.date_time_utc),
    timeLabel: formatTimeLabel(e.date_time_utc),
    extras: {
      release_time_local: (extras.release_time_local as string) ?? "",
      event_local_tz: e.event_local_tz ?? "UTC",
      time_confidence: e.time_confidence ?? (extras.time_confidence as string) ?? "",
      category: (extras.category as string) ?? "",
      source_url_standardized: e.source_url ?? (extras.source_url_standardized as string) ?? (e.url as string) ?? "",
      event_description: (extras.event_description as string) ?? "",
      pair_relevance: (extras.pair_relevance as { primary_fx_pairs: string[]; related_assets: string[] }) ?? { primary_fx_pairs: [], related_assets: [] },
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

// -- PMI clustering --
const IMPACT_RANK: Record<ImpactLevel, number> = { high: 3, medium: 2, low: 1 };

interface PmiCluster {
  groupKey: string;
  groupTitle: string;
  groupPriority: number;
  highestImpact: ImpactLevel;
  firstTime: number;
  events: CalendarEvent[];
  currencies: string[];
  assets: string[];
}

type ListItem =
  | { type: "event"; event: CalendarEvent }
  | { type: "cluster"; cluster: PmiCluster };

function buildListItems(events: CalendarEvent[]): ListItem[] {
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
    const highestImpact = clusterEvents.reduce<ImpactLevel>(
      (acc, ev) => (IMPACT_RANK[ev.impact] > IMPACT_RANK[acc] ? ev.impact : acc),
      "low",
    );
    clusters.push({
      groupKey,
      groupTitle: first.eventGroupTitle ?? groupKey,
      groupPriority: first.eventGroupPriority ?? 99,
      highestImpact,
      firstTime: new Date(first.isoDateTime).getTime(),
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

// -- PMI Cluster card --
function PmiClusterCard({
  cluster,
  expanded,
  onToggle,
  onOpen,
  now,
}: {
  cluster: PmiCluster;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (event: CalendarEvent) => void;
  now?: number;
}) {
  const meta = impactMeta[cluster.highestImpact];
  return (
    <div className="rounded-[22px] border border-violet-400/20 bg-[linear-gradient(180deg,rgba(124,58,237,0.08),rgba(11,11,16,0.95))] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/10 shrink-0">
            <BarChart2 className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-white">{cluster.groupTitle}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]", meta.badge)}>
                {meta.label}
              </span>
            </div>
            <div className="text-xs text-white/38">
              {cluster.events.length} events · {cluster.currencies.slice(0, 4).join(", ")}
              {cluster.assets.length > 0 && ` · ${cluster.assets.slice(0, 3).join(", ")}`}
            </div>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-white/40 shrink-0 transition-transform ml-2", expanded ? "rotate-180" : "")} />
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-2 pb-2 pt-1 space-y-2">
          {cluster.events.map((event) => (
            <CalendarRow key={event.id} event={event} onOpen={onOpen} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

// -- Date filter types --
type DateFilter = "today" | "this_week" | "next_week" | "upcoming";
type ViewMode = "market_movers" | "full_calendar";

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  today: "Today",
  this_week: "This week",
  next_week: "Next week",
  upcoming: "Upcoming",
};

function matchesDateFilter(isoUtc: string, filter: DateFilter): boolean {
  const evDate = dateInTz(isoUtc);
  const today = todayInTz();
  if (filter === "today") return evDate === today;
  if (filter === "this_week") {
    const { start, end } = weekRangeInTz(0);
    return evDate >= start && evDate <= end;
  }
  if (filter === "next_week") {
    const { start, end } = weekRangeInTz(1);
    return evDate >= start && evDate <= end;
  }
  if (filter === "upcoming") return evDate >= today && evDate <= upcomingEnd();
  return true;
}

// -- Data hook --
function useEconomicEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/economic-events", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ApiEvent[] = await res.json();
        const arr = Array.isArray(data) ? data : [data];
        const sorted = arr
          .sort((a, b) => new Date(a.date_time_utc).getTime() - new Date(b.date_time_utc).getTime())
          .filter((e) => e.title !== "View current release")
          .map(toCalendarEvent);
        setEvents(sorted);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { events, loading, error };
}

function useLiveClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// -- Panel --
export function CalendarPanel({ panel, onToggleLock, onRemove }: CalendarPanelProps) {
  const { events, loading, error } = useEconomicEvents();
  const now = useLiveClock();

  const [query, setQuery] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("All");
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [ccySearch, setCcySearch] = useState("");
  const ccyInputRef = useRef<HTMLInputElement>(null);
  const ccyDropdownRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState({ high: true, medium: true, low: false });
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("market_movers");
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_week");
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  const availableCurrencies = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((e) => seen.add(e.currency));
    return ["All", ...Array.from(seen).sort()];
  }, [events]);

  const filteredCurrencyOptions = useMemo(() => {
    const q = ccySearch.trim().toUpperCase();
    if (!q) return availableCurrencies;
    return availableCurrencies.filter((c) => c.toUpperCase().includes(q));
  }, [availableCurrencies, ccySearch]);

  useEffect(() => {
    if (!showCurrencyMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        !ccyInputRef.current?.closest("[data-ccy-combo]")?.contains(e.target as Node) &&
        !ccyDropdownRef.current?.contains(e.target as Node)
      ) {
        setShowCurrencyMenu(false);
        setCcySearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCurrencyMenu]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (viewMode === "market_movers" && !event.defaultDashboard) return false;
      if (!matchesDateFilter(event.isoDateTime, dateFilter)) return false;
      if (selectedCurrency !== "All" && event.currency !== selectedCurrency) return false;
      if (!filters[event.impact]) return false;
      if (query) {
        const haystack = `${event.title} ${event.currency} ${event.region} ${event.agency}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [events, viewMode, dateFilter, query, selectedCurrency, filters]);

  const listItems = useMemo(() => buildListItems(filteredEvents), [filteredEvents]);

  const visibleItems = useMemo(
    () =>
      listItems.filter((item) => {
        if (now === null) return true;
        const t = item.type === "event"
          ? new Date(item.event.isoDateTime).getTime()
          : item.cluster.firstTime;
        return now - t < 4000;
      }),
    [listItems, now],
  );

  const toggleImpact = (impact: keyof typeof filters) =>
    setFilters((prev) => ({ ...prev, [impact]: !prev[impact] }));

  const toggleCluster = (groupKey: string) =>
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });

  return (
    <>
      <WidgetShell
        title="Economic calendar"
        subtitle="Impact filters and source-linked event detail."
        className="h-full"
        contentClassName="min-h-0"
        headerRight={
          <>
            <div className="relative w-full sm:w-auto">
              <button
                onClick={() => setShowDateMenu((v) => !v)}
                className="flex w-full items-center justify-between gap-1.5 rounded-full border border-violet-400/18 bg-violet-500/[0.08] px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/88 sm:w-auto sm:inline-flex"
              >
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {DATE_FILTER_LABELS[dateFilter]}
                </span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", showDateMenu ? "rotate-180" : "")} />
              </button>
              {showDateMenu && (
                <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-[18px] border border-white/10 bg-[#0d0d13]/95 p-1.5 shadow-2xl backdrop-blur-2xl sm:left-auto sm:right-0 sm:w-36">
                  {(["today", "this_week", "next_week", "upcoming"] as DateFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => { setDateFilter(f); setShowDateMenu(false); }}
                      className={cn(
                        "flex w-full items-center rounded-2xl px-3 py-2 text-left text-sm transition-all",
                        dateFilter === f ? "bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      {DATE_FILTER_LABELS[f]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-2 sm:gap-4">
          {/* View mode toggle */}
          <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 w-full">
            <button
              onClick={() => setViewMode("market_movers")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "market_movers" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80",
              )}
            >
              <Star className="h-3 w-3" />
              Market Movers
            </button>
            <button
              onClick={() => setViewMode("full_calendar")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "full_calendar" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80",
              )}
            >
              <CalendarDays className="h-3 w-3" />
              Full Calendar
            </button>
          </div>

          {/* Impact filters */}
          <div className="flex gap-2">
            <SmallAction active={filters.high} onClick={() => toggleImpact("high")} className="flex-1 justify-center h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4">
              <Zap className="h-4 w-4" />
              High
            </SmallAction>
            <SmallAction active={filters.medium} onClick={() => toggleImpact("medium")} className="flex-1 justify-center h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4">
              <Waves className="h-4 w-4" />
              Medium
            </SmallAction>
            <SmallAction active={filters.low} onClick={() => toggleImpact("low")} className="flex-1 justify-center h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4">
              <CircleDot className="h-4 w-4" />
              Low
            </SmallAction>
          </div>

          {/* Search + currency */}
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events or agencies"
                className="h-9 sm:h-11 w-full rounded-full border border-white/10 bg-white/[0.035] pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/28 focus:border-violet-400/22 focus:bg-white/[0.05]"
              />
            </label>

            <div className="relative" data-ccy-combo>
              {showCurrencyMenu && (
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 z-10" />
              )}
              <input
                ref={ccyInputRef}
                value={showCurrencyMenu ? ccySearch : selectedCurrency === "All" ? "" : selectedCurrency}
                placeholder={showCurrencyMenu ? "Search currency…" : "Currency: All"}
                readOnly={!showCurrencyMenu}
                onClick={() => { setShowCurrencyMenu(true); setCcySearch(""); }}
                onChange={(e) => setCcySearch(e.target.value)}
                className={cn(
                  "h-9 sm:h-11 w-full rounded-full border bg-white/[0.035] text-sm text-white outline-none transition-all placeholder:text-white/42 cursor-pointer",
                  showCurrencyMenu ? "border-violet-400/40 bg-white/[0.05] pl-9 pr-9" : "border-white/10 pl-4 pr-9",
                )}
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                {showCurrencyMenu && ccySearch ? (
                  <button
                    type="button"
                    className="pointer-events-auto text-white/30 hover:text-white/60"
                    onClick={(e) => { e.stopPropagation(); setCcySearch(""); ccyInputRef.current?.focus(); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <ChevronDown className={cn("h-4 w-4 text-white/42 transition-transform", showCurrencyMenu ? "rotate-180" : "")} />
                )}
              </div>
              {showCurrencyMenu && (
                <div
                  ref={ccyDropdownRef}
                  className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-48 overflow-y-auto rounded-[20px] border border-white/10 bg-[#0d0d13]/96 py-1.5 shadow-2xl backdrop-blur-2xl"
                >
                  {filteredCurrencyOptions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-white/38">No match</div>
                  ) : filteredCurrencyOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setSelectedCurrency(item); setShowCurrencyMenu(false); setCcySearch(""); }}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors",
                        selectedCurrency === item ? "bg-violet-500/[0.14] text-white" : "text-white/72 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span>{item}</span>
                      {selectedCurrency === item && <span className="h-2 w-2 rounded-full bg-violet-300/80" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Event list */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 w-full">
            {loading && <p className="py-8 text-center text-sm text-white/40">Loading events…</p>}
            {error && <p className="py-8 text-center text-sm text-red-400/80">Error: {error}</p>}
            {!loading && !error && visibleItems.length === 0 && (
              <p className="py-8 text-center text-sm text-white/40">No events match your filters.</p>
            )}
            {!loading && !error && (
              <div className="grid gap-2 sm:gap-3 w-full min-w-0">
                <AnimatePresence initial={false}>
                  {visibleItems.map((item) =>
                    item.type === "event" ? (
                      <motion.div
                        key={item.event.id}
                        layout
                        exit={{ opacity: 0, x: -20, scale: 0.96 }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        className="min-w-0 w-full"
                      >
                        <CalendarRow event={item.event} onOpen={setActiveEvent} now={now ?? undefined} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key={item.cluster.groupKey}
                        layout
                        exit={{ opacity: 0, x: -20, scale: 0.96 }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        className="min-w-0 w-full"
                      >
                        <PmiClusterCard
                          cluster={item.cluster}
                          expanded={expandedClusters.has(item.cluster.groupKey)}
                          onToggle={() => toggleCluster(item.cluster.groupKey)}
                          onOpen={setActiveEvent}
                          now={now ?? undefined}
                        />
                      </motion.div>
                    ),
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </WidgetShell>

      <DetailDrawer event={activeEvent} onClose={() => setActiveEvent(null)} />
    </>
  );
}
