# coding: utf-8
"""
Shared H4-grid time helpers for the review pipeline. Pure, no IO.

MT5 H4 candles align to 00/04/08/12/16/20 UTC boundaries. The canonical candle
close for a run is floor4h(run ts); the reference (last fully-closed) candle
opens 4h before that and closes at it.
"""

from __future__ import annotations

import datetime as dt

from intellitrade_scanners.review.constants import H4_HOURS

UTC = dt.timezone.utc


def parse_ts(value: str | dt.datetime) -> dt.datetime:
    """Parse an ISO-8601 timestamp (accepts a trailing Z) into an aware UTC datetime."""
    if isinstance(value, dt.datetime):
        d = value
    else:
        text = value.strip().replace("Z", "+00:00")
        d = dt.datetime.fromisoformat(text)
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return d.astimezone(UTC)


def floor_4h(ts: dt.datetime) -> dt.datetime:
    """Floor an aware datetime down to the enclosing H4 boundary (UTC)."""
    ts = ts.astimezone(UTC)
    floored_hour = (ts.hour // H4_HOURS) * H4_HOURS
    return ts.replace(hour=floored_hour, minute=0, second=0, microsecond=0)


def candle_close_ts(run_ts: dt.datetime) -> dt.datetime:
    """Canonical last fully-closed H4 close for a run = floor4h(run ts)."""
    return floor_4h(run_ts)


def reference_open_time(close_ts: dt.datetime) -> dt.datetime:
    """Open of the reference (bar-0) candle: candle_close_ts - 4h."""
    return close_ts - dt.timedelta(hours=H4_HOURS)


def add_bars(open_time: dt.datetime, bars: int) -> dt.datetime:
    """Advance an open_time by N H4 bars (grid arithmetic; weekends handled by
    the actual candle set, not here)."""
    return open_time + dt.timedelta(hours=H4_HOURS * bars)


def is_weekday_boundary(close_ts: dt.datetime) -> bool:
    """True when the candle-close boundary falls on a weekday (Mon-Fri, UTC).

    Weekend scanner runs (the VPS runs 7 days/week) re-report Friday's last
    candle as a stale duplicate; a Saturday/Sunday candle_close_ts is rejected.
    """
    return close_ts.astimezone(UTC).weekday() < 5


def within_run_window(run_ts: dt.datetime, close_ts: dt.datetime,
                      max_minutes: int) -> bool:
    """True when the run landed within `max_minutes` after the H4 boundary."""
    delta = (run_ts.astimezone(UTC) - close_ts).total_seconds()
    return 0 <= delta <= max_minutes * 60
