"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api/client";
import { trackEvent } from "@/lib/analytics";
import { ProCtaCard } from "@/components/pro/ProCtaCard";
import {
  composePairsFrom,
  computePipValue,
  contractSizeFor,
  normalizePair,
  parsePair,
  rateFromUsdRates,
} from "@/lib/lot-size";
import { loadCalculatorState } from "@/lib/calculator-storage";
import type { AccountTemplate } from "@/lib/calculator-templates";
import { SearchCombobox } from "./SearchCombobox";
import { TemplateSelectBar } from "./TemplateSelectBar";

// Same supported-codes source and rate orientation as the lot size calculator;
// this tool only differs in inputs (pair + position size) and outputs (pip
// value per standard/mini/micro lot). The currency/pair comboboxes are the
// shared SearchCombobox so all calculators feel identical.
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

  // Per-instrument broker contract sizes: seeded from the lot size calculator's
  // saved MT4/MT5 overrides (free, localStorage), then extended by an applied
  // Pro account template. Editing lives on the lot size calculator.
  const [contractOverrides, setContractOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    const saved = loadCalculatorState();
    if (!saved) return;
    const out: Record<string, number> = {};
    for (const [key, o] of Object.entries(saved.brokerOverrides)) {
      const n = Number(o.contractSize);
      if (o.contractSize !== undefined && isFinite(n) && n > 0) out[key] = n;
    }
    if (Object.keys(out).length > 0) setContractOverrides((prev) => ({ ...out, ...prev }));
  }, []);

  const applyTemplate = (t: AccountTemplate) => {
    setCurrency(t.currency);
    setContractOverrides((prev) => {
      const next = { ...prev };
      for (const [key, o] of Object.entries(t.instrumentOverrides)) next[key] = o.contractSize;
      return next;
    });
  };

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

  const cleanPair = normalizePair(pair);

  const handleCalculate = async () => {
    const lotsNum = parseFloat(lots);
    if (isNaN(lotsNum) || lotsNum <= 0) {
      alert("Please enter a valid position size greater than zero");
      return;
    }
    try {
      const { quote } = parsePair(cleanPair);
      const quoteToAccount = currency !== quote ? await convertRate(quote, currency) : 1;
      const contractSize = contractOverrides[cleanPair];
      const r = computePipValue({ pair: cleanPair, lots: lotsNum, quoteToAccount, contractSize });

      const conversionNote = currency !== quote ? " · live conversion applied" : "";
      const contractNote =
        contractSize !== undefined && contractSize !== contractSizeFor(cleanPair)
          ? ` · contract size ${contractSize.toLocaleString("en-US")}`
          : "";
      setResults({
        forLots: fmt(r.forLots),
        perStandardLot: fmt(r.perStandardLot),
        perMiniLot: fmt(r.perMiniLot),
        perMicroLot: fmt(r.perMicroLot),
        context: `${lotsNum} lot${lotsNum === 1 ? "" : "s"} ${cleanPair} · account in ${currency}${contractNote}${conversionNote}`,
      });
      trackEvent("calculator_result", { instrument: cleanPair });
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Calculation failed");
    }
  };

  const accountCurrencyOptions = useMemo(() => ["EUR", "USD", "JPY", "CHF", "GBP"], []);

  // Non-standard contract size in effect for the selected pair, if any.
  const overrideInEffect =
    contractOverrides[cleanPair] !== undefined && contractOverrides[cleanPair] !== contractSizeFor(cleanPair)
      ? contractOverrides[cleanPair]
      : null;

  const clearOverride = () => {
    setContractOverrides((prev) => {
      const next = { ...prev };
      delete next[cleanPair];
      return next;
    });
  };

  return (
    <div className={`w-full text-white ${className || ""}`}>
      <TemplateSelectBar onApply={applyTemplate} proSrc="pipcalc-templates" />
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
              <SearchCombobox
                variant="currency"
                value={currency}
                options={accountCurrencyOptions}
                onSelect={setCurrency}
                heightClass="h-9 sm:h-11"
              />
            </div>

            {/* Currency pair — searchable combobox */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Currency pair</div>
              <SearchCombobox
                variant="pair"
                value={pair}
                options={pairs}
                onSelect={setPair}
                disabled={loadingPairs}
                heightClass="h-9 sm:h-11"
              />
              {pairsError && <div className="text-xs text-white/46">{pairsError} · using fallback pairs</div>}
              {overrideInEffect !== null && (
                <div className="text-[11px] text-white/32">
                  Contract size {overrideInEffect.toLocaleString("en-US")} per lot (your broker setting) ·{" "}
                  <button
                    type="button"
                    onClick={clearOverride}
                    className="text-violet-300/80 underline-offset-2 hover:underline"
                  >
                    use standard
                  </button>
                </div>
              )}
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
