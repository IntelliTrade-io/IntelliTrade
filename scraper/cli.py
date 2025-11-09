#!/usr/bin/env python3
import sys
import json
import os
import tempfile
from pathlib import Path

from runner import run

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--since', type=int, default=0)
    parser.add_argument('--until', type=int, default=30)
    parser.add_argument('--central-banks', type=str, default='true')
    parser.add_argument('--global', dest='include_global', type=str, default='true')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()

    central_banks = args.central_banks.lower() == 'true'
    include_global = args.include_global.lower() == 'true'

    # Use system temp directory (works on Windows, Mac, Linux)
    temp_dir = Path(tempfile.gettempdir())
    cache_dir = str(temp_dir / 'econ_scraper_cache')
    snapshots_dir = str(temp_dir / 'econ_scraper_snapshots')

    # IMPORTANT: Pass cache_dir and snapshots_dir explicitly
    events = run(
        since_days=args.since,
        until_days=args.until,
        include_central_banks=central_banks,
        include_global=include_global,
        cache_dir=cache_dir,
        snapshots_dir=snapshots_dir
    )

    print(json.dumps(events, ensure_ascii=False))