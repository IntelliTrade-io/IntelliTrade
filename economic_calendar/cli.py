"""CLI entry point, runtime-dependency check, and debug diagnostics.

Moved verbatim from the monolith (plan 6.3). Importing this module configures
the econ_calendar_complete logger handler, matching legacy monolith-import
behavior.
"""

from __future__ import annotations

import argparse
import sys
import importlib.util
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests

from economic_calendar import paths as _ec_paths
from economic_calendar import runstate as _ec_runstate
from economic_calendar.events import Event
from economic_calendar.health import (
    _failed_health_payload,
    _save_publish_metadata,
    _write_run_health,
)
from economic_calendar.http import EnhancedCacheManager, build_session
from economic_calendar.runstate import RUN_CONTEXT, RUN_OVERRIDES
from economic_calendar.timeutils import _now_utc
from economic_calendar.sources.bls import (
    run_bls_debug_diagnostics,
)

logger = logging.getLogger("econ_calendar_complete")
from economic_calendar.collect import run
from economic_calendar.events import _event_from_dict
from economic_calendar.orchestrator import _assert_unique_fetchers
from economic_calendar.export import _write_production_artifacts, _write_requested_artifacts, _write_staging_artifacts
from economic_calendar.speakers import (
    _central_bank_speaker_sources,
    _parse_central_bank_speaker_html,
    _request_central_bank_speaker_source,
    _speaker_response_classification,
)

handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(handler)
logger.setLevel(logging.INFO)

REQUIRED_RUNTIME_DEPENDENCIES = {
    "beautifulsoup4": "bs4",
    "soupsieve": "soupsieve",
    "lxml": "lxml",
    "requests": "requests",
    "python-dateutil": "dateutil",
    "feedparser": "feedparser",
}


def _missing_runtime_dependencies() -> List[str]:
    missing: List[str] = []
    for package_name, module_name in REQUIRED_RUNTIME_DEPENDENCIES.items():
        if importlib.util.find_spec(module_name) is None:
            missing.append(package_name)
    return sorted(missing)


def run_central_bank_speaker_debug_diagnostics(
    session: requests.Session,
    start_utc: datetime,
    end_utc: datetime,
    *,
    out_dir: Path = _ec_paths.OUT_DIR,
) -> Tuple[Path, Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for source in _central_bank_speaker_sources(start_utc, end_utc):
        response = _request_central_bank_speaker_source(session, source["url"])
        status = int(getattr(response, "status_code", 0) or 0) if response is not None else 0
        content = bytes(getattr(response, "content", b"") or b"") if response is not None else b""
        content_type = str((getattr(response, "headers", {}) or {}).get("Content-Type") or "")
        final_url = str(getattr(response, "url", "") or source["url"]) if response is not None else source["url"]
        parser_error = ""
        parsed: List[Event] = []
        if response is not None and 200 <= status < 300:
            try:
                parsed = _parse_central_bank_speaker_html(
                    source["institution"],
                    response.text or "",
                    final_url,
                    source["source_path"],
                    start_utc,
                    end_utc,
                )
            except Exception as exc:
                parser_error = str(exc)
        row = {
            **source,
            "http_status": status,
            "final_url": final_url,
            "content_type": content_type,
            "response_size_bytes": len(content),
            "classification": _speaker_response_classification(content, content_type, status),
            "parser_count": len(parsed),
            "parsed_speaker_names": sorted({str((event.extras or {}).get("speaker_name") or "") for event in parsed if (event.extras or {}).get("speaker_name")}),
            "parsed_event_dates": [event.date_time_utc.isoformat() for event in parsed],
            "parser_error": parser_error,
        }
        rows.append(row)
        print(
            "SPEAKER_DEBUG: "
            f"{row['institution']} path={row['source_path']} status={row['http_status']} "
            f"classification={row['classification']} parser_count={row['parser_count']} url={row['url']}"
        )
    payload = {
        "generated_at_utc": _now_utc().isoformat(),
        "window": {"start_utc": start_utc.isoformat(), "end_utc": end_utc.isoformat()},
        "sources": rows,
    }
    diagnostics_dir = Path(out_dir) / "diagnostics"
    diagnostics_dir.mkdir(parents=True, exist_ok=True)
    path = diagnostics_dir / f"speakers_debug_{_now_utc().strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"SPEAKER_DEBUG_WRITTEN: {path}")
    return path, payload

# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------

# Complete Central Bank Scrapers (Fed, ECB, BoE, BoC, RBA, RBNZ)


def main() -> None:

    parser = argparse.ArgumentParser(description="Economic Calendar Scraper - Complete Final Production")

    parser.add_argument("--since", type=int, default=0, help="Days from today to start collecting events (default: 0)")

    parser.add_argument("--until", type=int, default=30, help="Days from today to stop collecting events (default: 30)")

    parser.add_argument(

        "--central-banks",

        action="store_true",

        help="Include complete central bank monetary policy schedules (Fed, ECB, BoE, BoC, RBA, RBNZ)",

    )

    parser.add_argument(

        "--global",

        action="store_true",

        dest="include_global",

        help="Include global expansion sources (Japan, China, Switzerland)",

    )

    parser.add_argument("--out", type=str, default=None, help="Output file path (JSON)")

    parser.add_argument("--jsonl", type=str, default=None, help="Output file path (JSONL)")

    parser.add_argument(
        "--csv",
        dest="csv",
        metavar="CSV_PATH",
        help="Optional path to write a CSV snapshot of all events in the window.",
    )

    parser.add_argument("--health", action="store_true", help="Show health report")
    parser.add_argument(
        "--selfcheck",
        action="store_true",
        help="Run fetcher consistency checks without scraping",
    )
    parser.add_argument(
        "--debug-zero",
        action="store_true",
        help="Capture zero-event snapshots for audit (writes failures/zero/*.txt)",
    )
    parser.add_argument(
        "--debug-bls",
        action="store_true",
        help="Run BLS-only transport/parser diagnostics and exit without scraping or publishing",
    )
    parser.add_argument(
        "--debug-speakers",
        action="store_true",
        help="Run central-bank speaker source diagnostics and exit without scraping or publishing",
    )
    parser.add_argument(
        "--strict-zero",
        action="store_true",
        help="Fail (exit code 3) if critical sources like FED/ECB return zero events",
    )

    parser.add_argument("--cache-dir", type=str, default="cache", help="Cache directory")

    parser.add_argument("--snapshots-dir", type=str, default="failures", help="Failure snapshots directory")
    parser.add_argument(
        "--grace-window-mins",
        type=int,
        default=40,
        help="Window in minutes around expected publish time to trigger a grace retry",
    )
    parser.add_argument(
        "--grace-interval-secs",
        type=int,
        default=600,
        help="Seconds to wait before performing the grace retry (default: 600)",
    )

    args = parser.parse_args()

    _ec_runstate.DEBUG_ZERO_FLAG = bool(args.debug_zero)
    _ec_runstate.STRICT_ZERO_FLAG = bool(args.strict_zero)

    if args.debug_bls:
        cache_manager = EnhancedCacheManager(args.cache_dir, args.snapshots_dir)
        session = build_session(cache_manager)
        now_utc = _now_utc()
        start_utc = now_utc + timedelta(days=args.since)
        end_utc = now_utc + timedelta(days=args.until)
        try:
            run_bls_debug_diagnostics(session, start_utc, end_utc, out_dir=_ec_paths.OUT_DIR)
        finally:
            try:
                session.close()
            except Exception:
                pass
        return

    if args.debug_speakers:
        cache_manager = EnhancedCacheManager(args.cache_dir, args.snapshots_dir)
        session = build_session(cache_manager)
        now_utc = _now_utc()
        start_utc = now_utc + timedelta(days=args.since)
        end_utc = now_utc + timedelta(days=args.until)
        try:
            run_central_bank_speaker_debug_diagnostics(session, start_utc, end_utc, out_dir=_ec_paths.OUT_DIR)
        finally:
            try:
                session.close()
            except Exception:
                pass
        return

    missing_dependencies = _missing_runtime_dependencies()
    if missing_dependencies:
        install_cmd = 'python -m pip install ".[scraper]"  # from the repo root (deps in pyproject.toml)'
        logger.error("DEPENDENCY_MISSING: %s", ", ".join(missing_dependencies))
        logger.error("DEPENDENCY_INSTALL: %s", install_cmd)
        health_payload = _failed_health_payload(
            "missing runtime dependencies",
            missing_packages=missing_dependencies,
        )
        _write_run_health(health_payload)
        logger.error("EXPORT_SKIPPED: missing required dependencies")
        logger.error("PRODUCTION_NOT_PROMOTED: missing required dependencies")
        sys.exit(2)

    if args.selfcheck:
        _assert_unique_fetchers()
        print("SELF-CHECK OK")
        return

    _assert_unique_fetchers()

    logger.info("=== Economic Calendar Scraper - Complete Final Production ===")

    logger.info(f"Date range: {args.since} to {args.until} days from today")

    logger.info(f"Include central banks: {args.central_banks}")

    logger.info(f"Include global expansion: {args.include_global}")

    # Initialize cache settings for run()
    RUN_OVERRIDES["cache_dir"] = args.cache_dir
    RUN_OVERRIDES["snapshots_dir"] = args.snapshots_dir
    RUN_OVERRIDES["debug_zero_flag"] = _ec_runstate.DEBUG_ZERO_FLAG
    RUN_OVERRIDES["strict_zero_flag"] = _ec_runstate.STRICT_ZERO_FLAG
    try:
        event_dicts = run(
            since_days=args.since,
            until_days=args.until,
            include_global=args.include_global,
            include_central_banks=args.central_banks,
            sources=None,
            allow_persist=True,
            grace_window_mins=args.grace_window_mins,
            grace_interval_secs=args.grace_interval_secs,
        )
    finally:
        RUN_OVERRIDES.pop("cache_dir", None)
        RUN_OVERRIDES.pop("snapshots_dir", None)
        RUN_OVERRIDES.pop("debug_zero_flag", None)
        RUN_OVERRIDES.pop("strict_zero_flag", None)

    events = [_event_from_dict(item) for item in event_dicts]

    health_payload = dict(RUN_CONTEXT.get("health_payload") or {})
    if not health_payload:
        health_payload = _failed_health_payload("internal health payload missing")

    staging_written = _write_staging_artifacts(events)
    health_payload["staging_export_written"] = bool(staging_written)

    strict_failures = sorted(RUN_CONTEXT.get("strict_zero_failures") or [])
    status = str(health_payload.get("status") or "failed").lower()
    publish_allowed = bool(health_payload.get("publish_allowed")) and not strict_failures and status == "healthy"

    if publish_allowed:
        requested_written = _write_requested_artifacts(args, events)
        production_written = _write_production_artifacts(events)
        publish_meta = _save_publish_metadata(_now_utc(), _ec_paths.PRODUCTION_DIR / "calendar.json")
        health_payload["export_written"] = bool(requested_written or production_written)
        health_payload["requested_export_written"] = bool(requested_written)
        health_payload["production_export_written"] = bool(production_written)
        health_payload["production_promoted"] = True
        health_payload["publish_allowed"] = True
        health_payload.update(publish_meta)
        RUN_CONTEXT["health_payload"] = health_payload
        _write_run_health(health_payload)
        logger.info("PRODUCTION_PROMOTED: %s", _ec_paths.PRODUCTION_DIR / "calendar.json")
    else:
        if strict_failures:
            skip_reason = "strict validation failed: " + ", ".join(strict_failures)
        else:
            reasons = health_payload.get("failure_reasons") or ["health validation failed"]
            skip_reason = "health validation failed: " + "; ".join(str(reason) for reason in reasons)
        health_payload["export_written"] = False
        health_payload["requested_export_written"] = False
        health_payload["production_export_written"] = False
        health_payload["production_promoted"] = False
        health_payload["publish_allowed"] = False
        summary = dict(health_payload.get("summary") or {})
        if status == "failed" or strict_failures:
            summary["fatal"] = True
            health_payload["status"] = "failed"
        health_payload["summary"] = summary
        RUN_CONTEXT["health_payload"] = health_payload
        _write_run_health(health_payload)
        logger.error("EXPORT_SKIPPED: %s", skip_reason)
        logger.error("PRODUCTION_NOT_PROMOTED: %s", skip_reason)
        if args.strict_zero and strict_failures:
            sys.exit(3)
        sys.exit(2 if health_payload.get("status") == "failed" else 1)

    if args.health:
        print("\n=== HEALTH REPORT ===")
        print(json.dumps(health_payload, indent=2))

    # Console output

    if not args.out and not args.jsonl and not args.csv:

        for ev in events:

            print(

                f"{ev.date_time_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}: {ev.title} "

                f"({ev.agency}/{ev.country}, {ev.impact})"

            )

    # Enhanced CI assertion for complete coverage

    expected_min = 150 if args.central_banks and args.include_global and args.until >= 60 else 100

    if len(events) < expected_min:

        logger.warning(f"Expected >{expected_min} events but got {len(events)} - may indicate scraper issues")

    else:

        logger.info(f"âœ… CI check passed: {len(events)} events >= {expected_min} threshold")
