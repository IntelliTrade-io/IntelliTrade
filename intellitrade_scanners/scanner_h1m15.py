# coding: utf-8
"""
IntelliTrade H1/M15 Currency Strength Scanner — VPS/MT5
Runs every 15 minutes. Fetches H1 + M15 candles from MetaTrader5.
Uploads to Supabase: fx_strength_snapshots, currency_strength_snapshots (compat),
                     fx_strength_components, scanner_health, fx_candles.

Usage:
    python scanner_h1m15.py

Environment (C:\IntelliTrade\config\.env):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    MT5_LOGIN (optional), MT5_PASSWORD (optional), MT5_SERVER (optional)
    ACTIVE_FEED_NAME (default: metaquotes_demo)
"""

import os
import sys
import json
import logging
import datetime as dt
from logging.handlers import TimedRotatingFileHandler

try:
    from dotenv import load_dotenv
    _env = r"C:\IntelliTrade\config\.env"
    load_dotenv(_env if os.path.exists(_env) else None)
except ImportError:
    pass

from intellitrade_scanners import feed_adapter, strength_core, supabase_upload

SCANNER_NAME = "h1m15_scanner"
TIMEFRAME_GROUP = "H1_M15"
SNAPSHOT_TYPE = "intraday"
TF1_KEY = "1hour"
TF2_KEY = "15min"
TF1_BARS = 1200
TF2_BARS = 1500

LOG_DIR = r"C:\IntelliTrade\logs"
OUT_DIR = r"C:\IntelliTrade\out"


def setup_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s")
    fh = TimedRotatingFileHandler(
        os.path.join(LOG_DIR, "scanner_h1m15.log"),
        when="midnight", backupCount=30, encoding="utf-8"
    )
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logging.basicConfig(level=logging.INFO, handlers=[fh, sh])


def remap_pair(info: dict) -> dict:
    """Remap generic tf1/tf2 to h1/m15 for frontend compatibility."""
    return {
        "h1": info.get("tf1"), "m15": info.get("tf2"),
        "pair": info.get("pair"), "confidence": info.get("confidence", 0.0),
        "last_bos_h1": info.get("last_bos_tf1"), "last_bos_h1_time": info.get("last_bos_tf1_time"),
        "last_bos_m15": info.get("last_bos_tf2"), "last_bos_m15_time": info.get("last_bos_tf2_time"),
        "error": info.get("error", ""),
    }


def main() -> int:
    setup_logging()
    log = logging.getLogger(SCANNER_NAME)
    run_start = dt.datetime.utcnow()
    log.info(f"=== H1/M15 scanner start {run_start.isoformat()}Z ===")

    feed_name = os.environ.get("ACTIVE_FEED_NAME", "metaquotes_demo")
    mt5_server = os.environ.get("MT5_SERVER", "") or None
    mt5_login_str = os.environ.get("MT5_LOGIN", "") or None
    mt5_password = os.environ.get("MT5_PASSWORD", "") or None
    mt5_login = int(mt5_login_str) if mt5_login_str else None

    try:
        feed_adapter.initialize(server=mt5_server, login=mt5_login, password=mt5_password)
    except Exception as e:
        log.error(f"MT5 init failed: {e}")
        supabase_upload.update_health(
            SCANNER_NAME, TIMEFRAME_GROUP, feed_name,
            status="error", symbols_processed=0, last_error=str(e)
        )
        return 1

    fetch_fn = feed_adapter.make_fetch_fn(max_retries=3, retry_wait=0.25)

    # Intraday uses lighter indicator settings
    use_inds = {
        "use_adx": True, "adx_d1_min": 18.0, "adx_h4_min": 16.0,
        "use_chop": True, "chop_d1_max": 58.0, "chop_h4_max": 60.0,
        "use_avwap_accept": True, "accept_d1_bars": 1, "accept_h4_bars": 3,
        "accept_atr_band": 0.20,
    }
    penalties = {
        "penalty_adx": 0.6, "penalty_chop": 0.7,
        "penalty_avwap": 0.6, "penalty_triangle": 0.8,
    }
    tf1_depth = (3, 1)
    tf2_depth = (3, 1)
    bos_h1  = (0.05, 0.5)
    bos_m15 = (0.08, 0.5)
    merge_h1  = (0.06, 1.0)
    merge_m15 = (0.08, 1.0)

    all_pairs_raw: dict = {}
    symbols_ok = 0
    symbols_fail = 0

    for sym in strength_core.DEFAULT_PAIRS:
        try:
            all_pairs_raw[sym] = strength_core.scan_pair(
                sym, TF1_KEY, TF2_KEY, tf1_depth, tf2_depth,
                bos_h1, bos_m15, merge_h1, merge_m15,
                use_inds, penalties, fetch_fn,
                tf1_bars=TF1_BARS, tf2_bars=TF2_BARS,
            )
            symbols_ok += 1
            p = all_pairs_raw[sym]
            log.info(f"  {sym}: {p['pair']} (conf={p['confidence']:.1f} h1={p['tf1']} m15={p['tf2']})")
        except Exception as e:
            all_pairs_raw[sym] = {
                "tf1": "neutral", "tf2": "neutral", "pair": "neutral",
                "confidence": 0.0, "error": str(e),
                "last_candle_tf1_time": None, "last_candle_tf2_time": None,
                "last_candle_tf1_close": 0.0,
            }
            symbols_fail += 1
            log.error(f"  {sym}: FAILED — {e}")

    log.info(f"Scan complete: {symbols_ok} ok, {symbols_fail} failed")

    # Triangle consistency
    ratios = strength_core.triangle_inconsistency(all_pairs_raw)
    triangle_penalty = 0.5
    for sym, ratio in ratios.items():
        info = all_pairs_raw.get(sym)
        if info and float(info.get("confidence", 0)) > 0:
            info["confidence"] *= (1.0 - ratio * (1.0 - triangle_penalty))

    curr_raw = strength_core.aggregate_currencies(all_pairs_raw, weighted=False)
    curr_weighted = strength_core.aggregate_currencies(all_pairs_raw, weighted=True)

    pairs_compat = {sym: remap_pair(info) for sym, info in all_pairs_raw.items()}

    last_candle_time = next(
        (v["last_candle_tf1_time"] for v in all_pairs_raw.values()
         if v.get("last_candle_tf1_time")), None
    )

    run_info = {
        "ts_utc": run_start.isoformat() + "Z",
        "scanner": SCANNER_NAME,
        "feed": feed_name,
        "version": strength_core.SCANNER_VERSION,
        "tf1": TF1_KEY, "tf2": TF2_KEY,
        "symbols_ok": symbols_ok, "symbols_fail": symbols_fail,
    }

    try:
        snapshot_id = supabase_upload.upload_snapshot(
            SNAPSHOT_TYPE, feed_name, run_info,
            pairs_compat, curr_raw, curr_weighted,
            scanner_version=strength_core.SCANNER_VERSION,
        )
        supabase_upload.upload_components(snapshot_id, all_pairs_raw, TF1_KEY, TF2_KEY)
        supabase_upload.upsert_latest_candles(all_pairs_raw, feed_name, TF1_KEY, TF2_KEY)
        supabase_upload.update_health(
            SCANNER_NAME, TIMEFRAME_GROUP, feed_name,
            status="ok", symbols_processed=symbols_ok,
            last_candle_time=last_candle_time,
            scanner_version=strength_core.SCANNER_VERSION,
        )
    except Exception as e:
        log.error(f"Supabase upload failed: {e}")
        supabase_upload.update_health(
            SCANNER_NAME, TIMEFRAME_GROUP, feed_name,
            status="error", symbols_processed=symbols_ok,
            last_candle_time=last_candle_time, last_error=str(e),
        )
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "intraday_pairs_trusted.json"), "w", encoding="utf-8") as f:
        json.dump({"run_info": run_info, "pairs": pairs_compat}, f, indent=2)
    with open(os.path.join(OUT_DIR, "intraday_currencies_trusted.json"), "w", encoding="utf-8") as f:
        json.dump({"currencies_raw": curr_raw, "currencies_weighted": curr_weighted}, f, indent=2)

    run_end = dt.datetime.utcnow()
    elapsed = (run_end - run_start).total_seconds()
    log.info(f"=== H1/M15 scanner done in {elapsed:.1f}s ===")
    return 0


if __name__ == "__main__":
    feed_adapter.shutdown()
    sys.exit(main())
