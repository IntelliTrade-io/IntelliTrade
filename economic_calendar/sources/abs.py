"""Australia ABS calendar fetcher — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import List, Set
from urllib.parse import urljoin

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
from economic_calendar.http import (
    source_sget,
)
from economic_calendar.timeutils import (
    SYDNEY_TZ,
    UTC,
    _month_year_iter,
    _within,
    ensure_aware,
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

