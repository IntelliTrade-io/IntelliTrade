#!/usr/bin/env python3
"""
Upload economic calendar events to Supabase economic_events table.
Runs the scraper for the next 14 days and upserts results.

Usage:
    python scripts/economic_calendar_upload.py
    python scripts/economic_calendar_upload.py --since -7 --until 14

Env vars required:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

# Add scripts dir to path so we can import the scraper
sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("economic_calendar_upload")


def upload_events(events: list[dict], supabase_url: str, service_role_key: str) -> int:
    """Upsert events into Supabase economic_events table. Returns count upserted."""
    try:
        from supabase import create_client
    except ImportError:
        logger.error("supabase-py not installed. Run: pip install supabase")
        sys.exit(1)

    client = create_client(supabase_url, service_role_key)

    if not events:
        logger.info("No events to upload.")
        return 0

    # Prepare rows — map scraper output to table columns
    rows = []
    for ev in events:
        row = {
            "id": ev["id"],
            "source": ev.get("source", ""),
            "agency": ev.get("agency", ""),
            "country": ev.get("country", ""),
            "title": ev.get("title", ""),
            "date_time_utc": ev["date_time_utc"],
            "event_local_tz": ev.get("event_local_tz", "UTC"),
            "impact": ev.get("impact", "Low"),
            "url": ev.get("url", ""),
            "extras": ev.get("extras") or {},
        }
        rows.append(row)

    # Upsert in batches of 200 to stay within Supabase limits
    batch_size = 200
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = (
            client.table("economic_events")
            .upsert(batch, on_conflict="id")
            .execute()
        )
        total_upserted += len(batch)
        logger.info("Upserted batch %d-%d (%d rows)", i + 1, i + len(batch), len(batch))

    return total_upserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Economic Calendar → Supabase upload")
    parser.add_argument("--since", type=int, default=-1, help="Days from now to start (default: -1 to include today)")
    parser.add_argument("--until", type=int, default=14, help="Days from now to end (default: 14)")
    parser.add_argument("--central-banks", action="store_true", default=True, help="Include central bank events")
    parser.add_argument("--global", dest="include_global", action="store_true", default=True, help="Include global sources")
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't upload; print events as JSON")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not args.dry_run:
        if not supabase_url:
            logger.error("SUPABASE_URL environment variable is required")
            sys.exit(1)
        if not service_role_key:
            logger.error("SUPABASE_SERVICE_ROLE_KEY environment variable is required")
            sys.exit(1)

    logger.info("Importing scraper…")
    try:
        from economic_calendar_scraper import run as scraper_run
    except ImportError as exc:
        logger.error("Failed to import scraper: %s", exc)
        sys.exit(1)

    logger.info("Running scraper (since=%d, until=%d)…", args.since, args.until)
    try:
        events = scraper_run(
            since_days=args.since,
            until_days=args.until,
            include_global=args.include_global,
            include_central_banks=args.central_banks,
            allow_persist=False,  # serverless — no disk writes
        )
    except Exception as exc:
        logger.error("Scraper failed: %s", exc, exc_info=True)
        sys.exit(1)

    logger.info("Scraper returned %d events", len(events))

    if args.dry_run:
        print(json.dumps(events, ensure_ascii=False, indent=2))
        return

    upserted = upload_events(events, supabase_url, service_role_key)
    logger.info("Done. Upserted %d events to Supabase.", upserted)


if __name__ == "__main__":
    main()
