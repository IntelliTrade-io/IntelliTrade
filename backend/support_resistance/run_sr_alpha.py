# coding: utf-8
"""
SR Alpha backend runner.

Pipeline (EURUSD support-only, M15 execution context):
    1. Load latest EURUSD M15 candles (MT5 / CSV / mock)
    2. Build H1 / H4 context by resampling M15
    3. Compute indicators (ATR14, EMA200 on M15/H1/H4, m15_return_12_atr, slopes)
    4. Detect + label static support zones
    5. Evaluate current dynamic score / grade per zone (locked Phase 36 model)
    6. Build opportunities (enforcing exclude_late)
    7. Upsert candles / zones / opportunities into Supabase (unless --dry-run)
    8. Print a concise run summary

Cron (VPS, every 15 minutes):
    python backend/support_resistance/run_sr_alpha.py

Run without Supabase creds for a local dry run:
    python backend/support_resistance/run_sr_alpha.py --source mock --dry-run
"""

import argparse
import logging
import os
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone

# Load VPS env (C:\IntelliTrade\config\.env) — same convention as the strength
# scanners. Harmless locally: if dotenv or the file is absent, env vars set at
# the process/system level still work.
try:
    from dotenv import load_dotenv
    _env = r"C:\IntelliTrade\config\.env"
    load_dotenv(_env if os.path.exists(_env) else None)
except ImportError:
    pass

# Make `support_resistance` importable whether run as a script or a module.
_PKG_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # -> backend/
if _PKG_PARENT not in sys.path:
    sys.path.insert(0, _PKG_PARENT)

from support_resistance import config  # noqa: E402
from support_resistance import indicators  # noqa: E402
from support_resistance import candle_store  # noqa: E402
from support_resistance import zone_detector  # noqa: E402
from support_resistance import fetch_candles  # noqa: E402
from support_resistance import supabase_writer  # noqa: E402
from support_resistance.opportunity_builder import MarketContext, build_opportunity  # noqa: E402

log = logging.getLogger("run_sr_alpha")


def _latest_context(ctx_frames: dict) -> MarketContext:
    """Derive the current-bar MarketContext from M15/H1/H4 frames."""
    m15 = candle_store.to_sequences(ctx_frames["m15"])
    h1 = candle_store.to_sequences(ctx_frames["h1"])
    h4 = candle_store.to_sequences(ctx_frames["h4"])

    m15_atr = indicators.atr(m15["high"], m15["low"], m15["close"])
    m15_ema200 = indicators.ema(m15["close"], 200)
    h1_ema200 = indicators.ema(h1["close"], 200)
    h4_ema200 = indicators.ema(h4["close"], 200)

    ret = indicators.m15_return_12_atr(m15["close"], m15_atr, index=-1)
    if ret is None:
        raise RuntimeError("Not enough M15 history to compute m15_return_12_atr")

    session = indicators.session_for_utc(m15["time"][-1])

    return MarketContext(
        session=session,
        m15_return_12_atr=ret,
        h1_above_ema200=indicators.above_ema(h1["close"][-1], h1_ema200[-1]),
        h1_ema200_slope_nonnegative=indicators.ema200_slope_nonnegative(h1_ema200, -1),
        h4_above_ema200=indicators.above_ema(h4["close"][-1], h4_ema200[-1]),
        h4_ema200_slope_nonnegative=indicators.ema200_slope_nonnegative(h4_ema200, -1),
        m15_above_ema200=indicators.above_ema(m15["close"][-1], m15_ema200[-1]),
        calculated_at=m15["time"][-1].isoformat(),
    ), m15_atr


def run(source: str = "auto", bars: int = 1500, csv_path: str = None,
        dry_run: bool = False, max_zones: int = None) -> dict:
    symbol = config.symbol()
    model_version = config.MODEL_VERSION

    # 1. candles
    df = fetch_candles.fetch_m15_candles(symbol=symbol, bars=bars, source=source, csv_path=csv_path)
    frames = candle_store.build_context(df)
    candles_processed = len(frames["m15"])

    # 1b. accumulate real candles into a rolling local CSV archive (deduped by
    # time) for weekly QuantConnect cross-checks. Skip mock data.
    candles_archived = 0
    archive_path = os.environ.get("SR_ALPHA_CANDLE_ARCHIVE", r"C:\IntelliTrade\out\eurusd_m15_archive.csv")
    if source != "mock":
        try:
            candles_archived = candle_store.append_candles_archive(frames["m15"], archive_path, symbol=symbol)
        except Exception as exc:  # noqa: BLE001 - archiving must never break the run
            log.warning(f"candle archive append failed: {exc}")

    # 2/3. context + indicators
    ctx, m15_atr = _latest_context(frames)
    m15_seq = candle_store.to_sequences(frames["m15"])

    # 4. zones
    zones = zone_detector.detect_support_zones(m15_seq, m15_atr)
    if max_zones:
        zones = zones[:max_zones]

    # 5/6. opportunities (with per-zone close-reclaim state)
    opportunities = [
        build_opportunity(
            z, ctx, symbol=symbol, model_version=model_version,
            reclaim=zone_detector.close_reclaim_state(m15_seq, z),
        )
        for z in zones
    ]

    # 7. persist
    written = 0
    persisted = False
    stale = {"opps_deleted": 0, "zones_deactivated": 0}
    if not dry_run and supabase_writer.is_configured():
        candle_rows = candle_store.supabase_candle_rows(frames["m15"], symbol=symbol)
        supabase_writer.upsert_candles(candle_rows)
        active_zone_ids = []
        for z, opp in zip(zones, opportunities):
            zone_id = supabase_writer.upsert_zone(z.as_supabase_zone_row(symbol, model_version))
            supabase_writer.upsert_opportunity(opp, zone_id)
            if zone_id:
                active_zone_ids.append(zone_id)
            written += 1
        # drop opportunities/zones not in this run (timestamp-independent)
        stale = supabase_writer.prune_stale(symbol, model_version, active_zone_ids) or stale
        persisted = True
    elif not dry_run and not supabase_writer.is_configured():
        log.warning("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). "
                    "Skipping writes — run with --dry-run to silence this.")

    # canonical grade order for a stable, complete distribution readout
    grade_counts = Counter(o["dynamic_grade"] for o in opportunities)
    grade_dist = {g: grade_counts.get(g, 0)
                  for g in ("a_plus", "elite_green", "green", "watch", "blue", "blocked")}
    strength_dist = {s: sum(1 for z in zones if z.static_strength == s)
                     for s in ("strong", "medium", "weak")}

    summary = {
        "run_id": uuid.uuid4().hex,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "calculated_at": ctx.calculated_at,
        "model_version": model_version,
        "symbol": symbol,
        "source": source,
        "candles_processed": candles_processed,
        "candles_archived": candles_archived,
        "archive_path": archive_path if source != "mock" else None,
        "zones_detected": len(zones),
        "active_support_zones": sum(1 for z in zones if z.static_strength in ("medium", "strong")),
        "strength_dist": strength_dist,
        "opportunities_built": len(opportunities),
        "active_reclaims": sum(1 for o in opportunities if o.get("close_reclaim")),
        "grade_dist": grade_dist,
        "opportunities_written": written,
        "stale_opps_deleted": stale.get("opps_deleted", 0),
        "stale_zones_deactivated": stale.get("zones_deactivated", 0),
        "persisted": persisted,
        "current_session": ctx.session,
        "m15_return_12_atr": round(ctx.m15_return_12_atr, 4),
    }
    return summary


def _print_summary(s: dict) -> None:
    log.info("== SR Alpha run summary ==")
    log.info("run_id                : %s", s["run_id"])
    log.info("timestamp_utc         : %s", s["timestamp_utc"])
    log.info("calculated_at         : %s", s["calculated_at"])
    log.info("model_version         : %s", s["model_version"])
    log.info("symbol / source       : %s / %s", s["symbol"], s["source"])
    log.info("candles processed     : %s", s["candles_processed"])
    log.info("candles archived      : %s -> %s", s["candles_archived"], s["archive_path"])
    log.info("zones detected        : %s", s["zones_detected"])
    log.info("active support zones  : %s", s["active_support_zones"])
    log.info("strength distribution : %s", s["strength_dist"])
    log.info("opportunities built   : %s", s["opportunities_built"])
    log.info("active reclaims       : %s", s["active_reclaims"])
    log.info("grade distribution    : %s", s["grade_dist"])
    log.info("opportunities written : %s (persisted=%s)", s["opportunities_written"], s["persisted"])
    log.info("stale cleaned         : %s opps deleted, %s zones deactivated",
             s["stale_opps_deleted"], s["stale_zones_deactivated"])
    log.info("current session       : %s", s["current_session"])
    log.info("m15_return_12_atr     : %s", s["m15_return_12_atr"])


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Run the SR Alpha scoring pipeline.")
    parser.add_argument("--source", default="auto", choices=["auto", "mt5", "csv", "mock"])
    parser.add_argument("--bars", type=int, default=1500)
    parser.add_argument("--csv", default=None, help="OHLC csv path (source=csv)")
    parser.add_argument("--dry-run", action="store_true", help="Do not write to Supabase")
    parser.add_argument("--max-zones", type=int, default=None)
    args = parser.parse_args(argv)

    try:
        summary = run(source=args.source, bars=args.bars, csv_path=args.csv,
                      dry_run=args.dry_run, max_zones=args.max_zones)
    except Exception as exc:  # noqa: BLE001
        log.error(f"run failed: {exc}")
        return 1

    _print_summary(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
