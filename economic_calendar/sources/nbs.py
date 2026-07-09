"""China NBS calendar fetchers — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin


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

from economic_calendar.enrich import NBS_RELEASE_CALENDAR_INDEX_URL, classify_event
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    ZERO_SNAPSHOT_MAX_CHARS,
    _finalize_source_log,
    _persist_lkg,
    _set_fetch_metadata,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.http import (
    get_source_breaker,
    sget_retry_alt,
)
from economic_calendar.textutils import _normalize_metadata_text
from economic_calendar.timeutils import (
    BEIJING_TZ,
    UTC,
    _month_year_iter,
    _parse_local_time,
    _within,
    ensure_aware,
)

logger = logging.getLogger("econ_calendar_complete")

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


