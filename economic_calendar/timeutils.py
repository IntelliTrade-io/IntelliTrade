"""Time, timezone, and calendar-date helpers shared by all scraper sources.

Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from zoneinfo import ZoneInfo

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]

MONTH_ABBR2NUM = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


def month_to_num(name: str) -> int | None:
    if not name:
        return None
    n = name.strip().lower()
    # exact full name
    for i, m in enumerate(MONTHS, 1):
        if n == m.lower():
            return i
    # startswith on full names
    for i, m in enumerate(MONTHS, 1):
        if m.lower().startswith(n[:3]):
            return i
    # abbr map
    return MONTH_ABBR2NUM.get(n)


# ---------------------------------------------------------------------------
# Timezone definitions

UTC = ZoneInfo("UTC")
LONDON_TZ = ZoneInfo("Europe/London")
NEW_YORK_TZ = ZoneInfo("America/New_York")
BRUSSELS_TZ = ZoneInfo("Europe/Brussels")
EUROSTAT_TZ = ZoneInfo("Europe/Luxembourg")
FRANKFURT_TZ = ZoneInfo("Europe/Berlin")
BERLIN_TZ = ZoneInfo("Europe/Berlin")
SYDNEY_TZ = ZoneInfo("Australia/Sydney")
WELLINGTON_TZ = ZoneInfo("Pacific/Auckland")
OTTAWA_TZ = ZoneInfo("America/Toronto")
TORONTO_TZ = ZoneInfo("America/Toronto")
TOKYO_TZ = ZoneInfo("Asia/Tokyo")
BEIJING_TZ = ZoneInfo("Asia/Shanghai")
ZURICH_TZ = ZoneInfo("Europe/Zurich")

TZ_NAME_LOOKUP = {
    "America/New_York": NEW_YORK_TZ,
    "Europe/London": LONDON_TZ,
    "Europe/Zurich": ZURICH_TZ,
    "Asia/Tokyo": TOKYO_TZ,
}

_TZ_CACHE: Dict[str, ZoneInfo] = {}


def _get_zoneinfo(name: str) -> ZoneInfo:
    tz = TZ_NAME_LOOKUP.get(name)
    if tz:
        return tz
    cached = _TZ_CACHE.get(name)
    if cached:
        return cached
    tz = ZoneInfo(name)
    _TZ_CACHE[name] = tz
    return tz


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


def _parse_local_time(spec: Optional[str], default: Tuple[int, int] = (9, 0)) -> Tuple[int, int, bool]:
    if not spec:
        return default[0], default[1], False
    piece = spec.strip()
    if not piece:
        return default[0], default[1], False
    try:
        parts = piece.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return hour, minute, True
    except Exception:
        return default[0], default[1], False


def ensure_aware(dt: datetime, default_tz: ZoneInfo, default_hour: int = 10, default_min: int = 0) -> datetime:
    """Ensure datetime is timezone-aware with proper defaults."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # If time is 00:00, apply default hour/minute
        if dt.hour == 0 and dt.minute == 0:
            dt = dt.replace(hour=default_hour, minute=default_min)
        dt = dt.replace(tzinfo=default_tz)
    return dt


def _month_year_iter(start_year: int, start_month: int, end_year: int, end_month: int):
    """Yield (year, month) pairs from start through end inclusive."""
    year = start_year
    month = start_month
    while (year < end_year) or (year == end_year and month <= end_month):
        yield year, month
        month += 1
        if month > 12:
            month = 1
            year += 1


def _nth_weekday_of_month(year: int, month: int, weekday: int, occurrence: int) -> Optional[int]:
    """Return the day for the nth weekday (0=Monday) in a month, or None."""
    if occurrence <= 0:
        return None
    first_weekday = datetime(year, month, 1).weekday()
    offset = (weekday - first_weekday) % 7
    day = 1 + offset + (occurrence - 1) * 7
    days_in_month = calendar.monthrange(year, month)[1]
    if day > days_in_month:
        return None
    return day


def _last_weekday_of_month(year: int, month: int, weekday: int) -> int:
    """Return the calendar day for the last given weekday (0=Monday) in a month."""
    days_in_month = calendar.monthrange(year, month)[1]
    last_weekday = datetime(year, month, days_in_month).weekday()
    offset = (last_weekday - weekday) % 7
    return days_in_month - offset


def _is_business_day(dt: datetime) -> bool:
    return dt.weekday() < 5


def _shift_to_business_day(dt: datetime, direction: str) -> datetime:
    step = -1 if direction == "backward" else 1
    current = dt
    while not _is_business_day(current):
        current += timedelta(days=step)
    return current


def _move_business_days(dt: datetime, steps: int, direction: str) -> datetime:
    if steps <= 0:
        return dt
    step = -1 if direction == "backward" else 1
    current = dt
    remaining = steps
    while remaining > 0:
        current += timedelta(days=step)
        if _is_business_day(current):
            remaining -= 1
    return current


def _within(dt_utc: datetime, start_utc: datetime, end_utc: datetime) -> bool:
    """Check if datetime is within range."""
    return start_utc <= dt_utc <= end_utc
