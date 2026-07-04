-- 002_fx_strength_tables.sql
-- VPS/MT5 Currency Strength Meter infrastructure tables

-- Feed registry
CREATE TABLE IF NOT EXISTS broker_feeds (
  id            SERIAL PRIMARY KEY,
  feed_name     TEXT UNIQUE NOT NULL,
  feed_type     TEXT NOT NULL DEFAULT 'mt5',
  server_name   TEXT NOT NULL,
  symbol_suffix TEXT DEFAULT '',
  timezone      TEXT DEFAULT 'UTC',
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Canonical → broker symbol mapping
CREATE TABLE IF NOT EXISTS symbol_mapping (
  id                SERIAL PRIMARY KEY,
  canonical_symbol  TEXT NOT NULL,
  broker_symbol     TEXT NOT NULL,
  feed_name         TEXT NOT NULL REFERENCES broker_feeds(feed_name),
  UNIQUE(canonical_symbol, feed_name)
);

-- Scanner health: one row per scanner+timeframe_group, upserted each run
CREATE TABLE IF NOT EXISTS scanner_health (
  id                    SERIAL PRIMARY KEY,
  scanner_name          TEXT NOT NULL,
  timeframe_group       TEXT NOT NULL,
  active_feed_name      TEXT,
  last_success_at       TIMESTAMPTZ,
  last_candle_time      TIMESTAMPTZ,
  last_error            TEXT,
  symbols_processed     INT DEFAULT 0,
  timeframes_processed  INT DEFAULT 0,
  scanner_version       TEXT,
  status                TEXT DEFAULT 'unknown',
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scanner_name, timeframe_group)
);

-- Strength snapshots with feed metadata (new, replaces currency_strength_snapshots long-term)
CREATE TABLE IF NOT EXISTS fx_strength_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  type                TEXT NOT NULL,
  feed_name           TEXT,
  scanner_version     TEXT,
  run_info            JSONB,
  pairs               JSONB,
  currencies_raw      JSONB,
  currencies_weighted JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fx_strength_snapshots_type_created
  ON fx_strength_snapshots(type, created_at DESC);

-- Per-pair component detail (linked to snapshot)
CREATE TABLE IF NOT EXISTS fx_strength_components (
  id           BIGSERIAL PRIMARY KEY,
  snapshot_id  BIGINT REFERENCES fx_strength_snapshots(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  tf1          TEXT,
  tf1_trend    TEXT,
  tf2          TEXT,
  tf2_trend    TEXT,
  pair_label   TEXT,
  confidence   FLOAT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fx_strength_components_snapshot
  ON fx_strength_components(snapshot_id);

-- Latest candle per symbol+timeframe (health monitoring only, not full candle storage)
CREATE TABLE IF NOT EXISTS fx_candles (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  feed_name   TEXT NOT NULL,
  time        TIMESTAMPTZ NOT NULL,
  close       FLOAT NOT NULL DEFAULT 0,
  tick_vol    INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timeframe, feed_name)
);

-- ── Seed data ──────────────────────────────────────────────────────────────

INSERT INTO broker_feeds (feed_name, feed_type, server_name, symbol_suffix, timezone, status)
VALUES ('metaquotes_demo', 'mt5', 'MetaQuotes-Demo', '', 'UTC', 'active')
ON CONFLICT (feed_name) DO NOTHING;

INSERT INTO symbol_mapping (canonical_symbol, broker_symbol, feed_name) VALUES
  ('EURUSD',  'EURUSD',  'metaquotes_demo'),
  ('GBPUSD',  'GBPUSD',  'metaquotes_demo'),
  ('USDJPY',  'USDJPY',  'metaquotes_demo'),
  ('USDCHF',  'USDCHF',  'metaquotes_demo'),
  ('USDCAD',  'USDCAD',  'metaquotes_demo'),
  ('AUDUSD',  'AUDUSD',  'metaquotes_demo'),
  ('NZDUSD',  'NZDUSD',  'metaquotes_demo'),
  ('EURGBP',  'EURGBP',  'metaquotes_demo'),
  ('EURJPY',  'EURJPY',  'metaquotes_demo'),
  ('EURCHF',  'EURCHF',  'metaquotes_demo'),
  ('EURCAD',  'EURCAD',  'metaquotes_demo'),
  ('EURAUD',  'EURAUD',  'metaquotes_demo'),
  ('EURNZD',  'EURNZD',  'metaquotes_demo'),
  ('GBPJPY',  'GBPJPY',  'metaquotes_demo'),
  ('GBPCHF',  'GBPCHF',  'metaquotes_demo'),
  ('GBPCAD',  'GBPCAD',  'metaquotes_demo'),
  ('GBPAUD',  'GBPAUD',  'metaquotes_demo'),
  ('GBPNZD',  'GBPNZD',  'metaquotes_demo'),
  ('AUDJPY',  'AUDJPY',  'metaquotes_demo'),
  ('AUDCHF',  'AUDCHF',  'metaquotes_demo'),
  ('AUDCAD',  'AUDCAD',  'metaquotes_demo'),
  ('AUDNZD',  'AUDNZD',  'metaquotes_demo'),
  ('NZDJPY',  'NZDJPY',  'metaquotes_demo'),
  ('NZDCHF',  'NZDCHF',  'metaquotes_demo'),
  ('NZDCAD',  'NZDCAD',  'metaquotes_demo'),
  ('CADJPY',  'CADJPY',  'metaquotes_demo'),
  ('CADCHF',  'CADCHF',  'metaquotes_demo'),
  ('CHFJPY',  'CHFJPY',  'metaquotes_demo')
ON CONFLICT (canonical_symbol, feed_name) DO NOTHING;
