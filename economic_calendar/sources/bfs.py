"""Swiss BFS calendar fetcher — moved verbatim from the monolith (plan 6.3).

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

def fetch_bfs_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Swiss CPI releases from BFS agenda widget JSON with LKG fallback."""

    source_key = "BFS"

    page_url = "https://www.bfs.admin.ch/bfs/en/home/statistics/prices/consumer-price-index.html"

    default_api_path = (

        "/content/bfs/en/home/statistiken/preise/landesindex-konsumentenpreise/"

        "jcr:content/root/main/section/container/tabs/item_1730371840759/agendatopic"

    )

    cache_manager = getattr(session, "cache_manager", None)

    events: List[Event] = []

    def _parse_embargo(ts: str) -> Optional[datetime]:

        if not ts:

            return None

        stamp = ts.strip()

        if stamp.endswith("Z"):

            stamp = stamp.replace("Z", "+00:00")

        try:

            parsed = datetime.fromisoformat(stamp)

        except Exception:

            return None

        if parsed.tzinfo is None:

            parsed = parsed.replace(tzinfo=UTC)

        return parsed

    try:

        page_resp, _ = source_sget(session, source_key, page_url, timeout=25, path_hint="dom")

    except Exception:

        page_resp = None

    api_path = default_api_path

    page_body = page_resp.text if page_resp and getattr(page_resp, "ok", False) else ""

    if page_body:

        match = re.search(r'wgl-agenda-topic[^>]+api="([^"]+)"', page_body)

        if match:

            api_path = match.group(1)

    api_path = api_path.strip() or default_api_path

    if not api_path.endswith(".model.json"):

        api_path = f"{api_path}.model.json"

    model_url = urljoin(page_url, api_path)

    try:

        model_resp, _ = source_sget(session, source_key, model_url, timeout=25, path_hint="json")

    except Exception as exc:

        logger.warning("BFS: model fetch failed (%s)", exc)

        model_resp = None

    if model_resp and getattr(model_resp, "ok", False):

        try:

            payload = json.loads(model_resp.text)

        except Exception:

            payload = {}

        items = payload.get("data") or []

        seen_ids: Set[str] = set()

        for entry in items:

            embargo = entry.get("bfs", {}).get("embargo")

            dt_utc = _parse_embargo(embargo)

            if not isinstance(dt_utc, datetime):

                continue

            if not _within(dt_utc, start_utc, end_utc):

                continue

            title = (

                entry.get("description", {}).get("titles", {}).get("main")

                or "Swiss Consumer Price Index"

            ).strip()

            impact = "High" if "consumer price index" in title.lower() else classify_event(title)

            local_dt = dt_utc.astimezone(ZURICH_TZ)

            release_time_local = local_dt.strftime("%H:%M")

            link = page_url

            for candidate_link in entry.get("links") or []:

                href = candidate_link.get("href")

                if href:

                    link = href

                    break

            extras = {

                "release_time_local": release_time_local,

                "discovered_via": "bfs_wgl_model",

                "time_confidence": "exact",

            }

            gnp_id = entry.get("ids", {}).get("gnp")

            if gnp_id:

                extras["gnp_id"] = gnp_id

            eid = make_id("CH", "BFS", title, dt_utc)

            if eid in seen_ids:

                continue

            seen_ids.add(eid)

            events.append(

                Event(

                    id=eid,

                    source="BFS",

                    agency="BFS",

                    country="CH",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/Zurich",

                    impact=impact,

                    url=link,

                    extras=extras,

                )

            )

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        if cache_manager:

            try:

                _persist_lkg(source_key, events)

            except Exception:

                logger.debug("BFS: failed to persist LKG", exc_info=True)

        _finalize_source_log(source_key, "dom", len(events))

        return events

    merged: List[Event] = []

    if cache_manager:

        try:

            merged = maybe_merge_lkg(source_key, [], ttl_days=120, tag="lkg")

        except Exception:

            logger.debug("BFS: LKG merge failed", exc_info=True)

    if merged:

        for ev in merged:

            extras = dict(ev.extras or {})

            extras.update({"cached": True, "discovered_via": "lkg"})

            ev.extras = extras

        logger.info("BFS LKG_MERGE: %d", len(merged))

        _finalize_source_log(source_key, "lkg", len(merged))

        return merged

    zero_reason = (

        "BFS: CPI agenda widget returned no release dates; DOM or JSON likely changed."

        if model_resp

        else "BFS: unable to fetch CPI agenda widget JSON."

    )

    _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)

    if _ec_runstate.DEBUG_ZERO_FLAG:

        snapshot = page_body or (model_resp.text if model_resp else "no HTTP body")

        write_zero_snapshot(source_key, snapshot, label="none")

    return []

