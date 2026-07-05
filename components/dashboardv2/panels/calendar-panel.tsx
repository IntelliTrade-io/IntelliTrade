"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart2, CalendarDays, ChevronDown, CircleDot, Search, Star, Waves, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api/client";
import { WidgetShell } from "../ui/widget-shell";
import { SmallAction } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import { CalendarRow } from "../ui/calendar-row";
import { DetailDrawer } from "../ui/detail-drawer";
import { impactMeta } from "../constants";
import type { CalendarEvent, Panel } from "../types";

interface CalendarPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

// Domain logic (timezone math, event transforms, PMI clustering, date
// filters) lives in lib/calendar.ts since plan 5.5.
import {
  buildListItems,
  dateInTz,
  getUserTz,
  matchesDateFilter,
  toCalendarEvent,
  DATE_FILTER_LABELS,
  type ApiEvent,
  type DateFilter,
  type PmiCluster,
} from "@/lib/calendar";

const USER_TZ = getUserTz();

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

// -- View mode --
type ViewMode = "market_movers" | "full_calendar";

// -- Data hook --
function useEconomicEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<ApiEvent[]>("/api/economic-events");
        const arr = Array.isArray(data) ? data : [data];
        const sorted = arr
          .sort((a, b) => new Date(a.date_time_utc).getTime() - new Date(b.date_time_utc).getTime())
          .filter((e) => e.title !== "View current release")
          .map((e) => toCalendarEvent(e));
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

  const marketMoversCount = useMemo(() => {
    const f = events.filter(e =>
      e.defaultDashboard &&
      matchesDateFilter(e.isoDateTime, dateFilter) &&
      (selectedCurrency === "All" || e.currency === selectedCurrency) &&
      filters[e.impact],
    );
    return buildListItems(f).length;
  }, [events, dateFilter, selectedCurrency, filters]);

  const fullCalendarCount = useMemo(() => {
    const f = events.filter(e =>
      matchesDateFilter(e.isoDateTime, dateFilter) &&
      (selectedCurrency === "All" || e.currency === selectedCurrency) &&
      filters[e.impact],
    );
    return buildListItems(f).length;
  }, [events, dateFilter, selectedCurrency, filters]);

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

  const groupedItems = useMemo(() => {
    const groups: Array<{ dateKey: string; dateLabel: string; items: typeof visibleItems }> = [];
    for (const item of visibleItems) {
      const iso = item.type === "event" ? item.event.isoDateTime : new Date(item.cluster.firstTime).toISOString();
      const dateKey = dateInTz(iso);
      const last = groups[groups.length - 1];
      if (last?.dateKey === dateKey) {
        last.items.push(item);
      } else {
        groups.push({
          dateKey,
          dateLabel: new Intl.DateTimeFormat(undefined, {
            weekday: "long", month: "short", day: "numeric", timeZone: USER_TZ,
          }).format(new Date(dateKey + "T12:00:00Z")),
          items: [item],
        });
      }
    }
    return groups;
  }, [visibleItems]);

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
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">{marketMoversCount}</span>
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
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">{fullCalendarCount}</span>
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
              <div className="w-full min-w-0 space-y-4">
                <AnimatePresence initial={false}>
                  {groupedItems.map((group) => (
                    <div key={group.dateKey} className="min-w-0">
                      {/* Day separator */}
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/32 whitespace-nowrap">
                          {group.dateLabel}
                        </span>
                        <div className="flex-1 h-px bg-white/8" />
                      </div>
                      {/* Events for this day */}
                      <div className="grid gap-2 sm:gap-3 w-full min-w-0">
                        {group.items.map((item) =>
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
                      </div>
                    </div>
                  ))}
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
