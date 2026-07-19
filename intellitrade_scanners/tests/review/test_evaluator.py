# coding: utf-8
"""Stage 4 evaluator: off-by-one, direction normalization, MFE/MAE, gaps."""

from __future__ import annotations

import datetime as dt

import pytest

from intellitrade_scanners.review import evaluator, timeutil
from intellitrade_scanners.review.constants import LONG_BARS, SHORT_BARS

UTC = dt.timezone.utc
REF_CLOSE_TIME = dt.datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


def _bar(open_time: dt.datetime, close: float, high=None, low=None) -> dict:
    return {
        "open_time": open_time.isoformat().replace("+00:00", "Z"),
        "close_time": (open_time + dt.timedelta(hours=4)).isoformat().replace("+00:00", "Z"),
        "high": high if high is not None else close + 0.001,
        "low": low if low is not None else close - 0.001,
        "close": close,
    }


def _forward(closes: list[float], highs=None, lows=None) -> list[dict]:
    opens = evaluator.forward_open_times(REF_CLOSE_TIME, len(closes))
    bars = []
    for i, ot in enumerate(opens):
        bars.append(_bar(ot, closes[i],
                         high=highs[i] if highs else None,
                         low=lows[i] if lows else None))
    return bars


def test_forward_open_times_skip_weekends():
    # Fri 2026-06-05 20:00 is a valid boundary; next weekday boundary is Mon 00:00.
    fri = dt.datetime(2026, 6, 5, 20, 0, tzinfo=UTC)
    times = evaluator.forward_open_times(fri, 2)
    assert times[0] == fri
    assert times[1] == dt.datetime(2026, 6, 8, 0, 0, tzinfo=UTC)  # Monday, weekend skipped


def test_bar_30_and_60_off_by_one_exact():
    ref = 1.00
    # forward bar k (1-indexed) has close = ref + k/1000; bar30 -> 1.030, bar60 -> 1.060.
    closes = [ref + (k + 1) / 1000 for k in range(LONG_BARS)]
    m = evaluator.compute_metrics(ref, _forward(closes), direction=1)
    assert m["short_close"] == pytest.approx(1.030)   # forward bar 30
    assert m["long_close"] == pytest.approx(1.060)     # forward bar 60
    assert m["short_return_norm_pct"] == pytest.approx(3.0, abs=1e-6)
    assert m["long_return_norm_pct"] == pytest.approx(6.0, abs=1e-6)


def test_direction_minus_one_normalizes_falling_price_as_positive():
    ref = 1.00
    # USD strong in EURUSD (dir -1): price falls -> normalized return positive.
    closes = [ref - (k + 1) / 1000 for k in range(LONG_BARS)]
    m = evaluator.compute_metrics(ref, _forward(closes), direction=-1)
    assert m["long_return_raw_pct"] == pytest.approx(-6.0, abs=1e-6)
    assert m["long_return_norm_pct"] == pytest.approx(6.0, abs=1e-6)


def test_mfe_from_highs_and_mae_from_lows_when_direction_plus():
    ref = 1.00
    closes = [ref] * LONG_BARS
    highs = [ref] * LONG_BARS
    lows = [ref] * LONG_BARS
    highs[10] = 1.05   # +5% favorable spike
    lows[20] = 0.97    # -3% adverse spike
    m = evaluator.compute_metrics(ref, _forward(closes, highs, lows), direction=1)
    assert m["max_continuation_pct"] == pytest.approx(5.0, abs=1e-6)
    assert m["max_pullback_pct"] == pytest.approx(-3.0, abs=1e-6)


def test_mfe_from_lows_and_mae_from_highs_when_direction_minus():
    ref = 1.00
    closes = [ref] * LONG_BARS
    highs = [ref] * LONG_BARS
    lows = [ref] * LONG_BARS
    lows[10] = 0.95    # price down 5% = favorable for a short (dir -1)
    highs[20] = 1.03   # price up 3% = adverse
    m = evaluator.compute_metrics(ref, _forward(closes, highs, lows), direction=-1)
    assert m["max_continuation_pct"] == pytest.approx(5.0, abs=1e-6)
    assert m["max_pullback_pct"] == pytest.approx(-3.0, abs=1e-6)


def test_short_only_when_between_30_and_60_bars():
    ref = 1.00
    closes = [ref + (k + 1) / 1000 for k in range(SHORT_BARS + 5)]  # 35 bars
    m = evaluator.compute_metrics(ref, _forward(closes), direction=1)
    assert "short_close" in m
    assert "long_close" not in m  # cannot fill long without 60 verified bars


def test_no_metrics_below_30_bars():
    ref = 1.00
    m = evaluator.compute_metrics(ref, _forward([ref] * 29), direction=1)
    assert "short_close" not in m and "long_close" not in m


def test_invalid_reference_price_raises():
    with pytest.raises(ValueError):
        evaluator.compute_metrics(0.0, _forward([1.0]), direction=1)


def test_contiguous_forward_stops_at_gap():
    closes = [1.0 + i for i in range(10)]
    forward = _forward(closes)
    candle_map = {timeutil.parse_ts(b["open_time"]): b for b in forward}
    # drop bar 6 -> only 5 contiguous
    del candle_map[timeutil.parse_ts(forward[5]["open_time"])]
    got, verified = evaluator.contiguous_forward(candle_map, REF_CLOSE_TIME, want=10)
    assert verified == 5
