# Intraday Currency Strength + Entry Assist

Internal engineering reference. Research terminology is used freely here; none of
it may reach the customer UI (see the forbidden-terminology list below). Product
framing: this is educational decision support, **not** a signals service.

Supporting research context: `claudeLoad/IntelliTrade_Intraday_Entry_Assist_Guidebook.pdf`.
Where this document and the guidebook differ, **this document wins** — in particular
the rule counts are locked at 3 Tier 1 / 9 Tier 2 / 5 Watchlist (the guidebook's
17/7 figures are outdated), and there are no "Primary/Secondary Entry Assist"
customer labels (customer states are Watching / Confirmed / Fading only).

## Purpose and boundaries

The Intraday panel shows currency strength context and intraday momentum. Entry
Assist highlights a small, researched set of pair + session combinations when their
momentum conditions are met. It is context, never a standalone trade instruction,
and it never becomes a signal, recommendation, buy/sell call, or guarantee.

## Architecture

```
Supabase currency_strength_snapshots (type='intraday')
  -> lib/server/entry-assist/snapshots.ts   (fetch + normalize window)
  -> lib/server/entry-assist/evaluator.ts   (pure, stateless state machine)
  -> lib/server/entry-assist/dto.ts         (public projection + reason whitelist)
  -> app/api/entry-assist/route.ts          (subscription-gated GET)
  -> types/domain/entry-assist.ts           (public DTO shape)
  -> components/dashboardv2/panels/intraday/*  (client UI via apiGet)
```

The rulebook (`lib/server/entry-assist/rulebook.ts`) is server-only and is never
serialized to clients. The client only ever sees `EntryAssistResponse`.

## Rulebook

Variants (internal): `BEST` = gap source `gap_ema3`, entry_gap (level L) = 20,
confirm_bars = 2, require_pair_alignment = true, require_dual_currency_move = false.
`STRICT` = identical with entry_gap = 30.

The research horizon (32 / 48) is an evaluation window only and is **not** used as a
customer-facing candidate lifetime.

### Tier 1 — enabled by default, flag `primary`

| id | symbol | session | variant | horizon | model | n | expectancyR | winRate | breakeven | edge | stability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gbpusd-asia | GBPUSD | ASIA_0000_0659_LDN | BEST | 32 | TP2.0/SL1.0 | 110 | +0.309 | 43.64% | 33.33% | +10.30% | 3.68 |
| gbpaud-asia | GBPAUD | ASIA_0000_0659_LDN | BEST | 32 | TP2.0/SL1.0 | 101 | +0.248 | 41.58% | 33.33% | +8.25% | 3.09 |
| gbpjpy-ny-afternoon | GBPJPY | NY_AFTERNOON_1200_1659_NY | STRICT | 32 | TP2.0/SL1.0 | 61 | +0.215 | 40.98% | 33.33% | +7.65% | 3.18 |

### Tier 2 — disabled by default, flag `secondary` (exactly 9)

| id | symbol | session | variant | horizon | model | n | expectancyR | winRate | edge | stability |
|---|---|---|---|---|---|---|---|---|---|---|
| audusd-dead | AUDUSD | DEAD_OTHER | STRICT | 32 | TP2.0/SL1.0 | 28 | +0.607 | 53.57% | +20.24% | 3.88 |
| chfjpy-asia | CHFJPY | ASIA_0000_0659_LDN | STRICT | 32 | TP2.0/SL1.0 | 113 | +0.195 | 39.82% | +6.49% | 2.86 |
| gbpnzd-ny-morning | GBPNZD | NY_MORNING_OVERLAP_0800_1159_NY | BEST | 32 | TP0.5/SL0.5 | 47 | +0.277 | 63.83% | +13.83% | 3.52 |
| gbpusd-london-midday | GBPUSD | LONDON_MIDDAY_1100_1259_LDN | BEST | 48 | TP2.0/SL1.0 | 39 | +0.361 | 48.72% | +15.38% | 3.16 |
| usdjpy-london-midday | USDJPY | LONDON_MIDDAY_1100_1259_LDN | STRICT | 48 | TP1.0/SL1.0 | 28 | +0.357 | 67.86% | +17.86% | 3.23 |
| cadjpy-london-open | CADJPY | LONDON_OPEN_0700_1059_LDN | BEST | 32 | TP1.0/SL0.75 | 47 | +0.241 | 53.19% | +10.33% | 3.11 |
| audnzd-asia | AUDNZD | ASIA_0000_0659_LDN | BEST | 32 | TP2.0/SL1.0 | 110 | +0.118 | 37.27% | +3.94% | 2.52 |
| gbpchf-ny-afternoon | GBPCHF | NY_AFTERNOON_1200_1659_NY | STRICT | 32 | TP1.0/SL0.75 | 49 | +0.190 | 51.02% | +8.16% | 3.13 |
| eurcad-london-open | EURCAD | LONDON_OPEN_0700_1059_LDN | STRICT | 32 | TP2.0/SL1.0 | 65 | +0.200 | 40.00% | +6.67% | 2.46 |

### Watchlist — internal only, flag `watchlist` (exactly 5)

Never customer-eligible, even when the flag is on.

| id | symbol | session | variant | horizon | model | n | expectancyR | winRate | edge |
|---|---|---|---|---|---|---|---|---|---|
| gbpcad-dead | GBPCAD | DEAD_OTHER | STRICT | 32 | TP2.0/SL1.0 | 23 | +0.435 | 47.83% | +14.49% |
| usdchf-asia | USDCHF | ASIA_0000_0659_LDN | BEST | 32 | TP2.0/SL1.0 | 106 | +0.075 | 35.85% | +2.52% |
| cadchf-dead | CADCHF | DEAD_OTHER | BEST | 32 | TP1.5/SL1.0 | 25 | +0.300 | 52.00% | +12.00% |
| gbpaud-ny-afternoon | GBPAUD | NY_AFTERNOON_1200_1659_NY | BEST | 32 | TP1.5/SL1.0 | 55 | +0.152 | 38.18% | +4.85% |
| audjpy-london-open | AUDJPY | LONDON_OPEN_0700_1059_LDN | STRICT | 32 | TP1.5/SL1.0 | 50 | +0.100 | 44.00% | +4.00% |

## Feature flags (server env; values never leave the server)

| Flag | Default | Override |
|---|---|---|
| `enablePrimaryEntryAssist` | true | `ENTRY_ASSIST_PRIMARY_DISABLED=1` disables |
| `enableSecondaryEntryAssist` | false | `ENTRY_ASSIST_SECONDARY_ENABLED=1` enables |
| `enableMomentumWatchlist` | false | `ENTRY_ASSIST_WATCHLIST_ENABLED=1` enables |

Under default flags only the three Tier 1 rules are customer-eligible. Tier 2 is
gated by `secondary`. Watchlist is excluded from the public API regardless of flags.

## Sessions

Timezone-aware membership via native `Intl.DateTimeFormat` with a named `timeZone`
(repo idiom; DST-correct). No fixed UTC offsets, no date libraries, no new deps.
Windows are whole hours inclusive to :59:59. London and New York windows are judged
independently in their own timezones (no forced global exclusivity).

| SessionId | Timezone | Local window | Customer label |
|---|---|---|---|
| ASIA_0000_0659_LDN | Europe/London | 00:00-06:59 | Asia session |
| LONDON_OPEN_0700_1059_LDN | Europe/London | 07:00-10:59 | London open |
| LONDON_MIDDAY_1100_1259_LDN | Europe/London | 11:00-12:59 | London midday |
| NY_MORNING_OVERLAP_0800_1159_NY | America/New_York | 08:00-11:59 | New York morning overlap |
| NY_AFTERNOON_1200_1659_NY | America/New_York | 12:00-16:59 | New York afternoon |
| DEAD_OTHER | (fallback) | outside all defined sessions | never shown |

## Evaluator behavior

Pure function, no I/O, no memory, no DB writes. It recomputes candidate state
deterministically from the snapshot window on every request; that is how state
"persists" across requests, refreshes, and server restarts.

- **Gap** per snapshot = baseScore - quoteScore (from `currencies_weighted`).
- **Smoothed gap** = streaming EMA, alpha 0.5 (span-3 EMA: alpha = 2/(3+1)),
  initialized from the first valid gap: `ema = 0.5*gap + 0.5*prevEma`. This matches
  the validated fallback; the original research EMA code is not in this repository.
- **Level L** = 20 (BEST) or 30 (STRICT).
- **Crossover** (bullish): prev ema < +L, current ema >= +L, two-snapshot change
  `ema[i]-ema[i-2]` >= 0, the snapshot is in the rule's session, and pair alignment
  is bullish. Bearish is mirrored. Requires at least two prior valid snapshots.
- **Pair alignment**: use the scanner's trusted `pairs[symbol].pair` label
  ("bullish"/"bearish"/"neutral"); "neutral" is not aligned. Only when the label is
  missing for a snapshot, fall back to the sign of the gap.
- **persist2 (founder-locked)**: confirm_bars = 2 means two qualifying snapshots in
  total, and the crossover snapshot counts as the FIRST. The immediately following
  ordered snapshot is the second. Earliest Confirmed is therefore crossover+1, never
  crossover+2 (that would be persist3). A single crossover snapshot alone only ever
  yields Watching, which surfaces as final output only when the crossover is on the
  newest snapshot.
- **Cooldown (founder-confirmed)**: 4 snapshots from crossover creation, tracked per
  symbol, suppressing duplicate NEW crossover events only. It never blocks lifecycle
  updates (Watching -> Confirmed -> Fading) of an existing candidate.
- **States**: Watching (crossover snapshot, confirmation pending) -> Confirmed
  (separation held at the next snapshot with valid direction, alignment, session,
  freshness). Confirmed -> Fading when separation weakens (|ema| < L or the
  two-snapshot change opposes the direction) while the alignment label still matches.
- **Fading** is a temporary customer-facing lifecycle state, visible for at most 2
  snapshots (~30 min at the 15-min cadence), then removed. It is not a research
  threshold.
- **Immediate removal** (never Fading): alignment invalidates (inverts or goes
  neutral); required scores missing; data stale; the validated session ends (no
  cross-session continuation); direction invalidates; invalid timestamps.
- **Staleness**: newest intraday snapshot older than 35 minutes -> zero candidates
  (not even Watching). Empty history -> zero candidates.
- **Robustness**: out-of-order input is sorted; duplicate asof keeps the latest
  created_at; invalid/missing timestamps or non-numeric scores drop that snapshot;
  the evaluator never throws on bad data.

## Public DTO boundary

`app/api/entry-assist/route.ts` returns `EntryAssistResponse`
(`types/domain/entry-assist.ts`): `{ candidates, dataStatus, evaluatedAt }`.
Each candidate carries only: id, symbol, baseCode, quoteCode, direction, state,
sessionLabel, reasons, updatedAt.

`reasons` come from a fixed whitelist only: "Momentum aligned", "Gap healthy",
"Gap weakening", "Confirmation developing", "Pair alignment active",
"Momentum easing", and (STRICT Confirmed only) "Strong momentum confirmation".

The serialized response never contains: internal variant names, thresholds,
confirm counts, research statistics (n, expectancy, win rate, edge, stability,
breakeven), TP/SL, tier names, flag values, DEAD_OTHER, horizons, or any rule
beyond the eligible set.

`dataStatus`: `unavailable` (no intraday rows), `stale` (newest snapshot older than
35 min), or `ok`. There is no daily-data fallback and candidates are never faked.

## Forbidden customer terminology

None of the following may appear in customer-rendered UI (case-insensitive):
H1, M15, H4, D1, BEST, STRICT, gap_ema3, gap20, gap30, persist2, entry_gap,
threshold, confirm_bars, TP2.0, SL1.0, "fixed target", "fixed stop", "sample size",
expectancy, "win rate", "stability score", "breakeven rate", edge, BOS, ADX, CHOP,
"dual-currency move", "key TFs", crossover, backtested, signal, "entry signal", buy,
sell, guaranteed, high-probability. Also: no em dashes in customer copy, say
"strength gap" (never "spread"), never "Bullish / Bullish", never display DEAD_OTHER
or "Off-session", and never use "Primary/Secondary Entry Assist" as customer labels.

Safe vocabulary: currency strength context, intraday momentum, Entry Assist,
Momentum aligned, Gap healthy, Gap weakening, Confirmation developing, Pair
alignment active, Momentum easing, Watching, Confirmed, Fading.

## Tests

- `lib/server/entry-assist/sessions.test.ts` — boundary hours, DST both sides of a
  London and a New York change, independent membership.
- `lib/server/entry-assist/rulebook.test.ts` — 3/9/5 counts, flag eligibility,
  watchlist never eligible, DTO leaks no research keys.
- `lib/server/entry-assist/evaluator.test.ts` — crossover, persist2 (Confirmed at
  crossover+1), STRICT gating, alignment gating, lifecycle transitions, Fading bound,
  cooldown, robustness, session/rule scoping.
- `lib/server/entry-assist/copy.test.ts` — no em dash, no forbidden terms, no doubled
  bias row, no server import in components, reason whitelist.
- `lib/intradayFilters.test.ts` — chip toggles, last-visible guard, pair focus,
  persistence round-trip.

## Assumptions

- The VPS scanner writes `pairs[symbol].pair` labels; when absent for a snapshot the
  evaluator falls back to the gap-sign check.
- Fresh intraday snapshots exist within the queried 14h window. If the scanner has
  not produced intraday rows, `dataStatus` is `unavailable` and no candidates show.

## Roadmap (NOT implemented here)

- Future: Support and Resistance confluence research.
- Future: activation logging for live monitoring and drift review.
