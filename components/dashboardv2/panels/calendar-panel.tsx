"use client";

import { useState, useMemo } from "react";
import { CalendarDays, ChevronDown, CircleDot, Search, Waves, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "../constants";
import { EVENTS } from "../data/events";
import { WidgetShell } from "../ui/widget-shell";
import { Pill, SmallAction } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import { CalendarRow } from "../ui/calendar-row";
import { DetailDrawer } from "../ui/detail-drawer";
import type { CalendarEvent, Panel } from "../types";

interface CalendarPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function CalendarPanel({ panel, onToggleLock, onRemove }: CalendarPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("All");
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [filters, setFilters] = useState({ high: true, medium: true, low: false });
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

  const visibleEvents = useMemo(
    () =>
      EVENTS.filter((event) => {
        const matchesCurrency =
          selectedCurrency === "All" || event.currency === selectedCurrency;
        const matchesImpact = filters[event.impact];
        const matchesQuery =
          !query ||
          `${event.title} ${event.currency} ${event.region} ${event.agency}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return matchesCurrency && matchesImpact && matchesQuery;
      }),
    [query, selectedCurrency, filters],
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
                  {CURRENCIES.map((item) => (
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
            <div className="grid gap-3">
              {visibleEvents.map((event) => (
                <CalendarRow key={event.id} event={event} onOpen={setActiveEvent} />
              ))}
            </div>
          </div>
        </div>
      </WidgetShell>

      <DetailDrawer event={activeEvent} onClose={() => setActiveEvent(null)} />
    </>
  );
}
