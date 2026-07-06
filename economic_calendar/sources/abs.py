"""Australia ABS calendar fetcher — moved verbatim from the monolith (plan 6.3).

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

def fetch_abs_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch ABS events with strengthened parsing and normalized output."""

    calendar_root = "https://www.abs.gov.au/release-calendar/future-releases-calendar"
    local_start = start_utc.astimezone(SYDNEY_TZ)
    local_end = end_utc.astimezone(SYDNEY_TZ)
    month_urls = [
        f"{calendar_root}/{year}{month:02d}"
        for year, month in _month_year_iter(local_start.year, local_start.month, local_end.year, local_end.month)
    ] or [calendar_root]

    events: List[Event] = []
    seen_ids: Set[str] = set()
    seen_urls: Set[str] = set()

    for url in month_urls:
        if url in seen_urls:
            continue
        seen_urls.add(url)

        try:

            resp, _ = source_sget(
                session,
                "ABS",
                url,
                timeout=25,
                headers={"Accept-Language": "en-AU,en;q=0.9"},
            )

            if not resp.ok:

                logger.warning(f"ABS: {url} -> {resp.status_code}")

                continue

            if not BeautifulSoup:

                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            try:

                blocks = soup.select("div.view-item")

                if not blocks:

                    blocks = soup.select("div.calendar.monthview div.contents.exportable-element")

            except Exception:

                blocks = []

            for node in blocks:

                try:

                    container = node.select_one("div.contents.exportable-element") or node

                    if not container:

                        continue

                    tm = container.select_one("time[datetime], time.datetime, time")

                    dt = None

                    if tm:

                        raw = tm.get("datetime") or tm.get_text(" ", strip=True)

                        if raw:

                            try:

                                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))

                            except ValueError:

                                dt = dateparser.parse(raw)

                    if dt is None:

                        continue

                    if dt.tzinfo is None:

                        dt_local = ensure_aware(dt, SYDNEY_TZ, 11, 30)

                        dt_utc = dt_local.astimezone(UTC)

                    else:

                        dt_utc = dt.astimezone(UTC)

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    title = None
                    name_el = container.select_one("strong.event-name")

                    if name_el:

                        title = name_el.get_text(" ", strip=True)

                    for sel in ("h3", "h2", "h4", ".title", ".event-title", "a[href]"):

                        if title:

                            break

                        el = container.select_one(sel)

                        if el:

                            title = el.get_text(" ", strip=True)

                            break

                    if not title:

                        title = container.get_text(" ", strip=True)

                    title = re.sub(r"\s+", " ", title).strip()

                    if len(title) < 5:

                        continue

                    a = container.select_one(
                        "div.rs-product-link-latest a[href], "
                        "a[href*='/statistics/'], "
                        "a[href*='/media-releases/'], "
                        "a[href*='/articles/']"
                    )

                    href = a["href"] if a else url

                    if not href.startswith("http"):

                        href = urljoin("https://www.abs.gov.au/", href)

                    if not any(k in href for k in ("/statistics/", "/media-releases/", "/articles/")):

                        continue

                    eid = make_id("AU", "ABS", title, dt_utc)

                    if eid in seen_ids:

                        continue

                    seen_ids.add(eid)

                    extras = {"release_time_local": "11:30"}
                    period_el = container.select_one("span.reference-period-value")
                    if period_el:

                        reference_period = re.sub(r"\s+", " ", period_el.get_text(" ", strip=True)).strip()

                        if reference_period:

                            extras["reference_period"] = reference_period

                    events.append(Event(

                        id=eid,

                        source="ABS_HTML",

                        agency="ABS",

                        country="AU",

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Australia/Sydney",

                        impact=classify_event(title),

                        url=href,

                        extras=extras

                    ))

                except Exception as e:

                    logger.debug(f"ABS: block parse err: {e}")

        except Exception as e:

            logger.warning(f"ABS fetch failed for {url}: {e}")

    logger.info(f"ABS HTML: Found {len(events)} events")

    return events

