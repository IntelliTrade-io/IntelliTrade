# coding: utf-8
from datetime import datetime, timezone, timedelta

from support_resistance import zone_detector
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


def test_detect_produces_strong_zone_on_repeated_shelf():
    # 25 distinct dips to ~1.1000 separated by rallies -> strong shelf
    bars = []
    for _ in range(25):
        bars.append((1.1000, 1.1005))   # touch the shelf
        bars.append((1.1080, 1.1090))   # rally away
    seqs = _seqs(bars)
    atr = [0.0010] * len(bars)
    zones = zone_detector.detect_support_zones(seqs, atr)
    assert zones, "expected at least one zone"
    top = zones[0]
    assert top.touch_count >= 20
    assert top.static_strength == "strong"


def test_overlapping_zones_merged():
    # two pivot groups whose bands overlap should collapse to one zone
    bars = [(1.1000, 1.1005), (1.1080, 1.1090)] * 5 + [(1.1002, 1.1007), (1.1080, 1.1090)] * 5
    seqs = _seqs(bars)
    atr = [0.0010] * len(bars)
    zones = zone_detector.detect_support_zones(seqs, atr)
    # bands ~1.0965..1.104 overlap -> single merged shelf, not two
    assert len(zones) == 1


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


# ── zone-detection regression lock ────────────────────────────────────────────
# Not research ground truth — locks CURRENT detector behaviour against regressions.

def test_zone_detection_regression_three_shelves():
    # Three well-separated shelves visited a fixed number of times.
    bars = []
    bars += [(1.1000, 1.1005)] * 1
    for _ in range(25):                          # ~strong shelf at 1.1000
        bars += [(1.1000, 1.1006), (1.1090, 1.1100)]
    for _ in range(15):                          # ~medium shelf at 1.0950
        bars += [(1.0950, 1.0956), (1.1040, 1.1050)]
    for _ in range(8):                           # ~weak shelf at 1.0900
        bars += [(1.0900, 1.0906), (1.0990, 1.1000)]
    seqs = _seqs(bars)
    atr = [0.0010] * len(bars)
    zones = zone_detector.detect_support_zones(seqs, atr)

    strengths = sorted(z.static_strength for z in zones)
    # exactly three shelves, one of each strength
    assert len(zones) == 3
    assert strengths == ["medium", "strong", "weak"]
    # strongest-first ordering
    assert zones[0].static_strength == "strong"
    assert zones[0].touch_count >= 20
