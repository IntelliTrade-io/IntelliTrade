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

## Ops

- **No repo-linked migration flow** *(2026-07-04)*
  `supabase/migrations/*.sql` are run by hand in the SQL editor (002–004 tables even predate their migration files; 4 tables exist only in the dashboard). Consider `supabase` CLI link + `db push` so migrations are tracked and reproducible, and backfill migration files for the dashboard-created tables (`conflict_cache`, `scanner_results`, `currency_strength_snapshots`, `economic_events`).
