# coding: utf-8
from datetime import datetime, timezone, timedelta

import math

from support_resistance import zone_detector
from support_resistance import research_zone_engine as rze
from support_resistance.zone_detector import SupportZone


def _seqs(bars):
    """bars: list of (low, high). Builds a seqs dict with synthetic times/closes."""
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return {
        "low": [b[0] for b in bars],
        "high": [b[1] for b in bars],
        "close": [(b[0] + b[1]) / 2 for b in bars],
        "time": [t0 + timedelta(minutes=15 * i) for i in range(len(bars))],
    }


def test_count_touches_rising_edge():
    # price enters the [1.00, 1.01] band as 3 separated events
    bars = [
        (1.05, 1.06),           # outside
        (1.00, 1.005),          # touch 1
        (1.001, 1.004),         # still inside -> same touch
        (1.05, 1.06),           # leave
        (1.00, 1.008),          # touch 2
        (1.05, 1.06),           # leave
        (0.999, 1.002),         # touch 3 (overlaps band)
    ]
    res = zone_detector.count_touches(_seqs(bars), 1.00, 1.01)
    assert res["touch_count"] == 3
    assert res["first_idx"] == 1
    assert res["last_idx"] == 6


def test_count_touches_none_when_never_entered():
    bars = [(2.0, 2.1), (2.0, 2.2)]
    res = zone_detector.count_touches(_seqs(bars), 1.0, 1.1)
    assert res["touch_count"] == 0
    assert res["first_idx"] is None


# ── research zone engine (faithful port, verified 1:1 vs zone_research_io) ─────

def test_research_swing_confirmed_after_lookback():
    # global low at index 3; confirmed as a support swing `lookback` bars later
    lows = [5, 4, 3, 2, 3, 4, 5, 6, 7, 8, 9]
    df = {"low": lows, "high": [x + 1 for x in lows], "time": list(range(len(lows)))}
    swings = rze.find_confirmed_swings(df, lookback=2)
    sup = [s for s in swings if s["zone_type"] == "support"]
    assert any(s["pivot_index"] == 3 and s["created_index"] == 5 for s in sup)


def test_research_atr_is_sma_of_true_range():
    # flat identical bars -> TR = high-low = 1.0 every bar -> SMA ATR == 1.0
    highs = [1.5] * 20
    lows = [0.5] * 20
    closes = [1.0] * 20
    atr = rze.atr_sma(highs, lows, closes, period=14)
    assert atr[12] is None and atr[13] is not None
    assert abs(atr[-1] - 1.0) < 1e-9


def test_detect_support_zones_runs_and_labels_valid():
    # synthetic series with repeated dips -> detector returns support zones with
    # research labels (weak/medium/strong). Loose: the 1:1 match test is the
    # real validation; this just guards the live wiring.
    from datetime import datetime, timezone, timedelta
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    lows, highs, opens, closes, times = [], [], [], [], []
    for i in range(400):
        base = 1.1050 + math.sin(i / 7.0) * 0.0030   # oscillation -> repeated swing lows
        lo, hi = base - 0.0006, base + 0.0006
        lows.append(lo); highs.append(hi)
        opens.append(base); closes.append(base + math.sin(i / 3.0) * 0.0002)
        times.append(t0 + timedelta(minutes=15 * i))
    seqs = {"time": times, "open": opens, "high": highs, "low": lows, "close": closes}
    zones = zone_detector.detect_support_zones(seqs)
    assert all(z.static_strength in ("weak", "medium", "strong") for z in zones)
    assert all(z.zone_high > z.zone_low for z in zones)
    assert all(z.touch_count >= zone_detector.RESEARCH_MIN_TOUCHES for z in zones)


# ── close-reclaim mechanics ───────────────────────────────────────────────────

def _seqs_lhc(bars):
    """bars: list of (low, high, close)."""
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return {
        "low": [b[0] for b in bars],
        "high": [b[1] for b in bars],
        "close": [b[2] for b in bars],
        "time": [t0 + timedelta(minutes=15 * i) for i in range(len(bars))],
    }


def _zone(low, high):
    t = datetime(2024, 1, 1, tzinfo=timezone.utc)
    mid = (low + high) / 2
    return SupportZone(
        zone_low=low, zone_high=high, zone_mid=mid, touch_count=12,
        static_strength="medium", zone_created_time=t, first_touch_time=t,
        last_touch_time=t, atr_at_creation=0.0010,
    )


# zone band [1.0995, 1.1005]. "above" bars stay >1.1005 (no overlap = not a touch);
# "below" bars stay <1.0995 (no overlap); a touch bar's range straddles the band.

def test_reclaim_confirmed_and_active():
    zone = _zone(1.0995, 1.1005)
    bars = (
        [(1.1010, 1.1020, 1.1015)] * 5          # above, no touch
        + [(1.0990, 1.1002, 1.0998)]            # touch (idx 5), closes inside
        + [(1.1008, 1.1018, 1.1012)]            # reclaim: closes above zone_high (idx 6)
        + [(1.1012, 1.1020, 1.1016)]            # continues above (idx 7)
    )
    res = zone_detector.close_reclaim_state(_seqs_lhc(bars), zone)
    assert res["reclaimed"] is True
    assert res["active"] is True
    assert res["bars_since_confirm"] == 1
    assert res["touch_time"] is not None
    assert res["confirm_time"] is not None


def test_touch_without_reclaim_is_not_reclaimed():
    zone = _zone(1.0995, 1.1005)
    bars = (
        [(1.1010, 1.1020, 1.1015)] * 3
        + [(1.0990, 1.1002, 1.0998)]            # touch
        + [(1.0980, 1.0990, 1.0985)] * 12       # fully below -> never reclaims
    )
    res = zone_detector.close_reclaim_state(_seqs_lhc(bars), zone)
    assert res["reclaimed"] is False
    assert res["active"] is False
    assert res["touch_time"] is not None        # touch recorded
    assert res["confirm_time"] is None


def test_reclaim_beyond_confirm_window_not_counted():
    zone = _zone(1.0995, 1.1005)
    # single touch at idx 0, then 10 bars fully below (window of 8 lapses), then late close above
    bars = (
        [(1.0990, 1.1002, 1.0998)]              # touch at index 0
        + [(1.0980, 1.0990, 1.0985)] * 10       # fully below -> confirm window (8) lapses
        + [(1.1008, 1.1018, 1.1012)]            # late reclaim close (too late for that touch)
    )
    res = zone_detector.close_reclaim_state(_seqs_lhc(bars), zone)
    assert res["reclaimed"] is False


# (The old touch-threshold regression test was removed — labels are now the
# research score-based weak/medium/strong, validated 1:1 against zone_research_io.)
