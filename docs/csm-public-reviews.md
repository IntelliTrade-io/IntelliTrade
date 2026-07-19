# CSM Public Reviews — "What Happened Next?"

Automated, deterministic public reviews of past Daily currency-strength readings.
A downstream pipeline that never touches the scanner's calculations: it reads the
append-only snapshot history plus its own H4 candle archive, qualifies cases,
evaluates 30/60-bar forward outcomes, classifies them, and publishes a page per
completed case. Analytics language only — this is not a signals service.

Source of truth for decisions: `claudeLoad/CSM_REVIEW_PLAN.md` and
`claudeLoad/CSM_REVIEW_OPUS_PROMPT.md`. This file is the operator/developer guide.

## Product purpose

For each day when one currency read clearly strongest and another clearly weakest,
show what the conventional pair actually did over the following weeks, measured and
classified deterministically. Every qualifying completed case is published,
positive or negative. The reviews are free (the whole `currency-strength` segment is
outside the premium middleware matcher).

## Security boundary

- All seven-plus review tables have RLS enabled and `REVOKE ALL FROM anon,
  authenticated` in the same migration that creates them (repo invariant). No anon
  policy exists anywhere. Even the "public" projection tables are anon-denied.
- Pages read via `supabaseAdmin` (service role, `lib/supabase/admin.ts`) server-side
  only, exactly like the free teaser. There is no client-callable candle endpoint.
- `scripts/ci/anon-rls-check.mjs` lists all new tables; CI fails if any becomes
  anon-readable.
- The service-role key is only read in `lib/supabase/admin.ts` (frontend) and the
  Python PostgREST client. No `NEXT_PUBLIC_` variables were added. A vitest asserts
  no review client component references the service key or the admin client.

## Snapshot lineage, immutability, hashing

- Stage 1 (`ingest.py`) copies qualifying (and, for lineage, invalid) daily
  `fx_strength_snapshots` rows into the immutable `csm_review_snapshots`.
- Each row stores the full original payload, a sha256 of its canonically-serialized
  form (`payload_hash`), the derived 8-row ladder, the canonical `candle_close_ts`,
  and quality flags. A BEFORE UPDATE trigger raises an exception: the table is
  write-once. The audit job re-hashes payloads and alerts on drift.
- `UNIQUE(source_snapshot_id)` and `UNIQUE(feed_name, snapshot_type,
  candle_close_ts)` make ingestion idempotent and kill weekend-stale / manual-rerun
  duplicates. Invalid rows are stored with `completeness='invalid'` and are never
  case-eligible.

## Case selection + reset

Qualification (extremes-based, per snapshot) requires ALL of:
- ladder rank 1 score >= +50 and rank 8 score <= -50 (Confirmed band);
- the conventional pair for (strong, weak) exists among the 28
  (`best_expression.conventional_pair`, ported from `lib/strength.ts`
  `getCanonicalPair`, parity-tested on all 56 ordered pairs);
- the stored `pairs[pair].pair` label is non-neutral and direction-consistent;
- stored `confidence >= 60`;
- the state engine's regime for the strong currency is fresh/confirmed/mature.

A case opens at the first qualifying snapshot. The same (pair, direction,
model_version) cannot re-open until qualification has failed on >= 6 consecutive
valid snapshots (a genuine reset). Lineage is per (pair, direction, model_version):
a model change is a separate lineage that never collides with the old one.

## State engine + versions

`state_engine.py` (`STATE_ENGINE_VERSION`) is the single review state
implementation: deterministic fresh/confirmed/mature/fading/none, thresholds
mirroring `lib/strengthInterpretation.ts` (70/50/30/15, fade 10), re-based to the
4h cadence (lookback 6 snapshots, mature 12 consecutive confirmed snapshots). The
paid dashboard keeps its own frontend heuristic untouched (documented divergence;
migrating it to server states is a future owner decision).

## Best Expression qualification

Server-side, from stored fields — not the frontend's score-spread approximation.
The conventional pair plus the stored `pair` label and `confidence` are the source
of truth.

## Candle source, storage, gap policy

- `candles.py` (Stage 2) fetches H4 bars for all 28 pairs via the same feed adapter
  the scanner uses, drops the forming bar, and upserts into `fx_ohlc_candles`
  keyed by `(feed_name, symbol, timeframe, open_time)`.
- Gaps over the expected weekday 4h grid are detected and surfaced to the watchdog
  (weekends are not gaps). First deploy backfills ~1500 bars/pair
  (`--backfill-candles 1500`).
- Pairs the demo feed cannot serve stay uncovered; a case on an uncovered pair ends
  `withheld_missing_data`. Nothing is ever fabricated.

## Horizon convention (exact off-by-one)

- `candle_close_ts = floor4h(run ts_utc)`.
- Reference (bar 0) candle: `open_time = candle_close_ts - 4h`, closing at
  `candle_close_ts`. Reference price = its close, from `fx_ohlc_candles` only.
- Forward bar 1 = the next fully closed H4 candle (`open_time = candle_close_ts`).
- Short result = close of forward bar 30; long result = close of forward bar 60.
- Weekends vanish through weekday bar counting. Publication requires 60 verified
  contiguous forward bars; missing bars block. A case > 5 calendar days past due
  with unresolved gaps becomes `withheld_missing_data`.

## Direction normalization + outcome metrics

`direction_multiplier = +1` if the strong currency is the pair's base, else -1.
Normalized return = raw * multiplier, so a strong-base pair rising and a strong-quote
pair falling both read positive. MFE (max continuation) uses highs when +1 / lows
when -1; MAE (largest pullback) uses the adverse extreme, over forward bars 1-60.
Raw and normalized are both stored.

## Classification (band, version)

`classifier.py` (`EVALUATION_VERSION`, `NEUTRAL_BAND_PCT = 0.50`): Continued if the
normalized 60-bar return >= +0.50%, Reversed if <= -0.50%, Mixed otherwise.
Deterministic; raw numbers are always displayed regardless of label.

## Explanation

`explainer.py` (`TEMPLATE_VERSION`) renders deterministic prose from stored facts
only (returns, MFE/MAE, classification, final close vs reference). Facts are stored
as JSONB separately from the rendered text (reproducible). No macro/news/sentiment
claims. The renderer refuses any forbidden trading term.

## Publication lifecycle + slugs

`publisher.py` (Stage 5, flag-gated by `CSM_PUBLIC_REVIEWS_ENABLED=true`) copies
whitelisted fields into `csm_public_reviews`. Slug:
`{strong}-strongest-{weak}-weakest-{month}-{day}-{year}` lowercase, `-2` suffix on
same-day collision, permanent once assigned. `chart_from = reference_open_time - 30
bars`, `chart_to = long_bar_close_time`. Idempotent via `UNIQUE(case_id)` +
`UNIQUE(slug)`. Monthly grouping is by capture month (UTC).

## Public DTO whitelist

`lib/api/csmReviews.ts` returns strict DTOs (allowed keys only; a vitest snapshots
the exact key set). Forbidden from any DTO: internal case/snapshot ids,
`source_snapshot_id`, run ids, payload/hash, thresholds, feed internals, pending or
incomplete cases, and candles outside `[chart_from, chart_to]` (hard-clamped in
code and tested). Feed name lives on the private case, never in the public row.

## SEO architecture

Nested under the free hub, static segments winning over the `[pair]` dynamic route:
`/currency-strength/reviews` (CollectionPage), `/reviews/[slug]` (WebPage +
BreadcrumbList, self-canonical, unique value-bearing title/description),
`/reviews/monthly/[year]/[month]` (CollectionPage), `/reviews/methodology`,
`/reviews/scorecard`. All ISR `revalidate = 3600`; every route calls
`isCsmReviewsEnabled()` and `notFound()`s when off. `[slug]` uses
`generateStaticParams` from published slugs with `dynamicParams = true`. The sitemap
adds review entries only when the flag is on and at least one case is published.

## Monthly + scorecard methodology

`aggregator.py` (Stage 6) fully recomputes monthly summaries (capture month, only
months with >= 1 published case) and the methodology-version-keyed aggregate stats
(Continued/Mixed/Reversed counts + rates, mean/median normalized 30/60, mean
MFE/MAE, overlap-disclosure count, incomplete-case count). Production cases only; no
reconstructed history, ever.

## Shadow mode + flag

`CSM_PUBLIC_REVIEWS_ENABLED` absent/false = shadow: stages 1-4 + 6 run, publication
(stage 5) is skipped, all routes 404, the sitemap is silent, internal links hidden.
The flag is server-only in both the VPS `.env` (pipeline) and Vercel env (pages).
Never flip it in code; the owner flips it after the shadow sign-off.

## Monitoring

`watchdog.py` gains review checks: runner staleness (> 5h since last ok run), stage
errors, cases withheld for missing data, and public/private count mismatch. Every
stage writes a `csm_review_job_runs` row.

## Failure recovery + model-change policy

Every stage isolates per-item errors and continues; retries happen on the next 4h
sweep. Cases that cannot complete become `withheld_missing_data` /
`failed_validation` with a reason. A new `model_version` is a new lineage: old cases
are never recomputed with a newer model.

## Migration / rollback

Migrations `007_csm_review_lineage.sql`, `008_csm_review_cases.sql`,
`009_csm_review_public.sql` only create new objects (idempotent, `IF NOT EXISTS`).
Rollback = drop the new tables; no existing table is altered. Scanner payload
changes are additive JSONB fields needing no migration.

## Test map

- Python (`intellitrade_scanners/tests/review/`): best_expression parity, state
  engine, ingest (hash/validity/idempotency), candles (forming-bar/gap), detector
  (single-open/reset/direction/lineage), evaluator (off-by-one, both direction
  normalizations, MFE/MAE, gap blocking), classifier bands, explainer determinism +
  forbidden-word guard, publisher (slug/flag/idempotency), aggregator stats.
- Frontend (vitest): DTO whitelist key sets, candle clamp, flag-off data layer,
  ReviewLadder render, copy lint (no em dashes / forbidden terms), server-only
  boundary.

## Founder-approved decisions log (all 2026-07-19)

Case-opening rule and reset (rank +/-50, confidence 60, reset 6 snapshots); 30/60
H4-bar horizons; classification band +/-0.50%; same-feed invariant. All remain
tunable behind named constants during shadow mode.

## Future extensions

Violet strength-gap chart line (no trustworthy preserved per-case H4 series today);
migrating the paid dashboard panel to consume the server-computed states.
