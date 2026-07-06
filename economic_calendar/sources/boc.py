"""Bank of Canada calendar fetcher.

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

def fetch_boc_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Bank of Canada rate announcement schedule with DOM/table fallback."""
    path_label = "dom"
    if not BeautifulSoup:
        path_label = "unavailable"
        _finalize_source_log("BOC", path_label, 0, zero_reason="BeautifulSoup unavailable; DOM skipped")
        return []

    url = "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/#schedule"
    agency, country, source = "BOC", "CA", "BOC_HTML"
    toronto_tz = TORONTO_TZ
    cache_manager = getattr(session, "cache_manager", None)
    last_snapshot = ""
    parsed_schedule_dates: List[datetime] = []
    events: List[Event] = []
    parsed_schedule_dates: List[datetime] = []

    def _emit(dt_local: datetime, href: str) -> None:
        dt_local = ensure_aware(dt_local, toronto_tz, 10, 0)
        dt_utc = dt_local.astimezone(UTC)
        parsed_schedule_dates.append(dt_utc)
        if not _within(dt_utc, start_utc, end_utc):
            return
        events.append(
            Event(
                id=make_id(country, agency, "BoC Rate Announcement", dt_utc),
                source=source,
                agency=agency,
                country=country,
                title="BoC Rate Announcement",
                date_time_utc=dt_utc,
                event_local_tz="America/Toronto",
                impact="High",
                url=href,
                extras={"announcement_time_local": "10:00"},
            )
        )

    try:
        resp, _ = source_sget(session, agency, url, timeout=25)
    except Exception:
        logger.debug("BoC: request failed for %s", url, exc_info=True)
        resp = None

    if resp and getattr(resp, "ok", False) and BeautifulSoup:
        soup = BeautifulSoup(resp.text, "html.parser")
        last_snapshot = soup.get_text("\n", strip=True)[:ZERO_SNAPSHOT_MAX_CHARS]
        for t in soup.select("time[datetime]"):
            dt_val = t.get("datetime")
            if not dt_val:
                continue
            try:
                dt_local = dateparser.parse(dt_val)
            except Exception:
                continue
            if not dt_local:
                continue
            anchor = t if t.name == "a" else t.find_parent("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor else url
            _emit(dt_local, href)

        if not events:
            tables = soup.select("table")
            for table in tables:
                for row in table.select("tr"):
                    cells = row.select("td")
                    if len(cells) < 2:
                        continue
                    date_text = cells[0].get_text(" ", strip=True)
                    description = cells[1].get_text(" ", strip=True)
                    if "interest rate announcement" not in description.lower():
                        continue
                    match = re.search(r"(\w+)\s+(\d{1,2})", date_text)
                    if not match:
                        continue
                    month, day = match.groups()
                    for year in (datetime.now().year, datetime.now().year + 1):
                        try:
                            dt_local = dateparser.parse(f"{month} {day} {year}")
                        except Exception:
                            continue
                        if not dt_local:
                            continue
                        _emit(dt_local, url)
                        break

        if events:
            events.sort(key=lambda ev: ev.date_time_utc)
            if cache_manager:
                try:
                    _persist_lkg("BOC", events)
                except Exception:
                    logger.debug("BoC: LKG persist failed", exc_info=True)
            _finalize_source_log("BOC", path_label, len(events))
            return events

    if parsed_schedule_dates:
        _finalize_source_log("BOC", "dom", 0, zero_reason="outside_window")
        return []

    merged = maybe_merge_lkg("BOC", [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
        _finalize_source_log("BOC", "lkg", len(merged))
        return merged

    zero_reason = "outside_window" if parsed_schedule_dates else "BoC: No schedule entries parsed for the requested window."
    _finalize_source_log("BOC", "none", 0, zero_reason=zero_reason)
    write_zero_snapshot("BOC", last_snapshot or "no HTTP body")
    return []

