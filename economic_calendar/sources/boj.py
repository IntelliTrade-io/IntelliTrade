"""Bank of Japan MPM calendar fetcher.

Moved verbatim from the monolith (plan 6.3). Shared-framework imports only;
behavior unchanged.
"""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from urllib.parse import urljoin
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple
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

try:
    from lxml import html as lxml_html
except ImportError:
    lxml_html = None

from economic_calendar import runstate as _ec_runstate
from economic_calendar.curated import (
    CURATED_BOE_DATES,
    CURATED_BOJ_DATES,
    CURATED_FED_DATES,
    CuratedMeeting,
    _ensure_time_confidence,
    _resolve_curated_local_dt,
)
from economic_calendar.enrich import classify_event
from economic_calendar.events import Event, _content_hash_bytes, _content_hash_text, make_id
from economic_calendar.health import (
    ENABLE_LKG,
    LKG_TTLS,
    _finalize_source_log,
    _persist_lkg,
    _read_lkg_events,
    _schema_capture,
    ZERO_SNAPSHOT_MAX_CHARS,
    _set_fetch_metadata,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.htmlparse import broad_li_filter, find_rows_by_header_keywords, rows_by_header_xpath
from economic_calendar.http import (
    DEFAULT_HEADERS,
    RetryBudget,
    get_source_breaker,
    sget_retry_alt,
    sget_with_retry,
    source_sget,
)
from economic_calendar.ics import parse_ics_bytes, parse_ics_datetime
from economic_calendar.runstate import RUN_CONTEXT
from economic_calendar.textutils import _normalize_metadata_text
from economic_calendar.timeutils import (
    BEIJING_TZ,
    BERLIN_TZ,
    BRUSSELS_TZ,
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
    _iso,
    _now_utc,
    _within,
    ensure_aware,
    month_to_num,
)

logger = logging.getLogger("econ_calendar_complete")

FEATURE = _ec_runstate.FEATURE

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

