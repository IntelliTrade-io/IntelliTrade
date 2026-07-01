# coding: utf-8
import datetime as dt

import pandas as pd

from support_resistance import fetch_candles


def _df_ending_at(last_utc, n=5):
    times = [last_utc - dt.timedelta(minutes=15 * (n - 1 - i)) for i in range(n)]
    return pd.DataFrame({
        "time": pd.to_datetime(times, utc=True),
        "open": [1.1] * n, "high": [1.11] * n, "low": [1.09] * n,
        "close": [1.1] * n, "volume": [0] * n,
    })


def test_broker_offset_detects_plus_three():
    now = dt.datetime.now(dt.timezone.utc)
    # broker EEST: last bar stamped 3h ahead of true UTC
    df = _df_ending_at(now + dt.timedelta(hours=3))
    assert fetch_candles.broker_utc_offset_hours(df) == 3


def test_broker_offset_zero_when_already_utc():
    now = dt.datetime.now(dt.timezone.utc)
    df = _df_ending_at(now)
    assert fetch_candles.broker_utc_offset_hours(df) == 0


def test_shift_to_utc_brings_last_bar_near_now():
    now = dt.datetime.now(dt.timezone.utc)
    df = _df_ending_at(now + dt.timedelta(hours=3))
    shifted = fetch_candles._shift_to_utc(df)
    last = pd.Timestamp(shifted["time"].iloc[-1]).to_pydatetime()
    assert abs((last - now).total_seconds()) < 60  # within a minute of true UTC now
