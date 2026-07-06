"""Central-bank speaker and public-event collection.

Scrapes official calendars/speech pages of the eight covered central banks,
extracts speaker appearances, scores them, and dedupes across sources.
Moved verbatim from the monolith (plan 6.3); only formatting normalized.
(`run_central_bank_speaker_debug_diagnostics` stays in the monolith — it is
CLI-debug glue writing under the script-anchored OUT_DIR.)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import requests

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from dateutil import parser as dateparser
except ImportError:
    dateparser = None

from economic_calendar.enrich import _impact_from_score, _url_is_official
from economic_calendar.events import Event, make_id
from economic_calendar.http import _apply_cache_response, _prepare_request
from economic_calendar.runstate import RUN_CONTEXT
from economic_calendar.textutils import _normalize_metadata_text
from economic_calendar.timeutils import MONTHS, UTC, _within

logger = logging.getLogger("econ_calendar_complete")

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
        tail = raw_text[match.end():].strip(" :-,–—")
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
            prefix = raw_text[: match.start()].rstrip(" :-,–—")
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
