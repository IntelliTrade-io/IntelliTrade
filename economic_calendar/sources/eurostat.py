"""Eurostat calendar fetcher — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import List, Tuple

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

from economic_calendar.enrich import classify_event
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    _finalize_source_log,
    _persist_lkg,
    maybe_merge_lkg,
)
from economic_calendar.http import (
    sget_with_retry,
    source_sget,
)
from economic_calendar.ics import parse_ics_bytes
from economic_calendar.timeutils import (
    EUROSTAT_TZ,
    UTC,
    _within,
)

logger = logging.getLogger("econ_calendar_complete")

def _parse_eurostat_json_local_datetime(start_raw: str) -> Tuple[datetime, datetime]:
    """Interpret Eurostat JSON `start` as a Luxembourg wall-clock publication time."""
    normalized = str(start_raw or "").strip()
    if not normalized:
        raise ValueError("Eurostat JSON start is blank")
    parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    local_dt = parsed.replace(tzinfo=None).replace(tzinfo=EUROSTAT_TZ)
    return local_dt, local_dt.astimezone(UTC)


def fetch_eurostat_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch Eurostat events with normalized output."""

    url = "https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics"
    page_url = "https://ec.europa.eu/eurostat/news/release-calendar"
    json_url = "https://ec.europa.eu/eurostat/o/calendars/eventsJson"
    events: List[Event] = []
    ics_total = 0
    path_used = "ics"
    cache_manager = getattr(session, "cache_manager", None)

    try:
        resp, _ = source_sget(
            session,
            "EUROSTAT",
            url,
            timeout=25,
            headers={"Accept": "text/calendar,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"},
            path_hint="ics",
        )
        if resp and resp.ok:
            items = parse_ics_bytes(resp.content, EUROSTAT_TZ, default_hour=11, default_min=0)
            ics_total = len(items)
            for item in items:
                dt_utc = item["dt"].astimezone(UTC)
                dt_local = item["dt"].astimezone(EUROSTAT_TZ)
                if not _within(dt_utc, start_utc, end_utc):
                    continue
                title = re.sub(r"\s+", " ", item["title"]).strip()
                events.append(
                    Event(
                        id=make_id("EU", "EUROSTAT", title, dt_utc),
                        source="Eurostat",
                        agency="EUROSTAT",
                        country="EU",
                        title=title,
                        date_time_utc=dt_utc,
                        event_local_tz="Europe/Luxembourg",
                        impact=classify_event(title),
                        url=item["url"] or url,
                        extras={"release_time_local": dt_local.strftime("%H:%M")},
                    )
                )
        logger.info(f"Eurostat ICS: total={ics_total}, in-window={len(events)}")
    except Exception as e:
        logger.warning(f"Eurostat events fetch failed: {e}")

    if not events:
        try:
            params = {
                "start": (start_utc - timedelta(days=7)).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end": (end_utc + timedelta(days=45)).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "timeZone": "Europe/Luxembourg",
            }
            resp, _ = sget_with_retry(
                session,
                json_url,
                timeout=25,
                headers={
                    "Accept": "application/json,text/plain,*/*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": page_url,
                },
                params=params,
                path_hint="json",
            )
            if resp and resp.ok:
                payload = resp.json()
                for item in payload if isinstance(payload, list) else []:
                    start_raw = str(item.get("start") or "")
                    if not start_raw:
                        continue
                    try:
                        dt_local, dt_utc = _parse_eurostat_json_local_datetime(start_raw)
                    except Exception:
                        continue
                    if not _within(dt_utc, start_utc, end_utc):
                        continue
                    title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()
                    if not title:
                        continue
                    extras = {
                        "release_time_local": dt_local.strftime("%H:%M"),
                        "theme": item.get("theme"),
                        "period": item.get("period"),
                    }
                    if item.get("preliminary") is not None:
                        extras["preliminary"] = bool(item.get("preliminary"))
                    events.append(
                        Event(
                            id=make_id("EU", "EUROSTAT", title, dt_utc),
                            source="EUROSTAT_JSON",
                            agency="EUROSTAT",
                            country="EU",
                            title=title,
                            date_time_utc=dt_utc,
                            event_local_tz="Europe/Luxembourg",
                            impact=classify_event(title),
                            url=page_url,
                            extras=extras,
                        )
                    )
                if events:
                    path_used = "json"
        except Exception:
            logger.debug("Eurostat JSON fallback failed", exc_info=True)

    if events and cache_manager:
        try:
            _persist_lkg("EUROSTAT", events)
        except Exception:
            logger.debug("Eurostat: failed to persist LKG", exc_info=True)

    if not events:
        merged = maybe_merge_lkg("EUROSTAT", [], ttl_days=30, tag="lkg")
        if merged:
            for ev in merged:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
            _finalize_source_log("EUROSTAT", "lkg", len(merged), extra_meta={"ics_total": ics_total})
            return merged

    zero_reason = None if events else ("transport_error" if ics_total == 0 else "parser_error")
    _finalize_source_log("EUROSTAT", path_used if events else "none", len(events), zero_reason=zero_reason, extra_meta={"ics_total": ics_total})
    return events

