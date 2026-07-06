"""US BLS fetchers: ICS, official-HTML reconcile, curated fallback, diagnostics — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import calendar
import os
import random
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
from economic_calendar import health as _ec_health
from economic_calendar.curated import (
    _curated_fallback_info,
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
    CircuitBreaker,
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
from economic_calendar.sources.us_curated import _curated_us_event, _iter_local_month_starts, _shift_local_business_date

def _fetch_ics_with_retry(
    session: requests.Session,
    urls,
    *,
    breaker: Optional[CircuitBreaker] = None,
    path_hint: str = "ics",
) -> Optional[requests.Response]:

    """Fetch ICS with retry logic across mirrors and randomized headers."""

    if isinstance(urls, str):

        candidates = [urls]

    else:

        candidates = [u for u in urls if u]

    if not candidates:

        return None

    seen = set()

    ordered_candidates = []

    for candidate in candidates:

        if candidate not in seen:

            ordered_candidates.append(candidate)

            seen.add(candidate)

    ua_pool = [

        DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0"),

        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",

        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",

    ]

    ref_pool = ["https://www.bls.gov/", "https://www.google.com/", "https://www.bing.com/"]

    for attempt in range(3):

        headers = {

            "User-Agent": random.choice(ua_pool),

            "Referer": random.choice(ref_pool),

            "Accept": "text/calendar,text/plain;q=0.9,application/octet-stream;q=0.8,*/*;q=0.7",

            "Accept-Language": "en-US,en;q=0.9",

            "Upgrade-Insecure-Requests": "1",

        }

        try:

            resp = sget_retry_alt(
                session,
                ordered_candidates,
                headers=headers,
                tries=1,
                timeout=25,
                breaker=breaker,
                path_hint=path_hint,
            )

        except Exception:

            resp = None

        if resp and getattr(resp, "ok", False):

            content_type = (resp.headers.get("Content-Type", "") or "").split(";", 1)[0].strip().lower()

            content = resp.content or b""

            normalized = content.lstrip(b"\xef\xbb\xbf \t\r\n")

            if content_type == "text/calendar" or b"BEGIN:VCALENDAR" in content or b"BEGIN:VCALENDAR" in normalized:

                return resp

        time.sleep(0.8 + attempt * 0.5 + random.uniform(0, 0.6))

    logger.warning(f"BLS: failed to fetch ICS after retries: {', '.join(ordered_candidates)}")

    return None

def fetch_bls_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch BLS events through reconciled official schedules, curated fallback, and LKG."""
    cache_manager = getattr(session, "cache_manager", None)
    as_of_utc = _now_utc()

    live_candidates, source_status, raw_pages = _fetch_bls_live_candidates(session, start_utc, end_utc)
    curated_candidates = _bls_curated_candidates(start_utc, end_utc)
    required_keys = sorted({str(candidate["canonical_key"]) for candidate in curated_candidates})
    lkg_candidates: List[Dict[str, Any]] = []
    if cache_manager:
        lkg_candidates = _load_bls_lkg_candidates(cache_manager, start_utc, end_utc)

    all_candidates = live_candidates + curated_candidates + lkg_candidates
    events, bls_health = _reconcile_bls_candidates(
        all_candidates,
        required_keys=required_keys,
        source_status=source_status,
        as_of_utc=as_of_utc,
    )

    snapshot_warnings = _write_bls_snapshots(raw_pages, all_candidates, events, source_status, as_of_utc)
    for warning in snapshot_warnings:
        _append_unique_local(bls_health.setdefault("warnings", []), warning)

    if bls_health.get("curated_fallback_used"):
        logger.warning(
            "BLS curated official-date fallback active: %d event(s); live official source coverage incomplete",
            sum(1 for ev in events if (ev.extras or {}).get("source_reliability") == "curated"),
        )
    if bls_health.get("source_conflicts"):
        logger.warning("BLS official/curated source conflicts: %s", "; ".join(bls_health["source_conflicts"]))

    official_event_count = sum(
        1 for ev in events if (ev.extras or {}).get("source_reliability") == "official"
    )
    curated_event_count = sum(
        1 for ev in events if (ev.extras or {}).get("source_reliability") == "curated"
    )
    if official_event_count:
        path_used = "official"
    elif curated_event_count:
        path_used = "curated"
    elif events:
        path_used = "lkg"
    else:
        path_used = "none"

    if events and cache_manager and official_event_count:
        try:
            _persist_lkg("BLS", events)
        except Exception:
            logger.debug("BLS: failed to persist LKG", exc_info=True)

    zero_reason = None if events else "missing_required_bls_events"
    RUN_CONTEXT["bls_health"] = bls_health
    _finalize_source_log(
        "BLS",
        path_used,
        len(events),
        zero_reason=zero_reason,
        extra_meta={
            "ics_total": int(source_status.get("ics_total", 0) or 0),
            "live_source_failed": not bool(source_status.get("live_sources_succeeded")),
            "bls_health": bls_health,
            "bls_required_missing": bls_health.get("required_missing", []),
            "bls_source_conflicts": bls_health.get("source_conflicts", []),
            "bls_alert_severity": bls_health.get("alert_severity"),
        },
    )

    return events

def _bls_candidate(
    canonical_key: str,
    dt_utc: datetime,
    *,
    source_path: str,
    source_url: str,
    release_title_raw: str,
    confidence: str,
    source_reliability: str,
) -> Dict[str, Any]:
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=UTC)
    spec = BLS_CANONICAL_SPECS[canonical_key]
    return {
        "canonical_key": canonical_key,
        "canonical_title": spec["title"],
        "source_path": source_path,
        "source_url": source_url or spec["url"],
        "date_time_utc": dt_utc.astimezone(UTC),
        "release_title_raw": _normalize_metadata_text(release_title_raw or spec["title"]),
        "confidence": confidence,
        "source_reliability": source_reliability,
    }


def _bls_candidate_for_event(ev: Event, source_path: str = "lkg") -> Optional[Dict[str, Any]]:
    extras = dict(ev.extras or {})
    canonical_key = extras.get("bls_canonical_key") or _bls_canonical_key_from_text(ev.title)
    if canonical_key not in BLS_CANONICAL_SPECS:
        return None
    return _bls_candidate(
        str(canonical_key),
        ev.date_time_utc,
        source_path=source_path,
        source_url=ev.url,
        release_title_raw=ev.title,
        confidence="tentative",
        source_reliability="last_known_good",
    )


def _bls_candidate_json(candidate: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(candidate)
    dt = data.get("date_time_utc")
    if isinstance(dt, datetime):
        data["date_time_utc"] = dt.astimezone(UTC).isoformat()
    return data


def _bls_candidate_dt(candidate: Dict[str, Any]) -> datetime:
    dt = candidate.get("date_time_utc")
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    parsed = datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _bls_event_from_candidate(
    selected: Dict[str, Any],
    all_candidates: List[Dict[str, Any]],
    *,
    schedule_confidence: str,
    post_release_status: str,
) -> Event:
    canonical_key = str(selected["canonical_key"])
    spec = BLS_CANONICAL_SPECS[canonical_key]
    dt_utc = _bls_candidate_dt(selected).astimezone(UTC)
    extras = {
        "release_time_local": dt_utc.astimezone(NEW_YORK_TZ).strftime("%H:%M"),
        "time_confidence": "exact" if schedule_confidence in {"high", "medium_high"} else "tentative",
        "discovered_via": selected.get("source_path"),
        "source_hint": selected.get("source_reliability"),
        "source_reliability": selected.get("source_reliability"),
        "bls_canonical_key": canonical_key,
        "bls_candidates": [_bls_candidate_json(candidate) for candidate in all_candidates],
        "bls_selected_source_path": selected.get("source_path"),
        "schedule_confidence": schedule_confidence,
        "post_release_status": post_release_status,
        "category": spec["category"],
        "trader_relevance_score": spec["score"],
        "default_dashboard": True,
        "official_schedule_url": selected.get("source_url") or spec["url"],
    }
    if selected.get("source_reliability") == "curated":
        info = _curated_fallback_info("BLS")
        if info:
            extras.update(
                {
                    "curated_fallback_reviewed_at": info["reviewed_at"],
                    "curated_fallback_age_days": info["age_days"],
                    "curated_fallback_max_age_days": info["max_age_days"],
                }
            )
        extras["fallback_reason"] = "BLS live official schedule unavailable, empty, or not reconciled"
    if selected.get("source_reliability") == "last_known_good":
        extras["cached"] = True
    return Event(
        id=make_id("US", "BLS", spec["title"], dt_utc),
        source="BLS_" + str(selected.get("source_path") or "SELECTED").upper().replace("-", "_"),
        agency="BLS",
        country="US",
        title=spec["title"],
        date_time_utc=dt_utc,
        event_local_tz="America/New_York",
        impact=str(spec["impact"]),
        url=str(selected.get("source_url") or spec["url"]),
        extras=extras,
    )


def _bls_curated_candidates(start_utc: datetime, end_utc: datetime) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    overridden_months: Set[Tuple[str, int, int]] = set()
    for canonical_key, values in BLS_CURATED_OFFICIAL_DATE_OVERRIDES.items():
        spec = BLS_CANONICAL_SPECS[canonical_key]
        for value in values:
            dt_utc = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            local_dt = dt_utc.astimezone(NEW_YORK_TZ)
            overridden_months.add((canonical_key, local_dt.year, local_dt.month))
            candidates.append(
                _bls_candidate(
                    canonical_key,
                    dt_utc,
                    source_path="curated",
                    source_url=str(spec["url"]),
                    release_title_raw=str(spec["title"]),
                    confidence="tentative",
                    source_reliability="curated",
                )
            )
    for cursor in _iter_local_month_starts(start_utc, end_utc, NEW_YORK_TZ):
        for canonical_key, spec in BLS_CANONICAL_SPECS.items():
            if (canonical_key, cursor.year, cursor.month) in overridden_months:
                continue
            date_rule = spec.get("rule")
            if not callable(date_rule):
                continue
            try:
                local_dt = date_rule(cursor.year, cursor.month)
            except Exception:
                local_dt = None
            if local_dt is None:
                continue
            if local_dt.tzinfo is None:
                local_dt = ensure_aware(local_dt, NEW_YORK_TZ, local_dt.hour or 8, local_dt.minute or 30)
            dt_utc = local_dt.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            candidates.append(
                _bls_candidate(
                    canonical_key,
                    dt_utc,
                    source_path="curated",
                    source_url=str(spec["url"]),
                    release_title_raw=str(spec["title"]),
                    confidence="tentative",
                    source_reliability="curated",
                )
            )
    return candidates


def _fetch_bls_curated_fallback(start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Official BLS release-series fallback when live ICS/HTML schedule retrieval is blocked."""
    events: List[Event] = []
    for candidate in _bls_curated_candidates(start_utc, end_utc):
        events.append(
            _bls_event_from_candidate(
                candidate,
                [candidate],
                schedule_confidence="tentative",
                post_release_status=verify_bls_release_published(str(candidate["canonical_key"]), _bls_candidate_dt(candidate)),
            )
        )
    events.sort(key=lambda ev: ev.date_time_utc)
    return events


def _append_unique_local(bucket: List[str], value: str) -> None:
    if value and value not in bucket:
        bucket.append(value)


def _bls_official_source_specs(start_utc: datetime, end_utc: datetime) -> List[Dict[str, str]]:
    local_start = start_utc.astimezone(NEW_YORK_TZ)
    local_end = end_utc.astimezone(NEW_YORK_TZ)
    specs: List[Dict[str, str]] = [
        {"source_path": "current_schedule", "url": "https://www.bls.gov/schedule/"},
        {"source_path": "ics", "url": "https://www.bls.gov/schedule/news_release/bls.ics"},
        {"source_path": "ics", "url": "https://download.bls.gov/pub/time.series/bls/blsrelease.ics"},
        {"source_path": "ics", "url": "https://download.bls.gov/pub/time.series/bls/bls.ics"},
    ]
    years = range(local_start.year, local_end.year + 1)
    for year in years:
        specs.append({"source_path": "annual_schedule", "url": f"https://www.bls.gov/schedule/{year}/home.htm"})
        specs.append({"source_path": "annual_schedule", "url": f"https://www.bls.gov/schedule/{year}/"})
    for cursor in _iter_local_month_starts(start_utc, end_utc, NEW_YORK_TZ):
        specs.append({"source_path": "monthly_schedule", "url": f"https://www.bls.gov/schedule/{cursor.year}/{cursor.month:02d}_sched.htm"})
        specs.append({"source_path": "monthly_list_schedule", "url": f"https://www.bls.gov/schedule/{cursor.year}/{cursor.month:02d}_sched_list.htm"})
    for canonical_key, spec in BLS_CANONICAL_SPECS.items():
        specs.append({"source_path": f"release_specific:{canonical_key}", "url": str(spec["url"])})
    deduped: List[Dict[str, str]] = []
    seen: set[str] = set()
    for spec in specs:
        url = spec["url"]
        if url in seen:
            continue
        seen.add(url)
        deduped.append(spec)
    return deduped


def _bls_page_month_year(url: str, soup: Any) -> Tuple[Optional[int], Optional[int]]:
    title = soup.title.get_text(" ", strip=True) if soup and getattr(soup, "title", None) else ""
    haystack = f"{url} {title}"
    month_url = re.search(r"/schedule/(20\d{2})/(\d{2})_sched", url)
    if month_url:
        return int(month_url.group(1)), int(month_url.group(2))
    month_text = re.search(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})",
        haystack,
        re.I,
    )
    if month_text:
        month = month_to_num(month_text.group(1))
        if month:
            return int(month_text.group(2)), month
    year_text = re.search(r"/schedule/(20\d{2})/", url)
    if year_text:
        return int(year_text.group(1)), None
    return None, None


def _bls_time_from_text(text: str, default_hour: int = 8, default_minute: int = 30) -> Tuple[int, int]:
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|AM|PM)", text or "", re.I)
    if not match:
        return default_hour, default_minute
    hour = int(match.group(1)) % 12
    minute = int(match.group(2) or default_minute)
    if match.group(3).lower().startswith("p"):
        hour += 12
    return max(0, min(23, hour)), max(0, min(59, minute))


def _extract_bls_datetimes_from_text(text: str, page_year: Optional[int] = None) -> List[datetime]:
    values: List[datetime] = []
    seen: set[Tuple[int, int, int, int, int]] = set()
    month_names = "|".join(MONTHS)
    patterns = [
        re.compile(
            rf"(?P<mon>{month_names})\s+(?P<day>\d{{1,2}})(?:,)?\s+(?P<year>20\d{{2}})(?P<trail>[^.;\n]{{0,80}})",
            re.I,
        ),
        re.compile(
            r"(?P<mon>\d{1,2})/(?P<day>\d{1,2})/(?P<year>20\d{2})(?P<trail>[^.;\n]{0,80})",
            re.I,
        ),
    ]
    for pattern in patterns:
        for match in pattern.finditer(text or ""):
            try:
                if match.group("mon").isdigit():
                    month = int(match.group("mon"))
                else:
                    month = month_to_num(match.group("mon")) or 0
                day = int(match.group("day"))
                year = int(match.group("year") or page_year or 0)
                hour, minute = _bls_time_from_text(match.groupdict().get("trail") or text)
                local_dt = ensure_aware(datetime(year, month, day, hour, minute), NEW_YORK_TZ, hour, minute)
                key = (year, month, day, hour, minute)
                if key in seen:
                    continue
                seen.add(key)
                values.append(local_dt.astimezone(UTC))
            except Exception:
                continue
    return values


def _parse_bls_official_html(
    html: str,
    url: str,
    source_path: str,
    start_utc: datetime,
    end_utc: datetime,
) -> List[Dict[str, Any]]:
    if not BeautifulSoup or not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    page_year, page_month = _bls_page_month_year(url, soup)
    candidates: List[Dict[str, Any]] = []
    seen: set[Tuple[str, str, str]] = set()

    def _add(canonical_key: str, dt_utc: datetime, text: str, source_url: str) -> None:
        if not _within(dt_utc, start_utc, end_utc):
            return
        key = (canonical_key, dt_utc.astimezone(UTC).isoformat(timespec="minutes"), source_path)
        if key in seen:
            return
        seen.add(key)
        candidates.append(
            _bls_candidate(
                canonical_key,
                dt_utc,
                source_path=source_path,
                source_url=source_url or url,
                release_title_raw=text,
                confidence="medium_high",
                source_reliability="official",
            )
        )

    for cell in soup.select("table.release-calendar td[id^='d'], table.release-calendar td"):
        day_tag = cell.select_one("p.day")
        if not day_tag or not page_year or not page_month:
            continue
        day_text = day_tag.get_text(" ", strip=True)
        if not day_text.isdigit():
            continue
        day = int(day_text)
        cell_id = cell.get("id") or ""
        cell_month = page_month
        cell_year = page_year
        id_match = re.fullmatch(r"d(\d{2})(\d{2})", cell_id)
        if id_match:
            cell_month = int(id_match.group(1))
            day = int(id_match.group(2))
            if page_month and cell_month < page_month:
                cell_year += 1
        for block in [p for p in cell.find_all("p") if "day" not in (p.get("class") or [])]:
            text = block.get_text(" ", strip=True)
            canonical_key = _bls_canonical_key_from_text(text)
            if canonical_key not in BLS_CANONICAL_SPECS:
                continue
            hour, minute = _bls_time_from_text(text)
            try:
                local_dt = ensure_aware(datetime(cell_year, cell_month, day, hour, minute), NEW_YORK_TZ, hour, minute)
            except Exception:
                continue
            anchor = block.find("a", href=True) or cell.find("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor else url
            _add(str(canonical_key), local_dt.astimezone(UTC), text, href)

    nodes = soup.select("table tr, li, p, div, section, a[href]")
    for node in nodes:
        text = node.get_text(" ", strip=True) if hasattr(node, "get_text") else ""
        canonical_key = _bls_canonical_key_from_text(text)
        if canonical_key not in BLS_CANONICAL_SPECS:
            continue
        datetimes = _extract_bls_datetimes_from_text(text, page_year)
        if not datetimes:
            continue
        anchor = node if getattr(node, "name", "") == "a" else node.find("a", href=True) if hasattr(node, "find") else None
        href = urljoin(url, anchor.get("href")) if anchor and anchor.get("href") else url
        for dt_utc in datetimes:
            _add(str(canonical_key), dt_utc, text, href)

    candidates.sort(key=lambda candidate: (str(candidate["canonical_key"]), _bls_candidate_dt(candidate)))
    return candidates


def _parse_bls_ics_candidates(content: bytes, source_url: str, start_utc: datetime, end_utc: datetime) -> Tuple[List[Dict[str, Any]], int]:
    candidates: List[Dict[str, Any]] = []
    total = 0
    for item in parse_ics_bytes(content, NEW_YORK_TZ, default_hour=8, default_min=30):
        total += 1
        canonical_key = _bls_canonical_key_from_text(str(item.get("title") or ""))
        if canonical_key not in BLS_CANONICAL_SPECS:
            continue
        dt_utc = item["dt"].astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        candidates.append(
            _bls_candidate(
                str(canonical_key),
                dt_utc,
                source_path="ics",
                source_url=item.get("url") or source_url,
                release_title_raw=str(item.get("title") or BLS_CANONICAL_SPECS[str(canonical_key)]["title"]),
                confidence="medium_high",
                source_reliability="official",
            )
        )
    return candidates, total


def _bls_page_zero_warning(source_path: str, url: str, status_code: int, parsed_count: int) -> str:
    if int(status_code or 0) == 200 and int(parsed_count or 0) == 0:
        return f"BLS page returned 200 but parsed zero events: {source_path} {url}"
    return ""


BLS_DESCRIPTIVE_USER_AGENT = "IntelliTrade Economic Calendar Bot/1.0 (+https://intellitrade.tech)"
BLS_REQUEST_BACKOFF_BASE_SECONDS = 0.25
BLS_REQUEST_BACKOFF_CAP_SECONDS = 1.0
BLS_DEBUG_ENVIRONMENT_NOTE = (
    "If BLS returns 403 here but works in browser/curl from another environment, "
    "this is likely runtime/IP/header blocking."
)


def _bls_request_headers() -> Dict[str, str]:
    return {
        "User-Agent": BLS_DESCRIPTIVE_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }


def _bls_safe_request_headers(headers: Dict[str, str]) -> Dict[str, str]:
    sensitive = {"authorization", "cookie", "x-api-key"}
    return {key: value for key, value in (headers or {}).items() if key.lower() not in sensitive}


def _bls_uses_descriptive_user_agent(headers: Dict[str, str]) -> bool:
    return str((headers or {}).get("User-Agent") or "") == BLS_DESCRIPTIVE_USER_AGENT


def _bls_polite_backoff(index: int, *, base_seconds: float = BLS_REQUEST_BACKOFF_BASE_SECONDS) -> None:
    if base_seconds <= 0:
        return
    delay = min(BLS_REQUEST_BACKOFF_CAP_SECONDS, base_seconds * (2 ** min(max(index, 0), 2)))
    time.sleep(delay)


def _bls_suggested_next_action(response_kind: str, status_code: Optional[int]) -> str:
    if response_kind == "blocked" or int(status_code or 0) in {403, 429, 503}:
        return "official live source blocked; try alternate runtime/IP; fallback remains active"
    if response_kind == "empty":
        return "empty response; fallback remains active"
    if response_kind in {"html", "ics"}:
        return "official live source reachable; inspect parser_count"
    return "unknown response; fallback remains active"


def _safe_preview_text(content: bytes, limit: int = 300) -> str:
    text = (content or b"").decode("utf-8", errors="ignore")
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _classify_bls_debug_response(content: bytes, content_type: str, status_code: int) -> str:
    size = len(content or b"")
    if size == 0:
        return "empty"
    sample = (content or b"")[:4096].decode("utf-8", errors="ignore").lower()
    ctype = (content_type or "").lower()
    if status_code in {403, 429, 503} or any(token in sample for token in ("access denied", "forbidden", "captcha", "akamai", "blocked")):
        return "blocked"
    if "text/calendar" in ctype or "begin:vcalendar" in sample:
        return "ics"
    if "html" in ctype or "<html" in sample or "<!doctype html" in sample:
        return "html"
    return "unknown"


def _diagnose_bls_url(
    session: requests.Session,
    source_path: str,
    url: str,
    start_utc: datetime,
    end_utc: datetime,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "source_path": source_path,
        "url": url,
        "http_status": None,
        "final_url": None,
        "content_type": "",
        "response_size_bytes": 0,
        "response_kind": "empty",
        "preview": "",
        "parser_candidate_count": 0,
        "parser_error": "",
        "request_headers_used": {},
        "descriptive_user_agent_used": False,
        "suggested_next_action": "",
    }
    headers = _bls_request_headers()
    result["request_headers_used"] = _bls_safe_request_headers(headers)
    result["descriptive_user_agent_used"] = _bls_uses_descriptive_user_agent(headers)
    try:
        resp = session.get(url, headers=headers, timeout=20, allow_redirects=True)
    except Exception as exc:
        result["response_kind"] = "blocked"
        result["parser_error"] = f"transport_error: {exc}"
        result["suggested_next_action"] = _bls_suggested_next_action("blocked", None)
        return result

    content = getattr(resp, "content", b"") or b""
    content_type = (getattr(resp, "headers", {}) or {}).get("Content-Type", "")
    status_code = int(getattr(resp, "status_code", 0) or 0)
    final_url = getattr(resp, "url", None) or url
    result.update(
        {
            "http_status": status_code,
            "final_url": final_url,
            "content_type": content_type,
            "response_size_bytes": len(content),
            "response_kind": _classify_bls_debug_response(content, content_type, status_code),
            "preview": _safe_preview_text(content, 300),
        }
    )
    result["suggested_next_action"] = _bls_suggested_next_action(str(result["response_kind"]), status_code)
    try:
        if result["response_kind"] == "ics" or source_path == "ics":
            candidates, _ = _parse_bls_ics_candidates(content, final_url, start_utc, end_utc)
        elif result["response_kind"] == "html":
            text = getattr(resp, "text", None)
            if text is None:
                text = content.decode("utf-8", errors="ignore")
            candidates = _parse_bls_official_html(text, final_url, source_path, start_utc, end_utc)
        else:
            candidates = []
        result["parser_candidate_count"] = len(candidates)
    except Exception as exc:
        result["parser_error"] = f"parser_error: {exc}"
    return result


def run_bls_debug_diagnostics(
    session: requests.Session,
    start_utc: datetime,
    end_utc: datetime,
    *,
    out_dir: Optional[Path] = None,
    backoff_seconds: float = BLS_REQUEST_BACKOFF_BASE_SECONDS,
) -> Tuple[Path, Dict[str, Any]]:
    diagnostics: List[Dict[str, Any]] = []
    print(f"BLS_DEBUG_NOTE {BLS_DEBUG_ENVIRONMENT_NOTE}")
    specs = _bls_official_source_specs(start_utc, end_utc)
    for idx, spec in enumerate(specs):
        row = _diagnose_bls_url(session, spec["source_path"], spec["url"], start_utc, end_utc)
        diagnostics.append(row)
        print(
            "BLS_DEBUG "
            f"source_path={row['source_path']} "
            f"url={row['url']} "
            f"status={row['http_status']} "
            f"final_url={row['final_url']} "
            f"content_type={row['content_type']} "
            f"bytes={row['response_size_bytes']} "
            f"kind={row['response_kind']} "
            f"descriptive_user_agent={row['descriptive_user_agent_used']} "
            f"parser_count={row['parser_candidate_count']} "
            f"parser_error={row['parser_error'] or 'none'} "
            f"next_action=\"{row['suggested_next_action']}\""
        )
        print(f"BLS_DEBUG_HEADERS {json.dumps(row['request_headers_used'], ensure_ascii=False, sort_keys=True)}")
        if row.get("preview"):
            print(f"BLS_DEBUG_PREVIEW {row['preview']}")
        if idx < len(specs) - 1:
            _bls_polite_backoff(idx, base_seconds=backoff_seconds)
    payload = {
        "generated_at_utc": _now_utc().isoformat(),
        "environment_note": BLS_DEBUG_ENVIRONMENT_NOTE,
        "window": {
            "start_utc": start_utc.isoformat(),
            "end_utc": end_utc.isoformat(),
        },
        "urls": diagnostics,
    }
    target_root = Path(out_dir or _ec_health._OUT_DIR) / "diagnostics"
    target_root.mkdir(parents=True, exist_ok=True)
    stamp = _now_utc().strftime("%Y%m%d_%H%M%S")
    target = target_root / f"bls_debug_{stamp}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"BLS_DEBUG_WRITTEN {target}")
    return target, payload


def _fetch_bls_live_candidates(
    session: requests.Session,
    start_utc: datetime,
    end_utc: datetime,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[Dict[str, str]]]:
    candidates: List[Dict[str, Any]] = []
    raw_pages: List[Dict[str, str]] = []
    status: Dict[str, Any] = {
        "live_sources_attempted": [],
        "live_sources_succeeded": [],
        "live_sources_failed": [],
        "warnings": [],
        "page_event_counts": {},
        "ics_total": 0,
    }
    html_headers = _bls_request_headers()
    status["request_headers_used"] = _bls_safe_request_headers(html_headers)
    status["descriptive_user_agent_used"] = _bls_uses_descriptive_user_agent(html_headers)
    specs = _bls_official_source_specs(start_utc, end_utc)
    for idx, spec in enumerate(specs):
        source_path = spec["source_path"]
        url = spec["url"]
        status["live_sources_attempted"].append(url)
        try:
            resp = sget_retry_alt(
                session,
                [url],
                headers=html_headers,
                tries=1,
                timeout=15,
                breaker=get_source_breaker("BLS"),
                path_hint="ics" if source_path == "ics" else "html",
            )
        except Exception as exc:
            status["live_sources_failed"].append({"url": url, "source_path": source_path, "reason": str(exc)})
            if idx < len(specs) - 1:
                _bls_polite_backoff(idx)
            continue
        if not (resp and getattr(resp, "ok", False)):
            status["live_sources_failed"].append(
                {"url": url, "source_path": source_path, "reason": f"http_{getattr(resp, 'status_code', 'none')}"}
            )
            if idx < len(specs) - 1:
                _bls_polite_backoff(idx)
            continue
        page_url = getattr(resp, "url", None) or url
        content = resp.content or b""
        parsed: List[Dict[str, Any]] = []
        if source_path == "ics" or b"BEGIN:VCALENDAR" in content[:2048]:
            parsed, ics_total = _parse_bls_ics_candidates(content, page_url, start_utc, end_utc)
            status["ics_total"] = int(status.get("ics_total", 0) or 0) + int(ics_total or 0)
            raw_text = content.decode("utf-8", errors="ignore")
        else:
            raw_text = resp.text or content.decode("utf-8", errors="ignore")
            parsed = _parse_bls_official_html(raw_text, page_url, source_path, start_utc, end_utc)
        raw_pages.append({"url": page_url, "source_path": source_path, "text": raw_text})
        status["live_sources_succeeded"].append({"url": page_url, "source_path": source_path, "parsed_count": len(parsed)})
        status["page_event_counts"][page_url] = len(parsed)
        warning = _bls_page_zero_warning(source_path, page_url, int(getattr(resp, "status_code", 0) or 0), len(parsed))
        if warning:
            status["warnings"].append(warning)
        candidates.extend(parsed)
        if idx < len(specs) - 1:
            _bls_polite_backoff(idx)
    deduped: List[Dict[str, Any]] = []
    seen: set[Tuple[str, str, str, str]] = set()
    for candidate in candidates:
        key = (
            str(candidate["canonical_key"]),
            _bls_candidate_dt(candidate).isoformat(timespec="minutes"),
            str(candidate.get("source_path")),
            str(candidate.get("source_url")),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped, status, raw_pages


def _load_bls_lkg_candidates(cache_manager: EnhancedCacheManager, start_utc: datetime, end_utc: datetime) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    try:
        lkg_events = maybe_merge_lkg("BLS", [], ttl_days=14, tag="lkg")
    except Exception:
        logger.debug("BLS: LKG candidate load failed", exc_info=True)
        lkg_events = []
    for ev in lkg_events or []:
        if not _within(ev.date_time_utc, start_utc, end_utc):
            continue
        candidate = _bls_candidate_for_event(ev, source_path="lkg")
        if candidate:
            candidates.append(candidate)
    return candidates


def _same_bls_release_time(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    return _bls_candidate_dt(left).isoformat(timespec="minutes") == _bls_candidate_dt(right).isoformat(timespec="minutes")


def _select_bls_official_candidate(candidates: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], str]:
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for candidate in candidates:
        key = _bls_candidate_dt(candidate).isoformat(timespec="minutes")
        buckets.setdefault(key, []).append(candidate)
    best_key = sorted(buckets, key=lambda key: (-len(buckets[key]), key))[0]
    confidence = "high" if len(buckets[best_key]) >= 2 else "medium_high"
    return sorted(buckets[best_key], key=lambda c: str(c.get("source_path") or ""))[0], confidence


def _group_bls_candidates_by_time(candidates: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for candidate in candidates:
        key = _bls_candidate_dt(candidate).isoformat(timespec="minutes")
        buckets.setdefault(key, []).append(candidate)
    return [buckets[key] for key in sorted(buckets)]


def _match_bls_curated_occurrences(
    official_selected: List[Dict[str, Any]],
    curated: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Pair curated estimates to official occurrences without crossing release months blindly."""
    available = list(curated)
    matches: Dict[str, Dict[str, Any]] = {}

    # Reserve exact matches before considering nearest estimates. This prevents
    # an unusual late-month release from consuming the next month's exact match.
    for selected in official_selected:
        selected_key = _bls_candidate_dt(selected).isoformat(timespec="minutes")
        exact = next((candidate for candidate in available if _same_bls_release_time(selected, candidate)), None)
        if exact is not None:
            matches[selected_key] = exact
            available.remove(exact)

    for selected in official_selected:
        selected_key = _bls_candidate_dt(selected).isoformat(timespec="minutes")
        if selected_key in matches or not available:
            continue
        closest = min(available, key=lambda candidate: abs(_bls_candidate_dt(candidate) - _bls_candidate_dt(selected)))
        if abs(_bls_candidate_dt(closest) - _bls_candidate_dt(selected)) <= timedelta(days=14):
            matches[selected_key] = closest
            available.remove(closest)
    return matches


def verify_bls_release_published(
    canonical_key: str,
    release_time_utc: datetime,
    *,
    session: Optional[requests.Session] = None,
    enabled: Optional[bool] = None,
    as_of_utc: Optional[datetime] = None,
) -> str:
    """Best-effort BLS API post-release check; disabled unless explicitly enabled."""
    now = as_of_utc or _now_utc()
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    release_dt = release_time_utc if release_time_utc.tzinfo else release_time_utc.replace(tzinfo=UTC)
    if now < release_dt:
        return "not_due"
    if enabled is None:
        enabled = str(os.getenv("BLS_POST_RELEASE_VERIFY", "")).strip().lower() in {"1", "true", "yes"}
    if not enabled:
        return "unknown"
    spec = BLS_CANONICAL_SPECS.get(canonical_key)
    series_id = str((spec or {}).get("api_series_id") or "")
    if not series_id:
        return "unknown"
    client = session or requests.Session()
    try:
        resp = client.get(BLS_API_V2_SINGLE_SERIES_URL.format(series_id=series_id), timeout=10)
        if not getattr(resp, "ok", False):
            return "unknown"
        payload = resp.json()
        series = ((payload.get("Results") or {}).get("series") or [])
        data = series[0].get("data") if series and isinstance(series[0], dict) else []
        return "published" if data else "not_yet_updated"
    except Exception:
        return "unknown"


def _reconcile_bls_candidates(
    candidates: List[Dict[str, Any]],
    *,
    required_keys: Optional[List[str]] = None,
    source_status: Optional[Dict[str, Any]] = None,
    as_of_utc: Optional[datetime] = None,
) -> Tuple[List[Event], Dict[str, Any]]:
    as_of = as_of_utc or _now_utc()
    by_key: Dict[str, List[Dict[str, Any]]] = {}
    for candidate in candidates:
        key = str(candidate.get("canonical_key") or "")
        if key in BLS_CANONICAL_SPECS:
            by_key.setdefault(key, []).append(candidate)
    required = sorted(set(required_keys or by_key.keys()))
    selected_events: List[Event] = []
    warnings: List[str] = list((source_status or {}).get("warnings") or [])
    conflicts: List[str] = []
    missing_required: List[str] = []
    stale_required: List[str] = []
    required_present: Dict[str, bool] = {}
    curated_used = False
    curated_fresh = True

    for canonical_key in required:
        key_candidates = by_key.get(canonical_key, [])
        official = [c for c in key_candidates if c.get("source_reliability") == "official"]
        curated = [c for c in key_candidates if c.get("source_reliability") == "curated"]
        lkg = [c for c in key_candidates if c.get("source_reliability") == "last_known_good"]
        selections: List[Tuple[Dict[str, Any], str, List[Dict[str, Any]]]] = []
        if official:
            official_groups = _group_bls_candidates_by_time(official)
            official_selected = [_select_bls_official_candidate(group)[0] for group in official_groups]
            curated_matches = _match_bls_curated_occurrences(official_selected, curated)
            for group in official_groups:
                selected, confidence = _select_bls_official_candidate(group)
                occurrence_candidates = list(group)
                curated_candidate = curated_matches.get(_bls_candidate_dt(selected).isoformat(timespec="minutes"))
                if curated_candidate is not None:
                    occurrence_candidates.append(curated_candidate)
                    if not _same_bls_release_time(selected, curated_candidate):
                        message = (
                            f"{canonical_key} official {_bls_candidate_dt(selected).isoformat()} "
                            f"conflicts with curated {_bls_candidate_dt(curated_candidate).isoformat()}"
                        )
                        conflicts.append(message)
                        warnings.append("BLS official live source conflicts with curated fallback: " + message)
                occurrence_candidates.extend(candidate for candidate in lkg if _same_bls_release_time(selected, candidate))
                selections.append((selected, confidence, occurrence_candidates))
        elif curated:
            info = _curated_fallback_info("BLS", as_of)
            curated_fresh = bool(info and info.get("fresh"))
            curated_used = True
            if not curated_fresh:
                stale_required.append(canonical_key)
                warnings.append(f"BLS stale curated fallback for required event: {canonical_key}")
            for group in _group_bls_candidates_by_time(curated):
                selections.append((sorted(group, key=_bls_candidate_dt)[0], "tentative", group))
        elif lkg:
            warnings.append(f"BLS using LKG schedule candidate for required event: {canonical_key}")
            for group in _group_bls_candidates_by_time(lkg):
                selections.append((sorted(group, key=_bls_candidate_dt)[0], "tentative", group))
        if not selections:
            required_present[canonical_key] = False
            missing_required.append(canonical_key)
            continue
        required_present[canonical_key] = True
        for selected, confidence, occurrence_candidates in selections:
            post_release_status = verify_bls_release_published(canonical_key, _bls_candidate_dt(selected), as_of_utc=as_of)
            selected_events.append(
                _bls_event_from_candidate(
                    selected,
                    occurrence_candidates,
                    schedule_confidence=confidence,
                    post_release_status=post_release_status,
                )
            )

    selected_events.sort(key=lambda ev: ev.date_time_utc)
    next_event_payload: Dict[str, Any] = {}
    future_events = [ev for ev in selected_events if ev.date_time_utc >= as_of]
    if future_events:
        next_ev = future_events[0]
        next_event_payload = {
            "canonical_key": (next_ev.extras or {}).get("bls_canonical_key"),
            "title": next_ev.title,
            "date_time_utc": next_ev.date_time_utc.isoformat(),
            "schedule_confidence": (next_ev.extras or {}).get("schedule_confidence"),
            "source_reliability": (next_ev.extras or {}).get("source_reliability"),
        }

    live_succeeded = list((source_status or {}).get("live_sources_succeeded") or [])
    live_failed = list((source_status or {}).get("live_sources_failed") or [])
    any_live_candidate = any(c.get("source_reliability") == "official" for c in candidates)
    if missing_required or stale_required:
        status = "failed"
        alert_severity = "failure"
    elif curated_used and not any_live_candidate:
        status = "fallback_fresh" if curated_fresh else "failed"
        if future_events:
            delta = future_events[0].date_time_utc - as_of
            if delta <= timedelta(hours=48):
                alert_severity = "elevated_warning"
            elif delta <= timedelta(days=7):
                alert_severity = "warning"
            else:
                alert_severity = "low_warning"
        else:
            alert_severity = "low_warning"
    elif conflicts:
        status = "healthy"
        alert_severity = "warning"
    elif live_failed and not live_succeeded:
        status = "fallback_fresh" if curated_used else "degraded"
        alert_severity = "warning"
    else:
        status = "healthy"
        alert_severity = "none"

    return selected_events, {
        "status": status,
        "alert_severity": alert_severity,
        "live_sources_attempted": list((source_status or {}).get("live_sources_attempted") or []),
        "live_sources_succeeded": live_succeeded,
        "live_sources_failed": live_failed,
        "curated_fallback_used": curated_used,
        "curated_fallback_fresh": curated_fresh,
        "required_market_movers_present": required_present,
        "required_missing": missing_required,
        "stale_required": stale_required,
        "next_required_bls_event": next_event_payload,
        "warnings": sorted(set(warnings)),
        "source_conflicts": sorted(set(conflicts)),
    }


def _bls_normalized_snapshot(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = [_bls_candidate_json(candidate) for candidate in candidates]
    rows.sort(key=lambda row: (str(row.get("canonical_key")), str(row.get("date_time_utc")), str(row.get("source_path"))))
    return rows


def _bls_diff_normalized_snapshots(previous: List[Dict[str, Any]], current: List[Dict[str, Any]]) -> List[str]:
    warnings: List[str] = []
    prev_by_key: Dict[str, str] = {}
    curr_by_key: Dict[str, str] = {}
    for row in previous or []:
        key = str(row.get("canonical_key") or "")
        if key and key not in prev_by_key:
            prev_by_key[key] = str(row.get("date_time_utc") or "")
    for row in current or []:
        key = str(row.get("canonical_key") or "")
        if key and key not in curr_by_key:
            curr_by_key[key] = str(row.get("date_time_utc") or "")
    if len(previous or []) >= 4 and len(current or []) < max(1, len(previous or []) // 2):
        warnings.append(f"BLS parsed event count dropped sharply: previous={len(previous or [])} current={len(current or [])}")
    for key, previous_dt in prev_by_key.items():
        current_dt = curr_by_key.get(key)
        if not current_dt:
            warnings.append(f"BLS core event disappeared: {key}")
        elif current_dt != previous_dt:
            warnings.append(f"BLS core event date changed: {key} {previous_dt} -> {current_dt}")
    return warnings


def _safe_snapshot_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value or "page").strip("_")
    return cleaned[:80] or "page"


def _write_bls_snapshots(
    raw_pages: List[Dict[str, str]],
    normalized_candidates: List[Dict[str, Any]],
    selected_events: List[Event],
    source_status: Dict[str, Any],
    as_of_utc: datetime,
) -> List[str]:
    if RUN_CONTEXT.get("serverless") or not RUN_CONTEXT.get("allow_persist", True):
        return []
    warnings: List[str] = []
    try:
        snapshot_root = _ec_health._OUT_DIR / "snapshots" / "bls"
        snapshot_dir = snapshot_root / as_of_utc.astimezone(UTC).date().isoformat()
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        for idx, page in enumerate(raw_pages):
            stem = _safe_snapshot_name(f"{idx:02d}_{page.get('source_path')}_{_content_hash_text(page.get('url') or '')}")
            (snapshot_dir / f"{stem}.html").write_text(page.get("text") or "", encoding="utf-8", errors="ignore")
        normalized_rows = _bls_normalized_snapshot(normalized_candidates)
        (snapshot_dir / "normalized_bls_events.json").write_text(
            json.dumps(normalized_rows, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (snapshot_dir / "selected_bls_events.json").write_text(
            json.dumps([ev.to_dict() for ev in selected_events], ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        (snapshot_dir / "source_status.json").write_text(
            json.dumps(source_status, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        previous_files = sorted(
            path
            for path in snapshot_root.glob("*/normalized_bls_events.json")
            if path.parent != snapshot_dir
        )
        if previous_files:
            try:
                previous_rows = json.loads(previous_files[-1].read_text(encoding="utf-8"))
            except Exception:
                previous_rows = []
            warnings.extend(_bls_diff_normalized_snapshots(previous_rows, normalized_rows))
    except Exception:
        logger.debug("BLS snapshot write failed", exc_info=True)
    return warnings


def _fetch_bls_html_fallback(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch BLS releases from HTML schedule as a defensive merge."""

    results: List[Event] = []

    if not BeautifulSoup:

        return results

    html_urls = list(dict.fromkeys([

        "https://www.bls.gov/schedule/news_release/",

        f"https://www.bls.gov/schedule/{start_utc.astimezone(NEW_YORK_TZ).year}/",

        f"https://www.bls.gov/schedule/{end_utc.astimezone(NEW_YORK_TZ).year}/",

        "https://www.bls.gov/bls/newsrels.htm",

        "https://www.bls.gov/news.release/",

        "https://www.bls.gov/ces/",

        "https://www.bls.gov/schedule/news_release/cpi.htm",

        "https://www.bls.gov/schedule/news_release/ppi.htm",

        "https://www.bls.gov/schedule/news_release/empsit.htm",

        "https://www.bls.gov/schedule/news_release/jolts.htm",

        "https://www.bls.gov/schedule/news_release/ximpim.htm",

    ]))

    keywords = [

        "Consumer Price Index",

        "Employment Situation",

        "Producer Price Index",

        "Job Openings and Labor Turnover Survey",

        "JOLTS",

        "Real Earnings",

        "Import/Export Price Indexes",

        "Employment Cost Index",

        "Productivity",

    ]

    keyword_terms = [term.lower() for term in keywords]

    seen_ids: set[str] = set()
    html_headers = {
        "User-Agent": DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0"),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "Upgrade-Insecure-Requests": "1",
    }

    def _parse_local_dt(text: str) -> Optional[datetime]:

        if not text:

            return None

        dt_local: Optional[datetime] = None

        if dateparser:

            settings = {"TIMEZONE": "America/New_York", "RETURN_AS_TIMEZONE_AWARE": True}

            try:

                dt_local = dateparser.parse(text, settings=settings)

            except Exception:

                dt_local = None

        if dt_local is None:

            match = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,)?\s+(20\d{2})", text)

            if match:

                month = month_to_num(match.group(1))

                if month:

                    day = int(match.group(2))

                    year = int(match.group(3))

                    dt_local = datetime(year, month, day, 8, 30, tzinfo=NEW_YORK_TZ)

        if dt_local is None:

            return None

        if dt_local.tzinfo is None:

            hour = dt_local.hour or 8

            minute = dt_local.minute or 30

            dt_local = dt_local.replace(hour=hour, minute=minute, tzinfo=NEW_YORK_TZ)

        if dt_local.hour == 0 and dt_local.minute == 0:

            dt_local = dt_local.replace(hour=8, minute=30)

        return dt_local

    for url in html_urls:

        try:

            resp = sget_retry_alt(
                session,
                [url],
                headers=html_headers,
                tries=2,
                timeout=25,
                breaker=get_source_breaker("BLS"),
                path_hint="html",
            )

        except Exception as exc:

            logger.debug(f"BLS HTML fallback request failed: {exc}", exc_info=True)

            continue

        if not resp or not getattr(resp, "ok", False):

            continue

        soup = BeautifulSoup(resp.text or "", "html.parser")

        page_url = resp.url or url
        title_match = re.search(
            r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})",
            soup.title.get_text(" ", strip=True) if soup.title else "",
            re.I,
        )
        if title_match:
            page_month = month_to_num(title_match.group(1))
            page_year = int(title_match.group(2))
            if page_month:
                for cell in soup.select("table.release-calendar td[id^='d'], table.release-calendar td"):
                    day_tag = cell.select_one("p.day")
                    if not day_tag:
                        continue
                    cell_month = page_month
                    cell_year = page_year
                    cell_id = cell.get("id") or ""
                    id_match = re.fullmatch(r"d(\d{2})(\d{2})", cell_id)
                    if id_match:
                        cell_month = int(id_match.group(1))
                        day = int(id_match.group(2))
                        if cell_month < page_month:
                            cell_year += 1
                    else:
                        day_text = day_tag.get_text(" ", strip=True)
                        if not day_text.isdigit():
                            continue
                        day = int(day_text)
                    detail_blocks = [p for p in cell.find_all("p") if "day" not in (p.get("class") or [])]
                    for block in detail_blocks:
                        block_text = block.get_text(" ", strip=True)
                        if not block_text:
                            continue
                        block_lower = block_text.lower()
                        if not any(term in block_lower for term in keyword_terms):
                            continue
                        strong = block.find("strong")
                        title_text = strong.get_text(" ", strip=True) if strong else block_text
                        title = re.sub(r"\s+", " ", title_text or "BLS Release").strip()
                        time_match = re.search(r"(\d{1,2}):(\d{2})\s*([AP]M)", block_text, re.I)
                        hour = 8
                        minute = 30
                        if time_match:
                            hour = int(time_match.group(1)) % 12
                            if time_match.group(3).upper() == "PM":
                                hour += 12
                            minute = int(time_match.group(2))
                        try:
                            dt_local = ensure_aware(datetime(cell_year, cell_month, day, hour, minute), NEW_YORK_TZ, hour, minute)
                        except Exception:
                            continue
                        dt_utc = dt_local.astimezone(UTC)
                        if not _within(dt_utc, start_utc, end_utc):
                            continue
                        href_el = cell.find("a", href=True)
                        href = href_el.get("href") if href_el and href_el.get("href") else page_url
                        if href and not href.startswith("http"):
                            href = requests.compat.urljoin(page_url, href)
                        event = Event(
                            id=make_id("US", "BLS", title, dt_utc),
                            source="BLS_HTML",
                            agency="BLS",
                            country="US",
                            title=title,
                            date_time_utc=dt_utc,
                            event_local_tz="America/New_York",
                            impact=classify_event(title),
                            url=href,
                            extras={"discovered_via": "HTML", "release_time_local": dt_local.strftime("%H:%M")},
                        )
                        if event.id in seen_ids:
                            continue
                        seen_ids.add(event.id)
                        results.append(event)

        candidates = soup.select("table tr, li, div.article, div.card, section, a[href]")

        for node in candidates:

            block_text = node.get_text(" ", strip=True) if hasattr(node, "get_text") else ""

            if not block_text:

                continue

            block_lower = block_text.lower()

            if not any(term in block_lower for term in keyword_terms):

                continue

            cells = node.find_all("td") if hasattr(node, "find_all") else []

            href_el = None

            if cells:

                date_text = cells[0].get_text(" ", strip=True) if len(cells) >= 1 else block_text

                title_text = cells[1].get_text(" ", strip=True) if len(cells) >= 2 else block_text

                if len(cells) >= 2:

                    href_el = cells[1].find("a", href=True)

            else:

                date_text = block_text

                title_text = block_text

                if " - " in block_text:

                    date_text, title_text = block_text.split(" - ", 1)

                elif ":" in block_text:

                    date_text, title_text = block_text.split(":", 1)

                if hasattr(node, "find"):

                    href_el = node if getattr(node, "name", "") == "a" else node.find("a", href=True)

            dt_local = _parse_local_dt(date_text)

            if not dt_local:

                continue

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            title = re.sub(r"\s+", " ", title_text or "BLS Release").strip()

            href = href_el.get("href") if href_el and href_el.get("href") else page_url

            if href and not href.startswith("http"):

                href = requests.compat.urljoin(page_url, href)

            event = Event(

                id=make_id("US", "BLS", title, dt_utc),

                source="BLS_HTML",

                agency="BLS",

                country="US",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/New_York",

                impact=classify_event(title),

                url=href,

                extras={"discovered_via": "HTML"},

            )

            if event.id in seen_ids:

                continue

            seen_ids.add(event.id)

            results.append(event)

    logger.info(f"BLS HTML fallback: Found {len(results)} event(s)")

    return results

