// Pure compounding-growth math for the compounding calculator. No external
// data — a fixed per-period return applied over N periods, with an optional
// per-period contribution added at the end of each period (after growth).

/** Hard cap on periods so the growth table can never blow up the DOM. */
export const MAX_PERIODS = 520;

export interface CompoundingInputs {
  /** Starting balance. */
  startingBalance: number;
  /** Return per period as a percentage (e.g. 2 for +2%, -1 for a 1% loss). */
  ratePercent: number;
  /** Number of periods (clamped to [1, MAX_PERIODS]). */
  periods: number;
  /** Amount added at the end of each period, after growth. Defaults to 0. */
  contribution?: number;
}

export interface CompoundingRow {
  period: number;
  start: number;
  gain: number;
  contribution: number;
  end: number;
}

export interface CompoundingResult {
  finalBalance: number;
  totalContributions: number;
  /** Growth only, excluding the starting balance and contributions. */
  totalGain: number;
  /** Total return on invested capital (start + contributions), as a percentage. */
  totalReturnPercent: number;
  rows: CompoundingRow[];
  /** True when the requested period count was clamped to MAX_PERIODS. */
  capped: boolean;
}

export function computeCompounding({
  startingBalance,
  ratePercent,
  periods,
  contribution = 0,
}: CompoundingInputs): CompoundingResult {
  if (!isFinite(startingBalance) || startingBalance < 0) {
    throw new Error("Starting balance must be zero or positive.");
  }
  if (!isFinite(ratePercent)) {
    throw new Error("Rate must be a number.");
  }
  if (!isFinite(periods) || periods < 1) {
    throw new Error("Periods must be at least 1.");
  }

  const capped = periods > MAX_PERIODS;
  const n = Math.min(Math.floor(periods), MAX_PERIODS);
  const rate = ratePercent / 100;

  const rows: CompoundingRow[] = [];
  let balance = startingBalance;
  for (let i = 1; i <= n; i++) {
    const start = balance;
    const gain = start * rate;
    const end = start + gain + contribution;
    rows.push({ period: i, start, gain, contribution, end });
    balance = end;
  }

  const totalContributions = contribution * n;
  const invested = startingBalance + totalContributions;
  const totalGain = balance - invested;

  return {
    finalBalance: balance,
    totalContributions,
    totalGain,
    totalReturnPercent: invested > 0 ? (totalGain / invested) * 100 : 0,
    rows,
    capped,
  };
}
