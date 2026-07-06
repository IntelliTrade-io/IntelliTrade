"""S&P Global PMI fetcher — moved verbatim from the monolith (plan 6.3).

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

def fetch_pmi_spglobal_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Deterministic PMI release estimation using offline research artifacts."""
    # TODO: add tests under tests/pmi/ validating the estimator end-to-end by
    # asserting at least one US flash event falls within a fixed window and that
    # override paths toggle extras["pmi_override"] and time_confidence correctly.
    del session  # PMI engine is config-driven; no HTTP requests performed.
    source_key = PROVIDER_SPGLOBAL_PMI
    zero_reason: Optional[str] = None
    try:
        series_map = _get_pmi_series_configs()
        rules = _get_pmi_rules()
        overrides = _get_pmi_overrides()
    except FileNotFoundError as exc:
        logger.error("SPGLOBAL_PMI: missing configuration (%s)", exc)
        zero_reason = "config_missing"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []
    except Exception:
        logger.exception("SPGLOBAL_PMI: failed to load configuration")
        zero_reason = "config_error"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []

    if not series_map:
        zero_reason = "config_missing"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []

    produced: List[Event] = []
    override_used = False
    for series_id in sorted(series_map.keys()):
        series = series_map[series_id]
        rule = rules.get(series_id)
        if not rule:
            continue
        releases = _estimate_pmi_releases_for_series(series, rule, overrides, start_utc, end_utc)
        if not releases:
            continue
        if not override_used:
            override_used = any(ev.extras.get("pmi_override") for ev in releases)
        produced.extend(releases)

    produced.sort(key=lambda ev: ev.date_time_utc)

    if not produced:
        zero_reason = "between_releases"
        _finalize_source_log(
            source_key,
            "rules",
            0,
            zero_reason=zero_reason,
            extra_meta={"config_hash": _get_pmi_config_hash()},
        )
        return []

    path_used = "rules+override" if override_used else "rules"
    _finalize_source_log(
        source_key,
        path_used,
        len(produced),
        extra_meta={"config_hash": _get_pmi_config_hash()},
    )
    return produced




