"""Swiss National Bank calendar fetcher.

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

def fetch_snb_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Swiss National Bank Monetary Policy Assessment dates with estimator + LKG."""
    if not BeautifulSoup:
        _set_fetch_metadata("SNB", count=0, path="unavailable")
        return []

    agency, country = "SNB", "CH"
    source_dom = "SNB_SCHEDULE"
    zurich_tz = ZURICH_TZ
    cache_manager = getattr(session, "cache_manager", None)
    last_snapshot = ""

    urls = [
        "https://www.snb.ch/en/watch/calendar.html",
        "https://www.snb.ch/en/central-bank/news/calendar.html",
        "https://www.snb.ch/en/monetary-policy/monetary-policy-assessment.html",
    ]
    headers = {
        "User-Agent": DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0"),
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8,fr;q=0.7",
    }

    events: List[Event] = []
    parsed_schedule_dates: List[datetime] = []
    try:
        resp = sget_retry_alt(
            session,
            urls,
            headers=headers,
            tries=3,
            timeout=25,
            breaker=get_source_breaker("SNB"),
            path_hint="dom",
        )
    except Exception:
        resp = None
    dom_reachable = bool(resp and getattr(resp, "ok", False))

    if dom_reachable and BeautifulSoup:
        soup = BeautifulSoup(resp.text or "", "html.parser")
        last_snapshot = soup.get_text("\n", strip=True)[:ZERO_SNAPSHOT_MAX_CHARS]
        text = soup.get_text("\n", strip=True)
        pat1 = re.compile(
            r"(?P<d>\d{1,2})\s+(?P<mname>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|"
            r"May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?P<y>20\d{2})",
            re.I,
        )
        pat2 = re.compile(
            r"(?P<mname>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|"
            r"Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?P<d>\d{1,2}),\s*(?P<y>20\d{2})",
            re.I,
        )
        for pat in (pat1, pat2):
            for match in pat.finditer(text):
                day = int(match.group("d"))
                year = int(match.group("y"))
                month_name = match.group("mname")
                month_num = month_to_num(month_name)
                if not month_num:
                    continue
                try:
                    local_dt = ensure_aware(datetime(year, month_num, day, 9, 30), zurich_tz, 9, 30)
                except Exception:
                    continue
                dt_utc = local_dt.astimezone(UTC)
                parsed_schedule_dates.append(dt_utc)
                if not _within(dt_utc, start_utc, end_utc):
                    continue
                extras = {
                    "meeting_type": "MPA",
                    "announcement_time_local": "09:30",
                    "discovered_via": "dom",
                    "source_hint": "dom",
                }
                events.append(
                    Event(
                        id=make_id(country, agency, "SNB Monetary Policy Assessment", dt_utc),
                        source=source_dom,
                        agency=agency,
                        country=country,
                        title="SNB Monetary Policy Assessment",
                        date_time_utc=dt_utc,
                        event_local_tz="Europe/Zurich",
                        impact=classify_event("SNB Monetary Policy Assessment"),
                        url=resp.url or urls[0],
                        extras=extras,
                    )
                )

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            try:
                _persist_lkg("SNB", events)
            except Exception:
                logger.debug("SNB: failed to persist LKG", exc_info=True)
        _finalize_source_log("SNB", "dom", len(events))
        return events

    if parsed_schedule_dates:
        _finalize_source_log("SNB", "dom", 0, zero_reason="outside_window")
        return []

    def _estimate_snb_local_dt(year: int, month: int) -> Optional[datetime]:
        day = 15
        while True:
            try:
                candidate = datetime(year, month, day, 9, 30)
            except ValueError:
                return None
            if candidate.weekday() == 3:
                break
            day += 1
        try:
            return ensure_aware(candidate, zurich_tz, 9, 30)
        except Exception:
            return None

    estimator_events: List[Event] = []
    months = [3, 6, 9, 12]
    now_zurich = datetime.now(UTC).astimezone(zurich_tz)
    candidate_years = {now_zurich.year, now_zurich.year + 1, start_utc.year, end_utc.year}

    cadence_in_window = False
    for year in sorted(candidate_years):
        for month in months:
            local_dt = _estimate_snb_local_dt(year, month)
            if not local_dt:
                continue
            if _within(local_dt.astimezone(UTC), start_utc, end_utc):
                cadence_in_window = True
                break
        if cadence_in_window:
            break
    if not cadence_in_window:
        _finalize_source_log("SNB", "dom" if dom_reachable else "none", 0, zero_reason="outside_window")
        return []

    for year in sorted(candidate_years):
        for month in months:
            local_dt = _estimate_snb_local_dt(year, month)
            if not local_dt:
                continue
            dt_utc = local_dt.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            extras = {
                "estimated": True,
                "time_confidence": "assumed",
                "source": "estimator",
                "discovered_via": "estimator",
                "source_hint": "estimator",
                "zero_reason": "SNB DOM calendar empty; estimator projected quarterly cadence.",
            }
            estimator_events.append(
                Event(
                    id=make_id(country, agency, "SNB Monetary Policy Assessment (estimated)", dt_utc),
                    source="SNB_ESTIMATOR",
                    agency=agency,
                    country=country,
                    title="SNB Monetary Policy Assessment (estimated)",
                    date_time_utc=dt_utc,
                    event_local_tz="Europe/Zurich",
                    impact=classify_event("SNB Monetary Policy Assessment"),
                    url=urls[0],
                    extras=extras,
                )
            )

    if estimator_events:
        estimator_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("SNB", "estimator", len(estimator_events))
        return estimator_events

    merged = maybe_merge_lkg("SNB", [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.update({"cached": True, "discovered_via": "lkg", "source_hint": "lkg"})
            ev.extras = extras
        _finalize_source_log("SNB", "lkg", len(merged))
        return merged

    zero_reason = "SNB: No policy assessment dates detected; estimator and LKG unavailable."
    _finalize_source_log("SNB", "none", 0, zero_reason=zero_reason)
    if _ec_runstate.DEBUG_ZERO_FLAG:
        write_zero_snapshot("SNB", last_snapshot or "no HTTP body")
    return []

