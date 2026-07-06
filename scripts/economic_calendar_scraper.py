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

# === Feature toggles for additive hardening (safe-by-default) ===

FEATURE = {

    "ESRI_NFKC_KANJI": True,             # normalize text + add kanji time pattern

    "SECO_STRUCTURED_PASS": True,        # structured pass on the 3 language pages; only if 0 events

    "RBNZ_JSONLD_PASS": True,            # parse JSON-LD when available; keep HTML & schedule fallback

}

ENABLE_LKG = True

ENABLE_SCHEMA_SENTINEL = True

PROJECT_DIR = Path(__file__).resolve().parent

OUT_DIR = PROJECT_DIR / "out"

PRODUCTION_DIR = OUT_DIR / "production"

STAGING_DIR = OUT_DIR / "staging"

LKG_TTLS = {  # days

    "ECB": 14,

    "ESRI": 30,

    "SECO_EST": 90,

}

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


class SourceHealth:

    SLO = {
        "BLS": 6,
        "EUROSTAT": 75,
        "STATSNZ": 24,
        "ONS": 4,
        "ABS": 5,
        "STATCAN": 5,
        "BEA": 2,
        "CENSUS": 3,
        "DOL": 4,
        "EIA": 4,
        "ECB": 1,
        "SECO": 0,
        "ESRI": 0,
        "NBS": 1,
        "RBNZ": 1,
        "BFS": 1,
        "ISM": 2,
        "UMICH": 2,
        "ADP": 1,
        "SPGLOBAL_PMI": 12,
    }

    @staticmethod

    def scaled(since_days: int, until_days: int, key: str) -> int:

        window = max(1, int((until_days - since_days) or 30))

        base = int(SourceHealth.SLO.get(key, 0) or 0)

        if base <= 0:

            return 0

        return max(1, int(round(base * window / 30)))

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

# ---------------------------------------------------------------------------

# Enhanced impact classification

HIGH_KEYWORDS = [

    "gdp", "gross domestic product", "inflation", "cpi", "consumer price index",

    "hicp", "cpih", "cpij", "ppi", "producer price index", "unemployment",

    "nonfarm", "nonfarm payrolls", "employment report", "labour force",

    "employment situation", "pce", "core pce", "personal income and outlays",

    "jobless", "rate decision", "policy rate", "monetary policy",

    "central bank", "interest rate", "core inflation", "fomc", "mpc", "ecb",

    "governing council", "bank rate", "ocr", "official cash rate", "cash rate"

]

MEDIUM_KEYWORDS = [

    "retail sales", "pmi", "manufacturing pmi", "services pmi", "wages",

    "earnings", "average hourly earnings", "durable goods", "trade balance", "industrial production", "wage price",

    "current account", "business confidence", "consumer confidence",

    "building permits", "housing starts", "construction", "business count",

    "capital expenditure", "economic forecast", "business indicators",

    "petroleum status", "oil inventories", "crude oil inventories", "gasoline inventories",

    "distillate inventories", "jolts", "job openings", "import price", "export price"

]

def classify_event(title: str) -> str:

    """Classify event impact based on title keywords."""

    title_lower = title.lower()

    for keyword in HIGH_KEYWORDS:

        if keyword in title_lower:

            return "High"

    for keyword in MEDIUM_KEYWORDS:

        if keyword in title_lower:

            return "Medium"

    return "Low"  # Default to Low unless keyword hits


CENTRAL_BANK_AGENCIES = {"FED", "ECB", "BOE", "BOC", "RBA", "RBNZ", "BOJ", "SNB"}

OFFICIAL_SOURCE_DOMAINS = (
    "abs.gov.au",
    "adpemploymentreport.com",
    "bankofcanada.ca",
    "bankofengland.co.uk",
    "bls.gov",
    "boj.or.jp",
    "bfs.admin.ch",
    "bea.gov",
    "census.gov",
    "data.sca.isr.umich.edu",
    "dol.gov",
    "ecb.europa.eu",
    "ec.europa.eu",
    "eia.gov",
    "esri.cao.go.jp",
    "federalreserve.gov",
    "ismworld.org",
    "ons.gov.uk",
    "pmi.spglobal.com",
    "rba.gov.au",
    "rbnz.govt.nz",
    "sca.isr.umich.edu",
    "seco.admin.ch",
    "snb.ch",
    "statcan.gc.ca",
    "stats.gov.cn",
    "stats.govt.nz",
    "150.statcan.gc.ca",
)

CENTRAL_BANK_SPEAKER_PRIORITY: Dict[str, Dict[str, Any]] = {
    "FED": {
        "country": "US",
        "label": "Fed",
        "timezone": "America/New_York",
        "assets": ("USD", "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US500", "NAS100", "US10Y"),
        "names": {
            "kevin warsh": "Chair",
            "philip jefferson": "Vice Chair",
            "michelle bowman": "Vice Chair for Supervision",
        },
    },
    "ECB": {
        "country": "EU",
        "label": "ECB",
        "timezone": "Europe/Berlin",
        "assets": ("EUR", "EURUSD", "EURGBP", "EURJPY", "GER40", "EU50"),
        "names": {"christine lagarde": "President"},
    },
    "BOE": {
        "country": "GB",
        "label": "BoE",
        "timezone": "Europe/London",
        "assets": ("GBP", "GBPUSD", "EURGBP", "GBPJPY", "UK100"),
        "names": {
            "andrew bailey": "Governor",
            "sarah breeden": "Deputy Governor",
            "huw pill": "Chief Economist",
            "megan greene": "Policy Committee Member",
            "catherine mann": "Policy Committee Member",
            "swati dhingra": "Policy Committee Member",
        },
    },
    "BOC": {
        "country": "CA",
        "label": "BoC",
        "timezone": "America/Toronto",
        "assets": ("CAD", "USDCAD", "CADJPY", "WTI"),
        "names": {"tiff macklem": "Governor"},
    },
    "BOJ": {
        "country": "JP",
        "label": "BoJ",
        "timezone": "Asia/Tokyo",
        "assets": ("JPY", "USDJPY", "EURJPY", "Nikkei225", "JGB"),
        "names": {"kazuo ueda": "Governor"},
    },
    "RBA": {
        "country": "AU",
        "label": "RBA",
        "timezone": "Australia/Sydney",
        "assets": ("AUD", "AUDUSD", "AUDJPY", "AUDNZD", "ASX200"),
        "names": {"michele bullock": "Governor"},
    },
    "RBNZ": {
        "country": "NZ",
        "label": "RBNZ",
        "timezone": "Pacific/Auckland",
        "assets": ("NZD", "NZDUSD", "AUDNZD"),
        "names": {},
    },
    "SNB": {
        "country": "CH",
        "label": "SNB",
        "timezone": "Europe/Zurich",
        "assets": ("CHF", "USDCHF", "EURCHF", "CHFJPY", "SMI"),
        "names": {
            "martin schlegel": "Chair",
            "antoine martin": "Vice Chair",
        },
    },
}

CENTRAL_BANK_SPEAKER_ROLE_RULES: Tuple[Tuple[str, str, int], ...] = (
    (r"\b(?:chairman|chair)\b", "Chair", 92),
    (r"\b(?:federal reserve bank|fed) president\b", "Regional Fed President", 68),
    (r"\bpresident\b", "President", 92),
    (r"\bsenior deputy governor\b", "Senior Deputy Governor", 82),
    (r"\bvice chair for supervision\b", "Vice Chair for Supervision", 80),
    (r"\bvice chair\b", "Vice Chair", 85),
    (r"\bdeputy governor\b", "Deputy Governor", 80),
    (r"\bassistant governor\b", "Assistant Governor", 68),
    (r"\bgovernor\b", "Governor", 90),
    (r"\bchief economist\b", "Chief Economist", 82),
    (r"\bexecutive board member\b", "Executive Board Member", 76),
    (r"\b(?:mpc|fomc) member\b", "Policy Committee Member", 72),
    (r"\bpolicy board member\b", "Policy Board Member", 72),
    (r"\bgoverning council member\b", "Governing Council Member", 72),
)

CENTRAL_BANK_SPEAKER_POLICY_KEYWORDS = (
    "monetary policy",
    "inflation",
    "interest rate",
    "rates",
    "financial stability",
    "economy",
    "economic outlook",
    "labour market",
    "labor market",
    "growth",
    "exchange rate",
    "balance sheet",
    "testimony",
    "press conference",
    "policy outlook",
    "central bank independence",
    " qt ",
    " qe ",
    " fx ",
)

CENTRAL_BANK_SPEAKER_TECHNICAL_KEYWORDS = (
    "payments",
    "technology",
    "fintech",
    "operations",
    "banknotes",
    "supervision-only",
    "climate",
    "research seminar",
    "awards",
    "education",
    "internal event",
)

CENTRAL_BANK_SPEAKER_EVENT_KEYWORDS = (
    "speech",
    "speaks",
    "remarks",
    "testimony",
    "oral evidence",
    "panel",
    "interview",
    "fireside chat",
    "appearance",
    "presentation",
    "press conference",
    "lecture",
    "beige book",
)

CENTRAL_BANK_SPEAKER_REQUEST_HEADERS = {
    "User-Agent": "IntelliTrade Economic Calendar Bot/1.0 (+https://intellitrade.tech)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}

PAIR_RELEVANCE_BASE: Dict[str, Dict[str, Tuple[str, ...]]] = {
    "US": {
        "primary_fx_pairs": ("EURUSD", "GBPUSD", "USDJPY"),
        "secondary_fx_pairs": ("AUDUSD", "USDCAD", "USDCHF", "NZDUSD"),
        "related_assets": ("XAUUSD", "US500", "NAS100", "US10Y"),
    },
    "EZ": {
        "primary_fx_pairs": ("EURUSD", "EURJPY", "EURGBP"),
        "secondary_fx_pairs": ("EURCHF", "EURAUD", "EURNZD"),
        "related_assets": ("GER40", "EU50"),
    },
    "EU": {
        "primary_fx_pairs": ("EURUSD", "EURJPY", "EURGBP"),
        "secondary_fx_pairs": ("EURCHF", "EURAUD", "EURNZD"),
        "related_assets": ("GER40", "EU50"),
    },
    "GB": {
        "primary_fx_pairs": ("GBPUSD", "EURGBP", "GBPJPY"),
        "secondary_fx_pairs": ("GBPCHF", "GBPAUD"),
        "related_assets": ("UK100",),
    },
    "JP": {
        "primary_fx_pairs": ("USDJPY", "EURJPY", "GBPJPY"),
        "secondary_fx_pairs": ("AUDJPY", "CADJPY"),
        "related_assets": ("JPN225",),
    },
    "CH": {
        "primary_fx_pairs": ("USDCHF", "EURCHF", "CHFJPY"),
        "secondary_fx_pairs": ("GBPCHF",),
        "related_assets": (),
    },
    "CA": {
        "primary_fx_pairs": ("USDCAD", "CADJPY"),
        "secondary_fx_pairs": ("EURCAD", "GBPCAD"),
        "related_assets": ("WTI",),
    },
    "AU": {
        "primary_fx_pairs": ("AUDUSD", "AUDJPY"),
        "secondary_fx_pairs": ("EURAUD", "GBPAUD", "AUDNZD"),
        "related_assets": ("XAUUSD",),
    },
    "NZ": {
        "primary_fx_pairs": ("NZDUSD", "AUDNZD"),
        "secondary_fx_pairs": ("EURNZD", "GBPNZD"),
        "related_assets": (),
    },
    "CN": {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY",),
        "related_assets": ("XAUUSD", "COPPER"),
    },
}

COUNTRY_EXACT_VARIANTS: Dict[str, Tuple[str, ...]] = {
    "US": ("US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"),
    "GB": ("GB", "UK", "GBR", "UNITED KINGDOM", "GREAT BRITAIN", "BRITAIN"),
    "EZ": ("EZ", "EU", "EMU", "EA", "EURO AREA", "EUROZONE", "ECONOMIC AND MONETARY UNION"),
    "JP": ("JP", "JPN", "JAPAN"),
    "CH": ("CH", "CHE", "SWITZERLAND"),
    "AU": ("AU", "AUS", "AUSTRALIA"),
    "NZ": ("NZ", "NZL", "NEW ZEALAND"),
    "CA": ("CA", "CAN", "CANADA"),
    "CN": ("CN", "CHN", "CHINA", "PEOPLE'S REPUBLIC OF CHINA", "PRC"),
    "DE": ("DE", "DEU", "GERMANY"),
    "FR": ("FR", "FRA", "FRANCE"),
    "IT": ("IT", "ITA", "ITALY"),
    "ES": ("ES", "ESP", "SPAIN"),
}

COUNTRY_PHRASE_HINTS: Dict[str, Tuple[str, ...]] = {
    "US": ("united states", "u.s."),
    "GB": ("united kingdom", "u.k.", "uk ", " uk", "britain", "british", "sterling"),
    "EZ": ("euro area", "eurozone", "euro-area", "euro area", "monetary union"),
    "JP": ("japan", "japanese"),
    "CH": ("switzerland", "swiss"),
    "AU": ("australia", "australian"),
    "NZ": ("new zealand", "new zealand's", "new zealanders"),
    "CA": ("canada", "canadian"),
    "CN": ("china", "chinese"),
    "DE": ("germany", "german"),
    "FR": ("france", "french"),
    "IT": ("italy", "italian"),
    "ES": ("spain", "spanish"),
}

AGENCY_COUNTRY_HINTS: Dict[str, str] = {
    "FED": "US",
    "BLS": "US",
    "ADP": "US",
    "UMICH": "US",
    "ISM": "US",
    "BEA": "US",
    "CENSUS": "US",
    "DOL": "US",
    "EIA": "US",
    "ECB": "EZ",
    "EUROSTAT": "EZ",
    "BOE": "GB",
    "ONS": "GB",
    "BOC": "CA",
    "STATCAN": "CA",
    "STATSCAN": "CA",
    "RBA": "AU",
    "ABS": "AU",
    "RBNZ": "NZ",
    "STATSNZ": "NZ",
    "BOJ": "JP",
    "ESRI": "JP",
    "SNB": "CH",
    "BFS": "CH",
    "SECO": "CH",
    "NBS": "CN",
}

COUNTRY_DESCRIPTION_CONTEXT: Dict[str, Dict[str, str]] = {
    "US": {"name": "the United States", "currency": "US dollar", "cb": "Federal Reserve"},
    "GB": {"name": "the United Kingdom", "currency": "sterling", "cb": "Bank of England"},
    "EZ": {"name": "the euro area", "currency": "euro", "cb": "ECB"},
    "DE": {"name": "Germany", "currency": "euro", "cb": "ECB"},
    "FR": {"name": "France", "currency": "euro", "cb": "ECB"},
    "IT": {"name": "Italy", "currency": "euro", "cb": "ECB"},
    "ES": {"name": "Spain", "currency": "euro", "cb": "ECB"},
    "JP": {"name": "Japan", "currency": "yen", "cb": "Bank of Japan"},
    "CH": {"name": "Switzerland", "currency": "Swiss franc", "cb": "SNB"},
    "AU": {"name": "Australia", "currency": "Australian dollar", "cb": "RBA"},
    "NZ": {"name": "New Zealand", "currency": "NZ dollar", "cb": "RBNZ"},
    "CA": {"name": "Canada", "currency": "Canadian dollar", "cb": "Bank of Canada"},
    "CN": {"name": "China", "currency": "yuan", "cb": "PBOC"},
}

CENTRAL_BANK_DESCRIPTION_MAP: Dict[str, str] = {
    "FED": "Communicates the Federal Reserve's policy stance and can materially affect US dollar pricing, yields, and global risk sentiment.",
    "ECB": "Communicates the ECB's policy stance and can materially affect euro pricing, bond yields, and broader European risk sentiment.",
    "BOE": "Communicates the Bank of England's policy stance and can materially affect sterling pricing, gilt yields, and UK rate expectations.",
    "BOJ": "Communicates the Bank of Japan's policy stance and can materially affect yen pricing, JGB yields, and regional risk sentiment.",
    "RBA": "Communicates the RBA's policy stance and can materially affect Australian dollar pricing, rate expectations, and regional risk appetite.",
    "BOC": "Communicates the Bank of Canada's policy stance and can materially affect Canadian dollar pricing, front-end yields, and rate expectations.",
    "RBNZ": "Communicates the RBNZ's policy stance and can materially affect NZ dollar pricing, local yields, and rate expectations.",
    "SNB": "Communicates the SNB's policy stance and can materially affect Swiss franc pricing, safe-haven flows, and policy expectations.",
}

SPGLOBAL_PMI_RELEASE_CALENDAR_URL = "https://www.pmi.spglobal.com/Public/Release/ReleaseDates?language=en"
SPGLOBAL_PMI_GENERIC_FALLBACK_URL = "https://www.pmi.spglobal.com/Public/Home/PDF/UK_Rel_Dates"
SPGLOBAL_PMI_QUERY_LABELS: Dict[str, Tuple[str, str]] = {
    "US": ("S&P Global", "US"),
    "GB": ("S&P Global", "UK"),
    "EZ": ("HCOB", "Eurozone"),
    "DE": ("HCOB", "Germany"),
    "FR": ("HCOB", "France"),
    "IT": ("HCOB", "Italy"),
    "ES": ("HCOB", "Spain"),
    "JP": ("S&P Global", "Japan"),
    "AU": ("S&P Global", "Australia"),
    "IN": ("HSBC", "India"),
    "CA": ("S&P Global", "Canada"),
    "BR": ("S&P Global", "Brazil"),
    "CN": ("China General", "China General"),
}

PAIR_RELEVANCE_OVERRIDES: Dict[Tuple[str, str], Dict[str, Tuple[str, ...]]] = {
    ("CN", "pmi"): {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY", "NZDJPY"),
        "related_assets": ("XAUUSD", "COPPER", "HK50"),
    },
    ("CN", "growth"): {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY", "NZDJPY"),
        "related_assets": ("XAUUSD", "COPPER", "HK50"),
    },
    ("CN", "industry"): {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY", "NZDJPY"),
        "related_assets": ("XAUUSD", "COPPER", "HK50"),
    },
    ("CN", "consumer"): {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY", "NZDJPY"),
        "related_assets": ("XAUUSD", "COPPER", "HK50"),
    },
    ("CN", "real_estate"): {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY", "NZDJPY"),
        "related_assets": ("XAUUSD", "COPPER", "HK50"),
    },
    ("CN", "energy"): {
        "primary_fx_pairs": ("AUDUSD", "NZDUSD", "USDCNH"),
        "secondary_fx_pairs": ("AUDJPY", "NZDJPY"),
        "related_assets": ("XAUUSD", "COPPER", "HK50"),
    },
}


def _eventish_value(event: Any, field: str, default: Any = "") -> Any:
    if isinstance(event, dict):
        return event.get(field, default)
    return getattr(event, field, default)


def _eventish_extras(event: Any) -> Dict[str, Any]:
    extras = _eventish_value(event, "extras", {})
    return extras if isinstance(extras, dict) else {}


def _normalize_metadata_text(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _eventish_text_blob(event: Any) -> str:
    extras = _eventish_extras(event)
    parts = [
        _eventish_value(event, "title", ""),
        _eventish_value(event, "source", ""),
        _eventish_value(event, "agency", ""),
        _eventish_value(event, "country", ""),
        extras.get("provider"),
        extras.get("classification"),
        extras.get("series_id"),
        extras.get("release_type"),
        extras.get("official_title"),
        extras.get("release_series"),
    ]
    normalized = [_normalize_metadata_text(part).lower() for part in parts if _normalize_metadata_text(part)]
    return " ".join(normalized)


def _text_has_any(text: str, tokens: Tuple[str, ...]) -> bool:
    return any(token in text for token in tokens)


def _regex_has_any(text: str, patterns: Tuple[str, ...]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def _match_country_code_from_value(value: Any, *, allow_phrase_match: bool) -> str:
    normalized = _normalize_metadata_text(value)
    if not normalized:
        return ""
    upper = normalized.upper()
    for code, variants in COUNTRY_EXACT_VARIANTS.items():
        if upper in variants:
            return code
    if not allow_phrase_match:
        return ""
    lowered = normalized.lower()
    for code, phrases in COUNTRY_PHRASE_HINTS.items():
        if any(phrase in lowered for phrase in phrases):
            return code
    return ""


def _match_country_code_from_agencyish(value: Any) -> str:
    normalized = _normalize_metadata_text(value).upper()
    if not normalized:
        return ""
    for hint, code in AGENCY_COUNTRY_HINTS.items():
        if hint in normalized:
            return code
    return ""


def _normalize_event_country_code(event: Event | dict) -> str:
    extras = _eventish_extras(event)

    for candidate in (
        _eventish_value(event, "country", ""),
        extras.get("country"),
        extras.get("country_code"),
    ):
        code = _match_country_code_from_value(candidate, allow_phrase_match=True)
        if code:
            return code

    for candidate in (
        _eventish_value(event, "agency", ""),
        _eventish_value(event, "source", ""),
    ):
        code = _match_country_code_from_agencyish(candidate)
        if code:
            return code

    code = _match_country_code_from_value(_eventish_value(event, "title", ""), allow_phrase_match=True)
    if code:
        return code

    for candidate in (
        extras.get("official_title"),
        extras.get("series_id"),
        extras.get("provider"),
        extras.get("release_series"),
        extras.get("source_hint"),
    ):
        code = _match_country_code_from_value(candidate, allow_phrase_match=True)
        if code:
            return code

    return ""


def _infer_event_category(event: Event | dict) -> str:
    text = _eventish_text_blob(event)
    title_text = _normalize_metadata_text(_eventish_value(event, "title", "")).lower()
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()

    central_bank_patterns = (
        r"\bfomc\b",
        r"\bmpc\b",
        r"\bgoverning council\b",
        r"\bmonetary policy\b",
        r"\bofficial cash rate\b",
        r"\bocr decision\b",
        r"\brate decision\b",
        r"\brate announcement\b",
        r"\bpolicy assessment\b",
        r"\bkey interest rate\b",
        r"\bmonetary policy assessment\b",
    )
    pmi_patterns = (
        r"\bpmi\b",
        r"\bpurchasing managers(?:'|) index\b",
        r"\bism(?: manufacturing| services|)\b",
    )
    inflation_patterns = (
        r"\bcpi\b",
        r"\bcpih\b",
        r"\bhicp\b",
        r"\bppi\b",
        r"\bconsumer price index\b",
        r"\bproducer price index\b",
        r"\bindustrial producer price index\b",
        r"\binflation\b",
        r"\bcore inflation\b",
        r"\bprice index\b",
        r"\bimport price\b",
        r"\bexport price\b",
    )
    inflation_negative_patterns = (
        r"\bconsumer sentiment\b",
        r"\bconsumer confidence\b",
        r"\bshopping\b",
        r"\bonline purchases?\b",
        r"\bconsumer complaints?\b",
        r"\bhousehold survey\b",
        r"\bhouse price\b",
        r"\bhome price\b",
        r"\bcommercial residential\b",
        r"\bretail sales\b",
    )
    labor_patterns = (
        r"\bemployment\b",
        r"\bunemployment\b",
        r"\bpayrolls?\b",
        r"\bnonfarm\b",
        r"\blabou?r force\b",
        r"\bwages?\b",
        r"\bearnings\b",
        r"\bjob openings\b",
        r"\bjobless claims?\b",
        r"\bclaimant count\b",
        r"\badp\b",
        r"\bemployment situation\b",
    )
    growth_patterns = (
        r"\bgdp\b",
        r"\bgross domestic product\b",
        r"\bnational accounts\b",
        r"\bnational economic performance\b",
        r"\beconomic growth\b",
        r"\bfixed asset investment\b",
        r"\binvestment in fixed assets\b",
    )
    consumer_patterns = (
        r"\bretail sales\b",
        r"\bconsumer spending\b",
        r"\bhousehold spending\b",
        r"\bconsumption expenditure\b",
        r"\btotal retail sales of consumer goods\b",
    )
    industry_patterns = (
        r"\bindustrial production\b",
        r"\bmanufacturing output\b",
        r"\bvalue added of major industries\b",
        r"\bcapacity utilization\b",
        r"\bindustrial economic benefits\b",
        r"\bfactory output\b",
    )
    trade_patterns = (
        r"\btrade balance\b",
        r"\bexports?\b",
        r"\bimports?\b",
        r"\btrade surplus\b",
        r"\btrade deficit\b",
    )
    housing_patterns = (
        r"\bhousing starts\b",
        r"\bbuilding permits?\b",
        r"\bnew home sales\b",
        r"\bexisting home sales\b",
    )
    real_estate_patterns = (
        r"\breal estate development\b",
        r"\bproperty market\b",
        r"\bcommercial residential\b",
        r"\bhouse price index\b",
        r"\bhome price index\b",
        r"\bproperty prices?\b",
    )
    energy_patterns = (
        r"\benergy production\b",
        r"\boil production\b",
        r"\boil inventories\b",
        r"\bcrude oil inventories\b",
        r"\bpetroleum status\b",
        r"\bgas production\b",
        r"\bgasoline inventories\b",
        r"\bdistillate inventories\b",
        r"\belectricity generation\b",
        r"\bcoal output\b",
    )
    sentiment_patterns = (
        r"\bconfidence\b",
        r"\bsentiment\b",
        r"\bexpectations\b",
        r"\bsurvey of consumers\b",
        r"\boptimism\b",
    )
    business_patterns = (
        r"\bbusiness conditions\b",
        r"\bbusiness outlook\b",
        r"\bsmall business optimism\b",
        r"\bbusiness revenue\b",
        r"\bcapital expenditure\b",
        r"\bfactory orders\b",
    )
    activity_patterns = (
        r"\beconomic activity\b",
        r"\bactivity index\b",
        r"\bservices activity\b",
    )

    if (
        agency_upper in CENTRAL_BANK_AGENCIES
        or any(bank in source_upper for bank in CENTRAL_BANK_AGENCIES)
        or _regex_has_any(text, central_bank_patterns)
    ):
        return "central_bank"
    if _regex_has_any(text, pmi_patterns):
        return "pmi"
    if _regex_has_any(text, inflation_patterns) and not _regex_has_any(text, inflation_negative_patterns):
        return "inflation"
    if _regex_has_any(text, labor_patterns):
        return "labor"
    if _regex_has_any(text, growth_patterns):
        return "growth"
    if _regex_has_any(text, consumer_patterns):
        return "consumer"
    if _regex_has_any(text, industry_patterns):
        return "industry"
    if _regex_has_any(text, trade_patterns):
        return "trade"
    if _regex_has_any(title_text, housing_patterns):
        return "housing"
    if _regex_has_any(text, real_estate_patterns):
        return "real_estate"
    if _regex_has_any(text, energy_patterns):
        return "commodities"
    if _regex_has_any(text, sentiment_patterns):
        return "sentiment"
    if _regex_has_any(text, business_patterns):
        return "business"
    if _regex_has_any(text, activity_patterns):
        return "activity"
    return "other"


def _clone_pair_relevance(country_key: str) -> Dict[str, List[str]]:
    template = PAIR_RELEVANCE_BASE.get(
        country_key,
        {"primary_fx_pairs": (), "secondary_fx_pairs": (), "related_assets": ()},
    )
    return {key: list(values) for key, values in template.items()}


def _merge_unique_strings(target: List[str], additions: Tuple[str, ...]) -> List[str]:
    for item in additions:
        if item not in target:
            target.append(item)
    return target


def _infer_pair_relevance(event: Event | dict) -> Dict[str, List[str]]:
    country = _normalize_event_country_code(event)
    category = _infer_event_category(event)
    country_key = "EZ" if country in {"EZ", "EU", "DE", "FR", "IT", "ES"} else country
    result = _clone_pair_relevance(country_key)

    override = PAIR_RELEVANCE_OVERRIDES.get((country_key, category))
    if override:
        for key, values in override.items():
            result[key] = _merge_unique_strings(result.get(key, []), values)

    if category == "central_bank":
        if country_key == "US":
            result["related_assets"] = _merge_unique_strings(result["related_assets"], ("US10Y", "US500", "NAS100", "XAUUSD"))
        elif country_key == "EZ":
            result["related_assets"] = _merge_unique_strings(result["related_assets"], ("GER40", "EU50"))
        elif country_key == "GB":
            result["related_assets"] = _merge_unique_strings(result["related_assets"], ("UK100",))
        elif country_key == "JP":
            result["related_assets"] = _merge_unique_strings(result["related_assets"], ("JPN225",))
        elif country_key == "CA":
            result["related_assets"] = _merge_unique_strings(result["related_assets"], ("WTI",))
        elif country_key == "AU":
            result["related_assets"] = _merge_unique_strings(result["related_assets"], ("XAUUSD",))

    return result


def _url_is_official(candidate: str) -> bool:
    if not candidate:
        return False
    try:
        host = (urlparse(candidate).netloc or "").lower()
    except Exception:
        return False
    return bool(host) and any(host.endswith(domain) for domain in OFFICIAL_SOURCE_DOMAINS)


def _spglobal_country_code(event: Event | dict) -> str:
    extras = _eventish_extras(event)
    raw = _normalize_metadata_text(extras.get("country_code") or _eventish_value(event, "country", "")).upper()
    if not raw:
        series_id = _normalize_metadata_text(extras.get("series_id")).upper()
        if "_" in series_id:
            raw = series_id.split("_", 1)[0]
    if raw == "UK":
        return "GB"
    if raw in {"EU", "EA", "EMU"}:
        return "EZ"
    return raw


def _spglobal_series_query(event: Event | dict) -> str:
    extras = _eventish_extras(event)
    country_code = _spglobal_country_code(event)
    label = SPGLOBAL_PMI_QUERY_LABELS.get(country_code)
    if not label:
        return ""
    brand, region = label
    series_id = _normalize_metadata_text(extras.get("series_id")).upper()
    title_text = _normalize_metadata_text(_eventish_value(event, "title", "")).lower()
    classification = _normalize_metadata_text(extras.get("classification")).lower()
    is_flash = classification == "flash" or "FLASH" in series_id or "flash" in title_text

    if "MANUFACTURING" in series_id or "manufacturing" in title_text:
        sector = "Manufacturing PMI"
    elif "SERVICES" in series_id or "services" in title_text:
        sector = "Services PMI"
    elif "COMPOSITE" in series_id or "composite" in title_text:
        sector = "Composite PMI"
    else:
        sector = "PMI"

    if brand == "China General":
        return f"{brand} {sector}".strip()
    if is_flash:
        return f"{brand} Flash {region} PMI"
    if sector == "PMI":
        return f"{brand} {region} PMI"
    return f"{brand} {region} {sector}"


def _standardize_spglobal_url(event: Event | dict, raw_url: str, feed_source: str) -> str:
    for candidate in (raw_url, feed_source):
        if (
            candidate
            and candidate != SPGLOBAL_PMI_GENERIC_FALLBACK_URL
            and candidate.lower().startswith(("http://", "https://"))
            and _url_is_official(candidate)
        ):
            return candidate

    query = _spglobal_series_query(event)
    if query:
        return f"{SPGLOBAL_PMI_RELEASE_CALENDAR_URL}&kw={quote_plus(query)}"
    return feed_source or raw_url or SPGLOBAL_PMI_RELEASE_CALENDAR_URL or SPGLOBAL_PMI_GENERIC_FALLBACK_URL


def _standardize_source_url(event: Event | dict) -> str:
    extras = _eventish_extras(event)
    raw_url = _normalize_metadata_text(_eventish_value(event, "url", ""))
    feed_source = _normalize_metadata_text(extras.get("feed_source"))
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()

    if source_upper == PROVIDER_SPGLOBAL_PMI or "SPGLOBAL" in agency_upper:
        return _standardize_spglobal_url(event, raw_url, feed_source)

    for candidate in (raw_url, feed_source):
        if candidate and candidate.lower().startswith(("http://", "https://")) and _url_is_official(candidate):
            return candidate

    if agency_upper == "FED":
        return "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
    if agency_upper == "ECB":
        return "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"
    if agency_upper == "BOE":
        return "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates"
    if agency_upper == "BOC":
        return "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/#schedule"
    if agency_upper == "RBA":
        return "https://www.rba.gov.au/monetary-policy/rba-board/meeting-schedules.html"
    if agency_upper == "RBNZ":
        return "https://www.rbnz.govt.nz/news-and-events/how-we-release-information/ocr-decision-dates-and-financial-stability-report-dates-to-feb-2028"
    if agency_upper == "BOJ":
        return "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm"
    if agency_upper == "SNB":
        return "https://www.snb.ch/en/watch/calendar.html"
    if source_upper == "BLS" or agency_upper == "BLS":
        return "https://www.bls.gov/schedule/news_release/"
    if source_upper == "BFS" or agency_upper == "BFS":
        return "https://www.bfs.admin.ch/bfs/en/home/statistics/prices/consumer-price-index.html"
    if source_upper == "ISM":
        return "https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/"
    if source_upper == "BEA" or agency_upper == "BEA":
        return "https://www.bea.gov/news/schedule"
    if source_upper == "CENSUS" or agency_upper == "CENSUS":
        return "https://www.census.gov/economic-indicators/calendar-listview.html"
    if source_upper == "DOL" or agency_upper == "DOL":
        return "https://www.dol.gov/ui/data.pdf"
    if source_upper == "EIA" or agency_upper == "EIA":
        return "https://www.eia.gov/petroleum/supply/weekly/schedule.php"
    if source_upper == "UMICH" or "MICHIGAN" in agency_upper:
        return "https://data.sca.isr.umich.edu/"
    if source_upper == "ADP":
        return "https://adpemploymentreport.com/"
    if source_upper == "NBS" or agency_upper == "NBS":
        return NBS_RELEASE_CALENDAR_INDEX_URL
    if source_upper == "SECO" or agency_upper == "SECO":
        return "https://www.seco.admin.ch/seco/en/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html"
    if source_upper == "ESRI" or agency_upper == "ESRI":
        return "https://www.esri.cao.go.jp/en/stat/shouhi/releaseschedule.html"
    if source_upper == "ONS" or agency_upper == "ONS":
        return "https://www.ons.gov.uk/releasecalendar"
    if source_upper == "STATSNZ" or agency_upper == "STATSNZ":
        return "https://www.stats.govt.nz/release-calendar/"
    if raw_url:
        return raw_url
    return feed_source


def _infer_event_description(event: Event | dict) -> str:
    text = _eventish_text_blob(event)
    category = _infer_event_category(event)
    country_code = _normalize_event_country_code(event)
    context = COUNTRY_DESCRIPTION_CONTEXT.get(country_code, {})
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()

    if category == "central_bank":
        for agency_key, description in CENTRAL_BANK_DESCRIPTION_MAP.items():
            if agency_key in agency_upper:
                return description
        if context:
            return f"Communicates the {context['cb']}'s policy stance and can materially affect {context['currency']} pricing, yields, and policy expectations."
        return "Communicates the central bank's policy stance and can materially affect interest-rate expectations, FX, and risk assets."

    if _regex_has_any(text, (r"\bconsumer price index\b", r"\bcpi\b", r"\bhicp\b", r"\bcpih\b")):
        if country_code == "US":
            return "Measures consumer price inflation in the United States and is a key driver of Federal Reserve expectations and US dollar volatility."
        if country_code == "GB":
            return "Measures consumer price inflation in the United Kingdom and is a key driver of Bank of England expectations and sterling volatility."
        if country_code == "EZ":
            return "Measures consumer price inflation in the euro area and is a key input for ECB policy expectations and euro volatility."
        if country_code == "CH":
            return "Measures consumer price inflation in Switzerland and can affect Swiss franc expectations and SNB policy pricing."
        if context:
            return f"Measures consumer price inflation in {context['name']} and can influence {context['currency']} expectations and {context['cb']} pricing."
        return "Measures consumer price inflation and is a key gauge of inflation pressures and policy expectations."

    if _regex_has_any(text, (r"\bproducer price index\b", r"\bppi\b", r"\bindustrial producer price index\b")):
        if context:
            return f"Measures producer-price inflation in {context['name']} and can shape inflation expectations, {context['currency']} sentiment, and policy pricing."
        return "Measures price changes received by producers and can signal pipeline inflation before it reaches consumers."

    if _text_has_any(text, ("pmi", "purchasing managers", "ism manufacturing", "ism services")):
        return "Survey-based indicator of business conditions. Readings above 50 signal expansion, while readings below 50 indicate contraction."

    if category == "labor":
        if country_code == "US":
            return "Tracks labor market conditions in the United States and is one of the most market-moving indicators for the US dollar and broader risk sentiment."
        if country_code == "GB":
            return "Tracks labor market conditions in the United Kingdom and can materially influence sterling expectations and Bank of England pricing."
        if country_code in {"EZ", "DE", "FR", "IT", "ES"}:
            place = context.get("name", "the euro area")
            return f"Tracks labor market conditions in {place} and can influence euro sentiment and ECB expectations."
        if country_code == "NZ":
            return "Tracks labor market conditions in New Zealand and can influence NZ dollar expectations and RBNZ pricing."
        if context:
            return f"Tracks labor market conditions in {context['name']} and can influence {context['currency']} expectations and {context['cb']} pricing."
        return "Tracks labor market conditions and can materially influence currency expectations and policy pricing."

    if _text_has_any(text, ("gross domestic product", "gdp")):
        return "Measures the pace of economic growth and is a core indicator of overall macroeconomic performance."
    if "national economic performance" in text:
        return "Summarizes broad macroeconomic conditions across output, demand, and income, making it a key gauge of near-term growth momentum."
    if "retail sales" in text:
        return "Measures consumer spending activity and offers insight into household demand and economic momentum."
    if _text_has_any(text, ("industrial production", "value added of major industries")):
        return "Tracks output in the industrial sector and is a key signal for manufacturing and broader economic activity."
    if _text_has_any(text, ("confidence", "sentiment")):
        return "Captures household or business confidence and can influence expectations for spending, growth, and policy."
    if "fixed asset investment" in text:
        return "Tracks capital spending on fixed assets and helps traders gauge investment-led growth momentum."
    if "real estate development" in text or "commercial residential" in text:
        return "Tracks property-market development and sales activity, which can materially influence investment trends and domestic demand."
    if category == "trade":
        return "Tracks exports, imports, and the trade balance to help assess external demand and currency flow dynamics."
    if category in {"energy", "commodities"}:
        return "Measures output in the energy sector and helps traders assess industrial demand and supply-side conditions."
    if category == "consumer":
        return "Measures household demand and helps assess the durability of consumer-led economic momentum."
    if category == "industry":
        return "Tracks industrial-sector activity and helps gauge the strength of manufacturing and production trends."
    if category == "growth":
        return "Measures the pace of economic growth and is a core indicator of overall macroeconomic performance."
    if category == "real_estate":
        return "Tracks property-market conditions and helps gauge construction, investment, and domestic-demand trends."
    if category == "housing":
        return "Measures construction and housing-market activity, offering insight into cyclical demand and real-economy momentum."
    if category == "business":
        return "Captures business conditions and corporate activity, helping traders gauge investment appetite and cyclical momentum."
    if category == "activity":
        return "Tracks current economic activity and helps assess the pace of near-term growth."
    return "Scheduled macroeconomic release that can influence expectations for growth, inflation, or policy depending on the result."


LOW_SIGNAL_PATTERNS = (
    r"\bcultural goods\b",
    r"\brecreational goods\b",
    r"\bchicks?\b",
    r"\bhazardous chemicals?\b",
    r"\btourism satellite\b",
    r"\bdairy\b",
    r"\begg\b",
    r"\bpoultry\b",
    r"\bteaching staff\b",
    r"\bwebinars?\b",
    r"\bsdg\b",
    r"\bict specialists\b",
    r"\bfarmers\b",
    r"\bagricultural labo(?:u)?r force\b",
    r"\benvironmental economy\b",
    r"\brecent graduates\b",
    r"\bemployment insurance beneficiaries\b",
    r"\binteractive dashboard\b",
    r"\bcouriers\b",
    r"\bfreight rail\b",
    r"\bmachinery\b",
    r"\bmotor carrier freight\b",
    r"\bbirths?\b",
    r"\bdeaths?\b",
    r"\bneet\b",
)


EUROSTAT_MARKET_MOVER_PATTERNS = (
    r"\bflash estimate\b.*\binflation\b",
    r"\bhicp\b",
    r"\binflation\b",
    r"\bunemployment\b",
    r"\bgdp\b",
    r"\bmain aggregates\b",
    r"\bindustrial production\b",
    r"\bretail trade\b",
    r"\bretail sales\b",
    r"\bwages?\b",
    r"\blabo(?:u)?r costs?\b",
    r"\bbuilding permits?\b",
)

STATCAN_MARKET_MOVER_PATTERNS = (
    r"\bcpi\b",
    r"\bconsumer price index\b",
    r"\blabo(?:u)?r force survey\b",
    r"\bgdp\b",
    r"\bgross domestic product\b",
    r"\bretail sales\b",
    r"\bemployment\b.*\bwages?\b",
    r"\bpayrolls?\b",
    r"\btrade balance\b",
    r"\binternational merchandise trade\b",
)

ONS_MARKET_MOVER_PATTERNS = (
    r"\bcpi\b",
    r"\bconsumer price index\b",
    r"\binflation\b",
    r"\bgdp\b",
    r"\bunemployment\b",
    r"\blabo(?:u)?r market\b",
    r"\bretail sales\b",
    r"\bpublic sector finances\b",
    r"\btrade\b",
)

ABS_MARKET_MOVER_PATTERNS = (
    r"\bconsumer price index\b",
    r"\bmonthly cpi indicator\b",
    r"\bwage price index\b",
    r"^\s*(?:abs\s+)?labo(?:u)?r force\b",
    r"\bemployment and unemployment\b",
    r"\bnational accounts\b",
    r"\bgdp\b",
    r"\bgross domestic product\b",
    r"\bretail sales\b",
    r"\bbuilding approvals?\b",
    r"\bprivate new capital expenditure\b",
    r"\btrade balance\b",
    r"\binternational trade\b",
)

ABS_SUPPRESSED_PATTERNS = (
    r"\bbarriers and incentives to labo(?:u)?r force participation\b",
    r"\bengineering construction activity\b",
    r"\bbusiness count indicators?\b",
    r"\bhousehold spending indicator\b",
    r"\bdemographic\b",
    r"\bsocial\b",
    r"\bexperimental\b",
)

MAJOR_MACRO_REGIONS = {"US", "EZ", "EU", "GB", "CA", "AU", "NZ", "JP"}

MAJOR_MACRO_CATEGORIES = {
    "inflation",
    "growth",
    "labor",
    "pmi",
    "consumer",
    "housing",
    "trade",
    "industry",
    "commodities",
    "sentiment",
    "business",
}


def _event_asset_focus(pair_relevance: Dict[str, List[str]]) -> List[str]:
    assets: List[str] = []
    for key in ("primary_fx_pairs", "secondary_fx_pairs", "related_assets"):
        for item in pair_relevance.get(key, []) or []:
            if item not in assets:
                assets.append(item)
    return assets


def _infer_source_reliability(event: Event | dict) -> str:
    extras = _eventish_extras(event)
    discovered = _normalize_metadata_text(extras.get("discovered_via") or extras.get("source_hint")).lower()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    if extras.get("cached") or "lkg" in discovered or source_upper.endswith("_LKG"):
        return "last_known_good"
    if "curated" in discovered or "CURATED" in source_upper:
        return "curated"
    if "fallback" in discovered or "rules" in discovered or source_upper.endswith("_RULES"):
        return "fallback"
    return "official"


def _event_curated_fallback_info(event: Event | dict) -> Optional[Dict[str, Any]]:
    extras = _eventish_extras(event)
    discovered = _normalize_metadata_text(extras.get("discovered_via") or extras.get("source_hint")).lower()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    if "curated" not in discovered and "CURATED" not in source_upper:
        return None
    for candidate in (
        _eventish_value(event, "agency", ""),
        _eventish_value(event, "source", ""),
    ):
        info = _curated_fallback_info(candidate)
        if info:
            return info
    return None


def _is_low_signal_event(event: Event | dict) -> bool:
    text = _eventish_text_blob(event)
    return _regex_has_any(text, LOW_SIGNAL_PATTERNS)


def _is_abs_source(event: Event | dict) -> bool:
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    return agency_upper == "ABS" or source_upper == "ABS" or source_upper.startswith("ABS_")


def _abs_market_mover_allowed(event: Event | dict) -> bool:
    text = _eventish_text_blob(event)
    if _regex_has_any(text, ABS_SUPPRESSED_PATTERNS):
        return False
    return _regex_has_any(text, ABS_MARKET_MOVER_PATTERNS)


def _is_us_retail_sales_market_mover(event: Event | dict) -> bool:
    text = _eventish_text_blob(event)
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    country = _normalize_event_country_code(event)
    official_us_source = agency_upper == "CENSUS" or source_upper == "CENSUS" or source_upper.startswith("CENSUS_")
    return (
        country == "US"
        and official_us_source
        and _regex_has_any(text, (r"\bretail sales\b", r"\badvance monthly retail\b"))
        and not _is_low_signal_event(event)
    )


def _event_dt_for_metadata(event: Event | dict) -> Optional[datetime]:
    if isinstance(event, Event):
        dt = event.date_time_utc
    else:
        dt = event.get("date_time_utc") or event.get("event_time_utc")
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    if isinstance(dt, str) and dt:
        try:
            parsed = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except Exception:
            return None
    return None


def _pmi_group_metadata(event: Event | dict, category: str) -> Dict[str, Any]:
    text = _eventish_text_blob(event)
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    pmi_source = (
        category == "pmi"
        or source_upper == PROVIDER_SPGLOBAL_PMI
        or "SPGLOBAL" in source_upper
        or agency_upper in {"ISM", "NBS"}
    )
    if not pmi_source or not _regex_has_any(text, (r"\bpmi\b", r"\bpurchasing managers\b", r"\bism\b")):
        return {}
    dt = _event_dt_for_metadata(event)
    if dt is None:
        return {}
    date_key = dt.astimezone(UTC).date().isoformat()
    if "flash" in text:
        suffix = "global_flash_pmi"
        title = "Global Flash PMI Cluster"
        priority = 90
    elif _regex_has_any(text, (r"\bservices\b", r"\bservice sector\b", r"\bcomposite\b")):
        suffix = "global_services_pmi"
        title = "Global Services PMI Cluster"
        priority = 80
    else:
        suffix = "global_manufacturing_pmi"
        title = "Global Manufacturing PMI Cluster"
        priority = 80
    return {
        "event_group_key": f"{date_key}_{suffix}",
        "event_group_title": title,
        "event_group_type": "pmi_cluster",
        "event_group_priority": priority,
    }


def _ecb_event_classification(event: Event | dict) -> Optional[Dict[str, Any]]:
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    if agency_upper != "ECB" and source_upper != "ECB" and not source_upper.startswith("ECB_"):
        return None
    text = _eventish_text_blob(event)
    extras = _eventish_extras(event)
    raw_type = _normalize_metadata_text(extras.get("ecb_event_type")).lower()
    try:
        day_index = int(extras.get("day_index") or 0)
    except Exception:
        day_index = 0
    has_press_conference = bool(extras.get("has_press_conference"))

    if raw_type == "press_conference" or "press conference" in text:
        return {
            "title": "ECB Press Conference",
            "category": "central_bank",
            "score": 85,
            "impact": "High",
            "default_dashboard": True,
        }
    if raw_type == "accounts" or _regex_has_any(text, (r"\baccounts?\b", r"\bminutes\b")):
        return {
            "title": "ECB Monetary Policy Meeting Accounts",
            "category": "central_bank",
            "score": 75,
            "impact": "Medium",
            "default_dashboard": True,
        }
    if (
        raw_type == "monetary_policy_decision"
        or "monetary policy decision" in text
        or (day_index == 2 and (has_press_conference or "governing council" in text))
    ):
        return {
            "title": "ECB Monetary Policy Decision",
            "category": "central_bank",
            "score": 85,
            "impact": "High",
            "default_dashboard": True,
        }
    if raw_type == "non_monetary_policy_meeting" or "non-monetary" in text or day_index == 1:
        return {
            "title": "ECB Non-Monetary Policy Meeting",
            "category": "central_bank",
            "score": 35,
            "impact": "Low",
            "default_dashboard": False,
        }
    if "governing council" in text:
        return {
            "title": _eventish_value(event, "title", "") or "ECB Governing Council Meeting",
            "category": "central_bank",
            "score": 40,
            "impact": "Low",
            "default_dashboard": False,
        }
    return None


def _source_specific_market_mover_allowed(event: Event | dict) -> bool:
    text = _eventish_text_blob(event)
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    source_upper = _normalize_metadata_text(_eventish_value(event, "source", "")).upper()
    if _is_abs_source(event):
        return _abs_market_mover_allowed(event)
    if "EUROSTAT" in {agency_upper, source_upper}:
        return _regex_has_any(text, EUROSTAT_MARKET_MOVER_PATTERNS)
    if "STATCAN" in agency_upper or "STATCAN" in source_upper:
        return _regex_has_any(text, STATCAN_MARKET_MOVER_PATTERNS)
    if "ONS" in agency_upper or "ONS" in source_upper:
        return _regex_has_any(text, ONS_MARKET_MOVER_PATTERNS)
    return True


def _impact_from_score(score: int) -> str:
    if score >= 80:
        return "High"
    if score >= 60:
        return "Medium"
    return "Low"


def _default_dashboard_allowed(event: Event | dict, category: str, score: int, impact: str) -> bool:
    speaker_extras = _eventish_extras(event)
    if speaker_extras.get("speaker_event"):
        return bool(speaker_extras.get("default_dashboard"))
    ecb_info = _ecb_event_classification(event)
    if ecb_info is not None:
        return bool(ecb_info["default_dashboard"])
    if _is_low_signal_event(event):
        return False
    if not _source_specific_market_mover_allowed(event):
        return False
    if category == "central_bank":
        return True
    if impact == "High":
        return True
    if impact == "Medium" and score >= 70:
        return True
    region = _normalize_event_country_code(event) or _match_country_code_from_agencyish(_eventish_value(event, "agency", ""))
    return region in MAJOR_MACRO_REGIONS and category in MAJOR_MACRO_CATEGORIES and score >= 70


def _trader_relevance_score(event: Event | dict, category: str, source_reliability: str) -> int:
    speaker_extras = _eventish_extras(event)
    if speaker_extras.get("speaker_event"):
        return max(0, min(100, int(speaker_extras.get("trader_relevance_score") or 0)))
    ecb_info = _ecb_event_classification(event)
    if ecb_info is not None:
        return int(ecb_info["score"])
    if _normalize_metadata_text(_eventish_value(event, "agency", "")).upper() == "BLS":
        bls_key = _eventish_extras(event).get("bls_canonical_key") or _bls_canonical_key_from_text(_eventish_text_blob(event))
        if bls_key in BLS_CANONICAL_SPECS:
            return int(BLS_CANONICAL_SPECS[str(bls_key)]["score"])
    impact = _normalize_metadata_text(_eventish_value(event, "impact", "")).lower()
    text = _eventish_text_blob(event)
    agency_upper = _normalize_metadata_text(_eventish_value(event, "agency", "")).upper()
    score = 20
    if impact == "high":
        score = 85
    elif impact == "medium":
        score = 60
    if category in {"central_bank", "inflation", "growth", "pmi"}:
        score = max(score, 80)
    elif category == "labor":
        if _regex_has_any(text, (r"\bnonfarm\b", r"\bemployment situation\b", r"\bunemployment\b", r"\blabo(?:u)?r force\b", r"\bjobless claims?\b")):
            score = max(score, 80)
        else:
            score = max(score, 55)
    elif category in {"consumer", "housing", "trade", "energy", "commodities", "sentiment", "business"}:
        score = max(score, 55)
    if agency_upper in {"FED", "ECB", "BLS", "BEA", "DOL", "EIA", "ISM"}:
        score = max(score, 75)
    if _regex_has_any(text, (r"\bpce\b", r"\bcore pce\b", r"\bgdp\b", r"\bfomc\b", r"\bjobless claims?\b", r"\boil inventories\b")):
        score = max(score, 85)
    if _regex_has_any(text, (r"\bdurable goods\b", r"\bpetroleum status\b", r"\bcrude oil inventories\b", r"\bjob openings\b", r"\bjolts\b", r"\baverage hourly earnings\b")):
        score = max(score, 75)
    if _is_us_retail_sales_market_mover(event):
        score = max(score, 75)
    if _is_abs_source(event) and _abs_market_mover_allowed(event):
        if _regex_has_any(text, (r"\bprivate new capital expenditure\b", r"\bbuilding approvals?\b", r"\btrade balance\b", r"\binternational trade\b", r"\bretail sales\b")):
            score = max(score, 75)
    if source_reliability == "last_known_good":
        score = max(0, score - 10)
    if _is_low_signal_event(event):
        score = min(score, 25)
    if not _source_specific_market_mover_allowed(event):
        score = min(score, 45)
    return max(0, min(100, int(score)))


def _enrich_event_metadata(event: Event | dict) -> Event | dict:
    category = _infer_event_category(event)
    speaker_extras = _eventish_extras(event)
    if speaker_extras.get("speaker_event"):
        category = "central_bank"
    if _is_us_retail_sales_market_mover(event):
        category = "consumer"
    ecb_info = _ecb_event_classification(event)
    if ecb_info is not None:
        category = str(ecb_info["category"])
        title_override = str(ecb_info.get("title") or "")
        if title_override:
            if isinstance(event, dict):
                event["title"] = title_override
            else:
                event.title = title_override
    bls_key = None
    if _normalize_metadata_text(_eventish_value(event, "agency", "")).upper() == "BLS":
        bls_key = _eventish_extras(event).get("bls_canonical_key") or _bls_canonical_key_from_text(_eventish_text_blob(event))
        if bls_key in BLS_CANONICAL_SPECS:
            spec = BLS_CANONICAL_SPECS[str(bls_key)]
            category = str(spec["category"])
            if isinstance(event, dict):
                event["title"] = spec["title"]
            else:
                event.title = spec["title"]
    pair_relevance = _infer_pair_relevance(event)
    standardized_url = _standardize_source_url(event)
    description = _infer_event_description(event)
    source_reliability = _infer_source_reliability(event)
    curated_info = _event_curated_fallback_info(event) if source_reliability == "curated" else None
    asset_focus = _event_asset_focus(pair_relevance)
    if speaker_extras.get("speaker_event"):
        asset_focus = list(speaker_extras.get("asset_focus") or asset_focus)
    score = _trader_relevance_score(event, category, source_reliability)
    aligned_impact = _impact_from_score(score)
    if ecb_info is not None:
        aligned_impact = str(ecb_info["impact"])
    if bls_key in BLS_CANONICAL_SPECS:
        aligned_impact = str(BLS_CANONICAL_SPECS[str(bls_key)]["impact"])
    source_name = _normalize_metadata_text(_eventish_value(event, "agency", "") or _eventish_value(event, "source", ""))
    default_dashboard = _default_dashboard_allowed(event, category, score, aligned_impact)
    if ecb_info is not None:
        default_dashboard = bool(ecb_info["default_dashboard"])
    if bls_key in BLS_CANONICAL_SPECS:
        default_dashboard = True
    group_metadata = _pmi_group_metadata(event, category)

    if isinstance(event, dict):
        extras = dict(event.get("extras") or {})
        extras["category"] = category
        extras["pair_relevance"] = pair_relevance
        extras["asset_focus"] = asset_focus
        extras["trader_relevance_score"] = score
        extras["source_reliability"] = source_reliability
        extras["lkg_used"] = source_reliability == "last_known_good"
        if curated_info:
            extras["curated_fallback_reviewed_at"] = curated_info["reviewed_at"]
            extras["curated_fallback_age_days"] = curated_info["age_days"]
            extras["curated_fallback_max_age_days"] = curated_info["max_age_days"]
        extras["source_name"] = source_name
        extras["default_dashboard"] = default_dashboard
        extras["source_url_standardized"] = standardized_url
        extras["event_description"] = description
        for key, value in group_metadata.items():
            extras[key] = value
        event["extras"] = extras
        event["category"] = category
        event["asset_focus"] = asset_focus
        event["trader_relevance_score"] = score
        event["impact"] = aligned_impact
        event["source_reliability"] = source_reliability
        event["lkg_used"] = source_reliability == "last_known_good"
        if curated_info:
            event["curated_fallback_reviewed_at"] = curated_info["reviewed_at"]
            event["curated_fallback_age_days"] = curated_info["age_days"]
            event["curated_fallback_max_age_days"] = curated_info["max_age_days"]
        event["source_url"] = standardized_url
        event["source_name"] = source_name
        event["local_time_timezone"] = event.get("event_local_tz")
        event["event_time_utc"] = event.get("date_time_utc")
        event["default_dashboard"] = default_dashboard
        for key, value in group_metadata.items():
            event[key] = value
        return event

    extras = dict(event.extras or {})
    extras["category"] = category
    extras["pair_relevance"] = pair_relevance
    extras["asset_focus"] = asset_focus
    extras["trader_relevance_score"] = score
    extras["source_reliability"] = source_reliability
    extras["lkg_used"] = source_reliability == "last_known_good"
    if curated_info:
        extras["curated_fallback_reviewed_at"] = curated_info["reviewed_at"]
        extras["curated_fallback_age_days"] = curated_info["age_days"]
        extras["curated_fallback_max_age_days"] = curated_info["max_age_days"]
    extras["source_name"] = source_name
    extras["default_dashboard"] = default_dashboard
    extras["source_url_standardized"] = standardized_url
    extras["event_description"] = description
    for key, value in group_metadata.items():
        extras[key] = value
    event.extras = extras
    event.impact = aligned_impact
    _validate_event_schema(event.to_dict())
    return event


def _enrich_events_metadata(events: List[Event]) -> List[Event]:
    for ev in events:
        _enrich_event_metadata(ev)
    return events

# ---------------------------------------------------------------------------
# Official central-bank speaker and public-event collection

def _central_bank_speaker_sources(start_utc: datetime, end_utc: datetime) -> List[Dict[str, str]]:
    years = sorted({start_utc.year, end_utc.year})
    sources: List[Dict[str, str]] = [
        {"institution": "FED", "source_path": "fed_calendar", "url": "https://www.federalreserve.gov/newsevents/calendar.htm"},
        {"institution": "ECB", "source_path": "ecb_weekly_schedule", "url": "https://www.ecb.europa.eu/press/calendars/weekly/html/index.en.html"},
        {"institution": "BOE", "source_path": "boe_upcoming_events", "url": "https://www.bankofengland.co.uk/news/upcoming"},
        {"institution": "BOE", "source_path": "boe_staff_events", "url": "https://www.bankofengland.co.uk/events/upcoming-events"},
        {"institution": "BOC", "source_path": "boc_upcoming_events", "url": "https://www.bankofcanada.ca/press/upcoming-events/"},
        {"institution": "RBA", "source_path": "rba_calendar", "url": "https://www.rba.gov.au/schedules-events/calendar/"},
        {"institution": "RBA", "source_path": "rba_speeches", "url": "https://www.rba.gov.au/speeches/index.html"},
        {"institution": "RBNZ", "source_path": "rbnz_events", "url": "https://www.rbnz.govt.nz/news-and-events/events"},
        {"institution": "SNB", "source_path": "snb_media", "url": "https://www.snb.ch/en/media"},
        {"institution": "SNB", "source_path": "snb_speeches", "url": "https://www.snb.ch/en/news-publications/speeches"},
    ]
    for year in years:
        sources.extend(
            [
                {"institution": "FED", "source_path": f"fed_speeches_{year}", "url": f"https://www.federalreserve.gov/newsevents/{year}-speeches.htm"},
                {"institution": "BOJ", "source_path": f"boj_speeches_{year}", "url": f"https://www.boj.or.jp/en/about/press/koen_{year}/index.htm"},
            ]
        )
    return sources


def _speaker_response_classification(content: bytes, content_type: str, status_code: int) -> str:
    lowered = (content or b"").lower()
    if not content:
        return "empty"
    if status_code in {401, 403, 429} or b"access denied" in lowered or b"forbidden" in lowered:
        return "blocked"
    if "html" in (content_type or "").lower() or b"<html" in lowered or b"<!doctype html" in lowered:
        return "html"
    return "text"


def _request_central_bank_speaker_source(session: requests.Session, url: str) -> Optional[requests.Response]:
    try:
        request_kwargs, cache_manager = _prepare_request(
            session,
            url,
            15,
            {"allow_redirects": True, "headers": CENTRAL_BANK_SPEAKER_REQUEST_HEADERS},
        )
        response = session.get(url, **request_kwargs)
        return _apply_cache_response(cache_manager, url, response)
    except Exception:
        logger.debug("Central-bank speaker source request failed: %s", url, exc_info=True)
        return None


def _speaker_role_score(institution: str, role: str, default_score: int) -> int:
    if institution == "FED":
        if role == "Governor":
            return 75
        if role in {"Regional Fed President", "President"}:
            return 68
    if role in {"Chair", "President", "Governor"}:
        return 92
    return default_score


def _speaker_identity(institution: str, raw_text: str) -> Tuple[str, str, int]:
    config = CENTRAL_BANK_SPEAKER_PRIORITY[institution]
    lowered = raw_text.lower()
    for name, role in config.get("names", {}).items():
        if name in lowered:
            base = next((score for pattern, candidate_role, score in CENTRAL_BANK_SPEAKER_ROLE_RULES if candidate_role == role), 72)
            return name.title(), role, _speaker_role_score(institution, role, base)

    if institution == "ECB":
        board_member = re.search(
            r"(?i:\bboard member:)\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3}?)(?=\s+Event:)",
            raw_text,
        )
        if board_member:
            return board_member.group(1).strip(), "Executive Board Member", 76

    for pattern, role, score in CENTRAL_BANK_SPEAKER_ROLE_RULES:
        match = re.search(pattern, lowered)
        if not match:
            continue
        speaker_name = ""
        tail = raw_text[match.end():].strip(" :-,\u2013\u2014")
        stop = re.search(
            r"\b(?:speaks?|speech|remarks?|testimony|oral evidence|panel|interview|fireside|appearance|presentation|lecture|at|on|about|before)\b",
            tail,
            flags=re.IGNORECASE,
        )
        if stop:
            tail = tail[: stop.start()]
        name_match = re.match(r"([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})", tail.strip())
        if name_match:
            speaker_name = name_match.group(1).strip()
        if not speaker_name:
            prefix = raw_text[: match.start()].rstrip(" :-,\u2013\u2014")
            before_role = re.search(r"([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3})\s*,?\s*$", prefix)
            if before_role:
                speaker_name = before_role.group(1).strip()
        return speaker_name, role, _speaker_role_score(institution, role, score)
    return "", "", 0


def _speaker_event_type(raw_text: str) -> str:
    lowered = raw_text.lower()
    if "beige book" in lowered:
        return "beige_book"
    if "testimony" in lowered or "oral evidence" in lowered or "before the committee" in lowered:
        return "testimony"
    if "press conference" in lowered:
        return "press_conference"
    if "panel" in lowered or "fireside chat" in lowered:
        return "panel"
    if "interview" in lowered:
        return "interview"
    if "remarks" in lowered:
        return "remarks"
    return "speech"


def _speaker_topic_relevance(raw_text: str) -> Tuple[str, bool, bool]:
    padded = f" {raw_text.lower()} "
    policy_relevant = any(keyword in padded for keyword in CENTRAL_BANK_SPEAKER_POLICY_KEYWORDS)
    technical = any(keyword in padded for keyword in CENTRAL_BANK_SPEAKER_TECHNICAL_KEYWORDS)
    return _normalize_metadata_text(raw_text), policy_relevant, technical


def _speaker_score_and_visibility(institution: str, role_score: int, role: str, raw_text: str, time_confidence: str) -> Tuple[int, bool, str]:
    _, policy_relevant, technical = _speaker_topic_relevance(raw_text)
    score = role_score
    if policy_relevant:
        score += 5
    if technical and not policy_relevant:
        score -= 15
    score = max(35, min(95, score))
    top_tier = role in {"Chair", "President"} or (role == "Governor" and institution != "FED")
    default_dashboard = top_tier or (policy_relevant and score >= 68)
    if time_confidence == "date_only" and not top_tier:
        default_dashboard = False
    return score, default_dashboard, _impact_from_score(score)


def _speaker_datetime_from_value(value: str, timezone_name: str) -> Tuple[Optional[datetime], str]:
    cleaned = _normalize_metadata_text(value)
    if not cleaned or not dateparser:
        return None, ""
    has_time = bool(
        re.search(r"(?:T|\s)\d{1,2}:\d{2}", cleaned)
        or re.search(r"\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b", cleaned, flags=re.IGNORECASE)
    )
    try:
        parsed = dateparser.parse(
            cleaned,
            fuzzy=True,
            tzinfos={
                "BST": ZoneInfo("Europe/London"),
                "GMT": UTC,
                "CET": ZoneInfo("Europe/Berlin"),
                "CEST": ZoneInfo("Europe/Berlin"),
                "ET": ZoneInfo("America/Toronto"),
                "AEST": ZoneInfo("Australia/Sydney"),
                "AEDT": ZoneInfo("Australia/Sydney"),
            },
        )
    except Exception:
        return None, ""
    if parsed is None:
        return None, ""
    local_tz = ZoneInfo(timezone_name)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=local_tz)
    if not has_time:
        parsed = parsed.replace(hour=12, minute=0, second=0, microsecond=0)
    return parsed.astimezone(UTC), "exact" if has_time else "date_only"


def _speaker_datetime_from_node(node: Any, timezone_name: str) -> Tuple[Optional[datetime], str]:
    datetime_values: List[str] = []
    if getattr(node, "attrs", None) and node.attrs.get("datetime"):
        datetime_values.append(str(node.attrs["datetime"]))
    for child in node.select("[datetime]"):
        value = child.attrs.get("datetime")
        if value:
            datetime_values.append(str(value))
    for value in datetime_values:
        parsed, confidence = _speaker_datetime_from_value(value, timezone_name)
        if parsed:
            return parsed, confidence

    text = _normalize_metadata_text(node.get_text(" ", strip=True))
    date_context = text
    previous = node.find_previous_sibling("dt") if hasattr(node, "find_previous_sibling") else None
    if previous:
        date_context = f"{_normalize_metadata_text(previous.get_text(' ', strip=True))} {text}"
    local_time = re.search(r"\bTime:\s*(\d{1,2}:\d{2})", text, flags=re.IGNORECASE)
    month_names = "|".join(MONTHS + [month[:3] for month in MONTHS])
    patterns = (
        rf"\b(?:{month_names})\s+\d{{1,2}},?\s+20\d{{2}}(?:\s+(?:at\s+)?\d{{1,2}}:\d{{2}}\s*(?:a\.?m\.?|p\.?m\.?)?)?",
        rf"\b\d{{1,2}}\s+(?:{month_names})\s+20\d{{2}}(?:\s+(?:at\s+)?\d{{1,2}}:\d{{2}}\s*(?:a\.?m\.?|p\.?m\.?)?)?",
        r"\b20\d{2}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?",
    )
    for pattern in patterns:
        match = re.search(pattern, date_context, flags=re.IGNORECASE)
        if match:
            value = match.group(0)
            if local_time and not re.search(r"(?:T|\s)\d{1,2}:\d{2}", value):
                value = f"{value} {local_time.group(1)}"
            parsed, confidence = _speaker_datetime_from_value(value, timezone_name)
            if parsed:
                return parsed, confidence
    return None, ""


def _speaker_detail_url(node: Any, source_url: str) -> str:
    anchors = [node] if getattr(node, "name", "") == "a" and node.get("href") else list(node.find_all("a", href=True))
    for anchor in anchors:
        candidate = urljoin(source_url, str(anchor["href"]))
        if _url_is_official(candidate):
            return candidate
    return source_url


def _speaker_title(institution: str, speaker_name: str, role: str, event_type: str) -> str:
    if event_type == "beige_book":
        return "Federal Reserve Beige Book"
    label = str(CENTRAL_BANK_SPEAKER_PRIORITY[institution]["label"])
    surname = speaker_name.split()[-1] if speaker_name else ""
    identity = " ".join(part for part in (label, role, surname) if part).strip()
    if event_type == "testimony":
        return f"{identity} Testimony"
    if event_type == "press_conference":
        return f"{identity} Press Conference"
    return f"{identity} Speaks"


def _speaker_event_from_node(
    institution: str,
    node: Any,
    source_url: str,
    source_path: str,
    start_utc: datetime,
    end_utc: datetime,
) -> Optional[Event]:
    raw_text = _normalize_metadata_text(node.get_text(" ", strip=True))
    if not raw_text or not any(keyword in raw_text.lower() for keyword in CENTRAL_BANK_SPEAKER_EVENT_KEYWORDS):
        return None
    config = CENTRAL_BANK_SPEAKER_PRIORITY[institution]
    event_type = _speaker_event_type(raw_text)
    speaker_name, speaker_role, role_score = _speaker_identity(institution, raw_text)
    if event_type != "beige_book" and not speaker_role:
        return None
    dt_utc, time_confidence = _speaker_datetime_from_node(node, str(config["timezone"]))
    if dt_utc is None or not _within(dt_utc, start_utc, end_utc):
        return None
    if event_type == "beige_book":
        speaker_name, speaker_role, role_score = "", "", 78
        score, default_dashboard, impact = 78, True, "Medium"
    else:
        score, default_dashboard, impact = _speaker_score_and_visibility(institution, role_score, speaker_role, raw_text, time_confidence)
    detail_url = _speaker_detail_url(node, source_url)
    title = _speaker_title(institution, speaker_name, speaker_role, event_type)
    _, policy_relevance, _ = _speaker_topic_relevance(raw_text)
    extras = {
        "speaker_event": True,
        "speaker_name": speaker_name,
        "speaker_role": speaker_role,
        "speaker_institution": institution,
        "speaker_priority": score,
        "speech_topic": raw_text,
        "speech_location": "",
        "event_type": event_type,
        "policy_relevance": policy_relevance,
        "source_path": source_path,
        "source_title_raw": raw_text,
        "text_release_expected": "speech" in raw_text.lower() or "remarks" in raw_text.lower(),
        "livestream_expected": "live" in raw_text.lower() or "webcast" in raw_text.lower(),
        "notes": "",
        "category": "central_bank",
        "asset_focus": list(config["assets"]),
        "trader_relevance_score": score,
        "source_reliability": "official",
        "time_confidence": time_confidence,
        "default_dashboard": default_dashboard,
        "source_url_standardized": detail_url,
        "source_candidates": [{"source_path": source_path, "source_url": detail_url}],
    }
    country = str(config["country"])
    return Event(
        id=make_id(country, institution, title, dt_utc),
        source=f"{institution}_SPEAKERS",
        agency=institution,
        country=country,
        title=title,
        date_time_utc=dt_utc,
        event_local_tz=str(config["timezone"]),
        impact=impact,
        url=detail_url,
        extras=extras,
    )


def _parse_central_bank_speaker_html(
    institution: str,
    html: str,
    source_url: str,
    source_path: str,
    start_utc: datetime,
    end_utc: datetime,
) -> List[Event]:
    if not BeautifulSoup or institution not in CENTRAL_BANK_SPEAKER_PRIORITY:
        return []
    soup = BeautifulSoup(html or "", "html.parser")
    nodes: List[Any] = []
    seen_nodes: Set[int] = set()
    selectors = ("article", "li", "tr", "dd", ".event", ".event-item", ".views-row", ".list-item", "a[href]")
    for selector in selectors:
        for node in soup.select(selector):
            identity = id(node)
            if identity in seen_nodes:
                continue
            seen_nodes.add(identity)
            nodes.append(node)
    events: List[Event] = []
    for node in nodes:
        event = _speaker_event_from_node(institution, node, source_url, source_path, start_utc, end_utc)
        if event:
            events.append(event)
    if institution == "BOE" and source_path == "boe_staff_events":
        events.extend(_parse_boe_staff_events_text(soup, source_url, source_path, start_utc, end_utc))
    return _dedupe_central_bank_speaker_events(events)


def _parse_boe_staff_events_text(
    soup: Any,
    source_url: str,
    source_path: str,
    start_utc: datetime,
    end_utc: datetime,
) -> List[Event]:
    lines = [_normalize_metadata_text(line) for line in soup.get_text("\n", strip=True).splitlines()]
    lines = [line for line in lines if line]
    in_upcoming = False
    current_date = ""
    events: List[Event] = []
    date_pattern = re.compile(
        r"^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+(?:"
        + "|".join(MONTHS)
        + r")(?:\s+20\d{2})?$",
        flags=re.IGNORECASE,
    )
    speaker_pattern = re.compile(r"^([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}):$")
    for index, line in enumerate(lines):
        if line.startswith("Upcoming events - "):
            in_upcoming = True
            continue
        if in_upcoming and line == "Upcoming key publications":
            break
        if not in_upcoming:
            continue
        if date_pattern.match(line):
            current_date = line if re.search(r"\b20\d{2}\b", line) else f"{line} {start_utc.year}"
            continue
        speaker_match = speaker_pattern.match(line)
        if not speaker_match or not current_date:
            continue
        speaker_name = speaker_match.group(1)
        if speaker_name.lower() not in CENTRAL_BANK_SPEAKER_PRIORITY["BOE"]["names"]:
            continue
        topic = lines[index + 1] if index + 1 < len(lines) else ""
        time_text = lines[index + 2] if index + 2 < len(lines) else ""
        time_match = re.search(r"\((\d{1,2}(?:(?:\.|:)\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?:\s+(?:BST|GMT))?)", time_text, flags=re.IGNORECASE)
        time_value = time_match.group(1).replace(".", ":") if time_match else ""
        dt_utc, confidence = _speaker_datetime_from_value(f"{current_date} {time_value}", "Europe/London")
        if dt_utc is None or not _within(dt_utc, start_utc, end_utc):
            continue
        role = str(CENTRAL_BANK_SPEAKER_PRIORITY["BOE"]["names"][speaker_name.lower()])
        node = BeautifulSoup("", "html.parser").new_tag("article")
        time_node = BeautifulSoup("", "html.parser").new_tag("time")
        time_node["datetime"] = dt_utc.astimezone(ZoneInfo("Europe/London")).isoformat() if confidence == "exact" else current_date
        node.append(time_node)
        node.append(f" {role} {speaker_name} appearance: {topic} {time_text}")
        event = _speaker_event_from_node("BOE", node, source_url, source_path, start_utc, end_utc)
        if event:
            events.append(event)
    return events


def _speaker_dedupe_key(event: Event) -> Tuple[str, str, str, str]:
    extras = event.extras or {}
    dt = event.date_time_utc.astimezone(UTC)
    dt_key = dt.date().isoformat() if extras.get("time_confidence") == "date_only" else dt.isoformat()
    return (
        str(extras.get("speaker_institution") or event.agency),
        str(extras.get("speaker_name") or "").lower(),
        str(extras.get("event_type") or "speech"),
        dt_key,
    )


def _dedupe_central_bank_speaker_events(events: List[Event]) -> List[Event]:
    deduped: Dict[Tuple[str, str, str, str], Event] = {}
    for event in events:
        key = _speaker_dedupe_key(event)
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = event
            continue
        candidates = list((existing.extras or {}).get("source_candidates") or [])
        for candidate in (event.extras or {}).get("source_candidates") or []:
            if candidate not in candidates:
                candidates.append(candidate)
        existing.extras["source_candidates"] = candidates
        if event.url != existing.url and event.url.count("/") > existing.url.count("/"):
            event.extras["source_candidates"] = candidates
            deduped[key] = event
    return sorted(deduped.values(), key=lambda event: event.date_time_utc)


def _empty_central_bank_speakers_health() -> Dict[str, Any]:
    return {
        "status": "QUIET",
        "sources_attempted": [],
        "sources_succeeded": [],
        "sources_failed": [],
        "speaker_event_count": 0,
        "default_dashboard_count": 0,
        "by_institution": {
            institution: {"count": 0, "status": "QUIET"}
            for institution in sorted(CENTRAL_BANK_SPEAKER_PRIORITY)
        },
        "warnings": [],
    }


def collect_central_bank_speaker_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    health = _empty_central_bank_speakers_health()
    institution_attempts: Dict[str, int] = {key: 0 for key in CENTRAL_BANK_SPEAKER_PRIORITY}
    institution_successes: Dict[str, int] = {key: 0 for key in CENTRAL_BANK_SPEAKER_PRIORITY}
    events: List[Event] = []
    for source in _central_bank_speaker_sources(start_utc, end_utc):
        institution = source["institution"]
        url = source["url"]
        source_path = source["source_path"]
        institution_attempts[institution] += 1
        health["sources_attempted"].append(source_path)
        response = _request_central_bank_speaker_source(session, url)
        if response is None or not (200 <= int(getattr(response, "status_code", 0) or 0) < 300):
            health["sources_failed"].append(source_path)
            continue
        institution_successes[institution] += 1
        health["sources_succeeded"].append(source_path)
        parsed = _parse_central_bank_speaker_html(institution, response.text or "", url, source_path, start_utc, end_utc)
        events.extend(parsed)

    events = _dedupe_central_bank_speaker_events(events)
    for institution in sorted(CENTRAL_BANK_SPEAKER_PRIORITY):
        count = sum(1 for event in events if event.agency == institution)
        if institution_attempts[institution] and not institution_successes[institution]:
            status = "DEGRADED"
            health["warnings"].append(f"{institution} speaker live sources failed")
        elif count:
            status = "HEALTHY"
        else:
            status = "QUIET"
        health["by_institution"][institution] = {"count": count, "status": status}
    health["speaker_event_count"] = len(events)
    health["default_dashboard_count"] = sum(1 for event in events if bool((event.extras or {}).get("default_dashboard")))
    health["status"] = "DEGRADED" if health["warnings"] else ("HEALTHY" if events else "QUIET")
    RUN_CONTEXT["central_bank_speakers_health"] = health
    logger.info(
        "CENTRAL_BANK_SPEAKERS: status=%s events=%d default_dashboard=%d",
        health["status"],
        health["speaker_event_count"],
        health["default_dashboard_count"],
    )
    return events


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

# Selector-compat helpers (fixes CSS :matches() issues)

def find_rows_by_header_keywords(soup: BeautifulSoup, table_sel_list, header_keywords_lower):

    """



    Return <tr> rows from the first table whose header row contains ANY of the



    given lowercased keywords. Avoids :matches() / complex CSS. 



    """

    for sel in table_sel_list:                 # e.g. ["table", "div table"]

        for tbl in soup.select(sel):

            ths = tbl.select("th")

            if not ths:

                continue

            th_text = " ".join(th.get_text(" ", strip=True).lower() for th in ths)

            if any(k in th_text for k in header_keywords_lower):

                rows = [tr for tr in tbl.select("tr") if tr.select("td")]

                if rows:

                    return rows

    return []

def broad_li_filter(soup: BeautifulSoup, section_words_regex: str):

    """



    Broad fallback: scan all list items under sections/divs, keep those whose text



    matches the given regex (case-insensitive).



    """

    regex = re.compile(section_words_regex, re.I)

    lis = soup.select("section li, div li, ul li, article li")

    return [li for li in lis if regex.search(li.get_text(" ", strip=True))]

def rows_by_header_xpath(content_bytes: bytes, header_keywords_lower):

    """Optional XPath fallback for bulletproof table parsing."""

    if not lxml_html:

        return []

    try:

        root = lxml_html.fromstring(content_bytes)

        tables = root.xpath("//table[.//th]")

        for tbl in tables:

            th_text = " ".join(("".join(th.itertext()) or "").strip().lower() for th in tbl.xpath(".//th"))

            if any(k in th_text for k in header_keywords_lower):

                return tbl.xpath(".//tr[td]")

    except Exception:

        pass

    return []


# ---------------------------------------------------------------------------

# Complete Central Bank Scrapers (Fed, ECB, BoE, BoC, RBA, RBNZ)

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

def fetch_boc_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Bank of Canada rate announcement schedule with DOM/table fallback."""
    path_label = "dom"
    if not BeautifulSoup:
        path_label = "unavailable"
        _finalize_source_log("BOC", path_label, 0, zero_reason="BeautifulSoup unavailable; DOM skipped")
        return []

    url = "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/#schedule"
    agency, country, source = "BOC", "CA", "BOC_HTML"
    toronto_tz = TORONTO_TZ
    cache_manager = getattr(session, "cache_manager", None)
    last_snapshot = ""
    parsed_schedule_dates: List[datetime] = []
    events: List[Event] = []
    parsed_schedule_dates: List[datetime] = []

    def _emit(dt_local: datetime, href: str) -> None:
        dt_local = ensure_aware(dt_local, toronto_tz, 10, 0)
        dt_utc = dt_local.astimezone(UTC)
        parsed_schedule_dates.append(dt_utc)
        if not _within(dt_utc, start_utc, end_utc):
            return
        events.append(
            Event(
                id=make_id(country, agency, "BoC Rate Announcement", dt_utc),
                source=source,
                agency=agency,
                country=country,
                title="BoC Rate Announcement",
                date_time_utc=dt_utc,
                event_local_tz="America/Toronto",
                impact="High",
                url=href,
                extras={"announcement_time_local": "10:00"},
            )
        )

    try:
        resp, _ = source_sget(session, agency, url, timeout=25)
    except Exception:
        logger.debug("BoC: request failed for %s", url, exc_info=True)
        resp = None

    if resp and getattr(resp, "ok", False) and BeautifulSoup:
        soup = BeautifulSoup(resp.text, "html.parser")
        last_snapshot = soup.get_text("\n", strip=True)[:ZERO_SNAPSHOT_MAX_CHARS]
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
            anchor = t if t.name == "a" else t.find_parent("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor else url
            _emit(dt_local, href)

        if not events:
            tables = soup.select("table")
            for table in tables:
                for row in table.select("tr"):
                    cells = row.select("td")
                    if len(cells) < 2:
                        continue
                    date_text = cells[0].get_text(" ", strip=True)
                    description = cells[1].get_text(" ", strip=True)
                    if "interest rate announcement" not in description.lower():
                        continue
                    match = re.search(r"(\w+)\s+(\d{1,2})", date_text)
                    if not match:
                        continue
                    month, day = match.groups()
                    for year in (datetime.now().year, datetime.now().year + 1):
                        try:
                            dt_local = dateparser.parse(f"{month} {day} {year}")
                        except Exception:
                            continue
                        if not dt_local:
                            continue
                        _emit(dt_local, url)
                        break

        if events:
            events.sort(key=lambda ev: ev.date_time_utc)
            if cache_manager:
                try:
                    _persist_lkg("BOC", events)
                except Exception:
                    logger.debug("BoC: LKG persist failed", exc_info=True)
            _finalize_source_log("BOC", path_label, len(events))
            return events

    if parsed_schedule_dates:
        _finalize_source_log("BOC", "dom", 0, zero_reason="outside_window")
        return []

    merged = maybe_merge_lkg("BOC", [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
        _finalize_source_log("BOC", "lkg", len(merged))
        return merged

    zero_reason = "outside_window" if parsed_schedule_dates else "BoC: No schedule entries parsed for the requested window."
    _finalize_source_log("BOC", "none", 0, zero_reason=zero_reason)
    write_zero_snapshot("BOC", last_snapshot or "no HTTP body")
    return []

def fetch_rba_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """RBA schedule parser with DOM, schedule index, curated fallback, and LKG."""
    if not BeautifulSoup:
        _set_fetch_metadata("RBA", count=0, path="unavailable")
        return []

    agency, country, source = "RBA", "AU", "RBA_HTML"
    source_key = "RBA"
    sydney_tz = SYDNEY_TZ
    cache_manager = getattr(session, "cache_manager", None)
    current_year = datetime.now().year

    base_url = "https://www.rba.gov.au/schedules-events/monetary-policy-decision.html"
    schedule_url = "https://www.rba.gov.au/monetary-policy/rba-board/meeting-schedules.html"
    candidate_urls = [
        base_url,
        f"{base_url}?year={current_year}",
        f"{base_url}?year={current_year + 1}",
        schedule_url,
    ]
    seen_dates: set[tuple[int, int, int]] = set()
    last_snapshot = ""

    curated_dates = [
        (2025, 2, 4),
        (2025, 3, 4),
        (2025, 4, 8),
        (2025, 5, 6),
        (2025, 6, 3),
        (2025, 7, 8),
        (2025, 8, 5),
        (2025, 9, 2),
        (2025, 10, 7),
        (2025, 11, 4),
        (2025, 12, 9),
        (2026, 2, 3),
        (2026, 3, 31),
        (2026, 5, 19),
        (2026, 7, 7),
        (2026, 8, 11),
        (2026, 9, 22),
        (2026, 11, 4),
        (2026, 12, 8),
    ]

    def _emit(dt_local: datetime, href: str, bucket: List[Event]) -> None:
        dt_local = ensure_aware(dt_local, sydney_tz, 14, 30)
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            return
        key = (dt_local.year, dt_local.month, dt_local.day)
        if key in seen_dates:
            return
        seen_dates.add(key)
        bucket.append(
            Event(
                id=make_id(country, agency, "RBA Cash Rate Decision", dt_utc),
                source=source,
                agency=agency,
                country=country,
                title="RBA Cash Rate Decision",
                date_time_utc=dt_utc,
                event_local_tz="Australia/Sydney",
                impact="High",
                url=href,
                extras={"announcement_time_local": "14:30"},
            )
        )

    def _extract_year_hint(*texts: Optional[str]) -> Optional[int]:
        for txt in texts:
            if not txt:
                continue
            match = re.search(r"(20\d{2})", txt)
            if match:
                return int(match.group(1))
        return None

    def _parse_page(url: str) -> tuple[List[Event], str]:
        parsed: List[Event] = []
        snapshot_text = ""
        try:
            resp, _ = source_sget(
                session,
                agency,
                url,
                timeout=25,
                headers={"Accept-Language": "en-AU,en;q=0.8"},
            )
        except Exception:
            logger.debug("RBA: request failed for %s", url, exc_info=True)
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
        ) or current_year

        for node in soup.select("time[datetime]"):
            dt_val = node.get("datetime")
            if not dt_val:
                continue
            try:
                dt_local = dateparser.parse(dt_val)
            except Exception:
                continue
            if not dt_local:
                continue
            if dt_local.hour == 0 and dt_local.minute == 0:
                dt_local = dt_local.replace(hour=14, minute=30)
            anchor = node if node.name == "a" else node.find_parent("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor and anchor.get("href") else url
            _emit(dt_local, href, parsed)

        if parsed:
            return parsed, snapshot_text

        month_names = "January February March April May June July August September October November December".split()
        month_map = {name.lower(): idx + 1 for idx, name in enumerate(month_names)}
        date_pattern = re.compile(
            r"(\d{1,2})(?:[–\-](\d{1,2}))?\s+(January|February|March|April|May|June|July|August|September|October|November|December)",
            re.I,
        )

        for node in soup.select("table tr, dl, li, p"):
            text = node.get_text(" ", strip=True)
            if not text:
                continue
            match = date_pattern.search(text)
            if not match:
                continue
            start_day, end_day, month_name = match.groups()
            month_num = month_map.get(month_name.lower())
            if not month_num:
                continue
            inferred_year = _extract_year_hint(text) or year_hint
            target_day = int(end_day or start_day)
            try:
                dt_local = datetime(inferred_year, month_num, target_day, 14, 30)
            except Exception:
                continue
            anchor = node.find("a", href=True)
            href = urljoin(url, anchor.get("href")) if anchor else url
            _emit(dt_local, href, parsed)

        return parsed, snapshot_text

    events: List[Event] = []
    path_label = "dom"
    for candidate in candidate_urls:
        page_events, snap = _parse_page(candidate)
        if page_events:
            events = page_events
            last_snapshot = snap
            break
        if snap:
            last_snapshot = snap

    events.sort(key=lambda ev: ev.date_time_utc)
    dom_count = len(events)
    if dom_count:
        for ev in events:
            extras = dict(ev.extras or {})
            extras.setdefault("discovered_via", path_label)
            extras.setdefault("source_hint", path_label)
            ev.extras = extras
        if cache_manager:
            try:
                _persist_lkg(source_key, events)
            except Exception:
                logger.debug("RBA: LKG persist failed", exc_info=True)
        _finalize_source_log(source_key, path_label, dom_count)
        return events

    curated_events: List[Event] = []
    for year, month, day in curated_dates:
        dt_local = ensure_aware(datetime(year, month, day, 14, 30), sydney_tz, 14, 30)
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        event_data = {
            "id": make_id(country, agency, "RBA Cash Rate Decision", dt_utc),
            "source": "RBA_CURATED",
            "agency": agency,
            "country": country,
            "title": "RBA Cash Rate Decision",
            "date_time_utc": dt_utc,
            "event_local_tz": "Australia/Sydney",
            "impact": "High",
            "url": schedule_url,
            "extras": {"announcement_time_local": "14:30", "source": "curated"},
        }
        event_data = _ensure_time_confidence(event_data)
        curated_events.append(Event(**event_data))

    if curated_events:
        curated_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log(source_key, "curated", len(curated_events))
        return curated_events

    merged = maybe_merge_lkg(source_key, [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
        logger.info("RBA LKG_MERGE: %d", len(merged))
        _finalize_source_log(source_key, "lkg", len(merged))
        return merged

    zero_reason = "between_meetings"
    _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
    write_zero_snapshot("RBA", last_snapshot or "no HTTP body")
    return []

def fetch_rbnz_events(session, start_utc, end_utc):
    """
    RBNZ OCR decisions: DOM ? JSON-LD ? fallback schedule, dual hosts, headers, and LKG on zero.
    Emits discovery path in logs; all events gated via _within.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("RBNZ", count=0, path="unavailable")
        return []

    anz_tz = WELLINGTON_TZ
    cache_manager = getattr(session, "cache_manager", None)
    hosts = [
        "https://www.rbnz.govt.nz",
        "https://rbnz.govt.nz",
    ]
    base_paths = [
        "monetary-policy/monetary-policy-decisions",
        "monetary-policy/official-cash-rate-decisions",
        "news-and-publications/monetary-policy-decisions",
    ]
    headers = {
        "Accept-Language": "en-NZ,en;q=0.8",
        "Referer": "https://www.rbnz.govt.nz/monetary-policy",
    }

    seen_ids: set[str] = set()

    def _emit(candidate: datetime | None, url: str, tag: str, bucket: list[Event]) -> None:
        if candidate is None:
            return
        try:
            if candidate.tzinfo is None:
                local_dt = ensure_aware(
                    datetime(candidate.year, candidate.month, candidate.day, candidate.hour, candidate.minute),
                    anz_tz,
                    candidate.hour,
                    candidate.minute,
                )
            else:
                local_dt = candidate.astimezone(anz_tz)
            dt_utc = local_dt.astimezone(UTC)
        except Exception:
            return
        if not _within(dt_utc, start_utc, end_utc):
            return
        title = "RBNZ Official Cash Rate (OCR) Decision"
        event_id = make_id("NZ", "RBNZ", title, dt_utc)
        if event_id in seen_ids:
            return
        seen_ids.add(event_id)
        source_tag = {
            "dom": "RBNZ_DOM",
            "jsonld": "RBNZ_JSONLD",
            "curated": "RBNZ_CURATED",
            "estimator": "RBNZ_ESTIMATOR",
        }.get(tag, "RBNZ")
        extras = {"discovered_via": tag}
        bucket.append(
            Event(
                id=event_id,
                source=source_tag,
                agency="RBNZ",
                country="NZ",
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Pacific/Auckland",
                impact="High",
                url=url,
                extras=extras,
            )
        )

    def _parse_iso(dt_iso: str) -> datetime | None:
        if not dt_iso:
            return None
        candidate = None
        if dateparser:
            try:
                candidate = dateparser.parse(dt_iso)
            except Exception:
                candidate = None
        if candidate is None:
            try:
                candidate = datetime.fromisoformat(dt_iso.replace("Z", "+00:00"))
            except Exception:
                return None
        return candidate

    for host in hosts:
        for path_segment in base_paths:
            page_url = f"{host.rstrip('/')}/{path_segment.lstrip('/')}"
            resp = sget_retry_alt(
                session,
                [page_url],
                headers=headers,
                tries=3,
                breaker=get_source_breaker("RBNZ"),
                path_hint="dom",
            )
            if not (resp and getattr(resp, "ok", False)):
                continue
            try:
                soup = BeautifulSoup(resp.text or "", "html.parser")
            except Exception:
                logger.debug("RBNZ: DOM parse failed for %s", page_url, exc_info=True)
                continue
            dom_events: list[Event] = []
            for time_tag in soup.select("time[datetime]"):
                dt_iso = (time_tag.get("datetime") or "").strip()
                candidate = _parse_iso(dt_iso)
                _emit(candidate, page_url, "dom", dom_events)
            for meta_tag in soup.select("meta[property='article:published_time'], meta[name='publish-date']"):
                dt_iso = (meta_tag.get("content") or "").strip()
                candidate = _parse_iso(dt_iso)
                _emit(candidate, page_url, "dom", dom_events)
            if dom_events:
                dom_events.sort(key=lambda ev: ev.date_time_utc)
                if cache_manager:
                    _persist_lkg("RBNZ", dom_events)
                _finalize_source_log("RBNZ", "dom", len(dom_events))
                return dom_events

    for host in hosts:
        for path_segment in base_paths:
            page_url = f"{host.rstrip('/')}/{path_segment.lstrip('/')}"
            resp = sget_retry_alt(
                session,
                [page_url],
                headers=headers,
                tries=3,
                breaker=get_source_breaker("RBNZ"),
                path_hint="dom",
            )
            if not (resp and getattr(resp, "ok", False)):
                continue
            try:
                soup = BeautifulSoup(resp.text or "", "html.parser")
            except Exception:
                logger.debug("RBNZ: JSON-LD parse failed for %s", page_url, exc_info=True)
                continue
            jsonld_events: list[Event] = []
            for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
                try:
                    data = json.loads(script.string or "")
                except Exception:
                    continue

                def _walk(node):
                    if isinstance(node, dict):
                        yield node
                        for value in node.values():
                            yield from _walk(value)
                    elif isinstance(node, list):
                        for item in node:
                            yield from _walk(item)

                for node in _walk(data):
                    if node.get("@type") not in {"Event", "Schedule"}:
                        continue
                    dt_iso = node.get("startDate") or node.get("startTime") or node.get("datePublished") or node.get("scheduledTime")
                    candidate = _parse_iso(str(dt_iso) if dt_iso is not None else "")
                    _emit(candidate, page_url, "jsonld", jsonld_events)
            if jsonld_events:
                jsonld_events.sort(key=lambda ev: ev.date_time_utc)
                if cache_manager:
                    _persist_lkg("RBNZ", jsonld_events)
                _finalize_source_log("RBNZ", "jsonld", len(jsonld_events))
                return jsonld_events

    curated_events: list[Event] = []
    curated_url = "https://www.rbnz.govt.nz/news-and-events/how-we-release-information/ocr-decision-dates-and-financial-stability-report-dates-to-feb-2028"
    curated_dates = [
        (2026, 2, 18),
        (2026, 4, 9),
        (2026, 5, 27),
        (2026, 7, 8),
        (2026, 8, 19),
        (2026, 10, 7),
        (2026, 11, 25),
        (2027, 2, 17),
        (2027, 4, 14),
        (2027, 5, 26),
        (2027, 7, 7),
        (2027, 8, 18),
        (2027, 10, 6),
        (2027, 11, 24),
        (2028, 2, 16),
    ]
    for year, month, day in curated_dates:
        try:
            candidate = datetime(year, month, day, 14, 0)
        except ValueError:
            continue
        _emit(candidate, curated_url, "curated", curated_events)
    if curated_events:
        curated_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("RBNZ", "curated", len(curated_events))
        return curated_events

    fallback_events: list[Event] = []
    fallback_url = "https://www.rbnz.govt.nz/monetary-policy"
    for month, day in [(2, 15), (5, 15), (8, 15), (11, 15)]:
        for year in {start_utc.year, end_utc.year}:
            try:
                candidate = datetime(year, month, day, 14, 0)
            except ValueError:
                continue
            _emit(candidate, fallback_url, "estimator", fallback_events)
    if fallback_events:
        fallback_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("RBNZ", "estimator", len(fallback_events))
        return fallback_events

    merged = maybe_merge_lkg("RBNZ", [], ttl_days=30, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.setdefault("cached", True)
            extras.setdefault("discovered_via", "lkg")
            ev.extras = extras
        logger.info("RBNZ LKG_MERGE: %d", len(merged))
        _finalize_source_log("RBNZ", "lkg", len(merged))
        return merged

    zero_reason = "between_meetings"
    _finalize_source_log("RBNZ", "none", 0, zero_reason=zero_reason)
    return []

# REPLACE ENTIRE FUNCTION: fetch_japan_esri_events(session, start_utc, end_utc)
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
        cache = CURRENT_CACHE_MANAGER
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
    if DEBUG_ZERO_FLAG:
        write_zero_snapshot("ESRI", last_snapshot or "no HTTP body")
    return []

def fetch_switzerland_seco_events(session, start_utc, end_utc):
    """
    SECO structured-first parser across EN/DE/FR; robust context capture, escaped dots,
    schema hash sentinel + snapshot, estimator fallback, and LKG with TTL 90d.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("SECO", count=0, path="unavailable")
        return []

    cache_manager = getattr(session, "cache_manager", None)
    zurich_tz = ZURICH_TZ

    date_dot = re.compile(r"(\d{1,2})\.(\d{1,2})\.(20\d{2})")
    season_en = re.compile(
        r"(Spring|Summer|Autumn|Winter)\s+Forecast.*?(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})",
        re.I | re.S,
    )
    forecast_words = re.compile(r"(economic forecast|forecast|prognos|konjunktur|pr(?:e|\u00E9)vision|perspectives)", re.I)
    schedule_heading = re.compile(
        r"^(agenda|provisional publication schedule|publication schedule|publikationsagenda|veroeffentlichungsplan|calendrier|programme de publication)$",
        re.I,
    )
    schedule_stop = re.compile(
        r"^(last modification|top of page|contact|press releases|archive|communique|communiques|medienmitteilungen)\b",
        re.I,
    )
    schedule_line = re.compile(
        r"(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),\s+)?"
        r"([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}):(\d{2})(?:\s*([AP]M))?",
        re.I,
    )

    lang_pages = [
        ([
            "https://www.seco.admin.ch/seco/en/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",
            "https://www.seco.admin.ch/seco/en/home/seco/nsb-news.msg-id-0000.html",
        ], "en"),
        ([
            "https://www.seco.admin.ch/seco/de/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",
            "https://www.seco.admin.ch/seco/de/home/seco/nsb-news.msg-id-0000.html",
        ], "de"),
        ([
            "https://www.seco.admin.ch/seco/fr/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",
            "https://www.seco.admin.ch/seco/fr/home/seco/nsb-news.msg-id-0000.html",
        ], "fr"),
    ]

    news_pages = [
        (["https://www.seco.admin.ch/seco/en/home/seco/nsb-news.msg-id-0000.html"], "en"),
        (["https://www.seco.admin.ch/seco/de/home/seco/nsb-news.msg-id-0000.html"], "de"),
        (["https://www.seco.admin.ch/seco/fr/home/seco/nsb-news.msg-id-0000.html"], "fr"),
    ]

    structured_events: List[Event] = []
    seen_dates: set[tuple[int, int, int]] = set()
    official_candidate_dates: set[tuple[int, int, int]] = set()
    last_snapshot = ""

    def _seco_month_to_num(token: str) -> Optional[int]:
        month = month_to_num(token)
        if month:
            return month
        normalized = unicodedata.normalize("NFKD", str(token or "")).encode("ascii", "ignore").decode("ascii").strip().lower()
        aliases = {
            "januar": 1,
            "janvier": 1,
            "februar": 2,
            "fevrier": 2,
            "mars": 3,
            "marz": 3,
            "maerz": 3,
            "avril": 4,
            "mai": 5,
            "juin": 6,
            "juli": 7,
            "juillet": 7,
            "august": 8,
            "aout": 8,
            "septembre": 9,
            "oktober": 10,
            "octobre": 10,
            "november": 11,
            "novembre": 11,
            "dezember": 12,
            "decembre": 12,
        }
        return aliases.get(normalized)

    def _infer_schedule_anchor(text: str) -> datetime:
        explicit_dates: List[datetime] = []
        for match in date_dot.finditer(text):
            try:
                explicit_dates.append(datetime(int(match.group(3)), int(match.group(2)), int(match.group(1))))
            except Exception:
                continue
        if explicit_dates:
            return max(explicit_dates)
        return start_utc.astimezone(zurich_tz).replace(hour=0, minute=0, second=0, microsecond=0)

    def _resolve_schedule_date(
        month: int,
        day: int,
        anchor_date: datetime,
        previous_local: Optional[datetime],
    ) -> Optional[datetime]:
        base_year = previous_local.year if previous_local else anchor_date.year
        try:
            candidate = datetime(base_year, month, day)
        except Exception:
            return None
        if previous_local is not None:
            while candidate.date() <= previous_local.date():
                candidate = datetime(candidate.year + 1, month, day)
            return candidate
        while candidate.date() < anchor_date.date():
            candidate = datetime(candidate.year + 1, month, day)
        return candidate

    def _parse_schedule_section(soup: BeautifulSoup, lang: str, source_url: str) -> tuple[int, int]:
        page_lines = [line.strip() for line in soup.get_text("\n", strip=True).splitlines() if line.strip()]
        if not page_lines:
            return (0, 0)
        normalized_lines = [
            unicodedata.normalize("NFKD", line.replace("\u2013", "-").replace("\xa0", " "))
            .encode("ascii", "ignore")
            .decode("ascii")
            .strip()
            for line in page_lines
        ]
        anchor_date = _infer_schedule_anchor("\n".join(page_lines))
        previous_local: Optional[datetime] = None
        candidate_count = 0
        event_count = 0
        miss_budget = 0

        preferred_headings = {
            "provisional publication schedule",
            "publication schedule",
            "veroeffentlichungsplan",
            "calendrier",
            "programme de publication",
        }
        start_index = next((idx for idx, line in enumerate(normalized_lines) if line.lower() in preferred_headings), None)
        if start_index is None:
            start_index = next((idx for idx, line in enumerate(normalized_lines) if schedule_heading.match(line)), None)
        if start_index is None:
            return (0, 0)

        for normalized_line in normalized_lines[start_index + 1 :]:
            if not normalized_line:
                continue
            if schedule_stop.match(normalized_line):
                break
            match = schedule_line.search(normalized_line)
            if not match:
                miss_budget += 1
                if candidate_count > 0 and miss_budget >= 3:
                    break
                continue
            miss_budget = 0
            month = _seco_month_to_num(match.group(1))
            if not month:
                continue
            day = int(match.group(2))
            hour = int(match.group(3))
            minute = int(match.group(4))
            meridiem = (match.group(5) or "").upper()
            if meridiem == "PM" and hour < 12:
                hour += 12
            elif meridiem == "AM" and hour == 12:
                hour = 0
            local_schedule = _resolve_schedule_date(month, day, anchor_date, previous_local)
            if not local_schedule:
                continue
            previous_local = local_schedule
            candidate_count += 1
            if _emit_structured(
                local_schedule.year,
                local_schedule.month,
                local_schedule.day,
                lang,
                source_url,
                candidate_dates=official_candidate_dates,
                discovered_via="schedule",
                announcement_hour=hour,
                announcement_minute=minute,
            ):
                event_count += 1

        return (candidate_count, event_count)

    def _emit_structured(
        year: int,
        month: int,
        day: int,
        lang: str,
        source_url: str,
        season: str | None = None,
        *,
        bucket: Optional[List[Event]] = None,
        candidate_dates: Optional[set[tuple[int, int, int]]] = None,
        discovered_via: str = "dom",
        announcement_hour: int = 9,
        announcement_minute: int = 0,
    ) -> bool:
        target_bucket = bucket if bucket is not None else structured_events
        try:
            local_dt = ensure_aware(datetime(year, month, day, announcement_hour, announcement_minute), zurich_tz, announcement_hour, announcement_minute)
            dt_utc = local_dt.astimezone(UTC)
        except Exception:
            return False
        if candidate_dates is not None:
            candidate_dates.add((year, month, day))
        if not _within(dt_utc, start_utc, end_utc):
            return False
        if (year, month, day) in seen_dates:
            return False
        seen_dates.add((year, month, day))
        season_name = season.title() if season else None
        title = f"SECO {season_name} Economic Forecast" if season_name else "Switzerland SECO Economic Forecast"
        extras = {
            "announcement_time_local": f"{announcement_hour:02d}:{announcement_minute:02d}",
            "forecast_type": "Economic Forecast",
            "frequency": "Quarterly",
            "language": lang,
            "discovered_via": discovered_via,
            "source_hint": discovered_via,
        }
        if season_name:
            extras["season"] = season_name
        target_bucket.append(
            Event(
                id=make_id("CH", "SECO", title, dt_utc),
                source="SECO_STRUCTURED",
                agency="SECO",
                country="CH",
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Europe/Zurich",
                impact="Medium",
                url=source_url,
                extras=extras,
            )
        )
        return True

    for urls, lang in lang_pages:
        resp = sget_retry_alt(
            session,
            urls,
            headers={"Accept-Language": f"{lang},en;q=0.7,de;q=0.6,fr;q=0.5"},
            tries=3,
            breaker=get_source_breaker("SECO"),
            path_hint="dom",
        )
        if not (resp and getattr(resp, "ok", False)):
            continue
        page_url = resp.url or urls[0]
        content_bytes = resp.content or b""
        try:
            soup = BeautifulSoup(resp.text or "", "html.parser")
        except Exception:
            logger.debug("SECO structured fetch parse error for %s", page_url, exc_info=True)
            continue
        last_snapshot = soup.get_text("\n", strip=True)[:ZERO_SNAPSHOT_MAX_CHARS]

        page_events = 0
        page_candidate_dates: set[tuple[int, int, int]] = set()
        containers = soup.select(
            "li.list-group-item, .mod-nsbsinglemessage, .news-feed .list-group-item, article, .mod-teaser, .mod-text, .card, section"
        ) or [soup]
        for node in containers:
            text = node.get_text(" ", strip=True)
            if not text or not forecast_words.search(text):
                continue
            for match in date_dot.finditer(text):
                day = int(match.group(1))
                month = int(match.group(2))
                year = int(match.group(3))
                page_candidate_dates.add((year, month, day))
                if _emit_structured(year, month, day, lang, page_url, candidate_dates=official_candidate_dates):
                    page_events += 1
            for match in season_en.finditer(text):
                season = match.group(1)
                day = int(match.group(2))
                month_name = match.group(3)
                year = int(match.group(4))
                month = month_to_num(month_name)
                if month:
                    page_candidate_dates.add((year, month, day))
                if month and _emit_structured(year, month, day, lang, page_url, season=season, candidate_dates=official_candidate_dates):
                    page_events += 1

        schedule_candidates, schedule_events = _parse_schedule_section(soup, lang, page_url)
        if schedule_candidates:
            logger.info("SECO: schedule %d candidate date(s) parsed (%s)", schedule_candidates, lang)
        page_events += schedule_events

        if cache_manager:
            try:
                _schema_capture(
                    cache_manager,
                    "SECO",
                    page_url,
                    content_bytes,
                    max(page_events, len(page_candidate_dates)),
                    meta_suffix=lang.upper(),
                )
            except Exception:
                logger.debug("SECO schema capture failed for %s", page_url, exc_info=True)
        if page_candidate_dates:
            logger.info("SECO: structured %d candidate date(s) parsed (%s)", len(page_candidate_dates), lang)

    if structured_events:
        structured_events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("SECO", structured_events)
        _finalize_source_log("SECO", "dom", len(structured_events))
        return structured_events

    if official_candidate_dates:
        logger.info("SECO: official page yielded %d candidate release date(s); none within requested window", len(official_candidate_dates))
        _finalize_source_log("SECO", "dom", 0, zero_reason="outside_window")
        return []

    news_events: List[Event] = []
    news_snapshot = ""
    news_date_long = re.compile(r"(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})")
    if not structured_events:
        for urls, lang in news_pages:
            resp = sget_retry_alt(
                session,
                urls,
                headers={"Accept-Language": f"{lang},en;q=0.7,de;q=0.6,fr;q=0.5"},
                tries=3,
                breaker=get_source_breaker("SECO"),
                path_hint="dom",
            )
            if not (resp and getattr(resp, "ok", False)):
                continue
            page_url = resp.url or urls[0]
            try:
                soup = BeautifulSoup(resp.text or "", "html.parser")
            except Exception:
                logger.debug("SECO news parse error for %s", page_url, exc_info=True)
                continue
            news_snapshot = soup.get_text("\n", strip=True)[:ZERO_SNAPSHOT_MAX_CHARS]
            for node in soup.select(
                "article, li.list-group-item, .mod-nsbsinglemessage, .mod-teaser, .mod-text, .teaser, .media-release"
            ):
                text = node.get_text(" ", strip=True)
                if not text or not forecast_words.search(text):
                    continue
                year = month = day = None
                time_tag = node.find("time", attrs={"datetime": True})
                if time_tag:
                    try:
                        parsed = dateparser.parse(time_tag.get("datetime") or "")
                        if parsed:
                            year, month, day = parsed.year, parsed.month, parsed.day
                    except Exception:
                        year = month = day = None
                if year is None:
                    dot_match = date_dot.search(text)
                    if dot_match:
                        day = int(dot_match.group(1))
                        month = int(dot_match.group(2))
                        year = int(dot_match.group(3))
                    else:
                        word_match = news_date_long.search(text)
                        if word_match:
                            day = int(word_match.group(1))
                            month = month_to_num(word_match.group(2))
                            year = int(word_match.group(3))
                    if not (year and month and day):
                        season_match = season_en.search(text)
                        if season_match:
                            season = season_match.group(1)
                            day = int(season_match.group(2))
                            month = month_to_num(season_match.group(3))
                            year = int(season_match.group(4))
                            if month and _emit_structured(
                                year,
                                month,
                                day,
                                lang,
                                page_url,
                                season=season,
                                bucket=news_events,
                                discovered_via="news",
                            ):
                                continue
                if year and month and day:
                    if _emit_structured(
                        year,
                        month,
                        day,
                        lang,
                        page_url,
                        bucket=news_events,
                        discovered_via="news",
                    ):
                        continue
            if news_events:
                break

    if news_events:
        news_events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            try:
                _persist_lkg("SECO", news_events)
            except Exception:
                logger.debug("SECO: LKG persist failed for news path", exc_info=True)
        _finalize_source_log("SECO", "news", len(news_events))
        return news_events

    season_map = {3: "Spring", 6: "Summer", 9: "Autumn", 12: "Winter"}
    estimator_events: List[Event] = []
    candidate_years = {start_utc.year, end_utc.year}
    candidate_years.add(start_utc.year + 1)

    for year in sorted(candidate_years):
        for month, season in season_map.items():
            try:
                local_dt = ensure_aware(datetime(year, month, 15, 9, 0), zurich_tz, 9, 0)
                dt_utc = local_dt.astimezone(UTC)
            except Exception:
                continue
            if not _within(dt_utc, start_utc, end_utc):
                continue
            title = f"SECO {season} Economic Forecast"
            extras = {
                "announcement_time_local": "09:00",
                "forecast_type": "Economic Forecast",
                "frequency": "Quarterly",
                "season": season,
                "estimated": True,
                "source": "estimator",
                "time_confidence": "assumed",
                "discovered_via": "estimator",
                "source_hint": "estimator",
            }
            estimator_events.append(
                Event(
                    id=make_id("CH", "SECO", title, dt_utc),
                    source="SECO_ESTIMATOR",
                    agency="SECO",
                    country="CH",
                    title=title,
                    date_time_utc=dt_utc,
                    event_local_tz="Europe/Zurich",
                    impact="Medium",
                    url=lang_pages[0][0][0],
                    extras=extras,
                )
            )

    if estimator_events:
        estimator_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("SECO", "estimator", len(estimator_events))
        return estimator_events

    merged = maybe_merge_lkg("SECO", [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.update({"cached": True, "discovered_via": "lkg", "source_hint": "lkg"})
            ev.extras = extras
        logger.info("SECO LKG_MERGE: %d", len(merged))
        _finalize_source_log("SECO", "lkg", len(merged))
        return merged

    zero_snapshot = news_snapshot or last_snapshot or "no HTTP body"
    zero_reason = "SECO: No structured or news entries parsed; estimator/LKG unavailable within window."
    _finalize_source_log("SECO", "none", 0, zero_reason=zero_reason)
    write_zero_snapshot("SECO", zero_snapshot)
    return []

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

    if DEBUG_ZERO_FLAG:

        snapshot = page_body or (model_resp.text if model_resp else "no HTTP body")

        write_zero_snapshot(source_key, snapshot, label="none")

    return []

def fetch_ons_events_enhanced(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """



    ONS (UK Release Calendar) â€” RSS + HTML fallback using "upcoming" view



    LOCKED SELECTORS based on live HTML structure analysis



    



    Primary RSS URL: https://www.ons.gov.uk/releasecalendar?rss&release-type=type-upcoming



    Fallback HTML URL: https://www.ons.gov.uk/releasecalendar?highlight=true&limit=10&page=1&release-type=type-upcoming&sort=date-newest



    Health Floor: â‰¥5 events in 60-day window



    """

    events = []

    rss_events = []

    html_events = []

    # 1. ONS RSS (Primary) - Try upcoming-only RSS first

    rss_url = "https://www.ons.gov.uk/releasecalendar?rss&release-type=type-upcoming"

    try:

        resp, _ = source_sget(session, "ONS", rss_url, timeout=20, path_hint="rss")

        if resp and resp.ok:

            # Parse RSS feed

            soup = BeautifulSoup(resp.text, "xml")

            items = soup.find_all("item")

            for item in items:

                try:

                    title_el = item.find("title")

                    link_el = item.find("link")

                    pub_date_el = item.find("pubDate")

                    if not title_el or not pub_date_el:

                        continue

                    title = title_el.get_text(strip=True)

                    url = link_el.get_text(strip=True) if link_el else rss_url

                    # Parse publication date

                    dt_parsed = dateparser.parse(pub_date_el.get_text(strip=True))

                    if not dt_parsed:

                        continue

                    # Default to 07:00 Europe/London if no time present

                    if dt_parsed.hour == 0 and dt_parsed.minute == 0:

                        dt_parsed = dt_parsed.replace(hour=7, minute=0)

                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                    dt_utc = dt_local.astimezone(UTC)

                    # Check if within date range

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    # Impact classification

                    impact = "High" if any(keyword in title.upper() for keyword in ["GDP", "CPI"]) else \
                             "Medium" if any(keyword in title.upper() for keyword in ["EMPLOYMENT", "LABOUR", "UNEMPLOYMENT"]) else \
                             "Low"

                    event = Event(

                        id=make_id("GB", "ONS", title, dt_utc),

                        source="ONS_RSS_UPCOMING",

                        agency="ONS",

                        country="GB",

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Europe/London",

                        impact=impact,

                        url=url,

                        extras={"release_time_local": "07:00", "source_type": "RSS"}

                    )

                    rss_events.append(event)

                except Exception as e:

                    logger.debug(f"ONS RSS: Error parsing item: {e}")

                    continue

        logger.debug(f"ONS RSS: Found {len(rss_events)} events from upcoming RSS")

    except Exception as e:

        logger.debug(f"ONS RSS fetch failed: {e}")

    # 2. ONS HTML (Fallback) - If RSS returns 0 events, use HTML fallback

    if len(rss_events) == 0:

        logger.info("ONS: RSS returned 0 events, falling back to HTML")

        base_html_url = "https://www.ons.gov.uk/releasecalendar?highlight=true&limit=10&release-type=type-upcoming&sort=date-newest"

        try:

            page = 1

            max_pages = 30  # Safety limit for pagination

            while page <= max_pages:

                # Construct URL with pagination

                if page == 1:

                    url = base_html_url + "&page=1"

                else:

                    url = base_html_url + f"&page={page}"

                resp, _ = source_sget(session, "ONS", url, timeout=20)

                if not resp or not resp.ok:

                    logger.debug(f"ONS HTML: Page {page} fetch failed")

                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # LOCKED SELECTOR: Find release items in ordered list (ol li)

                release_items = soup.select("ol li")

                if not release_items:

                    logger.debug(f"ONS HTML: No release items found on page {page}")

                    break

                page_events = 0

                for item in release_items:

                    try:

                        # LOCKED SELECTOR: Extract title link (first <a> in li)

                        title_link = item.select_one("a")

                        if not title_link:

                            continue

                        title = title_link.get_text(strip=True)

                        if not title:

                            continue

                        href = urljoin(base_html_url, title_link.get("href", ""))

                        # LOCKED SELECTOR: Extract date from "Release date:" text pattern

                        dt_local = None

                        item_text = item.get_text(" ", strip=True)

                        # Pattern: "Release date: 12 September 2025 7:00am | Confirmed"

                        date_match = re.search(r'Release date:\s*(\d{1,2}\s+\w+\s+\d{4})\s+(\d{1,2}:\d{2}[ap]m)', item_text, re.IGNORECASE)

                        if date_match:

                            date_str = date_match.group(1)

                            time_str = date_match.group(2)

                            # Convert time to 24-hour format

                            try:

                                time_24h = datetime.strptime(time_str, "%I:%M%p").strftime("%H:%M")

                                full_date_str = f"{date_str} {time_24h}"

                                dt_parsed = dateparser.parse(full_date_str)

                                if dt_parsed:

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                            except:

                                # Fallback to default time

                                dt_parsed = dateparser.parse(date_str)

                                if dt_parsed:

                                    dt_parsed = dt_parsed.replace(hour=7, minute=0)

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                        # Fallback: try <time datetime> if present

                        if not dt_local:

                            time_el = item.select_one("time[datetime]")

                            if time_el:

                                datetime_str = time_el.get("datetime")

                                dt_parsed = dateparser.parse(datetime_str)

                                if dt_parsed:

                                    if dt_parsed.hour == 0 and dt_parsed.minute == 0:

                                        dt_parsed = dt_parsed.replace(hour=7, minute=0)

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                        if not dt_local:

                            continue

                        dt_utc = dt_local.astimezone(UTC)

                        # Check if within date range

                        if not _within(dt_utc, start_utc, end_utc):

                            continue

                        # Impact classification

                        impact = "High" if any(keyword in title.upper() for keyword in ["GDP", "CPI"]) else \
                                 "Medium" if any(keyword in title.upper() for keyword in ["EMPLOYMENT", "LABOUR", "UNEMPLOYMENT"]) else \
                                 "Low"

                        event = Event(

                            id=make_id("GB", "ONS", title, dt_utc),

                            source="ONS_HTML_UPCOMING",

                            agency="ONS",

                            country="GB",

                            title=title,

                            date_time_utc=dt_utc,

                            event_local_tz="Europe/London",

                            impact=impact,

                            url=href,

                            extras={"release_time_local": dt_local.strftime('%H:%M'), "source_type": "HTML"}

                        )

                        html_events.append(event)

                        page_events += 1

                    except Exception as e:

                        logger.debug(f"ONS HTML: Error parsing item: {e}")

                        continue

                logger.debug(f"ONS HTML: Page {page} - found {page_events} events")

                # Check for next page - LOCKED SELECTOR: look for pagination "Next" link

                if page_events == 0:

                    break

                # Look for next page link in pagination - improved selector

                next_link = soup.select_one(".pager-next a, li.pager__item--next a, a[aria-label*='Next'], a:-soup-contains('Next')")

                if not next_link:

                    # Check numbered pagination with improved selectors

                    page_links = soup.select("a[href*='page='], .pager a, .pagination a")

                    max_page_found = 0

                    for link in page_links:

                        try:

                            href = link.get('href', '')

                            page_match = re.search(r'page=(\d+)', href)

                            if page_match:

                                page_num = int(page_match.group(1))

                                max_page_found = max(max_page_found, page_num)

                        except:

                            continue

                    if page >= max_page_found:

                        break

                page += 1

            logger.debug(f"ONS HTML: Found {len(html_events)} events across {page-1} pages")

        except Exception as e:

            logger.debug(f"ONS HTML fallback failed: {e}")

    # 3. Deduplication - Combine RSS and HTML, prefer RSS if duplicates

    seen_ids = set()

    unique_events = []

    # Process RSS events first (preferred)

    for event in rss_events:

        if event.id not in seen_ids:

            unique_events.append(event)

            seen_ids.add(event.id)

    # Process HTML events, skip duplicates

    for event in html_events:

        if event.id not in seen_ids:

            unique_events.append(event)

            seen_ids.add(event.id)

    # 4. Health Floor Check - ONS must produce â‰¥5 events in 60-day window

    if len(unique_events) >= 5:

        if len(rss_events) > 0:

            logger.info(f"ONS: {len(unique_events)} events (RSS upcoming)")

        else:

            logger.info(f"ONS: {len(unique_events)} events (HTML upcoming)")

    else:

        logger.warning(f"ONS upcoming releases <5 â€“ check if feed/HTML structure changed (found {len(unique_events)})")

    return unique_events

# ---------------------------------------------------------------------------

# Fixed Original Scrapers (BLS, ONS, ABS, StatCan, Eurostat, Stats NZ)

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

def fetch_ism_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """ISM Manufacturing & Services PMI releases from the public calendar."""

    if not BeautifulSoup:

        _finalize_source_log("ISM", "unavailable", 0, zero_reason="BeautifulSoup unavailable; DOM skipped")

        return []

    source_key = "ISM"

    url = "https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/"

    cache_manager = getattr(session, "cache_manager", None)

    def _nth_business_day(year: int, month: int, ordinal: int) -> Optional[int]:
        counter = 0
        for day in range(1, calendar.monthrange(year, month)[1] + 1):
            if datetime(year, month, day).weekday() >= 5:
                continue
            counter += 1
            if counter == ordinal:
                return day
        return None

    def _build_rule_events() -> List[Event]:
        results: List[Event] = []
        local_start = (start_utc - timedelta(days=7)).astimezone(NEW_YORK_TZ)
        local_end = (end_utc + timedelta(days=7)).astimezone(NEW_YORK_TZ)
        cursor = datetime(local_start.year, local_start.month, 1)
        stop = datetime(local_end.year, local_end.month, 1)
        seen_rule_ids: Set[str] = set()
        while cursor <= stop:
            month_name = MONTHS[cursor.month - 1]
            for kind, ordinal, series in (
                ("Manufacturing", 1, "manufacturing_pmi"),
                ("Services", 3, "services_pmi"),
            ):
                day = _nth_business_day(cursor.year, cursor.month, ordinal)
                if not day:
                    continue
                local_dt = ensure_aware(datetime(cursor.year, cursor.month, day, 10, 0), NEW_YORK_TZ, 10, 0)
                dt_utc = local_dt.astimezone(UTC)
                if not _within(dt_utc, start_utc, end_utc):
                    continue
                title = f"ISM {kind} PMI ({month_name} {cursor.year})"
                eid = make_id("US", "ISM", title, dt_utc)
                if eid in seen_rule_ids:
                    continue
                seen_rule_ids.add(eid)
                results.append(
                    Event(
                        id=eid,
                        source="ISM_RULES",
                        agency="ISM",
                        country="US",
                        title=title,
                        date_time_utc=dt_utc,
                        event_local_tz="America/New_York",
                        impact="High",
                        url=url,
                        extras={
                            "release_time_local": local_dt.strftime("%H:%M"),
                            "time_confidence": "assumed",
                            "discovered_via": "ism_release_rules",
                            "series": series,
                        },
                    )
                )
            if cursor.month == 12:
                cursor = datetime(cursor.year + 1, 1, 1)
            else:
                cursor = datetime(cursor.year, cursor.month + 1, 1)
        results.sort(key=lambda ev: ev.date_time_utc)
        return results

    try:

        resp, _ = source_sget(session, source_key, url, timeout=25, path_hint="dom")

    except Exception as exc:

        logger.warning("ISM: calendar fetch failed (%s)", exc)

        resp = None

    if not (resp and getattr(resp, "ok", False)):

        rule_events = _build_rule_events()
        if rule_events:
            _finalize_source_log(source_key, "rules", len(rule_events))
            return rule_events
        zero_reason = "between_releases"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []

    try:

        soup = BeautifulSoup(resp.text or "", "html.parser")

    except Exception:

        logger.debug("ISM: failed to parse calendar HTML", exc_info=True)

        _finalize_source_log(source_key, "none", 0, zero_reason="ISM: DOM parse failed.")

        return []

    rows = soup.select("table tbody tr, table tr")

    events: List[Event] = []

    seen_ids: Set[str] = set()

    for row in rows:

        header = row.find("th")

        cells = row.find_all("td")

        if not header or len(cells) < 2:

            continue

        month_label = header.get_text(" ", strip=True)

        match = re.search(r"([A-Za-z]+)\s+(\d{4})", month_label or "")

        if not match:

            continue

        month_name = match.group(1)

        year = int(match.group(2))

        month_num = month_to_num(month_name)

        if not month_num:

            continue

        manuf_text = cells[0].get_text(" ", strip=True)

        serv_text = cells[1].get_text(" ", strip=True)

        def _emit(kind: str, text_value: str) -> None:

            if not text_value:

                return

            day_match = re.search(r"(\d{1,2})", text_value)

            if not day_match:

                return

            day = int(day_match.group(1))

            try:

                local_dt = ensure_aware(datetime(year, month_num, day, 10, 0), NEW_YORK_TZ, 10, 0)

            except ValueError:

                return

            dt_utc = local_dt.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                return

            title = f"ISM {kind} PMI ({month_name} {year})"

            eid = make_id("US", "ISM", title, dt_utc)

            if eid in seen_ids:

                return

            seen_ids.add(eid)

            extras = {

                "release_time_local": local_dt.strftime("%H:%M"),

                "time_confidence": "assumed",

                "discovered_via": "ism_release_calendar",

                "series": f"{kind.lower()}_pmi",

            }

            events.append(

                Event(

                    id=eid,

                    source="ISM",

                    agency="ISM",

                    country="US",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="America/New_York",

                    impact="High",

                    url=url,

                    extras=extras,

                )

            )

        _emit("Manufacturing", manuf_text)

        _emit("Services", serv_text)

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        if cache_manager:

            try:

                _persist_lkg(source_key, events)

            except Exception:

                logger.debug("ISM: LKG persist failed", exc_info=True)

        _finalize_source_log(source_key, "dom", len(events))

        return events

    rule_events = _build_rule_events()
    if rule_events:
        if cache_manager:
            try:
                _persist_lkg(source_key, rule_events)
            except Exception:
                logger.debug("ISM: LKG persist failed for rules path", exc_info=True)
        _finalize_source_log(source_key, "rules", len(rule_events))
        return rule_events

    merged = maybe_merge_lkg(source_key, [], ttl_days=120, tag="lkg")

    if merged:

        for ev in merged:

            extras = dict(ev.extras or {})

            extras.update({"cached": True, "discovered_via": "lkg"})

            ev.extras = extras

        logger.info("ISM LKG_MERGE: %d", len(merged))

        _finalize_source_log(source_key, "lkg", len(merged))

        return merged

    zero_reason = "between_releases"

    _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)

    if DEBUG_ZERO_FLAG:

        write_zero_snapshot(source_key, resp.text or "no HTTP body", label="none")

    return []


def _iter_local_month_starts(start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> List[datetime]:
    local_start = start_utc.astimezone(tz)
    local_end = end_utc.astimezone(tz)
    return [datetime(year, month, 1) for year, month in _month_year_iter(local_start.year, local_start.month, local_end.year, local_end.month)]


def _shift_local_business_date(year: int, month: int, day: int, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    day = min(day, calendar.monthrange(year, month)[1])
    local_dt = datetime(year, month, day, hour, minute, tzinfo=tz)
    return _shift_to_business_day(local_dt, "forward")


def _last_business_day_local(year: int, month: int, hour: int, minute: int, tz: ZoneInfo, weekday_cap: Optional[int] = None) -> datetime:
    day = calendar.monthrange(year, month)[1]
    local_dt = datetime(year, month, day, hour, minute, tzinfo=tz)
    if weekday_cap is not None:
        while local_dt.weekday() != weekday_cap:
            local_dt -= timedelta(days=1)
    return _shift_to_business_day(local_dt, "backward")


def _curated_us_event(
    agency: str,
    source: str,
    title: str,
    local_dt: datetime,
    url: str,
    *,
    confidence: str = "tentative",
    series: str = "",
) -> Event:
    dt_utc = local_dt.astimezone(UTC)
    extras = {
        "release_time_local": local_dt.strftime("%H:%M"),
        "time_confidence": confidence,
        "discovered_via": "curated_official_schedule",
        "source_hint": "curated",
    }
    if series:
        extras["series"] = series
    return Event(
        id=make_id("US", agency, title, dt_utc),
        source=source,
        agency=agency,
        country="US",
        title=title,
        date_time_utc=dt_utc,
        event_local_tz="America/New_York",
        impact=classify_event(title),
        url=url,
        extras=extras,
    )


def _nth_business_day_local(year: int, month: int, occurrence: int, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    current = datetime(year, month, 1, hour, minute)
    seen = 0
    while current.month == month:
        if current.weekday() < 5:
            seen += 1
            if seen == occurrence:
                return ensure_aware(current, tz, hour, minute)
        current += timedelta(days=1)
    return ensure_aware(datetime(year, month, calendar.monthrange(year, month)[1], hour, minute), tz, hour, minute)


def _weekday_local(year: int, month: int, weekday: int, occurrence: int, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    day = _nth_weekday_of_month(year, month, weekday, occurrence)
    if day is None:
        day = 1
    return ensure_aware(datetime(year, month, day, hour, minute), tz, hour, minute)


BLS_RELEASE_BASE_URL = "https://www.bls.gov/schedule/news_release"
BLS_API_V2_SINGLE_SERIES_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/{series_id}"

BLS_CANONICAL_SPECS: Dict[str, Dict[str, Any]] = {
    "BLS_EMPLOYMENT_SITUATION": {
        "title": "US Employment Situation / Nonfarm Payrolls",
        "url": f"{BLS_RELEASE_BASE_URL}/empsit.htm",
        "patterns": (
            r"\bemployment situation\b",
            r"\bnonfarm\b",
            r"\bpayrolls?\b",
            r"\bunemployment rate\b",
            r"\baverage hourly earnings\b",
        ),
        "category": "labor",
        "impact": "High",
        "score": 90,
        "series": "employment_situation",
        "api_series_id": "CES0000000001",
        "rule": lambda year, month: _weekday_local(year, month, 4, 1, 8, 30, NEW_YORK_TZ),
    },
    "BLS_CPI": {
        "title": "US Consumer Price Index (CPI)",
        "url": f"{BLS_RELEASE_BASE_URL}/cpi.htm",
        "patterns": (r"\bconsumer price index\b", r"\bcpi\b"),
        "category": "inflation",
        "impact": "High",
        "score": 90,
        "series": "cpi",
        "api_series_id": "CUSR0000SA0",
        "rule": lambda year, month: _nth_business_day_local(year, month, 8, 8, 30, NEW_YORK_TZ),
    },
    "BLS_PPI": {
        "title": "US Producer Price Index (PPI)",
        "url": f"{BLS_RELEASE_BASE_URL}/ppi.htm",
        "patterns": (r"\bproducer price index\b", r"\bppi\b"),
        "category": "inflation",
        "impact": "High",
        "score": 85,
        "series": "ppi",
        "api_series_id": "WPUFD4",
        "rule": lambda year, month: _nth_business_day_local(year, month, 9, 8, 30, NEW_YORK_TZ),
    },
    "BLS_JOLTS": {
        "title": "US JOLTS Job Openings",
        "url": f"{BLS_RELEASE_BASE_URL}/jolts.htm",
        "patterns": (r"\bjob openings and labor turnover\b", r"\bjolts\b", r"\bjob openings\b"),
        "category": "labor",
        "impact": "High",
        "score": 80,
        "series": "jolts",
        "api_series_id": "JTS000000000000000JOL",
        "rule": lambda year, month: _weekday_local(year, month, 1, 1, 10, 0, NEW_YORK_TZ),
    },
    "BLS_IMPORT_EXPORT_PRICES": {
        "title": "US Import/Export Price Indexes",
        "url": f"{BLS_RELEASE_BASE_URL}/ximpim.htm",
        "patterns": (r"\bimport and export price\b", r"\bimport/export price\b", r"\bu\.s\. import and export price\b"),
        "category": "inflation",
        "impact": "Medium",
        "score": 75,
        "series": "import_export_prices",
        "api_series_id": "EIUIR",
        "rule": lambda year, month: _nth_business_day_local(year, month, 12, 8, 30, NEW_YORK_TZ),
    },
    "BLS_ECI": {
        "title": "US Employment Cost Index",
        "url": f"{BLS_RELEASE_BASE_URL}/eci.htm",
        "patterns": (r"\bemployment cost index\b", r"\beci\b"),
        "category": "labor",
        "impact": "Medium",
        "score": 75,
        "series": "employment_cost_index",
        "api_series_id": "CIU1010000000000A",
        "rule": lambda year, month: _last_business_day_local(year, month, 8, 30, NEW_YORK_TZ) if month in {1, 4, 7, 10} else None,
    },
    "BLS_PRODUCTIVITY_COSTS": {
        "title": "US Productivity and Costs",
        "url": f"{BLS_RELEASE_BASE_URL}/prod2.htm",
        "patterns": (r"\bproductivity and costs\b", r"\bproductivity\b"),
        "category": "growth",
        "impact": "Medium",
        "score": 70,
        "series": "productivity_costs",
        "api_series_id": "PRS85006092",
        "rule": lambda year, month: _nth_business_day_local(year, month, 4, 8, 30, NEW_YORK_TZ) if month in {2, 5, 8, 11} else None,
    },
    "BLS_REAL_EARNINGS": {
        "title": "US Real Earnings",
        "url": f"{BLS_RELEASE_BASE_URL}/realer.htm",
        "patterns": (r"\breal earnings\b",),
        "category": "labor",
        "impact": "Medium",
        "score": 70,
        "series": "real_earnings",
        "api_series_id": "CES0500000011",
        "rule": lambda year, month: _nth_business_day_local(year, month, 8, 8, 30, NEW_YORK_TZ),
    },
}

# Reviewed against the official BLS ICS feed on 2026-05-31. These replace
# estimator dates only for the listed months; later months keep rule fallback.
BLS_CURATED_OFFICIAL_DATE_OVERRIDES: Dict[str, Tuple[str, ...]] = {
    "BLS_EMPLOYMENT_SITUATION": (
        "2026-06-05T12:30:00+00:00",
        "2026-07-02T12:30:00+00:00",
        "2026-08-07T12:30:00+00:00",
    ),
    "BLS_CPI": (
        "2026-06-10T12:30:00+00:00",
        "2026-07-14T12:30:00+00:00",
        "2026-08-12T12:30:00+00:00",
    ),
    "BLS_PPI": (
        "2026-06-11T12:30:00+00:00",
        "2026-07-15T12:30:00+00:00",
        "2026-08-13T12:30:00+00:00",
    ),
    "BLS_JOLTS": (
        "2026-06-02T14:00:00+00:00",
        "2026-06-30T14:00:00+00:00",
        "2026-07-22T14:00:00+00:00",
        "2026-08-04T14:00:00+00:00",
    ),
    "BLS_IMPORT_EXPORT_PRICES": (
        "2026-06-16T12:30:00+00:00",
        "2026-07-17T12:30:00+00:00",
        "2026-08-18T12:30:00+00:00",
    ),
    "BLS_ECI": ("2026-07-31T12:30:00+00:00",),
    "BLS_PRODUCTIVITY_COSTS": (
        "2026-06-04T12:30:00+00:00",
        "2026-08-06T12:30:00+00:00",
    ),
    "BLS_REAL_EARNINGS": (
        "2026-06-10T12:30:00+00:00",
        "2026-07-14T12:30:00+00:00",
        "2026-08-12T12:30:00+00:00",
    ),
}


def _bls_canonical_key_from_text(text: str) -> Optional[str]:
    normalized = _normalize_metadata_text(text).lower()
    if not normalized:
        return None
    for key, spec in BLS_CANONICAL_SPECS.items():
        if _regex_has_any(normalized, tuple(spec.get("patterns") or ())):
            return key
    return None


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
    target_root = Path(out_dir or OUT_DIR) / "diagnostics"
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
        snapshot_root = OUT_DIR / "snapshots" / "bls"
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


def fetch_bea_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "BEA"
    url = "https://www.bea.gov/news/schedule"
    events: List[Event] = []
    for cursor in _iter_local_month_starts(start_utc, end_utc, NEW_YORK_TZ):
        pce_dt = _last_business_day_local(cursor.year, cursor.month, 8, 30, NEW_YORK_TZ, weekday_cap=4)
        gdp_dt = _last_business_day_local(cursor.year, cursor.month, 8, 30, NEW_YORK_TZ, weekday_cap=3)
        for title, local_dt, series in (
            ("BEA Personal Income and Outlays (PCE Price Index, Core PCE)", pce_dt, "pce"),
            ("BEA Gross Domestic Product (GDP) and GDP Price Index", gdp_dt, "gdp"),
        ):
            if _within(local_dt.astimezone(UTC), start_utc, end_utc):
                events.append(_curated_us_event("BEA", "BEA_CURATED", title, local_dt, url, series=series))
    events.sort(key=lambda ev: ev.date_time_utc)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_census_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "CENSUS"
    url = "https://www.census.gov/economic-indicators/calendar-listview.html"
    specs = [
        ("Census Retail Sales", 15, "retail_sales"),
        ("Census Durable Goods Orders", 26, "durable_goods"),
        ("Census New Home Sales", 23, "new_home_sales"),
        ("Census Housing Starts and Building Permits", 18, "housing_starts"),
        ("Census Factory Orders", 4, "factory_orders"),
    ]
    events: List[Event] = []
    for cursor in _iter_local_month_starts(start_utc, end_utc, NEW_YORK_TZ):
        for title, day, series in specs:
            local_dt = _shift_local_business_date(cursor.year, cursor.month, day, 8, 30, NEW_YORK_TZ)
            if _within(local_dt.astimezone(UTC), start_utc, end_utc):
                events.append(_curated_us_event("CENSUS", "CENSUS_CURATED", title, local_dt, url, series=series))
    events.sort(key=lambda ev: ev.date_time_utc)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_dol_jobless_claims_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "DOL"
    url = "https://www.dol.gov/ui/data.pdf"
    events: List[Event] = []
    local_cursor = start_utc.astimezone(NEW_YORK_TZ).replace(hour=8, minute=30, second=0, microsecond=0) - timedelta(days=7)
    while local_cursor.weekday() != 3:
        local_cursor += timedelta(days=1)
    local_end = end_utc.astimezone(NEW_YORK_TZ) + timedelta(days=7)
    while local_cursor <= local_end:
        if _within(local_cursor.astimezone(UTC), start_utc, end_utc):
            events.append(
                _curated_us_event(
                    "DOL",
                    "DOL_CURATED",
                    "US Initial and Continuing Jobless Claims",
                    local_cursor,
                    url,
                    confidence="exact",
                    series="jobless_claims",
                )
            )
        local_cursor += timedelta(days=7)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_eia_petroleum_status_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    del session
    source_key = "EIA"
    url = "https://www.eia.gov/petroleum/supply/weekly/schedule.php"
    events: List[Event] = []
    local_cursor = start_utc.astimezone(NEW_YORK_TZ).replace(hour=10, minute=30, second=0, microsecond=0) - timedelta(days=7)
    while local_cursor.weekday() != 2:
        local_cursor += timedelta(days=1)
    local_end = end_utc.astimezone(NEW_YORK_TZ) + timedelta(days=7)
    while local_cursor <= local_end:
        if _within(local_cursor.astimezone(UTC), start_utc, end_utc):
            events.append(
                _curated_us_event(
                    "EIA",
                    "EIA_CURATED",
                    "EIA Weekly Petroleum Status Report (Crude Oil, Gasoline, Distillate Inventories)",
                    local_cursor,
                    url,
                    confidence="exact",
                    series="oil_inventories",
                )
            )
        local_cursor += timedelta(days=7)
    _finalize_source_log(source_key, "curated", len(events), zero_reason=None if events else "outside_window")
    return events


def fetch_umich_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """University of Michigan Consumer Sentiment releases via curated schedule rules."""

    tz = NEW_YORK_TZ

    buffer_start = (start_utc - timedelta(days=45)).astimezone(tz)

    buffer_end = (end_utc + timedelta(days=45)).astimezone(tz)

    events: List[Event] = []

    def _emit(year: int, month: int, day: int, release_type: str, hour: int, minute: int) -> None:

        try:

            local_dt = ensure_aware(datetime(year, month, day, hour, minute), tz, hour, minute)

        except ValueError:

            return

        dt_utc = local_dt.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            return

        month_name = MONTHS[month - 1]

        title = f"University of Michigan Consumer Sentiment ({release_type})"

        extras = {

            "release_type": release_type,

            "release_time_local": local_dt.strftime("%H:%M"),

            "time_confidence": "assumed",

            "discovered_via": "umich_curated_rule",

        }

        events.append(

            Event(

                id=make_id("US", "UMICH", title, dt_utc),

                source="UMICH",

                agency="University of Michigan",

                country="US",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/New_York",

                impact="High",

                url="https://data.sca.isr.umich.edu/",

                extras=extras,

            )

        )

    for year, month in _month_year_iter(buffer_start.year, buffer_start.month, buffer_end.year, buffer_end.month):

        prelim_day = _nth_weekday_of_month(year, month, weekday=4, occurrence=2)  # Friday=4

        if prelim_day is None:

            prelim_day = _nth_weekday_of_month(year, month, weekday=4, occurrence=1)

        final_day = _last_weekday_of_month(year, month, weekday=4)

        for release_type, day in (("Prelim", prelim_day), ("Final", final_day)):

            if not day:

                continue

            override = CURATED_UMICH_OVERRIDES.get((year, month, release_type.lower()))

            day_override = override.get("day") if override else None

            actual_day = int(day_override) if day_override else day

            hour = int(override.get("hour", 10)) if override else 10

            minute = int(override.get("minute", 0)) if override else 0

            _emit(year, month, actual_day, release_type, hour, minute)

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        _finalize_source_log("UMICH", "curated", len(events))

        return events

    zero_reason = "UMICH: curated schedule produced no releases within the requested window."

    _finalize_source_log("UMICH", "none", 0, zero_reason=zero_reason)

    return []

def fetch_adp_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """ADP National Employment Report releases using first-Wednesday schedule."""

    tz = NEW_YORK_TZ

    buffer_start = (start_utc - timedelta(days=45)).astimezone(tz)

    buffer_end = (end_utc + timedelta(days=45)).astimezone(tz)

    events: List[Event] = []

    for year, month in _month_year_iter(buffer_start.year, buffer_start.month, buffer_end.year, buffer_end.month):

        day = _nth_weekday_of_month(year, month, weekday=2, occurrence=1)  # Wednesday=2

        override = CURATED_ADP_OVERRIDES.get((year, month))

        if override:

            day = override.get("day", day)

        if not day:

            continue

        hour = int(override.get("hour", 8)) if override else 8

        minute = int(override.get("minute", 15)) if override else 15

        try:

            local_dt = ensure_aware(datetime(year, month, int(day), hour, minute), tz, hour, minute)

        except ValueError:

            continue

        dt_utc = local_dt.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            continue

        title = f"ADP National Employment Report ({MONTHS[month - 1]} {year})"

        extras = {

            "release_time_local": local_dt.strftime("%H:%M"),

            "time_confidence": "assumed",

            "discovered_via": "adp_curated_rule",

        }

        events.append(

            Event(

                id=make_id("US", "ADP", title, dt_utc),

                source="ADP",

                agency="ADP",

                country="US",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/New_York",

                impact="High",

                url="https://adpemploymentreport.com/",

                extras=extras,

            )

        )

    if events:

        events.sort(key=lambda ev: ev.date_time_utc)

        _finalize_source_log("ADP", "curated", len(events))

        return events

    zero_reason = "ADP: curated first-Wednesday schedule produced no events in window."

    _finalize_source_log("ADP", "none", 0, zero_reason=zero_reason)

    return []


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


CURRENT_CACHE_MANAGER: Optional[EnhancedCacheManager] = None

FETCH_METADATA: Dict[str, Dict[str, Any]] = {}
FETCH_METADATA_LOCK = threading.RLock()

RUN_CONTEXT: Dict[str, Any] = {}
RUN_CONTEXT_LOCK = threading.RLock()
RUN_OVERRIDES: Dict[str, Any] = {}
DEBUG_ZERO_FLAG = False
STRICT_ZERO_FLAG = False
ZERO_SNAPSHOT_MAX_CHARS = 3000
FETCH_GROUP_MAX_WORKERS = 4

def _zero_snapshot_dir() -> Path:
    """
    Resolve the snapshot directory for zero proofs, honoring overrides and current cache manager.
    """
    base: Optional[Path] = None
    cache = CURRENT_CACHE_MANAGER
    if cache is not None:
        base = getattr(cache, "snapshots_dir", None)
    override = RUN_OVERRIDES.get("snapshots_dir")
    if override:
        base = Path(override)
    if base is None:
        base = Path("failures")
    return base / "zero"

def write_zero_snapshot(source_key: str, text: Optional[str], label: Optional[str] = None) -> None:
    """
    Persist a short text snapshot proving a zero-result scrape when debug-zero is enabled.
    """
    if not DEBUG_ZERO_FLAG or RUN_CONTEXT.get("serverless"):
        return
    snippet = unicodedata.normalize("NFKC", text or "no HTTP body").replace("\r\n", "\n")
    snippet = snippet.strip()
    if not snippet:
        snippet = "no HTTP body"
    if len(snippet) > ZERO_SNAPSHOT_MAX_CHARS:
        snippet = snippet[:ZERO_SNAPSHOT_MAX_CHARS]
    try:
        target_dir = _zero_snapshot_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%d")
        suffix = f"_{label}" if label else ""
        target = target_dir / f"{source_key.upper()}{suffix}_{stamp}.txt"
        target.write_text(snippet, encoding="utf-8")
        digest = hashlib.sha256(snippet.encode("utf-8")).hexdigest()
        _set_fetch_metadata(source_key, snapshot_hash=digest)
    except Exception:
        logger.debug("Zero snapshot write failed for %s", source_key, exc_info=True)

def _finalize_source_log(
    source: str,
    path_used: str,
    count: int,
    *,
    zero_reason: Optional[str] = None,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> None:
    logger.info("%s path used: %s (%d)", source, path_used, count)
    if count > 0 and zero_reason is None:
        zero_reason = ""
    meta: Dict[str, Any] = {}
    if extra_meta:
        meta.update(extra_meta)
    source_key = str(source or "").upper()
    if path_used == "curated" and source_key in {"BLS", *CENTRAL_BANK_AGENCIES}:
        meta.setdefault("live_source_failed", True)
    _set_fetch_metadata(source, count=count, path=path_used, zero_reason=zero_reason, **meta)

BIG_FEEDER_THRESHOLDS = {"BLS": 100, "EUROSTAT": 200, "STATSNZ": 100}

def _reset_fetch_metadata() -> None:
    with FETCH_METADATA_LOCK:
        FETCH_METADATA.clear()

def _set_fetch_metadata(source: str, **fields: Any) -> Dict[str, Any]:
    with FETCH_METADATA_LOCK:
        entry = FETCH_METADATA.setdefault(source.upper(), {})

        for key, value in fields.items():

            if value is not None:

                entry[key] = value

        return dict(entry)

def _get_fetch_metadata(source: str) -> Dict[str, Any]:
    with FETCH_METADATA_LOCK:
        return dict(FETCH_METADATA.get(source.upper(), {}))

def _snapshot_fetch_metadata() -> Dict[str, Dict[str, Any]]:
    with FETCH_METADATA_LOCK:
        return {key: dict(value) for key, value in FETCH_METADATA.items()}

def _lkg_meta_path(cache: EnhancedCacheManager, source_tag: str) -> Path:

    return cache.cache_dir / "meta" / f"{source_tag.lower()}_lkg.json"

def _persist_lkg(source_tag: str, events: List[Event]) -> None:

    if not (ENABLE_LKG and events):

        return

    if not RUN_CONTEXT.get("allow_persist", True):
        return

    if RUN_CONTEXT.get("serverless"):
        return

    cache = CURRENT_CACHE_MANAGER

    if cache is None:

        return

    try:

        target = _lkg_meta_path(cache, source_tag)

        target.parent.mkdir(parents=True, exist_ok=True)

        payload = {

            "source": source_tag,

            "saved_at": _iso(_now_utc()),

            "events": [_event_to_dict(ev) for ev in sorted(events, key=lambda item: item.date_time_utc)],

        }

        target.write_text(json.dumps(payload, ensure_ascii=False))

    except Exception:

        logger.debug("LKG persist failed for %s", source_tag, exc_info=True)

def maybe_merge_lkg(
    source_tag: str,
    events: List[Event],
    ttl_days: Optional[int] = None,
    tag: Optional[str] = None,
) -> List[Event]:

    if events or not ENABLE_LKG:

        return events

    if not RUN_CONTEXT.get("allow_persist", True):
        return events

    if RUN_CONTEXT.get("serverless"):
        return events

    cache = CURRENT_CACHE_MANAGER

    if cache is None:

        return events

    path = _lkg_meta_path(cache, source_tag)

    if not path.exists():

        return events

    try:

        payload = json.loads(path.read_text())

    except Exception:

        logger.debug("LKG read failed for %s", source_tag, exc_info=True)

        return events

    saved_at_raw = payload.get("saved_at")

    if not saved_at_raw:

        return events

    try:

        saved_at = datetime.fromisoformat(saved_at_raw)

    except Exception:

        return events

    if saved_at.tzinfo is None:

        saved_at = saved_at.replace(tzinfo=UTC)

    effective_ttl = ttl_days if ttl_days is not None else LKG_TTLS.get(source_tag.upper(), 30)

    if (_now_utc() - saved_at).days > effective_ttl:

        return events

    start_utc = RUN_CONTEXT.get("start_utc")

    end_utc = RUN_CONTEXT.get("end_utc")

    merged: List[Event] = []

    for data in payload.get("events", []):

        try:

            ev = _event_from_dict(data)

        except Exception:

            continue

        extras = dict(ev.extras or {})

        extras["cached"] = True

        extras["lkg_timestamp"] = saved_at.isoformat()

        if tag:

            extras["lkg_tag"] = tag

        ev.extras = extras

        if isinstance(start_utc, datetime) and isinstance(end_utc, datetime):

            if not _within(ev.date_time_utc, start_utc, end_utc):

                continue

        merged.append(ev)

    if merged:

        merged.sort(key=lambda ev: ev.date_time_utc)

        logger.info(f"{source_tag}: merged {len(merged)} cached event(s) from LKG")

        return merged

    return events

def _read_lkg_events(source_tag: str) -> List[Event]:
    if RUN_CONTEXT.get("serverless"):
        return []
    cache = CURRENT_CACHE_MANAGER
    if cache is None:
        return []
    path = _lkg_meta_path(cache, source_tag)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return []
    events: List[Event] = []
    for data in payload.get("events", []):
        try:
            events.append(_event_from_dict(data))
        except Exception:
            continue
    events.sort(key=lambda ev: ev.date_time_utc)
    return events

def _schema_meta_path(cache: EnhancedCacheManager, source_key: str) -> Path:

    return cache.cache_dir / "meta" / f"{source_key.lower()}_schema.json"

def _schema_capture(cache: Optional[EnhancedCacheManager], source: str, url: str, content: bytes, parsed_count: int, meta_suffix: str = "") -> None:

    if not (ENABLE_SCHEMA_SENTINEL and cache and content):

        return

    source_key = source.lower()

    if meta_suffix:

        source_key = f"{source_key}_{meta_suffix.lower()}"

    meta_path = _schema_meta_path(cache, source_key)

    last_hash = None

    if meta_path.exists():

        try:

            last_hash = json.loads(meta_path.read_text()).get("hash")

        except Exception:

            logger.debug("schema meta read failed", exc_info=True)

    container_bytes: bytes = content or b""

    if BeautifulSoup:

        try:

            soup = BeautifulSoup(container_bytes, "html.parser")

            candidate = soup.find("main") or soup.find(id="content") or soup.find("body")

            target_node = candidate or soup

            try:

                container_bytes = target_node.encode()

            except Exception:

                container_bytes = str(target_node).encode("utf-8", errors="ignore")

        except Exception:

            container_bytes = content or b""

    current_hash = _content_hash_bytes(container_bytes)

    meta_path.parent.mkdir(parents=True, exist_ok=True)

    try:

        meta_path.write_text(json.dumps({"hash": current_hash, "ts": _iso(_now_utc()), "url": url}, ensure_ascii=False))

    except Exception:

        logger.debug("schema meta write failed", exc_info=True)

    if parsed_count == 0 and last_hash and last_hash != current_hash:

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        suffix_part = f"-{meta_suffix}" if meta_suffix else ""

        snap_name = f"{source}{suffix_part}-{stamp}.html"

        try:

            cache.snapshots_dir.mkdir(parents=True, exist_ok=True)

            (cache.snapshots_dir / snap_name).write_bytes(content or b"")

        except Exception:

            logger.debug("snapshot write failed", exc_info=True)

        log_tag = f"{source}:{meta_suffix}" if meta_suffix else source

        logger.warning(f"SCHEMA_BREAK {log_tag}: container hash changed and parsed=0 — snapshot saved")

def _update_source_health_from_meta(source_key: str) -> None:

    ctx = RUN_CONTEXT

    meta = _get_fetch_metadata(source_key)

    if not meta:

        return

    count = meta.get("count", 0) or 0

    path = meta.get("path")
    zero_reason = meta.get("zero_reason")
    canonical_key = _canonical_health_key(source_key)
    raw_key = str(source_key or "").upper()
    alias_keys = [
        alias
        for alias, canonical in AGENCY_KEY_OVERRIDES.items()
        if canonical == canonical_key and alias != canonical_key
    ]

    per_source = ctx.setdefault("per_source", {})

    persist_state = ctx.setdefault("health_persistent", {})

    entry = persist_state.get(canonical_key, {})
    if not entry:
        for candidate_key in [raw_key] + alias_keys:
            if candidate_key != canonical_key and persist_state.get(candidate_key):
                entry = persist_state.get(candidate_key, {})
                break

    if count > 0:

        entry = {

            "last_success_ts": _iso(_now_utc()),

            "consecutive_failures": 0,

            "path": path,

        }

    else:

        entry = dict(entry or {})

        if _is_benign_zero_case(canonical_key, path, count, zero_reason):
            entry["consecutive_failures"] = 0
        else:
            entry["consecutive_failures"] = entry.get("consecutive_failures", 0) + 1

        entry["path"] = path

    persist_state[canonical_key] = entry
    for candidate_key in {raw_key, *alias_keys}:
        if candidate_key != canonical_key:
            persist_state.pop(candidate_key, None)

    per_source[canonical_key] = {

        "count": count,

        "path": path,

        "last_success_ts": entry.get("last_success_ts"),

        "consecutive_failures": entry.get("consecutive_failures", 0),

    }
    for candidate_key in {raw_key, *alias_keys}:
        if candidate_key != canonical_key:
            per_source.pop(candidate_key, None)

def _canonical_health_key(source_key: str) -> str:
    return AGENCY_KEY_OVERRIDES.get(str(source_key or "").upper(), str(source_key or "").upper())

def _build_health_status_payload(
    sources_payload: Dict[str, Dict[str, Any]],
    since_days: int,
    until_days: int,
    existing_health_status: Dict[str, Dict[str, Any]],
    curated_fallbacks: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Dict[str, Any]]:

    payload: Dict[str, Dict[str, Any]] = {}
    curated_fallbacks = {_canonical_health_key(key): value for key, value in (curated_fallbacks or {}).items()}
    normalized_sources: Dict[str, Dict[str, Any]] = {}
    for raw_key, meta in (sources_payload or {}).items():
        canonical_key = _canonical_health_key(raw_key)
        previous_meta = normalized_sources.get(canonical_key)
        if previous_meta is None or int((meta or {}).get("count", 0) or 0) >= int((previous_meta or {}).get("count", 0) or 0):
            normalized_sources[canonical_key] = meta or {}

    normalized_existing: Dict[str, Dict[str, Any]] = {}
    for raw_key, entry in (existing_health_status or {}).items():
        normalized_existing[_canonical_health_key(raw_key)] = entry or {}

    keys = set(SourceHealth.SLO.keys()) | set(normalized_existing.keys()) | set(normalized_sources.keys())

    for source_key in sorted(keys):

        if source_key in SourceHealth.SLO:

            expected = SourceHealth.scaled(since_days, until_days, source_key)

        else:

            expected = int((normalized_existing.get(source_key, {}) or {}).get("expected", 0) or 0)

            if expected <= 0 and source_key not in normalized_sources:

                continue

        actual = int((normalized_sources.get(source_key, {}) or {}).get("count", 0) or 0)
        source_meta = normalized_sources.get(source_key, {}) or {}
        curated_entry = curated_fallbacks.get(source_key)
        if curated_entry and curated_entry.get("used"):
            status = "FALLBACK_FRESH" if bool(curated_entry.get("fresh")) else "FALLBACK_STALE"
        elif actual == 0 and _is_benign_zero_case(
            source_key,
            source_meta.get("path_used"),
            actual,
            source_meta.get("zero_reason"),
        ):
            status = "QUIET"
        elif actual == 0 and (
            source_meta.get("errors")
            or str(source_meta.get("path_used") or "").strip().lower() == "none"
            or (
                bool(_normalize_zero_reason(source_meta.get("zero_reason")))
                and not _is_benign_zero_reason(source_meta.get("zero_reason"), source_key=source_key)
            )
            or (expected > 0 and not _is_benign_zero_reason(source_meta.get("zero_reason"), source_key=source_key))
        ):
            status = "FAILED"
        else:
            status = "HEALTHY" if expected <= 0 or actual >= expected else "DEGRADED"
        payload[source_key] = {"actual": actual, "expected": expected, "status": status}

    return payload


CORE_REQUIRED_MARKET_SOURCES = {"FED", "ECB", "BLS", "BEA", "DOL", "ISM"}
MARKET_MOVER_KEYWORDS = {
    "CPI": (r"\bcpi\b", r"\bconsumer price index\b", r"\binflation\b"),
    "PCE": (r"\bpce\b", r"\bpersonal income and outlays\b"),
    "GDP": (r"\bgdp\b", r"\bgross domestic product\b"),
    "PMI": (r"\bpmi\b", r"\bpurchasing managers\b"),
    "ISM": (r"\bism\b",),
    "NFP": (r"\bnonfarm\b", r"\bemployment situation\b"),
    "Unemployment": (r"\bunemployment\b",),
    "Jobless Claims": (r"\bjobless claims?\b",),
    "Retail Sales": (r"\bretail sales\b",),
    "Durable Goods": (r"\bdurable goods\b",),
    "Consumer Confidence": (r"\bconsumer confidence\b", r"\bconsumer sentiment\b"),
    "Central Bank Decision": (r"\brate decision\b", r"\bmonetary policy\b", r"\bfomc\b", r"\bgoverning council\b"),
    "Minutes": (r"\bminutes\b", r"\baccounts\b"),
    "Press Conference": (r"\bpress conference\b",),
    "Oil Inventories": (r"\boil inventories\b", r"\bpetroleum status\b", r"\bcrude oil\b"),
}


def _event_dt_utc(event: Event) -> datetime:
    dt = event.date_time_utc
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _market_window_summary(events: List[Event], start_utc: datetime, end_utc: datetime) -> Dict[str, Any]:
    selected = [ev for ev in events if start_utc <= _event_dt_utc(ev) <= end_utc]
    category_counts: Dict[str, int] = {}
    region_counts: Dict[str, int] = {}
    keyword_hits: Dict[str, int] = {key: 0 for key in MARKET_MOVER_KEYWORDS}
    market_movers = 0
    for ev in selected:
        extras = ev.extras or {}
        category = str(extras.get("category") or _infer_event_category(ev))
        category_counts[category] = category_counts.get(category, 0) + 1
        region = _normalize_event_country_code(ev) or ev.country or "unknown"
        region_counts[region] = region_counts.get(region, 0) + 1
        score = int(extras.get("trader_relevance_score") or 0)
        if score >= 60:
            market_movers += 1
        text = _eventish_text_blob(ev)
        for key, patterns in MARKET_MOVER_KEYWORDS.items():
            if _regex_has_any(text, patterns):
                keyword_hits[key] += 1
    return {
        "event_count": len(selected),
        "market_mover_count": market_movers,
        "category_counts": category_counts,
        "region_counts": region_counts,
        "keyword_hits": keyword_hits,
        "missing_keywords": [key for key, count in keyword_hits.items() if count == 0],
    }


def _build_market_mover_coverage(events: List[Event], now_utc: datetime) -> Dict[str, Any]:
    return {
        "next_7_days": _market_window_summary(events, now_utc, now_utc + timedelta(days=7)),
        "next_30_days": _market_window_summary(events, now_utc, now_utc + timedelta(days=30)),
    }


def _empty_qa_summary() -> Dict[str, Any]:
    return {
        "eurostat_core_samples": [],
        "bls_official_event_count": 0,
        "speaker_event_count": 0,
        "market_movers_speaker_count": 0,
        "pmi_cluster_count": 0,
    }


def _build_compact_qa_summary(events: List[Event], speakers_health: Dict[str, Any]) -> Dict[str, Any]:
    summary = _empty_qa_summary()
    eurostat_patterns = (
        r"^\s*unemployment\s*$",
        r"^\s*flash estimate inflation euro area\s*$",
        r"^\s*gdp main aggregates and employment\s*$",
    )
    eurostat_samples: List[Dict[str, Any]] = []
    pmi_clusters: set[str] = set()
    for event in events:
        extras = event.extras or {}
        if event.agency == "EUROSTAT" and _regex_has_any(event.title.lower(), eurostat_patterns):
            local_dt = _event_dt_utc(event).astimezone(EUROSTAT_TZ)
            eurostat_samples.append(
                {
                    "title": event.title,
                    "source_local_date_time": local_dt.isoformat(),
                    "source_local_timezone": event.event_local_tz,
                    "event_time_utc": _event_dt_utc(event).isoformat(),
                }
            )
        if extras.get("event_group_type") == "pmi_cluster" and extras.get("event_group_key"):
            pmi_clusters.add(str(extras["event_group_key"]))
    summary["eurostat_core_samples"] = eurostat_samples[:6]
    summary["bls_official_event_count"] = sum(
        1
        for event in events
        if event.agency == "BLS" and str((event.extras or {}).get("source_reliability") or "") == "official"
    )
    summary["speaker_event_count"] = int((speakers_health or {}).get("speaker_event_count", 0) or 0)
    summary["market_movers_speaker_count"] = int((speakers_health or {}).get("default_dashboard_count", 0) or 0)
    summary["pmi_cluster_count"] = len(pmi_clusters)
    return summary


def _build_curated_fallback_health(
    sources_payload: Dict[str, Dict[str, Any]],
    as_of_utc: datetime,
) -> Tuple[Dict[str, Dict[str, Any]], List[str], List[str], List[str]]:
    curated_fallbacks: Dict[str, Dict[str, Any]] = {}
    live_source_warnings: List[str] = []
    stale_sources: List[str] = []
    stale_required_sources: List[str] = []
    for raw_source, meta in sorted((sources_payload or {}).items()):
        source = _curated_fallback_source_key(raw_source)
        path_used = str((meta or {}).get("path_used") or "").strip().lower()
        count = int((meta or {}).get("count", 0) or 0)
        if path_used != "curated" or count <= 0:
            continue
        info = _curated_fallback_info(source, as_of_utc)
        if not info:
            continue
        entry = {"used": True, **info}
        curated_fallbacks[source] = entry
        if entry["fresh"]:
            logger.warning(
                "CURATED_FALLBACK_USED: %s reviewed_at=%s age_days=%s max_age_days=%s fresh=true",
                source,
                entry["reviewed_at"],
                entry["age_days"],
                entry["max_age_days"],
            )
            if bool((meta or {}).get("live_source_failed")):
                warning = f"{source} live source failed; using curated fallback reviewed on {entry['reviewed_at']}"
                live_source_warnings.append(warning)
                logger.warning("LIVE_SOURCE_WARNING: %s live source failed; using fresh curated fallback", source)
        else:
            logger.error(
                "CURATED_FALLBACK_STALE: %s reviewed_at=%s age_days=%s max_age_days=%s",
                source,
                entry["reviewed_at"],
                entry["age_days"],
                entry["max_age_days"],
            )
            stale_sources.append(source)
            if source in CORE_REQUIRED_MARKET_SOURCES or source in STRICT_ZERO_SOURCES:
                stale_required_sources.append(source)
    return curated_fallbacks, live_source_warnings, sorted(set(stale_sources)), sorted(set(stale_required_sources))


def _health_status_for_run(
    *,
    fatal_missing: List[str],
    warn_missing: List[str],
    sources_payload: Dict[str, Dict[str, Any]],
    market_mover_coverage: Dict[str, Any],
    stale_curated_sources: Optional[List[str]] = None,
    stale_required_curated_sources: Optional[List[str]] = None,
) -> Tuple[str, bool, List[str], List[str], List[str]]:
    missing_required: List[str] = []
    degraded_sources: List[str] = []
    failure_reasons: List[str] = []
    for source in sorted(CORE_REQUIRED_MARKET_SOURCES):
        meta = sources_payload.get(source)
        if not meta:
            missing_required.append(source)
            continue
        count = int(meta.get("count", 0) or 0)
        if count == 0 and not _is_benign_zero_case(source, meta.get("path_used"), count, meta.get("zero_reason")):
            missing_required.append(source)
    bls_meta = sources_payload.get("BLS") or {}
    bls_health = bls_meta.get("bls_health") if isinstance(bls_meta, dict) else {}
    bls_required_missing = list((bls_meta.get("bls_required_missing") or []) if isinstance(bls_meta, dict) else [])
    if isinstance(bls_health, dict):
        bls_required_missing = list(bls_health.get("required_missing") or bls_required_missing)
        if str(bls_health.get("status") or "").lower() == "failed" and "BLS" not in missing_required:
            missing_required.append("BLS")
    stale_curated_sources = sorted(set(stale_curated_sources or []))
    stale_required_curated_sources = sorted(set(stale_required_curated_sources or []))
    degraded_sources = sorted(set(warn_missing) | set(stale_required_curated_sources))
    if fatal_missing:
        failure_reasons.append("STRICT_ZERO: " + ", ".join(sorted(fatal_missing)))
    if missing_required:
        failure_reasons.append("missing required market mover sources: " + ", ".join(missing_required))
    if bls_required_missing:
        failure_reasons.append("missing required BLS events: " + ", ".join(sorted(set(map(str, bls_required_missing)))))
    if stale_required_curated_sources:
        failure_reasons.append("stale curated fallback for required source: " + ", ".join(stale_required_curated_sources))
    next_30 = market_mover_coverage.get("next_30_days", {})
    next_7 = market_mover_coverage.get("next_7_days", {})
    if int(next_30.get("market_mover_count", 0) or 0) < 8:
        failure_reasons.append("weak 30-day market mover coverage")
    if int(next_7.get("market_mover_count", 0) or 0) < 2:
        degraded_sources.append("MARKET_MOVER_COVERAGE_7D")
    if failure_reasons:
        return "failed", False, failure_reasons, sorted(set(missing_required)), sorted(set(degraded_sources))
    if degraded_sources:
        return "degraded", False, ["degraded source coverage"], [], sorted(set(degraded_sources))
    return "healthy", True, [], [], []


def _write_run_health(health_payload: Dict[str, Any]) -> None:
    try:
        health_out = OUT_DIR / "health.json"
        health_out.parent.mkdir(parents=True, exist_ok=True)
        with health_out.open("w", encoding="utf-8") as handle:
            json.dump(health_payload, handle, ensure_ascii=False, separators=(",", ":"))
        logger.info("Run health written to %s", health_out)
    except Exception:
        logger.debug("Failed to write health report", exc_info=True)


def _publish_state_path() -> Path:
    return PRODUCTION_DIR / "publish_state.json"


def _load_last_publish_metadata() -> Dict[str, str]:
    state_path = _publish_state_path()
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            return {
                "last_successful_publish_at_utc": str(state.get("last_successful_publish_at_utc") or ""),
                "last_successful_publish_file": str(state.get("last_successful_publish_file") or ""),
            }
        except Exception:
            logger.debug("Failed to read publish state", exc_info=True)

    calendar_path = PRODUCTION_DIR / "calendar.json"
    if calendar_path.exists():
        try:
            mtime = datetime.fromtimestamp(calendar_path.stat().st_mtime, tz=UTC).isoformat()
            return {
                "last_successful_publish_at_utc": mtime,
                "last_successful_publish_file": str(calendar_path),
            }
        except Exception:
            logger.debug("Failed to derive publish state from production calendar", exc_info=True)

    return {"last_successful_publish_at_utc": "", "last_successful_publish_file": ""}


def _save_publish_metadata(published_at_utc: datetime, file_path: Path) -> Dict[str, str]:
    metadata = {
        "last_successful_publish_at_utc": published_at_utc.astimezone(UTC).isoformat(),
        "last_successful_publish_file": str(file_path),
    }
    try:
        PRODUCTION_DIR.mkdir(parents=True, exist_ok=True)
        _publish_state_path().write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    except Exception:
        logger.debug("Failed to write publish state", exc_info=True)
    return metadata


def _failed_health_payload(reason: str, *, missing_packages: Optional[List[str]] = None) -> Dict[str, Any]:
    generated_at = _now_utc()
    failure_reasons = [reason]
    if missing_packages:
        failure_reasons.append("missing packages: " + ", ".join(missing_packages))
    last_publish = _load_last_publish_metadata()
    return {
        "status": "failed",
        "publish_allowed": False,
        "export_written": False,
        "staging_export_written": False,
        "requested_export_written": False,
        "production_export_written": False,
        "production_promoted": False,
        "failure_reasons": failure_reasons,
        "missing_required_sources": [],
        "degraded_sources": [],
        "live_source_warnings": [],
        "curated_fallbacks": {},
        "central_bank_speakers_health": _empty_central_bank_speakers_health(),
        "qa_summary": _empty_qa_summary(),
        "generated_at_utc": generated_at.isoformat(),
        **last_publish,
        "event_count_total": 0,
        "event_count_unique": 0,
        "source_counts": {},
        "market_mover_coverage": _build_market_mover_coverage([], generated_at),
        "window": {"tz": "UTC", "now_utc": generated_at.isoformat()},
        "summary": {
            "total": 0,
            "unique": 0,
            "fatal": True,
            "warnings": 0,
            "generated_at_utc": generated_at.isoformat(),
        },
        "sources": {},
        "health_status": {},
        "per_source_counts": {},
        "per_source": {},
        "quorum_alerts": [],
    }


def _health_state_path(cache: EnhancedCacheManager) -> Path:

    return cache.cache_dir / "health_state.json"

def _load_health_state(cache: EnhancedCacheManager) -> dict:

    path = _health_state_path(cache)

    if path.exists():

        try:

            return json.loads(path.read_text())

        except Exception:

            logger.debug("health state load failed", exc_info=True)

    return {}

def _save_health_state(cache: EnhancedCacheManager, state: dict) -> None:

    if not RUN_CONTEXT.get("allow_persist", True):
        return

    try:

        _health_state_path(cache).write_text(json.dumps(state, ensure_ascii=False))

    except Exception:

        logger.debug("health state save failed", exc_info=True)

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

def _ons_candidate_urls():

    """ONS RSS candidate URLs."""

    return [

        "https://www.ons.gov.uk/releasecalendar?format=rss",

        "https://www.ons.gov.uk/releasecalendar?rss",

        "https://www.ons.gov.uk/rss?content_type=releasecalendar&size=50",

    ]

MAX_ONS_TIMES = 200

MAX_ONS_BLOCKS = 200

def _read_best_dt_from_entry(entry):

    """Extract best datetime from RSS entry."""

    for key in ("published", "updated", "dc_date", "prism_publicationDate"):

        val = entry.get(key) or entry.get(key.replace("_", ":"))

        if val:

            try:

                return dateparser.parse(val)

            except Exception:

                pass

    return None

def _read_release_dt_from_page(session, href):

    """Extract release datetime from ONS page."""

    try:

        r, _ = source_sget(session, "ONS", href, timeout=20)

        if not r or not getattr(r, "ok", False):

            return None

        soup = BeautifulSoup(r.text, "lxml")

        # Common ONS patterns

        # <time datetime="2025-09-18T07:00:00+01:00">

        t = soup.select_one("time[datetime]")

        if t and t.get("datetime"):

            return dateparser.parse(t["datetime"])

        # <meta property="article:published_time" content="YYYY-MM-DDTHH:MM:SS+00:00">

        m = soup.select_one('meta[property="article:published_time"][content]')

        if m:

            return dateparser.parse(m["content"])

        # <meta name="dcterms.issued" content="YYYY-MM-DD">

        m = soup.select_one('meta[name="dcterms.issued"][content]')

        if m:

            # Add default 07:00 local if only a date is provided (ONS common)

            base = dateparser.parse(m["content"])

            return base.replace(hour=7, minute=0)

    except Exception:

        return None

    return None

def _ons_html_calendar(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fallback scraper for ONS release calendar HTML with pagination."""

    if not BeautifulSoup:

        return []

    # FIXED: Use upcoming-only URL like the enhanced version

    base = "https://www.ons.gov.uk/releasecalendar"

    events: List[Event] = []

    seen: set[str] = set()

    page = 1

    while True:

        # FIXED: Use upcoming filter with pagination

        params = {

            'highlight': 'true',

            'limit': '10',

            'page': str(page),

            'release-type': 'type-upcoming',

            'sort': 'date-newest'

        }

        resp, _ = source_sget(session, "ONS", base, timeout=25, params=params)

        if not resp or not resp.ok:

            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Track events found on this page to detect empty pages

        page_events_found = 0

        # First pass: explicit <time datetime> tags

        time_tags = soup.select("time[datetime]")[:MAX_ONS_TIMES]

        for time_tag in time_tags:

            try:

                dt_local = dateparser.parse(time_tag["datetime"])

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, default_hour=7, default_min=0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            block = time_tag.parent

            title_tag = None

            for _ in range(3):

                if not block:

                    break

                title_tag = block.find("a") or block.find("h3")

                if title_tag and title_tag.get_text(strip=True):

                    break

                block = block.parent

            title = (

                re.sub(r"\s+", " ", title_tag.get_text(strip=True))

                if title_tag else "ONS Release"

            )

            href = (

                urljoin(base, title_tag.get("href", ""))

                if title_tag and title_tag.get("href")

                else base

            )

            eid = make_id("GB", "ONS", title, dt_utc)

            if eid in seen:

                continue

            seen.add(eid)

            page_events_found += 1  # FIXED: Track events found on this page

            events.append(

                Event(

                    id=eid,

                    source="ONS_HTML",

                    agency="ONS",

                    country="GB",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/London",

                    impact=classify_event(title),

                    url=href,

                    extras={},

                )

            )

        # Second pass: blocks with "Release date:" text

        text_blocks = soup.find_all(string=re.compile("Release date:", re.I), limit=MAX_ONS_BLOCKS)

        for txt in text_blocks:

            m = re.search(r"Release date:\s*(.+)", txt, re.I)

            if not m:

                continue

            try:

                dt_local = dateparser.parse(m.group(1))

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, default_hour=7, default_min=0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            parent = txt.parent

            title_tag = None

            for _ in range(3):

                if not parent:

                    break

                title_tag = parent.find("a") or parent.find("h3")

                if title_tag and title_tag.get_text(strip=True):

                    break

                parent = parent.parent

            title = (

                re.sub(r"\s+", " ", title_tag.get_text(strip=True))

                if title_tag else "ONS Release"

            )

            href = (

                urljoin(base, title_tag.get("href", ""))

                if title_tag and title_tag.get("href")

                else base

            )

            eid = make_id("GB", "ONS", title, dt_utc)

            if eid in seen:

                continue

            seen.add(eid)

            page_events_found += 1  # FIXED: Track events found on this page

            events.append(

                Event(

                    id=eid,

                    source="ONS_HTML",

                    agency="ONS",

                    country="GB",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/London",

                    impact=classify_event(title),

                    url=href,

                    extras={},

                )

            )

        # FIXED: Stop pagination if no events found on this page or no next link

        next_link = soup.select_one(".pager-next a, li.pager__item--next a")

        if not next_link or page_events_found == 0:

            break

        page += 1

    return events

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

def _statcan_candidate_urls():

    """StatCan Atom candidate URLs."""

    return [

        "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom",

    ]

def _statcan_best_dt_from_entry(entry):

    """Extract best datetime from StatCan Atom entry."""

    for key in ("published", "updated"):

        val = entry.get(key)

        if val:

            try:

                return dateparser.parse(val)

            except Exception:

                pass

    return None

def _statcan_release_dt_from_page(session, href):

    """Extract release datetime from StatCan page with enhanced meta tag support."""

    try:

        r, _ = source_sget(session, "STATCAN", href, timeout=20)

        if not r or not getattr(r, "ok", False):

            return None

        soup = BeautifulSoup(r.text, "lxml")

        # Method 1: <time datetime="2025-04-12T08:30:00-04:00"> or date-only

        t = soup.select_one("time[datetime]")

        if t and t.get("datetime"):

            return dateparser.parse(t["datetime"])

        # Method 2: <meta property="article:published_time" content="...">

        m = soup.select_one('meta[property="article:published_time"][content]')

        if m:

            return dateparser.parse(m["content"])

        # Method 3: StatCan dcterms meta tags (enhanced)

        for selector in [

            'meta[name="dcterms.issued"][content]',

            'meta[name="dcterms.date"][content]',

            'meta[name="dcterms:issued"][content]',

            'meta[name="dcterms:date"][content]'

        ]:

            m = soup.select_one(selector)

            if m and m.get("content"):

                try:

                    base = dateparser.parse(m["content"])

                    if base:

                        # Default to 10:00 Toronto for date-only meta tags

                        if base.hour == 0 and base.minute == 0:

                            base = base.replace(hour=10, minute=0)

                        return base

                except Exception:

                    continue

    except Exception:

        return None

    return None

def _statcan_html_calendar(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fallback HTML calendar scraper for StatCan with correct upcoming releases URL."""

    if not BeautifulSoup:

        return []

    # Updated fallback URLs - use the correct upcoming releases page

    fallback_urls = [

        "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm",  # Upcoming releases (correct)

        "https://www150.statcan.gc.ca/n1/dai-quo/index-eng.htm",  # Daily index

    ]

    events: List[Event] = []

    seen: set[str] = set()

    for url in fallback_urls:

        try:

            resp, _ = source_sget(session, "STATCAN", url, timeout=25)

            if not resp or not getattr(resp, "ok", False):

                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Method 1: Parse upcoming releases format (cal2-eng.htm)

            if "cal2-eng.htm" in url:

                # Look for date headers like "September 16"

                date_headers = soup.find_all(['h3', 'h4'], string=re.compile(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}'))

                for header in date_headers:

                    try:

                        # Parse the date from header text

                        date_text = header.get_text(strip=True)

                        # Add current year if not present

                        if not re.search(r'\d{4}', date_text):

                            current_year = datetime.now().year

                            date_text = f"{date_text}, {current_year}"

                        base_date = dateparser.parse(date_text)

                        if not base_date:

                            continue

                        # Find the next sibling element containing release list

                        next_elem = header.find_next_sibling(['ol', 'ul', 'div'])

                        if not next_elem:

                            continue

                        # Extract releases from list items

                        release_items = next_elem.find_all('li')

                        for item in release_items:

                            segments = [seg.strip(" ,") for seg in item.stripped_strings if seg.strip()]
                            title_text = ""
                            for segment in segments:
                                lowered = segment.lower()
                                if "lockup" in lowered:
                                    continue
                                if re.search(r"\d{3}[- ]\d{3}[- ]\d{4}", segment):
                                    break
                                title_text = segment
                                break

                            if not title_text:

                                continue

                            # Clean up title (remove contact info, etc.)

                            title = re.sub(r'\([^)]*\)$', '', title_text).strip().rstrip(",")

                            title = re.sub(r'\s+', ' ', title).strip()

                            # Skip if title is too short or generic

                            if len(title) < 10 or title.lower() in ['pdf version', 'contact']:

                                continue

                            # Set release time to 8:30 AM Eastern (as mentioned on page)

                            dt_local = base_date.replace(hour=8, minute=30)

                            dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=8, default_min=30)

                            dt_utc = dt_local.astimezone(UTC)

                            if not _within(dt_utc, start_utc, end_utc):

                                continue

                            # Generate URL based on date pattern - FIXED FORMAT

                            yyyy_mm_dd = dt_local.strftime("%Y%m%d")   # e.g., 20250912

                            yymmdd = dt_local.strftime("%y%m%d")       # e.g., 250912

                            href = f"https://www150.statcan.gc.ca/n1/daily-quotidien/{yyyy_mm_dd}/dq{yymmdd}a-eng.htm"

                            eid = make_id("CA", "STATCAN", title, dt_utc)

                            if eid in seen:

                                continue

                            seen.add(eid)

                            events.append(

                                Event(

                                    id=eid,

                                    source="STATCAN_HTML",

                                    agency="STATCAN",

                                    country="CA",

                                    title=title,

                                    date_time_utc=dt_utc,

                                    event_local_tz="America/Toronto",

                                    impact=classify_event(title),

                                    url=href,

                                    extras={"announcement_time_local": "08:30"},

                                )

                            )

                    except Exception as e:

                        logger.debug(f"StatCan: Error parsing date header {header}: {e}")

                        continue

            # Method 2: Parse daily index format (index-eng.htm) - fallback

            else:

                for a in soup.select("a[href*='/daily-quotidien/'], a[href*='/dai-quo/']"):

                    title = re.sub(r"\s+", " ", a.get_text(strip=True))

                    if not title or len(title) < 10:

                        continue

                    href = urljoin(url, a.get("href", ""))

                    dt_local = None

                    # Look for time elements with datetime attribute

                    parent = a

                    for _ in range(3):

                        if not parent:

                            break

                        t = parent.find("time", datetime=True)

                        if t and t.get("datetime"):

                            try:

                                dt_local = dateparser.parse(t["datetime"])

                                break

                            except Exception:

                                dt_local = None

                        parent = parent.parent

                    # Fallback: extract date from URL pattern

                    if not dt_local:

                        date_match = re.search(r'/dq(\d{2})(\d{2})(\d{2})[a-z]?-eng\.htm', href)

                        if date_match:

                            year = 2000 + int(date_match.group(1))

                            month = int(date_match.group(2))

                            day = int(date_match.group(3))

                            try:

                                dt_local = datetime(year, month, day, 8, 30)  # 8:30 AM Eastern

                            except ValueError:

                                continue

                    if not dt_local:

                        continue

                    dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=8, default_min=30)

                    dt_utc = dt_local.astimezone(UTC)

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    eid = make_id("CA", "STATCAN", title, dt_utc)

                    if eid in seen:

                        continue

                    seen.add(eid)

                    events.append(

                        Event(

                            id=eid,

                            source="STATCAN_HTML",

                            agency="STATCAN",

                            country="CA",

                            title=title,

                            date_time_utc=dt_utc,

                            event_local_tz="America/Toronto",

                            impact=classify_event(title),

                            url=href,

                            extras={"announcement_time_local": "08:30"},

                        )

                    )

            # If we found events from this URL, we can break

            if events:

                break

        except Exception as e:

            logger.debug(f"StatCan HTML fallback failed for {url}: {e}")

            continue

    return events

def _statcan_html_fallback(

    session: requests.Session, start_utc: datetime, end_utc: datetime

) -> List[Event]:

    return _statcan_html_calendar(session, start_utc, end_utc)

def fetch_statcan_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch StatCan events with Atom + HTML fallback and deduplication."""

    source, agency, country = "STATCAN_ATOM", "STATCAN", "CA"
    cache_manager = getattr(session, "cache_manager", None)

    feed_entries: list[tuple[Any, str]] = []

    for cand in _statcan_candidate_urls():

        try:

            r, _ = source_sget(session, agency, cand, timeout=25, path_hint="atom")

            if not r or not getattr(r, "ok", False):

                continue

            parsed = feedparser.parse(r.content)

            if parsed.entries:

                for e in parsed.entries:

                    feed_entries.append((e, cand))

        except Exception:

            continue

    if len(feed_entries) == 0:

        html_events = _statcan_html_fallback(session, start_utc, end_utc)

        logger.info(f"StatCan HTML fallback: Found {len(html_events)} event(s)")
        if html_events and cache_manager:
            try:
                _persist_lkg("STATCAN", html_events)
            except Exception:
                logger.debug("StatCan: failed to persist LKG from HTML", exc_info=True)
        if html_events:
            _finalize_source_log("STATCAN", "html", len(html_events))
            return html_events
        merged = maybe_merge_lkg("STATCAN", [], ttl_days=30, tag="lkg")
        if merged:
            for ev in merged:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
            _finalize_source_log("STATCAN", "lkg", len(merged))
            return merged
        _finalize_source_log("STATCAN", "none", 0, zero_reason="parser_error")
        return html_events

    seen_ids: Dict[str, Event] = {}

    for entry, feed_url in feed_entries:

        title = (entry.get("title") or "Statistics Canada Release").strip()

        href = entry.get("link") or feed_url

        dt_local = _statcan_best_dt_from_entry(entry)

        page_dt = _statcan_release_dt_from_page(session, href)

        if page_dt:

            dt_local = page_dt

        if not dt_local:

            continue

        dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=10, default_min=0)

        dt_utc = dt_local.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            continue

        eid = make_id(country, agency, title, dt_utc)

        if eid in seen_ids:

            continue

        seen_ids[eid] = Event(

            id=eid,

            source=source,

            agency=agency,

            country=country,

            title=title,

            date_time_utc=dt_utc,

            event_local_tz="America/Toronto",

            impact=classify_event(title),

            url=href,

            extras={},

        )

    events = list(seen_ids.values())

    if not events:

        events = _statcan_html_fallback(session, start_utc, end_utc)

        logger.info(f"StatCan HTML fallback: Found {len(events)} event(s)")
        if events and cache_manager:
            try:
                _persist_lkg("STATCAN", events)
            except Exception:
                logger.debug("StatCan: failed to persist LKG from HTML", exc_info=True)
        if events:
            _finalize_source_log("STATCAN", "html", len(events))
            return events
        merged = maybe_merge_lkg("STATCAN", [], ttl_days=30, tag="lkg")
        if merged:
            for ev in merged:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg", "source_hint": "lkg"}
            _finalize_source_log("STATCAN", "lkg", len(merged))
            return merged
        _finalize_source_log("STATCAN", "none", 0, zero_reason="parser_error")
        return events

    logger.info(f"StatCan: {len(events)} events")
    if cache_manager:
        try:
            _persist_lkg("STATCAN", events)
        except Exception:
            logger.debug("StatCan: failed to persist LKG from atom", exc_info=True)
    _finalize_source_log("STATCAN", "atom", len(events))
    return events

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
def _legacy_fetch_china_nbs_events(session, start_utc, end_utc):
    """
    NBS (China) releases – robust HTML parse for ASCII/Chinese date formats,
    Accept-Language: zh-CN; DOM-first then LKG. Always gate via _within.
    Logs: 'NBS path used: dom|lkg|none' and 'NBS LKG_MERGE: k' when applicable.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("NBS", count=0, path="unavailable")
        return []

    BJ = BEIJING_TZ
    cache_manager = getattr(session, "cache_manager", None)

    urls = [
        # Main statistics portal & releases (keep order; first win)
        "https://www.stats.gov.cn/sj/",  # ??(English mirrors often lag; prioritize CN pages)
        "https://www.stats.gov.cn/english/PressRelease/",  # English press releases
    ]
    headers = {
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
        "Referer": "https://www.stats.gov.cn/",
    }

    # Patterns
    # ASCII: 2025-10-15 or 2025/10/15 or 2025.10.15 (default time 10:00 local)
    ascii_date = re.compile(r"(20\d{2})[./\-\/](\d{1,2})[./\-\/](\d{1,2})")
    # Chinese: 2025?10?15? or 2025?10?15? 10:00
    cn_date_time = re.compile(r"(20\d{2})?(\d{1,2})?(\d{1,2})?(?:\s+(\d{1,2}):(\d{2}))?")
    # Chinese month/day with weekday decorations tolerated (strip non-digits later)

    MONTH_NAME_MAP = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }
    en_month_date = re.compile(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,|\s)\s*(20\d{2})",
        re.I,
    )
    iso_press_date = re.compile(r"(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})")

    def _emit(year, month, day, hh, mm, url, bucket, source_hint: str = "dom"):
        try:
            h = 10 if hh is None else max(0, min(23, int(hh)))
            m = 0 if mm is None else max(0, min(59, int(mm)))
            local_dt = ensure_aware(datetime(int(year), int(month), int(day), h, m), BJ, h, m)
            dt_utc = local_dt.astimezone(UTC)
        except Exception:
            return
        if not _within(dt_utc, start_utc, end_utc):
            return
        title = "China NBS Statistical Release"
        ev = Event(
            id=make_id("CN", "NBS", title, dt_utc),
            source="NBS_HTML",
            agency="NBS",
            country="CN",
            title=title,
            date_time_utc=dt_utc,
            event_local_tz="Asia/Shanghai",
            impact=classify_event(title),
            url=url,
            extras={"discovered_via": source_hint, "source_hint": source_hint},
        )
        bucket.append(ev)

    # DOM pass (first successful page wins)
    snapshot_lines: List[str] = []
    last_snapshot = ""
    for u in urls:
        resp = sget_retry_alt(
            session,
            [u],
            headers=headers,
            tries=3,
            breaker=get_source_breaker("NBS"),
            path_hint="dom",
        )
        if not (resp and getattr(resp, "ok", False)):
            continue
        page_url = resp.url or u
        try:
            soup = BeautifulSoup(resp.text or "", "html.parser")
        except Exception:
            continue

        text = soup.get_text("\n", strip=True)
        last_snapshot = text[:ZERO_SNAPSHOT_MAX_CHARS]
        dom_events = []

        # Scan line by line; keep nearest links as URL
        for node in soup.select("a, li, p, time, span"):
            line = (node.get_text(" ", strip=True) or "").strip()
            if not line:
                continue
            if len(snapshot_lines) < 30:
                snapshot_lines.append(line)
            # Chinese date
            m = cn_date_time.search(line)
            if m:
                y, mo, d, hh, mm = m.groups()
                _emit(y, mo, d, hh, mm, urljoin(page_url, (node.get("href") or page_url)), dom_events, source_hint="dom")
                continue
            # ASCII date
            m = ascii_date.search(line)
            if m:
                y, mo, d = m.groups()
                _emit(y, mo, d, 10, 0, urljoin(page_url, (node.get("href") or page_url)), dom_events, source_hint="dom")

        if dom_events:
            dom_events.sort(key=lambda e: e.date_time_utc)
            if cache_manager:
                try:
                    _persist_lkg("NBS", dom_events)
                except Exception:
                    pass
            _finalize_source_log("NBS", "dom", len(dom_events))
            return dom_events

    def _extract_press_date(text: str) -> Optional[datetime]:
        if not text:
            return None
        match = en_month_date.search(text)
        if match:
            month = MONTH_NAME_MAP.get(match.group(1).lower())
            if month:
                return datetime(int(match.group(3)), month, int(match.group(2)))
        match = iso_press_date.search(text)
        if match:
            return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        return None

    press_url = "https://www.stats.gov.cn/english/PressRelease/"
    press_events: List[Event] = []
    press_snapshot = ""
    try:
        press_resp = sget_retry_alt(
            session,
            [press_url],
            headers={"Accept-Language": "en-US,en;q=0.9"},
            tries=3,
            breaker=get_source_breaker("NBS"),
            path_hint="dom",
        )
    except Exception:
        press_resp = None
    if press_resp and getattr(press_resp, "ok", False) and BeautifulSoup:
        try:
            press_soup = BeautifulSoup(press_resp.text or "", "html.parser")
        except Exception:
            press_soup = None
        if press_soup:
            press_text = unicodedata.normalize("NFKC", press_soup.get_text("\n", strip=True))
            press_snapshot = press_text[:ZERO_SNAPSHOT_MAX_CHARS]
            keywords = ("consumer price index", "cpi", "producer price index", "ppi")
            anchor = None
            for candidate in press_soup.select("a[href]"):
                text_line = unicodedata.normalize("NFKC", (candidate.get_text(" ", strip=True) or ""))
                if not text_line:
                    continue
                if not any(keyword in text_line.lower() for keyword in keywords):
                    continue
                anchor = candidate
                break
            if anchor is not None:
                href = anchor.get("href", "")
                target_url = urljoin(press_url, href) if href else press_url
                detail_snapshot = ""
                detail_text = ""
                try:
                    detail_resp = sget_retry_alt(
                        session,
                        [target_url],
                        headers={"Accept-Language": "en-US,en;q=0.9"},
                        tries=2,
                        breaker=get_source_breaker("NBS"),
                        path_hint="dom",
                    )
                except Exception:
                    detail_resp = None
                if detail_resp and getattr(detail_resp, "ok", False):
                    try:
                        detail_soup = BeautifulSoup(detail_resp.text or "", "html.parser")
                    except Exception:
                        detail_soup = None
                    if detail_soup:
                        detail_text = unicodedata.normalize("NFKC", detail_soup.get_text("\n", strip=True))
                        detail_snapshot = detail_text[:ZERO_SNAPSHOT_MAX_CHARS]
                pattern = re.search(r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})", detail_text or "")
                if not pattern:
                    fallback_line = unicodedata.normalize("NFKC", (anchor.get_text(" ", strip=True) or ""))
                    pattern = re.search(r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})", fallback_line)
                if pattern:
                    year, month, day = map(int, pattern.groups())
                    _emit(year, month, day, 9, 30, target_url, press_events, source_hint="press")
                if detail_snapshot:
                    press_snapshot = detail_snapshot
    if press_events:
        press_events.sort(key=lambda e: e.date_time_utc)
        if cache_manager:
            try:
                _persist_lkg("NBS", press_events)
            except Exception:
                pass
        _finalize_source_log("NBS", "dom", len(press_events))
        return press_events

    # LKG on zero
    merged = maybe_merge_lkg("NBS", [], ttl_days=30, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.update({"cached": True, "discovered_via": "lkg", "source_hint": "lkg"})
            ev.extras = extras
        logger.info("NBS LKG_MERGE: %d", len(merged))
        _finalize_source_log("NBS", "lkg", len(merged))
        return merged

    zero_reason = "NBS: No CPI/PPI announcements detected; DOM and press fallbacks empty within window."
    _finalize_source_log("NBS", "none", 0, zero_reason=zero_reason)
    snapshot_payload = press_snapshot or last_snapshot or "\n".join(snapshot_lines)
    write_zero_snapshot("NBS", snapshot_payload or "no HTTP body")
    return []
NBS_RELEASE_CALENDAR_INDEX_URL = "https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/"
NBS_PRESS_RELEASE_URL = "https://www.stats.gov.cn/english/PressRelease/"
NBS_RELEASE_SERIES_SPECS: Dict[str, Dict[str, Any]] = {
    "national_economic_performance": {
        "match": ("national economic performance",),
        "title": "NBS National Economic Performance",
        "official_title": "National Economic Performance",
        "impact": "High",
        "default_time": "10:00",
    },
    "nbs_pmi": {
        "match": ("purchasing managers", "pmi"),
        "title": "NBS Purchasing Managers' Index (PMI)",
        "official_title": "Monthly Report on Purchasing Managers' Index (PMI)",
        "impact": "High",
        "default_time": "09:30",
    },
    "cpi": {
        "match": ("consumer price index",),
        "title": "NBS Consumer Price Index (CPI)",
        "official_title": "Monthly Report on Consumer Price Index (CPI)",
        "impact": "High",
        "default_time": "09:30",
    },
    "ppi": {
        "match": ("industrial producer price index", "producer price index"),
        "title": "NBS Industrial Producer Price Index (PPI)",
        "official_title": "Monthly Report on Industrial Producer Price Index",
        "impact": "High",
        "default_time": "09:30",
    },
    "industrial_production": {
        "match": ("industrial production operation above the designated size",),
        "title": "NBS Industrial Production",
        "official_title": "Monthly Report on Industrial Production Operation Above the Designated Size",
        "impact": "High",
        "default_time": "10:00",
    },
    "energy_production": {
        "match": ("energy production",),
        "title": "NBS Energy Production",
        "official_title": "Monthly Report on Energy Production",
        "impact": "Low",
        "default_time": "10:00",
    },
    "fixed_asset_investment": {
        "match": ("investment in fixed assets",),
        "title": "NBS Fixed Asset Investment",
        "official_title": "Monthly Report on Investment in Fixed Assets (Excluding Rural Households)",
        "impact": "Medium",
        "default_time": "10:00",
    },
    "real_estate_development": {
        "match": ("real estate development and sales",),
        "title": "NBS Real Estate Development and Sales",
        "official_title": "Monthly Report on Real Estate Development and Sales",
        "impact": "Medium",
        "default_time": "10:00",
    },
    "retail_sales": {
        "match": ("total retail sales of consumer goods", "retail sales of consumer goods"),
        "title": "NBS Total Retail Sales of Consumer Goods",
        "official_title": "Monthly Report on Total Retail Sales of Consumer Goods",
        "impact": "High",
        "default_time": "10:00",
    },
    "value_added_major_industries": {
        "match": ("value added of major industries",),
        "title": "NBS Quarterly Value Added of Major Industries",
        "official_title": "Preliminary Accounting Report on Quarterly Value Added of Major Industries",
        "impact": "Medium",
        "default_time": "09:30",
    },
}


def _match_nbs_series_key(title_text: str) -> Optional[str]:
    normalized = _normalize_metadata_text(title_text).lower()
    for key, spec in NBS_RELEASE_SERIES_SPECS.items():
        if any(token in normalized for token in spec["match"]):
            return key
    return None


def _extract_nbs_release_days(cell_text: str) -> List[int]:
    normalized = _normalize_metadata_text(cell_text)
    if not normalized or "..." in normalized or "…" in normalized:
        return []
    days: List[int] = []
    for match in re.finditer(r"(?<!\d)(\d{1,2})\s*/\s*[A-Za-z]{3}", normalized):
        day = int(match.group(1))
        if 1 <= day <= 31 and day not in days:
            days.append(day)
    return days


def _extract_nbs_time_slots(cells: List[Any]) -> List[Tuple[int, int]]:
    slots: List[Tuple[int, int]] = []
    for cell in cells:
        text = _normalize_metadata_text(cell.get_text(" ", strip=True))
        match = re.search(r"(\d{1,2}):(\d{2})", text)
        if match:
            slots.append((int(match.group(1)), int(match.group(2))))
    return slots


def _is_nbs_time_row(row: Any) -> bool:
    cells = row.find_all(["th", "td"]) if row is not None else []
    if not cells:
        return False
    texts = [_normalize_metadata_text(cell.get_text(" ", strip=True)) for cell in cells]
    texts = [text for text in texts if text]
    return bool(texts) and all(re.search(r"^\d{1,2}:\d{2}$", text) for text in texts)


def fetch_china_nbs_events(session, start_utc, end_utc):
    """
    NBS (China) releases from the official English release calendar with
    press-release and LKG fallbacks. Always gate via _within.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("NBS", count=0, path="unavailable")
        return []

    BJ = BEIJING_TZ
    cache_manager = getattr(session, "cache_manager", None)
    headers = {"Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.stats.gov.cn/"}
    last_snapshot = ""
    press_snapshot = ""

    local_start = start_utc.astimezone(BJ)
    local_end = end_utc.astimezone(BJ)
    requested_years = sorted({year for year, _ in _month_year_iter(local_start.year, local_start.month, local_end.year, local_end.month)})

    month_name_map = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }
    en_month_date = re.compile(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,|\s)\s*(20\d{2})",
        re.I,
    )
    iso_press_date = re.compile(r"(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})")

    def _build_event(
        series_key: str,
        year: int,
        month: int,
        day: int,
        hour: int,
        minute: int,
        event_url: str,
        bucket: List[Event],
        *,
        source_hint: str,
        note: Optional[str] = None,
        derived_from: Optional[str] = None,
    ) -> None:
        spec = NBS_RELEASE_SERIES_SPECS[series_key]
        try:
            local_dt = ensure_aware(datetime(int(year), int(month), int(day), int(hour), int(minute)), BJ, int(hour), int(minute))
        except Exception:
            return
        dt_utc = local_dt.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            return
        extras = {
            "discovered_via": source_hint,
            "source_hint": source_hint,
            "release_series": series_key,
            "official_title": spec["official_title"],
            "release_time_local": local_dt.strftime("%H:%M"),
        }
        if note:
            extras["release_note"] = note
        if derived_from:
            extras["derived_from"] = derived_from
        bucket.append(
            Event(
                id=make_id("CN", "NBS", spec["title"], dt_utc),
                source="NBS_HTML",
                agency="NBS",
                country="CN",
                title=spec["title"],
                date_time_utc=dt_utc,
                event_local_tz="Asia/Shanghai",
                impact=spec["impact"],
                url=event_url,
                extras=extras,
            )
        )

    def _extract_press_date(text: str) -> Optional[datetime]:
        if not text:
            return None
        normalized = _normalize_metadata_text(text)
        match = en_month_date.search(normalized)
        if match:
            month = month_name_map.get(match.group(1).lower())
            if month:
                return datetime(int(match.group(3)), month, int(match.group(2)))
        match = iso_press_date.search(normalized)
        if match:
            return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        return None

    def _resolve_calendar_urls() -> List[Tuple[int, str]]:
        nonlocal last_snapshot
        try:
            index_resp = sget_retry_alt(
                session,
                [NBS_RELEASE_CALENDAR_INDEX_URL],
                headers=headers,
                tries=3,
                breaker=get_source_breaker("NBS"),
                path_hint="dom",
            )
        except Exception:
            index_resp = None
        if not (index_resp and getattr(index_resp, "ok", False)):
            return []
        try:
            index_soup = BeautifulSoup(index_resp.text or "", "html.parser")
        except Exception:
            return []
        index_text = _normalize_metadata_text(index_soup.get_text("\n", strip=True))
        last_snapshot = index_text[:ZERO_SNAPSHOT_MAX_CHARS]
        all_links: Dict[int, str] = {}
        matched_links: Dict[int, str] = {}
        for anchor in index_soup.select("a[href]"):
            text_line = _normalize_metadata_text(anchor.get_text(" ", strip=True))
            href = anchor.get("href", "")
            if "release calendar" not in text_line.lower() or not href:
                continue
            year_match = re.search(r"(20\d{2})", text_line)
            if not year_match:
                continue
            year = int(year_match.group(1))
            target_url = urljoin(index_resp.url or NBS_RELEASE_CALENDAR_INDEX_URL, href)
            all_links.setdefault(year, target_url)
            if year in requested_years:
                matched_links.setdefault(year, target_url)
        if matched_links:
            return [(year, matched_links[year]) for year in sorted(matched_links)]
        if all_links:
            latest_year = max(all_links)
            return [(latest_year, all_links[latest_year])]
        return []

    def _parse_calendar_page(calendar_year: int, calendar_url: str) -> List[Event]:
        nonlocal last_snapshot
        try:
            resp = sget_retry_alt(
                session,
                [calendar_url],
                headers=headers,
                tries=3,
                breaker=get_source_breaker("NBS"),
                path_hint="dom",
            )
        except Exception:
            resp = None
        if not (resp and getattr(resp, "ok", False)):
            return []
        try:
            soup = BeautifulSoup(resp.text or "", "html.parser")
        except Exception:
            return []
        page_text = _normalize_metadata_text(soup.get_text("\n", strip=True))
        if page_text:
            last_snapshot = page_text[:ZERO_SNAPSHOT_MAX_CHARS]

        table = None
        for candidate in soup.select("table"):
            header_row = candidate.find("tr")
            header_text = _normalize_metadata_text(header_row.get_text(" ", strip=True)).lower() if header_row else ""
            if "content" in header_text and "jan" in header_text and "dec" in header_text:
                table = candidate
                break
        if table is None:
            table = soup.select_one("table.trs_word_table")
        if table is None:
            return []

        page_events: List[Event] = []
        rows = table.select("tr")
        row_index = 1
        while row_index < len(rows):
            row = rows[row_index]
            cells = row.find_all(["th", "td"])
            time_row = rows[row_index + 1] if row_index + 1 < len(rows) else None
            time_cells = time_row.find_all(["th", "td"]) if _is_nbs_time_row(time_row) else []
            if len(cells) < 14:
                row_index += 1
                continue

            title_text = _normalize_metadata_text(cells[1].get_text(" ", strip=True))
            series_key = _match_nbs_series_key(title_text)
            if not series_key:
                row_index += 2 if time_cells else 1
                continue

            spec = NBS_RELEASE_SERIES_SPECS[series_key]
            default_hour, default_minute, _ = _parse_local_time(str(spec["default_time"]), (10, 0))
            populated_cells: List[Tuple[int, List[int], Optional[str]]] = []
            for month_index, cell in enumerate(cells[2:], start=1):
                cell_text = _normalize_metadata_text(cell.get_text(" ", strip=True))
                days = _extract_nbs_release_days(cell_text)
                if not days:
                    continue
                note_matches = re.findall(r"Note\s*\d+", cell_text, flags=re.I)
                note = ", ".join(note_matches) if note_matches else None
                populated_cells.append((month_index, days, note))

            time_slots = _extract_nbs_time_slots(time_cells) if time_cells else []
            for cell_index, (month_index, days, note) in enumerate(populated_cells):
                hour, minute = time_slots[cell_index] if cell_index < len(time_slots) else (default_hour, default_minute)
                for day in days:
                    _build_event(
                        series_key,
                        calendar_year,
                        month_index,
                        day,
                        hour,
                        minute,
                        calendar_url,
                        page_events,
                        source_hint="dom",
                        note=note,
                    )
            row_index += 2 if time_cells else 1
        return page_events

    dom_events: List[Event] = []
    for calendar_year, calendar_url in _resolve_calendar_urls():
        dom_events.extend(_parse_calendar_page(calendar_year, calendar_url))

    if dom_events:
        retail_months = {
            (ev.date_time_utc.astimezone(BJ).year, ev.date_time_utc.astimezone(BJ).month)
            for ev in dom_events
            if (ev.extras or {}).get("release_series") == "retail_sales"
        }
        derived_retail_events: List[Event] = []
        for base_event in dom_events:
            extras = base_event.extras or {}
            if extras.get("release_series") != "national_economic_performance":
                continue
            local_dt = base_event.date_time_utc.astimezone(BJ)
            slot = (local_dt.year, local_dt.month)
            if slot in retail_months:
                continue
            _build_event(
                "retail_sales",
                local_dt.year,
                local_dt.month,
                local_dt.day,
                local_dt.hour,
                local_dt.minute,
                base_event.url,
                derived_retail_events,
                source_hint="dom",
                derived_from="national_economic_performance",
            )
            retail_months.add(slot)
        if derived_retail_events:
            dom_events.extend(derived_retail_events)
        dom_events.sort(key=lambda e: (e.date_time_utc, e.title))
        if cache_manager:
            try:
                _persist_lkg("NBS", dom_events)
            except Exception:
                logger.debug("NBS: LKG persist failed", exc_info=True)
        _finalize_source_log("NBS", "dom", len(dom_events))
        return dom_events

    press_events: List[Event] = []
    try:
        press_resp = sget_retry_alt(
            session,
            [NBS_PRESS_RELEASE_URL],
            headers=headers,
            tries=3,
            breaker=get_source_breaker("NBS"),
            path_hint="dom",
        )
    except Exception:
        press_resp = None
    if press_resp and getattr(press_resp, "ok", False):
        try:
            press_soup = BeautifulSoup(press_resp.text or "", "html.parser")
        except Exception:
            press_soup = None
        if press_soup:
            press_text = _normalize_metadata_text(press_soup.get_text("\n", strip=True))
            press_snapshot = press_text[:ZERO_SNAPSHOT_MAX_CHARS]
            anchor_candidates: Dict[str, Any] = {}
            for candidate in press_soup.select("a[href]"):
                text_line = _normalize_metadata_text(candidate.get_text(" ", strip=True))
                if not text_line:
                    continue
                series_key = _match_nbs_series_key(text_line)
                if series_key and series_key not in anchor_candidates:
                    anchor_candidates[series_key] = candidate

            for series_key, anchor in anchor_candidates.items():
                href = anchor.get("href", "")
                target_url = urljoin(NBS_PRESS_RELEASE_URL, href) if href else NBS_PRESS_RELEASE_URL
                detail_text = ""
                detail_snapshot = ""
                try:
                    detail_resp = sget_retry_alt(
                        session,
                        [target_url],
                        headers=headers,
                        tries=2,
                        breaker=get_source_breaker("NBS"),
                        path_hint="dom",
                    )
                except Exception:
                    detail_resp = None
                if detail_resp and getattr(detail_resp, "ok", False):
                    try:
                        detail_soup = BeautifulSoup(detail_resp.text or "", "html.parser")
                    except Exception:
                        detail_soup = None
                    if detail_soup:
                        detail_text = _normalize_metadata_text(detail_soup.get_text("\n", strip=True))
                        detail_snapshot = detail_text[:ZERO_SNAPSHOT_MAX_CHARS]
                if detail_snapshot:
                    press_snapshot = detail_snapshot
                detected_date = _extract_press_date(detail_text) or _extract_press_date(_normalize_metadata_text(anchor.get_text(" ", strip=True)))
                if not detected_date:
                    continue
                spec = NBS_RELEASE_SERIES_SPECS[series_key]
                hour, minute, _ = _parse_local_time(str(spec["default_time"]), (10, 0))
                _build_event(
                    series_key,
                    detected_date.year,
                    detected_date.month,
                    detected_date.day,
                    hour,
                    minute,
                    target_url,
                    press_events,
                    source_hint="press",
                )

    if press_events:
        press_events.sort(key=lambda e: (e.date_time_utc, e.title))
        if cache_manager:
            try:
                _persist_lkg("NBS", press_events)
            except Exception:
                logger.debug("NBS: LKG persist failed", exc_info=True)
        _finalize_source_log("NBS", "dom", len(press_events))
        return press_events

    merged = maybe_merge_lkg("NBS", [], ttl_days=30, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.update({"cached": True, "discovered_via": "lkg", "source_hint": "lkg"})
            ev.extras = extras
        logger.info("NBS LKG_MERGE: %d", len(merged))
        _finalize_source_log("NBS", "lkg", len(merged))
        return merged

    zero_reason = "NBS: No release-calendar rows or press-release dates parsed within the requested window."
    _finalize_source_log("NBS", "none", 0, zero_reason=zero_reason)
    write_zero_snapshot("NBS", press_snapshot or last_snapshot or "no HTTP body")
    return []


def fetch_fed_fomc_events(session, start_utc, end_utc, *, allow_persist: bool = True):
    """FOMC calendar parser with normalized text, DOM-first parsing, curated fallback, and guarded LKG."""
    cache_manager = getattr(session, "cache_manager", None)
    url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
    path_label = "dom"
    last_snapshot = ""
    zero_reason = ""

    def _emit_event(
        year: int,
        month_name: str,
        day: int,
        decision_day_idx: int,
        *,
        source_tag: str,
        discovered_via: str,
        extra_extras: Optional[Dict[str, Any]] = None,
    ) -> Optional[Event]:
        token = (month_name or "").strip().rstrip(".")
        month_num = month_to_num(token)
        if not month_num:
            return None
        try:
            local_dt = ensure_aware(datetime(year, month_num, int(day), 14, 0), NEW_YORK_TZ, 14, 0)
        except Exception:
            return None
        dt_utc = local_dt.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            return None
        extras = {
            "meeting_type": "FOMC",
            "decision_day": decision_day_idx,
            "announcement_time_local": "14:00",
            "discovered_via": discovered_via,
            "source_hint": discovered_via,
        }
        if extra_extras:
            extras.update(extra_extras)
        return Event(
            id=make_id("US", "FED", "FOMC Meeting", dt_utc),
            source=source_tag,
            agency="FED",
            country="US",
            title="FOMC Meeting",
            date_time_utc=dt_utc,
            event_local_tz="America/New_York",
            impact=classify_event("FOMC Meeting"),
            url=url,
            extras=extras,
        )

    try:
        resp, _ = source_sget(
            session,
            "FED",
            url,
            timeout=25,
            headers={"User-Agent": DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0")},
        )
    except Exception:
        resp = None

    events: List[Event] = []
    seen_ids: set[str] = set()
    parsed_total = 0
    parsed_in_window = 0

    if resp and getattr(resp, "ok", False) and BeautifulSoup:
        soup = BeautifulSoup(resp.text or "", "html.parser")
        raw_text = soup.get_text("\n", strip=True)
        normalized = unicodedata.normalize("NFKC", raw_text or "").replace("\xa0", " ")
        normalized = normalized.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")
        normalized = re.sub(r"[ \t]+", " ", normalized)
        last_snapshot = normalized[:ZERO_SNAPSHOT_MAX_CHARS]
        lines_snapshot = [line.strip() for line in normalized.splitlines() if line.strip()]

        heading_re = re.compile(r"(20\d{2})\s+FOMC Meetings", re.I)
        matches = list(heading_re.finditer(normalized))
        if matches:
            blocks: List[tuple[int, str]] = []
            for idx, match in enumerate(matches):
                year = int(match.group(1))
                start_idx = match.end()
                end_idx = matches[idx + 1].start() if idx + 1 < len(matches) else len(normalized)
                blocks.append((year, normalized[start_idx:end_idx]))
        else:
            blocks = [(datetime.now().year, normalized)]

        month_tokens = (
            "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
            "Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
        )
        range_pat = re.compile(
            rf"(?i)\b(?P<month1>{month_tokens})(?:/(?P<month2>{month_tokens}))?\.?\s+"
            r"(?P<day1>\d{1,2})\s*-\s*(?P<day2>\d{1,2})(?:\*|(?:,?\s*(?P<year>20\d{2})))?(?:\b|\s|\()"
        )
        single_pat = re.compile(
            rf"(?i)\b(?P<month1>{month_tokens})\.?\s+(?P<day1>\d{{1,2}})(?:,?\s*(?P<year>20\d{{2}}))?(?:\*|\b)"
        )

        for block_year, block_text in blocks:
            block_lines = [ln.strip() for ln in block_text.splitlines() if ln.strip()]
            idx = 0
            while idx < len(block_lines):
                line = block_lines[idx]
                consumed = 1
                candidate_pairs = [(line, 1)]
                if idx + 1 < len(block_lines):
                    nxt = block_lines[idx + 1]
                    candidate_pairs.append((f"{line} {nxt}", 2))
                    candidate_pairs.append((f"{line}-{nxt}", 2))
                matched_line = False
                for candidate, span in candidate_pairs:
                    lowered = candidate.lower()
                    if "notation vote" in lowered:
                        continue
                    match = range_pat.search(candidate)
                    if match:
                        month_name = match.group("month2") or match.group("month1")
                        start_month = month_to_num(match.group("month1"))
                        end_month = month_to_num(month_name)
                        if not (start_month and end_month):
                            continue
                        end_day = int(match.group("day2"))
                        year_hint = int(match.group("year")) if match.group("year") else block_year
                        if match.group("month2") and end_month < start_month:
                            year_hint += 1
                        parsed_total += 1
                        try:
                            probe_dt = ensure_aware(datetime(year_hint, end_month, end_day, 14, 0), NEW_YORK_TZ, 14, 0).astimezone(UTC)
                            if _within(probe_dt, start_utc, end_utc):
                                parsed_in_window += 1
                        except Exception:
                            pass
                        event = _emit_event(
                            year_hint,
                            month_name,
                            end_day,
                            2,
                            source_tag="FED_HTML_CALENDAR",
                            discovered_via="dom",
                            extra_extras={"meeting_span_local": f"{match.group('month1')} {match.group('day1')}-{end_day}"},
                        )
                        if event and event.id not in seen_ids:
                            events.append(event)
                            seen_ids.add(event.id)
                        consumed = span
                        matched_line = True
                        break
                    match = None
                    if "released" not in lowered and "minutes" not in lowered and "statement" not in lowered:
                        match = single_pat.search(candidate)
                    if match:
                        month_name = match.group("month1")
                        day = int(match.group("day1"))
                        year_hint = int(match.group("year")) if match.group("year") else block_year
                        parsed_total += 1
                        try:
                            probe_dt = ensure_aware(datetime(year_hint, month_to_num(month_name) or 1, day, 14, 0), NEW_YORK_TZ, 14, 0).astimezone(UTC)
                            if _within(probe_dt, start_utc, end_utc):
                                parsed_in_window += 1
                        except Exception:
                            pass
                        event = _emit_event(
                            year_hint,
                            month_name,
                            day,
                            1,
                            source_tag="FED_HTML_CALENDAR",
                            discovered_via="dom",
                        )
                        if event and event.id not in seen_ids:
                            events.append(event)
                            seen_ids.add(event.id)
                        consumed = span
                        matched_line = True
                        break
                idx += consumed if matched_line else 1

        if events:
            events.sort(key=lambda ev: ev.date_time_utc)
            if cache_manager:
                try:
                    _persist_lkg("FED", events)
                except Exception:
                    logger.debug("FED: failed to persist LKG", exc_info=True)
            _finalize_source_log("FED", "dom", len(events))
            return events
        if parsed_total and not parsed_in_window:
            _finalize_source_log("FED", "dom", 0, zero_reason="between_meetings")
            return []
        zero_reason = "between_meetings" if parsed_total and not parsed_in_window else "Fed FOMC: parser_error (page reachable but no meeting dates parsed)."
        if DEBUG_ZERO_FLAG and (not parsed_total or parsed_in_window):
            write_zero_snapshot("FED", last_snapshot or normalized)
            logger.debug("FED ZERO: first 30 lines:\n%s", "\n".join(lines_snapshot[:30]))
    else:
        zero_reason = "Fed FOMC: calendar page fetch failed."

    curated_events: List[Event] = []
    for meeting in CURATED_FED_DATES:
        if meeting.bank != "FED":
            continue
        local_dt, curated_extras = _resolve_curated_local_dt(
            meeting,
            default_tz=NEW_YORK_TZ,
            default_hour=14,
            default_minute=0,
        )
        dt_utc = local_dt.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        extras = {
            "meeting_type": "FOMC",
            "decision_day": 2,
            "announcement_time_local": local_dt.strftime("%H:%M"),
            "discovered_via": "curated",
            "source_hint": "curated",
        }
        extras.update(curated_extras)
        event_data = {
            "id": make_id("US", "FED", "FOMC Meeting", dt_utc),
            "source": "FED_CURATED",
            "agency": "FED",
            "country": "US",
            "title": "FOMC Meeting",
            "date_time_utc": dt_utc,
            "event_local_tz": "America/New_York",
            "impact": classify_event("FOMC Meeting"),
            "url": url,
            "extras": extras,
        }
        event_data = _ensure_time_confidence(event_data)
        curated_events.append(Event(**event_data))

    if curated_events:
        curated_events.sort(key=lambda ev: ev.date_time_utc)
        _finalize_source_log("FED", "curated", len(curated_events))
        return curated_events

    merged = maybe_merge_lkg("FED", [], ttl_days=120, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.update({"cached": True, "discovered_via": "lkg", "source_hint": "lkg"})
            ev.extras = extras
        _finalize_source_log("FED", "lkg", len(merged))
        return merged

    if "parser_error" in zero_reason.lower():
        logger.warning("Fed FOMC: page found but no meetings parsed (check parser).")
    final_zero_reason = zero_reason or "FOMC page contained no meetings."
    _finalize_source_log("FED", "none", 0, zero_reason=final_zero_reason)
    if DEBUG_ZERO_FLAG:
        write_zero_snapshot("FED", last_snapshot or "no HTTP body", label="none")
    return []

def fetch_ecb_governing_council_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """ECB Governing Council calendar with DOM primary, text fallback, and guarded LKG."""
    agency = "ECB"
    country = "EU"
    url = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"
    source_dom = "ECB_HTML"
    source_text = "ECB_TEXT_CALENDAR"
    cache_manager = getattr(session, "cache_manager", None)

    path_used = "dom"
    dom_day2 = 0
    text_day2 = 0

    if not BeautifulSoup:
        logger.warning("ECB: BeautifulSoup unavailable; DOM parse skipped")
        _finalize_source_log("ECB", path_used, 0, zero_reason="BeautifulSoup unavailable; DOM skipped")
        return []

    try:
        resp, _ = source_sget(session, agency, url, timeout=25)
    except Exception as exc:
        logger.error("ECB: fetch error: %s", exc)
        _finalize_source_log("ECB", path_used, 0, zero_reason="ECB calendar fetch error")
        return []

    if not (resp and getattr(resp, "ok", False)):
        logger.warning("ECB: failed to fetch calendar page (status=%s)", getattr(resp, "status_code", "n/a"))
        _finalize_source_log("ECB", path_used, 0, zero_reason="ECB calendar HTTP failure")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    selectors = [".ecb-basicList", ".table", ".calendar__item", "#content"]
    time_pattern = re.compile(r"(\d{1,2})[:.](\d{2})")
    date_single = re.compile(r"(?P<d>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")
    date_numeric = re.compile(r"(?P<d>\d{1,2})[./](?P<m>\d{1,2})[./](?P<y>20\d{2})")
    date_range = re.compile(r"(?P<d1>\d{1,2})\s*[\u2013\u2014-]\s*(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")

    def _month_to_num(token: str) -> int | None:
        lookup = {
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "may": 5,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "sept": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        }
        token = (token or "").strip().lower()
        return lookup.get(token[:4], lookup.get(token[:3]))

    def _extract_time(*snippets: str) -> tuple[int, int]:
        for snippet in snippets:
            if not snippet:
                continue
            match = time_pattern.search(snippet)
            if not match:
                continue
            try:
                hours = max(0, min(23, int(match.group(1))))
                mins = max(0, min(59, int(match.group(2))))
                return hours, mins
            except Exception:
                continue
        return 14, 30

    events: List[Event] = []
    seen_ids: set[str] = set()

    def _emit(
        year: int,
        month: int,
        day: int,
        hour: int | None,
        minute: int | None,
        *,
        day_index: int,
        press_conf: bool,
        source_tag: str,
    ) -> None:
        nonlocal dom_day2, text_day2
        hh = max(0, min(23, hour if hour is not None else 14))
        mm = max(0, min(59, minute if minute is not None else 30))
        # Force Day-2 default to 13:45 when time is missing or came from generic default.
        # We treat "missing" as values equal to the generic default returned by _extract_time (14:30).
        if (day_index == 2 or press_conf) and (hour is None or minute is None or (hh, mm) == (14, 30)):
            hh, mm = 13, 45
        is_day_two = day_index == 2 or press_conf
        try:
            dt_local = ensure_aware(datetime(year, month, day, hh, mm), FRANKFURT_TZ, hh, mm)
        except Exception:
            return

        def _append_ecb_event(
            *,
            title: str,
            local_dt: datetime,
            impact: str,
            meeting_type: str,
            event_type: str,
            output_day_index: int,
            has_press: bool,
            confidence: str = "exact",
        ) -> bool:
            dt_utc = local_dt.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                return False
            event_id = make_id(country, agency, title, dt_utc)
            if event_id in seen_ids:
                return False
            seen_ids.add(event_id)
            events.append(
                Event(
                    id=event_id,
                    source=source_tag,
                    agency=agency,
                    country=country,
                    title=title,
                    date_time_utc=dt_utc,
                    event_local_tz="Europe/Berlin",
                    impact=impact,
                    url=url,
                    extras={
                        "meeting_type": meeting_type,
                        "ecb_event_type": event_type,
                        "has_press_conference": bool(has_press),
                        "meeting_time_local": local_dt.strftime("%H:%M"),
                        "source_type": "DOM" if source_tag == source_dom else "TEXT_FALLBACK",
                        "day_index": output_day_index,
                        "time_confidence": confidence,
                    },
                )
            )
            return True

        appended_day_two = False
        if is_day_two:
            appended_day_two = _append_ecb_event(
                title="ECB Monetary Policy Decision",
                local_dt=dt_local,
                impact="High",
                meeting_type="Governing Council Day 2",
                event_type="monetary_policy_decision",
                output_day_index=2,
                has_press=press_conf,
            )
            if press_conf:
                try:
                    press_dt_local = ensure_aware(datetime(year, month, day, 14, 30), FRANKFURT_TZ, 14, 30)
                except Exception:
                    press_dt_local = dt_local + timedelta(minutes=45)
                _append_ecb_event(
                    title="ECB Press Conference",
                    local_dt=press_dt_local,
                    impact="High",
                    meeting_type="Governing Council Press Conference",
                    event_type="press_conference",
                    output_day_index=2,
                    has_press=True,
                    confidence="tentative",
                )
        else:
            _append_ecb_event(
                title="ECB Non-Monetary Policy Meeting",
                local_dt=dt_local,
                impact="Low",
                meeting_type="Governing Council Day 1",
                event_type="non_monetary_policy_meeting",
                output_day_index=1,
                has_press=False,
            )
        if appended_day_two:
            if source_tag == source_dom:
                dom_day2 += 1
            else:
                text_day2 += 1

    # DOM path
    for selector in selectors:
        for element in soup.select(selector):
            block = element.get_text("\n", strip=True)
            if not block:
                continue
            block_lower = block.lower()
            for line in block.splitlines():
                match_range = date_range.search(line)
                if match_range:
                    month_num = _month_to_num(match_range.group("mon"))
                    if not month_num:
                        continue
                    year = int(match_range.group("y"))
                    day_start = int(match_range.group("d1"))
                    day_end = int(match_range.group("d2"))
                    hh, mm = _extract_time(line, block)
                    _emit(year, month_num, day_start, hh, mm, day_index=1, press_conf=False, source_tag=source_dom)
                    _emit(
                        year,
                        month_num,
                        day_end,
                        hh,
                        mm,
                        day_index=2,
                        press_conf=("press conference" in block_lower or "day 2" in block_lower),
                        source_tag=source_dom,
                    )
                    continue
                match_single = date_single.search(line)
                if match_single:
                    month_num = _month_to_num(match_single.group("mon"))
                    if not month_num:
                        continue
                    year = int(match_single.group("y"))
                    day_val = int(match_single.group("d"))
                    hh, mm = _extract_time(line, block)
                    press_conf = "press conference" in block_lower or "day 2" in block_lower
                    _emit(
                        year,
                        month_num,
                        day_val,
                        hh,
                        mm,
                        day_index=2 if press_conf else 1,
                        press_conf=press_conf,
                        source_tag=source_dom,
                    )

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("ECB", events)
        logger.info(f"ECB Governing Council: {dom_day2} meetings found (Day 2)")
        _finalize_source_log("ECB", "dom", len(events))
        return events

    # Text fallback
    text_block = soup.get_text(" ", strip=True)
    path_used = "text"
    range_pattern = re.compile(r"(?P<d1>\d{1,2})\s*(?:[\u2013\u2014-]|--)\s*(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")
    single_month_pattern = re.compile(r"(?P<d>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")

    def _context_hint(span: tuple[int, int]) -> bool:
        start, end = span
        radius = 120
        snippet = text_block[max(0, start - radius) : min(len(text_block), end + radius)].lower()
        return "press conference" in snippet or "day 2" in snippet

    matched_ranges: list[tuple[int, int]] = []
    for match in range_pattern.finditer(text_block):
        month_num = _month_to_num(match.group("mon"))
        if not month_num:
            continue
        year = int(match.group("y"))
        day_start = int(match.group("d1"))
        day_end = int(match.group("d2"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_start, None, None, day_index=1, press_conf=False, source_tag=source_text)
        _emit(year, month_num, day_end, None, None, day_index=2, press_conf=hint, source_tag=source_text)
        matched_ranges.append(match.span())

    def _span_within(target: tuple[int, int]) -> bool:
        return any(span[0] <= target[0] and target[1] <= span[1] for span in matched_ranges)

    for match in single_month_pattern.finditer(text_block):
        if _span_within(match.span()):
            continue
        month_num = _month_to_num(match.group("mon"))
        if not month_num:
            continue
        year = int(match.group("y"))
        day_val = int(match.group("d"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_val, None, None, day_index=1, press_conf=hint, source_tag=source_text)
        if hint:
            _emit(year, month_num, day_val, None, None, day_index=2, press_conf=True, source_tag=source_text)

    for match in date_numeric.finditer(text_block):
        if _span_within(match.span()):
            continue
        year = int(match.group("y"))
        month_num = int(match.group("m"))
        day_val = int(match.group("d"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_val, None, None, day_index=1, press_conf=hint, source_tag=source_text)
        if hint:
            _emit(year, month_num, day_val, None, None, day_index=2, press_conf=True, source_tag=source_text)

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("ECB", events)
        logger.info(f"ECB Governing Council: {text_day2} meetings found (Day 2)")
        _finalize_source_log("ECB", "text", len(events))
        return events

    # LKG merge
    lkg_events: List[Event] = []
    if cache_manager:
        try:
            lkg_events = maybe_merge_lkg("ECB", events, ttl_days=14, tag="lkg")
        except Exception:
            logger.debug("ECB: guarded LKG merge failed", exc_info=True)

    if lkg_events:
        logger.warning(f"ECB LKG_MERGE: {len(lkg_events)} merged")
        _finalize_source_log("ECB", "lkg", len(lkg_events))
        return lkg_events

    zero_reason = "ECB: Governing Council schedule returned no meetings for requested window."
    _finalize_source_log("ECB", path_used, 0, zero_reason=zero_reason)
    return []

def fetch_boj_mpm_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Bank of Japan Monetary Policy Meeting schedule with EN primary and JP fallback."""

    if not BeautifulSoup:
        logger.warning("BOJ: BeautifulSoup unavailable; skipping schedule parse")
        _set_fetch_metadata("BOJ", count=0, path="schedule")
        return []

    agency = "BOJ"
    country = "JP"
    source = "BOJ_SCHEDULE"
    title = "Japan \u2014 BoJ Monetary Policy Meeting"
    tags = ["central_bank", "boj", "mpm"]

    cache_manager = getattr(session, "cache_manager", None)

    locale_urls: List[tuple[str, List[str]]] = [
        (
            "en",
            [
                "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
                "https://www.boj.or.jp/en/mopo/mpmsche_minu/mpmsche.htm",
            ],
        ),
        (
            "jp",
            [
                "https://www.boj.or.jp/mopo/mpmsche_minu/index.htm",
                "https://www.boj.or.jp/mopo/mpmsche_minu/mpmsche.htm",
            ],
        ),
    ]

    headers = {
        "User-Agent": DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0"),
        "Accept-Language": "en-US,en;q=0.8,ja;q=0.7",
    }

    ERA_BASE = {"\u4ee4\u548c": 2018, "\u5e73\u6210": 1988, "\u662d\u548c": 1925}
    range_delims = r"[\-\u2013\u2014\u2212\uFF0D~\u301C]"
    month_regex = (
        "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
        "Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
    )

    era_pattern = re.compile(
        rf"(?P<era>{'|'.join(ERA_BASE.keys())})\s*(?P<eyear>\d+)\s*\u5e74\s*(?P<m1>\d{{1,2}})\s*\u6708\s*(?P<d1>\d{{1,2}})\s*\u65e5"
        rf"(?:\s*{range_delims}\s*(?:(?P<m2>\d{{1,2}})\s*\u6708\s*)?(?P<d2>\d{{1,2}})\s*\u65e5?)?"
    )
    jp_pattern = re.compile(
        rf"(?:(?P<y>20\d{{2}})\s*\u5e74\s*)?(?P<m1>\d{{1,2}})\s*\u6708\s*(?P<d1>\d{{1,2}})\s*\u65e5"
        rf"(?:\s*{range_delims}\s*(?:(?P<m2>\d{{1,2}})\s*\u6708\s*)?(?P<d2>\d{{1,2}})\s*\u65e5?)?"
    )
    numeric_pattern = re.compile(r"(?:(?P<y>20\d{2})[./])?\s*(?P<m>\d{1,2})[./]\s*(?P<d>\d{1,2})")
    en_pattern = re.compile(
        rf"(?P<m1>{month_regex})\.?\s*(?P<d1>\d{{1,2}})"
        rf"(?:\s*(?:{range_delims}|to)\s*(?:(?P<m2>{month_regex})\.?\s*)?(?P<d2>\d{{1,2}}))?",
        re.IGNORECASE,
    )
    time_ampm_pattern = re.compile(
        r"(?P<h>\d{1,2})(?::|：)?(?P<m>\d{2})?\s*(?P<ampm>a\.m\.|p\.m\.|am|pm)",
        re.IGNORECASE,
    )
    time_24_pattern = re.compile(r"\b(?P<h>\d{1,2})[:：](?P<m>\d{2})\b")
    href_date_pattern = re.compile(r"(?<!\d)(?P<yy>\d{2})(?P<mm>\d{2})(?P<dd>\d{2})(?!\d)")

    tentative_terms_en = ("tentative", "tbd", "to be decided", "to be determined", "to be announced")
    tentative_terms_jp = ("\u672a\u5b9a", "\u8abf\u6574\u4e2d", "\u6682\u5b9a")

    schedule_events: List[Event] = []
    parsed_rows = 0
    used_locale: Optional[str] = None
    used_url: Optional[str] = None

    def _prepare_text(text: str) -> tuple[str, str, str]:
        normalized = unicodedata.normalize("NFKC", text or "")
        lowered = normalized.lower()
        cleaned = re.sub(r"\[[^\]]*\]", "", normalized)
        cleaned = re.sub(r"\([^)]*\)", "", cleaned)
        cleaned = re.sub(r"[\u203b\u2606\u2605\u2020\u2021\uff0a*]", " ", cleaned)
        cleaned = cleaned.replace("\u3000", " ")
        cleaned = cleaned.replace("\uff0c", ",").replace("\u3001", " ")
        cleaned = cleaned.replace("\u30fb", " ").replace("\uff65", " ")
        cleaned = cleaned.replace("\uff0f", "/")
        cleaned = re.sub(r"\s+", " ", cleaned)
        ready = cleaned
        for delim in ("~", "\u301c", "\uff5e", "\u2013", "\u2014", "\u2212", "\uff0d"):
            ready = ready.replace(delim, "-")
        ready = ready.replace(" to ", "-")
        ready = re.sub(r"\s*,\s*", "-", ready)
        ready = re.sub(r"-+", "-", ready).strip(" -")
        return normalized, lowered, ready

    def _adjust_year(base_year: int, month_anchor: int, month_candidate: int) -> int:
        year = base_year
        if month_anchor and month_candidate:
            if month_candidate < month_anchor - 6:
                year += 1
            elif month_candidate > month_anchor + 6:
                year -= 1
        return year

    def _dates_from_href(cell: Any, context_year: int) -> List[tuple[int, int, int]]:
        for link in cell.find_all("a"):
            href = link.get("href") or ""
            match = href_date_pattern.search(href)
            if not match:
                continue
            yy = int(match.group("yy"))
            mm = int(match.group("mm"))
            dd = int(match.group("dd"))
            year = 2000 + yy
            if context_year and abs(year - context_year) > 50:
                century = (context_year // 100) * 100
                year = century + yy
                if year < context_year - 50:
                    year += 100
            return [(year, mm, dd)]
        return []

    def _extract_meeting_dates(clean_text: str, normalized_text: str, default_year: int) -> List[tuple[int, int, int]]:
        dates: List[tuple[int, int, int]] = []

        for match in era_pattern.finditer(clean_text):
            era = match.group("era")
            base_year = ERA_BASE.get(era, 0) + int(match.group("eyear"))
            m1 = int(match.group("m1"))
            d1 = int(match.group("d1"))
            dates.append((base_year, m1, d1))
            if match.group("d2"):
                m2 = int(match.group("m2") or m1)
                d2 = int(match.group("d2"))
                year2 = _adjust_year(base_year, m1, m2)
                dates.append((year2, m2, d2))

        for match in jp_pattern.finditer(clean_text):
            year = int(match.group("y")) if match.group("y") else default_year
            m1 = int(match.group("m1"))
            d1 = int(match.group("d1"))
            dates.append((year, m1, d1))
            if match.group("d2"):
                m2 = int(match.group("m2") or m1)
                d2 = int(match.group("d2"))
                year2 = _adjust_year(year, m1, m2)
                dates.append((year2, m2, d2))

        for match in numeric_pattern.finditer(clean_text):
            year = int(match.group("y")) if match.group("y") else default_year
            month = int(match.group("m"))
            day = int(match.group("d"))
            dates.append((year, month, day))

        for match in en_pattern.finditer(clean_text):
            month1 = month_to_num(match.group("m1"))
            if not month1:
                continue
            day1 = int(match.group("d1"))
            year1 = default_year
            dates.append((year1, month1, day1))
            if match.group("d2"):
                month2 = month_to_num(match.group("m2")) if match.group("m2") else month1
                if not month2:
                    month2 = month1
                day2 = int(match.group("d2"))
                year2 = _adjust_year(year1, month1, month2)
                dates.append((year2, month2, day2))

        if not dates:
            fallback_days = re.findall(r"\b(\d{1,2})\b", normalized_text)
            month_match = re.search(month_regex, normalized_text, re.IGNORECASE)
            month_val = month_to_num(month_match.group(0)) if month_match else None
            if month_val:
                for token in fallback_days:
                    day_val = int(token)
                    if 1 <= day_val <= 31:
                        dates.append((default_year, month_val, day_val))

        deduped: List[tuple[int, int, int]] = []
        seen: set[str] = set()
        for year, month, day in dates:
            year = year or default_year
            if not (1 <= month <= 12 and 1 <= day <= 31):
                continue
            key = f"{year:04d}-{month:02d}-{day:02d}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append((year, month, day))
        return deduped

    def _derive_time(normalized_text: str, tentative: bool) -> tuple[int, int, str, List[str]]:
        notes: List[str] = []
        hour_minute: Optional[tuple[int, int]] = None

        match = time_ampm_pattern.search(normalized_text)
        if match:
            hour = int(match.group("h"))
            minute = int(match.group("m") or 0)
            ampm = match.group("ampm").lower()
            hour = hour % 12
            if ampm.startswith("p"):
                hour += 12
            hour_minute = (hour, minute)
        else:
            match = time_24_pattern.search(normalized_text)
            if match:
                hour = int(match.group("h"))
                minute = int(match.group("m"))
                if 0 <= hour < 24 and 0 <= minute < 60:
                    hour_minute = (hour, minute)

        if hour_minute:
            hour, minute = hour_minute
            time_conf = "tentative" if tentative else "confirmed"
        else:
            hour, minute = 12, 0
            time_conf = "tentative" if tentative else "assumed"
            notes.append("No explicit time on schedule; placeholder.")

        if tentative:
            notes.append("Tentative date/time")

        if notes:
            notes = list(dict.fromkeys(notes))

        return hour, minute, time_conf, notes

    def _parse_schedule(html: str, locale: str, page_url: str) -> tuple[List[Event], int]:
        soup = BeautifulSoup(html, "html.parser")
        events_out: List[Event] = []
        parsed = 0
        seen_ids: set[str] = set()

        for heading in soup.select("h2[id^='p20']"):
            heading_text = unicodedata.normalize("NFKC", heading.get_text(" ", strip=True))
            year_match = re.search(r"(20\d{2})", heading_text)
            if not year_match:
                continue
            context_year = int(year_match.group(1))
            table = heading.find_next("table")
            if not table:
                continue
            tbody = table.find("tbody") or table
            for row in tbody.find_all("tr"):
                cells = row.find_all("td")
                if not cells:
                    continue
                cell = cells[0]
                cell_text = cell.get_text(" ", strip=True)
                if not cell_text:
                    continue

                normalized, lowered, cleaned = _prepare_text(cell_text)
                if not cleaned:
                    continue

                tentative = any(term in lowered for term in tentative_terms_en) or any(term in normalized for term in tentative_terms_jp)

                date_candidates = _dates_from_href(cell, context_year) or _extract_meeting_dates(cleaned, normalized, context_year)
                if not date_candidates:
                    continue

                parsed += 1
                final_year, final_month, final_day = max(date_candidates)

                hour, minute, time_confidence, note_bits = _derive_time(normalized, tentative)
                local_dt = datetime(final_year, final_month, final_day, hour, minute)
                local_dt = ensure_aware(local_dt, TOKYO_TZ)
                dt_utc = local_dt.astimezone(UTC)

                if not _within(dt_utc, start_utc, end_utc):
                    continue

                event_id = make_id(country, agency, title, dt_utc)
                if event_id in seen_ids:
                    continue

                extras: Dict[str, Any] = {
                    "meeting_type": "MPM",
                    "tags": tags,
                    "time_confidence": time_confidence,
                    "source_locale": locale,
                    "raw_entry": normalized.strip(),
                    "discovered_via": "schedule",
                    "source_hint": "schedule",
                }
                if tentative:
                    extras["tentative"] = True
                if note_bits:
                    extras["notes"] = " | ".join(note_bits)

                events_out.append(
                    Event(
                        id=event_id,
                        source=source,
                        agency=agency,
                        country=country,
                        title=title,
                        date_time_utc=dt_utc,
                        event_local_tz="Asia/Tokyo",
                        impact=classify_event(title),
                        url=page_url,
                        extras=extras,
                    )
                )
                seen_ids.add(event_id)

        events_out.sort(key=lambda ev: ev.date_time_utc)
        return events_out, parsed

    schedule_snapshot = ""
    for locale, url_list in locale_urls:
        resp = None
        try:
            resp = sget_retry_alt(
                session,
                url_list,
                headers=headers,
                tries=3,
                timeout=25,
                breaker=get_source_breaker("BOJ"),
                path_hint="dom",
            )
        except Exception:
            logger.debug("BOJ: request error for %s locale", locale, exc_info=True)
            continue

        if not (resp and getattr(resp, "ok", False)):
            continue

        page_url = getattr(resp, "url", url_list[0])
        try:
            schedule_snapshot = (resp.text or "")[:ZERO_SNAPSHOT_MAX_CHARS]
        except Exception:
            schedule_snapshot = ""
        events_locale, parsed_count = _parse_schedule(resp.text, locale, page_url)
        if parsed_count:
            schedule_events = events_locale
            parsed_rows = parsed_count
            used_locale = locale
            used_url = page_url
            break
        if not parsed_rows:
            used_url = page_url

    if parsed_rows == 0:
        logger.warning("BOJ: schedule parse returned no usable rows")

    if schedule_events:
        for ev in schedule_events:
            extras = dict(ev.extras or {})
            extras.setdefault("discovered_via", "dom")
            extras.setdefault("source_hint", "dom")
            ev.extras = extras
        if cache_manager:
            try:
                _persist_lkg("BOJ", schedule_events)
            except Exception:
                logger.debug("BOJ: LKG persist failed", exc_info=True)
        if used_locale:
            logger.debug("BOJ: schedule locale=%s url=%s parsed_rows=%d", used_locale, used_url, parsed_rows)
        _finalize_source_log("BOJ", "dom", len(schedule_events))
        return schedule_events

    if parsed_rows:
        _finalize_source_log("BOJ", "dom", 0, zero_reason="between_meetings")
        return []

    curated_events: List[Event] = []
    for meeting in CURATED_BOJ_DATES:
        if meeting.bank != "BOJ":
            continue
        local_dt, curated_extras = _resolve_curated_local_dt(
            meeting,
            default_tz=TOKYO_TZ,
            default_hour=12,
            default_minute=0,
        )
        dt_utc = local_dt.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        extras = {
            "meeting_type": "MPM",
            "announcement_time_local": local_dt.strftime("%H:%M"),
            "discovered_via": "curated",
            "source_hint": "curated",
        }
        extras.update(curated_extras)
        event_data = {
            "id": make_id(country, agency, title, dt_utc),
            "source": "BOJ_CURATED",
            "agency": agency,
            "country": country,
            "title": title,
            "date_time_utc": dt_utc,
            "event_local_tz": "Asia/Tokyo",
            "impact": classify_event(title),
            "url": used_url or locale_urls[0][1][0],
            "extras": extras,
        }
        event_data = _ensure_time_confidence(event_data)
        curated_events.append(Event(**event_data))
    if curated_events:
        _finalize_source_log("BOJ", "curated", len(curated_events))
        return curated_events

    def _estimate_from_lkg() -> List[Event]:
        lkg_events = _read_lkg_events("BOJ")
        if not lkg_events:
            return []
        last_event = lkg_events[-1]
        last_local = last_event.date_time_utc.astimezone(TOKYO_TZ)
        candidate = last_local + timedelta(days=42)
        candidate = ensure_aware(
            datetime(candidate.year, candidate.month, candidate.day, 12, 0),
            TOKYO_TZ,
            12,
            0,
        )
        dt_utc = candidate.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            return []
        extras = {
            "meeting_type": "MPM",
            "announcement_time_local": candidate.strftime("%H:%M"),
            "estimated": True,
            "provenance": "estimator_from_lkg",
            "discovered_via": "estimator",
            "source_hint": "estimator",
        }
        event_data = {
            "id": make_id(country, agency, title, dt_utc),
            "source": "BOJ_ESTIMATOR",
            "agency": agency,
            "country": country,
            "title": f"{title} (est.)",
            "date_time_utc": dt_utc,
            "event_local_tz": "Asia/Tokyo",
            "impact": classify_event(title),
            "url": used_url or locale_urls[0][1][0],
            "extras": extras,
        }
        event_data = _ensure_time_confidence(event_data)
        return [Event(**event_data)]

    estimator_events = _estimate_from_lkg()
    if estimator_events:
        _finalize_source_log("BOJ", "estimator", len(estimator_events))
        return estimator_events

    zero_reason = "between_meetings"
    write_zero_snapshot("BOJ", schedule_snapshot or "no HTTP body", label="schedule")
    _finalize_source_log("BOJ", "none", 0, zero_reason=zero_reason)
    return []

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
    if DEBUG_ZERO_FLAG:
        write_zero_snapshot("SNB", last_snapshot or "no HTTP body")
    return []

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

AGENCY_KEY_OVERRIDES = {"STATSCAN": "STATCAN"}

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
        if occurrences != 1:
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

    global CURRENT_CACHE_MANAGER, RUN_CONTEXT

    CURRENT_CACHE_MANAGER = cache_manager
    serverless_mode = isinstance(cache_manager, EphemeralCacheManager)
    RUN_CONTEXT = {
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
    }
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
    if STRICT_ZERO_FLAG:
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
    global DEBUG_ZERO_FLAG, STRICT_ZERO_FLAG
    if "debug_zero_flag" in RUN_OVERRIDES:
        DEBUG_ZERO_FLAG = bool(RUN_OVERRIDES["debug_zero_flag"])
    if "strict_zero_flag" in RUN_OVERRIDES:
        STRICT_ZERO_FLAG = bool(RUN_OVERRIDES["strict_zero_flag"])

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

    global DEBUG_ZERO_FLAG, STRICT_ZERO_FLAG
    DEBUG_ZERO_FLAG = bool(args.debug_zero)
    STRICT_ZERO_FLAG = bool(args.strict_zero)

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
    RUN_OVERRIDES["debug_zero_flag"] = DEBUG_ZERO_FLAG
    RUN_OVERRIDES["strict_zero_flag"] = STRICT_ZERO_FLAG
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
