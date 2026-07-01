# coding: utf-8
"""
Dynamic Opportunity Score — locked Phase 36 model.

This reproduces the QuantConnect research branch scoring for the
"EURUSD Dynamic Support Reclaim Opportunity Score v1" model. Every numeric
weight and threshold is read from fixtures/locked_phase39_config.json via
config.py — nothing is hardcoded here.

IMPORTANT: this is the ORIGINAL Phase 36 dynamic score. The rejected Phase 38
anti-chase variants are intentionally NOT implemented (see research notes in
the locked config).

The golden fixture (fixtures/golden_backend_fixture.csv) is the regression
contract: for every row, score_features(...) must reproduce
`dynamic_opportunity_score` and assign_dynamic_grade(...) must reproduce
`dynamic_grade`.
"""

from dataclasses import dataclass
from typing import Optional

from . import config
from .static_strength import StaticStrength

# ── Grade identity ────────────────────────────────────────────────────────────
# Canonical keys match the frontend gradeConfig.ts / types.ts union.
GRADE_KEY_TO_DISPLAY = {
    "a_plus": "A+",
    "elite_green": "Elite Green",
    "green": "Green",
    "watch": "Watch",
    "blocked": "Blocked",
    "blue": "Blue",
}
DISPLAY_TO_GRADE_KEY = {v: k for k, v in GRADE_KEY_TO_DISPLAY.items()}

# status mapping (dashboard copy) — from the build spec.
STATUS_BY_GRADE_KEY = {
    "a_plus": "A+ review",
    "elite_green": "Elite review",
    "green": "Active review",
    "blue": "Monitor only",
    "watch": "Monitor only",
    "blocked": "Blocked",
}

# A score below this floor is never a positive opportunity.
BLOCKED_FLOOR = 2.00


def _as_bool(value) -> bool:
    """Parse a boolean from bool / int / 'True'/'False' / 'true'/'false'/'1'/'0'."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "1", "yes", "t"):
            return True
        if v in ("false", "0", "no", "f", ""):
            return False
    raise ValueError(f"Cannot interpret boolean from {value!r}")


@dataclass
class ScoreFeatures:
    """Inputs to the dynamic score. Mirrors the golden fixture columns."""
    static_strength: StaticStrength      # 'weak' | 'medium' | 'strong'  (fixture: `label`)
    session: str                         # 'asia' | 'london_open' | ...
    m15_return_12_atr: float
    h1_above_ema200: bool
    h1_ema200_slope_nonnegative: bool
    h4_above_ema200: bool
    h4_ema200_slope_nonnegative: bool
    m15_above_ema200: bool

    @classmethod
    def from_row(cls, row: dict) -> "ScoreFeatures":
        """Build from a fixture/DB row (str values allowed). Fails loudly if a
        required field is missing."""
        required = [
            "label", "session", "m15_return_12_atr",
            "h1_above_ema200", "h1_ema200_slope_nonnegative",
            "h4_above_ema200", "h4_ema200_slope_nonnegative",
            "m15_above_ema200",
        ]
        # accept either `label` or `static_strength` for the strength column
        label_key = "label" if "label" in row else ("static_strength" if "static_strength" in row else None)
        if label_key is None:
            raise KeyError("row is missing required strength column ('label' or 'static_strength')")
        for key in required[1:]:
            if key not in row:
                raise KeyError(f"row is missing required column: {key}")
        return cls(
            static_strength=str(row[label_key]).strip(),
            session=str(row["session"]).strip(),
            m15_return_12_atr=float(row["m15_return_12_atr"]),
            h1_above_ema200=_as_bool(row["h1_above_ema200"]),
            h1_ema200_slope_nonnegative=_as_bool(row["h1_ema200_slope_nonnegative"]),
            h4_above_ema200=_as_bool(row["h4_above_ema200"]),
            h4_ema200_slope_nonnegative=_as_bool(row["h4_ema200_slope_nonnegative"]),
            m15_above_ema200=_as_bool(row["m15_above_ema200"]),
        )


# ── Derived booleans (exact spec) ─────────────────────────────────────────────

def no_sharp_bearish_m15_12(m15_return_12_atr: float) -> bool:
    return m15_return_12_atr > -1.00


def balanced_m15_impulse_12(m15_return_12_atr: float) -> bool:
    return -1.00 <= m15_return_12_atr <= 2.00


def not_chasing_fast_rally_m15_12(m15_return_12_atr: float) -> bool:
    return m15_return_12_atr < 2.00


def h1_trend_basic(f: ScoreFeatures) -> bool:
    return f.h1_above_ema200 and f.h1_ema200_slope_nonnegative


def h4_trend_basic(f: ScoreFeatures) -> bool:
    return f.h4_above_ema200 and f.h4_ema200_slope_nonnegative


def m15_h1_above_ema200(f: ScoreFeatures) -> bool:
    return f.m15_above_ema200 and f.h1_above_ema200


def session_score(session: str) -> float:
    """Session component. Unknown sessions map to 'other' (0.0). 'late' is not a
    positive session — it scores 0 here and is excluded upstream by the
    opportunity builder (session_filter = exclude_late)."""
    smap = config.session_score_map()
    return float(smap.get(session, smap.get("other", 0.0)))


# ── Score ─────────────────────────────────────────────────────────────────────

def score_features(f: ScoreFeatures) -> float:
    """Compute dynamic_opportunity_score for one candle/zone context.

    dynamic_opportunity_score =
        static_zone_score
      + positive components
      + session_score
      + penalties
    """
    static_map = config.static_zone_score_map()
    if f.static_strength not in static_map:
        raise ValueError(
            f"Unknown static strength label {f.static_strength!r}; "
            f"expected one of {sorted(static_map)}"
        )

    m15 = f.m15_return_12_atr
    score = float(static_map[f.static_strength])

    # positive components
    if no_sharp_bearish_m15_12(m15):
        score += 1.00
    if balanced_m15_impulse_12(m15):
        score += 0.50
    if h1_trend_basic(f):
        score += 0.75
    if h4_trend_basic(f):
        score += 0.50
    if m15_h1_above_ema200(f):
        score += 0.25

    # session component
    score += session_score(f.session)

    # penalties
    if m15 <= -1.00:
        score -= 1.25
    if m15 >= 2.00:
        score -= 0.35
    if f.session == "london_open":
        score -= 0.35

    return score


def score_row(row: dict) -> float:
    return score_features(ScoreFeatures.from_row(row))


# ── Grade ─────────────────────────────────────────────────────────────────────

def assign_grade_key(score: Optional[float]) -> str:
    """Map a numeric score to a canonical grade key using locked thresholds.

    A+          : score >= a_plus
    elite_green : elite_green <= score < a_plus
    green       : green <= score < elite_green
    watch       : 2.00 <= score < green
    blocked     : score < 2.00 or missing/invalid
    """
    if score is None:
        return "blocked"
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "blocked"
    if s != s:  # NaN
        return "blocked"

    thr = config.score_thresholds()
    green = float(thr["green"])
    elite = float(thr["elite_green"])
    a_plus = float(thr["a_plus"])

    if s >= a_plus:
        return "a_plus"
    if s >= elite:
        return "elite_green"
    if s >= green:
        return "green"
    if s >= BLOCKED_FLOOR:
        return "watch"
    return "blocked"


def assign_dynamic_grade(score: Optional[float]) -> str:
    """Return the display grade label ('A+', 'Elite Green', 'Green', 'Watch',
    'Blocked') — this is what the golden fixture's `dynamic_grade` column uses."""
    return GRADE_KEY_TO_DISPLAY[assign_grade_key(score)]


def status_for_grade_key(grade_key: str) -> str:
    return STATUS_BY_GRADE_KEY.get(grade_key, "Blocked")
