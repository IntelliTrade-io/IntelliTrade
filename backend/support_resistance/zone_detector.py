# coding: utf-8
"""
Static support zone detection (M15).

Zone detection
--------------
detect_support_zones() now uses the FAITHFUL port of the locked research zone
engine (research_zone_engine.generate_zones), verified to reproduce
zone_research_io.generate_zones 1:1 on identical candles (18486/18486 events
identical, labels included). Locked research params: swing_lookback=4,
min_touches=3, merge_tolerance_atr=0.30, zone_width_atr=0.35.

The earlier reconstruction functions (detect_pivot_lows / cluster_support_zones /
count_touches / _merge_overlapping) are retained below as LEGACY helpers but are
no longer used by detect_support_zones.

Other stages:
  * zone_proximity      — is current price near / approaching a zone
  * close_reclaim_state — full close-reclaim qualifier (touch -> confirm -> hold)
"""

from dataclasses import dataclass, field
from typing import List, Optional, Sequence

from . import config
from . import research_zone_engine as _rze
from .static_strength import label_static_strength, StaticStrength

# Locked research zone params (research.ipynb) — verified to reproduce the
# research engine exactly. NOT the same as the old reconstruction tunables below.
RESEARCH_SWING_LOOKBACK = 4
RESEARCH_MIN_TOUCHES = 3
RESEARCH_MERGE_TOL_ATR = 0.30
RESEARCH_ZONE_WIDTH_ATR = 0.35

# Legacy reconstruction tunables (kept for the retained helper functions only).
PIVOT_STRENGTH = 3           # bars on each side that must be higher (pivot low)
ZONE_MERGE_ATR_FRAC = 0.75   # merge pivots within 0.75 * ATR of the cluster mean
ZONE_BAND_ATR_FRAC = 0.35    # half-band padding around the pivot spread (~stop buffer)
PROXIMITY_ATR_FRAC = 1.00    # "near" a zone if within 1.0 ATR of the band


@dataclass
class SupportZone:
    zone_low: float
    zone_high: float
    zone_mid: float
    touch_count: int
    static_strength: StaticStrength
    zone_created_time: object          # tz-aware datetime
    first_touch_time: object
    last_touch_time: object
    atr_at_creation: Optional[float]
    zone_side: str = "support"
    pivot_prices: List[float] = field(default_factory=list)

    def as_supabase_zone_row(self, symbol: str, model_version: str) -> dict:
        """Shape for the sr_zones table."""
        def _iso(t):
            return t.isoformat() if hasattr(t, "isoformat") else (str(t) if t is not None else None)
        return {
            "symbol": symbol,
            "zone_side": self.zone_side,
            "zone_low": float(self.zone_low),
            "zone_high": float(self.zone_high),
            "zone_mid": float(self.zone_mid),
            "static_strength": self.static_strength,
            "touch_count": int(self.touch_count),
            "zone_created_time": _iso(self.zone_created_time),
            "first_touch_time": _iso(self.first_touch_time),
            "last_touch_time": _iso(self.last_touch_time),
            "atr_at_creation": float(self.atr_at_creation) if self.atr_at_creation else None,
            "model_version": model_version,
            "is_active": True,
        }


def detect_pivot_lows(lows: Sequence[float], strength: int = PIVOT_STRENGTH) -> List[int]:
    """Return indices of swing lows: a low strictly <= its `strength` neighbours
    on each side (and strictly < at least one side to avoid flat runs)."""
    n = len(lows)
    pivots: List[int] = []
    for i in range(strength, n - strength):
        window_left = lows[i - strength:i]
        window_right = lows[i + 1:i + 1 + strength]
        if all(lows[i] <= x for x in window_left) and all(lows[i] <= x for x in window_right):
            if any(lows[i] < x for x in window_left + list(window_right)):
                pivots.append(i)
    return pivots


def _recent_atr(atr_series: Sequence[Optional[float]]) -> Optional[float]:
    """Last available (non-None, >0) ATR — fallback when a bar's ATR is missing."""
    for v in reversed(atr_series):
        if v:
            return v
    return None


def count_touches(seqs: dict, zone_low: float, zone_high: float) -> dict:
    """Count DISTINCT price re-entries into [zone_low, zone_high] across history.

    A "touch" is a rising edge: a bar whose range overlaps the zone band when the
    previous bar did not. Consecutive bars inside the band count as ONE touch.
    Returns touch count plus the first/last touch bar indices.
    """
    lows = seqs["low"]
    highs = seqs["high"]
    touches = 0
    first_idx = None
    last_idx = None
    inside_prev = False
    for i in range(len(lows)):
        # bar range [low, high] overlaps zone band [zone_low, zone_high]
        overlaps = lows[i] <= zone_high and highs[i] >= zone_low
        if overlaps and not inside_prev:
            touches += 1
            if first_idx is None:
                first_idx = i
            last_idx = i
        elif overlaps:
            last_idx = i
        inside_prev = overlaps
    return {"touch_count": touches, "first_idx": first_idx, "last_idx": last_idx}


def cluster_support_zones(seqs: dict, atr_series: Sequence[Optional[float]],
                          pivot_indices: Sequence[int],
                          merge_atr_frac: float = ZONE_MERGE_ATR_FRAC,
                          band_atr_frac: float = ZONE_BAND_ATR_FRAC) -> List[SupportZone]:
    """Merge pivot lows into support zones, then count real touches.

    Clustering: pivots are grouped by proximity to the RUNNING cluster mean
    (tolerance = merge_atr_frac * ATR), so a drifting shelf still merges.
    touch_count is then the number of distinct re-entries into the final band
    (count_touches) — NOT just the pivot count — so a genuinely well-defended
    shelf earns a medium/strong label.
    """
    lows = seqs["low"]
    times = seqs["time"]
    if not pivot_indices:
        return []

    atr_ref_global = _recent_atr(atr_series) or 0.0

    # Group by price proximity to the running cluster mean.
    ordered = sorted(pivot_indices, key=lambda i: lows[i])
    clusters: List[List[int]] = []
    current: List[int] = [ordered[0]]
    for i in ordered[1:]:
        mean_price = sum(lows[j] for j in current) / len(current)
        atr_ref = atr_series[i] if i < len(atr_series) and atr_series[i] else atr_ref_global
        tol = (atr_ref or 0.0) * merge_atr_frac
        if tol <= 0:
            tol = abs(lows[i]) * 0.0005  # ~5 pip fallback for FX
        if abs(lows[i] - mean_price) <= tol:
            current.append(i)
        else:
            clusters.append(current)
            current = [i]
    clusters.append(current)

    zones: List[SupportZone] = []
    for cl in clusters:
        prices = [lows[j] for j in cl]
        chrono = sorted(cl)
        created_idx = chrono[0]
        atr_at_creation = atr_series[created_idx] if (created_idx < len(atr_series)
                                                      and atr_series[created_idx]) else atr_ref_global
        half = (atr_at_creation or 0.0) * band_atr_frac
        if half <= 0:
            half = max((max(prices) - min(prices)) / 2.0, abs(prices[0]) * 0.0003)
        zone_low = min(prices) - half
        zone_high = max(prices) + half
        zone_mid = (zone_low + zone_high) / 2.0

        touch = count_touches(seqs, zone_low, zone_high)
        tc = touch["touch_count"]
        first_idx = touch["first_idx"] if touch["first_idx"] is not None else created_idx
        last_idx = touch["last_idx"] if touch["last_idx"] is not None else chrono[-1]

        zones.append(SupportZone(
            zone_low=zone_low,
            zone_high=zone_high,
            zone_mid=zone_mid,
            touch_count=tc,
            static_strength=label_static_strength(tc),
            zone_created_time=times[created_idx],
            first_touch_time=times[first_idx],
            last_touch_time=times[last_idx],
            atr_at_creation=atr_at_creation,
            pivot_prices=prices,
        ))

    zones = _merge_overlapping(zones, seqs)
    # strongest + most recent first
    zones.sort(key=lambda z: (z.touch_count, z.last_touch_time), reverse=True)
    return zones


def _merge_overlapping(zones: List[SupportZone], seqs: dict) -> List[SupportZone]:
    """Collapse zones whose bands overlap into one, recounting touches. Kills the
    near-duplicate shelves that made every zone look weak."""
    if len(zones) <= 1:
        return zones
    times = seqs["time"]
    by_low = sorted(zones, key=lambda z: z.zone_low)
    merged: List[SupportZone] = []
    cur = by_low[0]
    for z in by_low[1:]:
        if z.zone_low <= cur.zone_high:  # overlap
            zone_low = min(cur.zone_low, z.zone_low)
            zone_high = max(cur.zone_high, z.zone_high)
            touch = count_touches(seqs, zone_low, zone_high)
            created_idx = touch["first_idx"] if touch["first_idx"] is not None else 0
            last_idx = touch["last_idx"] if touch["last_idx"] is not None else -1
            cur = SupportZone(
                zone_low=zone_low,
                zone_high=zone_high,
                zone_mid=(zone_low + zone_high) / 2.0,
                touch_count=touch["touch_count"],
                static_strength=label_static_strength(touch["touch_count"]),
                zone_created_time=times[created_idx],
                first_touch_time=times[created_idx],
                last_touch_time=times[last_idx],
                atr_at_creation=cur.atr_at_creation or z.atr_at_creation,
                pivot_prices=cur.pivot_prices + z.pivot_prices,
            )
        else:
            merged.append(cur)
            cur = z
    merged.append(cur)
    return merged


def detect_support_zones(seqs: dict, atr_series: Sequence[Optional[float]] = None,
                         **_legacy_kwargs) -> List[SupportZone]:
    """Detect current support zones via the faithful research engine port.

    Uses research_zone_engine.generate_zones with the locked research params
    (verified 1:1 against zone_research_io). `atr_series` is accepted for
    backward compatibility but IGNORED — the research engine computes its own
    SMA ATR internally. Returns SupportZone objects (support side only).
    """
    zones = _rze.generate_zones(
        seqs["time"], seqs["open"], seqs["high"], seqs["low"], seqs["close"],
        symbol=config.symbol(), timeframe="M15",
        swing_lookback=RESEARCH_SWING_LOOKBACK,
        min_touches=RESEARCH_MIN_TOUCHES,
        merge_tolerance_atr=RESEARCH_MERGE_TOL_ATR,
        zone_width_atr=RESEARCH_ZONE_WIDTH_ATR,
    )
    out: List[SupportZone] = []
    for z in zones:
        if z["zone_type"] != "support":
            continue
        out.append(SupportZone(
            zone_low=z["low"],
            zone_high=z["high"],
            zone_mid=z["zone_mid"],
            touch_count=z["touches"],
            static_strength=z["label"],
            zone_created_time=z["created_time"],
            first_touch_time=z["created_time"],
            last_touch_time=z["last_touch_time"],
            atr_at_creation=z["atr_at_creation"],
        ))
    # strongest (by research score proxy: strength then recency) first
    order = {"strong": 3, "medium": 2, "weak": 1}
    out.sort(key=lambda z: (order.get(z.static_strength, 0), z.last_touch_time), reverse=True)
    return out


def zone_proximity(zone: SupportZone, close: float, atr_value: Optional[float],
                   near_atr_frac: float = PROXIMITY_ATR_FRAC) -> dict:
    """Where is price relative to the zone right now?

    Returns {'inside', 'near', 'above', 'below', 'distance_atr'}.
    """
    tol = (atr_value or 0.0) * near_atr_frac
    inside = zone.zone_low <= close <= zone.zone_high
    above = close > zone.zone_high
    below = close < zone.zone_low
    if atr_value:
        distance = 0.0 if inside else (
            (close - zone.zone_high) / atr_value if above
            else (zone.zone_low - close) / atr_value
        )
    else:
        distance = None
    near = inside or (distance is not None and abs(distance) <= near_atr_frac)
    return {
        "inside": inside,
        "near": near,
        "above": above,
        "below": below,
        "distance_atr": distance,
        "tol": tol,
    }


def close_reclaim_state(seqs: dict, zone: SupportZone) -> dict:
    """Close-reclaim qualifier — full mechanics from the locked model.

    Locked definition (base_engine): confirmation_type = close_reclaim, with
        max_touch_wait_bars  (how far back a qualifying touch may sit)
        max_confirm_wait_bars (bars after the touch in which a close must reclaim)
        max_hold_bars         (how long after confirmation the reclaim stays "active")

    Algorithm:
      1. A TOUCH is a bar whose range overlaps [zone_low, zone_high].
      2. Scanning the most recent touches first, a reclaim is CONFIRMED when a bar
         within the next `max_confirm_wait_bars` CLOSES strictly above zone_high.
      3. The reclaim is ACTIVE now if that confirmation happened within the last
         `max_hold_bars` bars.

    Returns touch/confirm times, bars since confirmation, and active/reclaimed
    flags. This models the described research trigger (it is the live analogue of
    the backtest entry) but note: only the dynamic SCORE is golden-fixture
    validated — there is no reclaim-timing fixture, so this is validated by unit
    tests of the mechanics, not against the research branch's per-trade timings.
    """
    lows = seqs["low"]
    highs = seqs["high"]
    closes = seqs["close"]
    times = seqs["time"]
    n = len(closes)

    empty = {
        "reclaimed": False,
        "active": False,
        "touch_time": None,
        "confirm_time": None,
        "bars_since_confirm": None,
    }
    if n == 0:
        return empty

    be = config.base_engine()
    max_confirm = int(be.get("max_confirm_wait_bars", 8))
    max_touch_wait = int(be.get("max_touch_wait_bars", 384))
    max_hold = int(be.get("max_hold_bars", 48))

    window_start = max(0, n - max_touch_wait)
    touches = [
        i for i in range(window_start, n)
        if lows[i] <= zone.zone_high and highs[i] >= zone.zone_low
    ]
    if not touches:
        return empty

    # Most recent touch with a valid reclaim close wins.
    for t in reversed(touches):
        for j in range(t + 1, min(n, t + 1 + max_confirm)):
            if closes[j] > zone.zone_high:
                bars_since = (n - 1) - j
                return {
                    "reclaimed": True,
                    "active": bars_since <= max_hold,
                    "touch_time": times[t],
                    "confirm_time": times[j],
                    "bars_since_confirm": bars_since,
                }

    # Touched but never reclaimed within the confirm window.
    return {**empty, "touch_time": times[touches[-1]]}
