# coding: utf-8
"""
Faithful port of the locked research zone engine (claudeLoad/SnRTool/researchCode/
zone_research_io.py) — the algorithm that generated the Phase 39 zone fixtures.

Pure-Python (list-based) so it matches the rest of this package and is testable
without pandas. Logic mirrors the research 1:1:

  * atr_sma            = SMA of True Range (NOT Wilder)   [research calculate_atr]
  * find_confirmed_swings(lookback=5): pivot == min/max over +/-lookback window,
    zone becomes known `lookback` bars later (created_index = pivot + lookback)
  * zone band          = price +/- (ATR * zone_width_atr)/2   (0.35 ATR total width)
  * clustering         = overlap OR within (ATR * merge_tolerance_atr) of a zone
  * touches            = number of confirmed swings merged into the zone
  * label              = _label_from_score(_score_zone_event(...))  (score-based)

Two entry points, matching research:
  * generate_zones        — current end-of-data view (_score_zone)      [dashboard]
  * generate_zone_events  — historical point-in-time events (_score_zone_event)
                            [research / fixture generation]
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence

# Research defaults (zone_research_io.generate_zone*).
SWING_LOOKBACK = 5
ATR_PERIOD = 14
ZONE_WIDTH_ATR = 0.35
MERGE_TOLERANCE_ATR = 0.20
MIN_TOUCHES = 2
MAX_ZONES_PER_TYPE = 20


# ── indicators ────────────────────────────────────────────────────────────────

def atr_sma(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float],
            period: int = ATR_PERIOD) -> List[Optional[float]]:
    """SMA of True Range, matching research calculate_atr (rolling(period).mean())."""
    n = len(closes)
    tr: List[float] = []
    for i in range(n):
        if i == 0:
            tr.append(highs[i] - lows[i])
        else:
            tr.append(max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1]),
            ))
    out: List[Optional[float]] = [None] * n
    for i in range(n):
        if i >= period - 1:
            out[i] = sum(tr[i - period + 1:i + 1]) / period
    return out


def prepare(times, opens, highs, lows, closes, atr_period: int = ATR_PERIOD) -> dict:
    """Compute ATR, drop leading rows without ATR, reindex — mirrors prepare_ohlc
    (dropna + reset_index). Returns aligned lists on the trimmed frame."""
    atr = atr_sma(highs, lows, closes, atr_period)
    keep = [i for i in range(len(closes)) if atr[i] is not None]
    return {
        "time": [times[i] for i in keep],
        "open": [opens[i] for i in keep],
        "high": [highs[i] for i in keep],
        "low": [lows[i] for i in keep],
        "close": [closes[i] for i in keep],
        "atr": [atr[i] for i in keep],
    }


# ── swings ────────────────────────────────────────────────────────────────────

def find_confirmed_swings(df: dict, lookback: int = SWING_LOOKBACK) -> List[dict]:
    """Confirmed swing highs/lows. A pivot is a swing if it equals the min(low)/
    max(high) over [pivot-lookback, pivot+lookback]; known `lookback` bars later."""
    highs, lows, times = df["high"], df["low"], df["time"]
    n = len(lows)
    swings: List[dict] = []
    for p in range(lookback, n - lookback):
        wl = lows[p - lookback:p + lookback + 1]
        wh = highs[p - lookback:p + lookback + 1]
        created = p + lookback
        if highs[p] == max(wh):
            swings.append({"pivot_index": p, "created_index": created,
                           "time": times[p], "created_time": times[created],
                           "price": highs[p], "zone_type": "resistance"})
        if lows[p] == min(wl):
            swings.append({"pivot_index": p, "created_index": created,
                           "time": times[p], "created_time": times[created],
                           "price": lows[p], "zone_type": "support"})
    # research sorts by created_index before clustering
    swings.sort(key=lambda s: s["created_index"])
    return swings


def _overlap_or_near(elow, ehigh, clow, chigh, tol) -> bool:
    overlap = not (chigh < elow or clow > ehigh)
    if overlap:
        return True
    distance = min(abs(clow - ehigh), abs(elow - chigh))
    return distance <= tol


def _label_from_score(score: int) -> str:
    if score >= 72:
        return "strong"
    if score >= 58:
        return "medium"
    return "weak"


def _score_touches(touches: int) -> int:
    if touches <= 1:
        return 25
    if touches == 2:
        return 62
    if touches == 3:
        return 68
    if touches == 4:
        return 64
    if touches == 5:
        return 56
    if touches == 6:
        return 50
    return 42  # over-tested


def _score_zone_event(touches: int, age_bars: int, zone_height_atr: float) -> int:
    score = _score_touches(touches)
    if age_bars <= 50:
        score += 12
    elif age_bars <= 150:
        score += 8
    elif age_bars <= 300:
        score += 4
    else:
        score -= 6
    if zone_height_atr > 1.5:
        score -= 12
    elif zone_height_atr > 1.0:
        score -= 6
    return int(max(0, min(100, score)))


def _score_zone(touches: int, age_bars: int, last_touch_age_bars: int, zone_height_atr: float) -> int:
    score = _score_touches(touches)
    if last_touch_age_bars <= 50:
        score += 12
    elif last_touch_age_bars <= 150:
        score += 8
    elif last_touch_age_bars <= 300:
        score += 4
    else:
        score -= 6
    if age_bars > 500:
        score -= 10
    elif age_bars > 300:
        score -= 5
    if zone_height_atr > 1.5:
        score -= 12
    elif zone_height_atr > 1.0:
        score -= 6
    return int(max(0, min(100, score)))


# ── zone generation ─────────────────────────────────────────────────────────

def generate_zone_events(times, opens, highs, lows, closes,
                         symbol: str = "EURUSD", timeframe: str = "M15",
                         swing_lookback: int = SWING_LOOKBACK, atr_period: int = ATR_PERIOD,
                         zone_width_atr: float = ZONE_WIDTH_ATR,
                         merge_tolerance_atr: float = MERGE_TOLERANCE_ATR,
                         min_touches: int = MIN_TOUCHES, max_events: int = 100000) -> List[dict]:
    """Historical point-in-time zone events — faithful port of
    zone_research_io.generate_zone_events (the fixture generator)."""
    df = prepare(times, opens, highs, lows, closes, atr_period)
    swings = find_confirmed_swings(df, swing_lookback)
    if not swings:
        return []

    active: List[dict] = []
    events: List[dict] = []
    n = len(df["close"])

    for sw in swings:
        ci = sw["created_index"]
        if ci >= n:
            continue
        atr = df["atr"][ci]
        if atr is None or (isinstance(atr, float) and math.isnan(atr)) or atr <= 0:
            continue
        price = sw["price"]
        ztype = sw["zone_type"]
        half = (atr * zone_width_atr) / 2.0
        clow, chigh = price - half, price + half
        tol = atr * merge_tolerance_atr

        match = None
        for z in active:
            if z["zone_type"] != ztype:
                continue
            if _overlap_or_near(z["low"], z["high"], clow, chigh, tol):
                match = z
                break

        if match is None:
            match = {
                "symbol": symbol, "timeframe": timeframe, "zone_type": ztype,
                "low": clow, "high": chigh, "touches": 1,
                "first_pivot_index": sw["pivot_index"], "last_pivot_index": sw["pivot_index"],
                "first_created_index": ci, "last_touch_index": ci,
                "source_prices": [price], "last_emitted_touch_count": 0,
            }
            active.append(match)
        else:
            match["low"] = min(match["low"], clow)
            match["high"] = max(match["high"], chigh)
            match["touches"] += 1
            match["last_pivot_index"] = sw["pivot_index"]
            match["last_touch_index"] = ci
            match["source_prices"].append(price)

        if match["touches"] >= min_touches and match["touches"] > match["last_emitted_touch_count"]:
            age_bars = ci - match["first_created_index"]
            zone_height = match["high"] - match["low"]
            zh_atr = zone_height / atr if atr > 0 else 0
            score = _score_zone_event(match["touches"], age_bars, zh_atr)
            events.append({
                "symbol": symbol, "timeframe": timeframe, "zone_type": ztype,
                "low": round(match["low"], 6), "high": round(match["high"], 6),
                "score": score, "label": _label_from_score(score),
                "touches": match["touches"], "created_index": ci,
                "created_time": df["time"][ci], "atr_at_creation": atr,
            })
            match["last_emitted_touch_count"] = match["touches"]
        if len(events) >= max_events:
            break
    return events


def generate_zones(times, opens, highs, lows, closes,
                   symbol: str = "EURUSD", timeframe: str = "M15",
                   swing_lookback: int = SWING_LOOKBACK, atr_period: int = ATR_PERIOD,
                   zone_width_atr: float = ZONE_WIDTH_ATR,
                   merge_tolerance_atr: float = MERGE_TOLERANCE_ATR,
                   min_touches: int = MIN_TOUCHES, max_zones_per_type: int = MAX_ZONES_PER_TYPE) -> List[dict]:
    """Current end-of-data zone view — faithful port of generate_zones (dashboard)."""
    df = prepare(times, opens, highs, lows, closes, atr_period)
    swings = find_confirmed_swings(df, swing_lookback)
    if not swings:
        return []
    n = len(df["close"])
    zones: List[dict] = []

    for sw in swings:
        ci = sw["created_index"]
        if ci >= n:
            continue
        atr = df["atr"][ci]
        if atr is None or atr <= 0:
            continue
        price = sw["price"]
        ztype = sw["zone_type"]
        half = (atr * zone_width_atr) / 2.0
        clow, chigh = price - half, price + half
        tol = atr * merge_tolerance_atr

        match = None
        for z in zones:
            if z["zone_type"] != ztype:
                continue
            if _overlap_or_near(z["low"], z["high"], clow, chigh, tol):
                match = z
                break
        if match is None:
            zones.append({
                "symbol": symbol, "timeframe": timeframe, "zone_type": ztype,
                "low": clow, "high": chigh, "touches": 1,
                "first_pivot_index": sw["pivot_index"], "last_pivot_index": sw["pivot_index"],
                "created_index": ci, "last_touch_index": ci, "source_prices": [price],
            })
        else:
            match["low"] = min(match["low"], clow)
            match["high"] = max(match["high"], chigh)
            match["touches"] += 1
            match["last_pivot_index"] = sw["pivot_index"]
            match["last_touch_index"] = ci
            match["created_index"] = ci
            match["source_prices"].append(price)

    last = n - 1
    current_atr = df["atr"][last] or 0.0
    out: List[dict] = []
    for z in zones:
        if z["touches"] < min_touches:
            continue
        age_bars = last - z["created_index"]
        last_touch_age = last - z["last_touch_index"]
        zh = z["high"] - z["low"]
        zh_atr = zh / current_atr if current_atr > 0 else 0
        score = _score_zone(z["touches"], age_bars, last_touch_age, zh_atr)
        out.append({
            "symbol": z["symbol"], "timeframe": z["timeframe"], "zone_type": z["zone_type"],
            "low": round(z["low"], 6), "high": round(z["high"], 6),
            "zone_mid": round((z["low"] + z["high"]) / 2.0, 6),
            "score": score, "label": _label_from_score(score), "touches": z["touches"],
            "created_time": df["time"][z["created_index"]],
            "last_touch_time": df["time"][z["last_touch_index"]],
            "atr_at_creation": df["atr"][z["created_index"]],
        })
    sup = sorted([z for z in out if z["zone_type"] == "support"], key=lambda z: z["score"], reverse=True)[:max_zones_per_type]
    res = sorted([z for z in out if z["zone_type"] == "resistance"], key=lambda z: z["score"], reverse=True)[:max_zones_per_type]
    return sup + res
