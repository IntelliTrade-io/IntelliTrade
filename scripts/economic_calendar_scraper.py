#!/usr/bin/env python3

from __future__ import annotations


"""



Economic Calendar Scraper - Complete Final Production



====================================================







Complete enterprise-grade economic calendar scraper with:



- All CSS selector fixes implemented



- Complete central bank coverage (Fed, ECB, BoE, BoC, RBA, RBNZ)



- Fixed ONS RSS and StatCan date parsing



- All 12 enterprise features



- Global expansion (Japan, China, Switzerland)



"""

import argparse

import csv

import inspect
import importlib.util
import shutil

import unicodedata

import hashlib
import calendar
import unicodedata

import json

import logging

import sys

import os

import re

import random

import time
import threading

import xml.etree.ElementTree as ET

from collections import namedtuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from dataclasses import dataclass, field

from datetime import datetime, timedelta, timezone

from pathlib import Path

from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from urllib.parse import quote_plus, urljoin, urlparse

from zoneinfo import ZoneInfo

import requests

from requests.adapters import HTTPAdapter

from urllib3.util.retry import Retry

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

# --- Shared framework extracted to the economic_calendar package (plan 6.3) ---

from economic_calendar.events import (
    COUNTRY_CODES,
    EVENT_JSON_SCHEMA,
    Event,
    _content_hash_bytes,
    _content_hash_text,
    _event_from_dict,
    _event_to_dict,
    _validate_event_schema,
    make_id,
)
from economic_calendar.http import (
    DEFAULT_HEADERS,
    SOURCE_BREAKERS,
    CircuitBreaker,
    EnhancedCacheManager,
    EphemeralCacheManager,
    RetryBudget,
    _apply_cache_response,
    _prepare_request,
    build_session,
    get_source_breaker,
    sget_retry_alt,
    sget_with_retry,
    source_sget,
)
from economic_calendar.ics import parse_ics_bytes, parse_ics_datetime
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
    TZ_NAME_LOOKUP,
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




PROJECT_DIR = Path(__file__).resolve().parent

OUT_DIR = PROJECT_DIR / "out"

PRODUCTION_DIR = OUT_DIR / "production"

STAGING_DIR = OUT_DIR / "staging"


REQUIRED_RUNTIME_DEPENDENCIES = {
    "beautifulsoup4": "bs4",
    "soupsieve": "soupsieve",
    "lxml": "lxml",
    "requests": "requests",
    "python-dateutil": "dateutil",
    "feedparser": "feedparser",
}


def _missing_runtime_dependencies() -> List[str]:
    missing: List[str] = []
    for package_name, module_name in REQUIRED_RUNTIME_DEPENDENCIES.items():
        if importlib.util.find_spec(module_name) is None:
            missing.append(package_name)
    return sorted(missing)



# ---------------------------------------------------------------------------

# Logging setup

logger = logging.getLogger("econ_calendar_complete")

handler = logging.StreamHandler()

handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))

logger.addHandler(handler)

logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------


from economic_calendar.curated import (
    BENIGN_ZERO_REASONS,
    CURATED_ADP_OVERRIDES,
    CURATED_BOE_DATES,
    CURATED_BOJ_DATES,
    CURATED_FALLBACK_MAX_AGE_DAYS,
    CURATED_FALLBACK_REVIEWED_AT,
    CURATED_FED_DATES,
    CURATED_UMICH_OVERRIDES,
    CuratedMeeting,
    GRACE_WINDOW_SOURCES,
    GraceWindowConfig,
    LEGACY_BENIGN_ZERO_REASON_PATTERNS,
    STRICT_ZERO_SOURCES,
    WARN_REQUIRED_SOURCES,
    WARN_REQUIRED_ZERO_ALLOW,
    _curated_fallback_info,
    _curated_fallback_source_key,
    _ensure_time_confidence,
    _is_benign_zero_case,
    _is_benign_zero_reason,
    _normalize_zero_reason,
    _resolve_curated_local_dt,
)
from economic_calendar.pmi import (
    NO_LKG_SOURCES,
    PMI_PROVIDER_DISPLAY,
    PMIOverrideConfig,
    PMIRuleConfig,
    PMISeriesConfig,
    PROVIDER_SPGLOBAL_PMI,
    _calc_pmi_rule_date,
    _estimate_pmi_releases_for_series,
    _get_pmi_config_hash,
    _get_pmi_feeds,
    _get_pmi_overrides,
    _get_pmi_primary_feed_url,
    _get_pmi_rule_entries,
    _get_pmi_rules,
    _get_pmi_series_configs,
    _infer_pmi_importance,
    _infer_pmi_sector,
    _iter_pmi_overrides_for_series,
    _load_json_config,
    _match_pmi_override_entry,
    _resolve_config_path,
)
from economic_calendar import pmi as _ec_pmi

# PMI config JSONs historically resolve relative to this script's directory.
_ec_pmi.set_config_base(Path(__file__).resolve().parent)

from economic_calendar import runstate as _ec_runstate
from economic_calendar import health as _ec_health
from economic_calendar.runstate import RUN_OVERRIDES
from economic_calendar.health import (
    AGENCY_KEY_OVERRIDES,
    BIG_FEEDER_THRESHOLDS,
    ENABLE_LKG,
    FETCH_GROUP_MAX_WORKERS,
    ENABLE_SCHEMA_SENTINEL,
    LKG_TTLS,
    SourceHealth,
    _build_compact_qa_summary,
    _build_curated_fallback_health,
    _build_health_status_payload,
    _build_market_mover_coverage,
    _canonical_health_key,
    _failed_health_payload,
    _finalize_source_log,
    _get_fetch_metadata,
    _health_status_for_run,
    _health_state_path,
    _load_health_state,
    _load_last_publish_metadata,
    _persist_lkg,
    _read_lkg_events,
    _reset_fetch_metadata,
    _save_health_state,
    _save_publish_metadata,
    _schema_capture,
    _set_fetch_metadata,
    _snapshot_fetch_metadata,
    _update_source_health_from_meta,
    _lkg_meta_path,
    _write_run_health,
    ZERO_SNAPSHOT_MAX_CHARS,
    maybe_merge_lkg,
    write_zero_snapshot,
)

_ec_health.set_paths(OUT_DIR, PRODUCTION_DIR)

from economic_calendar.runstate import FEATURE
from economic_calendar.sources.boc import fetch_boc_events
from economic_calendar.sources.boe import fetch_boe_events
from economic_calendar.sources.boj import fetch_boj_mpm_events
from economic_calendar.sources.ecb import fetch_ecb_governing_council_events
from economic_calendar.sources.fomc import fetch_fed_fomc_events
from economic_calendar.sources.rba import fetch_rba_events
from economic_calendar.sources.rbnz import fetch_rbnz_events
from economic_calendar.sources.snb import fetch_snb_events
from economic_calendar.sources.abs import fetch_abs_events
from economic_calendar.sources.bfs import fetch_bfs_events
from economic_calendar.sources.bls import (
    _fetch_bls_curated_fallback,
    _fetch_bls_html_fallback,
    fetch_bls_events,
    run_bls_debug_diagnostics,
)
from economic_calendar.sources.esri import fetch_japan_esri_events
from economic_calendar.sources.eurostat import _parse_eurostat_json_local_datetime, fetch_eurostat_events
from economic_calendar.sources.ism import fetch_ism_events
from economic_calendar.sources.nbs import fetch_china_nbs_events
from economic_calendar.sources.ons import _ons_html_calendar, fetch_ons_events_enhanced
from economic_calendar.sources.pmi_spglobal import fetch_pmi_spglobal_events
from economic_calendar.sources.seco import fetch_switzerland_seco_events
from economic_calendar.sources.statcan import _statcan_html_fallback, fetch_statcan_events
from economic_calendar.sources.statsnz import fetch_stats_nz_events
from economic_calendar.sources.us_curated import (
    fetch_adp_events,
    fetch_bea_events,
    fetch_census_events,
    fetch_dol_jobless_claims_events,
    fetch_eia_petroleum_status_events,
    fetch_umich_events,
)

from economic_calendar.htmlparse import (
    broad_li_filter,
    find_rows_by_header_keywords,
    rows_by_header_xpath,
)
from economic_calendar.runstate import RUN_CONTEXT, RUN_CONTEXT_LOCK
from economic_calendar.speakers import (
    CENTRAL_BANK_SPEAKER_PRIORITY,
    _central_bank_speaker_sources,
    _empty_central_bank_speakers_health,
    _parse_central_bank_speaker_html,
    _request_central_bank_speaker_source,
    _speaker_response_classification,
    collect_central_bank_speaker_events,
)

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
from economic_calendar.enrich import (
    CENTRAL_BANK_AGENCIES,
    _impact_from_score,
    _normalize_event_country_code,
    HIGH_KEYWORDS,
    MEDIUM_KEYWORDS,
    NBS_RELEASE_CALENDAR_INDEX_URL,
    OFFICIAL_SOURCE_DOMAINS,
    _enrich_event_metadata,
    _enrich_events_metadata,
    _infer_event_category,
    _url_is_official,
    classify_event,
)
from economic_calendar.textutils import (
    _eventish_extras,
    _eventish_text_blob,
    _eventish_value,
    _normalize_metadata_text,
    _regex_has_any,
    _text_has_any,
)

# ---------------------------------------------------------------------------




def run_central_bank_speaker_debug_diagnostics(
    session: requests.Session,
    start_utc: datetime,
    end_utc: datetime,
    *,
    out_dir: Path = OUT_DIR,
) -> Tuple[Path, Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for source in _central_bank_speaker_sources(start_utc, end_utc):
        response = _request_central_bank_speaker_source(session, source["url"])
        status = int(getattr(response, "status_code", 0) or 0) if response is not None else 0
        content = bytes(getattr(response, "content", b"") or b"") if response is not None else b""
        content_type = str((getattr(response, "headers", {}) or {}).get("Content-Type") or "")
        final_url = str(getattr(response, "url", "") or source["url"]) if response is not None else source["url"]
        parser_error = ""
        parsed: List[Event] = []
        if response is not None and 200 <= status < 300:
            try:
                parsed = _parse_central_bank_speaker_html(
                    source["institution"],
                    response.text or "",
                    final_url,
                    source["source_path"],
                    start_utc,
                    end_utc,
                )
            except Exception as exc:
                parser_error = str(exc)
        row = {
            **source,
            "http_status": status,
            "final_url": final_url,
            "content_type": content_type,
            "response_size_bytes": len(content),
            "classification": _speaker_response_classification(content, content_type, status),
            "parser_count": len(parsed),
            "parsed_speaker_names": sorted({str((event.extras or {}).get("speaker_name") or "") for event in parsed if (event.extras or {}).get("speaker_name")}),
            "parsed_event_dates": [event.date_time_utc.isoformat() for event in parsed],
            "parser_error": parser_error,
        }
        rows.append(row)
        print(
            "SPEAKER_DEBUG: "
            f"{row['institution']} path={row['source_path']} status={row['http_status']} "
            f"classification={row['classification']} parser_count={row['parser_count']} url={row['url']}"
        )
    payload = {
        "generated_at_utc": _now_utc().isoformat(),
        "window": {"start_utc": start_utc.isoformat(), "end_utc": end_utc.isoformat()},
        "sources": rows,
    }
    diagnostics_dir = Path(out_dir) / "diagnostics"
    diagnostics_dir.mkdir(parents=True, exist_ok=True)
    path = diagnostics_dir / f"speakers_debug_{_now_utc().strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"SPEAKER_DEBUG_WRITTEN: {path}")
    return path, payload

# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------

# Complete Central Bank Scrapers (Fed, ECB, BoE, BoC, RBA, RBNZ)

SOURCE_KEY_PREFIXES = {

    "BLS": ("BLS",),

    "BEA": ("BEA",),

    "CENSUS": ("CENSUS",),

    "DOL": ("DOL",),

    "EIA": ("EIA",),

    "ONS": ("ONS",),

    "ABS": ("ABS",),

    "STATCAN": ("STATCAN", "STATSCAN"),

    "EUROSTAT": ("EUROSTAT",),

    "STATSNZ": ("STATSNZ",),

    "ESRI": ("ESRI",),

    "NBS": ("NBS",),

    "SECO": ("SECO",),

    "ECB": ("ECB",),

    "RBNZ": ("RBNZ",),

}


def _normalize_key(value: Optional[str]) -> str:

    return (value or "").upper()

def _event_matches_key(event: Event, key: str) -> bool:

    normalized_key = _normalize_key(key)

    agency_value = _normalize_key(event.agency)

    if AGENCY_KEY_OVERRIDES.get(agency_value, agency_value) == normalized_key:

        return True

    source_value = _normalize_key(event.source)

    for prefix in SOURCE_KEY_PREFIXES.get(normalized_key, ()):

        if source_value.startswith(prefix):

            return True

    return False

def _filter_events_by_key(events: List[Event], key: str) -> List[Event]:

    return [ev for ev in events if _event_matches_key(ev, key)]

def _merge_events(primary: List[Event], extra: List[Event]) -> List[Event]:

    if not extra:

        return primary

    seen = {ev.id for ev in primary}

    merged = list(primary)

    for ev in extra:

        if ev.id not in seen:

            merged.append(ev)

            seen.add(ev.id)

    return merged

def _fallback_statcan_html(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    atom_count = sum(1 for ev in events if ev.source == "STATCAN_ATOM")

    if atom_count > 0:

        return []

    try:

        return _statcan_html_fallback(session, start_utc, end_utc) or []

    except Exception:

        logger.debug("StatCan HTML fallback invocation failed", exc_info=True)

        return []

def _fallback_eurostat_refetch(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    url = "https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics"

    headers = {"Accept-Language": "en-US,en;q=0.9"}

    try:

        resp, _ = source_sget(session, "EUROSTAT", url, timeout=25, headers=headers, path_hint="ics")

    except Exception:

        logger.debug("Eurostat refetch failed", exc_info=True)

        return []

    if not (resp and getattr(resp, "ok", False)):

        return []

    extra: List[Event] = []

    try:

        for item in parse_ics_bytes(resp.content, EUROSTAT_TZ, default_hour=11, default_min=0):

            dt_utc = item["dt"].astimezone(UTC)
            dt_local = item["dt"].astimezone(EUROSTAT_TZ)

            if start_utc and dt_utc < start_utc:

                continue

            if end_utc and dt_utc > end_utc:

                continue

            title = re.sub(r"\s+", " ", item["title"]).strip()

            extra.append(Event(

                id=make_id("EU", "EUROSTAT", title, dt_utc),

                source="Eurostat",

                agency="EUROSTAT",

                country="EU",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Europe/Luxembourg",

                impact=classify_event(title),

                url=item.get("url") or url,

                extras={"release_time_local": dt_local.strftime("%H:%M")},

            ))

    except Exception:

        logger.debug("Eurostat refetch parse failed", exc_info=True)

        return []

    if extra:
        return extra

    try:
        params = {
            "start": (start_utc - timedelta(days=7)).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": (end_utc + timedelta(days=45)).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "timeZone": "Europe/Luxembourg",
        }
        resp, _ = sget_with_retry(
            session,
            "https://ec.europa.eu/eurostat/o/calendars/eventsJson",
            timeout=25,
            headers={
                "Accept": "application/json,text/plain,*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://ec.europa.eu/eurostat/news/release-calendar",
            },
            params=params,
            path_hint="json",
        )
    except Exception:
        logger.debug("Eurostat JSON refetch failed", exc_info=True)
        return []

    if not (resp and getattr(resp, "ok", False)):
        return []

    try:
        payload = resp.json()
    except Exception:
        logger.debug("Eurostat JSON refetch decode failed", exc_info=True)
        return []

    for item in payload if isinstance(payload, list) else []:
        start_raw = str(item.get("start") or "")
        if not start_raw:
            continue
        try:
            dt_local, dt_utc = _parse_eurostat_json_local_datetime(start_raw)
        except Exception:
            continue
        if start_utc and dt_utc < start_utc:
            continue
        if end_utc and dt_utc > end_utc:
            continue
        title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()
        if not title:
            continue
        extra.append(
            Event(
                id=make_id("EU", "EUROSTAT", title, dt_utc),
                source="EUROSTAT_JSON",
                agency="EUROSTAT",
                country="EU",
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Europe/Luxembourg",
                impact=classify_event(title),
                url="https://ec.europa.eu/eurostat/news/release-calendar",
                extras={"release_time_local": dt_local.strftime("%H:%M"), "theme": item.get("theme"), "period": item.get("period")},
            )
        )

    return extra

def _fallback_statsnz_refetch(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    headers = {"Accept-Language": "en-US,en;q=0.9"}

    urls = [

        "https://www.stats.govt.nz/release-calendar/calendar-export",

        "https://www.stats.govt.nz/assets/Uploads/release-calendar.ics",

    ]

    extra: List[Event] = []

    for url in urls:

        try:

            resp, _ = source_sget(session, "STATSNZ", url, timeout=25, headers=headers, path_hint="ics")

        except Exception:

            logger.debug("Stats NZ refetch failed for %s", url, exc_info=True)

            continue

        if not (resp and getattr(resp, "ok", False)):

            continue

        try:

            for item in parse_ics_bytes(resp.content, WELLINGTON_TZ, default_hour=10, default_min=45):

                dt_utc = item["dt"].astimezone(UTC)

                if start_utc and dt_utc < start_utc:

                    continue

                if end_utc and dt_utc > end_utc:

                    continue

                title = re.sub(r"\s+", " ", item["title"]).strip()

                extra.append(Event(

                    id=make_id("NZ", "STATSNZ", title, dt_utc),

                    source="StatsNZ",

                    agency="STATSNZ",

                    country="NZ",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Pacific/Auckland",

                    impact=classify_event(title),

                    url=item.get("url") or url,

                    extras={"release_time_local": "10:45"},

                ))

        except Exception:

            logger.debug("Stats NZ refetch parse failed for %s", url, exc_info=True)

            continue

    return extra

def _fallback_seco_estimator(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    schedule = [(3, "Spring"), (6, "Summer"), (9, "Autumn"), (12, "Winter")]

    now_local = datetime.now(UTC).astimezone(ZURICH_TZ)

    extra: List[Event] = []

    for year in (now_local.year, now_local.year + 1):

        for month, season in schedule:

            try:

                dt_local = ensure_aware(datetime(year, month, 15, 9, 0), ZURICH_TZ, 9, 0)

            except ValueError:

                continue

            dt_utc = dt_local.astimezone(UTC)

            if not (start_utc <= dt_utc <= end_utc):

                continue

            title = f"SECO {season} Economic Forecast"

            extra.append(Event(

                id=make_id("CH", "SECO", title, dt_utc),

                source="SECO_HTML",

                agency="SECO",

                country="CH",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Europe/Zurich",

                impact=classify_event(title),

                url="https://www.seco.admin.ch/seco/en/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",

                extras={"announcement_time_local": "09:00", "frequency": "Quarterly", "estimated_date": True},

            ))

    return extra

FALLBACK_HANDLERS: Dict[str, Callable[[requests.Session, datetime, datetime, List[Event], int], List[Event]]] = {

    "STATCAN": _fallback_statcan_html,

    "EUROSTAT": _fallback_eurostat_refetch,

    "STATSNZ": _fallback_statsnz_refetch,

    "SECO": _fallback_seco_estimator,

}

def _apply_health_guard(source_key: str, events: List[Event], session: requests.Session, start_utc: datetime, end_utc: datetime, since_days: int, until_days: int, health_state: Dict[str, Dict[str, Any]], degrade_if_under: bool = False) -> List[Event]:

    events = [ev for ev in events if isinstance(ev, Event)]

    expected = SourceHealth.scaled(since_days, until_days, source_key)

    actual = len(_filter_events_by_key(events, source_key))

    if expected <= 0:

        health_state[source_key] = {"actual": actual, "expected": 0, "status": "HEALTHY"}

        return events

    degrade_flag = False

    fallback = FALLBACK_HANDLERS.get(source_key)

    if actual < expected and fallback:

        try:

            extra = fallback(session, start_utc, end_utc, events, expected)

        except Exception:

            logger.debug("%s fallback handler crashed", source_key, exc_info=True)

            extra = []

        if extra:

            events = _merge_events(events, extra)

            actual = len(_filter_events_by_key(events, source_key))

        if actual < expected and degrade_if_under:

            degrade_flag = True

    status = "HEALTHY" if actual >= expected and not degrade_flag else "DEGRADED"

    health_state[source_key] = {"actual": actual, "expected": expected, "status": status}

    return events

def _call_fetch(func, session, start_utc, end_utc):

    """Safely call a fetcher that may have arity (1|2|3) and return [] on error."""

    try:

        sig = inspect.signature(func)

        params = list(sig.parameters.values())

        arity = sum(1 for p in params if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD))

        if arity >= 3:

            return func(session, start_utc, end_utc) or []

        elif arity == 2:

            return func(session, (start_utc, end_utc)) or []

        else:

            return func(session) or []

    except Exception as exc:

        logger.error(f"{getattr(func, '__name__', 'fetcher')} crashed: {exc}")

        return []

def _grace_expected_dt(config: GraceWindowConfig, now_utc: datetime) -> datetime:
    local_now = now_utc.astimezone(config.tz)
    expected_local = local_now.replace(hour=config.hour, minute=config.minute, second=0, microsecond=0)
    return expected_local.astimezone(UTC)

def _maybe_grace_retry(
    source_key: str,
    func: Callable,
    session: requests.Session,
    start_utc: datetime,
    end_utc: datetime,
    produced: List[Event],
) -> List[Event]:
    if produced:
        return produced
    ctx = RUN_CONTEXT or {}
    if not ctx.get("grace_enabled"):
        return produced
    config = GRACE_WINDOW_SOURCES.get(source_key)
    if not config:
        return produced
    with RUN_CONTEXT_LOCK:
        attempted: Set[str] = ctx.setdefault("grace_attempted", set())
        if source_key in attempted:
            return produced
    now_utc = _now_utc()
    expected_dt = _grace_expected_dt(config, now_utc)
    start = ctx.get("start_utc", start_utc)
    end = ctx.get("end_utc", end_utc)
    if not _within(expected_dt, start, end):
        return produced
    local_now = now_utc.astimezone(config.tz)
    expected_local = expected_dt.astimezone(config.tz)
    delta_seconds = abs((expected_local - local_now).total_seconds())
    grace_minutes = max(0, int(ctx.get("grace_window_minutes", 0)))
    if delta_seconds > grace_minutes * 60:
        return produced
    with RUN_CONTEXT_LOCK:
        attempted.add(source_key)
    interval = max(0, int(ctx.get("grace_interval_seconds", 0)))
    logger.warning(
        "GRACE_RETRY source=%s reason=publish_window proximity=%ds label=%s",
        source_key,
        int(delta_seconds),
        config.label,
    )
    if interval:
        time.sleep(interval)
    retry = _call_fetch(func, session, start_utc, end_utc)
    return retry or produced

def _clone_cache_manager_for_worker(cache_manager: EnhancedCacheManager) -> EnhancedCacheManager:
    cache_cls = type(cache_manager)
    try:
        return cache_cls(str(getattr(cache_manager, "cache_dir", "cache")), str(getattr(cache_manager, "snapshots_dir", "failures")))
    except Exception:
        return cache_manager

def _run_fetcher_task(
    func: Callable,
    source_key: str,
    cache_manager: EnhancedCacheManager,
    start_utc: datetime,
    end_utc: datetime,
    *,
    allow_lkg: bool,
) -> List[Event]:
    worker_session = build_session(_clone_cache_manager_for_worker(cache_manager))
    produced: List[Event] = []
    produced_from_lkg = False
    try:
        produced = _call_fetch(func, worker_session, start_utc, end_utc)
        produced = _maybe_grace_retry(source_key, func, worker_session, start_utc, end_utc, produced)

        if produced and allow_lkg:
            try:
                _persist_lkg(source_key, produced)
            except Exception:
                logger.debug("%s LKG persist failed", source_key, exc_info=True)

        if not produced and allow_lkg:
            merged = maybe_merge_lkg(source_key, produced)
            if merged is not produced and merged:
                produced = merged
                produced_from_lkg = True
            else:
                alt_key = f"{source_key}_EST"
                if alt_key in LKG_TTLS:
                    alt = maybe_merge_lkg(alt_key, produced)
                    if alt is not produced and alt:
                        produced = alt
                        produced_from_lkg = True

        if produced_from_lkg:
            for ev in produced:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg"}
            logger.info("%s LKG_MERGE: %d", source_key, len(produced))
            _finalize_source_log(source_key, "lkg", len(produced))

        return produced
    finally:
        try:
            worker_session.close()
        except Exception:
            pass

def _execute_fetcher_group(
    fetchers: List[Callable],
    cache_manager: EnhancedCacheManager,
    start_utc: datetime,
    end_utc: datetime,
    source_filter: Optional[Set[str]],
    *,
    allow_lkg_resolver: Callable[[str], bool],
) -> Dict[str, List[Event]]:
    selected: List[tuple[Callable, str, bool]] = []
    for func in fetchers:
        source_key = FETCHER_SOURCE_MAP.get(func, func.__name__.upper())
        if source_filter and source_key not in source_filter:
            continue
        _set_fetch_metadata(source_key, count=0, path=None)
        selected.append((func, source_key, allow_lkg_resolver(source_key)))

    if not selected:
        return {}

    results: Dict[str, List[Event]] = {}
    max_workers = min(FETCH_GROUP_MAX_WORKERS, len(selected))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(
                _run_fetcher_task,
                func,
                source_key,
                cache_manager,
                start_utc,
                end_utc,
                allow_lkg=allow_lkg,
            ): source_key
            for func, source_key, allow_lkg in selected
        }
        for future in as_completed(future_map):
            source_key = future_map[future]
            try:
                results[source_key] = future.result() or []
            except Exception:
                logger.error("%s worker failed", source_key, exc_info=True)
                results[source_key] = []

    return results

# REPLACE ENTIRE BLOCK: canonical fetcher lists + gatherers
MACRO_FETCHERS: List[Callable] = [
    fetch_abs_events,
    fetch_bls_events,
    fetch_bea_events,
    fetch_census_events,
    fetch_dol_jobless_claims_events,
    fetch_eia_petroleum_status_events,
    fetch_ism_events,
    fetch_ons_events_enhanced,
    fetch_statcan_events,
    fetch_eurostat_events,
    fetch_stats_nz_events,
    fetch_china_nbs_events,
    fetch_switzerland_seco_events,
    fetch_bfs_events,
    fetch_japan_esri_events,
    fetch_umich_events,
    fetch_adp_events,
    fetch_pmi_spglobal_events,
]

CB_FETCHERS: List[Callable] = [
    fetch_fed_fomc_events,
    fetch_ecb_governing_council_events,
    fetch_boe_events,
    fetch_boc_events,
    fetch_rba_events,
    fetch_rbnz_events,
    fetch_boj_mpm_events,
    fetch_snb_events,
]

# Delete any other fetcher lists or gather_* definitions. There must be
# exactly one gather_macro_events, one gather_central_bank_events, one gather_events.

FETCHER_SOURCE_MAP: Dict[Callable, str] = {
    fetch_abs_events: "ABS",
    fetch_bls_events: "BLS",
    fetch_bea_events: "BEA",
    fetch_census_events: "CENSUS",
    fetch_dol_jobless_claims_events: "DOL",
    fetch_eia_petroleum_status_events: "EIA",
    fetch_ism_events: "ISM",
    fetch_ons_events_enhanced: "ONS",
    fetch_statcan_events: "STATCAN",
    fetch_eurostat_events: "EUROSTAT",
    fetch_stats_nz_events: "STATSNZ",
    fetch_china_nbs_events: "NBS",
    fetch_switzerland_seco_events: "SECO",
    fetch_bfs_events: "BFS",
    fetch_japan_esri_events: "ESRI",
    fetch_umich_events: "UMICH",
    fetch_adp_events: "ADP",
    fetch_pmi_spglobal_events: PROVIDER_SPGLOBAL_PMI,
    fetch_fed_fomc_events: "FED",
    fetch_ecb_governing_council_events: "ECB",
    fetch_boe_events: "BOE",
    fetch_boc_events: "BOC",
    fetch_rba_events: "RBA",
    fetch_rbnz_events: "RBNZ",
    fetch_boj_mpm_events: "BOJ",
    fetch_snb_events: "SNB",
}

def _assert_unique_fetchers() -> None:
    required = [
        "fetch_fed_fomc_events",
        "fetch_boj_mpm_events",
        "fetch_ecb_governing_council_events",
        "fetch_boe_events",
        "fetch_snb_events",
        "fetch_japan_esri_events",
        "fetch_switzerland_seco_events",
        "fetch_china_nbs_events",
    ]
    offenders: List[str] = []
    import inspect as _inspect
    import sys as _sys

    module_source = _inspect.getsource(_sys.modules[__name__])
    for func_name in required:
        occurrences = module_source.count(f"def {func_name}(")
        # Fetchers extracted to economic_calendar.sources (plan 6.3) have 0 local
        # defs by design; the guard then only needs the imported callable to exist.
        # >1 still catches the machine-patch duplication this assert was built for.
        if occurrences > 1 or (occurrences == 0 and not callable(globals().get(func_name))):
            offenders.append(f"{func_name}:{occurrences}")

    if offenders:
        raise SystemExit(f"DUPLICATE_DEFINITION: {', '.join(offenders)}")

    # Runtime guard: no duplicates, ECB not in macros, all callables unique
    assert len(MACRO_FETCHERS) == len(set(MACRO_FETCHERS)), "Duplicate in MACRO_FETCHERS"
    assert len(CB_FETCHERS) == len(set(CB_FETCHERS)), "Duplicate in CB_FETCHERS"
    assert fetch_ecb_governing_council_events not in MACRO_FETCHERS, "ECB must be CB only"
    for fn in MACRO_FETCHERS + CB_FETCHERS:
        assert callable(fn), f"Non-callable fetcher: {fn}"
        assert fn in FETCHER_SOURCE_MAP, f"Fetcher missing in map: {fn}"

def gather_macro_events(session, start_utc, end_utc) -> List[Event]:
    _assert_unique_fetchers()
    events: List[Event] = []
    degrade_after_fallback = {"EUROSTAT", "STATSNZ"}

    ctx = RUN_CONTEXT
    source_filter = ctx.get("source_filter")
    since_days = ctx.get("since_days", 0)
    until_days = ctx.get("until_days", 0)
    health_state = ctx.setdefault("health_status", {})
    ctx.setdefault("per_source", {})
    ctx.setdefault("health_persistent", {})
    cache_manager = getattr(session, "cache_manager", None)

    _reset_fetch_metadata()

    grouped_results = _execute_fetcher_group(
        MACRO_FETCHERS,
        cache_manager,
        start_utc,
        end_utc,
        source_filter,
        allow_lkg_resolver=lambda key: key not in NO_LKG_SOURCES,
    )

    for func in MACRO_FETCHERS:
        source_key = FETCHER_SOURCE_MAP.get(func, func.__name__.upper())

        if source_filter and source_key not in source_filter:
            continue

        produced = grouped_results.get(source_key, [])
        if produced:
            events.extend(produced)

        meta = _get_fetch_metadata(source_key)

        if produced and meta.get("count") in (None, 0):

            _set_fetch_metadata(source_key, count=len(produced))

            meta = _get_fetch_metadata(source_key)

        if meta.get("path") is None:

            _set_fetch_metadata(source_key, path=meta.get("path") or "dom")

        _update_source_health_from_meta(source_key)

        events = _apply_health_guard(
            source_key,
            events,
            session,
            start_utc,
            end_utc,
            since_days,
            until_days,
            health_state,
            degrade_if_under=source_key in degrade_after_fallback,
        )

    abnormal_sources: List[str] = []
    for source, threshold in BIG_FEEDER_THRESHOLDS.items():
        meta = _get_fetch_metadata(source)
        total = meta.get("ics_total") if meta else None
        path_used = str((meta or {}).get("path") or "").lower()
        count = int((meta or {}).get("count") or 0)
        if total is not None and total < threshold and (count == 0 or path_used in {"", "ics", "none"}):
            abnormal_sources.append(source)
    if len(abnormal_sources) >= 2:
        names = ", ".join(abnormal_sources)
        logger.warning(f"RATE_LIMIT_QUORUM: suspected throttling across: {names}")
        ctx.setdefault("quorum_alerts", []).append({"sources": abnormal_sources, "ts": _iso(_now_utc())})

    bigfeeders_flags: List[str] = []
    for source in ("EUROSTAT", "STATSNZ", "BLS"):
        threshold = BIG_FEEDER_THRESHOLDS.get(source)
        meta = _get_fetch_metadata(source)
        total = meta.get("ics_total") if meta else None
        path_used = str((meta or {}).get("path") or "").lower()
        count = int((meta or {}).get("count") or 0)
        if threshold is not None and isinstance(total, int) and total < threshold and (count == 0 or path_used in {"", "ics", "none"}):
            bigfeeders_flags.append(f"{source}:{total}")
    if len(bigfeeders_flags) >= 2 and not ctx.get("bigfeeders_abnormal_logged"):
        logger.warning(f"BigFeedersAbnormal: {', '.join(bigfeeders_flags)}")
        ctx["bigfeeders_abnormal_logged"] = True

    return events

def gather_central_bank_events(session, start_utc, end_utc) -> List[Event]:
    _assert_unique_fetchers()
    events: List[Event] = []
    source_filter = RUN_CONTEXT.get("source_filter")
    cache_manager = getattr(session, "cache_manager", None)
    grouped_results = _execute_fetcher_group(
        CB_FETCHERS,
        cache_manager,
        start_utc,
        end_utc,
        source_filter,
        allow_lkg_resolver=lambda key: False,
    )
    for func in CB_FETCHERS:
        source_key = FETCHER_SOURCE_MAP.get(func, func.__name__.upper())
        if source_filter and source_key not in source_filter:
            continue
        produced = grouped_results.get(source_key, [])
        meta = _get_fetch_metadata(source_key)
        if produced and meta.get("count") in (None, 0):
            _set_fetch_metadata(source_key, count=len(produced))
            meta = _get_fetch_metadata(source_key)
        if produced and meta.get("path") is None:
            _set_fetch_metadata(source_key, path="dom")
        _update_source_health_from_meta(source_key)
        events.extend(produced)
    return events

def gather_events(session, start_utc, end_utc, include_global: bool = False, include_central_banks: bool = False) -> List[Event]:
    _assert_unique_fetchers()
    all_events: List[Event] = []
    if include_global:
        all_events.extend(gather_macro_events(session, start_utc, end_utc))
    if include_central_banks:
        all_events.extend(gather_central_bank_events(session, start_utc, end_utc))
    return all_events
# END REPLACEMENT

def _collect_events_core(
    since_days: int,
    until_days: int,
    include_central_banks: bool,
    include_global: bool,
    cache_manager: EnhancedCacheManager,
    *,
    allow_persist: bool,
    now_provider: Callable[[], datetime],
    source_filter: Optional[Set[str]] = None,
    grace_window_mins: int = 40,
    grace_interval_secs: int = 600,
) -> List[Event]:
    """Gather events across all configured sources within a UTC date window."""
    session = build_session(cache_manager)

    _ec_runstate.CURRENT_CACHE_MANAGER = cache_manager
    serverless_mode = isinstance(cache_manager, EphemeralCacheManager)
    RUN_CONTEXT.clear()
    RUN_CONTEXT.update({
        "since_days": since_days,
        "until_days": until_days,
        "health_status": {},
        "per_source": {},
        "quorum_alerts": [],
        "health_persistent": {} if not allow_persist else _load_health_state(cache_manager),
        "allow_persist": allow_persist,
        "serverless": serverless_mode,
        "grace_window_minutes": grace_window_mins,
        "grace_interval_seconds": grace_interval_secs,
        "grace_attempted": set(),
    })
    RUN_CONTEXT["grace_enabled"] = grace_window_mins > 0 and grace_interval_secs >= 0
    RUN_CONTEXT["include_global_flag"] = include_global
    if source_filter:
        RUN_CONTEXT["source_filter"] = set(source_filter)
    else:
        RUN_CONTEXT.pop("source_filter", None)

    now_utc = now_provider()
    start_utc = now_utc + timedelta(days=since_days)
    end_utc = now_utc + timedelta(days=until_days)
    RUN_CONTEXT["start_utc"] = start_utc
    RUN_CONTEXT["end_utc"] = end_utc

    events = gather_macro_events(session, start_utc, end_utc)

    if include_central_banks:
        cb_events = gather_central_bank_events(session, start_utc, end_utc)
        if cb_events:
            events.extend(cb_events)
        speaker_events = collect_central_bank_speaker_events(session, start_utc, end_utc)
        if speaker_events:
            events.extend(speaker_events)
        health_status = RUN_CONTEXT.setdefault("health_status", {})
        events = _apply_health_guard(
            "RBNZ",
            events,
            session,
            start_utc,
            end_utc,
            since_days,
            until_days,
            health_status,
        )
        _update_source_health_from_meta("RBNZ")

    filtered = [ev for ev in events if start_utc <= ev.date_time_utc <= end_utc]

    seen: Dict[str, Event] = {}
    unique_events: List[Event] = []
    for ev in filtered:
        if ev.id in seen:
            existing = seen[ev.id]
            existing_checksum = hashlib.sha1(f"{existing.title}{existing.date_time_utc}{existing.url}".encode()).hexdigest()
            new_checksum = hashlib.sha1(f"{ev.title}{ev.date_time_utc}{ev.url}".encode()).hexdigest()
            if existing_checksum != new_checksum:
                ev.extras["revised_from"] = existing.id
                ev.extras["revision_checksum"] = new_checksum
                for idx, current in enumerate(unique_events):
                    if current.id == ev.id:
                        unique_events[idx] = ev
                        break
                seen[ev.id] = ev
        else:
            seen[ev.id] = ev
            unique_events.append(ev)

    unique_events = _enrich_events_metadata(unique_events)
    unique_events.sort(key=lambda e: e.date_time_utc)

    per_source_counts: Dict[str, int] = {}
    for ev in unique_events:
        key = _canonical_health_key(ev.agency or ev.source)
        per_source_counts[key] = per_source_counts.get(key, 0) + 1
    if per_source_counts:
        summary = ", ".join(f"{name}: {count}" for name, count in sorted(per_source_counts.items()))
        logger.info(summary)
    else:
        logger.info("No source-level events")

    RUN_CONTEXT["per_source_counts"] = dict(per_source_counts)

    logger.info(f"Total events collected: {len(events)}")
    logger.info(f"Events in UTC window ({since_days} to {until_days} days): {len(filtered)}")
    logger.info(f"Unique events after deduplication: {len(unique_events)}")

    if allow_persist:
        health_persistent = RUN_CONTEXT.get("health_persistent", {})
        _save_health_state(cache_manager, health_persistent)

    existing_health_status = RUN_CONTEXT.get("health_status", {})
    sources_payload: Dict[str, Dict[str, Any]] = {}
    for key, meta in sorted(_snapshot_fetch_metadata().items()):
        canonical_key = _canonical_health_key(key)
        path_used = meta.get("path")
        errors = list(meta.get("errors") or [])
        payload_entry = {
            "count": meta.get("count", 0),
            "path_used": path_used,
            "zero_reason": meta.get("zero_reason"),
            "lkg_used": bool(path_used == "lkg"),
            "live_source_failed": bool(meta.get("live_source_failed")),
            "snapshot_hash": meta.get("snapshot_hash"),
            "errors": errors,
        }
        if canonical_key == "BLS":
            for optional_key in (
                "bls_health",
                "bls_required_missing",
                "bls_source_conflicts",
                "bls_alert_severity",
            ):
                if optional_key in meta:
                    payload_entry[optional_key] = meta.get(optional_key)
        previous_entry = sources_payload.get(canonical_key)
        previous_count = int((previous_entry or {}).get("count", 0) or 0)
        current_count = int(payload_entry.get("count", 0) or 0)
        if previous_entry is None or current_count >= previous_count:
            sources_payload[canonical_key] = payload_entry

    report_now = _now_utc()
    (
        curated_fallbacks,
        live_source_warnings,
        stale_curated_sources,
        stale_required_curated_sources,
    ) = _build_curated_fallback_health(sources_payload, report_now)
    bls_health = RUN_CONTEXT.get("bls_health", {})
    if isinstance(bls_health, dict):
        for warning in bls_health.get("warnings", []) or []:
            if warning.startswith("BLS live source failed") or "conflicts with curated fallback" in warning:
                if warning not in live_source_warnings:
                    live_source_warnings.append(warning)
        severity = str(bls_health.get("alert_severity") or "")
        if severity and severity not in {"none", "low_warning"}:
            warning = f"BLS alert severity: {severity}"
            if warning not in live_source_warnings and bls_health.get("status") != "failed":
                live_source_warnings.append(warning)
    speakers_health = RUN_CONTEXT.get("central_bank_speakers_health", _empty_central_bank_speakers_health())
    if isinstance(speakers_health, dict):
        for warning in speakers_health.get("warnings", []) or []:
            warning_text = str(warning)
            if warning_text not in live_source_warnings:
                live_source_warnings.append(warning_text)
    qa_summary = _build_compact_qa_summary(
        unique_events,
        speakers_health if isinstance(speakers_health, dict) else _empty_central_bank_speakers_health(),
    )

    health_status = _build_health_status_payload(
        sources_payload,
        since_days,
        until_days,
        existing_health_status if isinstance(existing_health_status, dict) else {},
        curated_fallbacks,
    )
    RUN_CONTEXT["health_status"] = dict(health_status)

    non_benign_zero_sources: List[str] = []
    for source_key, meta in sorted(sources_payload.items()):
        errors = list(meta.get("errors") or [])
        if errors:
            non_benign_zero_sources.append(source_key)
            continue

        count = int(meta.get("count", 0) or 0)
        path_used = meta.get("path_used")
        zero_reason = meta.get("zero_reason")
        if count == 0 and not _is_benign_zero_case(source_key, path_used, count, zero_reason):
            non_benign_zero_sources.append(source_key)

    fatal_missing: List[str] = []
    if _ec_runstate.STRICT_ZERO_FLAG:
        fatal_missing = sorted([source for source in non_benign_zero_sources if source in STRICT_ZERO_SOURCES])

    warn_missing = sorted([source for source in non_benign_zero_sources if source not in fatal_missing])

    if warn_missing:
        logger.warning(
            "STRICT_WARN: sources with non-benign zero/failure: %s",
            ", ".join(warn_missing),
        )

    if fatal_missing:
        logger.error(
            "STRICT_ZERO: Required central bank missing in window (fatal): %s",
            ", ".join(fatal_missing),
        )

    RUN_CONTEXT["strict_zero_failures"] = fatal_missing

    market_mover_coverage = _build_market_mover_coverage(unique_events, report_now)
    (
        run_status,
        publish_allowed,
        failure_reasons,
        missing_required_sources,
        degraded_sources,
    ) = _health_status_for_run(
        fatal_missing=fatal_missing,
        warn_missing=warn_missing,
        sources_payload=sources_payload,
        market_mover_coverage=market_mover_coverage,
        stale_curated_sources=stale_curated_sources,
        stale_required_curated_sources=stale_required_curated_sources,
    )
    window_payload = {
        "since_days": since_days,
        "until_days": until_days,
        "tz": "UTC",
        "now_utc": report_now.isoformat(),
    }

    warnings_total = (
        len(warn_missing)
        + len(RUN_CONTEXT.get("quorum_alerts", []))
        + len(live_source_warnings)
        + len(stale_curated_sources)
    )
    summary_payload = {
        "total": len(events),
        "unique": len(unique_events),
        "fatal": run_status == "failed",
        "warnings": warnings_total,
        "generated_at_utc": report_now.isoformat(),
    }

    RUN_CONTEXT["summary_warnings"] = warnings_total
    RUN_CONTEXT["warn_missing"] = warn_missing
    RUN_CONTEXT["publish_allowed"] = publish_allowed
    RUN_CONTEXT["market_mover_coverage"] = market_mover_coverage
    last_publish = _load_last_publish_metadata()

    health_payload: Dict[str, Any] = {
        "status": run_status,
        "publish_allowed": publish_allowed,
        "export_written": False,
        "staging_export_written": False,
        "requested_export_written": False,
        "production_export_written": False,
        "production_promoted": False,
        "failure_reasons": failure_reasons,
        "missing_required_sources": missing_required_sources,
        "degraded_sources": degraded_sources,
        "live_source_warnings": live_source_warnings,
        "curated_fallbacks": curated_fallbacks,
        "bls_health": bls_health if isinstance(bls_health, dict) else {},
        "central_bank_speakers_health": speakers_health if isinstance(speakers_health, dict) else _empty_central_bank_speakers_health(),
        "qa_summary": qa_summary,
        "generated_at_utc": report_now.isoformat(),
        **last_publish,
        "event_count_total": len(events),
        "event_count_unique": len(unique_events),
        "source_counts": per_source_counts,
        "market_mover_coverage": market_mover_coverage,
        "window": window_payload,
        "summary": summary_payload,
        "sources": sources_payload,
        "health_status": dict(health_status),
        "per_source_counts": per_source_counts,
        "per_source": RUN_CONTEXT.get("per_source", {}),
        "quorum_alerts": RUN_CONTEXT.get("quorum_alerts", []),
    }

    RUN_CONTEXT["health_payload"] = health_payload

    if allow_persist:
        _write_run_health(health_payload)

    return unique_events

def collect_events(since_days: int, until_days: int, include_central_banks: bool, include_global: bool, cache_manager: EnhancedCacheManager) -> List[Event]:
    return _collect_events_core(
        since_days,
        until_days,
        include_central_banks,
        include_global,
        cache_manager,
        allow_persist=True,
        now_provider=_now_utc,
        source_filter=None,
        grace_window_mins=40,
        grace_interval_secs=600,
    )

def run(
    since_days: int = 0,
    until_days: int = 60,
    include_global: bool = True,
    include_central_banks: bool = True,
    sources: Optional[List[str]] = None,
    allow_persist: bool = True,
    now_utc: Optional[Callable[[], datetime]] = None,
    grace_window_mins: int = 40,
    grace_interval_secs: int = 600,
) -> List[Dict[str, Any]]:
    """Return a JSON-serializable list of events without performing any persistence."""
    if "debug_zero_flag" in RUN_OVERRIDES:
        _ec_runstate.DEBUG_ZERO_FLAG = bool(RUN_OVERRIDES["debug_zero_flag"])
    if "strict_zero_flag" in RUN_OVERRIDES:
        _ec_runstate.STRICT_ZERO_FLAG = bool(RUN_OVERRIDES["strict_zero_flag"])

    allow_flag = bool(allow_persist)
    now_provider = now_utc or (lambda: datetime.now(timezone.utc))

    source_filter: Optional[Set[str]] = None
    if sources:
        source_filter = {item.strip().upper() for item in sources if item and item.strip()}
        if not source_filter:
            source_filter = None

    cache_dir = RUN_OVERRIDES.get("cache_dir", "cache")
    snapshots_dir = RUN_OVERRIDES.get("snapshots_dir", "failures")
    serverless_override = bool(RUN_OVERRIDES.get("serverless"))
    serverless_env = os.getenv("VERCEL") or os.getenv("SERVERLESS")
    use_ephemeral = (not allow_flag) or serverless_override or bool(serverless_env)

    if use_ephemeral:
        cache_manager = EphemeralCacheManager(cache_dir, snapshots_dir)
    else:
        cache_manager = EnhancedCacheManager(cache_dir, snapshots_dir)

    events = _collect_events_core(
        since_days,
        until_days,
        include_central_banks,
        include_global,
        cache_manager,
        allow_persist=allow_flag,
        now_provider=now_provider,
        source_filter=source_filter,
        grace_window_mins=grace_window_mins,
        grace_interval_secs=grace_interval_secs,
    )

    payload = [ev.to_dict() for ev in events]
    payload.sort(key=lambda item: item["date_time_utc"])
    return payload

# ---------------------------------------------------------------------------

# CLI interface


def _write_csv(path: str, events: list) -> None:
    """
    Write a flat CSV snapshot of events.

    - Uses a stable column order for core fields.
    - Serializes `extras` as a JSON string.
    """
    fieldnames = [
        "id",
        "source",
        "agency",
        "country",
        "title",
        "date_time_utc",
        "event_local_tz",
        "impact",
        "trader_relevance_score",
        "category",
        "asset_focus",
        "source_reliability",
        "lkg_used",
        "curated_fallback_reviewed_at",
        "curated_fallback_age_days",
        "curated_fallback_max_age_days",
        "source_url",
        "source_name",
        "local_time_timezone",
        "event_time_utc",
        "default_dashboard",
        "event_group_key",
        "event_group_title",
        "event_group_type",
        "event_group_priority",
        "url",
        "time_confidence",
        "extras",
    ]

    def _event_mapping(ev: Any) -> Dict[str, Any]:
        if isinstance(ev, dict):
            return dict(ev)
        to_dict = getattr(ev, "to_dict", None)
        if callable(to_dict):
            return to_dict()
        dt_value = getattr(ev, "date_time_utc", None)
        if isinstance(dt_value, datetime):
            dt_value = dt_value.isoformat()
        base = {
            "id": getattr(ev, "id", None),
            "source": getattr(ev, "source", None),
            "agency": getattr(ev, "agency", None),
            "country": getattr(ev, "country", None),
            "title": getattr(ev, "title", None),
            "date_time_utc": dt_value,
            "event_local_tz": getattr(ev, "event_local_tz", None),
            "impact": getattr(ev, "impact", None),
            "url": getattr(ev, "url", None),
        }
        extras = getattr(ev, "extras", None)
        if isinstance(extras, dict):
            base["extras"] = extras
        else:
            base["extras"] = {}
        return base

    def _extras_dict(value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        return {}

    def _asdict(ev: Any) -> Dict[str, Any]:
        base = _event_mapping(ev)
        extras = _extras_dict(base.get("extras"))
        base.setdefault("trader_relevance_score", extras.get("trader_relevance_score", ""))
        base.setdefault("category", extras.get("category", ""))
        base.setdefault("asset_focus", json.dumps(extras.get("asset_focus", []), ensure_ascii=False) if extras.get("asset_focus") is not None else "")
        base.setdefault("source_reliability", extras.get("source_reliability", ""))
        base.setdefault("lkg_used", bool(extras.get("lkg_used") or extras.get("cached")))
        base.setdefault("curated_fallback_reviewed_at", extras.get("curated_fallback_reviewed_at", ""))
        base.setdefault("curated_fallback_age_days", extras.get("curated_fallback_age_days", ""))
        base.setdefault("curated_fallback_max_age_days", extras.get("curated_fallback_max_age_days", ""))
        base.setdefault("source_url", extras.get("source_url_standardized") or base.get("url", ""))
        base.setdefault("source_name", extras.get("source_name") or base.get("agency") or base.get("source") or "")
        base.setdefault("local_time_timezone", base.get("event_local_tz", ""))
        base.setdefault("event_time_utc", base.get("date_time_utc", ""))
        base.setdefault("default_dashboard", extras.get("default_dashboard", ""))
        base.setdefault("event_group_key", extras.get("event_group_key", ""))
        base.setdefault("event_group_title", extras.get("event_group_title", ""))
        base.setdefault("event_group_type", extras.get("event_group_type", ""))
        base.setdefault("event_group_priority", extras.get("event_group_priority", ""))
        row: Dict[str, Any] = {}
        for key in fieldnames:
            if key in ("time_confidence", "extras"):
                continue
            val = base.get(key, "")
            row[key] = "" if val is None else val
        row["time_confidence"] = extras.get("time_confidence", "")
        row["extras"] = json.dumps(extras, ensure_ascii=False, separators=(",", ":"))
        return row

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        if not events:
            return
        for ev in events:
            writer.writerow(_asdict(ev))


def _event_export_dict(ev: Any) -> Dict[str, Any]:
    if isinstance(ev, dict):
        return dict(ev)
    to_dict = getattr(ev, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    raise TypeError(f"Unsupported event export type: {type(ev)!r}")


def _event_export_payload(events: List[Any]) -> List[Dict[str, Any]]:
    payload = [_event_export_dict(ev) for ev in events]
    payload.sort(key=lambda item: str(item.get("date_time_utc") or ""))
    return payload


def _write_json_export(path: Path | str, events: List[Any]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        json.dump(_event_export_payload(events), handle, ensure_ascii=False, indent=2)
    logger.info("EXPORT_WRITTEN: %s", target)
    return target


def _write_jsonl_export(path: Path | str, events: List[Any]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        for item in _event_export_payload(events):
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    logger.info("EXPORT_WRITTEN: %s", target)
    return target


def _write_csv_export(path: Path | str, events: List[Any]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    _write_csv(str(target), events)
    logger.info("EXPORT_WRITTEN: %s", target)
    return target


def _write_staging_artifacts(events: List[Any]) -> List[Path]:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    return [
        _write_json_export(STAGING_DIR / "calendar.json", events),
        _write_jsonl_export(STAGING_DIR / "calendar.jsonl", events),
        _write_csv_export(STAGING_DIR / "calendar.csv", events),
    ]


def _write_production_artifacts(events: List[Any]) -> List[Path]:
    PRODUCTION_DIR.mkdir(parents=True, exist_ok=True)
    return [
        _write_json_export(PRODUCTION_DIR / "calendar.json", events),
        _write_jsonl_export(PRODUCTION_DIR / "calendar.jsonl", events),
        _write_csv_export(PRODUCTION_DIR / "calendar.csv", events),
    ]


def _write_requested_artifacts(args: argparse.Namespace, events: List[Any]) -> List[Path]:
    written: List[Path] = []
    if args.out:
        written.append(_write_json_export(args.out, events))
    if args.jsonl:
        written.append(_write_jsonl_export(args.jsonl, events))
    if args.csv:
        written.append(_write_csv_export(args.csv, events))
    return written


def main() -> None:

    parser = argparse.ArgumentParser(description="Economic Calendar Scraper - Complete Final Production")

    parser.add_argument("--since", type=int, default=0, help="Days from today to start collecting events (default: 0)")

    parser.add_argument("--until", type=int, default=30, help="Days from today to stop collecting events (default: 30)")

    parser.add_argument(

        "--central-banks",

        action="store_true",

        help="Include complete central bank monetary policy schedules (Fed, ECB, BoE, BoC, RBA, RBNZ)",

    )

    parser.add_argument(

        "--global",

        action="store_true",

        dest="include_global",

        help="Include global expansion sources (Japan, China, Switzerland)",

    )

    parser.add_argument("--out", type=str, default=None, help="Output file path (JSON)")

    parser.add_argument("--jsonl", type=str, default=None, help="Output file path (JSONL)")

    parser.add_argument(
        "--csv",
        dest="csv",
        metavar="CSV_PATH",
        help="Optional path to write a CSV snapshot of all events in the window.",
    )

    parser.add_argument("--health", action="store_true", help="Show health report")
    parser.add_argument(
        "--selfcheck",
        action="store_true",
        help="Run fetcher consistency checks without scraping",
    )
    parser.add_argument(
        "--debug-zero",
        action="store_true",
        help="Capture zero-event snapshots for audit (writes failures/zero/*.txt)",
    )
    parser.add_argument(
        "--debug-bls",
        action="store_true",
        help="Run BLS-only transport/parser diagnostics and exit without scraping or publishing",
    )
    parser.add_argument(
        "--debug-speakers",
        action="store_true",
        help="Run central-bank speaker source diagnostics and exit without scraping or publishing",
    )
    parser.add_argument(
        "--strict-zero",
        action="store_true",
        help="Fail (exit code 3) if critical sources like FED/ECB return zero events",
    )

    parser.add_argument("--cache-dir", type=str, default="cache", help="Cache directory")

    parser.add_argument("--snapshots-dir", type=str, default="failures", help="Failure snapshots directory")
    parser.add_argument(
        "--grace-window-mins",
        type=int,
        default=40,
        help="Window in minutes around expected publish time to trigger a grace retry",
    )
    parser.add_argument(
        "--grace-interval-secs",
        type=int,
        default=600,
        help="Seconds to wait before performing the grace retry (default: 600)",
    )

    args = parser.parse_args()

    _ec_runstate.DEBUG_ZERO_FLAG = bool(args.debug_zero)
    _ec_runstate.STRICT_ZERO_FLAG = bool(args.strict_zero)

    if args.debug_bls:
        cache_manager = EnhancedCacheManager(args.cache_dir, args.snapshots_dir)
        session = build_session(cache_manager)
        now_utc = _now_utc()
        start_utc = now_utc + timedelta(days=args.since)
        end_utc = now_utc + timedelta(days=args.until)
        try:
            run_bls_debug_diagnostics(session, start_utc, end_utc, out_dir=OUT_DIR)
        finally:
            try:
                session.close()
            except Exception:
                pass
        return

    if args.debug_speakers:
        cache_manager = EnhancedCacheManager(args.cache_dir, args.snapshots_dir)
        session = build_session(cache_manager)
        now_utc = _now_utc()
        start_utc = now_utc + timedelta(days=args.since)
        end_utc = now_utc + timedelta(days=args.until)
        try:
            run_central_bank_speaker_debug_diagnostics(session, start_utc, end_utc, out_dir=OUT_DIR)
        finally:
            try:
                session.close()
            except Exception:
                pass
        return

    missing_dependencies = _missing_runtime_dependencies()
    if missing_dependencies:
        install_cmd = 'python -m pip install ".[scraper]"  # from the repo root (deps in pyproject.toml)'
        logger.error("DEPENDENCY_MISSING: %s", ", ".join(missing_dependencies))
        logger.error("DEPENDENCY_INSTALL: %s", install_cmd)
        health_payload = _failed_health_payload(
            "missing runtime dependencies",
            missing_packages=missing_dependencies,
        )
        _write_run_health(health_payload)
        logger.error("EXPORT_SKIPPED: missing required dependencies")
        logger.error("PRODUCTION_NOT_PROMOTED: missing required dependencies")
        sys.exit(2)

    if args.selfcheck:
        _assert_unique_fetchers()
        print("SELF-CHECK OK")
        return

    _assert_unique_fetchers()

    logger.info("=== Economic Calendar Scraper - Complete Final Production ===")

    logger.info(f"Date range: {args.since} to {args.until} days from today")

    logger.info(f"Include central banks: {args.central_banks}")

    logger.info(f"Include global expansion: {args.include_global}")

    # Initialize cache settings for run()
    RUN_OVERRIDES["cache_dir"] = args.cache_dir
    RUN_OVERRIDES["snapshots_dir"] = args.snapshots_dir
    RUN_OVERRIDES["debug_zero_flag"] = _ec_runstate.DEBUG_ZERO_FLAG
    RUN_OVERRIDES["strict_zero_flag"] = _ec_runstate.STRICT_ZERO_FLAG
    try:
        event_dicts = run(
            since_days=args.since,
            until_days=args.until,
            include_global=args.include_global,
            include_central_banks=args.central_banks,
            sources=None,
            allow_persist=True,
            grace_window_mins=args.grace_window_mins,
            grace_interval_secs=args.grace_interval_secs,
        )
    finally:
        RUN_OVERRIDES.pop("cache_dir", None)
        RUN_OVERRIDES.pop("snapshots_dir", None)
        RUN_OVERRIDES.pop("debug_zero_flag", None)
        RUN_OVERRIDES.pop("strict_zero_flag", None)

    events = [_event_from_dict(item) for item in event_dicts]

    health_payload = dict(RUN_CONTEXT.get("health_payload") or {})
    if not health_payload:
        health_payload = _failed_health_payload("internal health payload missing")

    staging_written = _write_staging_artifacts(events)
    health_payload["staging_export_written"] = bool(staging_written)

    strict_failures = sorted(RUN_CONTEXT.get("strict_zero_failures") or [])
    status = str(health_payload.get("status") or "failed").lower()
    publish_allowed = bool(health_payload.get("publish_allowed")) and not strict_failures and status == "healthy"

    if publish_allowed:
        requested_written = _write_requested_artifacts(args, events)
        production_written = _write_production_artifacts(events)
        publish_meta = _save_publish_metadata(_now_utc(), PRODUCTION_DIR / "calendar.json")
        health_payload["export_written"] = bool(requested_written or production_written)
        health_payload["requested_export_written"] = bool(requested_written)
        health_payload["production_export_written"] = bool(production_written)
        health_payload["production_promoted"] = True
        health_payload["publish_allowed"] = True
        health_payload.update(publish_meta)
        RUN_CONTEXT["health_payload"] = health_payload
        _write_run_health(health_payload)
        logger.info("PRODUCTION_PROMOTED: %s", PRODUCTION_DIR / "calendar.json")
    else:
        if strict_failures:
            skip_reason = "strict validation failed: " + ", ".join(strict_failures)
        else:
            reasons = health_payload.get("failure_reasons") or ["health validation failed"]
            skip_reason = "health validation failed: " + "; ".join(str(reason) for reason in reasons)
        health_payload["export_written"] = False
        health_payload["requested_export_written"] = False
        health_payload["production_export_written"] = False
        health_payload["production_promoted"] = False
        health_payload["publish_allowed"] = False
        summary = dict(health_payload.get("summary") or {})
        if status == "failed" or strict_failures:
            summary["fatal"] = True
            health_payload["status"] = "failed"
        health_payload["summary"] = summary
        RUN_CONTEXT["health_payload"] = health_payload
        _write_run_health(health_payload)
        logger.error("EXPORT_SKIPPED: %s", skip_reason)
        logger.error("PRODUCTION_NOT_PROMOTED: %s", skip_reason)
        if args.strict_zero and strict_failures:
            sys.exit(3)
        sys.exit(2 if health_payload.get("status") == "failed" else 1)

    if args.health:
        print("\n=== HEALTH REPORT ===")
        print(json.dumps(health_payload, indent=2))

    # Console output

    if not args.out and not args.jsonl and not args.csv:

        for ev in events:

            print(

                f"{ev.date_time_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}: {ev.title} "

                f"({ev.agency}/{ev.country}, {ev.impact})"

            )

    # Enhanced CI assertion for complete coverage

    expected_min = 150 if args.central_banks and args.include_global and args.until >= 60 else 100

    if len(events) < expected_min:

        logger.warning(f"Expected >{expected_min} events but got {len(events)} - may indicate scraper issues")

    else:

        logger.info(f"âœ… CI check passed: {len(events)} events >= {expected_min} threshold")

if __name__ == "__main__":

    main()

# (removed duplicate MONTH_NUM reassign)

try:

    SOURCE_SLO_EXPECTATIONS.update({

        "ONS_RSS": 0,

        "ONS_HTML_UPCOMING": 5,

        "STATCAN_ATOM": 0,

        "STATCAN_DAILY_SCHEDULE": 5,

        "FED_TEXT_CALENDAR": 1,

        "ESRI_SCHEDULE_TABLE": 1,

        "NBS_CALENDAR_TABLE": 1,

        "SECO_HTML": 1,

        "BOJ_SCHEDULE": 1,

        "SNB_SCHEDULE": 1

    })

except Exception:

    pass
