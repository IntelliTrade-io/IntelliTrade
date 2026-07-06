"""UK ONS calendar fetchers (ICS + HTML) — moved verbatim from the monolith (plan 6.3).

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

def fetch_ons_events_enhanced(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """



    ONS (UK Release Calendar) â€” RSS + HTML fallback using "upcoming" view



    LOCKED SELECTORS based on live HTML structure analysis



    



    Primary RSS URL: https://www.ons.gov.uk/releasecalendar?rss&release-type=type-upcoming



    Fallback HTML URL: https://www.ons.gov.uk/releasecalendar?highlight=true&limit=10&page=1&release-type=type-upcoming&sort=date-newest



    Health Floor: â‰¥5 events in 60-day window



    """

    events = []

    rss_events = []

    html_events = []

    # 1. ONS RSS (Primary) - Try upcoming-only RSS first

    rss_url = "https://www.ons.gov.uk/releasecalendar?rss&release-type=type-upcoming"

    try:

        resp, _ = source_sget(session, "ONS", rss_url, timeout=20, path_hint="rss")

        if resp and resp.ok:

            # Parse RSS feed

            soup = BeautifulSoup(resp.text, "xml")

            items = soup.find_all("item")

            for item in items:

                try:

                    title_el = item.find("title")

                    link_el = item.find("link")

                    pub_date_el = item.find("pubDate")

                    if not title_el or not pub_date_el:

                        continue

                    title = title_el.get_text(strip=True)

                    url = link_el.get_text(strip=True) if link_el else rss_url

                    # Parse publication date

                    dt_parsed = dateparser.parse(pub_date_el.get_text(strip=True))

                    if not dt_parsed:

                        continue

                    # Default to 07:00 Europe/London if no time present

                    if dt_parsed.hour == 0 and dt_parsed.minute == 0:

                        dt_parsed = dt_parsed.replace(hour=7, minute=0)

                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                    dt_utc = dt_local.astimezone(UTC)

                    # Check if within date range

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    # Impact classification

                    impact = "High" if any(keyword in title.upper() for keyword in ["GDP", "CPI"]) else \
                             "Medium" if any(keyword in title.upper() for keyword in ["EMPLOYMENT", "LABOUR", "UNEMPLOYMENT"]) else \
                             "Low"

                    event = Event(

                        id=make_id("GB", "ONS", title, dt_utc),

                        source="ONS_RSS_UPCOMING",

                        agency="ONS",

                        country="GB",

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Europe/London",

                        impact=impact,

                        url=url,

                        extras={"release_time_local": "07:00", "source_type": "RSS"}

                    )

                    rss_events.append(event)

                except Exception as e:

                    logger.debug(f"ONS RSS: Error parsing item: {e}")

                    continue

        logger.debug(f"ONS RSS: Found {len(rss_events)} events from upcoming RSS")

    except Exception as e:

        logger.debug(f"ONS RSS fetch failed: {e}")

    # 2. ONS HTML (Fallback) - If RSS returns 0 events, use HTML fallback

    if len(rss_events) == 0:

        logger.info("ONS: RSS returned 0 events, falling back to HTML")

        base_html_url = "https://www.ons.gov.uk/releasecalendar?highlight=true&limit=10&release-type=type-upcoming&sort=date-newest"

        try:

            page = 1

            max_pages = 30  # Safety limit for pagination

            while page <= max_pages:

                # Construct URL with pagination

                if page == 1:

                    url = base_html_url + "&page=1"

                else:

                    url = base_html_url + f"&page={page}"

                resp, _ = source_sget(session, "ONS", url, timeout=20)

                if not resp or not resp.ok:

                    logger.debug(f"ONS HTML: Page {page} fetch failed")

                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # LOCKED SELECTOR: Find release items in ordered list (ol li)

                release_items = soup.select("ol li")

                if not release_items:

                    logger.debug(f"ONS HTML: No release items found on page {page}")

                    break

                page_events = 0

                for item in release_items:

                    try:

                        # LOCKED SELECTOR: Extract title link (first <a> in li)

                        title_link = item.select_one("a")

                        if not title_link:

                            continue

                        title = title_link.get_text(strip=True)

                        if not title:

                            continue

                        href = urljoin(base_html_url, title_link.get("href", ""))

                        # LOCKED SELECTOR: Extract date from "Release date:" text pattern

                        dt_local = None

                        item_text = item.get_text(" ", strip=True)

                        # Pattern: "Release date: 12 September 2025 7:00am | Confirmed"

                        date_match = re.search(r'Release date:\s*(\d{1,2}\s+\w+\s+\d{4})\s+(\d{1,2}:\d{2}[ap]m)', item_text, re.IGNORECASE)

                        if date_match:

                            date_str = date_match.group(1)

                            time_str = date_match.group(2)

                            # Convert time to 24-hour format

                            try:

                                time_24h = datetime.strptime(time_str, "%I:%M%p").strftime("%H:%M")

                                full_date_str = f"{date_str} {time_24h}"

                                dt_parsed = dateparser.parse(full_date_str)

                                if dt_parsed:

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                            except:

                                # Fallback to default time

                                dt_parsed = dateparser.parse(date_str)

                                if dt_parsed:

                                    dt_parsed = dt_parsed.replace(hour=7, minute=0)

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                        # Fallback: try <time datetime> if present

                        if not dt_local:

                            time_el = item.select_one("time[datetime]")

                            if time_el:

                                datetime_str = time_el.get("datetime")

                                dt_parsed = dateparser.parse(datetime_str)

                                if dt_parsed:

                                    if dt_parsed.hour == 0 and dt_parsed.minute == 0:

                                        dt_parsed = dt_parsed.replace(hour=7, minute=0)

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                        if not dt_local:

                            continue

                        dt_utc = dt_local.astimezone(UTC)

                        # Check if within date range

                        if not _within(dt_utc, start_utc, end_utc):

                            continue

                        # Impact classification

                        impact = "High" if any(keyword in title.upper() for keyword in ["GDP", "CPI"]) else \
                                 "Medium" if any(keyword in title.upper() for keyword in ["EMPLOYMENT", "LABOUR", "UNEMPLOYMENT"]) else \
                                 "Low"

                        event = Event(

                            id=make_id("GB", "ONS", title, dt_utc),

                            source="ONS_HTML_UPCOMING",

                            agency="ONS",

                            country="GB",

                            title=title,

                            date_time_utc=dt_utc,

                            event_local_tz="Europe/London",

                            impact=impact,

                            url=href,

                            extras={"release_time_local": dt_local.strftime('%H:%M'), "source_type": "HTML"}

                        )

                        html_events.append(event)

                        page_events += 1

                    except Exception as e:

                        logger.debug(f"ONS HTML: Error parsing item: {e}")

                        continue

                logger.debug(f"ONS HTML: Page {page} - found {page_events} events")

                # Check for next page - LOCKED SELECTOR: look for pagination "Next" link

                if page_events == 0:

                    break

                # Look for next page link in pagination - improved selector

                next_link = soup.select_one(".pager-next a, li.pager__item--next a, a[aria-label*='Next'], a:-soup-contains('Next')")

                if not next_link:

                    # Check numbered pagination with improved selectors

                    page_links = soup.select("a[href*='page='], .pager a, .pagination a")

                    max_page_found = 0

                    for link in page_links:

                        try:

                            href = link.get('href', '')

                            page_match = re.search(r'page=(\d+)', href)

                            if page_match:

                                page_num = int(page_match.group(1))

                                max_page_found = max(max_page_found, page_num)

                        except:

                            continue

                    if page >= max_page_found:

                        break

                page += 1

            logger.debug(f"ONS HTML: Found {len(html_events)} events across {page-1} pages")

        except Exception as e:

            logger.debug(f"ONS HTML fallback failed: {e}")

    # 3. Deduplication - Combine RSS and HTML, prefer RSS if duplicates

    seen_ids = set()

    unique_events = []

    # Process RSS events first (preferred)

    for event in rss_events:

        if event.id not in seen_ids:

            unique_events.append(event)

            seen_ids.add(event.id)

    # Process HTML events, skip duplicates

    for event in html_events:

        if event.id not in seen_ids:

            unique_events.append(event)

            seen_ids.add(event.id)

    # 4. Health Floor Check - ONS must produce â‰¥5 events in 60-day window

    if len(unique_events) >= 5:

        if len(rss_events) > 0:

            logger.info(f"ONS: {len(unique_events)} events (RSS upcoming)")

        else:

            logger.info(f"ONS: {len(unique_events)} events (HTML upcoming)")

    else:

        logger.warning(f"ONS upcoming releases <5 â€“ check if feed/HTML structure changed (found {len(unique_events)})")

    return unique_events

# ---------------------------------------------------------------------------

# Fixed Original Scrapers (BLS, ONS, ABS, StatCan, Eurostat, Stats NZ)

def _ons_candidate_urls():

    """ONS RSS candidate URLs."""

    return [

        "https://www.ons.gov.uk/releasecalendar?format=rss",

        "https://www.ons.gov.uk/releasecalendar?rss",

        "https://www.ons.gov.uk/rss?content_type=releasecalendar&size=50",

    ]

MAX_ONS_TIMES = 200

MAX_ONS_BLOCKS = 200

def _read_best_dt_from_entry(entry):

    """Extract best datetime from RSS entry."""

    for key in ("published", "updated", "dc_date", "prism_publicationDate"):

        val = entry.get(key) or entry.get(key.replace("_", ":"))

        if val:

            try:

                return dateparser.parse(val)

            except Exception:

                pass

    return None

def _read_release_dt_from_page(session, href):

    """Extract release datetime from ONS page."""

    try:

        r, _ = source_sget(session, "ONS", href, timeout=20)

        if not r or not getattr(r, "ok", False):

            return None

        soup = BeautifulSoup(r.text, "lxml")

        # Common ONS patterns

        # <time datetime="2025-09-18T07:00:00+01:00">

        t = soup.select_one("time[datetime]")

        if t and t.get("datetime"):

            return dateparser.parse(t["datetime"])

        # <meta property="article:published_time" content="YYYY-MM-DDTHH:MM:SS+00:00">

        m = soup.select_one('meta[property="article:published_time"][content]')

        if m:

            return dateparser.parse(m["content"])

        # <meta name="dcterms.issued" content="YYYY-MM-DD">

        m = soup.select_one('meta[name="dcterms.issued"][content]')

        if m:

            # Add default 07:00 local if only a date is provided (ONS common)

            base = dateparser.parse(m["content"])

            return base.replace(hour=7, minute=0)

    except Exception:

        return None

    return None

def _ons_html_calendar(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fallback scraper for ONS release calendar HTML with pagination."""

    if not BeautifulSoup:

        return []

    # FIXED: Use upcoming-only URL like the enhanced version

    base = "https://www.ons.gov.uk/releasecalendar"

    events: List[Event] = []

    seen: set[str] = set()

    page = 1

    while True:

        # FIXED: Use upcoming filter with pagination

        params = {

            'highlight': 'true',

            'limit': '10',

            'page': str(page),

            'release-type': 'type-upcoming',

            'sort': 'date-newest'

        }

        resp, _ = source_sget(session, "ONS", base, timeout=25, params=params)

        if not resp or not resp.ok:

            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Track events found on this page to detect empty pages

        page_events_found = 0

        # First pass: explicit <time datetime> tags

        time_tags = soup.select("time[datetime]")[:MAX_ONS_TIMES]

        for time_tag in time_tags:

            try:

                dt_local = dateparser.parse(time_tag["datetime"])

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, default_hour=7, default_min=0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            block = time_tag.parent

            title_tag = None

            for _ in range(3):

                if not block:

                    break

                title_tag = block.find("a") or block.find("h3")

                if title_tag and title_tag.get_text(strip=True):

                    break

                block = block.parent

            title = (

                re.sub(r"\s+", " ", title_tag.get_text(strip=True))

                if title_tag else "ONS Release"

            )

            href = (

                urljoin(base, title_tag.get("href", ""))

                if title_tag and title_tag.get("href")

                else base

            )

            eid = make_id("GB", "ONS", title, dt_utc)

            if eid in seen:

                continue

            seen.add(eid)

            page_events_found += 1  # FIXED: Track events found on this page

            events.append(

                Event(

                    id=eid,

                    source="ONS_HTML",

                    agency="ONS",

                    country="GB",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/London",

                    impact=classify_event(title),

                    url=href,

                    extras={},

                )

            )

        # Second pass: blocks with "Release date:" text

        text_blocks = soup.find_all(string=re.compile("Release date:", re.I), limit=MAX_ONS_BLOCKS)

        for txt in text_blocks:

            m = re.search(r"Release date:\s*(.+)", txt, re.I)

            if not m:

                continue

            try:

                dt_local = dateparser.parse(m.group(1))

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, default_hour=7, default_min=0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            parent = txt.parent

            title_tag = None

            for _ in range(3):

                if not parent:

                    break

                title_tag = parent.find("a") or parent.find("h3")

                if title_tag and title_tag.get_text(strip=True):

                    break

                parent = parent.parent

            title = (

                re.sub(r"\s+", " ", title_tag.get_text(strip=True))

                if title_tag else "ONS Release"

            )

            href = (

                urljoin(base, title_tag.get("href", ""))

                if title_tag and title_tag.get("href")

                else base

            )

            eid = make_id("GB", "ONS", title, dt_utc)

            if eid in seen:

                continue

            seen.add(eid)

            page_events_found += 1  # FIXED: Track events found on this page

            events.append(

                Event(

                    id=eid,

                    source="ONS_HTML",

                    agency="ONS",

                    country="GB",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/London",

                    impact=classify_event(title),

                    url=href,

                    extras={},

                )

            )

        # FIXED: Stop pagination if no events found on this page or no next link

        next_link = soup.select_one(".pager-next a, li.pager__item--next a")

        if not next_link or page_events_found == 0:

            break

        page += 1

    return events

