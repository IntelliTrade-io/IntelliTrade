"""BLS canonical release specs: titles, scores, schedule rules, curated overrides.

Used by metadata enrichment (canonical titles/impact for BLS events) and by the
BLS source fetchers (schedule estimation and reconciliation).
Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo

from economic_calendar.textutils import _normalize_metadata_text, _regex_has_any
from economic_calendar.timeutils import (
    NEW_YORK_TZ,
    _nth_weekday_of_month,
    _shift_to_business_day,
    ensure_aware,
)


def _last_business_day_local(year: int, month: int, hour: int, minute: int, tz: ZoneInfo, weekday_cap: Optional[int] = None) -> datetime:
    day = calendar.monthrange(year, month)[1]
    local_dt = datetime(year, month, day, hour, minute, tzinfo=tz)
    if weekday_cap is not None:
        while local_dt.weekday() != weekday_cap:
            local_dt -= timedelta(days=1)
    return _shift_to_business_day(local_dt, "backward")


def _nth_business_day_local(year: int, month: int, occurrence: int, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    current = datetime(year, month, 1, hour, minute)
    seen = 0
    while current.month == month:
        if current.weekday() < 5:
            seen += 1
            if seen == occurrence:
                return ensure_aware(current, tz, hour, minute)
        current += timedelta(days=1)
    return ensure_aware(datetime(year, month, calendar.monthrange(year, month)[1], hour, minute), tz, hour, minute)


def _weekday_local(year: int, month: int, weekday: int, occurrence: int, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    day = _nth_weekday_of_month(year, month, weekday, occurrence)
    if day is None:
        day = 1
    return ensure_aware(datetime(year, month, day, hour, minute), tz, hour, minute)


BLS_RELEASE_BASE_URL = "https://www.bls.gov/schedule/news_release"
BLS_API_V2_SINGLE_SERIES_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/{series_id}"

BLS_CANONICAL_SPECS: Dict[str, Dict[str, Any]] = {
    "BLS_EMPLOYMENT_SITUATION": {
        "title": "US Employment Situation / Nonfarm Payrolls",
        "url": f"{BLS_RELEASE_BASE_URL}/empsit.htm",
        "patterns": (
            r"\bemployment situation\b",
            r"\bnonfarm\b",
            r"\bpayrolls?\b",
            r"\bunemployment rate\b",
            r"\baverage hourly earnings\b",
        ),
        "category": "labor",
        "impact": "High",
        "score": 90,
        "series": "employment_situation",
        "api_series_id": "CES0000000001",
        "rule": lambda year, month: _weekday_local(year, month, 4, 1, 8, 30, NEW_YORK_TZ),
    },
    "BLS_CPI": {
        "title": "US Consumer Price Index (CPI)",
        "url": f"{BLS_RELEASE_BASE_URL}/cpi.htm",
        "patterns": (r"\bconsumer price index\b", r"\bcpi\b"),
        "category": "inflation",
        "impact": "High",
        "score": 90,
        "series": "cpi",
        "api_series_id": "CUSR0000SA0",
        "rule": lambda year, month: _nth_business_day_local(year, month, 8, 8, 30, NEW_YORK_TZ),
    },
    "BLS_PPI": {
        "title": "US Producer Price Index (PPI)",
        "url": f"{BLS_RELEASE_BASE_URL}/ppi.htm",
        "patterns": (r"\bproducer price index\b", r"\bppi\b"),
        "category": "inflation",
        "impact": "High",
        "score": 85,
        "series": "ppi",
        "api_series_id": "WPUFD4",
        "rule": lambda year, month: _nth_business_day_local(year, month, 9, 8, 30, NEW_YORK_TZ),
    },
    "BLS_JOLTS": {
        "title": "US JOLTS Job Openings",
        "url": f"{BLS_RELEASE_BASE_URL}/jolts.htm",
        "patterns": (r"\bjob openings and labor turnover\b", r"\bjolts\b", r"\bjob openings\b"),
        "category": "labor",
        "impact": "High",
        "score": 80,
        "series": "jolts",
        "api_series_id": "JTS000000000000000JOL",
        "rule": lambda year, month: _weekday_local(year, month, 1, 1, 10, 0, NEW_YORK_TZ),
    },
    "BLS_IMPORT_EXPORT_PRICES": {
        "title": "US Import/Export Price Indexes",
        "url": f"{BLS_RELEASE_BASE_URL}/ximpim.htm",
        "patterns": (r"\bimport and export price\b", r"\bimport/export price\b", r"\bu\.s\. import and export price\b"),
        "category": "inflation",
        "impact": "Medium",
        "score": 75,
        "series": "import_export_prices",
        "api_series_id": "EIUIR",
        "rule": lambda year, month: _nth_business_day_local(year, month, 12, 8, 30, NEW_YORK_TZ),
    },
    "BLS_ECI": {
        "title": "US Employment Cost Index",
        "url": f"{BLS_RELEASE_BASE_URL}/eci.htm",
        "patterns": (r"\bemployment cost index\b", r"\beci\b"),
        "category": "labor",
        "impact": "Medium",
        "score": 75,
        "series": "employment_cost_index",
        "api_series_id": "CIU1010000000000A",
        "rule": lambda year, month: _last_business_day_local(year, month, 8, 30, NEW_YORK_TZ) if month in {1, 4, 7, 10} else None,
    },
    "BLS_PRODUCTIVITY_COSTS": {
        "title": "US Productivity and Costs",
        "url": f"{BLS_RELEASE_BASE_URL}/prod2.htm",
        "patterns": (r"\bproductivity and costs\b", r"\bproductivity\b"),
        "category": "growth",
        "impact": "Medium",
        "score": 70,
        "series": "productivity_costs",
        "api_series_id": "PRS85006092",
        "rule": lambda year, month: _nth_business_day_local(year, month, 4, 8, 30, NEW_YORK_TZ) if month in {2, 5, 8, 11} else None,
    },
    "BLS_REAL_EARNINGS": {
        "title": "US Real Earnings",
        "url": f"{BLS_RELEASE_BASE_URL}/realer.htm",
        "patterns": (r"\breal earnings\b",),
        "category": "labor",
        "impact": "Medium",
        "score": 70,
        "series": "real_earnings",
        "api_series_id": "CES0500000011",
        "rule": lambda year, month: _nth_business_day_local(year, month, 8, 8, 30, NEW_YORK_TZ),
    },
}

# Reviewed against the official BLS ICS feed on 2026-05-31. These replace
# estimator dates only for the listed months; later months keep rule fallback.
BLS_CURATED_OFFICIAL_DATE_OVERRIDES: Dict[str, Tuple[str, ...]] = {
    "BLS_EMPLOYMENT_SITUATION": (
        "2026-06-05T12:30:00+00:00",
        "2026-07-02T12:30:00+00:00",
        "2026-08-07T12:30:00+00:00",
    ),
    "BLS_CPI": (
        "2026-06-10T12:30:00+00:00",
        "2026-07-14T12:30:00+00:00",
        "2026-08-12T12:30:00+00:00",
    ),
    "BLS_PPI": (
        "2026-06-11T12:30:00+00:00",
        "2026-07-15T12:30:00+00:00",
        "2026-08-13T12:30:00+00:00",
    ),
    "BLS_JOLTS": (
        "2026-06-02T14:00:00+00:00",
        "2026-06-30T14:00:00+00:00",
        "2026-07-22T14:00:00+00:00",
        "2026-08-04T14:00:00+00:00",
    ),
    "BLS_IMPORT_EXPORT_PRICES": (
        "2026-06-16T12:30:00+00:00",
        "2026-07-17T12:30:00+00:00",
        "2026-08-18T12:30:00+00:00",
    ),
    "BLS_ECI": ("2026-07-31T12:30:00+00:00",),
    "BLS_PRODUCTIVITY_COSTS": (
        "2026-06-04T12:30:00+00:00",
        "2026-08-06T12:30:00+00:00",
    ),
    "BLS_REAL_EARNINGS": (
        "2026-06-10T12:30:00+00:00",
        "2026-07-14T12:30:00+00:00",
        "2026-08-12T12:30:00+00:00",
    ),
}


def _bls_canonical_key_from_text(text: str) -> Optional[str]:
    normalized = _normalize_metadata_text(text).lower()
    if not normalized:
        return None
    for key, spec in BLS_CANONICAL_SPECS.items():
        if _regex_has_any(normalized, tuple(spec.get("patterns") or ())):
            return key
    return None
