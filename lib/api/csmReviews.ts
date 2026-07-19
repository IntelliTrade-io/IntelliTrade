// Server-only data layer for the CSM public reviews feature (plan §7). Reads the
// whitelisted public projection tables via supabaseAdmin (service role) exactly
// like the free teaser — no HTTP round-trip, no client-callable candle endpoint.
// Every returned object is a strict DTO with an allowed key set only; internal
// ids, snapshot references, hashes, thresholds and feed internals never appear.
//
// This module must never be imported by a client component. There is no
// `server-only` package in this repo (the convention is comment + supabaseAdmin
// usage); a vitest asserts no review client component references the service key.
import { supabaseAdmin } from "@/lib/supabase/admin";

export const CSM_REVIEWS_BASE_PATH = "/currency-strength/reviews";

export function isCsmReviewsEnabled(): boolean {
  return process.env.CSM_PUBLIC_REVIEWS_ENABLED === "true";
}

// ─── DTO shapes (allowed keys only) ──────────────────────────────────────────

export interface LadderRowDto {
  rank: number;
  currency: string;
  score: number;
}

export interface ReviewCandleDto {
  time: number; // unix seconds (UTC)
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ReviewDto {
  slug: string;
  headline: string;
  subtitle: string;
  strongCurrency: string;
  weakCurrency: string;
  pairSymbol: string;
  directionMultiplier: number;
  regimeLabel: string;
  pairConfidenceBand: string | null;
  ladder: LadderRowDto[];
  capturedAt: string;
  publishedAt: string;
  updatedAt: string;
  referenceClose: number;
  referenceCloseTime: string;
  shortReturnPct: number;
  longReturnPct: number;
  maxContinuationPct: number;
  maxContinuationAt: string | null;
  maxPullbackPct: number;
  maxPullbackAt: string | null;
  classification: string;
  explanationText: string;
  modelGeneration: string;
  candles: ReviewCandleDto[];
}

export interface ArchiveItemDto {
  slug: string;
  capturedAt: string;
  publishedAt: string;
  strongCurrency: string;
  weakCurrency: string;
  pairSymbol: string;
  regimeLabel: string;
  classification: string;
  shortReturnPct: number;
  longReturnPct: number;
  modelGeneration: string;
}

export interface MonthlyDto {
  month: string;
  stats: Record<string, unknown>;
  methodologyVersion: string;
  items: ArchiveItemDto[];
}

export interface ScorecardDto {
  observationStart: string | null;
  observationEnd: string | null;
  stats: Record<string, unknown>;
  methodologyVersion: string;
  lastUpdated: string | null;
}

const SUBTITLE = "What happened over the following two weeks?";

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Unique, value-bearing page title for a review (SEO; thin-content guard). */
export function reviewMetaTitle(r: {
  strongCurrency: string;
  weakCurrency: string;
  capturedAt: string;
}): string {
  return `${r.strongCurrency} strongest, ${r.weakCurrency} weakest on ${MONTH_DAY_YEAR.format(new Date(r.capturedAt))} · Currency Strength Review`;
}

/** Unique description built from the case's real numbers, so no two are alike. */
export function reviewMetaDescription(r: {
  strongCurrency: string;
  weakCurrency: string;
  pairSymbol: string;
  capturedAt: string;
  longReturnPct: number;
  classification: string;
}): string {
  const outcome =
    r.classification === "continued"
      ? "continued"
      : r.classification === "reversed"
        ? "reversed"
        : "was mixed";
  const move = `${r.longReturnPct > 0 ? "+" : ""}${r.longReturnPct.toFixed(2)}%`;
  return `On ${MONTH_DAY_YEAR.format(new Date(r.capturedAt))}, ${r.strongCurrency} read strongest and ${r.weakCurrency} weakest. Over the following sixty four-hour bars ${r.pairSymbol} moved ${move} in the direction of the reading. The reading ${outcome}. Full data inside.`;
}

// ─── mappers (whitelist projection) ──────────────────────────────────────────

function toLadder(raw: unknown): LadderRowDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    rank: Number((r as Record<string, unknown>).rank),
    currency: String((r as Record<string, unknown>).currency),
    score: Number((r as Record<string, unknown>).score),
  }));
}

export function toArchiveItem(row: Record<string, unknown>): ArchiveItemDto {
  return {
    slug: String(row.slug),
    capturedAt: String(row.captured_at),
    publishedAt: String(row.published_at),
    strongCurrency: String(row.strong_currency),
    weakCurrency: String(row.weak_currency),
    pairSymbol: String(row.pair_symbol),
    regimeLabel: String(row.regime_label),
    classification: String(row.classification),
    shortReturnPct: Number(row.short_return_pct),
    longReturnPct: Number(row.long_return_pct),
    modelGeneration: String(row.model_generation),
  };
}

/** Hard clamp candles to [from, to] in code (never trust the query alone). */
export function clampCandles(
  rows: { open_time: string; open: number; high: number; low: number; close: number }[],
  fromIso: string,
  toIso: string,
): ReviewCandleDto[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return rows
    .filter((r) => {
      const t = Date.parse(r.open_time);
      return t >= from && t <= to;
    })
    .map((r) => ({
      time: Math.floor(Date.parse(r.open_time) / 1000),
      o: Number(r.open),
      h: Number(r.high),
      l: Number(r.low),
      c: Number(r.close),
    }))
    .sort((a, b) => a.time - b.time);
}

// ─── queries ─────────────────────────────────────────────────────────────────

export async function getPublishedReviews(): Promise<ArchiveItemDto[]> {
  if (!isCsmReviewsEnabled()) return [];
  const { data, error } = await supabaseAdmin
    .from("csm_public_reviews")
    .select(
      "slug,captured_at,published_at,strong_currency,weak_currency,pair_symbol,regime_label,classification,short_return_pct,long_return_pct,model_generation",
    )
    .order("published_at", { ascending: false });
  if (error) {
    console.error("csmReviews getPublishedReviews:", error);
    return [];
  }
  return (data ?? []).map(toArchiveItem);
}

export async function getReviewBySlug(slug: string): Promise<ReviewDto | null> {
  if (!isCsmReviewsEnabled()) return null;
  const { data, error } = await supabaseAdmin
    .from("csm_public_reviews")
    .select("*")
    .eq("slug", slug)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;

  // Feed lives on the private case, never in the public row or DTO.
  const { data: caseRows } = await supabaseAdmin
    .from("csm_review_cases")
    .select("feed_name")
    .eq("id", row.case_id as number)
    .limit(1);
  const feedName = (caseRows?.[0] as { feed_name?: string } | undefined)?.feed_name;

  let candles: ReviewCandleDto[] = [];
  if (feedName) {
    const { data: candleRows } = await supabaseAdmin
      .from("fx_ohlc_candles")
      .select("open_time,open,high,low,close")
      .eq("feed_name", feedName)
      .eq("symbol", row.pair_symbol as string)
      .eq("timeframe", "4hour")
      .gte("open_time", row.chart_from as string)
      .lte("open_time", row.chart_to as string)
      .order("open_time", { ascending: true });
    candles = clampCandles(
      (candleRows ?? []) as never[],
      row.chart_from as string,
      row.chart_to as string,
    );
  }

  return toReviewDto(row, candles);
}

/** Whitelist projection of a public row + clamped candles into the ReviewDto.
 *  Only the allowed keys appear; internal ids/hashes/thresholds never do. */
export function toReviewDto(row: Record<string, unknown>, candles: ReviewCandleDto[]): ReviewDto {
  return {
    slug: String(row.slug),
    headline: String(row.headline),
    subtitle: SUBTITLE,
    strongCurrency: String(row.strong_currency),
    weakCurrency: String(row.weak_currency),
    pairSymbol: String(row.pair_symbol),
    directionMultiplier: Number(row.direction_multiplier),
    regimeLabel: String(row.regime_label),
    pairConfidenceBand: row.pair_confidence_band ? String(row.pair_confidence_band) : null,
    ladder: toLadder(row.ladder),
    capturedAt: String(row.captured_at),
    publishedAt: String(row.published_at),
    updatedAt: String(row.updated_at),
    referenceClose: Number(row.reference_close),
    referenceCloseTime: String(row.reference_close_time),
    shortReturnPct: Number(row.short_return_pct),
    longReturnPct: Number(row.long_return_pct),
    maxContinuationPct: Number(row.max_continuation_pct),
    maxContinuationAt: row.max_continuation_at ? String(row.max_continuation_at) : null,
    maxPullbackPct: Number(row.max_pullback_pct),
    maxPullbackAt: row.max_pullback_at ? String(row.max_pullback_at) : null,
    classification: String(row.classification),
    explanationText: String(row.explanation_text),
    modelGeneration: String(row.model_generation),
    candles,
  };
}

export async function getPublishedSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  if (!isCsmReviewsEnabled()) return [];
  const { data, error } = await supabaseAdmin
    .from("csm_public_reviews")
    .select("slug,updated_at")
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    slug: String((r as Record<string, unknown>).slug),
    updatedAt: String((r as Record<string, unknown>).updated_at),
  }));
}

export async function getMonthlySummary(year: string, month: string): Promise<MonthlyDto | null> {
  if (!isCsmReviewsEnabled()) return null;
  const key = `${year}-${month.padStart(2, "0")}`;
  const { data, error } = await supabaseAdmin
    .from("csm_review_monthly_summaries")
    .select("*")
    .eq("capture_month", key)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;

  const items = (await getPublishedReviews()).filter(
    (r) => r.capturedAt.slice(0, 7) === key,
  );
  return {
    month: key,
    stats: (row.stats as Record<string, unknown>) ?? {},
    methodologyVersion: String(row.methodology_version),
    items,
  };
}

export async function getPublishedMonths(): Promise<string[]> {
  if (!isCsmReviewsEnabled()) return [];
  const { data } = await supabaseAdmin
    .from("csm_review_monthly_summaries")
    .select("capture_month");
  return (data ?? []).map((r) => String((r as Record<string, unknown>).capture_month));
}

export async function getScorecard(): Promise<ScorecardDto | null> {
  if (!isCsmReviewsEnabled()) return null;
  const { data, error } = await supabaseAdmin
    .from("csm_review_aggregate_stats")
    .select("*")
    .order("computed_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;
  return {
    observationStart: row.observation_start ? String(row.observation_start) : null,
    observationEnd: row.observation_end ? String(row.observation_end) : null,
    stats: (row.stats as Record<string, unknown>) ?? {},
    methodologyVersion: String(row.methodology_version),
    lastUpdated: row.computed_at ? String(row.computed_at) : null,
  };
}
