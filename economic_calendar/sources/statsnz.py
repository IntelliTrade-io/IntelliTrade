"""Stats NZ calendar fetcher — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import List

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
    _set_fetch_metadata,
)
from economic_calendar.http import (
    source_sget,
)
from economic_calendar.ics import parse_ics_bytes
from economic_calendar.timeutils import (
    UTC,
    WELLINGTON_TZ,
    _within,
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
