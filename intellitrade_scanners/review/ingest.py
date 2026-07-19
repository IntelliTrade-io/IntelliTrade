# coding: utf-8
"""
Stage 1 - Snapshot ingestion.

Copy qualifying (and, for lineage, invalid) fx_strength_snapshots daily rows into
the immutable csm_review_snapshots store: validate, compute the canonical
candle_close_ts, hash the canonically-serialized payload, derive the 8-row
ladder, insert. Invalid rows are still inserted (completeness='invalid') as
lineage but are never case-eligible.

Duplicates are rejected by UNIQUE(source_snapshot_id) and
UNIQUE(feed_name, snapshot_type, candle_close_ts) -> ingestion is idempotent.
"""

from __future__ import annotations

import hashlib
import json
import logging

from intellitrade_scanners.postgrest import PostgrestError
from intellitrade_scanners.review import best_expression, db, timeutil
from intellitrade_scanners.review.constants import (
    CURRENCIES,
    MIN_SYMBOLS,
    PAYLOAD_SCHEMA_VERSION,
    RUN_WINDOW_MINUTES,
)

log = logging.getLogger(__name__)

SNAPSHOT_TYPE = "daily"


# ── pure helpers ────────────────────────────────────────────────────────────

def canonical_payload(source_row: dict) -> dict:
    """The full original reading, extracted from a source snapshot row."""
    return {
        "run_info": source_row.get("run_info") or {},
        "pairs": source_row.get("pairs") or {},
        "currencies_raw": source_row.get("currencies_raw") or {},
        "currencies_weighted": source_row.get("currencies_weighted") or {},
    }


def payload_hash(payload: dict) -> str:
    """sha256 of the canonically-serialized payload (stable key order)."""
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _has_candle_metadata(payload: dict) -> bool:
    run_info = payload.get("run_info") or {}
    if not run_info.get("run_id") or not run_info.get("model_version"):
        return False
    pairs = payload.get("pairs") or {}
    if not pairs:
        return False
    # Every non-errored pair must carry the H4 reference candle time.
    for info in pairs.values():
        if info.get("error"):
            continue
        if not info.get("last_candle_h4_time"):
            return False
    return True


def validate(payload: dict, feed_name: str, expected_feed: str) -> tuple[str, list[str]]:
    """Return (completeness, quality_flags). 'complete' rows are case-eligible;
    'invalid' rows are lineage only."""
    flags: list[str] = []
    run_info = payload.get("run_info") or {}
    pairs = payload.get("pairs") or {}
    weighted = payload.get("currencies_weighted") or {}

    if feed_name != expected_feed:
        flags.append("feed_mismatch")

    if not run_info.get("ts_utc"):
        flags.append("missing_run_ts")
        return "invalid", flags

    symbols_ok = run_info.get("symbols_ok")
    if symbols_ok is None or int(symbols_ok) < MIN_SYMBOLS:
        flags.append("insufficient_symbols")

    if len(pairs) < MIN_SYMBOLS:
        flags.append("incomplete_pairs")
    if not all(c in weighted for c in CURRENCIES):
        flags.append("incomplete_currencies")

    if not _has_candle_metadata(payload):
        flags.append("missing_candle_metadata")

    close_ts = timeutil.candle_close_ts(timeutil.parse_ts(run_info["ts_utc"]))
    run_ts = timeutil.parse_ts(run_info["ts_utc"])
    if not timeutil.is_weekday_boundary(close_ts):
        flags.append("weekend_or_stale")
    if not timeutil.within_run_window(run_ts, close_ts, RUN_WINDOW_MINUTES):
        flags.append("outside_run_window")

    completeness = "complete" if not flags else "invalid"
    return completeness, flags


def build_review_snapshot(source_row: dict, expected_feed: str) -> dict:
    """Build the csm_review_snapshots insert record from a source row."""
    payload = canonical_payload(source_row)
    run_info = payload["run_info"]
    feed_name = source_row.get("feed_name") or run_info.get("feed") or expected_feed
    completeness, flags = validate(payload, feed_name, expected_feed)

    run_ts = timeutil.parse_ts(run_info["ts_utc"])
    close_ts = timeutil.candle_close_ts(run_ts)
    ladder = best_expression.build_ladder(payload["currencies_weighted"])

    return {
        "source_table": "fx_strength_snapshots",
        "source_snapshot_id": source_row["id"],
        "source_run_id": run_info.get("run_id"),
        "snapshot_type": SNAPSHOT_TYPE,
        "feed_name": feed_name,
        "scanner_version": source_row.get("scanner_version") or run_info.get("version") or "",
        "model_version": run_info.get("model_version") or "",
        "captured_at": run_ts.isoformat().replace("+00:00", "Z"),
        "candle_close_ts": close_ts.isoformat().replace("+00:00", "Z"),
        "payload": payload,
        "payload_schema_version": PAYLOAD_SCHEMA_VERSION,
        "payload_hash": payload_hash(payload),
        "ladder": ladder,
        "completeness": completeness,
        "quality_flags": flags,
    }


# ── IO stage ────────────────────────────────────────────────────────────────

def _already_ingested_ids(client) -> set[int]:
    rows = client.select("csm_review_snapshots", columns="source_snapshot_id")
    return {r["source_snapshot_id"] for r in rows}


def run(expected_feed: str, client=None) -> dict:
    """Ingest all not-yet-ingested daily source rows for the configured feed.

    Returns a summary dict {processed, inserted, invalid, skipped}.
    """
    db_client = client or db.get_client()
    from intellitrade_scanners.postgrest import eq

    seen = _already_ingested_ids(db_client)
    source_rows = db_client.select(
        "fx_strength_snapshots",
        columns="id,type,feed_name,scanner_version,run_info,pairs,currencies_raw,currencies_weighted,created_at",
        filters=[eq("type", SNAPSHOT_TYPE), eq("feed_name", expected_feed)],
    )

    summary = {"processed": 0, "inserted": 0, "invalid": 0, "skipped": 0}
    for row in source_rows:
        if row["id"] in seen:
            summary["skipped"] += 1
            continue
        summary["processed"] += 1
        try:
            record = build_review_snapshot(row, expected_feed)
        except Exception as exc:  # noqa: BLE001 - isolate per-item failures
            log.error("ingest build failed for source id=%s: %s", row.get("id"), exc)
            continue
        if record["completeness"] == "invalid":
            summary["invalid"] += 1
        try:
            db_client.insert("csm_review_snapshots", record)
            summary["inserted"] += 1
        except PostgrestError as exc:
            # Duplicate candle_close_ts / source id (weekend re-run, double-fire): no-op.
            if "409" in str(exc) or "duplicate" in str(exc).lower():
                summary["skipped"] += 1
            else:
                log.error("ingest insert failed for source id=%s: %s", row.get("id"), exc)
    return summary
