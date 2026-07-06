"""Japan ESRI calendar fetcher — moved verbatim from the monolith (plan 6.3).

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
    _lkg_meta_path,
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

def fetch_japan_esri_events(session, start_utc, end_utc):
    """ESRI Consumer Confidence schedule with multi-source DOM, estimator, and LKG fallback."""
    if not BeautifulSoup:
        _set_fetch_metadata("ESRI", count=0, path="unavailable")
        return []

    cache_manager = getattr(session, "cache_manager", None)
    JST = TOKYO_TZ

    ws = r"\s+"
    sep_colon = f"[:{chr(0xFF1A)}]"
    SEP_DOT = "[./\\-" + chr(0x30FB) + chr(0xFF0E) + chr(0xFF0F) + "]"

    ascii_time_first = re.compile(
        rf"(?P<h>\d{{1,2}}){sep_colon}(?P<m>\d{{2}})?{ws}(?P<y>20\d{{2}}){SEP_DOT}(?P<mo>\d{{1,2}}){SEP_DOT}(?P<d>\d{{1,2}})"
    )
    ascii_date_first = re.compile(
        rf"(?P<y>20\d{{2}}){SEP_DOT}(?P<mo>\d{{1,2}}){SEP_DOT}(?P<d>\d{{1,2}}){ws}(?P<h>\d{{1,2}}){sep_colon}(?P<m>\d{{2}})?"
    )
    ascii_date_only = re.compile(rf"(?P<y>20\d{{2}}){SEP_DOT}(?P<mo>\d{{1,2}}){SEP_DOT}(?P<d>\d{{1,2}})")

    era_reiwa = chr(0x4EE4) + chr(0x548C)
    era_heisei = chr(0x5E73) + chr(0x6210)
    fw_lparen = chr(0xFF08)
    fw_rparen = chr(0xFF09)
    kanji_year = chr(0x5E74)
    kanji_month = chr(0x6708)
    kanji_day = chr(0x65E5)
    kanji_hour = chr(0x6642)
    kanji_minute = chr(0x5206)
    kanji_approx = chr(0x9803)
    kanji_expected = chr(0x4E88) + chr(0x5B9A)

    era_pattern = f"{era_reiwa}|{era_heisei}"
    kanji_time_pattern = r"""
(?:(?P<era>({era}))(?P<era_year>\d{{1,2}})(?:[{fw_lparen}(](?P<era_override>20\d{{2}})[{fw_rparen})])?|(?P<year>20\d{{2}})){year}
\s*(?P<mo>\d{{1,2}})\s*{month}\s*(?P<d>\d{{1,2}})\s*{day}
(?:\s*(?P<h>\d{{1,2}})\s*{hour}(?:\s*(?P<m>\d{{1,2}})\s*{minute}?)?)?
(?:\s*(?:{approx}|{expected}))?
""".format(
        era=era_pattern,
        fw_lparen=fw_lparen,
        fw_rparen=fw_rparen,
        year=kanji_year,
        month=kanji_month,
        day=kanji_day,
        hour=kanji_hour,
        minute=kanji_minute,
        approx=kanji_approx,
        expected=kanji_expected,
    )
    kanji_time = re.compile(kanji_time_pattern, re.VERBOSE)
    kanji_date_only = re.compile(r"(?P<year>20\d{2})年\s*(?P<mo>\d{1,2})月\s*(?P<d>\d{1,2})日")
    era_date_only = re.compile(rf"(?:{era_pattern})\d{{1,2}}\((?P<year>20\d{{2}})\)年\s*(?P<mo>\d{{1,2}})月\s*(?P<d>\d{{1,2}})日")
    paren_gregorian_date = re.compile(r"\((?P<year>20\d{2})\)年\s*(?P<mo>\d{1,2})月\s*(?P<d>\d{1,2})日")

    pages = [
        ([
            "https://www.esri.cao.go.jp/jp/stat/shouhi/shouhi.html",
            "https://www.esri.cao.go.jp/jp/stat/shouhi/releaseschedule.html",
        ], "jp", "JP"),
        ([
            "https://www.esri.cao.go.jp/en/stat/shouhi/shouhi-e.html",
            "https://www.esri.cao.go.jp/en/stat/shouhi/releaseschedule.html",
        ], "en", "EN"),
        ([
            "https://www.esri.cao.go.jp/en/stat/shouhi/shouhi.html",
            "https://www.esri.cao.go.jp/en/stat/shouhi/releaseschedule.html",
        ], "en-fallback", "EN"),
        (["https://www.esri.cao.go.jp/jp/stat/shouhi/releaseschedule.html"], "jp-fallback", "JP"),
    ]

    events: List[Event] = []
    seen: set[tuple[int, int, int, int, int]] = set()
    seed_seen: set[tuple[int, int, int, int, int]] = set()
    path_used = None
    last_snapshot = ""
    seed_events: List[Event] = []
    seed_return_events: List[Event] = []
    lkg_cache: Optional[List[Event]] = None

    def _era_to_year(era: str | None, era_year: str | None, override: str | None) -> int | None:
        if override:
            try:
                return int(override)
            except Exception:
                return None
        if not era or not era_year:
            return None
        try:
            base = 2018 if era == era_reiwa else 1988 if era == era_heisei else None
            return base + int(era_year) if base is not None else None
        except Exception:
            return None

    def _emit(y, mo, d, h, m, url, lang):
        if y is None or mo is None or d is None:
            return
        assumed = h is None and m is None
        hh = 8 if h is None else max(0, min(23, int(h)))
        mm = 50 if m is None else max(0, min(59, int(m)))
        key = (int(y), int(mo), int(d), hh, mm)
        if key in seen:
            return
        try:
            dt_local = ensure_aware(datetime(int(y), int(mo), int(d), hh, mm), JST, hh, mm)
            dt_utc = dt_local.astimezone(UTC)
        except Exception:
            return
        if key not in seed_seen:
            seed_seen.add(key)
            seed_extras = {"language": lang, "discovered_via": "html_seed"}
            if assumed:
                seed_extras["time_confidence"] = "assumed"
            seed_events.append(
                Event(
                    id=make_id("JP", "ESRI", "Japan ESRI Consumer Confidence (Release)", dt_utc),
                    source="ESRI_HTML_SEED",
                    agency="ESRI",
                    country="JP",
                    title="Japan ESRI Consumer Confidence (Release)",
                    date_time_utc=dt_utc,
                    event_local_tz="Asia/Tokyo",
                    impact="Medium",
                    url=url,
                    extras=seed_extras,
                )
            )
        if not _within(dt_utc, start_utc, end_utc):
            return
        seen.add(key)
        extras = {"language": lang, "discovered_via": "html"}
        if assumed:
            extras["time_confidence"] = "assumed"
        events.append(
            Event(
                id=make_id("JP", "ESRI", "Japan ESRI Consumer Confidence (Release)", dt_utc),
                source="ESRI_HTML",
                agency="ESRI",
                country="JP",
                title="Japan ESRI Consumer Confidence (Release)",
                date_time_utc=dt_utc,
                event_local_tz="Asia/Tokyo",
                impact="Medium",
                url=url,
                extras=extras,
            )
        )

    def _load_lkg_events() -> List[Event]:
        nonlocal lkg_cache
        if lkg_cache is not None:
            return lkg_cache
        if not RUN_CONTEXT.get("allow_persist", True):
            lkg_cache = []
            return lkg_cache
        cache = _ec_runstate.CURRENT_CACHE_MANAGER
        if cache is None:
            lkg_cache = []
            return lkg_cache
        path = _lkg_meta_path(cache, "ESRI")
        if not path.exists():
            lkg_cache = []
            return lkg_cache
        try:
            payload = json.loads(path.read_text())
        except Exception:
            lkg_cache = []
            return lkg_cache
        events_lkg: List[Event] = []
        for data in payload.get("events", []):
            try:
                events_lkg.append(_event_from_dict(data))
            except Exception:
                continue
        events_lkg.sort(key=lambda ev: ev.date_time_utc)
        lkg_cache = events_lkg
        return lkg_cache

    def _add_months_dt(dt_local: datetime, months: int) -> datetime:
        year = dt_local.year + (dt_local.month - 1 + months) // 12
        month = (dt_local.month - 1 + months) % 12 + 1
        day = min(dt_local.day, calendar.monthrange(year, month)[1])
        return dt_local.replace(year=year, month=month, day=day)

    def _estimator_from_lkg() -> List[Event]:
        base_events = _load_lkg_events()
        seeded_only = False
        if not base_events and seed_events:
            base_events = sorted(seed_events, key=lambda ev: ev.date_time_utc)
            seeded_only = True
        if not base_events:
            return []
        last_event = base_events[-1]
        prev_event = base_events[-2] if len(base_events) >= 2 else None
        cadence_days = (last_event.date_time_utc - prev_event.date_time_utc).days if prev_event else 30
        cadence_months = 1 if seeded_only else 3 if cadence_days >= 60 else 1
        projected: List[Event] = []
        base_local = last_event.date_time_utc.astimezone(TOKYO_TZ)
        for idx in range(1, 5):
            candidate_local = _add_months_dt(base_local, cadence_months * idx)
            dt_utc = candidate_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            projected.append(
                Event(
                    id=make_id("JP", "ESRI", "Japan ESRI Consumer Confidence (Release)", dt_utc),
                    source="ESRI_ESTIMATOR",
                    agency="ESRI",
                    country="JP",
                    title="Japan ESRI Consumer Confidence (Release)",
                    date_time_utc=dt_utc,
                    event_local_tz="Asia/Tokyo",
                    impact="Medium",
                    url=base_events[-1].url,
                    extras={
                        "estimated": True,
                        "source": "estimator",
                        "cadence_months": cadence_months,
                        "time_confidence": "assumed",
                    },
                )
            )
        return projected

    def _seed_event() -> Optional[Event]:
        now_local = datetime.now(TOKYO_TZ)
        seed_day = 10
        seed_year = now_local.year
        seed_month = now_local.month
        if now_local.day >= seed_day:
            seed_month += 1
            if seed_month > 12:
                seed_month = 1
                seed_year += 1
        try:
            seed_local = ensure_aware(datetime(seed_year, seed_month, seed_day, 8, 50), TOKYO_TZ, 8, 50)
        except Exception:
            return None
        dt_utc = seed_local.astimezone(UTC)
        extras = {
            "language": "seed",
            "discovered_via": "estimator_seed",
            "estimated": True,
            "source": "estimator_seed",
            "time_confidence": "assumed",
        }
        return Event(
            id=make_id("JP", "ESRI", "Japan ESRI Consumer Confidence (Release)", dt_utc),
            source="ESRI_ESTIMATOR_SEED",
            agency="ESRI",
            country="JP",
            title="Japan ESRI Consumer Confidence (Release)",
            date_time_utc=dt_utc,
            event_local_tz="Asia/Tokyo",
            impact="Medium",
            url=pages[0][0][0],
            extras=extras,
        )

    for urls, label, lang in pages:
        resp = sget_retry_alt(
            session,
            urls,
            headers={"Accept-Language": "ja,en;q=0.9"},
            tries=3,
            breaker=get_source_breaker("ESRI"),
            path_hint="dom",
        )
        if not (resp and getattr(resp, "ok", False)):
            continue
        try:
            encoding = (resp.encoding or "").strip()
            if not encoding or encoding.lower() == "iso-8859-1":
                encoding = resp.apparent_encoding or "utf-8"
            page_html = (resp.content or b"").decode(encoding, errors="ignore")
            soup = BeautifulSoup(page_html or "", "html.parser")
        except Exception:
            logger.debug("ESRI: parse failed for %s", resp.url or urls[0], exc_info=True)
            continue
        text = unicodedata.normalize("NFKC", soup.get_text("\n", strip=True))
        last_snapshot = text[:ZERO_SNAPSHOT_MAX_CHARS]
        page_url = resp.url or urls[0]
        before = len(events)
        for raw in text.splitlines():
            line = raw.strip()
            if not line:
                continue
            line = line.strip("[]()<>「」『』{}【】")
            match = ascii_time_first.search(line)
            if match:
                _emit(int(match["y"]), int(match["mo"]), int(match["d"]), match["h"], match["m"], page_url, lang)
                continue
            match = ascii_date_first.search(line)
            if match:
                _emit(int(match["y"]), int(match["mo"]), int(match["d"]), match["h"], match["m"], page_url, lang)
                continue
            match = ascii_date_only.search(line)
            if match:
                _emit(int(match["y"]), int(match["mo"]), int(match["d"]), None, None, page_url, lang)
                continue
            match = kanji_time.search(line)
            if match:
                year = int(match["year"]) if match.group("year") else _era_to_year(match["era"], match["era_year"], match["era_override"])
                if year is not None:
                    hour_val = match.group("h")
                    minute_val = match.group("m")
                    _emit(year, int(match["mo"]), int(match["d"]), hour_val, minute_val, page_url, lang)
                continue
            match = era_date_only.search(line) or paren_gregorian_date.search(line) or kanji_date_only.search(line)
            if match:
                _emit(int(match["year"]), int(match["mo"]), int(match["d"]), None, None, page_url, lang)
        added = len(events) - before
        if added > 0:
            path_used = label
            logger.info("ESRI: parsed %d event(s) from %s", added, label)
            break

    if events:
        events.sort(key=lambda e: e.date_time_utc)
        if cache_manager:
            try:
                _persist_lkg("ESRI", events)
            except Exception:
                pass
        path_label = path_used if path_used in {"jp", "en", "en-fallback", "jp-fallback"} else (path_used or "jp")
        _finalize_source_log("ESRI", path_label, len(events))
        return events

    page_seed_match = re.search(r"\((20\d{2})\)年\s*(\d{1,2})月\s*(\d{1,2})日", last_snapshot)
    if page_seed_match:
        try:
            base_local = ensure_aware(
                datetime(int(page_seed_match.group(1)), int(page_seed_match.group(2)), int(page_seed_match.group(3)), 8, 50),
                TOKYO_TZ,
                8,
                50,
            )
            candidate_local = _add_months_dt(base_local, 1)
            dt_utc = candidate_local.astimezone(UTC)
            if _within(dt_utc, start_utc, end_utc):
                estimator_event = Event(
                    id=make_id("JP", "ESRI", "Japan ESRI Consumer Confidence (Release)", dt_utc),
                    source="ESRI_ESTIMATOR",
                    agency="ESRI",
                    country="JP",
                    title="Japan ESRI Consumer Confidence (Release)",
                    date_time_utc=dt_utc,
                    event_local_tz="Asia/Tokyo",
                    impact="Medium",
                    url=pages[0][0][0],
                    extras={
                        "estimated": True,
                        "source": "estimator",
                        "cadence_months": 1,
                        "time_confidence": "assumed",
                        "discovered_via": "page_seed_estimator",
                    },
                )
                _finalize_source_log("ESRI", "estimator", 1)
                return [estimator_event]
        except Exception:
            logger.debug("ESRI: page-seed estimator failed", exc_info=True)

    monthly_estimator_events: List[Event] = []
    local_start = start_utc.astimezone(TOKYO_TZ)
    probe_year = local_start.year
    probe_month = local_start.month
    for _ in range(4):
        try:
            candidate_local = ensure_aware(datetime(probe_year, probe_month, 4, 8, 50), TOKYO_TZ, 8, 50)
        except Exception:
            candidate_local = None
        if candidate_local is not None:
            dt_utc = candidate_local.astimezone(UTC)
            if _within(dt_utc, start_utc, end_utc):
                monthly_estimator_events.append(
                    Event(
                        id=make_id("JP", "ESRI", "Japan ESRI Consumer Confidence (Release)", dt_utc),
                        source="ESRI_ESTIMATOR",
                        agency="ESRI",
                        country="JP",
                        title="Japan ESRI Consumer Confidence (Release)",
                        date_time_utc=dt_utc,
                        event_local_tz="Asia/Tokyo",
                        impact="Medium",
                        url=pages[0][0][0],
                        extras={
                            "estimated": True,
                            "source": "estimator",
                            "cadence_months": 1,
                            "time_confidence": "assumed",
                            "discovered_via": "monthly_estimator",
                        },
                    )
                )
        probe_month += 1
        if probe_month > 12:
            probe_month = 1
            probe_year += 1
    if monthly_estimator_events:
        _finalize_source_log("ESRI", "estimator", len(monthly_estimator_events))
        return monthly_estimator_events

    if not _load_lkg_events():
        seed_event = _seed_event()
        if seed_event:
            seed_events.append(seed_event)
            if _within(seed_event.date_time_utc, start_utc, end_utc):
                seed_return_events.append(seed_event)

    estimator_events = _estimator_from_lkg()
    if estimator_events or seed_return_events:
        combined: List[Event] = []
        seen_ids: set[str] = set()
        for ev in seed_return_events + estimator_events:
            if ev.id in seen_ids:
                continue
            combined.append(ev)
            seen_ids.add(ev.id)
        combined.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("ESRI", "estimator", len(combined))
        return combined

    merged: List[Event] = []
    if cache_manager:
        try:
            merged = maybe_merge_lkg("ESRI", [], ttl_days=120, tag="lkg")
        except Exception:
            merged = []
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg"}
        logger.warning("ESRI LKG_MERGE: %d", len(merged))
        _finalize_source_log("ESRI", "lkg", len(merged))
        return merged

    zero_reason = "ESRI: DOM, estimator, and LKG sources yielded no releases in requested window."
    _finalize_source_log("ESRI", "none", 0, zero_reason=zero_reason)
    if _ec_runstate.DEBUG_ZERO_FLAG:
        write_zero_snapshot("ESRI", last_snapshot or "no HTTP body")
    return []

