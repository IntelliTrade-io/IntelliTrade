# coding: utf-8
"""
Stage 2 - H4 candle ingestion + gap detection.

Fetch H4 bars for the 28 canonical pairs via the same feed adapter the scanner
uses, drop the forming bar, and upsert into fx_ohlc_candles keyed by
(feed_name, symbol, timeframe, open_time). Gaps over the expected weekday 4h grid
are detected and surfaced to the watchdog. Pairs the demo feed cannot serve stay
uncovered and any case on them ends withheld_missing_data (never fabricated).
"""

from __future__ import annotations

import datetime as dt
import logging

from intellitrade_scanners.review import db, timeutil
from intellitrade_scanners.review.constants import CANDLE_TIMEFRAME, DEFAULT_PAIRS, H4_HOURS

log = logging.getLogger(__name__)

UTC = dt.timezone.utc


# ── pure helpers ────────────────────────────────────────────────────────────

def candle_records(df, feed_name: str, symbol: str, now: dt.datetime) -> list[dict]:
    """Build fx_ohlc_candles rows from a fetched OHLC DataFrame, dropping the
    forming bar (open_time == the current 4h bucket)."""
    if df is None or len(df) == 0:
        return []
    forming = timeutil.floor_4h(now)
    records = []
    for _, r in df.iterrows():
        open_time = timeutil.parse_ts(r["time"])
        if open_time >= forming:
            continue  # forming (or future) bar — not fully closed
        close_time = open_time + dt.timedelta(hours=H4_HOURS)
        records.append({
            "feed_name": feed_name,
            "symbol": symbol,
            "timeframe": CANDLE_TIMEFRAME,
            "open_time": open_time.isoformat().replace("+00:00", "Z"),
            "close_time": close_time.isoformat().replace("+00:00", "Z"),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "tick_volume": int(r["tick_vol"]) if r.get("tick_vol") is not None else None,
            "quality": "verified",
        })
    return records


def expected_grid(start: dt.datetime, end: dt.datetime) -> list[dt.datetime]:
    """All weekday H4 boundaries in [start, end] inclusive (Mon-Fri, UTC)."""
    grid = []
    t = timeutil.floor_4h(start)
    step = dt.timedelta(hours=H4_HOURS)
    while t <= end:
        if timeutil.is_weekday_boundary(t):
            grid.append(t)
        t += step
    return grid


def detect_gaps(open_times: list[dt.datetime],
                start: dt.datetime, end: dt.datetime) -> list[dt.datetime]:
    """Missing weekday 4h boundaries between start and end (weekends are not gaps)."""
    present = {timeutil.floor_4h(t) for t in open_times}
    return [t for t in expected_grid(start, end) if t not in present]


# ── IO stage ────────────────────────────────────────────────────────────────

def _init_mt5():
    """Initialize MT5 for a standalone runner process (the review runner is a
    separate process from the scanner and must connect to MT5 itself). Mirrors
    scanner_d1h4.main's connection setup. Returns the feed_adapter module so the
    caller can shut it down."""
    import os

    from intellitrade_scanners import feed_adapter

    login_str = os.environ.get("MT5_LOGIN", "") or None
    feed_adapter.initialize(
        server=os.environ.get("MT5_SERVER", "") or None,
        login=int(login_str) if login_str else None,
        password=os.environ.get("MT5_PASSWORD", "") or None,
    )
    return feed_adapter


def run(feed_name: str, bars: int = 200, now: dt.datetime | None = None,
        client=None, fetch_fn=None) -> dict:
    """Fetch + upsert recent H4 bars for all 28 pairs. `bars` controls depth
    (use --backfill-candles 1500 for the first deploy)."""
    db_client = client or db.get_client()
    now = now or dt.datetime.now(UTC)

    # When no fetch_fn is injected (production), own the MT5 lifecycle for this
    # process. Tests pass fetch_fn and never touch MT5.
    managed_feed = None
    if fetch_fn is None:
        managed_feed = _init_mt5()
        fetch_fn = managed_feed.make_fetch_fn()

    summary = {"pairs_covered": 0, "pairs_uncovered": [], "rows_upserted": 0, "gaps": {}}
    try:
        for symbol in DEFAULT_PAIRS:
            try:
                df = fetch_fn(symbol, CANDLE_TIMEFRAME, bars)
            except Exception as exc:  # noqa: BLE001 - a pair the feed cannot serve stays uncovered
                log.warning("candles fetch failed for %s: %s", symbol, exc)
                summary["pairs_uncovered"].append(symbol)
                continue

            records = candle_records(df, feed_name, symbol, now)
            if not records:
                summary["pairs_uncovered"].append(symbol)
                continue

            try:
                db_client.upsert("fx_ohlc_candles", records,
                                 on_conflict="feed_name,symbol,timeframe,open_time")
                summary["rows_upserted"] += len(records)
                summary["pairs_covered"] += 1
            except Exception as exc:  # noqa: BLE001 - isolate per-pair failures
                log.error("fx_ohlc_candles upsert failed for %s: %s", symbol, exc)
                continue

            open_times = [timeutil.parse_ts(r["open_time"]) for r in records]
            gaps = detect_gaps(open_times, min(open_times), max(open_times))
            if gaps:
                summary["gaps"][symbol] = [g.isoformat().replace("+00:00", "Z") for g in gaps]
    finally:
        if managed_feed is not None:
            managed_feed.shutdown()

    return summary
