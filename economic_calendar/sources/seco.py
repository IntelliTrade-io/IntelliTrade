"""Switzerland SECO calendar fetcher — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime
from typing import List, Optional


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

from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    ZERO_SNAPSHOT_MAX_CHARS,
    _finalize_source_log,
    _persist_lkg,
    _schema_capture,
    _set_fetch_metadata,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.http import (
    get_source_breaker,
    sget_retry_alt,
)
from economic_calendar.timeutils import (
    UTC,
    ZURICH_TZ,
    _within,
    ensure_aware,
    month_to_num,
)

logger = logging.getLogger("econ_calendar_complete")

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

