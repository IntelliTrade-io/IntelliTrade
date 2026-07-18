"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, X, AlertTriangle, RotateCcw } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { trackEvent } from "@/lib/analytics";
import { ProCtaCard } from "@/components/pro/ProCtaCard";
// Domain math (pip/contract sizes, pair composition, rate orientation, exact
// and broker-ready lot sizing) lives in lib/lot-size.ts since plan 5.5.
import {
  composePairsFrom,
  computePositionSize,
  defaultBrokerSettingsFor,
  formatLots,
  formatUnits,
  normalizePair,
  parsePair,
  pipSizeFor,
  rateFromUsdRates,
  type PositionSizeResult,
  type StopInput,
} from "@/lib/lot-size";
import {
  DEFAULT_CALCULATOR_STATE,
  clearCalculatorState,
  loadCalculatorState,
  saveCalculatorState,
  type StopMode,
  type StoredBrokerOverride,
} from "@/lib/calculator-storage";
import { AccountTemplateBar } from "./AccountTemplateBar";
import type { AccountTemplate } from "@/lib/calculator-templates";

// ---------- Dynamic pairs ----------
// We pull supported currency codes from CurrencyFreaks' public endpoint (no API key).
const CF_SUPPORTED_URL = "https://api.currencyfreaks.com/v2.0/supported-currencies";

interface LotSizeCalculatorProps {
  className?: string;
  /**
   * Pre-select this pair on first render (used by the per-pair SEO pages, e.g.
   * /lotsizecalculator/xauusd). Overrides only the pair field; every other saved
   * input (balance, risk, broker overrides) still restores normally. Must be a
   * symbol composePairsFrom can produce, or it falls back to EURUSD once the live
   * pair list loads.
   */
  initialPair?: string;
}

const fmtMoney = (x: number) =>
  x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (x: number) => `${x.toFixed(2)}%`;
const fmtPips = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });

// ---------- Component ----------
export default function LotSizeCalculator({ className, initialPair }: LotSizeCalculatorProps) {
  const [currency, setCurrencyRaw] = useState("EUR"); // account currency
  const [pair, setPairRaw] = useState(initialPair ? normalizePair(initialPair) : "EURUSD");
  const [balance, setBalance] = useState("");
  const [riskPercent, setRiskPercent] = useState("");

  // Stop input: distance in pips, or entry + stop-loss prices.
  const [stopMode, setStopMode] = useState<StopMode>("pips");
  const [stopLoss, setStopLoss] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");

  // Broker contract settings (MT4/MT5), per instrument. Collapsed by default.
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [brokerOverrides, setBrokerOverrides] = useState<Record<string, StoredBrokerOverride>>({});

  const [result, setResult] = useState<PositionSizeResult | null>(null);
  const [resultCurrency, setResultCurrency] = useState("EUR");
  const [calcContext, setCalcContext] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Free persistence + Pro template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [allowAutoDefault, setAllowAutoDefault] = useState(false);
  const [pendingAutoCalc, setPendingAutoCalc] = useState(false);

  // Any input change invalidates the displayed result so a stale number never
  // sits next to fresh inputs.
  const invalidate = () => {
    setResult(null);
    setErrorMsg(null);
  };
  const setCurrency = (v: string) => {
    setCurrencyRaw(v);
    invalidate();
  };
  const setPair = (v: string) => {
    setPairRaw(v);
    invalidate();
  };

  // dynamic pairs state
  const [pairs, setPairs] = useState<string[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [pairsError, setPairsError] = useState<string | null>(null);

  // ── restore persisted inputs (client-only; initial render uses defaults so
  // SSR markup matches and there are no hydration errors) ───────────────────
  useEffect(() => {
    const saved = loadCalculatorState();
    if (saved) {
      setCurrencyRaw(saved.currency);
      // On a per-pair page the URL pair wins over the persisted one; all other
      // saved inputs still restore.
      setPairRaw(initialPair ? normalizePair(initialPair) : saved.pair);
      setBalance(saved.balance);
      setRiskPercent(saved.riskPercent);
      setStopMode(saved.stopMode);
      setStopLoss(saved.stopLossPips);
      setEntryPrice(saved.entryPrice);
      setStopLossPrice(saved.stopLossPrice);
      setBrokerOpen(saved.brokerSettingsOpen);
      setBrokerOverrides(saved.brokerOverrides);
      setSelectedTemplateId(saved.selectedTemplateId);
      setPendingAutoCalc(true); // recalculate with a fresh conversion rate
    }
    setAllowAutoDefault(!saved || (saved.balance === "" && !saved.selectedTemplateId));
    setRestored(true);
    // initialPair is a stable route param; listed to satisfy exhaustive-deps but
    // never actually changes for a mounted page.
  }, [initialPair]);

  // ── persist inputs (never results or exchange rates), debounced ───────────
  useEffect(() => {
    if (!restored) return;
    const handle = setTimeout(() => {
      saveCalculatorState({
        version: 1,
        currency,
        pair,
        balance,
        riskPercent,
        stopMode,
        stopLossPips: stopLoss,
        entryPrice,
        stopLossPrice,
        brokerSettingsOpen: brokerOpen,
        brokerOverrides,
        selectedTemplateId,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [
    restored,
    currency,
    pair,
    balance,
    riskPercent,
    stopMode,
    stopLoss,
    entryPrice,
    stopLossPrice,
    brokerOpen,
    brokerOverrides,
    selectedTemplateId,
  ]);

  // Load available codes and compose pairs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPairs(true);
        setPairsError(null);
        const data = await apiGet<{ supportedCurrenciesMap?: Record<string, unknown> }>(CF_SUPPORTED_URL);
        const map = (data?.supportedCurrenciesMap || {}) as Record<string, unknown>;
        const codes = new Set(Object.keys(map));
        // Ensure USD is in the set; if the endpoint ever omits it, add defensively
        codes.add("USD");
        const composed = composePairsFrom(codes);
        if (!cancelled) {
          setPairs(composed);
          // If current selected pair isn't available, pick a sensible default
          setPairRaw((current) =>
            composed.includes(current) ? current : composed.includes("EURUSD") ? "EURUSD" : composed[0] || "EURUSD",
          );
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setPairsError(e instanceof Error ? e.message : "Could not load pairs");
          // still provide a minimal fallback so the UI is usable
          setPairs([
            "EURUSD",
            "GBPUSD",
            "USDJPY",
            "AUDUSD",
            "USDCAD",
            "USDCHF",
            "NZDUSD",
            "EURGBP",
            "EURJPY",
            "GBPJPY",
            "XAUUSD",
            "XAGUSD",
            "BTCUSD",
            "ETHUSD",
          ]);
        }
      } finally {
        if (!cancelled) setLoadingPairs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Returns BASEQUOTE (quote per base) via the server rates proxy (USD base)
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

  /**
   * Convert an amount in `fromCcy` to `toCcy`.
   * Uses fetchExchangeRate("FROMTO") when available; if not, tries inverse and inverts.
   * fetchExchangeRate returns quote per base.
   */
  const convertRate = async (fromCcy: string, toCcy: string) => {
    if (fromCcy === toCcy) return 1;

    // CORRECT ORIENTATION: try FROM->TO first (no inversion needed)
    const direct = await fetchExchangeRate(`${fromCcy}${toCcy}`);
    if (direct && Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    // Fallback to inverse: TO->FROM, then invert
    const inverse = await fetchExchangeRate(`${toCcy}${fromCcy}`);
    if (inverse && Number.isFinite(inverse) && inverse > 0) {
      return 1 / inverse;
    }

    throw new Error(`No FX conversion available for ${fromCcy}->${toCcy}`);
  };

  // ── broker settings for the current instrument ────────────────────────────
  const cleanPair = normalizePair(pair);
  const instrumentDefaults = defaultBrokerSettingsFor(cleanPair);
  const currentOverride = brokerOverrides[cleanPair] ?? {};
  const hasOverride = Object.keys(currentOverride).length > 0;

  const brokerFieldValue = (key: keyof StoredBrokerOverride, fallback: number) =>
    currentOverride[key] ?? String(fallback);

  const setBrokerField = (key: keyof StoredBrokerOverride, value: string) => {
    setBrokerOverrides((prev) => {
      const entry = { ...(prev[cleanPair] ?? {}) };
      const fallback = String(instrumentDefaults[key]);
      if (value.trim() === "" || value === fallback) delete entry[key];
      else entry[key] = value;
      const next = { ...prev };
      if (Object.keys(entry).length === 0) delete next[cleanPair];
      else next[cleanPair] = entry;
      return next;
    });
    invalidate();
  };

  const restoreInstrumentDefaults = () => {
    setBrokerOverrides((prev) => {
      const next = { ...prev };
      delete next[cleanPair];
      return next;
    });
    invalidate();
  };

  const parseBrokerField = (key: keyof StoredBrokerOverride, fallback: number, label: string): number => {
    const raw = currentOverride[key];
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!isFinite(n) || n <= 0) throw new Error(`${label} must be a positive number.`);
    return n;
  };

  // ── validation + calculation ──────────────────────────────────────────────
  const buildStopInput = (): StopInput => {
    if (stopMode === "pips") {
      const pips = parseFloat(stopLoss);
      if (isNaN(pips) || pips <= 0) throw new Error("Enter a stop distance greater than zero pips.");
      return { mode: "pips", pips };
    }
    const entry = parseFloat(entryPrice);
    const sl = parseFloat(stopLossPrice);
    if (isNaN(entry) || entry <= 0) throw new Error("Enter a valid entry price.");
    if (isNaN(sl) || sl <= 0) throw new Error("Enter a valid stop-loss price.");
    if (entry === sl) throw new Error("Entry price and stop-loss price cannot be identical.");
    return { mode: "price", entryPrice: entry, stopLossPrice: sl };
  };

  const handleCalculate = async (opts?: { silent?: boolean }) => {
    const balanceNum = parseFloat(balance);
    const riskPercentNum = parseFloat(riskPercent);

    try {
      if (isNaN(balanceNum) || balanceNum <= 0) throw new Error("Enter an account balance greater than zero.");
      if (isNaN(riskPercentNum) || riskPercentNum <= 0)
        throw new Error("Enter a risk percentage greater than zero.");

      const stop = buildStopInput();
      const broker = {
        contractSize: parseBrokerField("contractSize", instrumentDefaults.contractSize, "Contract size"),
        minLot: parseBrokerField("minLot", instrumentDefaults.minLot, "Minimum lot"),
        lotStep: parseBrokerField("lotStep", instrumentDefaults.lotStep, "Lot step"),
      };

      const { quote } = parsePair(cleanPair);
      setCalculating(true);

      // Resolve the quote -> account conversion (always freshly fetched; a
      // conversion rate is never persisted or reused), then run the pure math.
      const quoteToAccount = currency !== quote ? await convertRate(quote, currency) : 1;
      const computed = computePositionSize({
        balance: balanceNum,
        riskPercent: riskPercentNum,
        pair: cleanPair,
        quoteToAccount,
        stop,
        broker,
      });

      setResult(computed);
      setResultCurrency(currency);
      setErrorMsg(null);
      const stopSummary =
        stop.mode === "pips"
          ? `${fmtPips(computed.stopDistancePips)} pip stop`
          : `entry ${entryPrice} / stop ${stopLossPrice}`;
      const conversionNote = currency !== quote ? " · live conversion applied" : "";
      setCalcContext(
        `${balanceNum.toLocaleString()} ${currency} balance · ${riskPercentNum}% risk · ${stopSummary} · ${cleanPair}${conversionNote}`,
      );
      // Funnel: a successful calculation is the high-intent moment. Only the
      // instrument is recorded — no balance/risk (no PII or financial data).
      trackEvent("calculator_result", { instrument: cleanPair });
    } catch (e: unknown) {
      setResult(null);
      if (!opts?.silent) {
        setErrorMsg(e instanceof Error ? e.message : "Calculation failed");
      }
    } finally {
      setCalculating(false);
    }
  };

  // Auto-recalculate after restoring saved inputs or applying a template. Runs
  // one render after the state batch so the closure reads the updated values.
  useEffect(() => {
    if (!pendingAutoCalc) return;
    setPendingAutoCalc(false);
    void handleCalculate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoCalc]);

  // ── Pro templates ─────────────────────────────────────────────────────────
  const applyTemplate = (t: AccountTemplate) => {
    setBalance(String(t.balance));
    setCurrencyRaw(t.currency);
    setRiskPercent(String(t.riskPercent));
    // Merge the template's per-instrument overrides (as raw field strings).
    // Trade-specific entry, stop and pip-distance inputs are left untouched.
    setBrokerOverrides((prev) => {
      const next = { ...prev };
      for (const [key, o] of Object.entries(t.instrumentOverrides)) {
        next[key] = {
          contractSize: String(o.contractSize),
          minLot: String(o.minLot),
          lotStep: String(o.lotStep),
        };
      }
      return next;
    });
    setPendingAutoCalc(true); // fresh calculation with a fresh conversion rate
  };

  const resetToDefaults = () => {
    clearCalculatorState();
    const d = DEFAULT_CALCULATOR_STATE;
    setCurrencyRaw(d.currency);
    setPairRaw(d.pair);
    setBalance(d.balance);
    setRiskPercent(d.riskPercent);
    setStopMode(d.stopMode);
    setStopLoss(d.stopLossPips);
    setEntryPrice(d.entryPrice);
    setStopLossPrice(d.stopLossPrice);
    setBrokerOpen(d.brokerSettingsOpen);
    setBrokerOverrides(d.brokerOverrides);
    setSelectedTemplateId(d.selectedTemplateId);
    setResult(null);
    setErrorMsg(null);
    setCalcContext("");
  };

  const accountCurrencyOptions = useMemo(() => ["EUR", "USD", "JPY", "CHF", "GBP"], []);

  // Derived stop-distance preview for price mode (display only)
  const pricePreview = useMemo(() => {
    if (stopMode !== "price") return null;
    const entry = parseFloat(entryPrice);
    const sl = parseFloat(stopLossPrice);
    if (isNaN(entry) || isNaN(sl) || entry <= 0 || sl <= 0 || entry === sl) return null;
    const distance = Math.abs(entry - sl);
    const pips = distance / pipSizeFor(cleanPair);
    let quote = "";
    try {
      quote = parsePair(cleanPair).quote;
    } catch {
      // non-6-letter symbol; omit the currency label
    }
    return `Price distance: ${fmtMoney(distance)} ${quote} · ${fmtPips(pips)} pips`;
  }, [stopMode, entryPrice, stopLossPrice, cleanPair]);

  const isMetal = cleanPair.startsWith("XAU") || cleanPair.startsWith("XAG");

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
      ) {
        setCcyOpen(false);
        setCcySearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ccyOpen]);

  const selectCcy = (c: string) => {
    setCurrency(c);
    setCcyOpen(false);
    setCcySearch("");
    setCcyHighlightedIdx(0);
  };

  const handleCcyKeyDown = (e: React.KeyboardEvent) => {
    if (!ccyOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setCcyOpen(true);
        setCcyHighlightedIdx(filteredCurrencies.indexOf(currency));
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCcyHighlightedIdx((i) => Math.min(i + 1, filteredCurrencies.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCcyHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCurrencies[ccyHighlightedIdx]) selectCcy(filteredCurrencies[ccyHighlightedIdx]);
    } else if (e.key === "Escape") {
      setCcyOpen(false);
      setCcySearch("");
    }
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

  // Close on outside click
  useEffect(() => {
    if (!pairOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        pairInputRef.current?.closest("[data-pair-combo]") &&
        !pairInputRef.current.closest("[data-pair-combo]")!.contains(e.target as Node)
      ) {
        setPairOpen(false);
        setPairSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pairOpen]);

  const selectPair = (p: string) => {
    setPair(p);
    setPairOpen(false);
    setPairSearch("");
    setHighlightedIdx(0);
  };

  const handlePairKeyDown = (e: React.KeyboardEvent) => {
    if (!pairOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setPairOpen(true);
        setHighlightedIdx(filteredPairs.indexOf(pair));
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, filteredPairs.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredPairs[highlightedIdx]) selectPair(filteredPairs[highlightedIdx]);
    } else if (e.key === "Escape") {
      setPairOpen(false);
      setPairSearch("");
    }
  };

  const inputClass =
    "min-h-[44px] w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05] motion-reduce:transition-none";
  const labelClass = "text-[11px] uppercase tracking-[0.18em] text-white/46";
  const modeButtonClass = (active: boolean) =>
    `inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[14px] border px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${
      active
        ? "border-violet-400/40 bg-violet-500/[0.14] text-white"
        : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white"
    }`;

  const showBrokerDetail = result && !result.belowMinimum && !result.exactIsExecutable;

  return (
    <div className={`w-full text-white ${className || ""}`}>
      <AccountTemplateBar
        balance={balance}
        currency={currency}
        riskPercent={riskPercent}
        pair={cleanPair}
        overrides={brokerOverrides}
        selectedTemplateId={selectedTemplateId}
        onApply={applyTemplate}
        onSelectionChange={setSelectedTemplateId}
        allowAutoDefault={allowAutoDefault}
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_0.92fr]">
        {/* Inputs */}
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-3 sm:p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
          <div className="mb-3 sm:mb-5 flex flex-col gap-1 border-b border-white/8 pb-3 sm:pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Position inputs</div>
              <div className="mt-1 text-sm text-white/48">Account, pair, stop, and risk settings</div>
            </div>
            <button
              type="button"
              onClick={resetToDefaults}
              className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-xs text-white/40 transition-colors hover:text-white/70 sm:self-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset to defaults
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Account currency — searchable combobox */}
            <div className="flex flex-col gap-2">
              <label htmlFor="lotcalc-currency" className={labelClass}>
                Account currency
              </label>
              <div className="relative" data-ccy-combo>
                {/* Left search icon */}
                {ccyOpen && (
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 z-10" />
                )}
                {/* Input */}
                <input
                  id="lotcalc-currency"
                  ref={ccyInputRef}
                  value={ccyOpen ? ccySearch : currency}
                  placeholder={ccyOpen ? "Search…" : ""}
                  readOnly={!ccyOpen}
                  role="combobox"
                  aria-expanded={ccyOpen}
                  aria-controls="lotcalc-currency-listbox"
                  onClick={() => {
                    setCcyOpen(true);
                    setCcyHighlightedIdx(filteredCurrencies.indexOf(currency));
                  }}
                  onChange={(e) => { setCcySearch(e.target.value); setCcyHighlightedIdx(0); }}
                  onKeyDown={handleCcyKeyDown}
                  onFocus={() => {
                    if (!ccyOpen) {
                      setCcyOpen(true);
                      setCcyHighlightedIdx(filteredCurrencies.indexOf(currency));
                    }
                  }}
                  className={`min-h-[44px] w-full rounded-[16px] border bg-white/[0.035] text-sm text-white outline-none transition-all placeholder:text-white/30 cursor-pointer motion-reduce:transition-none ${
                    ccyOpen ? "border-violet-400/40 bg-white/[0.05] pl-9 pr-9" : "border-white/10 pl-4 pr-9"
                  }`}
                />
                {/* Right icon */}
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {ccyOpen && ccySearch ? (
                    <button
                      type="button"
                      aria-label="Clear search"
                      className="pointer-events-auto text-white/30 hover:text-white/60"
                      onClick={(e) => { e.stopPropagation(); setCcySearch(""); setCcyHighlightedIdx(0); ccyInputRef.current?.focus({ preventScroll: true }); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <ChevronDown className={`h-4 w-4 text-white/38 transition-transform motion-reduce:transition-none ${ccyOpen ? "rotate-180" : ""}`} />
                  )}
                </div>

                {ccyOpen && (
                  <div
                    ref={ccyDropdownRef}
                    id="lotcalc-currency-listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[16px] border border-white/10 bg-[#0b0b10]/96 py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
                  >
                    {filteredCurrencies.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-white/38">No match for &quot;{ccySearch}&quot;</div>
                    ) : (
                      filteredCurrencies.map((c, idx) => (
                        <button
                          key={c}
                          type="button"
                          data-ccy-idx={idx}
                          onMouseDown={(e) => { e.preventDefault(); selectCcy(c); }}
                          onMouseEnter={() => setCcyHighlightedIdx(idx)}
                          className={`flex w-full items-center px-4 py-2 text-left text-sm font-medium transition-colors motion-reduce:transition-none ${
                            idx === ccyHighlightedIdx
                              ? "bg-violet-500/[0.14] text-white"
                              : c === currency
                              ? "text-violet-300"
                              : "text-white/72 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          {c}
                          {c === currency && (
                            <span className="ml-auto text-[10px] text-violet-400/70">selected</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Currency pair — searchable combobox */}
            <div className="flex flex-col gap-2">
              <label htmlFor="lotcalc-pair" className={labelClass}>
                Currency pair
              </label>
              <div className="relative" data-pair-combo>
                {/* Left search icon */}
                {pairOpen && (
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 z-10" />
                )}
                {/* Input */}
                <input
                  id="lotcalc-pair"
                  ref={pairInputRef}
                  value={pairOpen ? pairSearch : pair}
                  placeholder={pairOpen ? "Search pair…" : ""}
                  readOnly={!pairOpen || loadingPairs}
                  role="combobox"
                  aria-expanded={pairOpen}
                  aria-controls="lotcalc-pair-listbox"
                  onClick={() => {
                    if (loadingPairs) return;
                    setPairOpen(true);
                    setHighlightedIdx(filteredPairs.indexOf(pair));
                  }}
                  onChange={(e) => { setPairSearch(e.target.value); setHighlightedIdx(0); }}
                  onKeyDown={handlePairKeyDown}
                  onFocus={() => {
                    if (!pairOpen && !loadingPairs) {
                      setPairOpen(true);
                      setHighlightedIdx(filteredPairs.indexOf(pair));
                    }
                  }}
                  className={`min-h-[44px] w-full rounded-[16px] border bg-white/[0.035] text-sm text-white outline-none transition-all placeholder:text-white/30 motion-reduce:transition-none ${
                    loadingPairs ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  } ${pairOpen ? "border-violet-400/40 bg-white/[0.05] pl-9 pr-9" : "border-white/10 pl-4 pr-9"}`}
                />
                {/* Right icon */}
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {pairOpen && pairSearch ? (
                    <button
                      type="button"
                      aria-label="Clear search"
                      className="pointer-events-auto text-white/30 hover:text-white/60"
                      onClick={(e) => { e.stopPropagation(); setPairSearch(""); setHighlightedIdx(0); pairInputRef.current?.focus({ preventScroll: true }); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <ChevronDown className={`h-4 w-4 text-white/38 transition-transform motion-reduce:transition-none ${pairOpen ? "rotate-180" : ""}`} />
                  )}
                </div>

                {/* Dropdown */}
                {pairOpen && (
                  <div
                    ref={pairDropdownRef}
                    id="lotcalc-pair-listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-[16px] border border-white/10 bg-[#0b0b10]/96 py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
                  >
                    {filteredPairs.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-white/38">No pairs match &quot;{pairSearch}&quot;</div>
                    ) : (
                      filteredPairs.map((p, idx) => (
                        <button
                          key={p}
                          type="button"
                          data-idx={idx}
                          onMouseDown={(e) => { e.preventDefault(); selectPair(p); }}
                          onMouseEnter={() => setHighlightedIdx(idx)}
                          className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors motion-reduce:transition-none ${
                            idx === highlightedIdx
                              ? "bg-violet-500/[0.14] text-white"
                              : p === pair
                              ? "text-violet-300"
                              : "text-white/72 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          <span className="font-medium">{p.slice(0, 3)}</span>
                          <span className="text-white/38">/</span>
                          <span className="font-medium">{p.slice(3)}</span>
                          {p === pair && (
                            <span className="ml-auto text-[10px] text-violet-400/70">selected</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {pairsError && <div className="text-xs text-white/46">{pairsError} · using fallback pairs</div>}
            </div>

            {/* Account balance */}
            <div className="flex flex-col gap-2">
              <label htmlFor="lotcalc-balance" className={labelClass}>
                Account balance
              </label>
              <div className="relative">
                <input
                  id="lotcalc-balance"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={balance}
                  onChange={(e) => { setBalance(e.target.value); invalidate(); }}
                  placeholder="e.g. 5000"
                  className={`${inputClass} pr-14`}
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">{currency}</div>
              </div>
            </div>

            {/* Risk % */}
            <div className="flex flex-col gap-2">
              <label htmlFor="lotcalc-risk" className={labelClass}>
                Risk per trade
              </label>
              <div className="relative">
                <input
                  id="lotcalc-risk"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={riskPercent}
                  onChange={(e) => { setRiskPercent(e.target.value); invalidate(); }}
                  placeholder="e.g. 1"
                  className={`${inputClass} pr-10`}
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">%</div>
              </div>
            </div>

            {/* Stop input mode */}
            <div className="flex flex-col gap-2 md:col-span-2">
              <div className={labelClass} id="lotcalc-stopmode-label">
                Stop input
              </div>
              <div role="group" aria-labelledby="lotcalc-stopmode-label" className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={stopMode === "pips"}
                  onClick={() => { setStopMode("pips"); invalidate(); }}
                  className={modeButtonClass(stopMode === "pips")}
                >
                  Stop distance (pips)
                </button>
                <button
                  type="button"
                  aria-pressed={stopMode === "price"}
                  onClick={() => { setStopMode("price"); invalidate(); }}
                  className={modeButtonClass(stopMode === "price")}
                >
                  Entry and stop prices
                </button>
              </div>
            </div>

            {stopMode === "pips" ? (
              <div className="flex flex-col gap-2 md:col-span-2">
                <label htmlFor="lotcalc-stoploss" className={labelClass}>
                  Stop loss distance
                </label>
                <div className="relative">
                  <input
                    id="lotcalc-stoploss"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={stopLoss}
                    onChange={(e) => { setStopLoss(e.target.value); invalidate(); }}
                    placeholder="e.g. 30"
                    className={`${inputClass} pr-14`}
                  />
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">pips</div>
                </div>
                {isMetal && (
                  <p className="text-[11px] leading-relaxed text-white/38">
                    Metals pip convention here: 1 pip = $0.01, so a $2.00 price move equals 200 pips.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <label htmlFor="lotcalc-entry" className={labelClass}>
                    Entry price
                  </label>
                  <input
                    id="lotcalc-entry"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={entryPrice}
                    onChange={(e) => { setEntryPrice(e.target.value); invalidate(); }}
                    placeholder="e.g. 3350.00"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="lotcalc-slprice" className={labelClass}>
                    Stop-loss price
                  </label>
                  <input
                    id="lotcalc-slprice"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={stopLossPrice}
                    onChange={(e) => { setStopLossPrice(e.target.value); invalidate(); }}
                    placeholder="e.g. 3290.00"
                    className={inputClass}
                  />
                </div>
                {pricePreview && (
                  <p className="md:col-span-2 text-[12px] text-white/48" aria-live="polite">
                    {pricePreview}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Broker contract settings (MT4/MT5) — collapsed by default */}
          <div className="mt-3 rounded-[16px] border border-white/8 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setBrokerOpen((o) => !o)}
              aria-expanded={brokerOpen}
              aria-controls="lotcalc-broker-panel"
              className="flex min-h-[44px] w-full items-center justify-between px-4 text-left"
            >
              <span className="text-[12px] font-medium text-white/70">
                Broker contract settings (MT4/MT5)
                {hasOverride && (
                  <span className="ml-2 rounded-full border border-violet-400/25 bg-violet-500/[0.10] px-2 py-0.5 text-[10px] text-violet-200/90">
                    custom
                  </span>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-white/38 transition-transform motion-reduce:transition-none ${brokerOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {brokerOpen && (
              <div id="lotcalc-broker-panel" className="border-t border-white/8 px-4 pb-4 pt-3">
                <p className="mb-3 text-[11px] leading-relaxed text-white/40">
                  Brokers can define {cleanPair} differently. You can find these values in MT4/MT5 by
                  right-clicking the symbol and opening Specification. Settings apply to {cleanPair} only.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="lotcalc-contract" className={labelClass}>
                      Contract size
                    </label>
                    <input
                      id="lotcalc-contract"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={brokerFieldValue("contractSize", instrumentDefaults.contractSize)}
                      onChange={(e) => setBrokerField("contractSize", e.target.value)}
                      aria-describedby="lotcalc-contract-hint"
                      className={inputClass}
                    />
                    <span id="lotcalc-contract-hint" className="text-[10px] text-white/32">
                      Units per 1.00 lot
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="lotcalc-minlot" className={labelClass}>
                      Minimum lot
                    </label>
                    <input
                      id="lotcalc-minlot"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={brokerFieldValue("minLot", instrumentDefaults.minLot)}
                      onChange={(e) => setBrokerField("minLot", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="lotcalc-lotstep" className={labelClass}>
                      Lot step
                    </label>
                    <input
                      id="lotcalc-lotstep"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={brokerFieldValue("lotStep", instrumentDefaults.lotStep)}
                      onChange={(e) => setBrokerField("lotStep", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={restoreInstrumentDefaults}
                  disabled={!hasOverride}
                  className="mt-3 inline-flex min-h-[44px] items-center text-xs text-white/45 transition-colors hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Restore standard instrument defaults
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => void handleCalculate()}
            disabled={calculating}
            className="mt-3 sm:mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-violet-400/18 bg-violet-500/[0.10] text-sm font-medium text-white transition-all hover:border-violet-300/26 hover:bg-violet-500/[0.16] disabled:opacity-60 motion-reduce:transition-none"
          >
            {calculating ? "Calculating…" : "Calculate"}
          </button>

          {errorMsg && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-200/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {errorMsg}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-2 sm:gap-3" aria-live="polite">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[24px] border border-violet-400/16 bg-violet-500/[0.06] p-3 sm:p-4 text-center shadow-[inset_0_0_0_1px_rgba(167,139,250,0.06)]">
            {!result ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Position size</div>
                <div className="mt-1.5 text-2xl sm:text-4xl font-semibold tracking-tight text-white">—</div>
                <div className="mt-0.5 text-xs sm:text-sm text-white/38">lots</div>
              </>
            ) : result.belowMinimum ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Exact calculated size</div>
                <div className="mt-1.5 text-2xl sm:text-4xl font-semibold tracking-tight text-white">
                  {formatLots(result.exactLots)}
                </div>
                <div className="mt-0.5 text-xs sm:text-sm text-white/38">
                  lots · {formatUnits(result.exactUnits)} {result.unitLabel}
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  {result.exactIsExecutable ? "Position size" : "Broker-ready position"}
                </div>
                <div className="mt-1.5 text-2xl sm:text-4xl font-semibold tracking-tight text-white">
                  {formatLots(result.brokerLots!)}
                </div>
                <div className="mt-0.5 text-xs sm:text-sm text-white/38">
                  lots · {formatUnits(result.brokerUnits!)} {result.unitLabel}
                </div>
              </>
            )}
            {result && calcContext && (
              <div className="mt-1.5 text-[10px] sm:text-[11px] leading-relaxed text-white/30">{calcContext}</div>
            )}
          </div>

          {/* Below-minimum state */}
          {result?.belowMinimum && (
            <div
              role="status"
              className="rounded-[22px] border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[12px] leading-relaxed text-amber-100/90"
            >
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Below broker minimum
              </p>
              <p className="mt-1">
                The calculated size is below your broker&apos;s minimum of {formatLots(result.minLot)} lots.
                Trading the minimum lot would risk {fmtMoney(result.minLotRisk)} {resultCurrency} (
                {fmtPct(result.minLotRiskPercent)}), which exceeds your selected risk of{" "}
                {fmtMoney(result.targetRisk)} {resultCurrency}. No broker-valid position fits within the
                selected target risk.
              </p>
            </div>
          )}

          {result && !result.belowMinimum && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Actual risk</div>
                <div className="mt-1.5 text-base sm:text-lg font-semibold text-white">
                  {fmtMoney(result.actualRisk!)} {resultCurrency}
                </div>
                <div className="text-[11px] text-white/40">{fmtPct(result.actualRiskPercent!)} of balance</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Target risk</div>
                <div className="mt-1.5 text-base sm:text-lg font-semibold text-white">
                  {fmtMoney(result.targetRisk)} {resultCurrency}
                </div>
                <div className="text-[11px] text-white/40">{fmtPct(parseFloat(riskPercent) || 0)} of balance</div>
              </div>
            </div>
          )}

          {/* Exact vs broker-ready detail — only when they differ */}
          {showBrokerDetail && (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-relaxed text-white/60">
              <dl className="space-y-1">
                <div className="flex justify-between gap-3">
                  <dt>Exact calculated size</dt>
                  <dd className="text-white">
                    {formatLots(result.exactLots)} lots · {formatUnits(result.exactUnits)} {result.unitLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Next valid position</dt>
                  <dd className="text-white">
                    {formatLots(result.nextLots)} lots · {fmtMoney(result.nextRisk)} {resultCurrency} (
                    {fmtPct(result.nextRiskPercent)})
                  </dd>
                </div>
              </dl>
              {result.nextExceedsTarget && (
                <p className="mt-2 flex items-start gap-1.5 text-amber-200/85">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {formatLots(result.nextLots)} lots would risk more than your {fmtMoney(result.targetRisk)}{" "}
                  {resultCurrency} target. The broker-ready size stays one step below it.
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Pip value / lot</div>
                <div className="mt-1.5 text-base sm:text-lg font-semibold text-white">
                  {fmtMoney(result.pipValuePerLot)} {resultCurrency}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Stop distance</div>
                <div className="mt-1.5 text-base sm:text-lg font-semibold text-white">
                  {fmtPips(result.stopDistancePips)} pips
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post-result CTA — highest-intent moment on the free calculator. */}
      {result && (
        <div className="mt-4">
          <ProCtaCard
            heading="Position sized. Now check the context."
            body="IntelliTrade Pro adds support-zone quality, currency strength and event risk to your pre-trade routine."
            ctaLabel="See IntelliTrade Pro"
            href="/pro?src=calc"
            ctaId="calc_result"
            src="calc"
          />
        </div>
      )}
    </div>
  );
}
