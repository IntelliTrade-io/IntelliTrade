"""ECB Governing Council calendar fetcher.

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

def fetch_ecb_governing_council_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """ECB Governing Council calendar with DOM primary, text fallback, and guarded LKG."""
    agency = "ECB"
    country = "EU"
    url = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"
    source_dom = "ECB_HTML"
    source_text = "ECB_TEXT_CALENDAR"
    cache_manager = getattr(session, "cache_manager", None)

    path_used = "dom"
    dom_day2 = 0
    text_day2 = 0

    if not BeautifulSoup:
        logger.warning("ECB: BeautifulSoup unavailable; DOM parse skipped")
        _finalize_source_log("ECB", path_used, 0, zero_reason="BeautifulSoup unavailable; DOM skipped")
        return []

    try:
        resp, _ = source_sget(session, agency, url, timeout=25)
    except Exception as exc:
        logger.error("ECB: fetch error: %s", exc)
        _finalize_source_log("ECB", path_used, 0, zero_reason="ECB calendar fetch error")
        return []

    if not (resp and getattr(resp, "ok", False)):
        logger.warning("ECB: failed to fetch calendar page (status=%s)", getattr(resp, "status_code", "n/a"))
        _finalize_source_log("ECB", path_used, 0, zero_reason="ECB calendar HTTP failure")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    selectors = [".ecb-basicList", ".table", ".calendar__item", "#content"]
    time_pattern = re.compile(r"(\d{1,2})[:.](\d{2})")
    date_single = re.compile(r"(?P<d>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")
    date_numeric = re.compile(r"(?P<d>\d{1,2})[./](?P<m>\d{1,2})[./](?P<y>20\d{2})")
    date_range = re.compile(r"(?P<d1>\d{1,2})\s*[\u2013\u2014-]\s*(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")

    def _month_to_num(token: str) -> int | None:
        lookup = {
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "may": 5,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "sept": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        }
        token = (token or "").strip().lower()
        return lookup.get(token[:4], lookup.get(token[:3]))

    def _extract_time(*snippets: str) -> tuple[int, int]:
        for snippet in snippets:
            if not snippet:
                continue
            match = time_pattern.search(snippet)
            if not match:
                continue
            try:
                hours = max(0, min(23, int(match.group(1))))
                mins = max(0, min(59, int(match.group(2))))
                return hours, mins
            except Exception:
                continue
        return 14, 30

    events: List[Event] = []
    seen_ids: set[str] = set()

    def _emit(
        year: int,
        month: int,
        day: int,
        hour: int | None,
        minute: int | None,
        *,
        day_index: int,
        press_conf: bool,
        source_tag: str,
    ) -> None:
        nonlocal dom_day2, text_day2
        hh = max(0, min(23, hour if hour is not None else 14))
        mm = max(0, min(59, minute if minute is not None else 30))
        # Force Day-2 default to 13:45 when time is missing or came from generic default.
        # We treat "missing" as values equal to the generic default returned by _extract_time (14:30).
        if (day_index == 2 or press_conf) and (hour is None or minute is None or (hh, mm) == (14, 30)):
            hh, mm = 13, 45
        is_day_two = day_index == 2 or press_conf
        try:
            dt_local = ensure_aware(datetime(year, month, day, hh, mm), FRANKFURT_TZ, hh, mm)
        except Exception:
            return

        def _append_ecb_event(
            *,
            title: str,
            local_dt: datetime,
            impact: str,
            meeting_type: str,
            event_type: str,
            output_day_index: int,
            has_press: bool,
            confidence: str = "exact",
        ) -> bool:
            dt_utc = local_dt.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                return False
            event_id = make_id(country, agency, title, dt_utc)
            if event_id in seen_ids:
                return False
            seen_ids.add(event_id)
            events.append(
                Event(
                    id=event_id,
                    source=source_tag,
                    agency=agency,
                    country=country,
                    title=title,
                    date_time_utc=dt_utc,
                    event_local_tz="Europe/Berlin",
                    impact=impact,
                    url=url,
                    extras={
                        "meeting_type": meeting_type,
                        "ecb_event_type": event_type,
                        "has_press_conference": bool(has_press),
                        "meeting_time_local": local_dt.strftime("%H:%M"),
                        "source_type": "DOM" if source_tag == source_dom else "TEXT_FALLBACK",
                        "day_index": output_day_index,
                        "time_confidence": confidence,
                    },
                )
            )
            return True

        appended_day_two = False
        if is_day_two:
            appended_day_two = _append_ecb_event(
                title="ECB Monetary Policy Decision",
                local_dt=dt_local,
                impact="High",
                meeting_type="Governing Council Day 2",
                event_type="monetary_policy_decision",
                output_day_index=2,
                has_press=press_conf,
            )
            if press_conf:
                try:
                    press_dt_local = ensure_aware(datetime(year, month, day, 14, 30), FRANKFURT_TZ, 14, 30)
                except Exception:
                    press_dt_local = dt_local + timedelta(minutes=45)
                _append_ecb_event(
                    title="ECB Press Conference",
                    local_dt=press_dt_local,
                    impact="High",
                    meeting_type="Governing Council Press Conference",
                    event_type="press_conference",
                    output_day_index=2,
                    has_press=True,
                    confidence="tentative",
                )
        else:
            _append_ecb_event(
                title="ECB Non-Monetary Policy Meeting",
                local_dt=dt_local,
                impact="Low",
                meeting_type="Governing Council Day 1",
                event_type="non_monetary_policy_meeting",
                output_day_index=1,
                has_press=False,
            )
        if appended_day_two:
            if source_tag == source_dom:
                dom_day2 += 1
            else:
                text_day2 += 1

    # DOM path
    for selector in selectors:
        for element in soup.select(selector):
            block = element.get_text("\n", strip=True)
            if not block:
                continue
            block_lower = block.lower()
            for line in block.splitlines():
                match_range = date_range.search(line)
                if match_range:
                    month_num = _month_to_num(match_range.group("mon"))
                    if not month_num:
                        continue
                    year = int(match_range.group("y"))
                    day_start = int(match_range.group("d1"))
                    day_end = int(match_range.group("d2"))
                    hh, mm = _extract_time(line, block)
                    _emit(year, month_num, day_start, hh, mm, day_index=1, press_conf=False, source_tag=source_dom)
                    _emit(
                        year,
                        month_num,
                        day_end,
                        hh,
                        mm,
                        day_index=2,
                        press_conf=("press conference" in block_lower or "day 2" in block_lower),
                        source_tag=source_dom,
                    )
                    continue
                match_single = date_single.search(line)
                if match_single:
                    month_num = _month_to_num(match_single.group("mon"))
                    if not month_num:
                        continue
                    year = int(match_single.group("y"))
                    day_val = int(match_single.group("d"))
                    hh, mm = _extract_time(line, block)
                    press_conf = "press conference" in block_lower or "day 2" in block_lower
                    _emit(
                        year,
                        month_num,
                        day_val,
                        hh,
                        mm,
                        day_index=2 if press_conf else 1,
                        press_conf=press_conf,
                        source_tag=source_dom,
                    )

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("ECB", events)
        logger.info(f"ECB Governing Council: {dom_day2} meetings found (Day 2)")
        _finalize_source_log("ECB", "dom", len(events))
        return events

    # Text fallback
    text_block = soup.get_text(" ", strip=True)
    path_used = "text"
    range_pattern = re.compile(r"(?P<d1>\d{1,2})\s*(?:[\u2013\u2014-]|--)\s*(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")
    single_month_pattern = re.compile(r"(?P<d>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")

    def _context_hint(span: tuple[int, int]) -> bool:
        start, end = span
        radius = 120
        snippet = text_block[max(0, start - radius) : min(len(text_block), end + radius)].lower()
        return "press conference" in snippet or "day 2" in snippet

    matched_ranges: list[tuple[int, int]] = []
    for match in range_pattern.finditer(text_block):
        month_num = _month_to_num(match.group("mon"))
        if not month_num:
            continue
        year = int(match.group("y"))
        day_start = int(match.group("d1"))
        day_end = int(match.group("d2"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_start, None, None, day_index=1, press_conf=False, source_tag=source_text)
        _emit(year, month_num, day_end, None, None, day_index=2, press_conf=hint, source_tag=source_text)
        matched_ranges.append(match.span())

    def _span_within(target: tuple[int, int]) -> bool:
        return any(span[0] <= target[0] and target[1] <= span[1] for span in matched_ranges)

    for match in single_month_pattern.finditer(text_block):
        if _span_within(match.span()):
            continue
        month_num = _month_to_num(match.group("mon"))
        if not month_num:
            continue
        year = int(match.group("y"))
        day_val = int(match.group("d"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_val, None, None, day_index=1, press_conf=hint, source_tag=source_text)
        if hint:
            _emit(year, month_num, day_val, None, None, day_index=2, press_conf=True, source_tag=source_text)

    for match in date_numeric.finditer(text_block):
        if _span_within(match.span()):
            continue
        year = int(match.group("y"))
        month_num = int(match.group("m"))
        day_val = int(match.group("d"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_val, None, None, day_index=1, press_conf=hint, source_tag=source_text)
        if hint:
            _emit(year, month_num, day_val, None, None, day_index=2, press_conf=True, source_tag=source_text)

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("ECB", events)
        logger.info(f"ECB Governing Council: {text_day2} meetings found (Day 2)")
        _finalize_source_log("ECB", "text", len(events))
        return events

    # LKG merge
    lkg_events: List[Event] = []
    if cache_manager:
        try:
            lkg_events = maybe_merge_lkg("ECB", events, ttl_days=14, tag="lkg")
        except Exception:
            logger.debug("ECB: guarded LKG merge failed", exc_info=True)

    if lkg_events:
        logger.warning(f"ECB LKG_MERGE: {len(lkg_events)} merged")
        _finalize_source_log("ECB", "lkg", len(lkg_events))
        return lkg_events

    zero_reason = "ECB: Governing Council schedule returned no meetings for requested window."
    _finalize_source_log("ECB", path_used, 0, zero_reason=zero_reason)
    return []

