"""Event export writers: CSV/JSON/JSONL plus staging/production artifact sets.

Moved verbatim from the monolith (plan 6.3).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
import importlib.util
import json
import logging
import random
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

import requests

from economic_calendar import health as _ec_health
from economic_calendar import paths as _ec_paths
from economic_calendar import runstate as _ec_runstate
from economic_calendar.curated import (
    GRACE_WINDOW_SOURCES,
    GraceWindowConfig,
    STRICT_ZERO_SOURCES,
    WARN_REQUIRED_SOURCES,
    WARN_REQUIRED_ZERO_ALLOW,
    _is_benign_zero_case,
    _is_benign_zero_reason,
)
from economic_calendar.enrich import _enrich_event_metadata, _enrich_events_metadata
from economic_calendar.events import Event, _event_to_dict, make_id
from economic_calendar.health import (
    AGENCY_KEY_OVERRIDES,
    BIG_FEEDER_THRESHOLDS,
    ENABLE_LKG,
    FETCH_GROUP_MAX_WORKERS,
    SourceHealth,
    _build_health_status_payload,
    _failed_health_payload,
    _finalize_source_log,
    _get_fetch_metadata,
    _health_state_path,
    _load_health_state,
    _load_last_publish_metadata,
    _persist_lkg,
    _read_lkg_events,
    _reset_fetch_metadata,
    _save_health_state,
    _save_publish_metadata,
    _set_fetch_metadata,
    _snapshot_fetch_metadata,
    _update_source_health_from_meta,
    _write_run_health,
    maybe_merge_lkg,
    write_zero_snapshot,
)
from economic_calendar.http import EnhancedCacheManager, EphemeralCacheManager, build_session
from economic_calendar.runstate import RUN_CONTEXT, RUN_CONTEXT_LOCK, RUN_OVERRIDES
from economic_calendar.speakers import collect_central_bank_speaker_events
from economic_calendar.textutils import _normalize_metadata_text
from economic_calendar.timeutils import UTC, _iso, _now_utc, _within, ensure_aware
from economic_calendar.sources.abs import fetch_abs_events
from economic_calendar.sources.bfs import fetch_bfs_events
from economic_calendar.sources.bls import (
    _fetch_bls_curated_fallback,
    _fetch_bls_html_fallback,
    fetch_bls_events,
    run_bls_debug_diagnostics,
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
from economic_calendar.sources.ons import _ons_html_calendar, fetch_ons_events_enhanced
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
    _ec_paths.STAGING_DIR.mkdir(parents=True, exist_ok=True)
    return [
        _write_json_export(_ec_paths.STAGING_DIR / "calendar.json", events),
        _write_jsonl_export(_ec_paths.STAGING_DIR / "calendar.jsonl", events),
        _write_csv_export(_ec_paths.STAGING_DIR / "calendar.csv", events),
    ]


def _write_production_artifacts(events: List[Any]) -> List[Path]:
    _ec_paths.PRODUCTION_DIR.mkdir(parents=True, exist_ok=True)
    return [
        _write_json_export(_ec_paths.PRODUCTION_DIR / "calendar.json", events),
        _write_jsonl_export(_ec_paths.PRODUCTION_DIR / "calendar.jsonl", events),
        _write_csv_export(_ec_paths.PRODUCTION_DIR / "calendar.csv", events),
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


