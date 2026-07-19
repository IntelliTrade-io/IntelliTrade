// Unit tests for the pure market-context shaper. The I/O wrapper
// (buildTradeContext) is intentionally not tested here — it only orchestrates
// service-role fetches and delegates all shaping to extractTradeContext.
import { describe, it, expect, vi } from "vitest";

// journal-context imports supabaseAdmin (createClient throws without env); mock
// it. Only extractTradeContext (pure) is exercised here.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { extractTradeContext, CONTEXT_VERSION } from "./journal-context";

// Loose view of the stamp for assertions (the production type is an opaque
// Record<string, unknown>; tests know the intended shape).
type CtxSection = {
  snapshotAt?: string;
  base?: unknown;
  quote?: unknown;
  pair?: unknown;
};
type TestCtx = {
  v: unknown;
  capturedAt: string;
  daily: CtxSection;
  intraday: CtxSection;
  zone?: unknown;
};

// Eight-major currency scores. Descending order here is:
//   EUR(90) > GBP(60) > AUD(30) > NZD(10) > CAD(-5) > CHF(-20) > JPY(-40) > USD(-70)
// so EUR ranks 1 and USD ranks 8.
const currencies = {
  USD: { score: -70, bias: "Weak" },
  EUR: { score: 90, bias: "Strong" },
  GBP: { score: 60, bias: "Strong" },
  JPY: { score: -40, bias: "Weak" },
  AUD: { score: 30, bias: "Strong" },
  NZD: { score: 10, bias: "Neutral" },
  CAD: { score: -5, bias: "Neutral" },
  CHF: { score: -20, bias: "Weak" },
};

const dailyRow = {
  created_at: "2026-07-19T00:00:00Z",
  currencies_weighted: currencies,
  pairs: {
    EURUSD: { pair: "bullish", confidence: 82, d1: "bullish", h4: "bullish" },
  },
};

const intradayRow = {
  created_at: "2026-07-19T13:15:00Z",
  currencies_weighted: currencies,
  pairs: {
    EURUSD: { pair: "bearish", confidence: 55, h1: "bearish", m15: "bearish" },
  },
};

const srRow = { dynamic_grade: "a_plus", status: "A+ review" };

describe("extractTradeContext", () => {
  it("captures daily + intraday + zone for a standard EURUSD trade", () => {
    const ctx = extractTradeContext("EURUSD", dailyRow, intradayRow, srRow) as unknown as TestCtx;

    expect(ctx.v).toBe(CONTEXT_VERSION);
    expect(typeof ctx.capturedAt).toBe("string");
    expect(Number.isNaN(Date.parse(ctx.capturedAt))).toBe(false);

    expect(ctx.daily.snapshotAt).toBe("2026-07-19T00:00:00Z");
    expect(ctx.daily.base).toEqual({ code: "EUR", score: 90, rank: 1 });
    expect(ctx.daily.quote).toEqual({ code: "USD", score: -70, rank: 8 });
    expect(ctx.daily.pair).toEqual({ state: "Bullish", confidence: 82 });

    expect(ctx.intraday.snapshotAt).toBe("2026-07-19T13:15:00Z");
    expect(ctx.intraday.pair).toEqual({ state: "Bearish", confidence: 55 });
    // Intraday never carries base/quote ranks (daily-only by design).
    expect(ctx.intraday.base).toBeUndefined();

    expect(ctx.zone).toEqual({ grade: "a_plus", status: "A+ review" });
  });

  it("ranks currencies by descending score", () => {
    // GBPJPY: GBP is rank 2, JPY is rank 7 in the fixture ordering.
    const ctx = extractTradeContext("GBPJPY", dailyRow, null, null) as unknown as TestCtx;
    expect(ctx.daily.base).toEqual({ code: "GBP", score: 60, rank: 2 });
    expect(ctx.daily.quote).toEqual({ code: "JPY", score: -40, rank: 7 });
  });

  it("keeps currency ranks but omits pair for a non-standard symbol", () => {
    // USDEUR is not a market-convention pair (EURUSD is), so there is no pair
    // read, but both currencies still rank.
    const ctx = extractTradeContext("USDEUR", dailyRow, intradayRow, null) as unknown as TestCtx;
    expect(ctx.daily.base).toEqual({ code: "USD", score: -70, rank: 8 });
    expect(ctx.daily.quote).toEqual({ code: "EUR", score: 90, rank: 1 });
    expect(ctx.daily.pair).toBeUndefined();
    expect(ctx.intraday.pair).toBeUndefined();
    // A daily section still exists (snapshotAt + ranks), but no zone (non-EURUSD).
    expect(ctx.zone).toBeUndefined();
  });

  it("omits base/quote when the snapshot has no currency scores", () => {
    const noCurrencies = { created_at: "2026-07-19T00:00:00Z", currencies_weighted: null, pairs: dailyRow.pairs };
    const ctx = extractTradeContext("EURUSD", noCurrencies, null, null) as unknown as TestCtx;
    expect(ctx.daily.snapshotAt).toBe("2026-07-19T00:00:00Z");
    expect(ctx.daily.base).toBeUndefined();
    expect(ctx.daily.quote).toBeUndefined();
    // The pair read is independent of currency scores, so it survives.
    expect(ctx.daily.pair).toEqual({ state: "Bullish", confidence: 82 });
  });

  it("omits the pair when its combined state is malformed", () => {
    const badPairs = {
      created_at: "2026-07-19T00:00:00Z",
      currencies_weighted: currencies,
      pairs: { EURUSD: { pair: "sideways", confidence: 40 } },
    };
    const ctx = extractTradeContext("EURUSD", badPairs, null, null) as unknown as TestCtx;
    expect(ctx.daily.base).toEqual({ code: "EUR", score: 90, rank: 1 });
    expect(ctx.daily.pair).toBeUndefined();
  });

  it("includes the pair state but drops an unparseable confidence", () => {
    const noConf = {
      created_at: "2026-07-19T00:00:00Z",
      currencies_weighted: currencies,
      pairs: { EURUSD: { pair: "bullish" } },
    };
    const ctx = extractTradeContext("EURUSD", noConf, null, null) as unknown as TestCtx;
    expect(ctx.daily.pair).toEqual({ state: "Bullish" });
  });

  it("omits the zone for EURUSD when the sr row is incomplete", () => {
    const ctx = extractTradeContext("EURUSD", dailyRow, null, { dynamic_grade: "green" }) as unknown as TestCtx;
    expect(ctx.zone).toBeUndefined();
  });

  it("never adds a zone for a non-EURUSD symbol even with an sr row", () => {
    const ctx = extractTradeContext("GBPUSD", dailyRow, null, srRow) as unknown as TestCtx;
    expect(ctx.zone).toBeUndefined();
  });

  it("returns only { v, capturedAt } when all rows are null", () => {
    const ctx = extractTradeContext("EURUSD", null, null, null) as unknown as TestCtx;
    expect(ctx.v).toBe(CONTEXT_VERSION);
    expect(typeof ctx.capturedAt).toBe("string");
    expect(Object.keys(ctx).sort()).toEqual(["capturedAt", "v"]);
  });
});
