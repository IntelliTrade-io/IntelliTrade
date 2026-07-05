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

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("economic_calendar_upload")


def prune_stale_events(client, new_scraper_ids: list[str], start_dt: str, end_dt: str) -> int:
    """
    Delete rows in the scraped time window whose scraperID is NOT in the new batch.

    This removes stale rows caused by ID changes (e.g. Eurostat UTC timestamp fixes
    change the SHA-1 hash, producing new scraperIDs while old rows remain).
    Must be called BEFORE upserting so the window is clean.

    Batches the NOT IN filter to stay within URL length limits.
    """
    if not new_scraper_ids:
        return 0

    from intellitrade_scanners.postgrest import gte, lte, not_in

    CHUNK = 200
    total_deleted = 0

    for i in range(0, len(new_scraper_ids), CHUNK):
        chunk = new_scraper_ids[i : i + CHUNK]
        try:
            deleted_rows = client.delete("economic_events", [
                gte("date_time_utc", start_dt),
                lte("date_time_utc", end_dt),
                not_in("scraperID", chunk),
            ])
            total_deleted += len(deleted_rows)
        except Exception as exc:
            logger.warning("Prune chunk %d failed (non-fatal): %s", i // CHUNK + 1, exc)

    if total_deleted:
        logger.info("Pruned %d stale row(s) from [%s … %s]", total_deleted, start_dt[:10], end_dt[:10])
    return total_deleted


def upload_events(events: list[dict], supabase_url: str, service_role_key: str) -> int:
    """Prune stale rows then upsert events. Returns count upserted."""
    try:
        from intellitrade_scanners.postgrest import Postgrest
    except ImportError:
        logger.error('PostgREST client not importable. Run from an installed checkout: pip install ".[scraper]"')
        sys.exit(1)

    client = Postgrest(supabase_url, service_role_key)

    if not events:
        logger.info("No events to upload.")
        return 0

    # Prepare rows
    rows = []
    for ev in events:
        extras = ev.get("extras") or {}
        announcement_time = extras.get("announcement_time_local") or extras.get("release_time_local")
        row = {
            "scraperID": ev["id"],
            "source": ev.get("source", ""),
            "agency": ev.get("agency", ""),
            "country": ev.get("country", ""),
            "title": ev.get("title", ""),
            "date_time_utc": ev["date_time_utc"],
            "event_local_tz": ev.get("event_local_tz", "UTC"),
            "impact": ev.get("impact", "Low"),
            "url": ev.get("url", ""),
            "announcement_time_local": announcement_time,
            "extras": extras,
            "default_dashboard": ev.get("default_dashboard", False),
            "event_group_key": ev.get("event_group_key"),
            "event_group_title": ev.get("event_group_title"),
            "event_group_type": ev.get("event_group_type"),
            "event_group_priority": ev.get("event_group_priority"),
            "trader_relevance_score": ev.get("trader_relevance_score"),
            "asset_focus": ev.get("asset_focus") or [],
            "source_reliability": extras.get("source_reliability"),
            "time_confidence": extras.get("time_confidence"),
            "source_url": ev.get("source_url") or extras.get("source_url_standardized"),
            "source_name": ev.get("source_name"),
            "lkg_used": ev.get("lkg_used"),
            "curated_fallback_reviewed_at": ev.get("curated_fallback_reviewed_at"),
            "curated_fallback_age_days": ev.get("curated_fallback_age_days"),
            "curated_fallback_max_age_days": ev.get("curated_fallback_max_age_days"),
            "post_release_status": extras.get("post_release_status"),
            "schedule_confidence": extras.get("schedule_confidence"),
            "bls_selected_source_path": extras.get("bls_selected_source_path"),
        }
        rows.append(row)

    # ── Prune stale rows before upserting ─────────────────────────────────────
    # When scraper fixes a timestamp (e.g. Eurostat UTC offset), the scraperID
    # (SHA-1 of country|agency|title|date_time_utc) changes.  The old row stays
    # in DB unless explicitly deleted.  Prune rows whose scraperID is not in the
    # new batch within the same date window.
    timestamps = [ev["date_time_utc"] for ev in events]
    start_dt = min(timestamps)
    end_dt = max(timestamps)
    new_ids = [ev["id"] for ev in events]
    prune_stale_events(client, new_ids, start_dt, end_dt)

    # ── Upsert in batches ─────────────────────────────────────────────────────
    batch_size = 200
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.upsert("economic_events", batch, on_conflict="scraperID")
        total_upserted += len(batch)
        logger.info("Upserted batch %d-%d (%d rows)", i + 1, i + len(batch), len(batch))

    return total_upserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Economic Calendar → Supabase upload")
    parser.add_argument("--since", type=int, default=-1)
    parser.add_argument("--until", type=int, default=14)
    parser.add_argument("--central-banks", action="store_true", default=True)
    parser.add_argument("--global", dest="include_global", action="store_true", default=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not args.dry_run:
        if not supabase_url:
            logger.error("SUPABASE_URL required")
            sys.exit(1)
        if not service_role_key:
            logger.error("SUPABASE_SERVICE_ROLE_KEY required")
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
            allow_persist=False,
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
