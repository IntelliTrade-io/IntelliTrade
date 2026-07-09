"""Event classification and metadata enrichment.

Impact keywords, country/category inference, pair relevance, official-URL
standardization, descriptions, trader-relevance scoring, dashboard gating,
and the `_enrich_event_metadata` pipeline applied to every scraped event.
Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus, urlparse

from economic_calendar.bls_specs import BLS_CANONICAL_SPECS, _bls_canonical_key_from_text
from economic_calendar.curated import _curated_fallback_info
from economic_calendar.events import Event, _validate_event_schema
from economic_calendar.pmi import PROVIDER_SPGLOBAL_PMI
from economic_calendar.textutils import (
    _eventish_extras,
    _eventish_text_blob,
    _eventish_value,
    _normalize_metadata_text,
    _regex_has_any,
    _text_has_any,
)
from economic_calendar.timeutils import UTC

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

# China NBS release calendar; also the standardized URL for NBS events.
# (Owned by the NBS source module once that family is extracted.)
NBS_RELEASE_CALENDAR_INDEX_URL = "https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/"

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
