# coding: utf-8
"""
Canonical currency-strength state engine for the review pipeline.

This is the ONE state implementation used by reviews (detector + audit + pages).
It is deterministic and reproducible from persisted snapshots alone. Thresholds
are imported from constants.py (mirroring lib/strengthInterpretation.ts), re-based
to the true 4h daily cadence. The paid dashboard keeps its own frontend heuristic
untouched (documented divergence, follow-up owner decision).

States: fresh | confirmed | mature | fading | none.
Pure functions only — no IO.
"""

from __future__ import annotations

from dataclasses import dataclass

from intellitrade_scanners.review.constants import (
    ACTIVE_T,
    CONFIRMED_T,
    FADE_DELTA,
    LOOKBACK_SNAPSHOTS,
    MATURE_SNAPSHOTS,
    STATE_ENGINE_VERSION,
    STRONG_T,
    WATCH_T,
)

VERSION = STATE_ENGINE_VERSION

Stage = str  # "fresh" | "confirmed" | "mature" | "fading" | "none"


@dataclass(frozen=True)
class Movement:
    """Movement of one currency's score over the ordered snapshot history."""
    delta: float                  # score change vs the lookback snapshot
    entered_watch: bool           # crossed into a directional score within lookback
    directional_refreshes: int    # consecutive recent snapshots |score|>=CONFIRMED_T, same sign
    has_history: bool


def _sign(x: float) -> int:
    return (x > 0) - (x < 0)


def compute_movement(series: list[float], lookback: int = LOOKBACK_SNAPSHOTS) -> Movement:
    """Movement from an ordered (oldest -> newest) score series for one currency."""
    if not series or len(series) < 2:
        return Movement(delta=0.0, entered_watch=False, directional_refreshes=0, has_history=False)

    now = series[-1]
    back = series[max(0, len(series) - 1 - lookback)]

    run = 0
    if now != 0:
        direction = _sign(now)
        for s in reversed(series):
            if abs(s) < CONFIRMED_T or _sign(s) != direction:
                break
            run += 1

    return Movement(
        delta=now - back,
        entered_watch=abs(back) < ACTIVE_T <= abs(now),
        directional_refreshes=run,
        has_history=True,
    )


def currency_stage(score: float, movement: Movement | None) -> Stage:
    """Deterministic regime stage for one currency at the latest snapshot.

    Ported from lib/strengthInterpretation.ts interpretCurrency `stage` output,
    re-based to the 4h cadence (mature = MATURE_SNAPSHOTS consecutive confirmed
    snapshots; fresh from a lookback-window watch entry).
    """
    m = movement if (movement and movement.has_history) else None
    abs_s = abs(score)
    positive = score >= 0

    if m:
        weakening = (m.delta < -FADE_DELTA) if positive else (m.delta > FADE_DELTA)
        strengthening = (m.delta > FADE_DELTA) if positive else (m.delta < -FADE_DELTA)
    else:
        weakening = strengthening = False
    mature = (m.directional_refreshes if m else 0) >= MATURE_SNAPSHOTS
    fresh = m.entered_watch if m else False

    if abs_s < WATCH_T:
        return "none"
    if abs_s < ACTIVE_T:
        return "fresh" if strengthening else "none"
    if weakening and abs_s < STRONG_T:
        return "fading"
    if abs_s >= CONFIRMED_T:
        return "mature" if mature else ("fresh" if fresh else "confirmed")
    # ACTIVE_T <= abs_s < CONFIRMED_T
    return "fresh" if fresh else "confirmed"


def stage_for_currency(scores_history: list[dict], code: str,
                       lookback: int = LOOKBACK_SNAPSHOTS) -> Stage:
    """Stage of `code` at the latest snapshot given ordered per-snapshot score maps.

    `scores_history` is oldest -> newest; each element maps currency code -> score.
    """
    series = [float(s.get(code, 0.0)) for s in scores_history]
    if not series:
        return "none"
    return currency_stage(series[-1], compute_movement(series, lookback))
