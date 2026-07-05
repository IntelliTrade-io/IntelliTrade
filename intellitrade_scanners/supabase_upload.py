# coding: utf-8
"""
Supabase upload module for IntelliTrade VPS scanners.
Writes to: fx_strength_snapshots, currency_strength_snapshots (compat),
           fx_strength_components, scanner_health, fx_candles.
"""

import os
import sys
import logging
import datetime as dt
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    print("supabase not installed. Run: pip install supabase", file=sys.stderr)
    sys.exit(1)

log = logging.getLogger(__name__)

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _client = create_client(url, key)
    return _client


def upload_snapshot(snapshot_type: str, feed_name: str, run_info: dict,
                    pairs_compat: dict, curr_raw: dict, curr_weighted: dict,
                    scanner_version: str = "2.0.0-mt5") -> Optional[int]:
    """
    Insert into fx_strength_snapshots (primary) and currency_strength_snapshots (compat).
    pairs_compat must use the format the frontend expects: d1/h4 or h1/m15 field names.
    Returns the new snapshot id or None on failure.
    """
    sb = get_client()
    snapshot_id = None

    row = {
        "type": snapshot_type,
        "feed_name": feed_name,
        "scanner_version": scanner_version,
        "run_info": run_info,
        "pairs": pairs_compat,
        "currencies_raw": curr_raw,
        "currencies_weighted": curr_weighted,
    }
    try:
        result = sb.table("fx_strength_snapshots").insert(row).execute()
        if result.data:
            snapshot_id = result.data[0].get("id")
            log.info(f"fx_strength_snapshots: inserted id={snapshot_id}")
        else:
            log.error(f"fx_strength_snapshots insert returned no data: {result}")
    except Exception as e:
        log.error(f"fx_strength_snapshots insert failed: {e}")

    # Backwards-compat table (existing frontend reads this)
    compat_row = {
        "type": snapshot_type,
        "run_info": run_info,
        "pairs": pairs_compat,
        "currencies_raw": curr_raw,
        "currencies_weighted": curr_weighted,
    }
    try:
        sb.table("currency_strength_snapshots").insert(compat_row).execute()
        log.info("currency_strength_snapshots: inserted (compat)")
    except Exception as e:
        log.warning(f"currency_strength_snapshots compat insert failed: {e}")

    return snapshot_id


def upload_components(snapshot_id: Optional[int], all_pairs_raw: dict,
                      tf1_key: str, tf2_key: str) -> None:
    """Insert per-pair component rows into fx_strength_components."""
    if snapshot_id is None:
        return
    sb = get_client()
    rows = [
        {
            "snapshot_id": snapshot_id,
            "symbol": symbol,
            "tf1": tf1_key,
            "tf1_trend": info.get("tf1"),
            "tf2": tf2_key,
            "tf2_trend": info.get("tf2"),
            "pair_label": info.get("pair"),
            "confidence": info.get("confidence", 0.0),
        }
        for symbol, info in all_pairs_raw.items()
    ]
    if rows:
        try:
            sb.table("fx_strength_components").insert(rows).execute()
            log.info(f"fx_strength_components: inserted {len(rows)} rows")
        except Exception as e:
            log.error(f"fx_strength_components insert failed: {e}")


def upsert_latest_candles(all_pairs_raw: dict, feed_name: str,
                          tf1_key: str, tf2_key: str) -> None:
    """Upsert one row per symbol+tf with latest close/time (health monitoring)."""
    sb = get_client()
    rows = []
    for symbol, info in all_pairs_raw.items():
        if info.get("last_candle_tf1_time"):
            rows.append({
                "symbol": symbol, "timeframe": tf1_key, "feed_name": feed_name,
                "time": info["last_candle_tf1_time"],
                "close": info.get("last_candle_tf1_close", 0.0),
                "tick_vol": 0,
            })
        if info.get("last_candle_tf2_time"):
            rows.append({
                "symbol": symbol, "timeframe": tf2_key, "feed_name": feed_name,
                "time": info["last_candle_tf2_time"],
                "close": 0.0, "tick_vol": 0,
            })
    if rows:
        try:
            sb.table("fx_candles").upsert(rows, on_conflict="symbol,timeframe,feed_name").execute()
            log.info(f"fx_candles: upserted {len(rows)} latest candle entries")
        except Exception as e:
            log.warning(f"fx_candles upsert failed: {e}")


def update_health(scanner_name: str, timeframe_group: str, feed_name: str,
                  status: str, symbols_processed: int,
                  last_candle_time: Optional[str] = None,
                  last_error: Optional[str] = None,
                  scanner_version: str = "2.0.0-mt5") -> None:
    """Upsert scanner_health row for this scanner/timeframe_group."""
    sb = get_client()
    now = dt.datetime.utcnow().isoformat() + "Z"
    row: dict = {
        "scanner_name": scanner_name,
        "timeframe_group": timeframe_group,
        "active_feed_name": feed_name,
        "last_candle_time": last_candle_time,
        "last_error": last_error,
        "symbols_processed": symbols_processed,
        "timeframes_processed": 2,
        "scanner_version": scanner_version,
        "status": status,
        "updated_at": now,
    }
    if status == "ok":
        row["last_success_at"] = now
        row["last_error"] = None
    try:
        sb.table("scanner_health").upsert(
            row, on_conflict="scanner_name,timeframe_group"
        ).execute()
        log.info(f"scanner_health: updated {scanner_name}/{timeframe_group} → {status}")
    except Exception as e:
        log.error(f"scanner_health update failed: {e}")
