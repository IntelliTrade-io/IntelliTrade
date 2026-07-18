"use client";

import { useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { ProCtaCard } from "@/components/pro/ProCtaCard";
import { computeCompounding, MAX_PERIODS, type CompoundingResult } from "@/lib/compounding";

// Pure client math — no external data, no combobox. Starting balance grows at a
// fixed per-period return over N periods, with an optional per-period deposit.
interface CompoundingCalculatorProps {
  className?: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF"];
const PERIOD_UNITS = ["Day", "Week", "Month", "Year"] as const;
type PeriodUnit = (typeof PERIOD_UNITS)[number];

export default function CompoundingCalculator({ className }: CompoundingCalculatorProps) {
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("1000");
  const [ratePercent, setRatePercent] = useState("2");
  const [periods, setPeriods] = useState("52");
  const [unit, setUnit] = useState<PeriodUnit>("Week");
  const [contribution, setContribution] = useState("");

  const [result, setResult] = useState<CompoundingResult | null>(null);
  const [resultUnit, setResultUnit] = useState<PeriodUnit>("Week");

  const fmt = useMemo(() => {
    const f = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (n: number) => f.format(n);
  }, [currency]);

  const handleCalculate = () => {
    const start = parseFloat(startingBalance);
    const rate = parseFloat(ratePercent);
    const n = parseFloat(periods);
    const contrib = contribution.trim() === "" ? 0 : parseFloat(contribution);

    if (isNaN(start) || start < 0 || isNaN(rate) || isNaN(n) || n < 1 || isNaN(contrib)) {
      alert("Enter a valid starting balance, rate, and number of periods");
      return;
    }
    try {
      const r = computeCompounding({ startingBalance: start, ratePercent: rate, periods: n, contribution: contrib });
      setResult(r);
      setResultUnit(unit);
      trackEvent("calculator_result", { instrument: "compounding" });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Calculation failed");
    }
  };

  return (
    <div className={`w-full text-white ${className || ""}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_0.92fr]">
        {/* Inputs */}
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-3 sm:p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
          <div className="mb-3 sm:mb-5 flex flex-col gap-1 border-b border-white/8 pb-3 sm:pb-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Growth inputs</div>
            <div className="mt-1 text-sm text-white/48">Starting balance, return per period, and horizon</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Currency */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Currency</div>
              <div className="flex gap-1 rounded-[16px] border border-white/10 bg-white/[0.035] p-1">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`h-8 flex-1 rounded-[12px] text-xs font-medium transition-all ${
                      currency === c ? "bg-violet-500/[0.16] text-white" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Period unit */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Period</div>
              <div className="flex gap-1 rounded-[16px] border border-white/10 bg-white/[0.035] p-1">
                {PERIOD_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`h-8 flex-1 rounded-[12px] text-xs font-medium transition-all ${
                      unit === u ? "bg-violet-500/[0.16] text-white" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Starting balance */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Starting balance</div>
              <div className="relative">
                <input
                  autoComplete="off"
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  placeholder="e.g. 1000"
                  className="h-9 sm:h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-14 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">{currency}</div>
              </div>
            </div>

            {/* Rate per period */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Return per {unit.toLowerCase()}</div>
              <div className="relative">
                <input
                  autoComplete="off"
                  type="number"
                  value={ratePercent}
                  onChange={(e) => setRatePercent(e.target.value)}
                  placeholder="e.g. 2"
                  className="h-9 sm:h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-10 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">%</div>
              </div>
            </div>

            {/* Periods */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Number of {unit.toLowerCase()}s</div>
              <input
                autoComplete="off"
                type="number"
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
                placeholder="e.g. 52"
                className="h-9 sm:h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
              />
            </div>

            {/* Contribution (optional) */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Add per {unit.toLowerCase()} <span className="text-white/28">(optional)</span></div>
              <div className="relative">
                <input
                  autoComplete="off"
                  type="number"
                  value={contribution}
                  onChange={(e) => setContribution(e.target.value)}
                  placeholder="e.g. 0"
                  className="h-9 sm:h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-14 text-sm text-white outline-none transition-all placeholder:text-white/24 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">{currency}</div>
              </div>
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
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-violet-400/16 bg-violet-500/[0.06] p-3 sm:p-4 text-center shadow-[inset_0_0_0_1px_rgba(167,139,250,0.06)]">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Final balance</div>
            <div className="mt-1.5 text-2xl sm:text-4xl font-semibold tracking-tight text-white">
              {result ? fmt(result.finalBalance) : "—"}
            </div>
            {result && (
              <div className="mt-1.5 text-[10px] sm:text-[11px] leading-relaxed text-white/30">
                after {result.rows.length} {resultUnit.toLowerCase()}{result.rows.length === 1 ? "" : "s"}
                {result.capped ? ` · capped at ${MAX_PERIODS}` : ""}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Growth</div>
              <div className="mt-1.5 text-base sm:text-lg font-semibold text-white">{result ? fmt(result.totalGain) : "—"}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Total return</div>
              <div className="mt-1.5 text-base sm:text-lg font-semibold text-white">
                {result ? `${result.totalReturnPercent.toFixed(1)}%` : "—"}
              </div>
            </div>
          </div>

          {/* Growth table */}
          {result && (
            <div className="max-h-72 overflow-y-auto rounded-[22px] border border-white/10 bg-white/[0.02]">
              <table className="w-full text-right text-xs tabular-nums">
                <thead className="sticky top-0 bg-[#0b0b10]/95 backdrop-blur">
                  <tr className="text-white/40">
                    <th className="px-3 py-2 text-left font-medium">{resultUnit}</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                    <th className="px-3 py-2 font-medium">Gain</th>
                    <th className="px-3 py-2 font-medium">End</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.period} className="border-t border-white/[0.05] text-white/70">
                      <td className="px-3 py-1.5 text-left text-white/45">{row.period}</td>
                      <td className="px-3 py-1.5">{fmt(row.start)}</td>
                      <td className="px-3 py-1.5 text-emerald-300/80">{fmt(row.gain)}</td>
                      <td className="px-3 py-1.5 font-medium text-white">{fmt(row.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="mt-4">
          <ProCtaCard
            heading="Compounding rewards consistency. Protect it."
            body="IntelliTrade Pro adds support-zone quality, currency strength and event risk to your pre-trade routine, so a single bad trade doesn't undo the curve."
            ctaLabel="See IntelliTrade Pro"
            href="/pro?src=compoundcalc"
            ctaId="compoundcalc_result"
            src="compoundcalc"
          />
        </div>
      )}
    </div>
  );
}
