"""Smoke: every extracted source module imports and exposes its fetcher.

Behavioral coverage for fetchers is fixture-based work tracked in plan 6.8;
these pin the module/callable contract the orchestrator relies on.
"""

import importlib

import pytest

SOURCES = {
    "boe": "fetch_boe_events",
    "boc": "fetch_boc_events",
    "rba": "fetch_rba_events",
    "rbnz": "fetch_rbnz_events",
    "fomc": "fetch_fed_fomc_events",
    "ecb": "fetch_ecb_governing_council_events",
    "boj": "fetch_boj_mpm_events",
    "snb": "fetch_snb_events",
}


@pytest.mark.parametrize("module_name,fetcher", sorted(SOURCES.items()))
def test_module_exposes_fetcher(module_name, fetcher):
    module = importlib.import_module(f"economic_calendar.sources.{module_name}")
    assert callable(getattr(module, fetcher))
