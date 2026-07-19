-- 007_csm_review_lineage.sql
-- CSM Public Reviews — lineage layer (see docs/csm-public-reviews.md, CSM_REVIEW_PLAN.md §5).
--
-- Three write-once/append-only stores that feed the automated "What Happened
-- Next?" review pipeline downstream of the Daily CSM scanner. Nothing here
-- alters an existing table; the scanner payload changes are additive JSONB
-- fields needing no migration.
--
-- Security: RLS enabled + REVOKE ALL FROM anon, authenticated in THIS file
-- (repo invariant, migration 005 pattern). No anon policies anywhere — all app
-- reads go through the service-role client (lib/supabase/admin.ts) server-side.
--
-- Idempotent (IF NOT EXISTS). Rollback = drop the new objects; no existing
-- table is touched.

-- ── H4 OHLC archive (feed-scoped; deliberately separate from S&R-owned market_candles) ──
CREATE TABLE IF NOT EXISTS fx_ohlc_candles (
  id             BIGSERIAL PRIMARY KEY,
  feed_name      TEXT NOT NULL,
  symbol         TEXT NOT NULL,            -- canonical, e.g. EURJPY
  timeframe      TEXT NOT NULL DEFAULT '4hour',
  open_time      TIMESTAMPTZ NOT NULL,     -- candle open (MT5 convention)
  close_time     TIMESTAMPTZ NOT NULL,     -- open_time + 4h (stored, not derived, for querying)
  open           NUMERIC NOT NULL,
  high           NUMERIC NOT NULL,
  low            NUMERIC NOT NULL,
  close          NUMERIC NOT NULL,
  tick_volume    BIGINT,
  quality        TEXT NOT NULL DEFAULT 'verified',   -- verified | corrected | suspect
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  corrected_at   TIMESTAMPTZ,
  UNIQUE (feed_name, symbol, timeframe, open_time)
);
CREATE INDEX IF NOT EXISTS idx_fx_ohlc_symbol_time
  ON fx_ohlc_candles (symbol, timeframe, open_time DESC);

-- ── Immutable review snapshots (write-once copy of qualifying production runs) ──
CREATE TABLE IF NOT EXISTS csm_review_snapshots (
  id                     BIGSERIAL PRIMARY KEY,
  source_table           TEXT NOT NULL DEFAULT 'fx_strength_snapshots',
  source_snapshot_id     BIGINT NOT NULL UNIQUE,
  source_run_id          UUID,                      -- null for pre-metadata rows (ineligible anyway)
  snapshot_type          TEXT NOT NULL DEFAULT 'daily',
  feed_name              TEXT NOT NULL,
  scanner_version        TEXT NOT NULL,
  model_version          TEXT NOT NULL,
  captured_at            TIMESTAMPTZ NOT NULL,      -- run ts_utc
  candle_close_ts        TIMESTAMPTZ NOT NULL,      -- canonical last fully-closed H4 close
  payload                JSONB NOT NULL,            -- full original pairs+currencies+run_info
  payload_schema_version INT NOT NULL DEFAULT 1,
  payload_hash           TEXT NOT NULL,             -- sha256 of canonical-serialized payload
  ladder                 JSONB NOT NULL,            -- [{rank,currency,score,bias}] x8, derived once at ingest
  completeness           TEXT NOT NULL DEFAULT 'complete',  -- complete | partial | invalid
  quality_flags          JSONB NOT NULL DEFAULT '[]',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feed_name, snapshot_type, candle_close_ts)   -- kills manual-rerun/scheduler duplicates
);

-- Immutability hardening: block every UPDATE at the DB level. The pipeline never
-- updates review snapshots; the audit job re-hashes payloads and alerts on drift.
CREATE OR REPLACE FUNCTION csm_review_snapshots_no_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'csm_review_snapshots is immutable; UPDATE is not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_csm_review_snapshots_no_update ON csm_review_snapshots;
CREATE TRIGGER trg_csm_review_snapshots_no_update
  BEFORE UPDATE ON csm_review_snapshots
  FOR EACH ROW EXECUTE FUNCTION csm_review_snapshots_no_update();

-- ── Pipeline audit log ──
CREATE TABLE IF NOT EXISTS csm_review_job_runs (
  id              BIGSERIAL PRIMARY KEY,
  job_name        TEXT NOT NULL,          -- ingest|candles|detect|evaluate|publish|aggregate|audit
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL,          -- ok | error | skipped
  items_processed INT DEFAULT 0,
  detail          JSONB,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_csm_review_job_runs_job_started
  ON csm_review_job_runs (job_name, started_at DESC);

-- ── RLS + revoke (same migration, repo invariant) ──
ALTER TABLE fx_ohlc_candles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE csm_review_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE csm_review_job_runs   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fx_ohlc_candles, csm_review_snapshots, csm_review_job_runs
  FROM anon, authenticated;
