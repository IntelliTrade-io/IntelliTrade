# coding: utf-8
"""
Candle storage / shaping helpers.

Bridges the pandas DataFrame world (fetch_candles) and the pure-Python indicator
world (indicators.py):

  * clean_m15   — sort, dedup, drop incomplete rows
  * resample    — build H1 / H4 OHLC context from M15 (research convention: H1/H4
                  are derived by resampling M15 when separate feeds aren't used)
  * to_sequences — extract aligned open/high/low/close/volume/time lists
  * supabase_candle_rows — shape rows for the market_candles table
"""

from typing import Dict, List

import pandas as pd

from . import config

OHLC_AGG = {
    "open": "first",
    "high": "max",
    "low": "min",
    "close": "last",
    "volume": "sum",
}


def clean_m15(df: pd.DataFrame) -> pd.DataFrame:
    """Sort by time, drop duplicate timestamps (keep last), reset index."""
    out = df.copy()
    out["time"] = pd.to_datetime(out["time"], utc=True)
    out = (
        out.sort_values("time")
        .drop_duplicates(subset="time", keep="last")
        .dropna(subset=["open", "high", "low", "close"])
        .reset_index(drop=True)
    )
    return out


def resample(df_m15: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Resample M15 OHLC to a higher timeframe.

    rule: pandas offset alias, e.g. '1h' for H1, '4h' for H4.
    Returns a frame with the same columns (time as a column, tz-aware UTC).
    """
    df = clean_m15(df_m15).set_index("time")
    res = df.resample(rule, label="right", closed="right").agg(OHLC_AGG).dropna(subset=["close"])
    return res.reset_index()


def build_context(df_m15: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    """Return {'m15','h1','h4'} frames, H1/H4 resampled from M15."""
    m15 = clean_m15(df_m15)
    return {
        "m15": m15,
        "h1": resample(m15, "1h"),
        "h4": resample(m15, "4h"),
    }


def to_sequences(df: pd.DataFrame) -> Dict[str, List]:
    """Extract aligned plain-Python sequences for indicators.py."""
    return {
        "time": list(df["time"]),
        "open": [float(x) for x in df["open"]],
        "high": [float(x) for x in df["high"]],
        "low": [float(x) for x in df["low"]],
        "close": [float(x) for x in df["close"]],
        "volume": [float(x) for x in df["volume"]],
    }


def supabase_candle_rows(df_m15: pd.DataFrame, symbol: str = None,
                         timeframe: str = "M15", source: str = "mt5") -> List[dict]:
    """Shape M15 candles for the market_candles table (upsert on
    symbol,timeframe,time)."""
    symbol = symbol or config.symbol()
    rows = []
    for _, r in clean_m15(df_m15).iterrows():
        rows.append({
            "symbol": symbol,
            "timeframe": timeframe,
            "time": r["time"].isoformat(),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r["volume"]),
            "source": source,
        })
    return rows
