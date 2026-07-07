# Improvement Backlog

Ideas spotted while working — product/content/architecture improvements that are **not** part of the refactor cleanup (that lives in `REFACTOR_PLAN.md`). Add anything here that "could be better later"; pick items up when there's room.

Format: what · why · rough approach. Date each entry.

---

## Content

- **Price-today pages: hardcoded daily content → Sanity** *(2026-07-04, owner)*
  `gold/silver/oil/bitcoin-price-today` pages contain narrative/analysis content that should change daily but is hardcoded in the components. Move it to Sanity (e.g. a `dailyMarketNote` document type per instrument) so it's editable without deploys; pages already fetch from Sanity for the blog, same client can serve these.

## API / data

- **`/api/scrape` is dead code** *(2026-07-04)*
  It spawns `scraper/cli.py`, which does not exist in the repo — the route has 500'd on every call since inception. Now gated behind `SCRAPE_SECRET`, but the real question is remove-or-repoint (the actual scraper lives in `scripts/economic_calendar_scraper.py` and runs on the VPS). Candidate for deletion in Phase 4 verification pass.

- **CurrencyFreaks env rename + key rotation** *(2026-07-04)*
  `/api/rates` proxy + `/api/dxy` read `CURRENCYFREAKS_API_KEY` with a legacy fallback to `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY`. In Vercel: add the non-public var, remove the `NEXT_PUBLIC_` one, then **rotate the key** at CurrencyFreaks (old one was browser-exposed). After rotation, delete the fallback from both routes.

- **Price pages poll client-side per visitor** *(2026-07-04)*
  Each visitor's browser polls `/api/rates` on an interval (gold/silver/bitcoin pages). Server proxy now caches 60s upstream, which caps quota burn, but a nicer shape is a single server-fetched quote (route handler or RSC with `revalidate`) shared by all visitors + client refresh via one lightweight endpoint.

## Free-module ideas (traffic drivers)

Owner standing request *(2026-07-04)*: free tier is blog + lot size calculator + prices-today; wants more free modules/functions that attract traffic. Candidates (all cheap on data, SEO-friendly, natural upsell into premium):

- **Pip value calculator** — sibling of the lot size calc, reuses `/api/rates`. High search volume ("pip value EURUSD"). Near-zero build cost.
- **Margin / leverage calculator** — same shell, no external data at all.
- **Compounding / growth calculator** — "grow $1k at 2%/week" tables; pure client math, very shareable.
- **Forex market hours / session clock** — "is the London session open" queries; static timezone logic, pairs well with existing session logic in the S&R engine.
- **Economic calendar teaser** — today-only, delayed, no filters; upsell to the full premium calendar. Reuses `economic_events` behind a limited public endpoint.
- **Currency strength teaser** — yesterday's daily snapshot only (delayed data), static daily render; upsell to live meter.
- **Currency correlation matrix** — 30-day pair correlations from candles already in Supabase; classic evergreen tool page.
- **Spread/swap glossary + per-pair "what is" pages** — programmatic SEO pages fed from Sanity, feeds the blog cluster.

- **Currency-strength meter Vite source not in repo** *(2026-07-04)*
  `public/currency-strength-meter{,-intraday}/assets/index-*.{js,css}` are prebuilt Vite bundles (~810 KB) with **no source in this repo** — they're the only copy, built somewhere external (see `claudeLoad/STRENGTH_METER_DEV_HANDOFF.md`). Risk: unreproducible artifact; any change requires whoever holds the source. Bring the Vite app in-repo (e.g. `apps/strength-meter/`) with a build step that outputs into `public/`, then gitignore the bundles. Ties into Phase 6.1 strength-engine dedup.

## Paid-module ideas (subscription value) *(2026-07-05)*

All built on pipelines that already run — cost is frontend + one API route each, no new data collection. **Framing constraint (owner, 2026-07-05): nothing may be positioned as signals or trade recommendations — hard no (legal + Google Ads). Everything below ships as analytics/monitoring language: "notify me when the data changes", never "trade this".**

- **SR Alpha alerts** · retention driver; traders pay for "tell me when", not "make me watch" · Discord/Telegram webhook (fields already in `scripts/vps/config_template.env`) + email when an opportunity hits grade ≥ user threshold. Watchdog already polls every 5 min; same loop can diff `sr_opportunities`.
- **Strength regime-change alerts + history charts** · `currency_strength_snapshots` has been accumulating daily+hourly rows for months; nothing surfaces the time dimension · per-currency score sparkline (30/90d), alert when bias flips Strong↔Weak. Data sitting in Supabase.
- **Scanner-grade "Best Expressions"** · handoff doc (`claudeLoad/STRENGTH_METER_DEV_HANDOFF.md`) documents the current React ranking as a wrong approximation; real per-pair confidence/BOS now flows through the consolidated runners · new `/api/currency-strength-pairs` from snapshot `pairs`, swap `computeExpressions` to real data. Sell as "ranked by multi-timeframe confirmation, not spread math".
- **Event-risk overlay** · `economic_events` × pairs the user watches → "high-impact USD event in 6h touches 4 of your pairs" · join on currency, next-24h window; dashboard panel + optional alert.
- **Track-record page** · graded SR opportunities scored against realized outcomes from stored `market_candles` — verifiable performance converts skeptics (and keeps us honest) · nightly job grades past opportunities; page shows hit-rate per grade.
- **Agreement screener** · both scanner families (D1/H4 + H1/M15) write snapshots; pairs where daily and intraday direction agree = the strongest signal we produce · one query over the two latest snapshots, filterable table.

## SEO *(2026-07-05)*

- **Programmatic per-pair strength pages** (`/currency-strength/eur-usd`, 28 pairs) · long-tail "eurusd strength today" queries; we render live per-pair data nobody else serves server-side · ISR from latest snapshot, real numbers + templated analysis (avoid thin content: include BOS dates, confidence, small history table). Free teaser, detail locked → upsell path.
- **Replicate the lot-size-calc SEO pattern** (proven Apr 2026) on the sibling calculators above: own URL, FAQ schema, worked examples each. Calculators are the proven free-traffic engine here.
- **Free economic-calendar teaser page** · "forex economic calendar this week" is high-volume and ours is premium-only, so Google never sees it · public page with today's high-impact rows (or 24h delay), full calendar gated. Already a free-module candidate above — the SEO case makes it first in line.
- **prices-today enrichment** · pages are thin (live quote + hardcoded text — see Content entry) · add yesterday/7d/30d change, related-instrument links, FAQPage JSON-LD. More long-tail surface per page.
- **Internal-linking pass** · blog posts rarely link to calculators/tools and tools don't link back · related-tools block in the Sanity post template + related-articles on tool pages. Cheapest crawl-equity win available.

## Launch prep

- **Alpha demo accounts (free premium access)** *(2026-07-05, owner)*
  Founders will hand out free demo accounts for alpha testing soon. Gating today = `subscriptions` table row with status `active`/`trialing` (checked by `lib/auth/requireSubscription` + middleware), populated by Stripe webhooks. Cleanest options: (a) Stripe promotion code for a 100%-off trial — zero code, testers walk the real checkout, webhook keeps the row in sync; (b) manual `subscriptions` rows with status `active` and no Stripe customer — fastest but verify the webhook/portal code paths don't choke on a row without a Stripe subscription id (cancel/upgrade flows). Decide before invites go out; (a) preferred.

## Ops

- **No repo-linked migration flow** *(2026-07-04)*
  `supabase/migrations/*.sql` are run by hand in the SQL editor (002–004 tables even predate their migration files; 4 tables exist only in the dashboard). Consider `supabase` CLI link + `db push` so migrations are tracked and reproducible, and backfill migration files for the dashboard-created tables (`conflict_cache`, `scanner_results`, `currency_strength_snapshots`, `economic_events`).

- **CSM data-freshness surfacing (from the 2026-07-07 outage):** the strength API silently serves week-old snapshots. Product fix: route already returns `cacheAgeSeconds` — dashboard panel should render a "data from Xh ago" badge / warning state when age exceeds ~2× scan cadence, so stale pipelines are visible to users AND founders instead of failing silent. Ops fix: a tiny GitHub-scheduled workflow that checks `scanner_health.updated_at` staleness and fails loudly (email) when >N hours — off-box watchdog replacing the VPS-resident one.
