# coding: utf-8
import pytest

from support_resistance import config
from support_resistance.dynamic_score import (
    ScoreFeatures, score_features, assign_grade_key, assign_dynamic_grade,
    no_sharp_bearish_m15_12, balanced_m15_impulse_12, not_chasing_fast_rally_m15_12,
    h1_trend_basic, h4_trend_basic, m15_h1_above_ema200,
)


def _features(**overrides):
    base = dict(
        static_strength="strong",
        session="asia",
        m15_return_12_atr=0.0,
        h1_above_ema200=True,
        h1_ema200_slope_nonnegative=True,
        h4_above_ema200=True,
        h4_ema200_slope_nonnegative=True,
        m15_above_ema200=True,
    )
    base.update(overrides)
    return ScoreFeatures(**base)


# ── derived booleans ──────────────────────────────────────────────────────────

def test_derived_booleans_thresholds():
    assert no_sharp_bearish_m15_12(-0.99) is True
    assert no_sharp_bearish_m15_12(-1.00) is False
    assert balanced_m15_impulse_12(-1.00) is True
    assert balanced_m15_impulse_12(2.00) is True
    assert balanced_m15_impulse_12(2.01) is False
    assert not_chasing_fast_rally_m15_12(1.99) is True
    assert not_chasing_fast_rally_m15_12(2.00) is False


def test_trend_basic_requires_both_conditions():
    assert h1_trend_basic(_features(h1_above_ema200=True, h1_ema200_slope_nonnegative=True))
    assert not h1_trend_basic(_features(h1_above_ema200=True, h1_ema200_slope_nonnegative=False))
    assert not h1_trend_basic(_features(h1_above_ema200=False, h1_ema200_slope_nonnegative=True))
    assert h4_trend_basic(_features(h4_above_ema200=True, h4_ema200_slope_nonnegative=True))
    assert m15_h1_above_ema200(_features(m15_above_ema200=True, h1_above_ema200=True))
    assert not m15_h1_above_ema200(_features(m15_above_ema200=False, h1_above_ema200=True))


# ── scoring behaviour ─────────────────────────────────────────────────────────

def test_sharp_bearish_approach_downgrades_score():
    clean = score_features(_features(m15_return_12_atr=0.0))
    sharp = score_features(_features(m15_return_12_atr=-2.0))
    # sharp loses the +1.00 (no_sharp) and +0.50 (balanced) positives AND takes
    # the -1.25 penalty => strictly worse.
    assert sharp < clean


def test_clean_trend_context_improves_score():
    weak_ctx = score_features(_features(
        h1_above_ema200=False, h1_ema200_slope_nonnegative=False,
        h4_above_ema200=False, h4_ema200_slope_nonnegative=False,
        m15_above_ema200=False,
    ))
    strong_ctx = score_features(_features())  # all trend flags true
    assert strong_ctx > weak_ctx


def test_fast_rally_chase_penalised():
    balanced = score_features(_features(m15_return_12_atr=1.0))
    chase = score_features(_features(m15_return_12_atr=2.5))
    assert chase < balanced


def test_london_open_penalty_applied():
    other = score_features(_features(session="other"))
    london = score_features(_features(session="london_open"))
    # london_open: session_score -0.35 AND penalty -0.35 vs other 0.0
    assert pytest.approx(other - london, abs=1e-9) == 0.70


# ── grade thresholds ──────────────────────────────────────────────────────────

def test_grade_thresholds_map_correctly():
    thr = config.score_thresholds()
    assert assign_grade_key(thr["a_plus"]) == "a_plus"
    assert assign_grade_key(thr["a_plus"] - 0.001) == "elite_green"
    assert assign_grade_key(thr["elite_green"]) == "elite_green"
    assert assign_grade_key(thr["elite_green"] - 0.001) == "green"
    assert assign_grade_key(thr["green"]) == "green"
    assert assign_grade_key(thr["green"] - 0.001) == "watch"
    assert assign_grade_key(2.00) == "watch"
    assert assign_grade_key(1.99) == "blocked"


def test_invalid_score_is_blocked():
    assert assign_grade_key(None) == "blocked"
    assert assign_dynamic_grade(None) == "Blocked"
    assert assign_dynamic_grade(float("nan")) == "Blocked"


def test_display_labels():
    assert assign_dynamic_grade(5.0) == "A+"
    assert assign_dynamic_grade(4.0) == "Elite Green"
    assert assign_dynamic_grade(3.0) == "Green"
    assert assign_dynamic_grade(2.2) == "Watch"
