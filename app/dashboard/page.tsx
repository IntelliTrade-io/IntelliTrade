"use client";

import { useEffect, useState } from "react";
import "../../styles/lot-size-calculator.css";
import LotSizeCalculator from "@/components/lot-size-calculator-2";
import TradingViewWidget from "@/components/tradingView";
import "@/node_modules/flag-icons/css/flag-icons.min.css";

type EconEvent = {
  impact: string;
  id: string;
  country?: string;
  title: string;
  date_time_utc: string;
  event_local_tz?: string;
  extras?: { release_time_local?: string };
};

export default function Page() {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Toggle states for each impact level
  const [showHigh, setShowHigh] = useState(true);
  const [showMedium, setShowMedium] = useState(true);
  const [showLow, setShowLow] = useState(true);

  // Currency filter state
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Track which items are animating out
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set());

  // Live countdown ticker
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/economic-events", { cache: "no-store" });

        console.log(res);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        console.log(data);
        const arr = Array.isArray(data) ? data : [data];
        setEvents(arr);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        setErr(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const timeInZone = (iso: string, tz?: string) =>
    new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz || "UTC" })
      .format(new Date(iso));

  const dateInZone = (iso: string, tz?: string) =>
    new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: tz || "UTC" })
      .format(new Date(iso));

  const formatCountdown = (iso: string) => {
    const diff = new Date(iso).getTime() - now;
    if (diff <= 0) return "now";
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  // Get unique currencies from events
  const availableCurrencies = Array.from(
    new Set(
      events
        .map(e => e.country)
        .filter((c): c is string => !!c)
    )
  ).sort();

  // Currency name mapping
  const currencyNames: Record<string, string> = {
    'US': 'United States Dollar',
    'EU': 'Euro',
    'GB': 'British Pound',
    'JP': 'Japanese Yen',
    'AU': 'Australian Dollar',
    'CA': 'Canadian Dollar',
    'CH': 'Swiss Franc',
    'NZ': 'New Zealand Dollar',
    'CN': 'Chinese Yuan',
    'IN': 'Indian Rupee',
    'KR': 'South Korean Won',
    'MX': 'Mexican Peso',
    'BR': 'Brazilian Real',
    'ZA': 'South African Rand',
    'RU': 'Russian Ruble',
    'TR': 'Turkish Lira',
    'SE': 'Swedish Krona',
    'NO': 'Norwegian Krone',
    'DK': 'Danish Krone',
    'PL': 'Polish Zloty',
    'SG': 'Singapore Dollar',
    'HK': 'Hong Kong Dollar',
    'TH': 'Thai Baht',
    'ID': 'Indonesian Rupiah',
    'MY': 'Malaysian Ringgit',
    'PH': 'Philippine Peso',
    'IL': 'Israeli Shekel',
    'CZ': 'Czech Koruna',
    'HU': 'Hungarian Forint',
    'RO': 'Romanian Leu',
  };

  // Check if an event should be visible
  const isVisible = (e: EconEvent) => {
    // Check impact filter
    if (e.impact === "High" && !showHigh) return false;
    if (e.impact === "Medium" && !showMedium) return false;
    if (e.impact === "Low" && !showLow) return false;

    // Check currency filter (if any currencies are selected)
    if (selectedCurrencies.length > 0 && e.country && !selectedCurrencies.includes(e.country)) {
      return false;
    }

    return true;
  };

  // Update hidden items when toggles change
  useEffect(() => {
    // const newHidden = new Set<string>();
    events.forEach((e) => {
      if (!isVisible(e)) {
        setTimeout(() => {
          setHiddenItems((prev) => new Set(prev).add(e.id));
        }, 300); // Match transition duration
      } else {
        setHiddenItems((prev) => {
          const next = new Set(prev);
          next.delete(e.id);
          return next;
        });
      }
    });
  }, [showHigh, showMedium, showLow, selectedCurrencies, events]);

  return (
    <div className="flex-1 w-full flex justify-center items-center">
      <div className="!w-[80vw] lg:!w-[25vw] mt-8 mb-8 lot-size-container backdrop-blur-[1px] border border-white/20 ml-5">
        <div className="button-backdrop"></div>
        <div className="top-light"></div>
        <div className="body">
          <div className="body-header"><span>Economic calendar</span></div>
          <div className="toggle-main-div">
            <div className="toggle-div">
              <div className="checkbox-wrapper-59">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showHigh}
                    onChange={(e) => setShowHigh(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <span>High impact</span>
            </div>

            <div className="toggle-div">
              <div className="checkbox-wrapper-59">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showMedium}
                    onChange={(e) => setShowMedium(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <span>Medium impact</span>
            </div>

            <div className="toggle-div">
              <div className="checkbox-wrapper-59">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showLow}
                    onChange={(e) => setShowLow(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <span>Low impact</span>
            </div>
          </div>

          {/* Currency Filter */}
          <div className="mt-4 px-3 mb-4">
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-3 py-2 rounded-xl text-sm text-left flex justify-between items-center bg-white/5 border border-white/20 text-slate-300 hover:bg-white/10 transition"
              >
                <span>
                  {selectedCurrencies.length === 0
                    ? 'Select currencies...'
                    : `${selectedCurrencies.length} selected`}
                </span>
                <span className="text-xs opacity-60">{isDropdownOpen ? '▲' : '▼'}</span>
              </button>

              {isDropdownOpen && (
                <div className="absolute w-full mt-1 rounded-xl overflow-hidden z-10 bg-slate-900/95 border border-white/20 max-h-48 overflow-y-auto">
                  {availableCurrencies.map((currency) => (
                    <label
                      key={currency}
                      className="flex items-center px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCurrencies.includes(currency)}
                        onChange={() => {
                          setSelectedCurrencies(prev =>
                            prev.includes(currency)
                              ? prev.filter(c => c !== currency)
                              : [...prev, currency]
                          );
                        }}
                        className="mr-3"
                        style={{ accentColor: 'rgb(124,58,237)' }}
                      />
                      <span className="text-xs">
                        {currency} - {currencyNames[currency] || 'Unknown'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedCurrencies.length > 0 && (
              <div className="filtering-div">
                <span className="text-xs text-slate-500">Filtering: {selectedCurrencies.join(", ")}</span>
                <button
                  onClick={() => setSelectedCurrencies([])}
                  className="text-xs text-brand/70 hover:text-brand underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="overflow-y-auto max-h-[55vh] px-3 pb-3">
            {loading && <p className="text-xs text-slate-400 text-center py-4">Loading…</p>}
            {err && <p className="text-xs text-red-400 text-center py-4">Error: {err}</p>}

            {!loading && !err && (
              <div className="space-y-2">
                {[...events]
                  .sort((a, b) => new Date(a.date_time_utc).getTime() - new Date(b.date_time_utc).getTime())
                  .map((e) => {
                    const flag = (e.country || "EU").toLowerCase();
                    const localTime = e.extras?.release_time_local || timeInZone(e.date_time_utc, e.event_local_tz);
                    const color = e.impact === "High" ? "red" : e.impact === "Medium" ? "yellow" : "grey";
                    const visible = isVisible(e);
                    const isHidden = hiddenItems.has(e.id);

                    if (isHidden) return null;
                    if (e.title === "View current release") return null;

                    return (
                      <div
                        key={e.id}
                        className="rounded-2xl border border-white/15 bg-white/5 flex items-center gap-3 px-3 py-2"
                        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
                      >
                        <div className="flag-div shrink-0"><span className={`fi fi-${flag} fis`}></span></div>
                        <div className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold text-brand-300/90">{e.country === "AU" ? "AUD" : (e.country || "")}</span>
                          <span className="block text-xs text-slate-300">{e.title}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block text-[10px] text-slate-300">{dateInZone(e.date_time_utc, e.event_local_tz)}</span>
                          <span className="block text-xs text-slate-200">{localTime}</span>
                          <span className="block text-[10px] text-slate-300">{formatCountdown(e.date_time_utc)}</span>
                          <div className={`sphere ${color} mt-1 ml-auto`}></div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="!w-[80vw] lg:!w-[50vw] mt-4 mb-8 px-4 lot-size-container backdrop-blur-[1px] border border-white/20 ml-5 mr-5">
        <div className="button-backdrop"></div>
        <div className="body">
          <TradingViewWidget />
        </div>
      </div>

      <LotSizeCalculator className="!w-[25vw] mr-5" />
    </div>
  );
}
