-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_customer_id      TEXT        NOT NULL,
  stripe_subscription_id  TEXT,
  plan                    TEXT        NOT NULL DEFAULT 'demo',   -- 'demo' | 'pro'
  status                  TEXT        NOT NULL DEFAULT 'inactive', -- mirrors Stripe: active | trialing | past_due | canceled | inactive
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
