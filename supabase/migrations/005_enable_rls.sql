-- 005_enable_rls.sql
-- SECURITY (audit finding C1): RLS was enabled on `subscriptions` only. Every other
-- table was world-readable/writable via the public anon key (shipped to every browser)
-- through the Supabase REST endpoint, bypassing all Next.js route gating.
--
-- This migration enables Row Level Security on every data table and adds NO anon/
-- authenticated policies, so those roles are denied by default. All application access
-- goes through server routes using the service-role key (lib/supabase/admin.ts), which
-- has BYPASSRLS and is unaffected. `subscriptions` keeps its existing user-scoped
-- SELECT policy (created in 001) — do not touch it here.
--
-- Idempotent: ALTER TABLE IF EXISTS covers tables created outside the repo migrations
-- (conflict_cache, scanner_results, currency_strength_snapshots, economic_events were
-- created ad-hoc in the Supabase dashboard). Safe to re-run.

-- ── 002 fx strength infrastructure ───────────────────────────────────────────
ALTER TABLE IF EXISTS broker_feeds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS symbol_mapping          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scanner_health          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fx_strength_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fx_strength_components  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fx_candles              ENABLE ROW LEVEL SECURITY;

-- ── 003 support/resistance alpha ─────────────────────────────────────────────
ALTER TABLE IF EXISTS market_candles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sr_zones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sr_opportunities        ENABLE ROW LEVEL SECURITY;

-- ── created outside repo migrations (dashboard-authored) ─────────────────────
ALTER TABLE IF EXISTS conflict_cache              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scanner_results             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS currency_strength_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS economic_events             ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: revoke any default table privileges granted to the public
-- API roles. Enabling RLS with no policy already denies them; this removes the
-- underlying grant too. Wrapped so a missing table cannot abort the migration.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'broker_feeds','symbol_mapping','scanner_health','fx_strength_snapshots',
    'fx_strength_components','fx_candles','market_candles','sr_zones',
    'sr_opportunities','conflict_cache','scanner_results',
    'currency_strength_snapshots','economic_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', t);
    END IF;
  END LOOP;
END $$;
