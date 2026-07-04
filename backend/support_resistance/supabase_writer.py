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

Mirrors scripts/vps/supabase_upload.py conventions (module-level cached client).
"""

import os
import sys
import logging
from typing import List, Optional

log = logging.getLogger(__name__)

_client = None


def is_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def get_client():
    global _client
    if _client is None:
        try:
            from supabase import create_client
        except ImportError:
            print("supabase not installed. Run: pip install supabase", file=sys.stderr)
            raise
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _client = create_client(url, key)
    return _client


def upsert_candles(rows: List[dict]) -> int:
    """Upsert market_candles rows. Returns count attempted."""
    if not rows:
        return 0
    sb = get_client()
    try:
        sb.table("market_candles").upsert(rows, on_conflict="symbol,timeframe,time").execute()
        log.info(f"market_candles: upserted {len(rows)} rows")
    except Exception as e:  # noqa: BLE001
        log.error(f"market_candles upsert failed: {e}")
        raise
    return len(rows)


def upsert_zone(zone_row: dict) -> Optional[str]:
    """Upsert one sr_zones row and return its id."""
    sb = get_client()
    try:
        result = (
            sb.table("sr_zones")
            .upsert(zone_row, on_conflict="symbol,zone_side,zone_created_time,model_version")
            .execute()
        )
        if result.data:
            return result.data[0].get("id")
    except Exception as e:  # noqa: BLE001
        log.error(f"sr_zones upsert failed: {e}")
        raise
    return None


def upsert_opportunity(opp_row: dict, zone_id: Optional[str]) -> None:
    """Upsert one sr_opportunities row. Strips internal (_-prefixed) keys."""
    sb = get_client()
    row = {k: v for k, v in opp_row.items() if not k.startswith("_")}
    # dynamic_grade_display is convenience only; keep dynamic_grade (canonical key).
    row.pop("dynamic_grade_display", None)
    row["zone_id"] = zone_id
    try:
        sb.table("sr_opportunities").upsert(row, on_conflict="zone_id,model_version").execute()
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
    sb = get_client()
    try:
        res = (sb.table("sr_opportunities")
               .delete()
               .eq("symbol", symbol)
               .eq("model_version", model_version)
               .not_.in_("zone_id", active_zone_ids)
               .execute())
        counts["opps_deleted"] = len(res.data or [])
        log.info(f"sr_opportunities: pruned {counts['opps_deleted']} rows not in current run "
                 f"({len(active_zone_ids)} kept)")
    except Exception as e:  # noqa: BLE001
        log.warning(f"sr_opportunities prune failed: {e}")

    try:
        res = (sb.table("sr_zones")
               .update({"is_active": False})
               .eq("symbol", symbol)
               .eq("model_version", model_version)
               .not_.in_("id", active_zone_ids)
               .execute())
        counts["zones_deactivated"] = len(res.data or [])
        log.info(f"sr_zones: deactivated {counts['zones_deactivated']} zones not in current run "
                 f"({len(active_zone_ids)} kept active)")
    except Exception as e:  # noqa: BLE001
        log.warning(f"sr_zones deactivate failed: {e}")
    return counts
