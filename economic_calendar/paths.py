"""Filesystem anchors for scraper outputs.

Historically anchored to scripts/ via the monolith's __file__; the shim pins
them with set_project_dir() at import. Read via attribute access (paths.OUT_DIR)
so the pin is visible everywhere. Full env parameterization is plan 6.6.
"""

from __future__ import annotations

from pathlib import Path

PROJECT_DIR: Path = Path(__file__).resolve().parent
OUT_DIR: Path = PROJECT_DIR / "out"
PRODUCTION_DIR: Path = OUT_DIR / "production"
STAGING_DIR: Path = OUT_DIR / "staging"


def set_project_dir(project_dir: Path) -> None:
    global PROJECT_DIR, OUT_DIR, PRODUCTION_DIR, STAGING_DIR
    PROJECT_DIR = Path(project_dir)
    OUT_DIR = PROJECT_DIR / "out"
    PRODUCTION_DIR = OUT_DIR / "production"
    STAGING_DIR = OUT_DIR / "staging"
