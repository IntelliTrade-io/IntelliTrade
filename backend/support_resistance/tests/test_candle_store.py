# coding: utf-8
import os
import tempfile

import pandas as pd

from support_resistance import candle_store as cs


def _df(start_min, n):
    t0 = pd.Timestamp("2026-07-02 10:00:00", tz="UTC")
    return pd.DataFrame([
        {"time": t0 + pd.Timedelta(minutes=15 * (start_min + i)),
         "open": 1.10, "high": 1.11, "low": 1.09, "close": 1.10, "volume": 0}
        for i in range(n)
    ])


def test_archive_appends_and_dedupes(tmp_path):
    path = os.path.join(str(tmp_path), "archive.csv")

    # first write: 5 new bars
    assert cs.append_candles_archive(_df(0, 5), path, symbol="EURUSD") == 5
    # same bars again: nothing new (dedup by time)
    assert cs.append_candles_archive(_df(0, 5), path, symbol="EURUSD") == 0
    # overlapping window bars 3..7 -> only 5,6,7 are new
    assert cs.append_candles_archive(_df(3, 5), path, symbol="EURUSD") == 3

    with open(path, encoding="utf-8") as fh:
        lines = fh.read().strip().splitlines()
    assert lines[0].split(",") == cs.ARCHIVE_COLUMNS   # header schema
    assert len(lines) - 1 == 8                          # 8 unique bars, no dups
