# coding: utf-8
from datetime import datetime, timezone, timedelta

from support_resistance import zone_detector


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
