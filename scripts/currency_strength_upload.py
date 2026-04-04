# coding: utf-8
"""
IntelliTrade — Currency Strength Supabase Uploader
Reads the JSON output files produced by the MT5 scanners and inserts a
snapshot row into the `currency_strength_snapshots` Supabase table.

Requirements:
    pip install supabase

Environment variables (set in your shell or .env before running):
    SUPABASE_URL              — e.g. https://xxxxxxxxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY — service role key (has write access)

Usage:
    python scripts/currency_strength_upload.py \
        --type daily \
        --pairs-json "C:\IntelliTrade\out\heatmap_pairs_v152.json" \
        --currencies-json "C:\IntelliTrade\out\heatmap_currencies_v152.json"

    python scripts/currency_strength_upload.py \
        --type intraday \
        --pairs-json "C:\IntelliTrade\out\intraday_pairs_trusted.json" \
        --currencies-json "C:\IntelliTrade\out\intraday_currencies_trusted.json"
"""

import argparse
import json
import os
import sys

try:
    from supabase import create_client
except ImportError:
    print("supabase package not found. Run: pip install supabase", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser(description="Upload CSM snapshot to Supabase")
    ap.add_argument("--type", required=True, choices=["daily", "intraday"],
                    help="Snapshot type")
    ap.add_argument("--pairs-json", required=True,
                    help="Path to pairs output JSON from the scanner")
    ap.add_argument("--currencies-json", required=True,
                    help="Path to currencies output JSON from the scanner")
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(args.pairs_json, encoding="utf-8") as f:
        pairs_data = json.load(f)
    with open(args.currencies_json, encoding="utf-8") as f:
        curr_data = json.load(f)

    row = {
        "type": args.type,
        "run_info": pairs_data.get("run_info", {}),
        "pairs": pairs_data.get("pairs", {}),
        "currencies_raw": curr_data.get("currencies_raw", {}),
        "currencies_weighted": curr_data.get("currencies_weighted", {}),
    }

    sb = create_client(url, key)
    result = sb.table("currency_strength_snapshots").insert(row).execute()

    if result.data:
        snap_id = result.data[0].get("id", "?")
        ts = row["run_info"].get("ts_utc", "unknown time")
        print(f"OK — uploaded {args.type} snapshot id={snap_id} ts={ts}")
    else:
        print(f"ERROR — insert returned no data: {result}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
