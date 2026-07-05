# coding: utf-8
"""
IntelliTrade — Currency Strength Supabase Uploader
Reads the JSON output files produced by the scanners and inserts a
snapshot row into the `currency_strength_snapshots` Supabase table.

Requires the repo package to be installed (pip install .) for the
PostgREST client.

Environment variables (set in your shell or .env before running):
    SUPABASE_URL              — e.g. https://xxxxxxxxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY — service role key (has write access)

Usage:
    python scripts/currency_strength_upload.py \
        --type daily \
        --pairs-json out/heatmap_pairs_v152.json \
        --currencies-json out/heatmap_currencies_v152.json
"""

import argparse
import json
import sys

from intellitrade_scanners.postgrest import Postgrest, PostgrestError


def main() -> None:
    ap = argparse.ArgumentParser(description="Upload CSM snapshot to Supabase")
    ap.add_argument("--type", required=True, choices=["daily", "intraday"],
                    help="Snapshot type")
    ap.add_argument("--pairs-json", required=True,
                    help="Path to pairs output JSON from the scanner")
    ap.add_argument("--currencies-json", required=True,
                    help="Path to currencies output JSON from the scanner")
    args = ap.parse_args()

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

    try:
        inserted = Postgrest().insert("currency_strength_snapshots", row)
    except (RuntimeError, PostgrestError) as exc:
        print(f"ERROR — {exc}", file=sys.stderr)
        sys.exit(1)

    if inserted:
        snap_id = inserted[0].get("id", "?")
        ts = row["run_info"].get("ts_utc", "unknown time")
        print(f"OK — uploaded {args.type} snapshot id={snap_id} ts={ts}")
    else:
        print("ERROR — insert returned no data", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
