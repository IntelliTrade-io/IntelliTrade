"""Bank of England MPC calendar fetcher.

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

def fetch_boe_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Bank of England MPC calendar with news-hub discovery and resilient year inference."""
    if not BeautifulSoup:
        _set_fetch_metadata("BOE", count=0, path="unavailable")
        return []

    agency, country, source = "BOE", "GB", "BOE_HTML"
    primary_url = "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates"
    london_tz = LONDON_TZ
    cache_manager = getattr(session, "cache_manager", None)

    def _extract_year_hint(*texts: Optional[str]) -> Optional[int]:
        for txt in texts:
            if not txt:
                continue
            m = re.search(r"(20\d{2})", txt)
            if m:
                try:
                    return int(m.group(1))
                except Exception:
                    continue
        return None

    def _normalize_dt(dt_local: datetime) -> datetime:
        return ensure_aware(dt_local, london_tz, 12, 0)

    def _parse_schedule(url: str) -> tuple[List[Event], str]:
        parsed: List[Event] = []
        snapshot_text = ""
        try:
            resp, _ = source_sget(session, agency, url, timeout=25)
        except Exception:
            logger.debug("BoE: request failure for %s", url, exc_info=True)
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
        )
        page_year = year_hint or datetime.now().year

        def _emit(dt_local: datetime, href: str) -> None:
            dt_local = _normalize_dt(dt_local)
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                return
            extras = {"announcement_time_local": dt_local.strftime("%H:%M")}
            parsed.append(
                Event(
                    id=make_id(country, agency, "MPC Meeting", dt_utc),
                    source=source,
                    agency=agency,
                    country=country,
                    title="MPC Meeting",
                    date_time_utc=dt_utc,
                    event_local_tz="Europe/London",
                    impact="High",
                    url=href,
                    extras=extras,
                )
            )

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
            anchor = t if t.name == "a" else (t.parent if t.parent and t.parent.name == "a" else None)
            link = anchor if anchor is not None and anchor.name == "a" and anchor.get("href") else t.find_parent("a", href=True)
            if link is None and t.parent:
                link = t.parent.find("a", href=True)
            href = urljoin(url, link["href"]) if link else url
            _emit(dt_local, href)

        if parsed:
            return parsed, snapshot_text

        for row in soup.select("table tr"):
            cells = row.find_all("td")
            if len(cells) < 1:
                continue
            date_cell = cells[0].get_text(" ", strip=True)
            description = " ".join(c.get_text(" ", strip=True) for c in cells[1:])
            if "mpc" not in description.lower():
                continue
            section_heading = row.find_previous(["h2", "h3", "h4"], string=re.compile(r"20\d{2}"))
            section_year = _extract_year_hint(section_heading.get_text(" ", strip=True) if section_heading else None) or page_year
            inferred_year = _extract_year_hint(date_cell, description) or section_year
            text_has_year = bool(re.search(r"20\d{2}", date_cell))
            date_str = date_cell if text_has_year else f"{date_cell} {inferred_year}"
            try:
                dt_local = dateparser.parse(date_str, dayfirst=True)
            except Exception:
                continue
            if not dt_local:
                continue
            link = row.find("a", href=True)
            href = urljoin(url, link["href"]) if link else url
            _emit(dt_local, href)

        return parsed, snapshot_text

    def _discover_future_url() -> Optional[str]:
        news_url = "https://www.bankofengland.co.uk/news"
        try:
            resp, _ = source_sget(session, agency, news_url, timeout=20)
        except Exception:
            return None
        if not (resp and getattr(resp, "ok", False)) or not BeautifulSoup:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        target = soup.find("a", href=re.compile(r"/monetary-policy/upcoming-mpc-dates|/news/\d{4}/[a-z0-9\-]+/mpc-dates-for-20\d{2}", re.I))
        if not target:
            return None
        return urljoin(news_url, target.get("href"))

    last_snapshot = ""
    events, last_snapshot = _parse_schedule(primary_url)
    if not events:
        future_url = _discover_future_url()
        if future_url:
            events, last_snapshot = _parse_schedule(future_url)

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        for ev in events:
            extras = dict(ev.extras or {})
            extras.setdefault("discovered_via", "dom")
            extras.setdefault("source_hint", "dom")
            ev.extras = extras
        if cache_manager:
            try:
                _persist_lkg("BOE", events)
            except Exception:
                logger.debug("BoE: LKG persist failed", exc_info=True)
        _finalize_source_log("BOE", "dom", len(events))
        return events

    curated_events: List[Event] = []
    for meeting in CURATED_BOE_DATES:
        if meeting.bank != "BOE":
            continue
        local_dt, curated_extras = _resolve_curated_local_dt(
            meeting,
            default_tz=LONDON_TZ,
            default_hour=12,
            default_minute=0,
        )
        dt_utc = local_dt.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        extras = {
            "announcement_time_local": local_dt.strftime("%H:%M"),
            "discovered_via": "curated",
            "source_hint": "curated",
        }
        extras.update(curated_extras)
        event_data = {
            "id": make_id(country, agency, "MPC Meeting", dt_utc),
            "source": "BOE_CURATED",
            "agency": agency,
            "country": country,
            "title": "MPC Meeting",
            "date_time_utc": dt_utc,
            "event_local_tz": "Europe/London",
            "impact": "High",
            "url": primary_url,
            "extras": extras,
        }
        event_data = _ensure_time_confidence(event_data)
        curated_events.append(Event(**event_data))
    if curated_events:
        curated_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("BOE", "curated", len(curated_events))
        return curated_events

    def _estimate_from_lkg() -> List[Event]:
        lkg_events = _read_lkg_events("BOE")
        if not lkg_events:
            return []
        last_event = lkg_events[-1]
        last_local = last_event.date_time_utc.astimezone(london_tz)
        candidate = last_local + timedelta(days=42)
        candidate = ensure_aware(
            datetime(candidate.year, candidate.month, candidate.day, 12, 0),
            london_tz,
            12,
            0,
        )
        dt_utc = candidate.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            return []
        extras = {
            "announcement_time_local": candidate.strftime("%H:%M"),
            "estimated": True,
            "provenance": "estimator_from_lkg",
            "discovered_via": "estimator",
            "source_hint": "estimator",
        }
        event_data = {
            "id": make_id(country, agency, "MPC Meeting", dt_utc),
            "source": "BOE_ESTIMATOR",
            "agency": agency,
            "country": country,
            "title": "MPC Meeting (est.)",
            "date_time_utc": dt_utc,
            "event_local_tz": "Europe/London",
            "impact": "High",
            "url": primary_url,
            "extras": extras,
        }
        event_data = _ensure_time_confidence(event_data)
        return [Event(**event_data)]

    estimator_events = _estimate_from_lkg()
    if estimator_events:
        _finalize_source_log("BOE", "estimator", len(estimator_events))
        return estimator_events

    zero_reason = "between_meetings"
    write_zero_snapshot("BOE", last_snapshot or "no HTTP body")
    _finalize_source_log("BOE", "none", 0, zero_reason=zero_reason)
    return []

