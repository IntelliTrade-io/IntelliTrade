# coding: utf-8
"""
IntelliTrade Currency Strength Scanner — Intraday (H1 / M15), OANDA feed.
Thin CLI runner over strength_core (the canonical v1.5.2 algorithm) with the
OANDA v20 adapter. Replaces scripts/currency_strength_scanner_intraday.py;
the CLI flags and output JSON/CSV contracts are unchanged.

Usage (same flags as before):
    python -m intellitrade_scanners.scanner_oanda_intraday \
        --out-json out/intraday_pairs_trusted.json \
        --out-currencies-json out/intraday_currencies_trusted.json
"""

import argparse
import datetime as dt
import json
import os
import sys

import pandas as pd

from intellitrade_scanners import oanda_adapter, strength_core

# CLI timeframe names → canonical adapter keys
TF_KEY = {"H1": "1hour", "M15": "15min"}


def remap_pair(info: dict, hi_tf: str, lo_tf: str) -> dict:
    """Remap generic tf1/tf2 keys to hi/lo for frontend compatibility."""
    return {
        "hi_tf": hi_tf, "lo_tf": lo_tf,
        "hi": info.get("tf1"), "lo": info.get("tf2"),
        "pair": info.get("pair"), "confidence": info.get("confidence", 0.0),
        "last_bos_hi": info.get("last_bos_tf1"), "last_bos_hi_time": info.get("last_bos_tf1_time"),
        "last_bos_lo": info.get("last_bos_tf2"), "last_bos_lo_time": info.get("last_bos_tf2_time"),
        "error": info.get("error", ""),
    }


def write_pairs_csv(path, pairs_info):
    rows = [{"symbol": s, "hi": i["hi"], "lo": i["lo"], "pair": i["pair"],
             "confidence": round(float(i.get("confidence", 0)), 1),
             "last_bos_hi": i.get("last_bos_hi"), "last_bos_lo": i.get("last_bos_lo"),
             "error": i.get("error", "")}
            for s, i in sorted(pairs_info.items())]
    pd.DataFrame(rows).to_csv(path, index=False)


def write_currencies_csv(path, curr_info):
    rows = [{"currency": c, **i} for c, i in sorted(curr_info.items())]
    pd.DataFrame(rows).to_csv(path, index=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs",    default=",".join(strength_core.DEFAULT_PAIRS))
    ap.add_argument("--hi-tf",   default="H1",  choices=["H1", "M15"])
    ap.add_argument("--lo-tf",   default="M15", choices=["H1", "M15"])
    ap.add_argument("--bars-hi", type=int, default=1200)
    ap.add_argument("--bars-lo", type=int, default=1500)
    ap.add_argument("--depth-hi", default="3,1")
    ap.add_argument("--depth-lo", default="3,1")
    ap.add_argument("--bos-excess-hi-atr",  type=float, default=0.05)
    ap.add_argument("--bos-excess-hi-pips", type=float, default=0.5)
    ap.add_argument("--bos-excess-lo-atr",  type=float, default=0.08)
    ap.add_argument("--bos-excess-lo-pips", type=float, default=0.5)
    ap.add_argument("--merge-hi-atr",  type=float, default=0.06)
    ap.add_argument("--merge-hi-pips", type=float, default=1.0)
    ap.add_argument("--merge-lo-atr",  type=float, default=0.08)
    ap.add_argument("--merge-lo-pips", type=float, default=1.0)
    ap.add_argument("--use-adx",  action="store_true")
    ap.add_argument("--adx-hi-min", type=float, default=20.0)
    ap.add_argument("--adx-lo-min", type=float, default=18.0)
    ap.add_argument("--use-chop", action="store_true")
    ap.add_argument("--chop-hi-max", type=float, default=55.0)
    ap.add_argument("--chop-lo-max", type=float, default=58.0)
    ap.add_argument("--use-avwap-accept",  action="store_true")
    ap.add_argument("--accept-hi-bars",    type=int,   default=1)
    ap.add_argument("--accept-lo-bars",    type=int,   default=3)
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
    ap.add_argument("--out-json",            default=None)
    ap.add_argument("--out-csv",             default=None)
    ap.add_argument("--out-currencies-json", default=None)
    ap.add_argument("--out-currencies-csv",  default=None)
    args = ap.parse_args()

    pairs    = [p.strip().upper() for p in args.pairs.split(",") if p.strip()]
    h_depth  = tuple(int(x) for x in args.depth_hi.split(","))
    l_depth  = tuple(int(x) for x in args.depth_lo.split(","))
    use_inds = {
        "use_adx": args.use_adx, "adx_d1_min": args.adx_hi_min, "adx_h4_min": args.adx_lo_min,
        "use_chop": args.use_chop, "chop_d1_max": args.chop_hi_max, "chop_h4_max": args.chop_lo_max,
        "use_avwap_accept": args.use_avwap_accept, "accept_d1_bars": args.accept_hi_bars,
        "accept_h4_bars": args.accept_lo_bars, "accept_atr_band": args.accept_atr_band,
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
                sym, TF_KEY[args.hi_tf], TF_KEY[args.lo_tf], h_depth, l_depth,
                (args.bos_excess_hi_atr, args.bos_excess_hi_pips),
                (args.bos_excess_lo_atr, args.bos_excess_lo_pips),
                (args.merge_hi_atr, args.merge_hi_pips),
                (args.merge_lo_atr, args.merge_lo_pips),
                use_inds, penalties, fetch_fn,
                tf1_bars=args.bars_hi, tf2_bars=args.bars_lo,
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

    all_pairs = {sym: remap_pair(info, args.hi_tf, args.lo_tf) for sym, info in all_pairs_raw.items()}

    if args.out_json:
        os.makedirs(os.path.dirname(args.out_json) or ".", exist_ok=True)
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump({"run_info": {"ts_utc": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
                                    "tf_hi": args.hi_tf, "tf_lo": args.lo_tf},
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
