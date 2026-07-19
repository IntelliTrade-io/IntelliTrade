import { afterEach, describe, expect, it, vi } from "vitest";

// The data layer imports supabaseAdmin (createClient throws without env); mock it.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import {
  clampCandles,
  getPublishedReviews,
  getPublishedSlugs,
  getReviewBySlug,
  isCsmReviewsEnabled,
  reviewMetaDescription,
  reviewMetaTitle,
  toArchiveItem,
  toReviewDto,
  type ReviewCandleDto,
} from "@/lib/api/csmReviews";

afterEach(() => {
  delete process.env.CSM_PUBLIC_REVIEWS_ENABLED;
});

const PUBLIC_ROW = {
  slug: "eur-strongest-jpy-weakest-june-1-2026",
  headline: "EUR strongest, JPY weakest on June 1, 2026",
  strong_currency: "EUR",
  weak_currency: "JPY",
  pair_symbol: "EURJPY",
  direction_multiplier: 1,
  regime_label: "Confirmed",
  pair_confidence_band: "high",
  ladder: [
    { rank: 1, currency: "EUR", score: 60 },
    { rank: 8, currency: "JPY", score: -60 },
  ],
  captured_at: "2026-06-01T08:00:00Z",
  published_at: "2026-06-15T00:00:00Z",
  updated_at: "2026-06-15T00:00:00Z",
  reference_close: 160.0,
  reference_close_time: "2026-06-01T08:00:00Z",
  short_return_pct: 1.5,
  long_return_pct: 2.5,
  max_continuation_pct: 3.1,
  max_continuation_at: "2026-06-10T00:00:00Z",
  max_pullback_pct: -0.8,
  max_pullback_at: "2026-06-05T00:00:00Z",
  classification: "continued",
  explanation_text: "EUR was strongest.",
  model_generation: "Methodology v1",
  // internal fields that must NOT leak into the DTO:
  case_id: 99,
  chart_from: "2026-05-25T00:00:00Z",
  chart_to: "2026-06-11T00:00:00Z",
};

const REVIEW_DTO_KEYS = [
  "slug", "headline", "subtitle", "strongCurrency", "weakCurrency", "pairSymbol",
  "directionMultiplier", "regimeLabel", "pairConfidenceBand", "ladder", "capturedAt",
  "publishedAt", "updatedAt", "referenceClose", "referenceCloseTime", "shortReturnPct",
  "longReturnPct", "maxContinuationPct", "maxContinuationAt", "maxPullbackPct",
  "maxPullbackAt", "classification", "explanationText", "modelGeneration", "candles",
].sort();

const ARCHIVE_DTO_KEYS = [
  "slug", "capturedAt", "publishedAt", "strongCurrency", "weakCurrency", "pairSymbol",
  "regimeLabel", "classification", "shortReturnPct", "longReturnPct", "modelGeneration",
].sort();

describe("DTO whitelist", () => {
  it("ReviewDto exposes exactly the allowed keys (no internal ids/hashes/feed)", () => {
    const dto = toReviewDto(PUBLIC_ROW, []);
    expect(Object.keys(dto).sort()).toEqual(REVIEW_DTO_KEYS);
    // spot-check forbidden internals are absent
    expect(dto).not.toHaveProperty("case_id");
    expect(dto).not.toHaveProperty("chart_from");
    expect(dto).not.toHaveProperty("feed_name");
  });

  it("ArchiveItemDto exposes exactly the allowed keys", () => {
    const dto = toArchiveItem(PUBLIC_ROW);
    expect(Object.keys(dto).sort()).toEqual(ARCHIVE_DTO_KEYS);
  });
});

describe("candle clamp", () => {
  const rows = [
    { open_time: "2026-05-20T00:00:00Z", open: 1, high: 1, low: 1, close: 1 }, // before from
    { open_time: "2026-05-25T00:00:00Z", open: 2, high: 2, low: 2, close: 2 }, // == from
    { open_time: "2026-06-01T08:00:00Z", open: 3, high: 3, low: 3, close: 3 }, // inside
    { open_time: "2026-06-11T00:00:00Z", open: 4, high: 4, low: 4, close: 4 }, // == to
    { open_time: "2026-07-01T00:00:00Z", open: 5, high: 5, low: 5, close: 5 }, // after to
  ];

  it("hard-clamps candles to [from, to] and never exceeds chart_to", () => {
    const clamped = clampCandles(rows, "2026-05-25T00:00:00Z", "2026-06-11T00:00:00Z");
    expect(clamped.map((c) => c.o)).toEqual([2, 3, 4]);
    const to = Date.parse("2026-06-11T00:00:00Z") / 1000;
    expect(clamped.every((c: ReviewCandleDto) => c.time <= to)).toBe(true);
  });
});

describe("flag gating (shadow mode)", () => {
  it("isCsmReviewsEnabled reflects the env flag", () => {
    expect(isCsmReviewsEnabled()).toBe(false);
    process.env.CSM_PUBLIC_REVIEWS_ENABLED = "true";
    expect(isCsmReviewsEnabled()).toBe(true);
    process.env.CSM_PUBLIC_REVIEWS_ENABLED = "false";
    expect(isCsmReviewsEnabled()).toBe(false);
  });

  it("data layer returns empty/null with the flag off (no DB access)", async () => {
    expect(await getPublishedReviews()).toEqual([]);
    expect(await getReviewBySlug("anything")).toBeNull();
    expect(await getPublishedSlugs()).toEqual([]); // sitemap contributes nothing
  });
});

describe("metadata uniqueness", () => {
  it("two different cases produce different titles and descriptions", () => {
    const a = toReviewDto(PUBLIC_ROW, []);
    const b = toReviewDto(
      { ...PUBLIC_ROW, strong_currency: "GBP", weak_currency: "CHF", pair_symbol: "GBPCHF",
        captured_at: "2026-06-08T08:00:00Z", long_return_pct: -1.2, classification: "reversed" },
      [],
    );
    expect(reviewMetaTitle(a)).not.toEqual(reviewMetaTitle(b));
    expect(reviewMetaDescription(a)).not.toEqual(reviewMetaDescription(b));
    expect(reviewMetaTitle(a)).toContain("EUR strongest, JPY weakest");
    expect(reviewMetaDescription(b)).toContain("-1.20%");
  });
});
