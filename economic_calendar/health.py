"""LKG persistence, schema sentinel, fetch metadata, and run-health payloads.

Moved verbatim from the monolith (plan 6.3); only formatting/anchoring adapted:
output paths anchor via ``set_paths()`` (the monolith pins them at import), and
the debug flag is read from ``runstate`` so CLI mutation stays visible here.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import hashlib
import unicodedata


try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

from economic_calendar import runstate
from economic_calendar.enrich import (
    CENTRAL_BANK_AGENCIES,
    _infer_event_category,
    _normalize_event_country_code,
)
from economic_calendar.speakers import _empty_central_bank_speakers_health
from economic_calendar.curated import (
    STRICT_ZERO_SOURCES,
    _curated_fallback_info,
    _curated_fallback_source_key,
    _is_benign_zero_case,
    _is_benign_zero_reason,
    _normalize_zero_reason,
)
from economic_calendar.events import Event, _content_hash_bytes, _event_from_dict, _event_to_dict
from economic_calendar.http import EnhancedCacheManager
from economic_calendar.runstate import RUN_CONTEXT, RUN_OVERRIDES
from economic_calendar.textutils import (
    _eventish_text_blob,
    _regex_has_any,
)
from economic_calendar.timeutils import EUROSTAT_TZ, UTC, _iso, _now_utc, _within

logger = logging.getLogger("econ_calendar_complete")

AGENCY_KEY_OVERRIDES = {"STATSCAN": "STATCAN"}

# Output anchors — historically the monolith's script-relative out/ tree.
_OUT_DIR: Path = Path("out")
_PRODUCTION_DIR: Path = Path("out") / "production"


def set_paths(out_dir: Path, production_dir: Path) -> None:
    """Anchor health/publish outputs to the monolith's out/ tree."""
    global _OUT_DIR, _PRODUCTION_DIR
    _OUT_DIR = Path(out_dir)
    _PRODUCTION_DIR = Path(production_dir)


ENABLE_LKG = True
ENABLE_SCHEMA_SENTINEL = True
LKG_TTLS = {  # days

    "ECB": 14,

    "ESRI": 30,

    "SECO_EST": 90,

}

class SourceHealth:

    SLO = {
        "BLS": 6,
        "EUROSTAT": 75,
        "STATSNZ": 24,
        "ONS": 4,
        "ABS": 5,
        "STATCAN": 5,
        "BEA": 2,
        "CENSUS": 3,
        "DOL": 4,
        "EIA": 4,
        "ECB": 1,
        "SECO": 0,
        "ESRI": 0,
        "NBS": 1,
        "RBNZ": 1,
        "BFS": 1,
        "ISM": 2,
        "UMICH": 2,
        "ADP": 1,
        "SPGLOBAL_PMI": 12,
    }

    @staticmethod

    def scaled(since_days: int, until_days: int, key: str) -> int:

        window = max(1, int((until_days - since_days) or 30))

        base = int(SourceHealth.SLO.get(key, 0) or 0)

        if base <= 0:

            return 0

        return max(1, int(round(base * window / 30)))


FETCH_METADATA: Dict[str, Dict[str, Any]] = {}
FETCH_METADATA_LOCK = threading.RLock()

RUN_OVERRIDES: Dict[str, Any] = {}
DEBUG_ZERO_FLAG = False
STRICT_ZERO_FLAG = False
ZERO_SNAPSHOT_MAX_CHARS = 3000
FETCH_GROUP_MAX_WORKERS = 4

def _zero_snapshot_dir() -> Path:
    """
    Resolve the snapshot directory for zero proofs, honoring overrides and current cache manager.
    """
    base: Optional[Path] = None
    cache = runstate.CURRENT_CACHE_MANAGER
    if cache is not None:
        base = getattr(cache, "snapshots_dir", None)
    override = RUN_OVERRIDES.get("snapshots_dir")
    if override:
        base = Path(override)
    if base is None:
        base = Path("failures")
    return base / "zero"

def write_zero_snapshot(source_key: str, text: Optional[str], label: Optional[str] = None) -> None:
    """
    Persist a short text snapshot proving a zero-result scrape when debug-zero is enabled.
    """
    if not runstate.DEBUG_ZERO_FLAG or RUN_CONTEXT.get("serverless"):
        return
    snippet = unicodedata.normalize("NFKC", text or "no HTTP body").replace("\r\n", "\n")
    snippet = snippet.strip()
    if not snippet:
        snippet = "no HTTP body"
    if len(snippet) > ZERO_SNAPSHOT_MAX_CHARS:
        snippet = snippet[:ZERO_SNAPSHOT_MAX_CHARS]
    try:
        target_dir = _zero_snapshot_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%d")
        suffix = f"_{label}" if label else ""
        target = target_dir / f"{source_key.upper()}{suffix}_{stamp}.txt"
        target.write_text(snippet, encoding="utf-8")
        digest = hashlib.sha256(snippet.encode("utf-8")).hexdigest()
        _set_fetch_metadata(source_key, snapshot_hash=digest)
    except Exception:
        logger.debug("Zero snapshot write failed for %s", source_key, exc_info=True)

def _finalize_source_log(
    source: str,
    path_used: str,
    count: int,
    *,
    zero_reason: Optional[str] = None,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> None:
    logger.info("%s path used: %s (%d)", source, path_used, count)
    if count > 0 and zero_reason is None:
        zero_reason = ""
    meta: Dict[str, Any] = {}
    if extra_meta:
        meta.update(extra_meta)
    source_key = str(source or "").upper()
    if path_used == "curated" and source_key in {"BLS", *CENTRAL_BANK_AGENCIES}:
        meta.setdefault("live_source_failed", True)
    _set_fetch_metadata(source, count=count, path=path_used, zero_reason=zero_reason, **meta)

BIG_FEEDER_THRESHOLDS = {"BLS": 100, "EUROSTAT": 200, "STATSNZ": 100}

def _reset_fetch_metadata() -> None:
    with FETCH_METADATA_LOCK:
        FETCH_METADATA.clear()

def _set_fetch_metadata(source: str, **fields: Any) -> Dict[str, Any]:
    with FETCH_METADATA_LOCK:
        entry = FETCH_METADATA.setdefault(source.upper(), {})

        for key, value in fields.items():

            if value is not None:

                entry[key] = value

        return dict(entry)

def _get_fetch_metadata(source: str) -> Dict[str, Any]:
    with FETCH_METADATA_LOCK:
        return dict(FETCH_METADATA.get(source.upper(), {}))

def _snapshot_fetch_metadata() -> Dict[str, Dict[str, Any]]:
    with FETCH_METADATA_LOCK:
        return {key: dict(value) for key, value in FETCH_METADATA.items()}

def _lkg_meta_path(cache: EnhancedCacheManager, source_tag: str) -> Path:

    return cache.cache_dir / "meta" / f"{source_tag.lower()}_lkg.json"

def _persist_lkg(source_tag: str, events: List[Event]) -> None:

    if not (ENABLE_LKG and events):

        return

    if not RUN_CONTEXT.get("allow_persist", True):
        return

    if RUN_CONTEXT.get("serverless"):
        return

    cache = runstate.CURRENT_CACHE_MANAGER

    if cache is None:

        return

    try:

        target = _lkg_meta_path(cache, source_tag)

        target.parent.mkdir(parents=True, exist_ok=True)

        payload = {

            "source": source_tag,

            "saved_at": _iso(_now_utc()),

            "events": [_event_to_dict(ev) for ev in sorted(events, key=lambda item: item.date_time_utc)],

        }

        target.write_text(json.dumps(payload, ensure_ascii=False))

    except Exception:

        logger.debug("LKG persist failed for %s", source_tag, exc_info=True)

def maybe_merge_lkg(
    source_tag: str,
    events: List[Event],
    ttl_days: Optional[int] = None,
    tag: Optional[str] = None,
) -> List[Event]:

    if events or not ENABLE_LKG:

        return events

    if not RUN_CONTEXT.get("allow_persist", True):
        return events

    if RUN_CONTEXT.get("serverless"):
        return events

    cache = runstate.CURRENT_CACHE_MANAGER

    if cache is None:

        return events

    path = _lkg_meta_path(cache, source_tag)

    if not path.exists():

        return events

    try:

        payload = json.loads(path.read_text())

    except Exception:

        logger.debug("LKG read failed for %s", source_tag, exc_info=True)

        return events

    saved_at_raw = payload.get("saved_at")

    if not saved_at_raw:

        return events

    try:

        saved_at = datetime.fromisoformat(saved_at_raw)

    except Exception:

        return events

    if saved_at.tzinfo is None:

        saved_at = saved_at.replace(tzinfo=UTC)

    effective_ttl = ttl_days if ttl_days is not None else LKG_TTLS.get(source_tag.upper(), 30)

    if (_now_utc() - saved_at).days > effective_ttl:

        return events

    start_utc = RUN_CONTEXT.get("start_utc")

    end_utc = RUN_CONTEXT.get("end_utc")

    merged: List[Event] = []

    for data in payload.get("events", []):

        try:

            ev = _event_from_dict(data)

        except Exception:

            continue

        extras = dict(ev.extras or {})

        extras["cached"] = True

        extras["lkg_timestamp"] = saved_at.isoformat()

        if tag:

            extras["lkg_tag"] = tag

        ev.extras = extras

        if isinstance(start_utc, datetime) and isinstance(end_utc, datetime):

            if not _within(ev.date_time_utc, start_utc, end_utc):

                continue

        merged.append(ev)

    if merged:

        merged.sort(key=lambda ev: ev.date_time_utc)

        logger.info(f"{source_tag}: merged {len(merged)} cached event(s) from LKG")

        return merged

    return events

def _read_lkg_events(source_tag: str) -> List[Event]:
    if RUN_CONTEXT.get("serverless"):
        return []
    cache = runstate.CURRENT_CACHE_MANAGER
    if cache is None:
        return []
    path = _lkg_meta_path(cache, source_tag)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return []
    events: List[Event] = []
    for data in payload.get("events", []):
        try:
            events.append(_event_from_dict(data))
        except Exception:
            continue
    events.sort(key=lambda ev: ev.date_time_utc)
    return events

def _schema_meta_path(cache: EnhancedCacheManager, source_key: str) -> Path:

    return cache.cache_dir / "meta" / f"{source_key.lower()}_schema.json"

def _schema_capture(cache: Optional[EnhancedCacheManager], source: str, url: str, content: bytes, parsed_count: int, meta_suffix: str = "") -> None:

    if not (ENABLE_SCHEMA_SENTINEL and cache and content):

        return

    source_key = source.lower()

    if meta_suffix:

        source_key = f"{source_key}_{meta_suffix.lower()}"

    meta_path = _schema_meta_path(cache, source_key)

    last_hash = None

    if meta_path.exists():

        try:

            last_hash = json.loads(meta_path.read_text()).get("hash")

        except Exception:

            logger.debug("schema meta read failed", exc_info=True)

    container_bytes: bytes = content or b""

    if BeautifulSoup:

        try:

            soup = BeautifulSoup(container_bytes, "html.parser")

            candidate = soup.find("main") or soup.find(id="content") or soup.find("body")

            target_node = candidate or soup

            try:

                container_bytes = target_node.encode()

            except Exception:

                container_bytes = str(target_node).encode("utf-8", errors="ignore")

        except Exception:

            container_bytes = content or b""

    current_hash = _content_hash_bytes(container_bytes)

    meta_path.parent.mkdir(parents=True, exist_ok=True)

    try:

        meta_path.write_text(json.dumps({"hash": current_hash, "ts": _iso(_now_utc()), "url": url}, ensure_ascii=False))

    except Exception:

        logger.debug("schema meta write failed", exc_info=True)

    if parsed_count == 0 and last_hash and last_hash != current_hash:

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        suffix_part = f"-{meta_suffix}" if meta_suffix else ""

        snap_name = f"{source}{suffix_part}-{stamp}.html"

        try:

            cache.snapshots_dir.mkdir(parents=True, exist_ok=True)

            (cache.snapshots_dir / snap_name).write_bytes(content or b"")

        except Exception:

            logger.debug("snapshot write failed", exc_info=True)

        log_tag = f"{source}:{meta_suffix}" if meta_suffix else source

        logger.warning(f"SCHEMA_BREAK {log_tag}: container hash changed and parsed=0 — snapshot saved")

def _update_source_health_from_meta(source_key: str) -> None:

    ctx = RUN_CONTEXT

    meta = _get_fetch_metadata(source_key)

    if not meta:

        return

    count = meta.get("count", 0) or 0

    path = meta.get("path")
    zero_reason = meta.get("zero_reason")
    canonical_key = _canonical_health_key(source_key)
    raw_key = str(source_key or "").upper()
    alias_keys = [
        alias
        for alias, canonical in AGENCY_KEY_OVERRIDES.items()
        if canonical == canonical_key and alias != canonical_key
    ]

    per_source = ctx.setdefault("per_source", {})

    persist_state = ctx.setdefault("health_persistent", {})

    entry = persist_state.get(canonical_key, {})
    if not entry:
        for candidate_key in [raw_key] + alias_keys:
            if candidate_key != canonical_key and persist_state.get(candidate_key):
                entry = persist_state.get(candidate_key, {})
                break

    if count > 0:

        entry = {

            "last_success_ts": _iso(_now_utc()),

            "consecutive_failures": 0,

            "path": path,

        }

    else:

        entry = dict(entry or {})

        if _is_benign_zero_case(canonical_key, path, count, zero_reason):
            entry["consecutive_failures"] = 0
        else:
            entry["consecutive_failures"] = entry.get("consecutive_failures", 0) + 1

        entry["path"] = path

    persist_state[canonical_key] = entry
    for candidate_key in {raw_key, *alias_keys}:
        if candidate_key != canonical_key:
            persist_state.pop(candidate_key, None)

    per_source[canonical_key] = {

        "count": count,

        "path": path,

        "last_success_ts": entry.get("last_success_ts"),

        "consecutive_failures": entry.get("consecutive_failures", 0),

    }
    for candidate_key in {raw_key, *alias_keys}:
        if candidate_key != canonical_key:
            per_source.pop(candidate_key, None)

def _canonical_health_key(source_key: str) -> str:
    return AGENCY_KEY_OVERRIDES.get(str(source_key or "").upper(), str(source_key or "").upper())

def _build_health_status_payload(
    sources_payload: Dict[str, Dict[str, Any]],
    since_days: int,
    until_days: int,
    existing_health_status: Dict[str, Dict[str, Any]],
    curated_fallbacks: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Dict[str, Any]]:

    payload: Dict[str, Dict[str, Any]] = {}
    curated_fallbacks = {_canonical_health_key(key): value for key, value in (curated_fallbacks or {}).items()}
    normalized_sources: Dict[str, Dict[str, Any]] = {}
    for raw_key, meta in (sources_payload or {}).items():
        canonical_key = _canonical_health_key(raw_key)
        previous_meta = normalized_sources.get(canonical_key)
        if previous_meta is None or int((meta or {}).get("count", 0) or 0) >= int((previous_meta or {}).get("count", 0) or 0):
            normalized_sources[canonical_key] = meta or {}

    normalized_existing: Dict[str, Dict[str, Any]] = {}
    for raw_key, entry in (existing_health_status or {}).items():
        normalized_existing[_canonical_health_key(raw_key)] = entry or {}

    keys = set(SourceHealth.SLO.keys()) | set(normalized_existing.keys()) | set(normalized_sources.keys())

    for source_key in sorted(keys):

        if source_key in SourceHealth.SLO:

            expected = SourceHealth.scaled(since_days, until_days, source_key)

        else:

            expected = int((normalized_existing.get(source_key, {}) or {}).get("expected", 0) or 0)

            if expected <= 0 and source_key not in normalized_sources:

                continue

        actual = int((normalized_sources.get(source_key, {}) or {}).get("count", 0) or 0)
        source_meta = normalized_sources.get(source_key, {}) or {}
        curated_entry = curated_fallbacks.get(source_key)
        if curated_entry and curated_entry.get("used"):
            status = "FALLBACK_FRESH" if bool(curated_entry.get("fresh")) else "FALLBACK_STALE"
        elif actual == 0 and _is_benign_zero_case(
            source_key,
            source_meta.get("path_used"),
            actual,
            source_meta.get("zero_reason"),
        ):
            status = "QUIET"
        elif actual == 0 and (
            source_meta.get("errors")
            or str(source_meta.get("path_used") or "").strip().lower() == "none"
            or (
                bool(_normalize_zero_reason(source_meta.get("zero_reason")))
                and not _is_benign_zero_reason(source_meta.get("zero_reason"), source_key=source_key)
            )
            or (expected > 0 and not _is_benign_zero_reason(source_meta.get("zero_reason"), source_key=source_key))
        ):
            status = "FAILED"
        else:
            status = "HEALTHY" if expected <= 0 or actual >= expected else "DEGRADED"
        payload[source_key] = {"actual": actual, "expected": expected, "status": status}

    return payload


CORE_REQUIRED_MARKET_SOURCES = {"FED", "ECB", "BLS", "BEA", "DOL", "ISM"}
MARKET_MOVER_KEYWORDS = {
    "CPI": (r"\bcpi\b", r"\bconsumer price index\b", r"\binflation\b"),
    "PCE": (r"\bpce\b", r"\bpersonal income and outlays\b"),
    "GDP": (r"\bgdp\b", r"\bgross domestic product\b"),
    "PMI": (r"\bpmi\b", r"\bpurchasing managers\b"),
    "ISM": (r"\bism\b",),
    "NFP": (r"\bnonfarm\b", r"\bemployment situation\b"),
    "Unemployment": (r"\bunemployment\b",),
    "Jobless Claims": (r"\bjobless claims?\b",),
    "Retail Sales": (r"\bretail sales\b",),
    "Durable Goods": (r"\bdurable goods\b",),
    "Consumer Confidence": (r"\bconsumer confidence\b", r"\bconsumer sentiment\b"),
    "Central Bank Decision": (r"\brate decision\b", r"\bmonetary policy\b", r"\bfomc\b", r"\bgoverning council\b"),
    "Minutes": (r"\bminutes\b", r"\baccounts\b"),
    "Press Conference": (r"\bpress conference\b",),
    "Oil Inventories": (r"\boil inventories\b", r"\bpetroleum status\b", r"\bcrude oil\b"),
}


def _event_dt_utc(event: Event) -> datetime:
    dt = event.date_time_utc
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _market_window_summary(events: List[Event], start_utc: datetime, end_utc: datetime) -> Dict[str, Any]:
    selected = [ev for ev in events if start_utc <= _event_dt_utc(ev) <= end_utc]
    category_counts: Dict[str, int] = {}
    region_counts: Dict[str, int] = {}
    keyword_hits: Dict[str, int] = {key: 0 for key in MARKET_MOVER_KEYWORDS}
    market_movers = 0
    for ev in selected:
        extras = ev.extras or {}
        category = str(extras.get("category") or _infer_event_category(ev))
        category_counts[category] = category_counts.get(category, 0) + 1
        region = _normalize_event_country_code(ev) or ev.country or "unknown"
        region_counts[region] = region_counts.get(region, 0) + 1
        score = int(extras.get("trader_relevance_score") or 0)
        if score >= 60:
            market_movers += 1
        text = _eventish_text_blob(ev)
        for key, patterns in MARKET_MOVER_KEYWORDS.items():
            if _regex_has_any(text, patterns):
                keyword_hits[key] += 1
    return {
        "event_count": len(selected),
        "market_mover_count": market_movers,
        "category_counts": category_counts,
        "region_counts": region_counts,
        "keyword_hits": keyword_hits,
        "missing_keywords": [key for key, count in keyword_hits.items() if count == 0],
    }


def _build_market_mover_coverage(events: List[Event], now_utc: datetime) -> Dict[str, Any]:
    return {
        "next_7_days": _market_window_summary(events, now_utc, now_utc + timedelta(days=7)),
        "next_30_days": _market_window_summary(events, now_utc, now_utc + timedelta(days=30)),
    }


def _empty_qa_summary() -> Dict[str, Any]:
    return {
        "eurostat_core_samples": [],
        "bls_official_event_count": 0,
        "speaker_event_count": 0,
        "market_movers_speaker_count": 0,
        "pmi_cluster_count": 0,
    }


def _build_compact_qa_summary(events: List[Event], speakers_health: Dict[str, Any]) -> Dict[str, Any]:
    summary = _empty_qa_summary()
    eurostat_patterns = (
        r"^\s*unemployment\s*$",
        r"^\s*flash estimate inflation euro area\s*$",
        r"^\s*gdp main aggregates and employment\s*$",
    )
    eurostat_samples: List[Dict[str, Any]] = []
    pmi_clusters: set[str] = set()
    for event in events:
        extras = event.extras or {}
        if event.agency == "EUROSTAT" and _regex_has_any(event.title.lower(), eurostat_patterns):
            local_dt = _event_dt_utc(event).astimezone(EUROSTAT_TZ)
            eurostat_samples.append(
                {
                    "title": event.title,
                    "source_local_date_time": local_dt.isoformat(),
                    "source_local_timezone": event.event_local_tz,
                    "event_time_utc": _event_dt_utc(event).isoformat(),
                }
            )
        if extras.get("event_group_type") == "pmi_cluster" and extras.get("event_group_key"):
            pmi_clusters.add(str(extras["event_group_key"]))
    summary["eurostat_core_samples"] = eurostat_samples[:6]
    summary["bls_official_event_count"] = sum(
        1
        for event in events
        if event.agency == "BLS" and str((event.extras or {}).get("source_reliability") or "") == "official"
    )
    summary["speaker_event_count"] = int((speakers_health or {}).get("speaker_event_count", 0) or 0)
    summary["market_movers_speaker_count"] = int((speakers_health or {}).get("default_dashboard_count", 0) or 0)
    summary["pmi_cluster_count"] = len(pmi_clusters)
    return summary


def _build_curated_fallback_health(
    sources_payload: Dict[str, Dict[str, Any]],
    as_of_utc: datetime,
) -> Tuple[Dict[str, Dict[str, Any]], List[str], List[str], List[str]]:
    curated_fallbacks: Dict[str, Dict[str, Any]] = {}
    live_source_warnings: List[str] = []
    stale_sources: List[str] = []
    stale_required_sources: List[str] = []
    for raw_source, meta in sorted((sources_payload or {}).items()):
        source = _curated_fallback_source_key(raw_source)
        path_used = str((meta or {}).get("path_used") or "").strip().lower()
        count = int((meta or {}).get("count", 0) or 0)
        if path_used != "curated" or count <= 0:
            continue
        info = _curated_fallback_info(source, as_of_utc)
        if not info:
            continue
        entry = {"used": True, **info}
        curated_fallbacks[source] = entry
        if entry["fresh"]:
            logger.warning(
                "CURATED_FALLBACK_USED: %s reviewed_at=%s age_days=%s max_age_days=%s fresh=true",
                source,
                entry["reviewed_at"],
                entry["age_days"],
                entry["max_age_days"],
            )
            if bool((meta or {}).get("live_source_failed")):
                warning = f"{source} live source failed; using curated fallback reviewed on {entry['reviewed_at']}"
                live_source_warnings.append(warning)
                logger.warning("LIVE_SOURCE_WARNING: %s live source failed; using fresh curated fallback", source)
        else:
            logger.error(
                "CURATED_FALLBACK_STALE: %s reviewed_at=%s age_days=%s max_age_days=%s",
                source,
                entry["reviewed_at"],
                entry["age_days"],
                entry["max_age_days"],
            )
            stale_sources.append(source)
            if source in CORE_REQUIRED_MARKET_SOURCES or source in STRICT_ZERO_SOURCES:
                stale_required_sources.append(source)
    return curated_fallbacks, live_source_warnings, sorted(set(stale_sources)), sorted(set(stale_required_sources))


def _health_status_for_run(
    *,
    fatal_missing: List[str],
    warn_missing: List[str],
    sources_payload: Dict[str, Dict[str, Any]],
    market_mover_coverage: Dict[str, Any],
    stale_curated_sources: Optional[List[str]] = None,
    stale_required_curated_sources: Optional[List[str]] = None,
) -> Tuple[str, bool, List[str], List[str], List[str]]:
    missing_required: List[str] = []
    degraded_sources: List[str] = []
    failure_reasons: List[str] = []
    for source in sorted(CORE_REQUIRED_MARKET_SOURCES):
        meta = sources_payload.get(source)
        if not meta:
            missing_required.append(source)
            continue
        count = int(meta.get("count", 0) or 0)
        if count == 0 and not _is_benign_zero_case(source, meta.get("path_used"), count, meta.get("zero_reason")):
            missing_required.append(source)
    bls_meta = sources_payload.get("BLS") or {}
    bls_health = bls_meta.get("bls_health") if isinstance(bls_meta, dict) else {}
    bls_required_missing = list((bls_meta.get("bls_required_missing") or []) if isinstance(bls_meta, dict) else [])
    if isinstance(bls_health, dict):
        bls_required_missing = list(bls_health.get("required_missing") or bls_required_missing)
        if str(bls_health.get("status") or "").lower() == "failed" and "BLS" not in missing_required:
            missing_required.append("BLS")
    stale_curated_sources = sorted(set(stale_curated_sources or []))
    stale_required_curated_sources = sorted(set(stale_required_curated_sources or []))
    degraded_sources = sorted(set(warn_missing) | set(stale_required_curated_sources))
    if fatal_missing:
        failure_reasons.append("STRICT_ZERO: " + ", ".join(sorted(fatal_missing)))
    if missing_required:
        failure_reasons.append("missing required market mover sources: " + ", ".join(missing_required))
    if bls_required_missing:
        failure_reasons.append("missing required BLS events: " + ", ".join(sorted(set(map(str, bls_required_missing)))))
    if stale_required_curated_sources:
        failure_reasons.append("stale curated fallback for required source: " + ", ".join(stale_required_curated_sources))
    next_30 = market_mover_coverage.get("next_30_days", {})
    next_7 = market_mover_coverage.get("next_7_days", {})
    if int(next_30.get("market_mover_count", 0) or 0) < 8:
        failure_reasons.append("weak 30-day market mover coverage")
    if int(next_7.get("market_mover_count", 0) or 0) < 2:
        degraded_sources.append("MARKET_MOVER_COVERAGE_7D")
    if failure_reasons:
        return "failed", False, failure_reasons, sorted(set(missing_required)), sorted(set(degraded_sources))
    if degraded_sources:
        return "degraded", False, ["degraded source coverage"], [], sorted(set(degraded_sources))
    return "healthy", True, [], [], []


def _write_run_health(health_payload: Dict[str, Any]) -> None:
    try:
        health_out = _OUT_DIR / "health.json"
        health_out.parent.mkdir(parents=True, exist_ok=True)
        with health_out.open("w", encoding="utf-8") as handle:
            json.dump(health_payload, handle, ensure_ascii=False, separators=(",", ":"))
        logger.info("Run health written to %s", health_out)
    except Exception:
        logger.debug("Failed to write health report", exc_info=True)


def _publish_state_path() -> Path:
    return _PRODUCTION_DIR / "publish_state.json"


def _load_last_publish_metadata() -> Dict[str, str]:
    state_path = _publish_state_path()
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            return {
                "last_successful_publish_at_utc": str(state.get("last_successful_publish_at_utc") or ""),
                "last_successful_publish_file": str(state.get("last_successful_publish_file") or ""),
            }
        except Exception:
            logger.debug("Failed to read publish state", exc_info=True)

    calendar_path = _PRODUCTION_DIR / "calendar.json"
    if calendar_path.exists():
        try:
            mtime = datetime.fromtimestamp(calendar_path.stat().st_mtime, tz=UTC).isoformat()
            return {
                "last_successful_publish_at_utc": mtime,
                "last_successful_publish_file": str(calendar_path),
            }
        except Exception:
            logger.debug("Failed to derive publish state from production calendar", exc_info=True)

    return {"last_successful_publish_at_utc": "", "last_successful_publish_file": ""}


def _save_publish_metadata(published_at_utc: datetime, file_path: Path) -> Dict[str, str]:
    metadata = {
        "last_successful_publish_at_utc": published_at_utc.astimezone(UTC).isoformat(),
        "last_successful_publish_file": str(file_path),
    }
    try:
        _PRODUCTION_DIR.mkdir(parents=True, exist_ok=True)
        _publish_state_path().write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    except Exception:
        logger.debug("Failed to write publish state", exc_info=True)
    return metadata


def _failed_health_payload(reason: str, *, missing_packages: Optional[List[str]] = None) -> Dict[str, Any]:
    generated_at = _now_utc()
    failure_reasons = [reason]
    if missing_packages:
        failure_reasons.append("missing packages: " + ", ".join(missing_packages))
    last_publish = _load_last_publish_metadata()
    return {
        "status": "failed",
        "publish_allowed": False,
        "export_written": False,
        "staging_export_written": False,
        "requested_export_written": False,
        "production_export_written": False,
        "production_promoted": False,
        "failure_reasons": failure_reasons,
        "missing_required_sources": [],
        "degraded_sources": [],
        "live_source_warnings": [],
        "curated_fallbacks": {},
        "central_bank_speakers_health": _empty_central_bank_speakers_health(),
        "qa_summary": _empty_qa_summary(),
        "generated_at_utc": generated_at.isoformat(),
        **last_publish,
        "event_count_total": 0,
        "event_count_unique": 0,
        "source_counts": {},
        "market_mover_coverage": _build_market_mover_coverage([], generated_at),
        "window": {"tz": "UTC", "now_utc": generated_at.isoformat()},
        "summary": {
            "total": 0,
            "unique": 0,
            "fatal": True,
            "warnings": 0,
            "generated_at_utc": generated_at.isoformat(),
        },
        "sources": {},
        "health_status": {},
        "per_source_counts": {},
        "per_source": {},
        "quorum_alerts": [],
    }


def _health_state_path(cache: EnhancedCacheManager) -> Path:

    return cache.cache_dir / "health_state.json"

def _load_health_state(cache: EnhancedCacheManager) -> dict:

    path = _health_state_path(cache)

    if path.exists():

        try:

            return json.loads(path.read_text())

        except Exception:

            logger.debug("health state load failed", exc_info=True)

    return {}

def _save_health_state(cache: EnhancedCacheManager, state: dict) -> None:

    if not RUN_CONTEXT.get("allow_persist", True):
        return

    try:

        _health_state_path(cache).write_text(json.dumps(state, ensure_ascii=False))

    except Exception:

        logger.debug("health state save failed", exc_info=True)
