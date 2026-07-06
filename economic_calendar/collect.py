"""Collection pipeline: window resolution, run-context setup, speaker merge,
enrichment, health reporting, and the public run()/collect_events() API.

Moved verbatim from the monolith (plan 6.3).
"""

from __future__ import annotations

import hashlib
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set


from economic_calendar import runstate as _ec_runstate
from economic_calendar.curated import (
    STRICT_ZERO_SOURCES,
    _is_benign_zero_case,
)
from economic_calendar.enrich import _enrich_events_metadata
from economic_calendar.events import Event
from economic_calendar.health import (
    _build_health_status_payload,
    _load_health_state,
    _load_last_publish_metadata,
    _save_health_state,
    _snapshot_fetch_metadata,
    _build_compact_qa_summary,
    _build_curated_fallback_health,
    _build_market_mover_coverage,
    _canonical_health_key,
    _health_status_for_run,
    _update_source_health_from_meta,
    _write_run_health,
)
from economic_calendar.http import EnhancedCacheManager, EphemeralCacheManager, build_session
from economic_calendar.runstate import RUN_CONTEXT, RUN_OVERRIDES
from economic_calendar.speakers import _empty_central_bank_speakers_health, collect_central_bank_speaker_events
from economic_calendar.timeutils import _now_utc

logger = logging.getLogger("econ_calendar_complete")
from economic_calendar.orchestrator import (
    _apply_health_guard,
    gather_central_bank_events,
    gather_macro_events,
)

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

    _ec_runstate.CURRENT_CACHE_MANAGER = cache_manager
    serverless_mode = isinstance(cache_manager, EphemeralCacheManager)
    RUN_CONTEXT.clear()
    RUN_CONTEXT.update({
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
    })
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
    if _ec_runstate.STRICT_ZERO_FLAG:
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
    if "debug_zero_flag" in RUN_OVERRIDES:
        _ec_runstate.DEBUG_ZERO_FLAG = bool(RUN_OVERRIDES["debug_zero_flag"])
    if "strict_zero_flag" in RUN_OVERRIDES:
        _ec_runstate.STRICT_ZERO_FLAG = bool(RUN_OVERRIDES["strict_zero_flag"])

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


