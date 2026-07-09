"""Curated fallback data and zero-event policy shared across sources.

Curated meeting dates, fallback freshness bookkeeping, benign-zero-reason
classification, and grace-window definitions.
Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

import re
from collections import namedtuple
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from zoneinfo import ZoneInfo

from economic_calendar.pmi import PROVIDER_SPGLOBAL_PMI
from economic_calendar.timeutils import (
    FRANKFURT_TZ,
    LONDON_TZ,
    NEW_YORK_TZ,
    SYDNEY_TZ,
    TOKYO_TZ,
    TZ_NAME_LOOKUP,
    UTC,
    _now_utc,
    ensure_aware,
)

CuratedMeeting = namedtuple("CuratedMeeting", "year month day bank extras", defaults=({},))

# Dec 10, 2025 FOMC Day-2 canonical; keep list short and prune once past window.
CURATED_FED_DATES: List[CuratedMeeting] = [
    CuratedMeeting(
        2025,
        12,
        10,
        "FED",
        {"sep": True, "announcement_local": "14:00 America/New_York"},
    )
]

# Optional BoE curated safety net (empty by default; add entries as needed)
CURATED_BOE_DATES: List[CuratedMeeting] = []
CURATED_BOJ_DATES: List[CuratedMeeting] = []
CURATED_UMICH_OVERRIDES: Dict[tuple[int, int, str], Dict[str, Any]] = {}
CURATED_ADP_OVERRIDES: Dict[tuple[int, int], Dict[str, Any]] = {}

CURATED_FALLBACK_REVIEWED_AT: Dict[str, str] = {
    "BLS": "2026-05-31",
    "DOL": "2026-05-26",
    "EIA": "2026-05-26",
    "FED": "2026-05-26",
    "ECB": "2026-05-26",
    "BOE": "2026-05-26",
    "BOC": "2026-05-26",
    "BOJ": "2026-05-26",
    "RBA": "2026-05-26",
    "RBNZ": "2026-05-26",
    "SNB": "2026-05-26",
}

CURATED_FALLBACK_MAX_AGE_DAYS: Dict[str, int] = {
    "BLS": 14,
    "DOL": 14,
    "EIA": 14,
    "FED": 60,
    "ECB": 60,
    "BOE": 60,
    "BOC": 60,
    "BOJ": 60,
    "RBA": 60,
    "RBNZ": 60,
    "SNB": 60,
}

# Central banks required for strict-zero gate
# Fatal if these are missing (true breakages must fail CI)
STRICT_ZERO_SOURCES = {"FED", "ECB"}

# Non-fatal but must be watched; warn if zero for non-benign reasons
WARN_REQUIRED_SOURCES = {"BOE", "BOJ", PROVIDER_SPGLOBAL_PMI}
WARN_REQUIRED_ZERO_ALLOW = {
    "BOE": {"between_meetings"},
    "BOJ": {"between_meetings"},
    PROVIDER_SPGLOBAL_PMI: {"between_releases"},
}

BENIGN_ZERO_REASONS = {
    "between_meetings",
    "between_meeting",
    "between_releases",
    "between_decisions",
    "outside_window",
}

LEGACY_BENIGN_ZERO_REASON_PATTERNS: Dict[str, Set[str]] = {
    "ADP": {"curated first-wednesday schedule produced no events in window"},
    "BOC": {"no schedule entries parsed for the requested window"},
    "ECB": {"governing council schedule returned no meetings for requested window"},
    "UMICH": {"curated schedule produced no releases within the requested window"},
}


def _normalize_zero_reason(reason: Optional[str]) -> str:
    return re.sub(r"\s+", " ", str(reason or "")).strip().lower()


def _is_benign_zero_reason(
    reason: Optional[str],
    *,
    allow_blank: bool = False,
    source_key: Optional[str] = None,
) -> bool:
    normalized = _normalize_zero_reason(reason)
    if not normalized:
        return allow_blank
    if normalized in BENIGN_ZERO_REASONS:
        return True
    if source_key:
        for pattern in LEGACY_BENIGN_ZERO_REASON_PATTERNS.get(source_key.upper(), set()):
            if pattern in normalized:
                return True
    return False


def _is_benign_zero_case(
    source_key: str,
    path_used: Optional[str],
    count: Any,
    zero_reason: Optional[str],
) -> bool:
    try:
        normalized_count = int(count or 0)
    except Exception:
        normalized_count = 0
    if normalized_count != 0:
        return False
    if _is_benign_zero_reason(zero_reason, source_key=source_key):
        return True
    normalized_reason = _normalize_zero_reason(zero_reason)
    normalized_path = str(path_used or "").strip().lower()
    return not normalized_reason and normalized_path in {"curated", "estimator", "rules"}


def _curated_fallback_source_key(source_key: object) -> str:
    normalized = str(source_key or "").strip().upper()
    return "STATCAN" if normalized == "STATSCAN" else normalized


def _curated_fallback_info(source_key: object, as_of_utc: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    source = _curated_fallback_source_key(source_key)
    reviewed_at = CURATED_FALLBACK_REVIEWED_AT.get(source)
    max_age_days = CURATED_FALLBACK_MAX_AGE_DAYS.get(source)
    if not reviewed_at or max_age_days is None:
        return None
    try:
        reviewed_date = datetime.strptime(reviewed_at, "%Y-%m-%d").date()
    except Exception:
        return {
            "reviewed_at": reviewed_at,
            "max_age_days": max_age_days,
            "age_days": 999999,
            "fresh": False,
        }
    current = as_of_utc or _now_utc()
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    age_days = max(0, (current.astimezone(UTC).date() - reviewed_date).days)
    return {
        "reviewed_at": reviewed_at,
        "max_age_days": int(max_age_days),
        "age_days": int(age_days),
        "fresh": age_days <= int(max_age_days),
    }


@dataclass(frozen=True)
class GraceWindowConfig:
    tz: ZoneInfo
    hour: int
    minute: int
    label: str


GRACE_WINDOW_SOURCES: Dict[str, GraceWindowConfig] = {
    "BLS": GraceWindowConfig(NEW_YORK_TZ, 8, 30, "BLS CPI/PPI/Payroll"),
    "FED": GraceWindowConfig(NEW_YORK_TZ, 14, 0, "FOMC statement"),
    "ECB": GraceWindowConfig(FRANKFURT_TZ, 13, 45, "ECB Day-2 press"),
    "BOE": GraceWindowConfig(LONDON_TZ, 12, 0, "BoE MPC noon"),
    "BOJ": GraceWindowConfig(TOKYO_TZ, 12, 0, "BoJ policy statement"),
    "RBA": GraceWindowConfig(SYDNEY_TZ, 14, 30, "RBA cash rate"),
}


def _resolve_curated_local_dt(
    meeting: CuratedMeeting,
    *,
    default_tz: ZoneInfo,
    default_hour: int,
    default_minute: int,
) -> tuple[datetime, Dict[str, Any]]:
    extras = dict(meeting.extras or {})
    tz = default_tz
    hour = default_hour
    minute = default_minute
    spec = extras.get("announcement_local")
    if isinstance(spec, str):
        parts = spec.split()
        if parts:
            time_part = parts[0]
            if ":" in time_part:
                try:
                    hour, minute = [int(piece) for piece in time_part.split(":", 1)]
                except Exception:
                    hour, minute = default_hour, default_minute
            if len(parts) >= 2:
                tz_name = parts[1]
                tz = TZ_NAME_LOOKUP.get(tz_name, default_tz)
    local_dt = ensure_aware(datetime(meeting.year, meeting.month, meeting.day, hour, minute), tz, hour, minute)
    return local_dt, extras


def _ensure_time_confidence(curated_event: dict) -> dict:
    extras = curated_event.setdefault("extras", {})
    extras.setdefault("time_confidence", "assumed")
    return curated_event
