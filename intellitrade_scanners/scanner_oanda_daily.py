# coding: utf-8
"""
IntelliTrade Currency Strength Scanner — Daily (D1 / H4), OANDA feed.
Thin CLI runner over strength_core (the canonical v1.5.2 algorithm) with the
OANDA v20 adapter. Replaces scripts/currency_strength_scanner_daily.py; the
CLI flags and output JSON/CSV contracts are unchanged.

Usage (same flags as before, --warmup-first is accepted but ignored):
    python -m intellitrade_scanners.scanner_oanda_daily \
        --out-json out/heatmap_pairs_v152.json \
        --out-currencies-json out/heatmap_currencies_v152.json
"""

import argparse
import datetime as dt
import json
import os
import sys

import pandas as pd

from intellitrade_scanners import oanda_adapter, strength_core

TF1_KEY = "1day"
TF2_KEY = "4hour"
TF1_BARS = 1200
TF2_BARS = 1500


def remap_pair(info: dict) -> dict:
    """Remap generic tf1/tf2 keys to d1/h4 for frontend compatibility."""
    return {
        "d1": info.get("tf1"), "h4": info.get("tf2"),
        "pair": info.get("pair"), "confidence": info.get("confidence", 0.0),
        "last_bos_d1": info.get("last_bos_tf1"), "last_bos_d1_time": info.get("last_bos_tf1_time"),
        "last_bos_h4": info.get("last_bos_tf2"), "last_bos_h4_time": info.get("last_bos_tf2_time"),
        "error": info.get("error", ""),
    }


def write_pairs_csv(path, pairs_info):
    rows = [{"symbol": s, "d1": i["d1"], "h4": i["h4"], "pair": i["pair"],
             "confidence": round(float(i.get("confidence", 0)), 1),
             "last_bos_d1": i.get("last_bos_d1"), "last_bos_h4": i.get("last_bos_h4"),
             "error": i.get("error", "")}
            for s, i in sorted(pairs_info.items())]
    pd.DataFrame(rows).to_csv(path, index=False)


def write_currencies_csv(path, curr_info):
    rows = [{"currency": c, **i} for c, i in sorted(curr_info.items())]
    pd.DataFrame(rows).to_csv(path, index=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs",         default=",".join(strength_core.DEFAULT_PAIRS))
    ap.add_argument("--preset",        default=None)
    ap.add_argument("--trend-mode",    default="bos_only")
    ap.add_argument("--d1-depth",      default="3,1")
    ap.add_argument("--h4-depth",      default="3,1")
    ap.add_argument("--bos-excess-d1-atr",  type=float, default=0.04)
    ap.add_argument("--bos-excess-d1-pips", type=float, default=0.5)
    ap.add_argument("--bos-excess-h4-atr",  type=float, default=0.08)
    ap.add_argument("--bos-excess-h4-pips", type=float, default=0.5)
    ap.add_argument("--merge-atr-d1",  type=float, default=0.06)
    ap.add_argument("--merge-pips-d1", type=float, default=1.0)
    ap.add_argument("--merge-atr-h4",  type=float, default=0.08)
    ap.add_argument("--merge-pips-h4", type=float, default=1.0)
    ap.add_argument("--use-adx",       action="store_true")
    ap.add_argument("--adx-d1-min",    type=float, default=20.0)
    ap.add_argument("--adx-h4-min",    type=float, default=18.0)
    ap.add_argument("--use-chop",      action="store_true")
    ap.add_argument("--chop-d1-max",   type=float, default=55.0)
    ap.add_argument("--chop-h4-max",   type=float, default=58.0)
    ap.add_argument("--use-avwap-accept",  action="store_true")
    ap.add_argument("--accept-d1-bars",    type=int,   default=1)
    ap.add_argument("--accept-h4-bars",    type=int,   default=3)
    ap.add_argument("--accept-atr-band",   type=float, default=0.20)
    ap.add_argument("--use-triangle-consistency", action="store_true")
    ap.add_argument("--triangle-penalty",  type=float, default=0.50)
    ap.add_argument("--emit-confidence",   action="store_true")
    ap.add_argument("--soft-gating",       action="store_true")
    ap.add_argument("--penalty-adx",       type=float, default=0.6)
    ap.add_argument("--penalty-chop",      type=float, default=0.7)
    ap.add_argument("--penalty-avwap",     type=float, default=0.6)
    ap.add_argument("--penalty-triangle",  type=float, default=0.8)
    ap.add_argument("--weighted-aggregation", action="store_true")
    ap.add_argument("--max-retries",  type=int,   default=3)
    ap.add_argument("--retry-wait",   type=float, default=0.25)
    ap.add_argument("--warmup-first", action="store_true", help="(ignored, kept for compatibility)")
    ap.add_argument("--out-json",             default=None)
    ap.add_argument("--out-csv",              default=None)
    ap.add_argument("--out-currencies-json",  default=None)
    ap.add_argument("--out-currencies-csv",   default=None)
    args = ap.parse_args()

    pairs     = [p.strip().upper() for p in args.pairs.split(",") if p.strip()]
    d1_depth  = tuple(int(x) for x in args.d1_depth.split(","))
    h4_depth  = tuple(int(x) for x in args.h4_depth.split(","))
    use_inds  = {
        "use_adx": args.use_adx, "adx_d1_min": args.adx_d1_min, "adx_h4_min": args.adx_h4_min,
        "use_chop": args.use_chop, "chop_d1_max": args.chop_d1_max, "chop_h4_max": args.chop_h4_max,
        "use_avwap_accept": args.use_avwap_accept, "accept_d1_bars": args.accept_d1_bars,
        "accept_h4_bars": args.accept_h4_bars, "accept_atr_band": args.accept_atr_band,
    }
    penalties = {
        "penalty_adx": args.penalty_adx, "penalty_chop": args.penalty_chop,
        "penalty_avwap": args.penalty_avwap, "penalty_triangle": args.penalty_triangle,
    }
    fetch_fn = oanda_adapter.make_fetch_fn(max_retries=args.max_retries, retry_wait=args.retry_wait)

    all_pairs_raw = {}
    for sym in pairs:
        try:
            all_pairs_raw[sym] = strength_core.scan_pair(
                sym, TF1_KEY, TF2_KEY, d1_depth, h4_depth,
                (args.bos_excess_d1_atr, args.bos_excess_d1_pips),
                (args.bos_excess_h4_atr, args.bos_excess_h4_pips),
                (args.merge_atr_d1, args.merge_pips_d1),
                (args.merge_atr_h4, args.merge_pips_h4),
                use_inds, penalties, fetch_fn,
                tf1_bars=TF1_BARS, tf2_bars=TF2_BARS,
            )
            print(f"  {sym}: {all_pairs_raw[sym]['pair']} (conf={all_pairs_raw[sym]['confidence']:.1f})")
        except Exception as e:
            all_pairs_raw[sym] = {"tf1": "neutral", "tf2": "neutral", "pair": "neutral",
                                  "confidence": 0.0, "error": str(e)}
            print(f"  {sym}: ERROR — {e}", file=sys.stderr)

    if args.use_triangle_consistency:
        ratios = strength_core.triangle_inconsistency(all_pairs_raw)
        for sym, ratio in ratios.items():
            info = all_pairs_raw.get(sym)
            if info and float(info.get("confidence", 0)) > 0:
                info["confidence"] *= (1.0 - ratio * (1.0 - args.triangle_penalty))

    curr_raw = strength_core.aggregate_currencies(all_pairs_raw, weighted=False)
    curr_w   = strength_core.aggregate_currencies(all_pairs_raw, weighted=args.weighted_aggregation)

    all_pairs = {sym: remap_pair(info) for sym, info in all_pairs_raw.items()}

    if args.out_json:
        os.makedirs(os.path.dirname(args.out_json) or ".", exist_ok=True)
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump({"run_info": {"ts_utc": dt.datetime.utcnow().isoformat() + "Z",
                                    "trend_mode": args.trend_mode,
                                    "d1_depth": args.d1_depth, "h4_depth": args.h4_depth},
                       "pairs": all_pairs}, f, indent=2)
        print("Wrote", args.out_json)

    if args.out_currencies_json:
        os.makedirs(os.path.dirname(args.out_currencies_json) or ".", exist_ok=True)
        with open(args.out_currencies_json, "w", encoding="utf-8") as f:
            json.dump({"currencies_raw": curr_raw, "currencies_weighted": curr_w}, f, indent=2)
        print("Wrote", args.out_currencies_json)

    if args.out_csv:
        os.makedirs(os.path.dirname(args.out_csv) or ".", exist_ok=True)
        write_pairs_csv(args.out_csv, all_pairs)
        print("Wrote", args.out_csv)

    if args.out_currencies_csv:
        os.makedirs(os.path.dirname(args.out_currencies_csv) or ".", exist_ok=True)
        write_currencies_csv(args.out_currencies_csv,
                             curr_w if args.weighted_aggregation else curr_raw)
        print("Wrote", args.out_currencies_csv)


if __name__ == "__main__":
    main()
