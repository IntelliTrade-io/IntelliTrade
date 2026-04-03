"use client";

import { useEffect, useMemo, useState } from "react";
import "../styles/lot-size-calculator.css";

// ---------- Helpers ----------
const normalizePair = (pair: string) => pair.replace("/", "").toUpperCase();

const parsePair = (pair: string) => {
  const s = normalizePair(pair);
  if (s.length !== 6) throw new Error("Pair must be like 'EURUSD' or 'EUR/USD'");
  return { base: s.slice(0, 3), quote: s.slice(3, 6) };
};

// Pip size per instrument (your broker may differ for metals/CFDs/crypto)
const pipSizeFor = (p: string) => {
  const s = normalizePair(p);
  if (s.endsWith("JPY")) return 0.01; // FX JPY pairs: 0.01
  if (s.startsWith("XAU")) return 0.01; // XAUUSD: $0.01 per oz
  if (s.startsWith("XAG")) return 0.01; // XAGUSD: $0.01 per oz
  if (s.startsWith("WTI")) return 0.01; // WTIUSD: $0.01 per barrel (only if supported elsewhere)
  if (s.startsWith("BTC")) return 1; // define "pip" = $1
  if (s.startsWith("ETH")) return 1; // define "pip" = $1
  return 0.0001; // Most FX
};

// Contract size per lot (typical broker conventions; adjust if needed)
const contractSizeFor = (p: string) => {
  const s = normalizePair(p);
  if (s.startsWith("XAU")) return 100; // 1 lot = 100 oz
  if (s.startsWith("XAG")) return 5000; // 1 lot = 5,000 oz
  if (s.startsWith("WTI")) return 1000; // 1 lot = 1,000 barrels
  if (s.startsWith("BTC")) return 1; // 1 lot = 1 BTC (broker dependent)
  if (s.startsWith("ETH")) return 1; // 1 lot = 1 ETH (broker dependent)
  return 100000; // FX: 1 lot = 100,000 units
};

// ---------- Dynamic pairs ----------
// We pull supported currency codes from CurrencyFreaks' public endpoint (no API key).
// Then we compose a curated but dynamic list (majors + popular crosses + metals + crypto) only if codes exist.

const CF_SUPPORTED_URL = "https://api.currencyfreaks.com/v2.0/supported-currencies";

const PREFERRED_BASES = [
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  // extended asset codes that CurrencyFreaks lists when available
  "XAU",
  "XAG",
  "BTC",
  "ETH",
];

function composePairsFrom(codes: Set<string>) {
  // Keep only codes we actually have
  const avail = PREFERRED_BASES.filter((c) => codes.has(c));

  const fxMajors = [
    // majors vs USD in both directions
    ...["EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "JPY"]
      .filter((c) => c !== "USD" && avail.includes(c) && avail.includes("USD"))
      .flatMap((c) => [`${c}USD`, `USD${c}`]),
  ];

  const popularCrossPairsDefs: Array<[string, string]> = [
    ["EUR", "GBP"],
    ["EUR", "JPY"],
    ["GBP", "JPY"],
    ["EUR", "AUD"],
    ["EUR", "CAD"],
    ["EUR", "CHF"],
    ["EUR", "NZD"],
    ["GBP", "AUD"],
    ["GBP", "CAD"],
    ["GBP", "CHF"],
    ["GBP", "NZD"],
    ["AUD", "JPY"],
    ["CAD", "JPY"],
    ["CHF", "JPY"],
    ["NZD", "JPY"],
  ];

  const crosses = popularCrossPairsDefs
    .filter(([a, b]) => avail.includes(a) && avail.includes(b))
    .map(([a, b]) => `${a}${b}`);

  const metalsCrypto = ["XAU", "XAG", "BTC", "ETH"]
    .filter((c) => avail.includes(c) && avail.includes("USD"))
    .map((c) => `${c}USD`);

  const out = Array.from(new Set([...fxMajors, ...crosses, ...metalsCrypto])).sort();
  return out;
}

  interface LotSizeCalculatorProps {
    className?: string;
  }


// ---------- Component ----------
export default function LotSizeCalculator({ className }: LotSizeCalculatorProps) {
  const [currency, setCurrency] = useState("EUR"); // account currency
  const [pair, setPair] = useState("EURUSD");
  const [balance, setBalance] = useState("");
  const [riskPercent, setRiskPercent] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  const [positionSize, setPositionSize] = useState("");
  const [riskAmount, setRiskAmount] = useState("");
  const [pipValue, setPipValue] = useState("");
  const [calcContext, setCalcContext] = useState("");

  // dynamic pairs state
  const [pairs, setPairs] = useState<string[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [pairsError, setPairsError] = useState<string | null>(null);

  // Load available codes and compose pairs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPairs(true);
        setPairsError(null);
        const res = await fetch(CF_SUPPORTED_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch supported currencies");
        const data = await res.json();
        const map = (data?.supportedCurrenciesMap || {}) as Record<string, unknown>;
        const codes = new Set(Object.keys(map));
        // Ensure USD is in the set; if the endpoint ever omits it, add defensively
        codes.add("USD");
        const composed = composePairsFrom(codes);
        if (!cancelled) {
          setPairs(composed);
          // If current selected pair isn't available, pick a sensible default
          const fallback = composed.includes("EURUSD") ? "EURUSD" : composed[0] || "EURUSD";
          if (!composed.includes(pair)) setPair(fallback);
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        if (!cancelled) {
          setPairsError(e?.message || "Could not load pairs");
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

  // Returns BASEQUOTE (quote per base) using CurrencyFreaks (USD base)
  const fetchExchangeRate = async (pairSymbol: string) => {
    const apiKey = process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
    if (!apiKey) throw new Error("Missing API key");

    const baseUrl = `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}`;
    const { base, quote } = parsePair(pairSymbol);

    try {
      const res = await fetch(`${baseUrl}&symbols=${base},${quote}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch exchange rate");
      const data = await res.json();
      const rates = data.rates as Record<string, string>;

      const usdToBase = base === "USD" ? 1 : parseFloat(rates[base]);
      const usdToQuote = quote === "USD" ? 1 : parseFloat(rates[quote]);

      if (!isFinite(usdToBase) || !isFinite(usdToQuote)) throw new Error("Invalid API rates");

      let rate: number;
      if (base === "USD") rate = usdToQuote;
      else if (quote === "USD") rate = 1 / usdToBase;
      else rate = usdToQuote / usdToBase;

      return rate;
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

  const handleCalculate = async () => {
    const balanceNum = parseFloat(balance);
    const riskPercentNum = parseFloat(riskPercent);
    const stopLossNum = parseFloat(stopLoss);

    if (
      isNaN(balanceNum) ||
      isNaN(riskPercentNum) ||
      isNaN(stopLossNum) ||
      balanceNum <= 0 ||
      riskPercentNum <= 0 ||
      stopLossNum <= 0
    ) {
      alert("Please fill all fields with valid positive numbers");
      return;
    }

    try {
      const cleanPair = normalizePair(pair);
      const { quote } = parsePair(cleanPair);
      const pipSize = pipSizeFor(cleanPair);
      const contractSize = contractSizeFor(cleanPair);

      // 1) Risk amount in account currency
      const riskAmt = balanceNum * (riskPercentNum / 100);

      // 2) Pip value per UNIT in QUOTE currency is pipSize (for FX/CFDs)
      const pipValuePerUnitInQuote = pipSize;

      // 3) Convert pip value into ACCOUNT currency (quote -> account)
      let quoteToAccount = 1;
      if (currency !== quote) {
        quoteToAccount = await convertRate(quote, currency); // e.g., USD -> EUR
      }

      const pipValuePerUnitInAccount = pipValuePerUnitInQuote * quoteToAccount;

      // 4) Per-lot pip value and final lots
      const pipValuePerLot = pipValuePerUnitInAccount * contractSize; // account ccy / pip / 1.00 lot
      const riskPerLot = stopLossNum * pipValuePerLot;
      if (!isFinite(riskPerLot) || riskPerLot <= 0) {
        throw new Error("Calculated risk per lot is invalid.");
      }

      const lots = riskAmt / riskPerLot;

      // 5) Update UI
      setRiskAmount(`${riskAmt.toFixed(2)} ${currency}`);
      setPipValue(`${pipValuePerLot.toFixed(2)} ${currency}`);
      setPositionSize(`${lots.toFixed(2)} lots`);
      const conversionNote = currency !== quote ? " · live conversion applied" : "";
      setCalcContext(
        `${Number(balance).toLocaleString()} ${currency} balance · ${riskPercent}% risk · ${stopLoss} pip stop · ${normalizePair(pair)}${conversionNote}`
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Calculation failed");
    }
  };

  const accountCurrencyOptions = useMemo(
    () => ["EUR", "USD", "JPY", "CHF", "GBP"],
    []
  );

  return (
    <div className={`w-full text-white ${className || ""}`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
        {/* Inputs */}
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-1 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Position inputs</div>
              <div className="mt-1 text-sm text-white/48">Account, pair, stop, and risk settings</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Account currency */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Account currency</div>
              <div className="relative">
                <select
                  className="h-11 w-full appearance-none rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-10 text-sm text-white outline-none transition-all focus:border-violet-400/22 focus:bg-white/[0.05] cursor-pointer"
                  style={{ backgroundColor: "rgba(255,255,255,0.035)" }}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {accountCurrencyOptions.map((ccy) => (
                    <option key={ccy} value={ccy} style={{ background: "#0a0a0e" }}>{ccy}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg className="h-4 w-4 text-white/38" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            {/* Currency pair */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Currency pair</div>
              <div className="relative">
                <select
                  className="h-11 w-full appearance-none rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-10 text-sm text-white outline-none transition-all focus:border-violet-400/22 focus:bg-white/[0.05] cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: "rgba(255,255,255,0.035)" }}
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  disabled={loadingPairs || !pairs.length}
                >
                  {loadingPairs && <option style={{ background: "#0a0a0e" }}>Loading pairs…</option>}
                  {!loadingPairs && pairs.map((p) => (
                    <option key={p} value={p} style={{ background: "#0a0a0e" }}>{p}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg className="h-4 w-4 text-white/38" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {pairsError && <div className="text-xs text-white/46">{pairsError}</div>}
            </div>

            {/* Account balance */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Account balance</div>
              <div className="relative">
                <input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="e.g. 5000"
                  className="h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-14 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">{currency}</div>
              </div>
            </div>

            {/* Risk % */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Risk per trade</div>
              <div className="relative">
                <input
                  type="number"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(e.target.value)}
                  placeholder="e.g. 1"
                  className="h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-10 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">%</div>
              </div>
            </div>

            {/* Stop loss */}
            <div className="flex flex-col gap-2 md:col-span-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Stop loss distance</div>
              <div className="relative">
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="e.g. 30"
                  className="h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-14 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">pips</div>
              </div>
            </div>
          </div>

          <button
            onClick={handleCalculate}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full border border-violet-400/18 bg-violet-500/[0.10] text-sm font-medium text-white transition-all hover:border-violet-300/26 hover:bg-violet-500/[0.16]"
          >
            Calculate
          </button>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-1 flex-col items-center justify-center rounded-[24px] border border-violet-400/16 bg-violet-500/[0.06] p-6 text-center shadow-[inset_0_0_0_1px_rgba(167,139,250,0.06)]">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Position size</div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-white">
              {positionSize ? positionSize.replace(" lots", "") : "—"}
            </div>
            <div className="mt-1 text-sm text-white/38">lots</div>
            {calcContext && (
              <div className="mt-3 text-[11px] leading-relaxed text-white/30">{calcContext}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Risk amount</div>
              <div className="mt-2 text-lg font-semibold text-white">{riskAmount || "—"}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Pip value / lot</div>
              <div className="mt-2 text-lg font-semibold text-white">{pipValue || "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
