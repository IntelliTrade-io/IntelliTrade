-- 004_sr_close_reclaim.sql
-- Adds close-reclaim confirmation state to sr_opportunities.
-- Populated by the worker via zone_detector.close_reclaim_state (touch -> close
-- above zone_high within max_confirm_wait_bars, active within max_hold_bars).

ALTER TABLE sr_opportunities
  ADD COLUMN IF NOT EXISTS close_reclaim        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reclaim_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sr_opportunities_close_reclaim
  ON sr_opportunities (symbol, close_reclaim, calculated_at DESC);
