# coding: utf-8
"""
Indicator maths for the SR Alpha backend.

Deliberately pure-Python (no pandas) so the scoring inputs are trivially
unit-testable and identical across environments. The data layer
(candle_store / fetch_candles) converts pandas frames to plain sequences before
calling these.

Implements:
  * EMA (seeded with SMA, Wilder-independent) for EMA 50/100/200
  * ATR(14) using Wilder's RMA smoothing of True Range
  * m15_return_12_atr = (close[i] - close[i-12]) / ATR[i]
  * EMA200 slope non-negative = EMA200[i] - EMA200[i-6] >= 0
  * UTC session bucketing (asia / london_open / london_midday / ny_open / late)
"""

from typing import List, Optional, Sequence

ATR_PERIOD = 14
RETURN_LOOKBACK = 12
SLOPE_LOOKBACK = 6

# UTC session buckets (research convention). `late` is excluded from positive
# Alpha opportunities by the opportunity builder (session_filter = exclude_late).
SESSION_BUCKETS_UTC = [
    ("asia", 0, 7),            # 00:00–06:59
    ("london_open", 7, 11),    # 07:00–10:59
    ("london_midday", 11, 14),  # 11:00–13:59
    ("ny_open", 14, 18),       # 14:00–17:59
    ("late", 18, 24),          # 18:00–23:59
]


def ema(values: Sequence[float], period: int) -> List[Optional[float]]:
    """Exponential moving average, seeded with the SMA of the first `period`
    values. Returns a list the same length as `values`; entries before the seed
    index are None."""
    n = len(values)
    out: List[Optional[float]] = [None] * n
    if period <= 0:
        raise ValueError("period must be positive")
    if n < period:
        return out
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    k = 2.0 / (period + 1.0)
    prev = seed
    for i in range(period, n):
        prev = values[i] * k + prev * (1.0 - k)
        out[i] = prev
    return out


def true_range(highs: Sequence[float], lows: Sequence[float],
               closes: Sequence[float]) -> List[float]:
    """Per-bar True Range. First bar TR = high - low (no prior close)."""
    n = len(closes)
    tr: List[float] = []
    for i in range(n):
        if i == 0:
            tr.append(highs[i] - lows[i])
        else:
            prev_close = closes[i - 1]
            tr.append(max(
                highs[i] - lows[i],
                abs(highs[i] - prev_close),
                abs(lows[i] - prev_close),
            ))
    return tr


def atr(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float],
        period: int = ATR_PERIOD) -> List[Optional[float]]:
    """ATR using Wilder's RMA of True Range. Returns a list aligned to input;
    None until `period` bars are available."""
    n = len(closes)
    if not (len(highs) == len(lows) == n):
        raise ValueError("highs, lows, closes must be the same length")
    out: List[Optional[float]] = [None] * n
    if n < period:
        return out
    tr = true_range(highs, lows, closes)
    # Wilder seed = simple average of first `period` TR values.
    seed = sum(tr[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, n):
        prev = (prev * (period - 1) + tr[i]) / period
        out[i] = prev
    return out


def m15_return_12_atr(closes: Sequence[float], atr_series: Sequence[Optional[float]],
                      index: int = -1, lookback: int = RETURN_LOOKBACK) -> Optional[float]:
    """(close[index] - close[index - lookback]) / ATR[index].

    Returns None if there is not enough history or ATR is unavailable / zero.
    """
    n = len(closes)
    if n == 0:
        return None
    idx = index if index >= 0 else n + index
    if idx - lookback < 0 or idx >= n:
        return None
    atr_val = atr_series[idx]
    if atr_val is None or atr_val == 0:
        return None
    return (closes[idx] - closes[idx - lookback]) / atr_val


def ema200_slope_nonnegative(ema_series: Sequence[Optional[float]],
                             index: int = -1, lookback: int = SLOPE_LOOKBACK) -> bool:
    """EMA200[index] - EMA200[index - lookback] >= 0.

    Returns False if either point is unavailable (conservative: no evidence of
    an up-slope -> treat as not non-negative)."""
    n = len(ema_series)
    if n == 0:
        return False
    idx = index if index >= 0 else n + index
    if idx - lookback < 0 or idx >= n:
        return False
    now = ema_series[idx]
    prior = ema_series[idx - lookback]
    if now is None or prior is None:
        return False
    return (now - prior) >= 0


def above_ema(close: float, ema_value: Optional[float]) -> bool:
    """True if close is at or above the EMA. False if EMA is unavailable."""
    if ema_value is None:
        return False
    return close >= ema_value


def session_for_hour_utc(hour: int) -> str:
    """Map a UTC hour (0–23) to a session bucket."""
    for name, start, end in SESSION_BUCKETS_UTC:
        if start <= hour < end:
            return name
    return "other"


def session_for_utc(timestamp) -> str:
    """Map a UTC timestamp (datetime or ISO string) to a session bucket.

    Assumes the timestamp is already UTC (matches the VPS feed which returns
    tz-aware UTC candle times)."""
    if hasattr(timestamp, "hour"):
        return session_for_hour_utc(int(timestamp.hour))
    # ISO string fallback: 'YYYY-MM-DD HH:MM:SS'
    s = str(timestamp)
    try:
        hour = int(s.split(" ")[1].split(":")[0]) if " " in s else int(s.split("T")[1][:2])
    except (IndexError, ValueError) as exc:
        raise ValueError(f"Cannot extract UTC hour from timestamp {timestamp!r}") from exc
    return session_for_hour_utc(hour)
