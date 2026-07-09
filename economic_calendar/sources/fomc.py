"""US Federal Reserve FOMC calendar fetcher.

Moved verbatim from the monolith (plan 6.3). Shared-framework imports only;
behavior unchanged.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime
from typing import Any, Dict, List, Optional


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
    CURATED_FED_DATES,
    _ensure_time_confidence,
    _resolve_curated_local_dt,
)
from economic_calendar.enrich import classify_event
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    _finalize_source_log,
    _persist_lkg,
    ZERO_SNAPSHOT_MAX_CHARS,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.http import (
    DEFAULT_HEADERS,
    source_sget,
)
from economic_calendar.timeutils import (
    NEW_YORK_TZ,
    UTC,
    _within,
    ensure_aware,
    month_to_num,
)

logger = logging.getLogger("econ_calendar_complete")

FEATURE = _ec_runstate.FEATURE

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
        if _ec_runstate.DEBUG_ZERO_FLAG and (not parsed_total or parsed_in_window):
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
    if _ec_runstate.DEBUG_ZERO_FLAG:
        write_zero_snapshot("FED", last_snapshot or "no HTTP body", label="none")
    return []

