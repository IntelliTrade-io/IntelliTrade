# coding: utf-8
"""
Single source of truth for every tunable in the CSM review pipeline.

Thresholds mirror lib/strengthInterpretation.ts (70/50/30/15, fade 10) so the
review states match the vocabulary Pro users see, re-based to the true 4h daily
cadence (the frontend heuristic's LOOKBACK_POINTS=24 / MATURE_REFRESHES=48
assume hourly data and are cadence-mistuned for the 6-runs/day scanner).

All decisions here were founder-approved 2026-07-19; they stay behind named
constants because they remain tunable during shadow mode before the flag flips.
Nothing in this module performs IO.
"""

from __future__ import annotations

from intellitrade_scanners.strength_core import CURRENCIES, DEFAULT_PAIRS, MODEL_VERSION

# ── Score bands (mirror lib/strengthInterpretation.ts, -100..100 scale) ──
STRONG_T = 70.0
CONFIRMED_T = 50.0
ACTIVE_T = 30.0
WATCH_T = 15.0
FADE_DELTA = 10.0

# ── Cadence re-base for the 4h daily scanner (6 runs/day) ──
# Frontend uses LOOKBACK_POINTS=24 / MATURE_REFRESHES=48 (hourly assumption).
LOOKBACK_SNAPSHOTS = 6    # ~1 trading day of history for movement/fade
MATURE_SNAPSHOTS = 12     # ~2 days of consecutive confirmed snapshots => mature

# ── Case qualification / reset (§3.3, §4.3-4.4) ──
BEST_EXPRESSION_MIN_CONFIDENCE = 60.0
RESET_SNAPSHOTS = 6       # consecutive failing valid snapshots that reset a regime
MIN_SYMBOLS = 28          # symbols_ok required for a snapshot to be case-eligible

# ── Snapshot validity ──
RUN_WINDOW_MINUTES = 65   # a run must land within this many minutes after an H4 boundary
H4_HOURS = 4

# ── Horizons (§3.5). Bar counts are canonical; "one/two trading weeks" is copy only. ──
SHORT_BARS = 30           # forward bar 30 => short result (~1 FX trading week)
LONG_BARS = 60            # forward bar 60 => long result (~2 weeks)
PAST_DUE_DAYS = 5         # unresolved gaps past this => withheld_missing_data

# ── Classification (§3.7) ──
NEUTRAL_BAND_PCT = 0.50   # +/- band on the normalized 60-bar return

# ── Version stamps (bump => new lineage; old cases never recomputed) ──
STATE_ENGINE_VERSION = "1.0.0"
EVALUATION_VERSION = "1.0.0"
TEMPLATE_VERSION = "1.0.0"
PAYLOAD_SCHEMA_VERSION = 1
METHODOLOGY_VERSION = "1.0.0"
MODEL_GENERATION_LABEL = "Methodology v1"   # customer-facing generation label

# ── Timeframe label used in the candle archive ──
CANDLE_TIMEFRAME = "4hour"

# Re-export the canonical universe so the review package has one import site.
__all__ = [
    "CURRENCIES", "DEFAULT_PAIRS", "MODEL_VERSION",
    "STRONG_T", "CONFIRMED_T", "ACTIVE_T", "WATCH_T", "FADE_DELTA",
    "LOOKBACK_SNAPSHOTS", "MATURE_SNAPSHOTS",
    "BEST_EXPRESSION_MIN_CONFIDENCE", "RESET_SNAPSHOTS", "MIN_SYMBOLS",
    "RUN_WINDOW_MINUTES", "H4_HOURS",
    "SHORT_BARS", "LONG_BARS", "PAST_DUE_DAYS", "NEUTRAL_BAND_PCT",
    "STATE_ENGINE_VERSION", "EVALUATION_VERSION", "TEMPLATE_VERSION",
    "PAYLOAD_SCHEMA_VERSION", "METHODOLOGY_VERSION", "MODEL_GENERATION_LABEL",
    "CANDLE_TIMEFRAME",
    # forbidden terms for the deterministic explainer / copy lint
    "FORBIDDEN_TERMS",
]

# Terms that must never appear in any customer-facing review copy (legal + Google;
# this product is analytics, not a signals service). The explainer test enforces
# this over rendered prose; the frontend copy-lint test enforces it over the TS
# copy constants.
FORBIDDEN_TERMS = (
    "signal", "entry signal", "buy", "sell", "guaranteed", "high probability trade",
    "profit", "trade result", "stop loss", "take profit", "r multiple",
    "backtested edge", "winning trade", "losing trade",
)
