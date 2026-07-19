# coding: utf-8
"""Stage 2 candles: forming-bar exclusion, gap detection, upsert idempotency."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from intellitrade_scanners.review import candles, timeutil

UTC = dt.timezone.utc


def _df(open_times, price=1.5):
    return pd.DataFrame([
        {"time": t, "open": price, "high": price + 0.01, "low": price - 0.01,
         "close": price, "tick_vol": 100}
        for t in open_times
    ])


def test_forming_bar_excluded():
    now = dt.datetime(2026, 6, 1, 9, 30, tzinfo=UTC)  # forming bucket = 08:00
    df = _df(["2026-06-01T00:00:00Z", "2026-06-01T04:00:00Z", "2026-06-01T08:00:00Z"])
    records = candles.candle_records(df, "metaquotes_demo", "EURJPY", now)
    opens = [r["open_time"] for r in records]
    assert "2026-06-01T08:00:00Z" not in opens  # forming bar dropped
    assert "2026-06-01T04:00:00Z" in opens
    assert all(r["close_time"] > r["open_time"] for r in records)


def test_closed_bar_stored_with_full_ohlc():
    now = dt.datetime(2026, 6, 2, 0, 0, tzinfo=UTC)
    df = _df(["2026-06-01T04:00:00Z"])
    (rec,) = candles.candle_records(df, "metaquotes_demo", "EURJPY", now)
    assert rec["feed_name"] == "metaquotes_demo"
    assert rec["symbol"] == "EURJPY"
    assert rec["timeframe"] == "4hour"
    assert rec["close_time"] == "2026-06-01T08:00:00Z"
    assert rec["high"] > rec["low"]
    assert rec["quality"] == "verified"


def test_weekend_is_not_a_gap():
    # Fri 2026-06-05 20:00 -> next weekday boundary Mon 2026-06-08 00:00.
    opens = [timeutil.parse_ts("2026-06-05T20:00:00Z"),
             timeutil.parse_ts("2026-06-08T00:00:00Z")]
    gaps = candles.detect_gaps(opens, opens[0], opens[-1])
    assert gaps == []  # the Sat/Sun boundaries are not counted


def test_weekday_hole_detected():
    # Missing the 08:00 weekday bar between 04:00 and 12:00.
    opens = [timeutil.parse_ts("2026-06-01T04:00:00Z"),
             timeutil.parse_ts("2026-06-01T12:00:00Z")]
    gaps = candles.detect_gaps(opens, opens[0], opens[-1])
    assert timeutil.parse_ts("2026-06-01T08:00:00Z") in gaps


def test_run_upserts_and_is_idempotent(fake_client):
    now = dt.datetime(2026, 6, 2, 0, 0, tzinfo=UTC)
    fixed = _df(["2026-06-01T00:00:00Z", "2026-06-01T04:00:00Z"])

    def fetch_fn(symbol, tf, bars):
        return fixed if symbol == "EURJPY" else pd.DataFrame()

    s1 = candles.run("metaquotes_demo", now=now, client=fake_client, fetch_fn=fetch_fn)
    n_after_first = len(fake_client.tables["fx_ohlc_candles"])
    s2 = candles.run("metaquotes_demo", now=now, client=fake_client, fetch_fn=fetch_fn)
    assert len(fake_client.tables["fx_ohlc_candles"]) == n_after_first  # upsert, no dup rows
    assert s1["rows_upserted"] == 2
    assert "EURUSD" in s2["pairs_uncovered"]  # feed returned nothing for it
