# coding: utf-8
"""Unit tests for the canonical currency-strength core (v1.5.2 algorithm)."""
import numpy as np
import pandas as pd
import pytest

from intellitrade_scanners import strength_core


def make_df(closes, spread=0.001):
    closes = np.asarray(closes, dtype=float)
    return pd.DataFrame({
        "time": pd.date_range("2024-01-01", periods=len(closes), freq="4h", tz="UTC"),
        "open": np.concatenate([[closes[0]], closes[:-1]]),
        "high": closes + spread,
        "low": closes - spread,
        "close": closes,
        "tick_vol": np.full(len(closes), 1000.0),
    })


# A clean uptrend: L pivot at idx 2, H pivot at idx 4, L pivot (higher low)
# at idx 6, then a rally far beyond the idx-4 high => bullish BOS.
UPTREND = [1.000, 1.010, 0.990, 1.010, 1.040, 1.030, 1.020, 1.030, 1.050,
           1.060, 1.070, 1.080, 1.090, 1.100, 1.110, 1.120, 1.130, 1.140,
           1.150, 1.160]

# Mirror image built by hand (pivot depths are asymmetric: highs need depth 3,
# lows depth 1): H pivot at idx 4, L at idx 6, lower H at idx 8, then a
# breakdown far below the idx-6 low => bearish BOS.
DOWNTREND = [1.190, 1.195, 1.198, 1.200, 1.210, 1.180, 1.160, 1.180, 1.185,
             1.170, 1.150, 1.130, 1.110, 1.090, 1.070, 1.050, 1.030, 1.010,
             0.990, 0.970]


# ── indicators ────────────────────────────────────────────────────────────────

def test_atr_constant_range():
    # Identical candles after the first: TR is constant, so ATR converges to it.
    df = make_df([1.0] * 50, spread=0.002)
    assert strength_core.atr(df).iloc[-1] == pytest.approx(0.004)


def test_choppiness_short_df_returns_100():
    assert strength_core.choppiness(make_df([1.0] * 5)) == 100.0


def test_choppiness_flat_range_returns_100():
    df = make_df([1.0] * 50, spread=0.0)
    assert strength_core.choppiness(df) == 100.0


def test_choppiness_trending_below_choppy():
    trending = strength_core.choppiness(make_df(np.linspace(1.0, 1.2, 50)))
    choppy = strength_core.choppiness(make_df([1.0, 1.01] * 25))
    assert trending < choppy


def test_adx_short_df_returns_0():
    assert strength_core.adx(make_df([1.0] * 5)) == 0.0


def test_adx_trending_beats_flat():
    trending = strength_core.adx(make_df(np.linspace(1.0, 1.3, 80)))
    flat = strength_core.adx(make_df([1.0] * 80))
    assert trending > 50
    assert flat == pytest.approx(0.0, abs=1e-9)


# ── pivots / trend ────────────────────────────────────────────────────────────

def test_pivot_points_uptrend_shape():
    piv = strength_core.pivot_points(make_df(UPTREND), 3, 1)
    assert [(p["idx"], p["type"]) for p in piv] == [(2, "L"), (4, "H"), (6, "L")]


def test_merge_nearby_keeps_extreme():
    pivots = [{"idx": 1, "price": 1.000, "type": "L"},
              {"idx": 3, "price": 0.999, "type": "L"}]
    merged = strength_core.merge_nearby(pivots, tol_price=0.01)
    assert len(merged) == 1
    assert merged[0]["price"] == 0.999


def test_detect_trend_bullish():
    res = strength_core.detect_trend_sequence(make_df(UPTREND), 3, 1, 0.04, 0.5, 0.06, 1.0)
    assert res["trend"] == "bullish"
    assert res["last_bos_price"] == pytest.approx(1.041)  # idx-4 high


def test_detect_trend_bearish():
    res = strength_core.detect_trend_sequence(make_df(DOWNTREND), 3, 1, 0.04, 0.5, 0.06, 1.0)
    assert res["trend"] == "bearish"


def test_detect_trend_neutral_when_flat():
    res = strength_core.detect_trend_sequence(make_df([1.0] * 20), 3, 1, 0.04, 0.5, 0.06, 1.0)
    assert res["trend"] == "neutral"
    assert res["last_bos_price"] is None


# ── confidence ────────────────────────────────────────────────────────────────

def test_confidence_neutral_is_zero():
    df = make_df(UPTREND)
    assert strength_core.compute_confidence("neutral", df, df) == 0.0


def test_confidence_no_gates_is_100():
    df = make_df(UPTREND)
    assert strength_core.compute_confidence("bullish", df, df) == 100.0


def test_confidence_adx_penalty_applies_on_flat():
    flat = make_df([1.0, 1.001] * 25)
    conf = strength_core.compute_confidence("bullish", flat, flat, use_adx=True, penalty_adx=0.6)
    assert conf == pytest.approx(60.0)


def test_confidence_triangle_penalty():
    df = make_df(UPTREND)
    conf = strength_core.compute_confidence(
        "bullish", df, df, triangle_penalty_ratio=1.0, penalty_triangle=0.8)
    assert conf == pytest.approx(80.0)


# ── scan_pair ─────────────────────────────────────────────────────────────────

def scan(sym, tf1_closes, tf2_closes):
    frames = {"tf1": make_df(tf1_closes), "tf2": make_df(tf2_closes)}
    fetch_fn = lambda s, tf, bars: frames[tf]
    return strength_core.scan_pair(
        sym, "tf1", "tf2", (3, 1), (3, 1), (0.04, 0.5), (0.08, 0.5),
        (0.06, 1.0), (0.08, 1.0), {}, {}, fetch_fn)


def test_scan_pair_both_bullish():
    info = scan("EURUSD", UPTREND, UPTREND)
    assert (info["tf1"], info["tf2"], info["pair"]) == ("bullish", "bullish", "bullish")
    assert info["confidence"] == 100.0
    assert info["last_candle_tf1_close"] == pytest.approx(UPTREND[-1])


def test_scan_pair_conflict_is_neutral():
    info = scan("EURUSD", UPTREND, DOWNTREND)
    assert info["pair"] == "neutral"
    assert info["confidence"] == 0.0


def test_scan_pair_output_keys():
    info = scan("EURUSD", UPTREND, UPTREND)
    assert set(info) == {
        "tf1", "tf2", "pair", "confidence",
        "last_bos_tf1", "last_bos_tf1_time", "last_bos_tf2", "last_bos_tf2_time",
        "last_candle_tf1_time", "last_candle_tf2_time", "last_candle_tf1_close",
    }


# ── triangle consistency ──────────────────────────────────────────────────────

def test_triangle_consistent_set_scores_zero():
    pairs = {"EURGBP": {"pair": "bullish"}, "GBPUSD": {"pair": "bullish"},
             "EURUSD": {"pair": "bullish"}}
    assert strength_core.triangle_inconsistency(pairs) == {
        "EURGBP": 0.0, "GBPUSD": 0.0, "EURUSD": 0.0}


def test_triangle_inconsistent_set_scores_one():
    pairs = {"EURGBP": {"pair": "bullish"}, "GBPUSD": {"pair": "bullish"},
             "EURUSD": {"pair": "bearish"}}
    assert strength_core.triangle_inconsistency(pairs) == {
        "EURGBP": 1.0, "GBPUSD": 1.0, "EURUSD": 1.0}


# ── aggregation ───────────────────────────────────────────────────────────────

def test_aggregate_unweighted():
    pairs = {"EURUSD": {"pair": "bullish", "confidence": 80.0},
             "GBPUSD": {"pair": "bearish", "confidence": 60.0},
             "AUDUSD": {"pair": "neutral", "confidence": 0.0}}
    rows = strength_core.aggregate_currencies(pairs, weighted=False)
    assert rows["EUR"]["score"] == 100.0 and rows["EUR"]["bias"] == "Strong"
    assert rows["GBP"]["score"] == -100.0 and rows["GBP"]["bias"] == "Weak"
    # USD: weak from EURUSD bull, strong from GBPUSD bear -> net 0
    assert rows["USD"]["score"] == 0.0 and rows["USD"]["bias"] == "Neutral"
    assert rows["AUD"]["score"] == 0.0
    assert rows["EUR"]["avg_conf"] == pytest.approx(80.0)
    assert rows["USD"]["avg_conf"] == pytest.approx(70.0)


def test_aggregate_weighted_uses_confidence():
    pairs = {"EURUSD": {"pair": "bullish", "confidence": 80.0},
             "EURGBP": {"pair": "bearish", "confidence": 40.0}}
    rows = strength_core.aggregate_currencies(pairs, weighted=True)
    # EUR: +0.8 (EURUSD bull) -0.4 (EURGBP bear) over 1.2 total
    assert rows["EUR"]["score"] == pytest.approx(round(100 * (0.8 - 0.4) / 1.2, 2))


def test_sign_from_label():
    assert strength_core.sign_from_label("bullish") == 1
    assert strength_core.sign_from_label("bearish") == -1
    assert strength_core.sign_from_label("neutral") == 0
