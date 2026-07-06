"""Statistics Canada calendar fetchers — moved verbatim from the monolith (plan 6.3).

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

def _statcan_candidate_urls():

    """StatCan Atom candidate URLs."""

    return [

        "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom",

    ]

def _statcan_best_dt_from_entry(entry):

    """Extract best datetime from StatCan Atom entry."""

    for key in ("published", "updated"):

        val = entry.get(key)

        if val:

            try:

                return dateparser.parse(val)

            except Exception:

                pass

    return None

def _statcan_release_dt_from_page(session, href):

    """Extract release datetime from StatCan page with enhanced meta tag support."""

    try:

        r, _ = source_sget(session, "STATCAN", href, timeout=20)

        if not r or not getattr(r, "ok", False):

            return None

        soup = BeautifulSoup(r.text, "lxml")

        # Method 1: <time datetime="2025-04-12T08:30:00-04:00"> or date-only

        t = soup.select_one("time[datetime]")

        if t and t.get("datetime"):

            return dateparser.parse(t["datetime"])

        # Method 2: <meta property="article:published_time" content="...">

        m = soup.select_one('meta[property="article:published_time"][content]')

        if m:

            return dateparser.parse(m["content"])

        # Method 3: StatCan dcterms meta tags (enhanced)

        for selector in [

            'meta[name="dcterms.issued"][content]',

            'meta[name="dcterms.date"][content]',

            'meta[name="dcterms:issued"][content]',

            'meta[name="dcterms:date"][content]'

        ]:

            m = soup.select_one(selector)

            if m and m.get("content"):

                try:

                    base = dateparser.parse(m["content"])

                    if base:

                        # Default to 10:00 Toronto for date-only meta tags

                        if base.hour == 0 and base.minute == 0:

                            base = base.replace(hour=10, minute=0)

                        return base

                except Exception:

                    continue

    except Exception:

        return None

    return None

def _statcan_html_calendar(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fallback HTML calendar scraper for StatCan with correct upcoming releases URL."""

    if not BeautifulSoup:

        return []

    # Updated fallback URLs - use the correct upcoming releases page

    fallback_urls = [

        "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm",  # Upcoming releases (correct)

        "https://www150.statcan.gc.ca/n1/dai-quo/index-eng.htm",  # Daily index

    ]

    events: List[Event] = []

    seen: set[str] = set()

    for url in fallback_urls:

        try:

            resp, _ = source_sget(session, "STATCAN", url, timeout=25)

            if not resp or not getattr(resp, "ok", False):

                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Method 1: Parse upcoming releases format (cal2-eng.htm)

            if "cal2-eng.htm" in url:

                # Look for date headers like "September 16"

                date_headers = soup.find_all(['h3', 'h4'], string=re.compile(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}'))

                for header in date_headers:

                    try:

                        # Parse the date from header text

                        date_text = header.get_text(strip=True)

                        # Add current year if not present

                        if not re.search(r'\d{4}', date_text):

                            current_year = datetime.now().year

                            date_text = f"{date_text}, {current_year}"

                        base_date = dateparser.parse(date_text)

                        if not base_date:

                            continue

                        # Find the next sibling element containing release list

                        next_elem = header.find_next_sibling(['ol', 'ul', 'div'])

                        if not next_elem:

                            continue

                        # Extract releases from list items

                        release_items = next_elem.find_all('li')

                        for item in release_items:

                            segments = [seg.strip(" ,") for seg in item.stripped_strings if seg.strip()]
                            title_text = ""
                            for segment in segments:
                                lowered = segment.lower()
                                if "lockup" in lowered:
                                    continue
                                if re.search(r"\d{3}[- ]\d{3}[- ]\d{4}", segment):
                                    break
                                title_text = segment
                                break

                            if not title_text:

                                continue

                            # Clean up title (remove contact info, etc.)

                            title = re.sub(r'\([^)]*\)$', '', title_text).strip().rstrip(",")

                            title = re.sub(r'\s+', ' ', title).strip()

                            # Skip if title is too short or generic

                            if len(title) < 10 or title.lower() in ['pdf version', 'contact']:

                                continue

                            # Set release time to 8:30 AM Eastern (as mentioned on page)

                            dt_local = base_date.replace(hour=8, minute=30)

                            dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=8, default_min=30)

                            dt_utc = dt_local.astimezone(UTC)

                            if not _within(dt_utc, start_utc, end_utc):

                                continue

                            # Generate URL based on date pattern - FIXED FORMAT

                            yyyy_mm_dd = dt_local.strftime("%Y%m%d")   # e.g., 20250912

                            yymmdd = dt_local.strftime("%y%m%d")       # e.g., 250912

                            href = f"https://www150.statcan.gc.ca/n1/daily-quotidien/{yyyy_mm_dd}/dq{yymmdd}a-eng.htm"

                            eid = make_id("CA", "STATCAN", title, dt_utc)

                            if eid in seen:

                                continue

                            seen.add(eid)

                            events.append(

                                Event(

                                    id=eid,

                                    source="STATCAN_HTML",

                                    agency="STATCAN",

                                    country="CA",

                                    title=title,

                                    date_time_utc=dt_utc,

                                    event_local_tz="America/Toronto",

                                    impact=classify_event(title),

                                    url=href,

                                    extras={"announcement_time_local": "08:30"},

                                )

                            )

                    except Exception as e:

                        logger.debug(f"StatCan: Error parsing date header {header}: {e}")

                        continue

            # Method 2: Parse daily index format (index-eng.htm) - fallback

            else:

                for a in soup.select("a[href*='/daily-quotidien/'], a[href*='/dai-quo/']"):

                    title = re.sub(r"\s+", " ", a.get_text(strip=True))

                    if not title or len(title) < 10:

                        continue

                    href = urljoin(url, a.get("href", ""))

                    dt_local = None

                    # Look for time elements with datetime attribute

                    parent = a

                    for _ in range(3):

                        if not parent:

                            break

                        t = parent.find("time", datetime=True)

                        if t and t.get("datetime"):

                            try:

                                dt_local = dateparser.parse(t["datetime"])

                                break

                            except Exception:

                                dt_local = None

                        parent = parent.parent

                    # Fallback: extract date from URL pattern

                    if not dt_local:

                        date_match = re.search(r'/dq(\d{2})(\d{2})(\d{2})[a-z]?-eng\.htm', href)

                        if date_match:

                            year = 2000 + int(date_match.group(1))

                            month = int(date_match.group(2))

                            day = int(date_match.group(3))

                            try:

                                dt_local = datetime(year, month, day, 8, 30)  # 8:30 AM Eastern

                            except ValueError:

                                continue

                    if not dt_local:

                        continue

                    dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=8, default_min=30)

                    dt_utc = dt_local.astimezone(UTC)

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    eid = make_id("CA", "STATCAN", title, dt_utc)

                    if eid in seen:

                        continue

                    seen.add(eid)

                    events.append(

                        Event(

                            id=eid,

                            source="STATCAN_HTML",

                            agency="STATCAN",

                            country="CA",

                            title=title,

                            date_time_utc=dt_utc,

                            event_local_tz="America/Toronto",

                            impact=classify_event(title),

                            url=href,

                            extras={"announcement_time_local": "08:30"},

                        )

                    )

            # If we found events from this URL, we can break

            if events:

                break

        except Exception as e:

            logger.debug(f"StatCan HTML fallback failed for {url}: {e}")

            continue

    return events

def _statcan_html_fallback(

    session: requests.Session, start_utc: datetime, end_utc: datetime

) -> List[Event]:

    return _statcan_html_calendar(session, start_utc, end_utc)

def fetch_statcan_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch StatCan events with Atom + HTML fallback and deduplication."""

    source, agency, country = "STATCAN_ATOM", "STATCAN", "CA"
    cache_manager = getattr(session, "cache_manager", None)

    feed_entries: list[tuple[Any, str]] = []

    for cand in _statcan_candidate_urls():

        try:

            r, _ = source_sget(session, agency, cand, timeout=25, path_hint="atom")

            if not r or not getattr(r, "ok", False):

                continue

            parsed = feedparser.parse(r.content)

            if parsed.entries:

                for e in parsed.entries:

                    feed_entries.append((e, cand))

        except Exception:

            continue

    if len(feed_entries) == 0:

        html_events = _statcan_html_fallback(session, start_utc, end_utc)

        logger.info(f"StatCan HTML fallback: Found {len(html_events)} event(s)")
        if html_events and cache_manager:
            try:
                _persist_lkg("STATCAN", html_events)
            except Exception:
                logger.debug("StatCan: failed to persist LKG from HTML", exc_info=True)
        if html_events:
            _finalize_source_log("STATCAN", "html", len(html_events))
            return html_events
        merged = maybe_merge_lkg("STATCAN", [], ttl_days=30, tag="lkg")
        if merged:
            for ev in merged:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
            _finalize_source_log("STATCAN", "lkg", len(merged))
            return merged
        _finalize_source_log("STATCAN", "none", 0, zero_reason="parser_error")
        return html_events

    seen_ids: Dict[str, Event] = {}

    for entry, feed_url in feed_entries:

        title = (entry.get("title") or "Statistics Canada Release").strip()

        href = entry.get("link") or feed_url

        dt_local = _statcan_best_dt_from_entry(entry)

        page_dt = _statcan_release_dt_from_page(session, href)

        if page_dt:

            dt_local = page_dt

        if not dt_local:

            continue

        dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=10, default_min=0)

        dt_utc = dt_local.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            continue

        eid = make_id(country, agency, title, dt_utc)

        if eid in seen_ids:

            continue

        seen_ids[eid] = Event(

            id=eid,

            source=source,

            agency=agency,

            country=country,

            title=title,

            date_time_utc=dt_utc,

            event_local_tz="America/Toronto",

            impact=classify_event(title),

            url=href,

            extras={},

        )

    events = list(seen_ids.values())

    if not events:

        events = _statcan_html_fallback(session, start_utc, end_utc)

        logger.info(f"StatCan HTML fallback: Found {len(events)} event(s)")
        if events and cache_manager:
            try:
                _persist_lkg("STATCAN", events)
            except Exception:
                logger.debug("StatCan: failed to persist LKG from HTML", exc_info=True)
        if events:
            _finalize_source_log("STATCAN", "html", len(events))
            return events
        merged = maybe_merge_lkg("STATCAN", [], ttl_days=30, tag="lkg")
        if merged:
            for ev in merged:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
            _finalize_source_log("STATCAN", "lkg", len(merged))
            return merged
        _finalize_source_log("STATCAN", "none", 0, zero_reason="parser_error")
        return events

    logger.info(f"StatCan: {len(events)} events")
    if cache_manager:
        try:
            _persist_lkg("STATCAN", events)
        except Exception:
            logger.debug("StatCan: failed to persist LKG from atom", exc_info=True)
    _finalize_source_log("STATCAN", "atom", len(events))
    return events

