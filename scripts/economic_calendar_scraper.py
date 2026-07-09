#!/usr/bin/env python3
"""Compatibility shim for the split economic-calendar scraper (plan 6.3).

The implementation lives in the ``economic_calendar`` package; this file keeps
the historical contract: ``from economic_calendar_scraper import run`` (used by
economic_calendar_upload.py / the GitHub workflow) and direct CLI execution.
It also pins all filesystem/config anchors to this script's directory, which is
where out/, cache metadata, and the PMI config JSONs historically live.
"""

from __future__ import annotations

from pathlib import Path

from economic_calendar import health as _health
from economic_calendar import paths as _paths
from economic_calendar import pmi as _pmi

_SCRIPT_DIR = Path(__file__).resolve().parent
_paths.set_project_dir(_SCRIPT_DIR)
_pmi.set_config_base(_SCRIPT_DIR)
_health.set_paths(_paths.OUT_DIR, _paths.PRODUCTION_DIR)

from economic_calendar.cli import main  # noqa: E402  (anchors must be pinned first)
from economic_calendar.collect import collect_events, run  # noqa: E402
from economic_calendar.orchestrator import gather_events  # noqa: E402

__all__ = ["collect_events", "gather_events", "main", "run"]

if __name__ == "__main__":
    main()
