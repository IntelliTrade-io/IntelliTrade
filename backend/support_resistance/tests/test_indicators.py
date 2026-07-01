# coding: utf-8
import pytest

from support_resistance import indicators


def test_ema_available_only_after_period():
    values = [float(i) for i in range(1, 21)]
    out = indicators.ema(values, 5)
    assert out[3] is None
    assert out[4] is not None  # seed at index period-1
    # EMA of a rising ramp trails the latest value but stays below it
    assert out[-1] < values[-1]


def test_atr_exists_after_enough_bars():
    n = 30
    highs = [10 + i * 0.5 for i in range(n)]
    lows = [9 + i * 0.5 for i in range(n)]
    closes = [9.5 + i * 0.5 for i in range(n)]
    atr = indicators.atr(highs, lows, closes, period=14)
    assert atr[12] is None
    assert atr[13] is not None      # first available at period-1
    assert atr[-1] is not None
    assert atr[-1] > 0


def test_atr_none_when_too_few_bars():
    atr = indicators.atr([1, 2], [0, 1], [0.5, 1.5], period=14)
    assert all(x is None for x in atr)


def test_m15_return_12_atr_calculation():
    # 13 closes so index -1 has a close 12 bars back; force ATR = 2.0
    closes = [100.0] * 12 + [110.0]  # delta = 10 over 12 bars
    atr_series = [None] * 12 + [2.0]
    val = indicators.m15_return_12_atr(closes, atr_series, index=-1, lookback=12)
    assert val == pytest.approx(5.0, abs=1e-12)  # 10 / 2.0


def test_m15_return_none_when_insufficient_history():
    closes = [1.0, 2.0, 3.0]
    atr_series = [None, None, 1.0]
    assert indicators.m15_return_12_atr(closes, atr_series, index=-1, lookback=12) is None


def test_m15_return_none_when_atr_zero():
    closes = [1.0] * 13
    atr_series = [None] * 12 + [0.0]
    assert indicators.m15_return_12_atr(closes, atr_series, index=-1) is None


def test_ema200_slope_nonnegative():
    rising = list(range(0, 20))
    assert indicators.ema200_slope_nonnegative(rising, index=-1, lookback=6) is True
    falling = list(range(20, 0, -1))
    assert indicators.ema200_slope_nonnegative(falling, index=-1, lookback=6) is False
    # unavailable points -> conservative False
    assert indicators.ema200_slope_nonnegative([None, None, 1.0], index=-1, lookback=6) is False


def test_above_ema():
    assert indicators.above_ema(1.10, 1.09) is True
    assert indicators.above_ema(1.10, 1.10) is True
    assert indicators.above_ema(1.08, 1.09) is False
    assert indicators.above_ema(1.10, None) is False


@pytest.mark.parametrize("hour,expected", [
    (0, "asia"), (6, "asia"),
    (7, "london_open"), (10, "london_open"),
    (11, "london_midday"), (13, "london_midday"),
    (14, "ny_open"), (17, "ny_open"),
    (18, "late"), (23, "late"),
])
def test_session_buckets(hour, expected):
    assert indicators.session_for_hour_utc(hour) == expected


def test_session_for_utc_from_iso_string():
    assert indicators.session_for_utc("2021-01-07 03:30:00") == "asia"
    assert indicators.session_for_utc("2021-06-17T15:45:00") == "ny_open"
