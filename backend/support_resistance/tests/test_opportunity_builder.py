# coding: utf-8
from datetime import datetime, timezone

import pytest

from support_resistance.opportunity_builder import (
    MarketContext, build_opportunity, POSITIVE_GRADES, DISCLAIMER,
)
from support_resistance.zone_detector import SupportZone


def _strong_zone():
    t = datetime(2021, 2, 19, 11, 0, tzinfo=timezone.utc)
    return SupportZone(
        zone_low=1.2000, zone_high=1.2020, zone_mid=1.2010,
        touch_count=25, static_strength="strong",
        zone_created_time=t, first_touch_time=t, last_touch_time=t,
        atr_at_creation=0.0010,
    )


def _ctx(session, **overrides):
    base = dict(
        session=session,
        m15_return_12_atr=0.1665,
        h1_above_ema200=True,
        h1_ema200_slope_nonnegative=True,
        h4_above_ema200=True,
        h4_ema200_slope_nonnegative=True,
        m15_above_ema200=True,
        calculated_at="2021-02-19T12:45:00+00:00",
    )
    base.update(overrides)
    return MarketContext(**base)


def test_strong_context_produces_positive_opportunity():
    # matches the fixture A+ row context (london_midday, all trend true)
    opp = build_opportunity(_strong_zone(), _ctx("london_midday"))
    assert opp["dynamic_grade"] in POSITIVE_GRADES
    assert opp["_is_positive_opportunity"] is True


def test_no_late_session_positive_opportunity():
    """A late session must NEVER emit a positive (green/elite/a+) opportunity,
    even with otherwise A+ context (session_filter = exclude_late)."""
    opp = build_opportunity(_strong_zone(), _ctx("late"))
    assert opp["dynamic_grade"] not in POSITIVE_GRADES
    assert opp["dynamic_grade"] == "blue"
    assert opp["_is_positive_opportunity"] is False
    assert opp["_excluded_late"] is True
    assert opp["status"] == "Monitor only"


def test_row_includes_model_version():
    opp = build_opportunity(_strong_zone(), _ctx("asia"))
    assert opp["model_version"] == "eurusd_support_reclaim_v1"


def test_row_includes_educational_and_research_fields():
    opp = build_opportunity(_strong_zone(), _ctx("london_midday"))
    for key in ("research_reaction_low", "research_reaction_high", "typical_minimum_r",
                "target_r_context", "stop_buffer_atr", "session_quality",
                "approach_quality", "current_session", "notes"):
        assert key in opp
    assert opp["notes"] == DISCLAIMER
    assert opp["target_r_context"] == 0.5
    assert opp["stop_buffer_atr"] == 0.3
    # positive grades carry a research reaction range
    assert opp["research_reaction_low"] is not None


def test_sharp_bearish_flagged_in_approach_quality():
    opp = build_opportunity(_strong_zone(), _ctx("asia", m15_return_12_atr=-2.0))
    assert opp["approach_quality"] == "Sharp bearish approach"


def test_active_reclaim_sets_flag_and_timestamp():
    reclaim = {"reclaimed": True, "active": True, "confirm_time": "2026-07-01T15:15:00+00:00"}
    opp = build_opportunity(_strong_zone(), _ctx("asia"), reclaim=reclaim)
    assert opp["close_reclaim"] is True
    assert opp["reclaim_confirmed_at"] == "2026-07-01T15:15:00+00:00"


def test_stale_reclaim_is_false_with_no_timestamp():
    # reclaimed long ago but not active -> false, and no leaked timestamp
    reclaim = {"reclaimed": True, "active": False, "confirm_time": "2026-06-26T03:00:00+00:00"}
    opp = build_opportunity(_strong_zone(), _ctx("asia"), reclaim=reclaim)
    assert opp["close_reclaim"] is False
    assert opp["reclaim_confirmed_at"] is None
