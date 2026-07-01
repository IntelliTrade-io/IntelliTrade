-- 003_sr_alpha_tables.sql
-- IntelliTrade Support & Resistance Alpha
-- Model: EURUSD Dynamic Support Reclaim Opportunity Score v1
-- Scope (this pass): EURUSD support zones only, M15 execution context.
-- The Python worker (backend/support_resistance/run_sr_alpha.py) writes these;
-- the Vercel frontend reads sr_opportunities (joined to sr_zones) only.

-- ── market_candles ────────────────────────────────────────────────────────────
-- EURUSD candle store (full OHLC, unlike fx_candles which is health-only).
CREATE TABLE IF NOT EXISTS market_candles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  time        TIMESTAMPTZ NOT NULL,
  open        NUMERIC NOT NULL,
  high        NUMERIC NOT NULL,
  low         NUMERIC NOT NULL,
  close       NUMERIC NOT NULL,
  volume      NUMERIC,
  source      TEXT NOT NULL DEFAULT 'mt5',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, timeframe, time)
);

CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_tf_time
  ON market_candles (symbol, timeframe, time DESC);

-- ── sr_zones ──────────────────────────────────────────────────────────────────
-- Detected static support zones.
CREATE TABLE IF NOT EXISTS sr_zones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol             TEXT NOT NULL,
  zone_side          TEXT NOT NULL,             -- 'support' (resistance not yet in scope)
  zone_low           NUMERIC NOT NULL,
  zone_high          NUMERIC NOT NULL,
  zone_mid           NUMERIC,
  static_strength    TEXT NOT NULL,             -- 'weak' | 'medium' | 'strong'
  touch_count        INTEGER NOT NULL,
  zone_created_time  TIMESTAMPTZ NOT NULL,
  first_touch_time   TIMESTAMPTZ,
  last_touch_time    TIMESTAMPTZ,
  atr_at_creation    NUMERIC,
  model_version      TEXT NOT NULL,
  is_active          BOOLEAN DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  -- upsert key used by supabase_writer.upsert_zone(...)
  UNIQUE (symbol, zone_side, zone_created_time, model_version)
);

CREATE INDEX IF NOT EXISTS idx_sr_zones_symbol_active
  ON sr_zones (symbol, is_active, last_touch_time DESC);

-- ── sr_opportunities ──────────────────────────────────────────────────────────
-- Dynamic opportunity grades for active zones. One row per (zone, model_version),
-- upserted each run. This is what the dashboard reads.
CREATE TABLE IF NOT EXISTS sr_opportunities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id                UUID REFERENCES sr_zones(id) ON DELETE CASCADE,
  symbol                 TEXT NOT NULL,
  timeframe              TEXT NOT NULL,
  zone_side              TEXT NOT NULL,
  static_strength        TEXT NOT NULL,
  dynamic_grade          TEXT NOT NULL,          -- 'a_plus'|'elite_green'|'green'|'watch'|'blue'|'blocked'
  status                 TEXT NOT NULL,          -- 'A+ review'|'Elite review'|'Active review'|'Monitor only'|'Blocked'
  score                  NUMERIC,
  research_reaction_low  NUMERIC,
  research_reaction_high NUMERIC,
  typical_minimum_r      TEXT,
  target_r_context       NUMERIC NOT NULL DEFAULT 0.50,
  stop_buffer_atr        NUMERIC NOT NULL DEFAULT 0.30,
  session_quality        TEXT,
  approach_quality       TEXT,
  current_session        TEXT,
  m15_return_12_atr      NUMERIC,
  h1_trend_basic         BOOLEAN,
  h4_trend_basic         BOOLEAN,
  notes                  TEXT,
  model_version          TEXT NOT NULL,
  calculated_at          TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  -- upsert key used by supabase_writer.upsert_opportunity(...)
  UNIQUE (zone_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_sr_opportunities_symbol_grade
  ON sr_opportunities (symbol, dynamic_grade, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sr_opportunities_calculated_at
  ON sr_opportunities (calculated_at DESC);
