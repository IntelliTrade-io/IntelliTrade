"""US curated-schedule fetchers (BEA, Census, DOL, EIA, UMich, ADP) — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta
from typing import List
from zoneinfo import ZoneInfo

import requests

try:
    from bs4 import BeautifulSoup
    import soupsieve as sv
except ImportError:
    BeautifulSoup = None
    sv = None

try:
    import feedparser
except ImportError:
    feedparser = None

try:
    from dateutil import parser as dateparser
except ImportError:
    dateparser = None

try:
    from lxml import html as lxml_html
except ImportError:
    lxml_html = None

from economic_calendar.bls_specs import (
    _last_business_day_local,
)
from economic_calendar.curated import (
    CURATED_ADP_OVERRIDES,
    CURATED_UMICH_OVERRIDES,
)
from economic_calendar.enrich import classify_event
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    _finalize_source_log,
)
from economic_calendar.timeutils import (
    MONTHS,
    NEW_YORK_TZ,
    UTC,
    _last_weekday_of_month,
    _month_year_iter,
    _nth_weekday_of_month,
    _shift_to_business_day,
    _within,
    ensure_aware,
)

logger = logging.getLogger("econ_calendar_complete")

def _iter_local_month_starts(start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> List[datetime]:
    local_start = start_utc.astimezone(tz)
    local_end = end_utc.astimezone(tz)
    return [datetime(year, month, 1) for year, month in _month_year_iter(local_start.year, local_start.month, local_end.year, local_end.month)]


def _shift_local_business_date(year: int, month: int, day: int, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    day = min(day, calendar.monthrange(year, month)[1])
    local_dt = datetime(year, month, day, hour, minute, tzinfo=tz)
    return _shift_to_business_day(local_dt, "forward")



def _curated_us_event(
    agency: str,
    source: str,
    title: str,
    local_dt: datetime,
    url: str,
    *,
    confidence: str = "tentative",
    series: str = "",
) -> Event:
    dt_utc = local_dt.astimezone(UTC)
    extras = {
        "release_time_local": local_dt.strftime("%H:%M"),
        "time_confidence": confidence,
        "discovered_via": "curated_official_schedule",
        "source_hint": "curated",
    }
    if series:
        extras["series"] = series
    return Event(
        id=make_id("US", agency, title, dt_utc),
        source=source,
        agency=agency,
        country="US",
        title=title,
        date_time_utc=dt_utc,
        event_local_tz="America/New_York",
        impact=classify_event(title),
        url=url,
        extras=extras,
    )



def fetch_bea_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "BEA"
    url = "https://www.bea.gov/news/schedule"
    events: List[Event] = []
    for cursor in _iter_local_month_starts(start_utc, end_utc, NEW_YORK_TZ):
        pce_dt = _last_business_day_local(cursor.year, cursor.month, 8, 30, NEW_YORK_TZ, weekday_cap=4)
        gdp_dt = _last_business_day_local(cursor.year, cursor.month, 8, 30, NEW_YORK_TZ, weekday_cap=3)
        for title, local_dt, series in (
            ("BEA Personal Income and Outlays (PCE Price Index, Core PCE)", pce_dt, "pce"),
            ("BEA Gross Domestic Product (GDP) and GDP Price Index", gdp_dt, "gdp"),
        ):
            if _within(local_dt.astimezone(UTC), start_utc, end_utc):
                events.append(_curated_us_event("BEA", "BEA_CURATED", title, local_dt, url, series=series))
    events.sort(key=lambda ev: ev.date_time_utc)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_census_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "CENSUS"
    url = "https://www.census.gov/economic-indicators/calendar-listview.html"
    specs = [
        ("Census Retail Sales", 15, "retail_sales"),
        ("Census Durable Goods Orders", 26, "durable_goods"),
        ("Census New Home Sales", 23, "new_home_sales"),
        ("Census Housing Starts and Building Permits", 18, "housing_starts"),
        ("Census Factory Orders", 4, "factory_orders"),
    ]
    events: List[Event] = []
    for cursor in _iter_local_month_starts(start_utc, end_utc, NEW_YORK_TZ):
        for title, day, series in specs:
            local_dt = _shift_local_business_date(cursor.year, cursor.month, day, 8, 30, NEW_YORK_TZ)
            if _within(local_dt.astimezone(UTC), start_utc, end_utc):
                events.append(_curated_us_event("CENSUS", "CENSUS_CURATED", title, local_dt, url, series=series))
    events.sort(key=lambda ev: ev.date_time_utc)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_dol_jobless_claims_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "DOL"
    url = "https://www.dol.gov/ui/data.pdf"
    events: List[Event] = []
    local_cursor = start_utc.astimezone(NEW_YORK_TZ).replace(hour=8, minute=30, second=0, microsecond=0) - timedelta(days=7)
    while local_cursor.weekday() != 3:
        local_cursor += timedelta(days=1)
    local_end = end_utc.astimezone(NEW_YORK_TZ) + timedelta(days=7)
    while local_cursor <= local_end:
        if _within(local_cursor.astimezone(UTC), start_utc, end_utc):
            events.append(
                _curated_us_event(
                    "DOL",
                    "DOL_CURATED",
                    "US Initial and Continuing Jobless Claims",
                    local_cursor,
                    url,
                    confidence="exact",
                    series="jobless_claims",
                )
            )
        local_cursor += timedelta(days=7)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_eia_petroleum_status_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "EIA"
    url = "https://www.eia.gov/petroleum/supply/weekly/schedule.php"
    events: List[Event] = []
    local_cursor = start_utc.astimezone(NEW_YORK_TZ).replace(hour=10, minute=30, second=0, microsecond=0) - timedelta(days=7)
    while local_cursor.weekday() != 2:
        local_cursor += timedelta(days=1)
    local_end = end_utc.astimezone(NEW_YORK_TZ) + timedelta(days=7)
    while local_cursor <= local_end:
        if _within(local_cursor.astimezone(UTC), start_utc, end_utc):
            events.append(
                _curated_us_event(
                    "EIA",
                    "EIA_CURATED",
                    "EIA Weekly Petroleum Status Report (Crude Oil, Gasoline, Distillate Inventories)",
                    local_cursor,
                    url,
                    confidence="exact",
                    series="oil_inventories",
                )
            )
        local_cursor += timedelta(days=7)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_umich_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """University of Michigan Consumer Sentiment releases via curated schedule rules."""

    tz = NEW_YORK_TZ

    buffer_start = (start_utc - timedelta(days=45)).astimezone(tz)

    buffer_end = (end_utc + timedelta(days=45)).astimezone(tz)

    events: List[Event] = []

    def _emit(year: int, month: int, day: int, release_type: str, hour: int, minute: int) -> None:

        try:

            local_dt = ensure_aware(datetime(year, month, day, hour, minute), tz, hour, minute)

        except ValueError:

            return

        dt_utc = local_dt.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            return

        month_name = MONTHS[month - 1]

        title = f"University of Michigan Consumer Sentiment ({release_type})"

        extras = {

            "release_type": release_type,

            "release_time_local": local_dt.strftime("%H:%M"),

            "time_confidence": "assumed",

            "discovered_via": "umich_curated_rule",

        }

        events.append(

            Event(

                id=make_id("US", "UMICH", title, dt_utc),

                source="UMICH",

                agency="University of Michigan",

                country="US",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/New_York",

                impact="High",

                url="https://data.sca.isr.umich.edu/",

                extras=extras,

            )

        )

    for year, month in _month_year_iter(buffer_start.year, buffer_start.month, buffer_end.year, buffer_end.month):

        prelim_day = _nth_weekday_of_month(year, month, weekday=4, occurrence=2)  # Friday=4

        if prelim_day is None:

            prelim_day = _nth_weekday_of_month(year, month, weekday=4, occurrence=1)

        final_day = _last_weekday_of_month(year, month, weekday=4)

        for release_type, day in (("Prelim", prelim_day), ("Final", final_day)):

            if not day:

                continue

            override = CURATED_UMICH_OVERRIDES.get((year, month, release_type.lower()))

            day_override = override.get("day") if override else None

            actual_day = int(day_override) if day_override else day

            hour = int(override.get("hour", 10)) if override else 10

            minute = int(override.get("minute", 0)) if override else 0

            _emit(year, month, actual_day, release_type, hour, minute)

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        _finalize_source_log("UMICH", "curated", len(events))

        return events

    zero_reason = "UMICH: curated schedule produced no releases within the requested window."

    _finalize_source_log("UMICH", "none", 0, zero_reason=zero_reason)

    return []

def fetch_adp_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """ADP National Employment Report releases using first-Wednesday schedule."""

    tz = NEW_YORK_TZ

    buffer_start = (start_utc - timedelta(days=45)).astimezone(tz)

    buffer_end = (end_utc + timedelta(days=45)).astimezone(tz)

    events: List[Event] = []

    for year, month in _month_year_iter(buffer_start.year, buffer_start.month, buffer_end.year, buffer_end.month):

        day = _nth_weekday_of_month(year, month, weekday=2, occurrence=1)  # Wednesday=2

        override = CURATED_ADP_OVERRIDES.get((year, month))

        if override:

            day = override.get("day", day)

        if not day:

            continue

        hour = int(override.get("hour", 8)) if override else 8

        minute = int(override.get("minute", 15)) if override else 15

        try:

            local_dt = ensure_aware(datetime(year, month, int(day), hour, minute), tz, hour, minute)

        except ValueError:

            continue

        dt_utc = local_dt.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            continue

        title = f"ADP National Employment Report ({MONTHS[month - 1]} {year})"

        extras = {

            "release_time_local": local_dt.strftime("%H:%M"),

            "time_confidence": "assumed",

            "discovered_via": "adp_curated_rule",

        }

        events.append(

            Event(

                id=make_id("US", "ADP", title, dt_utc),

                source="ADP",

                agency="ADP",

                country="US",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/New_York",

                impact="High",

                url="https://adpemploymentreport.com/",

                extras=extras,

            )

        )

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        _finalize_source_log("ADP", "curated", len(events))

        return events

    zero_reason = "ADP: curated first-Wednesday schedule produced no events in window."

    _finalize_source_log("ADP", "none", 0, zero_reason=zero_reason)

    return []


