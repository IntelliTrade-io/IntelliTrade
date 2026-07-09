# coding: utf-8
"""
OANDA v20 Feed Adapter — IntelliTrade scanners (CI / GitHub Actions).
Same fetch_df/make_fetch_fn surface as feed_adapter (MT5), so strength_core
runs unchanged on either feed.

Environment variables:
    OANDA_API_KEY         — OANDA v20 access token (required)
    OANDA_ENVIRONMENT     — "practice" or "live" (default: practice)
"""

import os
import time
import logging

import pandas as pd
import requests

log = logging.getLogger(__name__)

# Canonical timeframe keys (shared with feed_adapter) → OANDA granularity
OANDA_GRANULARITY = {
    "1day":  "D",
    "4hour": "H4",
    "1hour": "H1",
    "15min": "M15",
}

OANDA_BASE = {
    "practice": "https://api-fxpractice.oanda.com",
    "live":     "https://api-fxtrade.oanda.com",
}

_session: requests.Session | None = None
_base_url: str = ""


def _get_session() -> tuple[requests.Session, str]:
    global _session, _base_url
    if _session is None:
        token = os.environ.get("OANDA_API_KEY")
        if not token:
            raise RuntimeError("OANDA_API_KEY environment variable is not set")
        env = os.environ.get("OANDA_ENVIRONMENT", "practice").lower()
        _base_url = OANDA_BASE.get(env, OANDA_BASE["practice"])
        _session = requests.Session()
        _session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })
    return _session, _base_url


def fetch_df(symbol: str, timeframe_key: str, bars: int,
             max_retries: int = 3, retry_wait: float = 0.25) -> pd.DataFrame:
    """Fetch the last `bars` complete mid-price candles from OANDA v20.

    Returns a DataFrame with columns: time, open, high, low, close, tick_vol
    (same shape as feed_adapter.fetch_df).
    """
    session, base = _get_session()
    instrument = symbol[:3] + "_" + symbol[3:]          # EURUSD → EUR_USD
    granularity = OANDA_GRANULARITY[timeframe_key]
    url = f"{base}/v3/instruments/{instrument}/candles"
    params = {"granularity": granularity, "count": min(bars, 5000), "price": "M"}

    last_err = None
    for attempt in range(max_retries):
        try:
            resp = session.get(url, params=params, timeout=30)
            resp.raise_for_status()
            candles = [c for c in resp.json().get("candles", []) if c.get("complete", True)]
            if candles:
                rows = [
                    {
                        "time":     pd.Timestamp(c["time"], tz="UTC"),
                        "open":     float(c["mid"]["o"]),
                        "high":     float(c["mid"]["h"]),
                        "low":      float(c["mid"]["l"]),
                        "close":    float(c["mid"]["c"]),
                        "tick_vol": int(c.get("volume", 0)),
                    }
                    for c in candles
                ]
                return pd.DataFrame(rows)
            last_err = "empty candle list"
        except Exception as exc:
            last_err = str(exc)
        time.sleep(retry_wait * (1 + attempt))

    raise RuntimeError(f"OANDA returned no data for {symbol} {timeframe_key}: {last_err}")


def make_fetch_fn(max_retries: int = 3, retry_wait: float = 0.25):
    """Return a fetch_fn compatible with strength_core.scan_pair."""

    def _fetch(symbol: str, timeframe_key: str, bars: int) -> pd.DataFrame:
        return fetch_df(symbol, timeframe_key, bars, max_retries, retry_wait)

    return _fetch
