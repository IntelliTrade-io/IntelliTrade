"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { trackEvent } from "@/lib/analytics";
import { ProCtaCard } from "@/components/pro/ProCtaCard";
import {
  composePairsFrom,
  computePipValue,
  normalizePair,
  parsePair,
  rateFromUsdRates,
} from "@/lib/lot-size";

// Same supported-codes source and rate orientation as the lot size calculator;
// this tool only differs in inputs (pair + position size) and outputs (pip
// value per standard/mini/micro lot). Shares the combobox pattern verbatim so
// both calculators feel identical — extraction into a shared combobox is noted
// in IMPROVEMENTS.md.
const CF_SUPPORTED_URL = "https://api.currencyfreaks.com/v2.0/supported-currencies";

const FALLBACK_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD",
];

interface PipValueCalculatorProps {
  className?: string;
  /**
   * Pre-select this pair on first render (used by the per-pair SEO pages, e.g.
   * /pipvaluecalculator/xauusd). Falls back to EURUSD once the live pair list
   * loads if the symbol is not composable.
   */
  initialPair?: string;
}

type Results = {
  forLots: string;
  perStandardLot: string;
  perMiniLot: string;
  perMicroLot: string;
  context: string;
};

export default function PipValueCalculator({ className, initialPair }: PipValueCalculatorProps) {
  const [currency, setCurrency] = useState("USD"); // account currency
  const [pair, setPair] = useState(initialPair ? normalizePair(initialPair) : "EURUSD");
  const [lots, setLots] = useState("1");

  const [results, setResults] = useState<Results | null>(null);

  const [pairs, setPairs] = useState<string[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [pairsError, setPairsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPairs(true);
        setPairsError(null);
        const data = await apiGet<{ supportedCurrenciesMap?: Record<string, unknown> }>(CF_SUPPORTED_URL);
        const map = (data?.supportedCurrenciesMap || {}) as Record<string, unknown>;
        const codes = new Set(Object.keys(map));
        codes.add("USD");
        const composed = composePairsFrom(codes);
        if (!cancelled) {
          setPairs(composed);
          if (!composed.includes(pair)) setPair(composed.includes("EURUSD") ? "EURUSD" : composed[0] || "EURUSD");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setPairsError(e instanceof Error ? e.message : "Could not load pairs");
          setPairs(FALLBACK_PAIRS);
        }
      } finally {
        if (!cancelled) setLoadingPairs(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchExchangeRate = async (pairSymbol: string) => {
    const { base, quote } = parsePair(pairSymbol);
    try {
      const data = await apiGet<{ rates: Record<string, string> }>(`/api/rates?symbols=${base},${quote}`);
      return rateFromUsdRates(base, quote, data.rates);
    } catch (error) {
      console.error("Exchange rate error:", error);
      return null;
    }
  };

  const convertRate = async (fromCcy: string, toCcy: string) => {
    if (fromCcy === toCcy) return 1;
    const direct = await fetchExchangeRate(`${fromCcy}${toCcy}`);
    if (direct && Number.isFinite(direct) && direct > 0) return direct;
    const inverse = await fetchExchangeRate(`${toCcy}${fromCcy}`);
    if (inverse && Number.isFinite(inverse) && inverse > 0) return 1 / inverse;
    throw new Error(`No FX conversion available for ${fromCcy}->${toCcy}`);
  };

  const fmt = (n: number) =>
    `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  const handleCalculate = async () => {
    const lotsNum = parseFloat(lots);
    if (isNaN(lotsNum) || lotsNum <= 0) {
      alert("Please enter a valid position size greater than zero");
      return;
    }
    try {
      const cleanPair = normalizePair(pair);
      const { quote } = parsePair(cleanPair);
      const quoteToAccount = currency !== quote ? await convertRate(quote, currency) : 1;
      const r = computePipValue({ pair: cleanPair, lots: lotsNum, quoteToAccount });

      const conversionNote = currency !== quote ? " · live conversion applied" : "";
      setResults({
        forLots: fmt(r.forLots),
        perStandardLot: fmt(r.perStandardLot),
        perMiniLot: fmt(r.perMiniLot),
        perMicroLot: fmt(r.perMicroLot),
        context: `${lotsNum} lot${lotsNum === 1 ? "" : "s"} ${cleanPair} · account in ${currency}${conversionNote}`,
      });
      trackEvent("calculator_result", { instrument: cleanPair });
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Calculation failed");
    }
  };

  const accountCurrencyOptions = useMemo(() => ["EUR", "USD", "JPY", "CHF", "GBP"], []);

  // ── Currency combobox ────────────────────────────────────────────────────
  const [ccySearch, setCcySearch] = useState("");
  const [ccyOpen, setCcyOpen] = useState(false);
  const [ccyHighlightedIdx, setCcyHighlightedIdx] = useState(0);
  const ccyInputRef = useRef<HTMLInputElement>(null);
  const ccyDropdownRef = useRef<HTMLDivElement>(null);

  const filteredCurrencies = useMemo(() => {
    const q = ccySearch.trim().toUpperCase();
    if (!q) return accountCurrencyOptions;
    return accountCurrencyOptions.filter((c) => c.includes(q));
  }, [accountCurrencyOptions, ccySearch]);

  useEffect(() => {
    if (!ccyOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        ccyInputRef.current?.closest("[data-ccy-combo]") &&
        !ccyInputRef.current.closest("[data-ccy-combo]")!.contains(e.target as Node)
      ) { setCcyOpen(false); setCcySearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ccyOpen]);

  const selectCcy = (c: string) => { setCurrency(c); setCcyOpen(false); setCcySearch(""); setCcyHighlightedIdx(0); };

  const handleCcyKeyDown = (e: React.KeyboardEvent) => {
    if (!ccyOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setCcyOpen(true); setCcyHighlightedIdx(filteredCurrencies.indexOf(currency)); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setCcyHighlightedIdx((i) => Math.min(i + 1, filteredCurrencies.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCcyHighlightedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredCurrencies[ccyHighlightedIdx]) selectCcy(filteredCurrencies[ccyHighlightedIdx]); }
    else if (e.key === "Escape") { setCcyOpen(false); setCcySearch(""); }
  };

  // ── Pair search combobox ──────────────────────────────────────────────────
  const [pairSearch, setPairSearch] = useState("");
  const [pairOpen, setPairOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const pairInputRef = useRef<HTMLInputElement>(null);
  const pairDropdownRef = useRef<HTMLDivElement>(null);

  const filteredPairs = useMemo(() => {
    const q = pairSearch.trim().toUpperCase().replace("/", "");
    if (!q) return pairs;
    return pairs.filter((p) => p.includes(q));
  }, [pairs, pairSearch]);

  useEffect(() => {
    if (!pairOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        pairInputRef.current?.closest("[data-pair-combo]") &&
        !pairInputRef.current.closest("[data-pair-combo]")!.contains(e.target as Node)
      ) { setPairOpen(false); setPairSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pairOpen]);

  const selectPair = (p: string) => { setPair(p); setPairOpen(false); setPairSearch(""); setHighlightedIdx(0); };

  const handlePairKeyDown = (e: React.KeyboardEvent) => {
    if (!pairOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setPairOpen(true); setHighlightedIdx(filteredPairs.indexOf(pair)); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIdx((i) => Math.min(i + 1, filteredPairs.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredPairs[highlightedIdx]) selectPair(filteredPairs[highlightedIdx]); }
    else if (e.key === "Escape") { setPairOpen(false); setPairSearch(""); }
  };

  return (
    <div className={`w-full text-white ${className || ""}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_0.92fr]">
        {/* Inputs */}
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-3 sm:p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
          <div className="mb-3 sm:mb-5 flex flex-col gap-1 border-b border-white/8 pb-3 sm:pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Pip value inputs</div>
              <div className="mt-1 text-sm text-white/48">Account currency, pair, and position size</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Account currency — searchable combobox */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Account currency</div>
              <div className="relative" data-ccy-combo>
                {ccyOpen && (
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 z-10" />
                )}
                <input
                  autoComplete="off"
                  ref={ccyInputRef}
                  value={ccyOpen ? ccySearch : currency}
                  placeholder={ccyOpen ? "Search…" : ""}
                  readOnly={!ccyOpen}
                  onClick={() => { setCcyOpen(true); setCcyHighlightedIdx(filteredCurrencies.indexOf(currency)); }}
                  onChange={(e) => { setCcySearch(e.target.value); setCcyHighlightedIdx(0); }}
                  onKeyDown={handleCcyKeyDown}
                  onFocus={() => { if (!ccyOpen) { setCcyOpen(true); setCcyHighlightedIdx(filteredCurrencies.indexOf(currency)); } }}
                  className={`h-9 sm:h-11 w-full rounded-[16px] border bg-white/[0.035] text-sm text-white outline-none transition-all placeholder:text-white/30 cursor-pointer ${
                    ccyOpen ? "border-violet-400/40 bg-white/[0.05] pl-9 pr-9" : "border-white/10 pl-4 pr-9"
                  }`}
                />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {ccyOpen && ccySearch ? (
                    <button type="button" className="pointer-events-auto text-white/30 hover:text-white/60"
                      onClick={(e) => { e.stopPropagation(); setCcySearch(""); setCcyHighlightedIdx(0); ccyInputRef.current?.focus({ preventScroll: true }); }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <ChevronDown className={`h-4 w-4 text-white/38 transition-transform ${ccyOpen ? "rotate-180" : ""}`} />
                  )}
                </div>
                {ccyOpen && (
                  <div ref={ccyDropdownRef}
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[16px] border border-white/10 bg-[#0b0b10]/96 py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                    {filteredCurrencies.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-white/38">No match for &quot;{ccySearch}&quot;</div>
                    ) : (
                      filteredCurrencies.map((c, idx) => (
                        <button key={c} type="button" data-ccy-idx={idx}
                          onMouseDown={(e) => { e.preventDefault(); selectCcy(c); }}
                          onMouseEnter={() => setCcyHighlightedIdx(idx)}
                          className={`flex w-full items-center px-4 py-2 text-left text-sm font-medium transition-colors ${
                            idx === ccyHighlightedIdx ? "bg-violet-500/[0.14] text-white" : c === currency ? "text-violet-300" : "text-white/72 hover:bg-white/[0.04] hover:text-white"
                          }`}>
                          {c}
                          {c === currency && <span className="ml-auto text-[10px] text-violet-400/70">selected</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Currency pair — searchable combobox */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Currency pair</div>
              <div className="relative" data-pair-combo>
                {pairOpen && (
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 z-10" />
                )}
                <input
                  autoComplete="off"
                  ref={pairInputRef}
                  value={pairOpen ? pairSearch : pair}
                  placeholder={pairOpen ? "Search pair…" : ""}
                  readOnly={!pairOpen || loadingPairs}
                  onClick={() => { if (loadingPairs) return; setPairOpen(true); setHighlightedIdx(filteredPairs.indexOf(pair)); }}
                  onChange={(e) => { setPairSearch(e.target.value); setHighlightedIdx(0); }}
                  onKeyDown={handlePairKeyDown}
                  onFocus={() => { if (!pairOpen && !loadingPairs) { setPairOpen(true); setHighlightedIdx(filteredPairs.indexOf(pair)); } }}
                  className={`h-9 sm:h-11 w-full rounded-[16px] border bg-white/[0.035] text-sm text-white outline-none transition-all placeholder:text-white/30 ${
                    loadingPairs ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  } ${pairOpen ? "border-violet-400/40 bg-white/[0.05] pl-9 pr-9" : "border-white/10 pl-4 pr-9"}`}
                />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {pairOpen && pairSearch ? (
                    <button type="button" className="pointer-events-auto text-white/30 hover:text-white/60"
                      onClick={(e) => { e.stopPropagation(); setPairSearch(""); setHighlightedIdx(0); pairInputRef.current?.focus({ preventScroll: true }); }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <ChevronDown className={`h-4 w-4 text-white/38 transition-transform ${pairOpen ? "rotate-180" : ""}`} />
                  )}
                </div>
                {pairOpen && (
                  <div ref={pairDropdownRef}
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-[16px] border border-white/10 bg-[#0b0b10]/96 py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                    {filteredPairs.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-white/38">No pairs match &quot;{pairSearch}&quot;</div>
                    ) : (
                      filteredPairs.map((p, idx) => (
                        <button key={p} type="button" data-idx={idx}
                          onMouseDown={(e) => { e.preventDefault(); selectPair(p); }}
                          onMouseEnter={() => setHighlightedIdx(idx)}
                          className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors ${
                            idx === highlightedIdx ? "bg-violet-500/[0.14] text-white" : p === pair ? "text-violet-300" : "text-white/72 hover:bg-white/[0.04] hover:text-white"
                          }`}>
                          <span className="font-medium">{p.slice(0, 3)}</span>
                          <span className="text-white/38">/</span>
                          <span className="font-medium">{p.slice(3)}</span>
                          {p === pair && <span className="ml-auto text-[10px] text-violet-400/70">selected</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {pairsError && <div className="text-xs text-white/46">{pairsError} · using fallback pairs</div>}
            </div>

            {/* Position size */}
            <div className="flex flex-col gap-2 md:col-span-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Position size</div>
              <div className="relative">
                <input
                  autoComplete="off"
                  type="number"
                  value={lots}
                  onChange={(e) => setLots(e.target.value)}
                  placeholder="e.g. 1"
                  className="h-9 sm:h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-14 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">lots</div>
              </div>
              <div className="text-[11px] text-white/32">1 standard lot = 100,000 units (FX). Mini = 0.1, micro = 0.01.</div>
            </div>
          </div>

          <button
            onClick={handleCalculate}
            className="mt-3 sm:mt-5 inline-flex h-9 sm:h-11 w-full items-center justify-center rounded-full border border-violet-400/18 bg-violet-500/[0.10] text-sm font-medium text-white transition-all hover:border-violet-300/26 hover:bg-violet-500/[0.16]"
          >
            Calculate
          </button>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[24px] border border-violet-400/16 bg-violet-500/[0.06] p-3 sm:p-4 text-center shadow-[inset_0_0_0_1px_rgba(167,139,250,0.06)]">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Pip value</div>
            <div className="mt-1.5 text-2xl sm:text-4xl font-semibold tracking-tight text-white">
              {results ? results.forLots : "—"}
            </div>
            <div className="mt-0.5 text-xs sm:text-sm text-white/38">per pip, this position</div>
            {results && <div className="mt-1.5 text-[10px] sm:text-[11px] leading-relaxed text-white/30">{results.context}</div>}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Standard</div>
              <div className="mt-1.5 text-sm sm:text-base font-semibold text-white">{results?.perStandardLot || "—"}</div>
              <div className="mt-0.5 text-[10px] text-white/30">1.00 lot</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Mini</div>
              <div className="mt-1.5 text-sm sm:text-base font-semibold text-white">{results?.perMiniLot || "—"}</div>
              <div className="mt-0.5 text-[10px] text-white/30">0.10 lot</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Micro</div>
              <div className="mt-1.5 text-sm sm:text-base font-semibold text-white">{results?.perMicroLot || "—"}</div>
              <div className="mt-0.5 text-[10px] text-white/30">0.01 lot</div>
            </div>
          </div>
        </div>
      </div>

      {results && (
        <div className="mt-4">
          <ProCtaCard
            heading="Know your pip value. Now size the trade."
            body="IntelliTrade Pro adds support-zone quality, currency strength and event risk to your pre-trade routine."
            ctaLabel="See IntelliTrade Pro"
            href="/pro?src=pipcalc"
            ctaId="pipcalc_result"
            src="pipcalc"
          />
        </div>
      )}
    </div>
  );
}
