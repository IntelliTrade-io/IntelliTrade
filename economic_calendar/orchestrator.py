"""Fetcher orchestration: source keys, merge, fallbacks, health guard, grace
retries, threaded fetcher groups, and the gather_* entry points.

Moved verbatim from the monolith (plan 6.3).
"""

from __future__ import annotations

import inspect
import re
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Set

import requests

from economic_calendar.curated import (
    GRACE_WINDOW_SOURCES,
    GraceWindowConfig,
)
from economic_calendar.enrich import classify_event
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    AGENCY_KEY_OVERRIDES,
    BIG_FEEDER_THRESHOLDS,
    LKG_TTLS,
    FETCH_GROUP_MAX_WORKERS,
    SourceHealth,
    _finalize_source_log,
    _get_fetch_metadata,
    _persist_lkg,
    _reset_fetch_metadata,
    _set_fetch_metadata,
    _update_source_health_from_meta,
    maybe_merge_lkg,
)
from economic_calendar.http import EnhancedCacheManager, build_session, sget_with_retry, source_sget
from economic_calendar.runstate import RUN_CONTEXT, RUN_CONTEXT_LOCK
from economic_calendar.ics import parse_ics_bytes
from economic_calendar.pmi import NO_LKG_SOURCES, PROVIDER_SPGLOBAL_PMI
from economic_calendar.timeutils import EUROSTAT_TZ, UTC, WELLINGTON_TZ, ZURICH_TZ, _iso, _now_utc, _within, ensure_aware
from economic_calendar.sources.abs import fetch_abs_events
from economic_calendar.sources.bfs import fetch_bfs_events
from economic_calendar.sources.bls import (
    fetch_bls_events,
)
from economic_calendar.sources.boc import fetch_boc_events
from economic_calendar.sources.boe import fetch_boe_events
from economic_calendar.sources.boj import fetch_boj_mpm_events
from economic_calendar.sources.ecb import fetch_ecb_governing_council_events
from economic_calendar.sources.esri import fetch_japan_esri_events
from economic_calendar.sources.eurostat import _parse_eurostat_json_local_datetime, fetch_eurostat_events
from economic_calendar.sources.fomc import fetch_fed_fomc_events
from economic_calendar.sources.ism import fetch_ism_events
from economic_calendar.sources.nbs import fetch_china_nbs_events
from economic_calendar.sources.ons import fetch_ons_events_enhanced
from economic_calendar.sources.pmi_spglobal import fetch_pmi_spglobal_events
from economic_calendar.sources.rba import fetch_rba_events
from economic_calendar.sources.rbnz import fetch_rbnz_events
from economic_calendar.sources.seco import fetch_switzerland_seco_events
from economic_calendar.sources.snb import fetch_snb_events
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

logger = logging.getLogger("econ_calendar_complete")

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

