-- Trading journal — trades and their execution legs (IntelliTrade Pro feature).
--
-- Ported (reduced v1 scope) from the donor journal codebase at
-- claudeLoad/IntelliJournalProdReady (sql/journal_schema.sql). Deliberate scope
-- cuts vs the donor:
--   * NO accounts / instruments / strategies tables. `symbol` is plain text on
--     the trade (uppercase ticker, e.g. EURUSD/XAUUSD); "strategies" collapse
--     into the free-form `tags` array.
--   * NO screenshots / reviews / exports in v1 (no screenshot_urls, no reviews
--     table, no risk_markers, no materialized stats view — stats are computed
--     app-side in lib/journal-trades.ts).
--   * NO slippage column on legs (fees only).
--   * NO CREATE TYPE enums — TEXT + CHECK keeps the migration dashboard-runnable
--     and idempotent-friendly (re-runs never trip an "already exists" on a type).
--
-- `context` is a JSONB passthrough that phase J2 will fill with an auto-captured
-- market-context stamp (CSM / DXY / session at trade-open time). It is an opaque
-- object here; the shape is owned app-side.
--
-- RLS mirrors migration 006 (calculator_account_templates): SELECT is owner-only
-- (a lapsed Pro user keeps read access to their own journal), while
-- INSERT/UPDATE/DELETE additionally require an active/trialing subscription row
-- (defense in depth alongside the API routes). `user_id` is denormalized onto
-- journal_trade_legs so leg policies need no join back to journal_trades.

CREATE TABLE IF NOT EXISTS journal_trades (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol         TEXT          NOT NULL CHECK (symbol ~ '^[A-Z0-9]{3,15}$'),
  bias           TEXT          NOT NULL CHECK (bias IN ('long', 'short')),
  setup          TEXT          CHECK (setup IS NULL OR char_length(setup) <= 120),
  thesis         TEXT          CHECK (thesis IS NULL OR char_length(thesis) <= 2000),
  risk_per_trade NUMERIC(12,2) CHECK (risk_per_trade IS NULL OR risk_per_trade > 0),
  target_r       NUMERIC(6,2)  CHECK (target_r IS NULL OR target_r > 0),
  tags           TEXT[]        NOT NULL DEFAULT '{}',
  opened_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at      TIMESTAMPTZ,
  context        JSONB         NOT NULL DEFAULT '{}'::jsonb
                               CHECK (jsonb_typeof(context) = 'object'),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_trade_legs (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id    UUID          NOT NULL REFERENCES journal_trades(id) ON DELETE CASCADE,
  -- Denormalized so RLS policies match on auth.uid() = user_id with no join.
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side        TEXT          NOT NULL CHECK (side IN ('buy', 'sell')),
  qty         NUMERIC(15,6)  NOT NULL CHECK (qty > 0),
  price       NUMERIC(15,6)  NOT NULL CHECK (price > 0),
  fee         NUMERIC(12,2)  NOT NULL DEFAULT 0 CHECK (fee >= 0),
  executed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_trades_user_opened_idx
  ON journal_trades (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS journal_trade_legs_trade_idx
  ON journal_trade_legs (trade_id);
CREATE INDEX IF NOT EXISTS journal_trade_legs_user_idx
  ON journal_trade_legs (user_id);

ALTER TABLE journal_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trade_legs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- journal_trades policies (idempotent: drop-then-create so re-runs are safe).
-- ---------------------------------------------------------------------------

-- Reads: owner only. Deliberately NOT gated on subscription so a lapsed Pro
-- user keeps read access to their own journal.
DROP POLICY IF EXISTS "Users can view own journal trades" ON journal_trades;
CREATE POLICY "Users can view own journal trades"
  ON journal_trades FOR SELECT
  USING (auth.uid() = user_id);

-- Mutations: owner AND active subscription (defense in depth with the API).
DROP POLICY IF EXISTS "Pro users can insert own journal trades" ON journal_trades;
CREATE POLICY "Pro users can insert own journal trades"
  ON journal_trades FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

DROP POLICY IF EXISTS "Pro users can update own journal trades" ON journal_trades;
CREATE POLICY "Pro users can update own journal trades"
  ON journal_trades FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

DROP POLICY IF EXISTS "Pro users can delete own journal trades" ON journal_trades;
CREATE POLICY "Pro users can delete own journal trades"
  ON journal_trades FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

-- ---------------------------------------------------------------------------
-- journal_trade_legs policies (same structure; owner via denormalized user_id).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own journal trade legs" ON journal_trade_legs;
CREATE POLICY "Users can view own journal trade legs"
  ON journal_trade_legs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Pro users can insert own journal trade legs" ON journal_trade_legs;
CREATE POLICY "Pro users can insert own journal trade legs"
  ON journal_trade_legs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

DROP POLICY IF EXISTS "Pro users can update own journal trade legs" ON journal_trade_legs;
CREATE POLICY "Pro users can update own journal trade legs"
  ON journal_trade_legs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

DROP POLICY IF EXISTS "Pro users can delete own journal trade legs" ON journal_trade_legs;
CREATE POLICY "Pro users can delete own journal trade legs"
  ON journal_trade_legs FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

-- Reuse the shared updated_at trigger from migration 001. Only journal_trades
-- carries updated_at (legs are immutable executions, replaced wholesale).
DROP TRIGGER IF EXISTS journal_trades_updated_at ON journal_trades;
CREATE TRIGGER journal_trades_updated_at
  BEFORE UPDATE ON journal_trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
