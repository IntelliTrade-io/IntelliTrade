# coding: utf-8
"""
Supabase writer for the SR Alpha backend.

Writes to three tables (see supabase/migrations/003_sr_alpha_tables.sql):
    market_candles    — EURUSD candle store          (upsert on symbol,timeframe,time)
    sr_zones          — detected static support zones (upsert on symbol,zone_side,zone_created_time,model_version)
    sr_opportunities  — dynamic grades for zones      (upsert on zone_id,model_version)

Env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY   (backend only — never exposed to the frontend)

Talks to PostgREST directly via intellitrade_scanners.postgrest (no supabase-py).
"""

import os
import sys
import logging
from typing import List, Optional

log = logging.getLogger(__name__)

_client = None

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _postgrest():
    """Import the shared PostgREST client, tolerating uninstalled checkouts."""
    try:
        from intellitrade_scanners import postgrest
    except ImportError:
        if _REPO_ROOT not in sys.path:
            sys.path.insert(0, _REPO_ROOT)
        from intellitrade_scanners import postgrest
    return postgrest


def is_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def get_client():
    global _client
    if _client is None:
        _client = _postgrest().Postgrest()
    return _client


def fetch_symbol_map(feed_name: str) -> List[dict]:
    """symbol_mapping rows for a feed (canonical_symbol, broker_symbol)."""
    pg = _postgrest()
    return get_client().select(
        "symbol_mapping", "canonical_symbol, broker_symbol",
        [pg.eq("feed_name", feed_name)],
    )


def upsert_candles(rows: List[dict]) -> int:
    """Upsert market_candles rows. Returns count attempted."""
    if not rows:
        return 0
    db = get_client()
    try:
        db.upsert("market_candles", rows, on_conflict="symbol,timeframe,time")
        log.info(f"market_candles: upserted {len(rows)} rows")
    except Exception as e:  # noqa: BLE001
        log.error(f"market_candles upsert failed: {e}")
        raise
    return len(rows)


def upsert_zone(zone_row: dict) -> Optional[str]:
    """Upsert one sr_zones row and return its id."""
    db = get_client()
    try:
        result = db.upsert("sr_zones", zone_row,
                           on_conflict="symbol,zone_side,zone_created_time,model_version")
        if result:
            return result[0].get("id")
    except Exception as e:  # noqa: BLE001
        log.error(f"sr_zones upsert failed: {e}")
        raise
    return None


def upsert_opportunity(opp_row: dict, zone_id: Optional[str]) -> None:
    """Upsert one sr_opportunities row. Strips internal (_-prefixed) keys."""
    db = get_client()
    row = {k: v for k, v in opp_row.items() if not k.startswith("_")}
    # dynamic_grade_display is convenience only; keep dynamic_grade (canonical key).
    row.pop("dynamic_grade_display", None)
    row["zone_id"] = zone_id
    try:
        db.upsert("sr_opportunities", row, on_conflict="zone_id,model_version")
    except Exception as e:  # noqa: BLE001
        log.error(f"sr_opportunities upsert failed: {e}")
        raise


def prune_stale(symbol: str, model_version: str, active_zone_ids: List[str]) -> None:
    """Keep the DB reflecting exactly the current run.

    Invariant: sr_opportunities holds one row per currently-active zone. So we
    delete any opportunity whose zone_id is NOT in this run's zone set, and mark
    those zones is_active = false. This is timestamp-independent — it self-heals
    orphans regardless of any clock/timezone drift in older rows.

    If no zones were detected this run, we do NOT mass-delete (safety valve).
    Returns {"opps_deleted": int, "zones_deactivated": int}.
    """
    counts = {"opps_deleted": 0, "zones_deactivated": 0}
    if not active_zone_ids:
        log.warning("prune_stale: no active zones this run — skipping delete (safety)")
        return counts
    pg = _postgrest()
    db = get_client()
    try:
        deleted = db.delete("sr_opportunities", [
            pg.eq("symbol", symbol),
            pg.eq("model_version", model_version),
            pg.not_in("zone_id", active_zone_ids),
        ])
        counts["opps_deleted"] = len(deleted)
        log.info(f"sr_opportunities: pruned {counts['opps_deleted']} rows not in current run "
                 f"({len(active_zone_ids)} kept)")
    except Exception as e:  # noqa: BLE001
        log.warning(f"sr_opportunities prune failed: {e}")

    try:
        deactivated = db.update("sr_zones", {"is_active": False}, [
            pg.eq("symbol", symbol),
            pg.eq("model_version", model_version),
            pg.not_in("id", active_zone_ids),
        ])
        counts["zones_deactivated"] = len(deactivated)
        log.info(f"sr_zones: deactivated {counts['zones_deactivated']} zones not in current run "
                 f"({len(active_zone_ids)} kept active)")
    except Exception as e:  # noqa: BLE001
        log.warning(f"sr_zones deactivate failed: {e}")
    return counts
