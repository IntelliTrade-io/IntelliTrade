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
      <div className="!w-[80vw] lg:!w-[25vw] mt-8 mb-8 lot-size-container backdrop-blur-[1px] ml-5">
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
                className="w-full px-3 py-2 rounded text-sm text-left flex justify-between items-center"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'rgb(191, 191, 191)',
                }}
              >
                <span>
                  {selectedCurrencies.length === 0 
                    ? 'Select currencies...' 
                    : `${selectedCurrencies.length} selected`}
                </span>
                <span>{isDropdownOpen ? '▲' : '▼'}</span>
              </button>
              
              {isDropdownOpen && (
                <div 
                  className="absolute w-full mt-1 rounded overflow-hidden z-10"
                  style={{
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {availableCurrencies.map((currency) => (
                    <label
                      key={currency}
                      className="flex items-center px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
                      style={{ color: 'rgb(191, 191, 191)' }}
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
                        style={{ accentColor: 'rgba(255, 255, 255, 0.8)' }}
                      />
                      <span className="text-sm">
                        {currency} - {currencyNames[currency] || 'Unknown'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedCurrencies.length > 0 && (
              <div className="filtering-div">
                <div className="text-xs" style={{ color: 'rgb(191, 191, 191)', opacity: 0.7 }}>
                  <span>Filtering: {selectedCurrencies.join(", ")}</span>
                </div>
                <button 
                  onClick={() => setSelectedCurrencies([])}
                  className="text-xs underline hover:opacity-80"
                  style={{ color: 'rgb(191, 191, 191)', opacity: 0.7 }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          
          <div className="body-content overflow-y-auto">
          {loading && <div className="economic-div">Loading…</div>}
          {err && <div className="economic-div text-red-500">Error: {err}</div>}

          {!loading && !err && events.map((e) => {
            const flag = (e.country || "EU").toLowerCase();
            const localTime = e.extras?.release_time_local || timeInZone(e.date_time_utc, e.event_local_tz);
            const color = e.impact === "High" ? "red" : e.impact === "Medium" ? "yellow" : "grey";
            const visible = isVisible(e);
            const isHidden = hiddenItems.has(e.id);
            
            if (isHidden) return null;
            if (e.title == "View current release") return null;
            
            return (
              <div 
                key={e.id} 
                data-impact={e.impact} 
                className="economic-div flex justify-center items-center w-[100%]"
                style={{
                  opacity: visible ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}
              >
                <div className="left-economic-div">
                  <div className="flag-div"><span className={`fi fi-${flag} fis`}></span></div>
                </div>
                <div className="middle-economic-div">
                  <span className="middle-economic-currency">{e.country === "AU" ? "AUD" : (e.country || "")}</span>
                  <span className="middle-economic-info">{e.title}</span>
                </div>
                <div className="right-economic-div">
                  <div className="right-economic-div-top"><span>{localTime}</span></div>
                  <div className="right-economic-div-bottom"><div className={`sphere ${color}`}></div></div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      <div className="!w-[80vw] lg:!w-[50vw] mt-4 mb-8 px-4 lot-size-container backdrop-blur-[1px] ml-5 mr-5">
        <div className="button-backdrop"></div>
        <div className="body">
          <TradingViewWidget />
        </div>
      </div>

      <LotSizeCalculator className="!w-[25vw] mr-5" />
    </div>
  );
}