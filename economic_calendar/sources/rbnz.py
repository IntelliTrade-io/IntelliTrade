"""Reserve Bank of New Zealand calendar fetcher.

Moved verbatim from the monolith (plan 6.3). Shared-framework imports only;
behavior unchanged.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime


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
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    _finalize_source_log,
    _persist_lkg,
    _set_fetch_metadata,
    maybe_merge_lkg,
)
from economic_calendar.http import (
    get_source_breaker,
    sget_retry_alt,
)
from economic_calendar.timeutils import (
    UTC,
    WELLINGTON_TZ,
    _within,
    ensure_aware,
)

logger = logging.getLogger("econ_calendar_complete")

FEATURE = _ec_runstate.FEATURE

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
