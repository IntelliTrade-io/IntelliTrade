-- Calculator account templates (IntelliTrade Pro feature).
-- Named, cloud-synced calculator profiles: account balance, currency, default
-- risk %, optional broker name, and per-instrument MT4/MT5 contract overrides.
-- These are manual profiles only; no broker credentials or secrets are stored.
--
-- instrument_overrides is validated JSONB rather than a normalized child table:
-- the data is small (a handful of instruments per template), always read and
-- written together with its template, and this repo has no child-table
-- precedent to follow. Shape (enforced app-side, typed in
-- lib/calculator-templates.ts):
--   { "XAUUSD": { "contractSize": 100, "minLot": 0.01, "lotStep": 0.01 }, ... }

CREATE TABLE IF NOT EXISTS calculator_account_templates (
  id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT          NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 60),
  balance              NUMERIC(16,2) NOT NULL CHECK (balance > 0),
  currency             TEXT          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  risk_percent         NUMERIC(7,4)  NOT NULL CHECK (risk_percent > 0 AND risk_percent <= 100),
  broker_name          TEXT          CHECK (broker_name IS NULL OR char_length(broker_name) <= 80),
  is_default           BOOLEAN       NOT NULL DEFAULT FALSE,
  instrument_overrides JSONB         NOT NULL DEFAULT '{}'::jsonb
                                     CHECK (jsonb_typeof(instrument_overrides) = 'object'),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calculator_account_templates_user_idx
  ON calculator_account_templates (user_id);

-- One template name per user (case-insensitive); duplicates get " copy" names.
CREATE UNIQUE INDEX IF NOT EXISTS calculator_account_templates_user_name_key
  ON calculator_account_templates (user_id, lower(name));

-- At most one default template per user.
CREATE UNIQUE INDEX IF NOT EXISTS calculator_account_templates_one_default
  ON calculator_account_templates (user_id) WHERE is_default;

ALTER TABLE calculator_account_templates ENABLE ROW LEVEL SECURITY;

-- Reads: owner only. Deliberately NOT gated on subscription status so a lapsed
-- Pro user keeps read access to their templates (read-only paid data), matching
-- how the product treats expired subscriptions. Templates are never deleted on
-- lapse.
CREATE POLICY "Users can view own calculator templates"
  ON calculator_account_templates FOR SELECT
  USING (auth.uid() = user_id);

-- Mutations: owner AND active subscription. Entitlement is enforced here at
-- the database as well as in the API routes (defense in depth). The
-- subscriptions SELECT policy from migration 001 lets a user read their own
-- row, so the EXISTS check works under RLS.
CREATE POLICY "Pro users can insert own calculator templates"
  ON calculator_account_templates FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

CREATE POLICY "Pro users can update own calculator templates"
  ON calculator_account_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

CREATE POLICY "Pro users can delete own calculator templates"
  ON calculator_account_templates FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid() AND s.status IN ('active', 'trialing')
    )
  );

-- Reuse the shared updated_at trigger from migration 001.
CREATE TRIGGER calculator_account_templates_updated_at
  BEFORE UPDATE ON calculator_account_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
