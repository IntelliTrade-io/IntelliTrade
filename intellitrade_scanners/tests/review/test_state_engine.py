# coding: utf-8
"""State engine determinism (fresh/confirmed/mature/fading/none)."""

from __future__ import annotations

from intellitrade_scanners.review import state_engine as se
from intellitrade_scanners.review.constants import MATURE_SNAPSHOTS


def test_none_below_watch_band():
    assert se.currency_stage(10.0, None) == "none"
    assert se.currency_stage(-14.9, None) == "none"


def test_confirmed_without_history():
    # Strong directional score, no movement history -> confirmed (not fresh/mature).
    assert se.currency_stage(60.0, None) == "confirmed"


def test_mature_after_enough_confirmed_snapshots():
    series = [60.0] * (MATURE_SNAPSHOTS + 1)
    mv = se.compute_movement(series)
    assert mv.directional_refreshes >= MATURE_SNAPSHOTS
    assert se.currency_stage(series[-1], mv) == "mature"


def test_fading_when_weakening_below_strong():
    # Was 70 a day ago, now 55 -> delta -15 < -FADE_DELTA, abs<STRONG -> fading.
    series = [70.0, 70.0, 70.0, 70.0, 70.0, 70.0, 55.0]
    mv = se.compute_movement(series)
    assert se.currency_stage(55.0, mv) == "fading"


def test_fresh_on_watch_entry():
    # Crossed from below ACTIVE into a directional score within the lookback.
    series = [10.0, 12.0, 14.0, 18.0, 22.0, 28.0, 55.0]
    mv = se.compute_movement(series)
    assert mv.entered_watch is True
    assert se.currency_stage(55.0, mv) == "fresh"


def test_stage_for_currency_from_history():
    history = [
        {"EUR": 10.0, "JPY": -10.0},
        {"EUR": 60.0, "JPY": -60.0},
    ]
    assert se.stage_for_currency(history, "EUR") in ("fresh", "confirmed")


def test_movement_no_history_is_flagged():
    mv = se.compute_movement([60.0])
    assert mv.has_history is False
