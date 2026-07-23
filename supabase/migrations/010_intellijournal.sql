-- Trading Journal Schema for Supabase
-- This file contains all the necessary SQL to set up the trading journal module

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom enums
CREATE TYPE asset_class_enum AS ENUM ('fx', 'crypto', 'equity', 'index', 'commodity');
CREATE TYPE trade_bias_enum AS ENUM ('long', 'short');
CREATE TYPE trade_side_enum AS ENUM ('buy', 'sell');
CREATE TYPE review_period_enum AS ENUM ('weekly', 'monthly');

-- Create tables

-- Accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    broker TEXT,
    base_currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(base_currency) = 3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Instruments table
CREATE TABLE instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    asset_class asset_class_enum NOT NULL,
    tick_size NUMERIC(10, 6) DEFAULT 0.01,
    contract_size NUMERIC(10, 2) DEFAULT 1.0,
    quote_currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(quote_currency) = 3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

-- Strategies table
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Sessions table (journal sessions / notes)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    notes_pre TEXT,
    notes_post TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Trades table (one logical trade; may have many legs)
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    setup TEXT,
    bias trade_bias_enum NOT NULL,
    thesis TEXT,
    risk_per_trade NUMERIC(10, 2),
    target_r NUMERIC(5, 2),
    tags TEXT[] DEFAULT '{}',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    screenshot_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade legs table (executions)
CREATE TABLE trade_legs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    side trade_side_enum NOT NULL,
    qty NUMERIC(15, 6) NOT NULL CHECK (qty > 0),
    price NUMERIC(15, 6) NOT NULL CHECK (price > 0),
    fee NUMERIC(10, 2) DEFAULT 0 CHECK (fee >= 0),
    slippage NUMERIC(10, 2) DEFAULT 0,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Risk markers table (optional stop/target trail log)
CREATE TABLE risk_markers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    stop_price NUMERIC(15, 6),
    target_price NUMERIC(15, 6),
    noted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period review_period_enum NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    notes TEXT,
    auto_stats JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period, period_start)
);

-- Create materialized view for trade statistics
CREATE MATERIALIZED VIEW trade_stats_mv AS
SELECT
    t.id,
    t.user_id,
    t.account_id,
    t.instrument_id,
    t.strategy_id,
    t.setup,
    t.bias,
    t.tags,
    t.opened_at,
    t.closed_at,
    -- Calculate P&L
    CASE
        WHEN t.bias = 'long' THEN
            COALESCE(SUM(CASE WHEN tl.side = 'sell' THEN tl.qty * tl.price ELSE -tl.qty * tl.price END), 0)
        WHEN t.bias = 'short' THEN
            COALESCE(SUM(CASE WHEN tl.side = 'buy' THEN -tl.qty * tl.price ELSE tl.qty * tl.price END), 0)
    END AS pnl_gross,
    -- Calculate total fees
    COALESCE(SUM(tl.fee), 0) AS fees_total,
    -- Calculate net P&L
    CASE
        WHEN t.bias = 'long' THEN
            COALESCE(SUM(CASE WHEN tl.side = 'sell' THEN tl.qty * tl.price ELSE -tl.qty * tl.price END), 0) - COALESCE(SUM(tl.fee), 0)
        WHEN t.bias = 'short' THEN
            COALESCE(SUM(CASE WHEN tl.side = 'buy' THEN -tl.qty * tl.price ELSE tl.qty * tl.price END), 0) - COALESCE(SUM(tl.fee), 0)
    END AS pnl_net,
    -- Calculate R-multiple
    CASE
        WHEN t.risk_per_trade > 0 THEN
            (CASE
                WHEN t.bias = 'long' THEN
                    COALESCE(SUM(CASE WHEN tl.side = 'sell' THEN tl.qty * tl.price ELSE -tl.qty * tl.price END), 0) - COALESCE(SUM(tl.fee), 0)
                WHEN t.bias = 'short' THEN
                    COALESCE(SUM(CASE WHEN tl.side = 'buy' THEN -tl.qty * tl.price ELSE tl.qty * tl.price END), 0) - COALESCE(SUM(tl.fee), 0)
            END) / t.risk_per_trade
        ELSE NULL
    END AS r_multiple,
    -- Calculate duration in minutes
    CASE
        WHEN t.closed_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (t.closed_at - t.opened_at)) / 60
        ELSE NULL
    END AS duration_min,
    -- Extract weekday and hour
    EXTRACT(DOW FROM t.opened_at) AS weekday,
    EXTRACT(HOUR FROM t.opened_at) AS hour_of_day,
    -- Get instrument symbol
    i.symbol,
    i.asset_class,
    -- Get strategy name
    s.name AS strategy_name
FROM trades t
LEFT JOIN trade_legs tl ON t.id = tl.trade_id
LEFT JOIN instruments i ON t.instrument_id = i.id
LEFT JOIN strategies s ON t.strategy_id = s.id
GROUP BY t.id, t.user_id, t.account_id, t.instrument_id, t.strategy_id, t.setup, t.bias, t.tags,
         t.opened_at, t.closed_at, t.risk_per_trade, i.symbol, i.asset_class, s.name;

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_trade_stats_mv()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW trade_stats_mv;
END;
$$ LANGUAGE plpgsql;

-- Intentionally do not auto-refresh this materialized view on every trade write.
-- Refresh it from a controlled admin task or scheduled job after the production stats strategy is finalized.

-- Create indexes for performance
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_instruments_user_id ON instruments(user_id);
CREATE INDEX idx_instruments_asset_class ON instruments(user_id, asset_class);
CREATE INDEX idx_strategies_user_id ON strategies(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_opened_at ON trades(user_id, opened_at DESC);
CREATE INDEX idx_trades_account_id ON trades(account_id);
CREATE INDEX idx_trades_instrument_id ON trades(instrument_id);
CREATE INDEX idx_trades_strategy_id ON trades(strategy_id);
CREATE INDEX idx_trade_legs_trade_id ON trade_legs(trade_id);
CREATE INDEX idx_trade_legs_executed_at ON trade_legs(trade_id, executed_at);
CREATE INDEX idx_risk_markers_trade_id ON risk_markers(trade_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_period_start ON reviews(user_id, period_start);

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_trade_stats_mv_id ON trade_stats_mv(id);

-- Enable Row Level Security (RLS)
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Accounts policies
CREATE POLICY "Users can view their own accounts" ON accounts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own accounts" ON accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own accounts" ON accounts
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own accounts" ON accounts
    FOR DELETE USING (auth.uid() = user_id);

-- Instruments policies
CREATE POLICY "Users can view their own instruments" ON instruments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own instruments" ON instruments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own instruments" ON instruments
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own instruments" ON instruments
    FOR DELETE USING (auth.uid() = user_id);

-- Strategies policies
CREATE POLICY "Users can view their own strategies" ON strategies
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own strategies" ON strategies
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own strategies" ON strategies
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own strategies" ON strategies
    FOR DELETE USING (auth.uid() = user_id);

-- Sessions policies
CREATE POLICY "Users can view their own sessions" ON sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sessions" ON sessions
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sessions" ON sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Trades policies
CREATE POLICY "Users can view their own trades" ON trades
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trades" ON trades
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trades" ON trades
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own trades" ON trades
    FOR DELETE USING (auth.uid() = user_id);

-- Trade legs policies
CREATE POLICY "Users can view trade legs for their trades" ON trade_legs
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_legs.trade_id AND trades.user_id = auth.uid()
    ));
CREATE POLICY "Users can insert trade legs for their trades" ON trade_legs
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_legs.trade_id AND trades.user_id = auth.uid()
    ));
CREATE POLICY "Users can update trade legs for their trades" ON trade_legs
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_legs.trade_id AND trades.user_id = auth.uid()
    ));
CREATE POLICY "Users can delete trade legs for their trades" ON trade_legs
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_legs.trade_id AND trades.user_id = auth.uid()
    ));

-- Risk markers policies
CREATE POLICY "Users can view risk markers for their trades" ON risk_markers
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = risk_markers.trade_id AND trades.user_id = auth.uid()
    ));
CREATE POLICY "Users can insert risk markers for their trades" ON risk_markers
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = risk_markers.trade_id AND trades.user_id = auth.uid()
    ));
CREATE POLICY "Users can update risk markers for their trades" ON risk_markers
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = risk_markers.trade_id AND trades.user_id = auth.uid()
    ));
CREATE POLICY "Users can delete risk markers for their trades" ON risk_markers
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = risk_markers.trade_id AND trades.user_id = auth.uid()
    ));

-- Reviews policies
CREATE POLICY "Users can view their own reviews" ON reviews
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reviews" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reviews" ON reviews
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reviews" ON reviews
    FOR DELETE USING (auth.uid() = user_id);

-- Demo seed data is intentionally excluded from the base schema file.
-- Use scripts/seed-journal-demo.ts with a real auth user ID for local/demo fixtures.

-- Private screenshot storage. Hosted bucket creation and policy verification remain
-- launch-time checks, but the desired state is version controlled here.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journal-screenshots',
  'journal-screenshots',
  false,
  8388608,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Journal owners can read screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'journal-screenshots'
  AND (storage.foldername(name))[1] = 'journal'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Journal owners can upload screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'journal-screenshots'
  AND (storage.foldername(name))[1] = 'journal'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Journal owners can delete screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'journal-screenshots'
  AND (storage.foldername(name))[1] = 'journal'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Atomic trade + leg creation. SECURITY INVOKER keeps RLS active.
CREATE OR REPLACE FUNCTION create_journal_trade(
  p_account_id uuid,
  p_instrument_id uuid,
  p_strategy_id uuid,
  p_setup text,
  p_bias trade_bias_enum,
  p_thesis text,
  p_risk_per_trade numeric,
  p_target_r numeric,
  p_tags text[],
  p_opened_at timestamptz,
  p_screenshot_urls text[],
  p_legs jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_trade_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND user_id = auth.uid())
     OR NOT EXISTS (SELECT 1 FROM instruments WHERE id = p_instrument_id AND user_id = auth.uid())
     OR (p_strategy_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM strategies WHERE id = p_strategy_id AND user_id = auth.uid()
     )) THEN
    RAISE EXCEPTION 'Journal reference is not owned by the current user';
  END IF;

  INSERT INTO trades (
    user_id, account_id, instrument_id, strategy_id, setup, bias, thesis,
    risk_per_trade, target_r, tags, opened_at, screenshot_urls
  ) VALUES (
    auth.uid(), p_account_id, p_instrument_id, p_strategy_id, p_setup, p_bias,
    p_thesis, p_risk_per_trade, p_target_r, COALESCE(p_tags, '{}'),
    p_opened_at, COALESCE(p_screenshot_urls, '{}')
  ) RETURNING id INTO v_trade_id;

  INSERT INTO trade_legs (trade_id, side, qty, price, fee, slippage, executed_at)
  SELECT
    v_trade_id,
    (leg->>'side')::trade_side_enum,
    (leg->>'qty')::numeric,
    (leg->>'price')::numeric,
    COALESCE((leg->>'fee')::numeric, 0),
    COALESCE((leg->>'slippage')::numeric, 0),
    (leg->>'executed_at')::timestamptz
  FROM jsonb_array_elements(p_legs) AS leg;

  RETURN v_trade_id;
END;
$$;

-- Full-set replacement is deliberately the only leg mutation contract.
CREATE OR REPLACE FUNCTION replace_journal_trade_legs(
  p_trade_id uuid,
  p_legs jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trades WHERE id = p_trade_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Journal trade not found';
  END IF;

  DELETE FROM trade_legs WHERE trade_id = p_trade_id;

  INSERT INTO trade_legs (trade_id, side, qty, price, fee, slippage, executed_at)
  SELECT
    p_trade_id,
    (leg->>'side')::trade_side_enum,
    (leg->>'qty')::numeric,
    (leg->>'price')::numeric,
    COALESCE((leg->>'fee')::numeric, 0),
    COALESCE((leg->>'slippage')::numeric, 0),
    (leg->>'executed_at')::timestamptz
  FROM jsonb_array_elements(p_legs) AS leg;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
