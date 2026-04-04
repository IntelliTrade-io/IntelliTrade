"use client";

import { useState, useMemo, useEffect } from "react";
import { CalendarDays, ChevronDown, CircleDot, Search, Waves, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetShell } from "../ui/widget-shell";
import { Pill, SmallAction } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import { CalendarRow } from "../ui/calendar-row";
import { DetailDrawer } from "../ui/detail-drawer";
import type { CalendarEvent, ImpactLevel, Panel } from "../types";

interface CalendarPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

// Maps 2-letter country code → currency ticker
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", EU: "EUR", GB: "GBP", JP: "JPY", AU: "AUD",
  CA: "CAD", CH: "CHF", NZ: "NZD", CN: "CNY", IN: "INR",
  KR: "KRW", MX: "MXN", BR: "BRL", ZA: "ZAR", RU: "RUB",
  TR: "TRY", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  SG: "SGD", HK: "HKD", TH: "THB", ID: "IDR", MY: "MYR",
  PH: "PHP", IL: "ILS", CZ: "CZK", HU: "HUF", RO: "RON",
};

// Maps 2-letter country code → display region name
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

function formatDateLabel(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", timeZone: tz || "UTC",
  }).format(new Date(iso));
}

function formatTimeLabel(iso: string, localTime?: string, tz?: string): string {
  if (localTime) return localTime;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", timeZone: tz || "UTC",
  }).format(new Date(iso));
}

// Normalise API impact string ("High" / "Medium" / "Low") to ImpactLevel
function toImpactLevel(raw: string): ImpactLevel {
  const map: Record<string, ImpactLevel> = {
    High: "high", Medium: "medium", Low: "low",
    high: "high", medium: "medium", low: "low",
  };
  return map[raw] ?? "low";
}

// Shape returned by /api/economic-events
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
}

function toCalendarEvent(e: ApiEvent): CalendarEvent {
  const country = e.country ?? "EU";
  const flagCode = country.toLowerCase();
  const currency = COUNTRY_TO_CURRENCY[country] ?? country;
  const region = COUNTRY_TO_REGION[country] ?? country;
  const extras = (e.extras ?? {}) as Record<string, unknown>;

  return {
    id: Number(e.id),
    isoDateTime: e.date_time_utc,
    currency,
    region,
    flagCode,
    title: e.title,
    impact: toImpactLevel(e.impact),
    agency: (e.agency as string) ?? "",
    source: (e.source as string) ?? "",
    rawUrl: (e.url as string) ?? "",
    dateLabel: formatDateLabel(e.date_time_utc, e.event_local_tz),
    timeLabel: formatTimeLabel(
      e.date_time_utc,
      (extras.release_time_local as string) ?? undefined,
      e.event_local_tz,
    ),
    extras: {
      release_time_local: (extras.release_time_local as string) ?? "",
      event_local_tz: e.event_local_tz ?? "UTC",
      time_confidence: (extras.time_confidence as string) ?? "",
      category: (extras.category as string) ?? "",
      source_url_standardized: (extras.source_url_standardized as string) ?? (e.url as string) ?? "",
      event_description: (extras.event_description as string) ?? "",
      pair_relevance: (extras.pair_relevance as { primary_fx_pairs: string[]; related_assets: string[] }) ?? {
        primary_fx_pairs: [],
        related_assets: [],
      },
    },
  };
}

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

export function CalendarPanel({ panel, onToggleLock, onRemove }: CalendarPanelProps) {
  const { events, loading, error } = useEconomicEvents();

  const [query, setQuery] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("All");
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [filters, setFilters] = useState({ high: true, medium: true, low: false });
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

  // Derive currency list from live data
  const availableCurrencies = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((e) => seen.add(e.currency));
    return ["All", ...Array.from(seen).sort()];
  }, [events]);

  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesCurrency = selectedCurrency === "All" || event.currency === selectedCurrency;
        const matchesImpact = filters[event.impact];
        const matchesQuery =
          !query ||
          `${event.title} ${event.currency} ${event.region} ${event.agency}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return matchesCurrency && matchesImpact && matchesQuery;
      }),
    [events, query, selectedCurrency, filters],
  );

  const toggleImpact = (impact: keyof typeof filters) =>
    setFilters((prev) => ({ ...prev, [impact]: !prev[impact] }));

  return (
    <>
      <WidgetShell
        title="Macro calendar"
        subtitle="Impact filters and source-linked event detail."
        className="h-full"
        contentClassName="min-h-0"
        headerRight={
          <>
            <Pill active>
              <CalendarDays className="h-3.5 w-3.5" />
              This week
            </Pill>
            <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <SmallAction active={filters.high} onClick={() => toggleImpact("high")}>
              <Zap className="h-4 w-4" />
              High
            </SmallAction>
            <SmallAction active={filters.medium} onClick={() => toggleImpact("medium")}>
              <Waves className="h-4 w-4" />
              Medium
            </SmallAction>
            <SmallAction active={filters.low} onClick={() => toggleImpact("low")}>
              <CircleDot className="h-4 w-4" />
              Low
            </SmallAction>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events or agencies"
                className="h-11 w-full rounded-full border border-white/10 bg-white/[0.035] pl-11 pr-4 text-white outline-none transition-all placeholder:text-white/28 focus:border-violet-400/22 focus:bg-white/[0.05]"
              />
            </label>

            <div className="relative">
              <button
                onClick={() => setShowCurrencyMenu((v) => !v)}
                className="flex h-11 w-full items-center justify-between rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm text-white transition-all hover:border-white/18"
              >
                <span>
                  <span className="text-white/42">Currency:</span>{" "}
                  <span className="font-medium">{selectedCurrency}</span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-white/42 transition-transform",
                    showCurrencyMenu ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>

              {showCurrencyMenu ? (
                <div className="absolute right-0 z-20 mt-2 w-full overflow-hidden rounded-[20px] border border-white/10 bg-[#0d0d13]/95 p-2 shadow-2xl backdrop-blur-2xl">
                  {availableCurrencies.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setSelectedCurrency(item);
                        setShowCurrencyMenu(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-left text-sm transition-all",
                        selectedCurrency === item
                          ? "bg-white/[0.08] text-white"
                          : "text-white/70 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span>{item}</span>
                      {selectedCurrency === item ? (
                        <span className="h-2 w-2 rounded-full bg-violet-300/80" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {loading && (
              <p className="py-8 text-center text-sm text-white/40">Loading events…</p>
            )}
            {error && (
              <p className="py-8 text-center text-sm text-red-400/80">Error: {error}</p>
            )}
            {!loading && !error && visibleEvents.length === 0 && (
              <p className="py-8 text-center text-sm text-white/40">No events match your filters.</p>
            )}
            {!loading && !error && (
              <div className="grid gap-3">
                {visibleEvents.map((event) => {
                  const isPast = new Date(event.isoDateTime) < new Date();
                  return (
                    <div key={event.id} className={isPast ? "opacity-35" : undefined}>
                      <CalendarRow event={event} onOpen={setActiveEvent} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </WidgetShell>

      <DetailDrawer event={activeEvent} onClose={() => setActiveEvent(null)} />
    </>
  );
}
