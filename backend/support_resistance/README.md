# IntelliTrade — Support & Resistance Alpha (backend)

Backend skeleton + Supabase-ready scoring pipeline for the locked research model:

> **EURUSD Dynamic Support Reclaim Opportunity Score v1**

**Not a trading signal product.** The backend calculates zones and opportunity
*grades*; the frontend only displays the latest scored rows. All research ranges
are educational decision support, not advice. See the disclaimer at the bottom.

---

## Alpha scope (this pass)

| In scope | Not in scope (intentionally) |
|---|---|
| EURUSD only | Other pairs, XAUUSD |
| Support zones only | Resistance zones |
| M15 execution context | — |
| Close-reclaim opportunity model (touch → close-above confirmation) | Broker execution / live trading |
| Short-term first reaction, ~0.50R target, 0.30 ATR stop buffer | Alerts, full scanner, production optimisation |
| Session filter: exclude late | Frontend-side scoring |

## Locked model parameters

Source of truth: [`fixtures/locked_phase39_config.json`](fixtures/locked_phase39_config.json).
Nothing is hardcoded elsewhere — `config.py` loads this file and **fails loudly**
if a required field is missing.

- symbol `EURUSD`, zone_variant `m10_s20`, zone_type `support_only`
- confirmation `close_reclaim`, target_r `0.50`, stop_buffer_atr `0.30`
- max_touch_wait_bars `384`, max_confirm_wait_bars `8`, max_hold_bars `48`
- session_filter `exclude_late`
- **Dynamic score = the original Phase 36 model.** The rejected Phase 38
  anti-chase variants are deliberately **not** implemented.

### Scoring (Phase 36)

```
dynamic_opportunity_score = static_zone_score
                          + positive_components
                          + session_score
                          + penalties
```

- static_zone_score: weak 0.0 / medium 1.0 / strong 2.0
- +1.00 no_sharp_bearish_m15_12  (m15_return_12_atr > -1.00)
- +0.50 balanced_m15_impulse_12  (-1.00 ≤ m15_return_12_atr ≤ 2.00)
- +0.75 h1_trend_basic  (H1 above EMA200 AND H1 EMA200 slope ≥ 0)
- +0.50 h4_trend_basic  (H4 above EMA200 AND H4 EMA200 slope ≥ 0)
- +0.25 m15_h1_above_ema200
- session_score: asia +1.00 / london_midday +0.75 / ny_open +0.15 / london_open −0.35 / other 0.00
- penalties: −1.25 if m15_return_12_atr ≤ −1.00; −0.35 if ≥ 2.00; −0.35 if session == london_open

### Grades (thresholds from the locked config)

| Grade | Rule | Status |
|---|---|---|
| A+ | score ≥ 4.5 | A+ review |
| Elite Green | 3.65 ≤ score < 4.5 | Elite review |
| Green | 2.8 ≤ score < 3.65 | Active review |
| Watch | 2.00 ≤ score < 2.8 | Monitor only |
| Blue | informational-only zone (also used for late-session demotion) | Monitor only |
| Blocked | score < 2.00 or invalid | Blocked |

---

## Run locally

```bash
# 1. deps (core scoring + golden validation need only the stdlib)
pip install -r backend/support_resistance/requirements.txt

# 2. golden fixture regression — the correctness gate
python backend/support_resistance/run_fixture_validation.py
#   -> rows tested / passed / failed, plus first failures if any

# 3. full pipeline against synthetic candles (no MT5, no Supabase)
python backend/support_resistance/run_sr_alpha.py --source mock --dry-run

# 3b. against a local OHLC csv (columns: time,open,high,low,close[,volume])
python backend/support_resistance/run_sr_alpha.py --source csv --csv path/to/eurusd_m15.csv --dry-run

# 4. tests
python -m pytest backend/support_resistance/tests/ -q
```

## Golden fixture validation (mandatory)

[`fixtures/golden_backend_fixture.csv`](fixtures/golden_backend_fixture.csv) is the
regression contract. For every row the backend must reproduce
`dynamic_opportunity_score` (|actual − expected| ≤ 1e-9) and `dynamic_grade`
(exact). `run_fixture_validation.py` and `tests/test_golden_fixture.py` both
enforce this. **Current status: 50/50 rows pass.** If this ever fails, the
backend has diverged from the locked research branch — fix the backend, do not
edit the fixture.

## Environment variables

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY     # backend only — NEVER expose to the frontend
MT5_SERVER / MT5_LOGIN / MT5_PASSWORD   # optional; blank = use logged-in terminal
```

On the VPS these live in `C:\IntelliTrade\config\.env` (same convention as the
currency-strength scanners in `scripts/vps/`).

## Supabase tables

Migration: [`supabase/migrations/003_sr_alpha_tables.sql`](../../supabase/migrations/003_sr_alpha_tables.sql)

- `market_candles` — EURUSD OHLC store (upsert on `symbol,timeframe,time`)
- `sr_zones` — detected static support zones (upsert on `symbol,zone_side,zone_created_time,model_version`)
- `sr_opportunities` — dynamic grades per zone (upsert on `zone_id,model_version`) ← **the dashboard reads this**

model_version everywhere: `eurusd_support_reclaim_v1`.

## How the frontend consumes rows

The dashboard component (`SupportResistanceAlphaModule`) already exists. It reads
the **latest** `sr_opportunities` rows joined to their `sr_zones`, then maps them
with the existing `fromSupabaseRow` helper. Field alignment:

| sr_opportunities column | frontend field |
|---|---|
| `dynamic_grade` (canonical key) | `dynamicGrade` (gradeConfig.ts key) |
| `static_strength` | `staticStrength` |
| `research_reaction_low/high` | `reactionRange.min/max` |
| `status` | scanner status text |
| `session_quality` / `approach_quality` | context quality copy |

> The backend does **not** implement frontend-side scoring. The frontend renders
> pre-scored rows only.

## What is mocked / TODO

- **Close-reclaim qualifier is implemented** (`zone_detector.close_reclaim_state`):
  a touch (bar overlapping the zone) followed by a bar that CLOSES above
  `zone_high` within `max_confirm_wait_bars`, "active" within `max_hold_bars`.
  Surfaced on `sr_opportunities` as `close_reclaim` + `reclaim_confirmed_at`
  (migration 004). Validated by unit tests of the mechanics — note there is **no
  reclaim-timing golden fixture**, so it is not validated against the research
  branch's per-trade timings (only the dynamic *score* is golden-validated).
- **Zone geometry** is an engineering reconstruction, not research ground truth.
  Only the *dynamic score* is validated against the research branch. Detection is
  locked against regressions by `tests/test_zone_detector.py`
  (`test_zone_detection_regression_three_shelves`) — a behaviour lock, not a
  research fixture. Tunables: `PIVOT_STRENGTH`, `ZONE_MERGE_ATR_FRAC`,
  `ZONE_BAND_ATR_FRAC`.
- **MT5 symbol_map is wired**: `fetch_candles.load_symbol_map()` reads the active
  feed's `symbol_mapping` rows (env `ACTIVE_FEED_NAME`) and passes the canonical→
  broker map to `feed_adapter.fetch_df`. Falls back to the adapter's 1:1 default
  if Supabase is unconfigured/unreadable.
- **H1/H4 context** is derived by resampling M15 (research-permitted) rather than
  from dedicated feeds.

## What is intentionally NOT implemented yet

Resistance zones · other pairs · alerts · broker execution · signal language ·
live trading · full production optimisation · frontend scoring.

---

## Developer handoff notes

### Files created

```
backend/support_resistance/
  __init__.py
  config.py                 # loads locked_phase39_config.json, fails loudly on missing fields
  indicators.py             # ATR14, EMA, m15_return_12_atr, EMA200 slope, UTC sessions (pure Python)
  static_strength.py        # touch_count -> weak/medium/strong
  dynamic_score.py          # locked Phase 36 score + grade mapping  ← golden-validated
  zone_detector.py          # pivot lows -> clusters -> labelled support zones (+ proximity, close-reclaim)
  candle_store.py           # clean/resample M15->H1/H4, sequences, market_candles rows
  fetch_candles.py          # MT5 (reuses VPS adapter) / CSV / deterministic mock
  opportunity_builder.py    # zone + market context -> sr_opportunities row (enforces exclude_late)
  supabase_writer.py        # upsert candles / zones / opportunities (service-role key)
  run_sr_alpha.py           # end-to-end runner + run summary
  run_fixture_validation.py # golden fixture CLI
  requirements.txt
  README.md                 # this file
  fixtures/
    locked_phase39_config.json
    golden_backend_fixture.csv
  tests/
    conftest.py
    test_static_strength.py
    test_dynamic_score.py
    test_golden_fixture.py
    test_indicators.py
    test_opportunity_builder.py

supabase/migrations/003_sr_alpha_tables.sql   # market_candles, sr_zones, sr_opportunities
supabase/migrations/004_sr_close_reclaim.sql  # + close_reclaim / reclaim_confirmed_at
```

### Run the Alpha backend locally
`python backend/support_resistance/run_sr_alpha.py --source mock --dry-run`

### Run the golden fixture validation
`python backend/support_resistance/run_fixture_validation.py`  (expects 50/50)

### Schedule on VPS (every 15 minutes)
Windows Task Scheduler (matches `scripts/vps/setup_windows_tasks.ps1` style) or cron:
```
*/15 * * * *  python C:\IntelliTrade\backend\support_resistance\run_sr_alpha.py
```
Ensure `C:\IntelliTrade\config\.env` provides SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
(and MT5 creds if the terminal isn't already logged in).

### How Supabase rows map to the dashboard
Frontend reads latest `sr_opportunities` (joined to `sr_zones`) filtered by
`symbol='EURUSD'`, ordered by `calculated_at DESC`, and renders via
`fromSupabaseRow`. See the mapping table above.

### Assumptions made
- H1/H4 derived by resampling M15 (no separate feeds required).
- Sessions bucketed in **UTC** (research convention); MT5 feed returns UTC times.
- `dynamic_grade` stored as the canonical key (`a_plus`, `elite_green`, …) to
  match `gradeConfig.ts`; `status` stored as the display string.
- Late-session zones are demoted to `blue` / Monitor only rather than dropped, so
  they still appear on the map as informational.
- Grade at score exactly 2.00 = Watch; below 2.00 = Blocked (per grade rules).

### Exact TODOs remaining
1. Obtain research-branch reclaim/zone ground truth to validate zone geometry and
   reclaim timing against (current coverage is regression + mechanics tests only).
2. Surface `close_reclaim` in the dashboard UI (stored + queryable now; not yet shown).
3. Merge to `main` so the Vercel dashboard picks up the module.

---

> **Disclaimer:** Research-backed ranges are based on historical testing and are
> for educational decision support only. They are not trading signals, financial
> advice, or guarantees of future results.
