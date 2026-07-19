-- 010_newsletter_subscribers.sql
-- Email capture for the weekly strength digest (revenue levers, 2026-07-19).
-- Writes go through the server route /api/newsletter/subscribe using the
-- service-role client; the public roles get no access at all (RLS enabled with
-- no policies + explicit REVOKE, same posture as 005).
--
-- `confirmed_at` stays NULL until a double-opt-in email is sent once an email
-- provider is wired up; until then rows are captured-but-unconfirmed and no
-- mail is sent to them.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  -- Where the signup came from (closed set enforced in the API route):
  -- e.g. 'currency-strength', 'blog', 'economic-calendar'.
  source      text NOT NULL DEFAULT 'unknown',
  created_at  timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created
  ON newsletter_subscribers (created_at DESC);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE newsletter_subscribers FROM anon, authenticated;
