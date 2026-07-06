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
    "esri": "fetch_japan_esri_events",
    "seco": "fetch_switzerland_seco_events",
    "bfs": "fetch_bfs_events",
    "ons": "fetch_ons_events_enhanced",
    "bls": "fetch_bls_events",
    "ism": "fetch_ism_events",
    "us_curated": "fetch_bea_events",
    "pmi_spglobal": "fetch_pmi_spglobal_events",
    "abs": "fetch_abs_events",
    "statcan": "fetch_statcan_events",
    "eurostat": "fetch_eurostat_events",
    "statsnz": "fetch_stats_nz_events",
    "nbs": "fetch_china_nbs_events",
}


@pytest.mark.parametrize("module_name,fetcher", sorted(SOURCES.items()))
def test_module_exposes_fetcher(module_name, fetcher):
    module = importlib.import_module(f"economic_calendar.sources.{module_name}")
    assert callable(getattr(module, fetcher))
