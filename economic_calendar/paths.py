"""Filesystem anchors for scraper outputs.

Historically anchored to scripts/ via the monolith's __file__; the shim pins
them with set_project_dir() at import. Read via attribute access (paths.OUT_DIR)
so the pin is visible everywhere.

Initial PROJECT_DIR resolution (plan 6.6):
  1. ECON_CALENDAR_HOME env var, if set — the parameterized default.
  2. else this package's directory (historical default).
set_project_dir() (called by the scripts shim, the real entry point) still
overrides both when it runs.
"""

from __future__ import annotations

import os
from pathlib import Path

_ENV_HOME = os.environ.get("ECON_CALENDAR_HOME")
PROJECT_DIR: Path = Path(_ENV_HOME) if _ENV_HOME else Path(__file__).resolve().parent
OUT_DIR: Path = PROJECT_DIR / "out"
PRODUCTION_DIR: Path = OUT_DIR / "production"
STAGING_DIR: Path = OUT_DIR / "staging"


def set_project_dir(project_dir: Path) -> None:
    global PROJECT_DIR, OUT_DIR, PRODUCTION_DIR, STAGING_DIR
    PROJECT_DIR = Path(project_dir)
    OUT_DIR = PROJECT_DIR / "out"
    PRODUCTION_DIR = OUT_DIR / "production"
    STAGING_DIR = OUT_DIR / "staging"
