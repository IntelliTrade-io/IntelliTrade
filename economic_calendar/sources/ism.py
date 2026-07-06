"""US ISM calendar fetcher — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import calendar
import csv
import json
import logging
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from urllib.parse import quote_plus, urljoin, urlparse
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

from economic_calendar import runstate as _ec_runstate
from economic_calendar.bls_specs import (
    BLS_API_V2_SINGLE_SERIES_URL,
    BLS_CANONICAL_SPECS,
    BLS_CURATED_OFFICIAL_DATE_OVERRIDES,
    BLS_RELEASE_BASE_URL,
    _bls_canonical_key_from_text,
    _last_business_day_local,
    _nth_business_day_local,
    _weekday_local,
)
from economic_calendar.curated import (
    CURATED_ADP_OVERRIDES,
    CURATED_UMICH_OVERRIDES,
    _ensure_time_confidence,
)
from economic_calendar.enrich import NBS_RELEASE_CALENDAR_INDEX_URL, classify_event
from economic_calendar.events import Event, _content_hash_bytes, _content_hash_text, _event_from_dict, make_id
from economic_calendar.health import (
    ENABLE_LKG,
    LKG_TTLS,
    ZERO_SNAPSHOT_MAX_CHARS,
    _finalize_source_log,
    _persist_lkg,
    _read_lkg_events,
    _schema_capture,
    _set_fetch_metadata,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.htmlparse import broad_li_filter, find_rows_by_header_keywords, rows_by_header_xpath
from economic_calendar.http import (
    DEFAULT_HEADERS,
    EnhancedCacheManager,
    RetryBudget,
    get_source_breaker,
    sget_retry_alt,
    sget_with_retry,
    source_sget,
)
from economic_calendar.ics import parse_ics_bytes, parse_ics_datetime
from economic_calendar.pmi import (
    NO_LKG_SOURCES,
    PMI_PROVIDER_DISPLAY,
    PROVIDER_SPGLOBAL_PMI,
    _estimate_pmi_releases_for_series,
    _get_pmi_config_hash,
    _get_pmi_overrides,
    _get_pmi_rules,
    _get_pmi_series_configs,
)
from economic_calendar.runstate import FEATURE, RUN_CONTEXT
from economic_calendar.textutils import _normalize_metadata_text
from economic_calendar.timeutils import (
    BEIJING_TZ,
    BERLIN_TZ,
    BRUSSELS_TZ,
    EUROSTAT_TZ,
    FRANKFURT_TZ,
    LONDON_TZ,
    MONTH_ABBR2NUM,
    MONTHS,
    NEW_YORK_TZ,
    OTTAWA_TZ,
    SYDNEY_TZ,
    TOKYO_TZ,
    TORONTO_TZ,
    UTC,
    WELLINGTON_TZ,
    ZURICH_TZ,
    _get_zoneinfo,
    _is_business_day,
    _iso,
    _last_weekday_of_month,
    _month_year_iter,
    _move_business_days,
    _now_utc,
    _nth_weekday_of_month,
    _parse_local_time,
    _shift_to_business_day,
    _within,
    ensure_aware,
    month_to_num,
)

logger = logging.getLogger("econ_calendar_complete")

def fetch_ism_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """ISM Manufacturing & Services PMI releases from the public calendar."""

    if not BeautifulSoup:

        _finalize_source_log("ISM", "unavailable", 0, zero_reason="BeautifulSoup unavailable; DOM skipped")

        return []

    source_key = "ISM"

    url = "https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/"

    cache_manager = getattr(session, "cache_manager", None)

    def _nth_business_day(year: int, month: int, ordinal: int) -> Optional[int]:
        counter = 0
        for day in range(1, calendar.monthrange(year, month)[1] + 1):
            if datetime(year, month, day).weekday() >= 5:
                continue
            counter += 1
            if counter == ordinal:
                return day
        return None

    def _build_rule_events() -> List[Event]:
        results: List[Event] = []
        local_start = (start_utc - timedelta(days=7)).astimezone(NEW_YORK_TZ)
        local_end = (end_utc + timedelta(days=7)).astimezone(NEW_YORK_TZ)
        cursor = datetime(local_start.year, local_start.month, 1)
        stop = datetime(local_end.year, local_end.month, 1)
        seen_rule_ids: Set[str] = set()
        while cursor <= stop:
            month_name = MONTHS[cursor.month - 1]
            for kind, ordinal, series in (
                ("Manufacturing", 1, "manufacturing_pmi"),
                ("Services", 3, "services_pmi"),
            ):
                day = _nth_business_day(cursor.year, cursor.month, ordinal)
                if not day:
                    continue
                local_dt = ensure_aware(datetime(cursor.year, cursor.month, day, 10, 0), NEW_YORK_TZ, 10, 0)
                dt_utc = local_dt.astimezone(UTC)
                if not _within(dt_utc, start_utc, end_utc):
                    continue
                title = f"ISM {kind} PMI ({month_name} {cursor.year})"
                eid = make_id("US", "ISM", title, dt_utc)
                if eid in seen_rule_ids:
                    continue
                seen_rule_ids.add(eid)
                results.append(
                    Event(
                        id=eid,
                        source="ISM_RULES",
                        agency="ISM",
                        country="US",
                        title=title,
                        date_time_utc=dt_utc,
                        event_local_tz="America/New_York",
                        impact="High",
                        url=url,
                        extras={
                            "release_time_local": local_dt.strftime("%H:%M"),
                            "time_confidence": "assumed",
                            "discovered_via": "ism_release_rules",
                            "series": series,
                        },
                    )
                )
            if cursor.month == 12:
                cursor = datetime(cursor.year + 1, 1, 1)
            else:
                cursor = datetime(cursor.year, cursor.month + 1, 1)
        results.sort(key=lambda ev: ev.date_time_utc)
        return results

    try:

        resp, _ = source_sget(session, source_key, url, timeout=25, path_hint="dom")

    except Exception as exc:

        logger.warning("ISM: calendar fetch failed (%s)", exc)

        resp = None

    if not (resp and getattr(resp, "ok", False)):

        rule_events = _build_rule_events()
        if rule_events:
            _finalize_source_log(source_key, "rules", len(rule_events))
            return rule_events
        zero_reason = "between_releases"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []

    try:

        soup = BeautifulSoup(resp.text or "", "html.parser")

    except Exception:

        logger.debug("ISM: failed to parse calendar HTML", exc_info=True)

        _finalize_source_log(source_key, "none", 0, zero_reason="ISM: DOM parse failed.")

        return []

    rows = soup.select("table tbody tr, table tr")

    events: List[Event] = []

    seen_ids: Set[str] = set()

    for row in rows:

        header = row.find("th")

        cells = row.find_all("td")

        if not header or len(cells) < 2:

            continue

        month_label = header.get_text(" ", strip=True)

        match = re.search(r"([A-Za-z]+)\s+(\d{4})", month_label or "")

        if not match:

            continue

        month_name = match.group(1)

        year = int(match.group(2))

        month_num = month_to_num(month_name)

        if not month_num:

            continue

        manuf_text = cells[0].get_text(" ", strip=True)

        serv_text = cells[1].get_text(" ", strip=True)

        def _emit(kind: str, text_value: str) -> None:

            if not text_value:

                return

            day_match = re.search(r"(\d{1,2})", text_value)

            if not day_match:

                return

            day = int(day_match.group(1))

            try:

                local_dt = ensure_aware(datetime(year, month_num, day, 10, 0), NEW_YORK_TZ, 10, 0)

            except ValueError:

                return

            dt_utc = local_dt.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                return

            title = f"ISM {kind} PMI ({month_name} {year})"

            eid = make_id("US", "ISM", title, dt_utc)

            if eid in seen_ids:

                return

            seen_ids.add(eid)

            extras = {

                "release_time_local": local_dt.strftime("%H:%M"),

                "time_confidence": "assumed",

                "discovered_via": "ism_release_calendar",

                "series": f"{kind.lower()}_pmi",

            }

            events.append(

                Event(

                    id=eid,

                    source="ISM",

                    agency="ISM",

                    country="US",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="America/New_York",

                    impact="High",

                    url=url,

                    extras=extras,

                )

            )

        _emit("Manufacturing", manuf_text)

        _emit("Services", serv_text)

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        if cache_manager:

            try:

                _persist_lkg(source_key, events)

            except Exception:

                logger.debug("ISM: LKG persist failed", exc_info=True)

        _finalize_source_log(source_key, "dom", len(events))

        return events

    rule_events = _build_rule_events()
    if rule_events:
        if cache_manager:
            try:
                _persist_lkg(source_key, rule_events)
            except Exception:
                logger.debug("ISM: LKG persist failed for rules path", exc_info=True)
        _finalize_source_log(source_key, "rules", len(rule_events))
        return rule_events

    merged = maybe_merge_lkg(source_key, [], ttl_days=120, tag="lkg")

    if merged:

        for ev in merged:

            extras = dict(ev.extras or {})

            extras.update({"cached": True, "discovered_via": "lkg"})

            ev.extras = extras

        logger.info("ISM LKG_MERGE: %d", len(merged))

        _finalize_source_log(source_key, "lkg", len(merged))

        return merged

    zero_reason = "between_releases"

    _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)

    if _ec_runstate.DEBUG_ZERO_FLAG:

        write_zero_snapshot(source_key, resp.text or "no HTTP body", label="none")

    return []


