"""Reserve Bank of Australia calendar fetcher.

Moved verbatim from the monolith (plan 6.3). Shared-framework imports only;
behavior unchanged.
"""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from urllib.parse import urljoin
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

import requests

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from dateutil import parser as dateparser
except ImportError:
    dateparser = None

try:
    from lxml import html as lxml_html
except ImportError:
    lxml_html = None

from economic_calendar import runstate as _ec_runstate
from economic_calendar.curated import (
    CURATED_BOE_DATES,
    CURATED_BOJ_DATES,
    CURATED_FED_DATES,
    CuratedMeeting,
    _ensure_time_confidence,
    _resolve_curated_local_dt,
)
from economic_calendar.enrich import classify_event
from economic_calendar.events import Event, _content_hash_bytes, _content_hash_text, make_id
from economic_calendar.health import (
    ENABLE_LKG,
    LKG_TTLS,
    _finalize_source_log,
    _persist_lkg,
    _read_lkg_events,
    _schema_capture,
    ZERO_SNAPSHOT_MAX_CHARS,
    _set_fetch_metadata,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.htmlparse import broad_li_filter, find_rows_by_header_keywords, rows_by_header_xpath
from economic_calendar.http import (
    DEFAULT_HEADERS,
    RetryBudget,
    get_source_breaker,
    sget_retry_alt,
    sget_with_retry,
    source_sget,
)
from economic_calendar.ics import parse_ics_bytes, parse_ics_datetime
from economic_calendar.runstate import RUN_CONTEXT
from economic_calendar.textutils import _normalize_metadata_text
from economic_calendar.timeutils import (
    BEIJING_TZ,
    BERLIN_TZ,
    BRUSSELS_TZ,
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
    _iso,
    _now_utc,
    _within,
    ensure_aware,
    month_to_num,
)

logger = logging.getLogger("econ_calendar_complete")

FEATURE = _ec_runstate.FEATURE

def fetch_rba_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """RBA schedule parser with DOM, schedule index, curated fallback, and LKG."""
    if not BeautifulSoup:
        _set_fetch_metadata("RBA", count=0, path="unavailable")
        return []

    agency, country, source = "RBA", "AU", "RBA_HTML"
    source_key = "RBA"
    sydney_tz = SYDNEY_TZ
    cache_manager = getattr(session, "cache_manager", None)
    current_year = datetime.now().year

    base_url = "https://www.rba.gov.au/schedules-events/monetary-policy-decision.html"
    schedule_url = "https://www.rba.gov.au/monetary-policy/rba-board/meeting-schedules.html"
    candidate_urls = [
        base_url,
        f"{base_url}?year={current_year}",
        f"{base_url}?year={current_year + 1}",
        schedule_url,
    ]
    seen_dates: set[tuple[int, int, int]] = set()
    last_snapshot = ""

    curated_dates = [
        (2025, 2, 4),
        (2025, 3, 4),
        (2025, 4, 8),
        (2025, 5, 6),
        (2025, 6, 3),
        (2025, 7, 8),
        (2025, 8, 5),
        (2025, 9, 2),
        (2025, 10, 7),
        (2025, 11, 4),
        (2025, 12, 9),
        (2026, 2, 3),
        (2026, 3, 31),
        (2026, 5, 19),
        (2026, 7, 7),
        (2026, 8, 11),
        (2026, 9, 22),
        (2026, 11, 4),
        (2026, 12, 8),
    ]

    def _emit(dt_local: datetime, href: str, bucket: List[Event]) -> None:
        dt_local = ensure_aware(dt_local, sydney_tz, 14, 30)
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            return
        key = (dt_local.year, dt_local.month, dt_local.day)
        if key in seen_dates:
            return
        seen_dates.add(key)
        bucket.append(
            Event(
                id=make_id(country, agency, "RBA Cash Rate Decision", dt_utc),
                source=source,
                agency=agency,
                country=country,
                title="RBA Cash Rate Decision",
                date_time_utc=dt_utc,
                event_local_tz="Australia/Sydney",
                impact="High",
                url=href,
                extras={"announcement_time_local": "14:30"},
            )
        )

    def _extract_year_hint(*texts: Optional[str]) -> Optional[int]:
        for txt in texts:
            if not txt:
                continue
            match = re.search(r"(20\d{2})", txt)
            if match:
                return int(match.group(1))
        return None

    def _parse_page(url: str) -> tuple[List[Event], str]:
        parsed: List[Event] = []
        snapshot_text = ""
        try:
            resp, _ = source_sget(
                session,
                agency,
                url,
                timeout=25,
                headers={"Accept-Language": "en-AU,en;q=0.8"},
            )
        except Exception:
            logger.debug("RBA: request failed for %s", url, exc_info=True)
            return parsed, snapshot_text

        if not (resp and getattr(resp, "ok", False)) or not BeautifulSoup:
            return parsed, snapshot_text

        soup = BeautifulSoup(resp.text, "html.parser")
        snapshot_text = soup.get_text("\n", strip=True)[:ZERO_SNAPSHOT_MAX_CHARS]
        meta_title = soup.find("meta", attrs={"property": "og:title"})
        meta_modified = soup.find("meta", attrs={"name": "Last-Modified"})
        year_hint = _extract_year_hint(
            soup.title.string if soup.title else "",
            meta_title.get("content") if meta_title else None,
            meta_modified.get("content") if meta_modified else None,
        ) or current_year

        for node in soup.select("time[datetime]"):
            dt_val = node.get("datetime")
            if not dt_val:
                continue
            try:
                dt_local = dateparser.parse(dt_val)
            except Exception:
                continue
            if not dt_local:
                continue
            if dt_local.hour == 0 and dt_local.minute == 0:
                dt_local = dt_local.replace(hour=14, minute=30)
            anchor = node if node.name == "a" else node.find_parent("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor and anchor.get("href") else url
            _emit(dt_local, href, parsed)

        if parsed:
            return parsed, snapshot_text

        month_names = "January February March April May June July August September October November December".split()
        month_map = {name.lower(): idx + 1 for idx, name in enumerate(month_names)}
        date_pattern = re.compile(
            r"(\d{1,2})(?:[–\-](\d{1,2}))?\s+(January|February|March|April|May|June|July|August|September|October|November|December)",
            re.I,
        )

        for node in soup.select("table tr, dl, li, p"):
            text = node.get_text(" ", strip=True)
            if not text:
                continue
            match = date_pattern.search(text)
            if not match:
                continue
            start_day, end_day, month_name = match.groups()
            month_num = month_map.get(month_name.lower())
            if not month_num:
                continue
            inferred_year = _extract_year_hint(text) or year_hint
            target_day = int(end_day or start_day)
            try:
                dt_local = datetime(inferred_year, month_num, target_day, 14, 30)
            except Exception:
                continue
            anchor = node.find("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor else url
            _emit(dt_local, href, parsed)

        return parsed, snapshot_text

    events: List[Event] = []
    path_label = "dom"
    for candidate in candidate_urls:
        page_events, snap = _parse_page(candidate)
        if page_events:
            events = page_events
            last_snapshot = snap
            break
        if snap:
            last_snapshot = snap

    events.sort(key=lambda ev: ev.date_time_utc)
    dom_count = len(events)
    if dom_count:
        for ev in events:
            extras = dict(ev.extras or {})
            extras.setdefault("discovered_via", path_label)
            extras.setdefault("source_hint", path_label)
            ev.extras = extras
        if cache_manager:
            try:
                _persist_lkg(source_key, events)
            except Exception:
                logger.debug("RBA: LKG persist failed", exc_info=True)
        _finalize_source_log(source_key, path_label, dom_count)
        return events

    curated_events: List[Event] = []
    for year, month, day in curated_dates:
        dt_local = ensure_aware(datetime(year, month, day, 14, 30), sydney_tz, 14, 30)
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        event_data = {
            "id": make_id(country, agency, "RBA Cash Rate Decision", dt_utc),
            "source": "RBA_CURATED",
            "agency": agency,
            "country": country,
            "title": "RBA Cash Rate Decision",
            "date_time_utc": dt_utc,
            "event_local_tz": "Australia/Sydney",
            "impact": "High",
            "url": schedule_url,
            "extras": {"announcement_time_local": "14:30", "source": "curated"},
        }
        event_data = _ensure_time_confidence(event_data)
        curated_events.append(Event(**event_data))

    if curated_events:
        curated_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log(source_key, "curated", len(curated_events))
        return curated_events

    merged = maybe_merge_lkg(source_key, [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
        logger.info("RBA LKG_MERGE: %d", len(merged))
        _finalize_source_log(source_key, "lkg", len(merged))
        return merged

    zero_reason = "between_meetings"
    _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
    write_zero_snapshot("RBA", last_snapshot or "no HTTP body")
    return []

