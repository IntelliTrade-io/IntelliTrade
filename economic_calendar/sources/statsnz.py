"""Stats NZ calendar fetcher — moved verbatim from the monolith (plan 6.3).

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

def fetch_stats_nz_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch Stats NZ events with normalized output."""

    urls = [

        "https://www.stats.govt.nz/release-calendar/calendar-export",

        "https://www.stats.govt.nz/assets/Uploads/release-calendar.ics"

    ]

    events: List[Event] = []

    ics_total = 0

    attempted = False

    path_used = "ics"

    for url in urls:

        try:

            resp, _ = source_sget(session, "STATSNZ", url, timeout=25, path_hint="ics")

        except Exception as exc:

            logger.warning(f"Stats NZ fetch failed for {url}: {exc}")

            continue

        if not (resp and resp.ok):

            continue

        attempted = True

        items = parse_ics_bytes(resp.content, WELLINGTON_TZ, default_hour=10, default_min=45)

        ics_total = len(items)

        candidate: List[Event] = []

        for item in items:

            dt_utc = item["dt"].astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            title = re.sub(r"\s+", " ", item["title"]).strip()

            candidate.append(Event(

                id=make_id("NZ", "STATSNZ", title, dt_utc),

                source="StatsNZ",

                agency="STATSNZ",

                country="NZ",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Pacific/Auckland",

                impact=classify_event(title),

                url=item["url"] or url,

                extras={"release_time_local": "10:45"}

            ))

        logger.info(f"Stats NZ ICS: total={ics_total}, in-window={len(candidate)}")

        if candidate:

            events = candidate

            break

    if not attempted:

        logger.info("Stats NZ ICS: total=0, in-window=0")

        path_used = "ics"

    _set_fetch_metadata("STATSNZ", count=len(events), path=path_used, ics_total=ics_total if attempted else 0)

    return events

# Legacy NBS parser retained for reference; superseded by the release-calendar implementation below.
