-- 009_csm_review_public.sql
-- CSM Public Reviews — public projection layer (CSM_REVIEW_PLAN.md §5).
--
-- Completed-only, whitelisted copy of finished cases plus recomputed monthly and
-- aggregate stats. This is an explicit copy, NEVER a view over the private
-- tables: pages read it server-side via supabaseAdmin, exactly like the teaser.
-- Even these "public" tables are anon-denied (RLS + REVOKE) — there is no anon
-- policy anywhere, consistent with the whole security model + anon-RLS CI check.
--
-- Idempotent. Rollback = drop the new objects.

CREATE TABLE IF NOT EXISTS csm_public_reviews (
  id                    BIGSERIAL PRIMARY KEY,
  case_id               BIGINT NOT NULL UNIQUE REFERENCES csm_review_cases(id),
  slug                  TEXT NOT NULL UNIQUE,
  headline              TEXT NOT NULL,
  strong_currency       TEXT NOT NULL,
  weak_currency         TEXT NOT NULL,
  pair_symbol           TEXT NOT NULL,
  direction_multiplier  SMALLINT NOT NULL,
  regime_label          TEXT NOT NULL,        -- customer-safe capture state
  ladder                JSONB NOT NULL,       -- [{rank,currency,score}] x8
  pair_confidence_band  TEXT,                 -- e.g. "high" (banded, not raw threshold leak)
  captured_at           TIMESTAMPTZ NOT NULL,
  reference_close_time  TIMESTAMPTZ NOT NULL,
  reference_close       NUMERIC NOT NULL,
  short_return_pct      NUMERIC NOT NULL,
  long_return_pct       NUMERIC NOT NULL,
  max_continuation_pct  NUMERIC NOT NULL,
  max_continuation_at   TIMESTAMPTZ,
  max_pullback_pct      NUMERIC NOT NULL,
  max_pullback_at       TIMESTAMPTZ,
  classification        TEXT NOT NULL,
  explanation_text      TEXT NOT NULL,
  chart_from            TIMESTAMPTZ NOT NULL, -- approved candle range only
  chart_to              TIMESTAMPTZ NOT NULL,
  model_generation      TEXT NOT NULL,        -- customer label, e.g. "Methodology v1"
  capture_month         TEXT NOT NULL,        -- 'YYYY-MM' (capture-month grouping)
  published_at          TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_csm_public_reviews_month ON csm_public_reviews (capture_month);
CREATE INDEX IF NOT EXISTS idx_csm_public_reviews_published ON csm_public_reviews (published_at DESC);

CREATE TABLE IF NOT EXISTS csm_review_monthly_summaries (
  id                  BIGSERIAL PRIMARY KEY,
  capture_month       TEXT NOT NULL UNIQUE,      -- 'YYYY-MM'
  stats               JSONB NOT NULL,            -- counts, means, medians, extremes, overlap note
  case_ids            BIGINT[] NOT NULL,
  methodology_version TEXT NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS csm_review_aggregate_stats (
  id                   BIGSERIAL PRIMARY KEY,
  methodology_version  TEXT NOT NULL UNIQUE,
  stats                JSONB NOT NULL,
  observation_start    TIMESTAMPTZ,
  observation_end      TIMESTAMPTZ,
  computed_at          TIMESTAMPTZ NOT NULL
);

ALTER TABLE csm_public_reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE csm_review_monthly_summaries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE csm_review_aggregate_stats     ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE csm_public_reviews, csm_review_monthly_summaries,
                    csm_review_aggregate_stats FROM anon, authenticated;
