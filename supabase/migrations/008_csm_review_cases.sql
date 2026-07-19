-- 008_csm_review_cases.sql
-- CSM Public Reviews — case + evaluation layer (CSM_REVIEW_PLAN.md §5).
--
-- A "case" is one qualifying strong/weak regime instance detected from the
-- immutable review snapshots; its evaluation is the deterministic 30/60-bar
-- forward outcome. Duplicate protection is DB-enforced (case_key UNIQUE +
-- partial unique index for at most one active case per pair/direction/model).
--
-- RLS + REVOKE in this file. Idempotent. Rollback = drop the new objects.

CREATE TABLE IF NOT EXISTS csm_review_cases (
  id                     BIGSERIAL PRIMARY KEY,
  case_key               TEXT NOT NULL UNIQUE,   -- model:pair:direction:firstSnapshotId (deterministic)
  review_snapshot_id     BIGINT NOT NULL REFERENCES csm_review_snapshots(id),
  model_version          TEXT NOT NULL,
  scanner_version        TEXT NOT NULL,
  feed_name              TEXT NOT NULL,
  strong_currency        TEXT NOT NULL,
  weak_currency          TEXT NOT NULL,
  pair_symbol            TEXT NOT NULL,          -- conventional, e.g. EURJPY
  direction_multiplier   SMALLINT NOT NULL CHECK (direction_multiplier IN (-1, 1)),
  pair_alignment         TEXT NOT NULL,          -- bullish | bearish (as stored at capture)
  pair_confidence        NUMERIC NOT NULL,
  regime_state_at_open   TEXT NOT NULL,          -- fresh|confirmed|mature (engine output)
  state_engine_version   TEXT NOT NULL,
  captured_at            TIMESTAMPTZ NOT NULL,
  reference_open_time    TIMESTAMPTZ NOT NULL,   -- bar-0 open
  reference_close_time   TIMESTAMPTZ NOT NULL,
  reference_close        NUMERIC,                -- filled when candle verified
  status                 TEXT NOT NULL DEFAULT 'pending',
  -- pending|evaluating|short_window_complete|long_window_complete|ready_for_publication|
  -- published|incomplete|failed_validation|withheld_missing_data
  failure_reason         TEXT,
  last_stage             TEXT,
  retry_count            INT NOT NULL DEFAULT 0,
  retry_eligible         BOOLEAN NOT NULL DEFAULT TRUE,
  overlapping_case_ids   BIGINT[] NOT NULL DEFAULT '{}',
  manual_review_status   TEXT,
  resolution_notes       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active case per (pair, direction, model): the overlap rule, DB-enforced.
CREATE UNIQUE INDEX IF NOT EXISTS uq_csm_case_active
  ON csm_review_cases (pair_symbol, direction_multiplier, model_version)
  WHERE status IN ('pending','evaluating','short_window_complete',
                   'long_window_complete','ready_for_publication');

CREATE INDEX IF NOT EXISTS idx_csm_cases_status ON csm_review_cases (status);

CREATE TABLE IF NOT EXISTS csm_review_evaluations (
  id                       BIGSERIAL PRIMARY KEY,
  case_id                  BIGINT NOT NULL REFERENCES csm_review_cases(id),
  evaluation_version       TEXT NOT NULL,
  reference_close          NUMERIC NOT NULL,
  short_bar_close_time     TIMESTAMPTZ,
  short_close              NUMERIC,
  long_bar_close_time      TIMESTAMPTZ,
  long_close               NUMERIC,
  short_return_norm_pct    NUMERIC,     -- direction-normalized
  long_return_norm_pct     NUMERIC,
  short_return_raw_pct     NUMERIC,     -- conventional-price, for audit
  long_return_raw_pct      NUMERIC,
  max_continuation_pct     NUMERIC,     -- from highs/lows, normalized
  max_continuation_at      TIMESTAMPTZ,
  max_pullback_pct         NUMERIC,     -- adverse extreme, normalized (negative)
  max_pullback_at          TIMESTAMPTZ,
  expected_bars            INT NOT NULL DEFAULT 60,
  verified_bars            INT NOT NULL DEFAULT 0,
  missing_bars             INT NOT NULL DEFAULT 0,
  data_quality             TEXT NOT NULL DEFAULT 'pending',  -- pending|ok|gapped|failed
  classification           TEXT,        -- continued | mixed | reversed
  neutral_band_pct         NUMERIC,     -- the band used, recorded per evaluation
  explanation_facts        JSONB,       -- machine facts feeding the template
  explanation_text         TEXT,        -- rendered deterministic prose
  template_version         TEXT,
  computed_at              TIMESTAMPTZ,
  UNIQUE (case_id, evaluation_version)
);

ALTER TABLE csm_review_cases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE csm_review_evaluations  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE csm_review_cases, csm_review_evaluations FROM anon, authenticated;
