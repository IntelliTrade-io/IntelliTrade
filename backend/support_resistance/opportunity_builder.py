# coding: utf-8
"""
Opportunity builder.

Combines a detected static support zone with the CURRENT market context
(session, M15 impulse, multi-timeframe trend) to produce an sr_opportunities
row: score, grade, status, and the educational / research-reaction fields the
dashboard displays.

Locked policy enforced here:
  * session_filter = exclude_late  -> a `late` session never produces a positive
    (green / elite_green / a_plus) opportunity. Such zones are emitted as
    informational ("blue" / Monitor only) instead. See tests.
  * every emitted row carries model_version and the research/educational fields.

Language rules (see README): research reaction range, historical validation
sample, opportunity grade, context quality, short-term first reaction. No
signal / prediction / advice language.
"""

from dataclasses import dataclass
from typing import Optional

from . import config
from .dynamic_score import (
    ScoreFeatures, score_features, assign_grade_key, GRADE_KEY_TO_DISPLAY,
    status_for_grade_key, h1_trend_basic, h4_trend_basic,
    no_sharp_bearish_m15_12, not_chasing_fast_rally_m15_12,
)
from .zone_detector import SupportZone

DISCLAIMER = (
    "Research-backed ranges are based on historical testing and are for "
    "educational decision support only. They are not trading signals, financial "
    "advice, or guarantees of future results."
)

# Research reaction ranges for dashboard display, keyed by grade.
# (percent low, percent high, typical_minimum_r label)
RESEARCH_REACTION = {
    "a_plus":      {"low": 78.0, "high": 81.0, "typical_minimum_r": "1.00R+ potential"},
    "elite_green": {"low": 70.0, "high": 78.0, "typical_minimum_r": "0.50R to 1.00R"},
    "green":       {"low": 60.0, "high": 70.0, "typical_minimum_r": "around 0.50R"},
    "blue":        {"low": 40.0, "high": 55.0, "typical_minimum_r": "0.25R to 0.50R"},
    # watch / blocked are not research-qualified opportunities -> no range
    "watch":       {"low": None, "high": None, "typical_minimum_r": None},
    "blocked":     {"low": None, "high": None, "typical_minimum_r": None},
}

POSITIVE_GRADES = ("green", "elite_green", "a_plus")

SESSION_QUALITY = {
    "asia": "Asia — prime session",
    "london_midday": "London midday — strong session",
    "ny_open": "NY open — supportive session",
    "london_open": "London open — penalised session",
    "late": "Late session — excluded from Alpha",
    "other": "Off-session",
}


@dataclass
class MarketContext:
    """Current global market state at evaluation time (one candle)."""
    session: str
    m15_return_12_atr: float
    h1_above_ema200: bool
    h1_ema200_slope_nonnegative: bool
    h4_above_ema200: bool
    h4_ema200_slope_nonnegative: bool
    m15_above_ema200: bool
    calculated_at: str  # ISO timestamp of the evaluated candle


def _approach_quality(ctx: MarketContext) -> str:
    m15 = ctx.m15_return_12_atr
    if not no_sharp_bearish_m15_12(m15):
        return "Sharp bearish approach"
    if not not_chasing_fast_rally_m15_12(m15):
        return "Fast rally (chasing risk)"
    return "Balanced approach"


def build_opportunity(zone: SupportZone, ctx: MarketContext,
                      symbol: str = None, timeframe: str = "M15",
                      model_version: str = None, reclaim: dict = None) -> dict:
    """Build an sr_opportunities row dict for one zone in the current context.

    zone_id is left unset here — supabase_writer fills it after the parent zone
    is upserted. `reclaim` is the dict from zone_detector.close_reclaim_state.
    """
    symbol = symbol or config.symbol()
    model_version = model_version or config.MODEL_VERSION

    features = ScoreFeatures(
        static_strength=zone.static_strength,
        session=ctx.session,
        m15_return_12_atr=ctx.m15_return_12_atr,
        h1_above_ema200=ctx.h1_above_ema200,
        h1_ema200_slope_nonnegative=ctx.h1_ema200_slope_nonnegative,
        h4_above_ema200=ctx.h4_above_ema200,
        h4_ema200_slope_nonnegative=ctx.h4_ema200_slope_nonnegative,
        m15_above_ema200=ctx.m15_above_ema200,
    )
    score = score_features(features)
    grade_key = assign_grade_key(score)

    # Locked policy: exclude_late. A late session can never be a positive
    # opportunity — demote to informational "blue" / Monitor only.
    excluded_late = ctx.session == "late"
    if excluded_late and grade_key in POSITIVE_GRADES:
        grade_key = "blue"

    reaction = RESEARCH_REACTION.get(grade_key, RESEARCH_REACTION["blocked"])
    is_positive = grade_key in POSITIVE_GRADES

    reclaim = reclaim or {}
    close_reclaim = bool(reclaim.get("reclaimed") and reclaim.get("active"))
    confirm_time = reclaim.get("confirm_time")
    reclaim_confirmed_at = (
        confirm_time.isoformat() if hasattr(confirm_time, "isoformat")
        else (confirm_time if confirm_time else None)
    )

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "zone_side": zone.zone_side,
        "static_strength": zone.static_strength,
        "dynamic_grade": grade_key,                      # canonical key (frontend gradeConfig)
        "dynamic_grade_display": GRADE_KEY_TO_DISPLAY[grade_key],
        "status": status_for_grade_key(grade_key),
        "score": round(float(score), 6),
        "research_reaction_low": reaction["low"],
        "research_reaction_high": reaction["high"],
        "typical_minimum_r": reaction["typical_minimum_r"],
        "target_r_context": config.target_r(),
        "stop_buffer_atr": config.stop_buffer_atr(),
        "session_quality": SESSION_QUALITY.get(ctx.session, SESSION_QUALITY["other"]),
        "approach_quality": _approach_quality(ctx),
        "current_session": ctx.session,
        "m15_return_12_atr": round(float(ctx.m15_return_12_atr), 6),
        "h1_trend_basic": bool(h1_trend_basic(features)),
        "h4_trend_basic": bool(h4_trend_basic(features)),
        "close_reclaim": close_reclaim,
        "reclaim_confirmed_at": reclaim_confirmed_at,
        "notes": DISCLAIMER,
        "model_version": model_version,
        "calculated_at": ctx.calculated_at,
        # internal flags (not DB columns) — help the runner / tests
        "_is_positive_opportunity": is_positive,
        "_excluded_late": excluded_late,
        "_zone_created_time": zone.zone_created_time.isoformat()
        if hasattr(zone.zone_created_time, "isoformat") else str(zone.zone_created_time),
    }
