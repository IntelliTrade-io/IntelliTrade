# coding: utf-8
r"""
CSM Review pipeline runner (VPS, Windows Task Scheduler at :20 every 4h).

    python -m intellitrade_scanners.review.runner [--stage NAME] [--backfill-candles N]

Default: run all stages in order (ingest -> candles -> detect -> evaluate ->
publish -> aggregate). Each stage logs a csm_review_job_runs row, isolates
per-item errors, and a stage failure yields a nonzero exit. The feed is resolved
from ACTIVE_FEED_NAME (the same env the scanner uses) and never hardcoded.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler

from intellitrade_scanners import config

config.load_env()

from intellitrade_scanners.review import (  # noqa: E402  (after load_env, package convention)
    aggregator,
    audit,
    candles,
    db,
    detector,
    evaluator,
    ingest,
    publisher,
)

LOG_DIR = config.log_dir()

STAGES = ("ingest", "candles", "detect", "evaluate", "publish", "aggregate")


def setup_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s")
    fh = TimedRotatingFileHandler(
        os.path.join(LOG_DIR, "review_runner.log"),
        when="midnight", backupCount=30, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logging.basicConfig(level=logging.INFO, handlers=[fh, sh])


def _feed_name() -> str:
    feed = os.environ.get("ACTIVE_FEED_NAME")
    if not feed:
        raise RuntimeError("ACTIVE_FEED_NAME must be set (same env the scanner uses)")
    return feed


def _run_stage(name: str, feed: str, backfill: int, log: logging.Logger) -> None:
    with db.job_run(name) as state:
        if name == "ingest":
            summary = ingest.run(feed)
        elif name == "candles":
            summary = candles.run(feed, bars=backfill)
        elif name == "detect":
            summary = detector.run(feed)
        elif name == "evaluate":
            summary = evaluator.run(feed)
        elif name == "publish":
            summary = publisher.run(feed)
        elif name == "aggregate":
            summary = aggregator.run(feed)
        else:
            raise ValueError(f"unknown stage: {name}")
        state["detail"] = summary
        state["items_processed"] = int(summary.get("processed", summary.get("evaluated", 0)) or 0)
        log.info("stage %s: %s", name, summary)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CSM review pipeline runner")
    parser.add_argument("--stage", choices=STAGES, help="run a single stage")
    parser.add_argument("--backfill-candles", type=int, default=200,
                        help="H4 bars to fetch per pair in the candles stage")
    parser.add_argument("--audit", action="store_true", help="print the audit report and exit")
    args = parser.parse_args(argv)

    setup_logging()
    log = logging.getLogger("review_runner")

    if args.audit:
        audit.run()
        return 0

    feed = _feed_name()
    stages = [args.stage] if args.stage else list(STAGES)
    failures = 0
    for name in stages:
        try:
            _run_stage(name, feed, args.backfill_candles, log)
        except Exception as exc:  # noqa: BLE001 - record + continue, exit nonzero
            log.error("stage %s FAILED: %s", name, exc)
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
