"""Per-source test for the S&P Global PMI fetcher (plan 6.8).

``fetch_pmi_spglobal_events`` performs no network I/O (``del session``): it is a
pure config-driven estimator. The three PMI config JSONs (PMI_FEEDS_CATALOG,
PMI_ESTIMATOR_RULES, PMI_OVERRIDES) are *not shipped in this package* — so the
production code path resolves nothing and returns ``[]`` (source log path
"none", zero_reason "config_missing"). ``TestConfigAbsent`` pins that actual,
observed behavior.

``TestConfigPresent`` mirrors the tmp-config approach used by ``test_pmi.py`` to
prove the deterministic estimator wiring inside the source module (not just
``pmi.py``): it points ``_CONFIG_BASE`` at a tmp dir with a minimal valid config
set and asserts the exact Event contract, including the override path.

Window: July 2026 (America/New_York is EDT, UTC-4).
"""

import json
from datetime import datetime

import pytest

from economic_calendar import pmi
from economic_calendar.sources.pmi_spglobal import fetch_pmi_spglobal_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)


@pytest.fixture
def pmi_caches_reset(monkeypatch):
    """Blank the module-level lazy caches so each test loads config fresh."""
    for name in ("_PMI_FEEDS", "_PMI_RULE_ENTRIES", "_PMI_RULES", "_PMI_SERIES",
                 "_PMI_OVERRIDES", "_PMI_PRIMARY_FEED_URL", "_PMI_CONFIG_HASH"):
        monkeypatch.setattr(pmi, name, None)
    monkeypatch.setattr(pmi, "_PMI_CONFIG_PATHS", {})


class TestConfigAbsent:
    """The PMI config JSONs are absent from the repo -> deterministic empty."""

    def test_missing_config_returns_empty_without_crashing(self, tmp_path, pmi_caches_reset, monkeypatch):
        # Point config resolution at an empty dir so no JSON is found — the same
        # outcome as the shipped package, made explicit and hermetic.
        monkeypatch.setattr(pmi, "_CONFIG_BASE", tmp_path)
        assert fetch_pmi_spglobal_events(None, WINDOW_START, WINDOW_END) == []


@pytest.fixture
def config_dir(tmp_path, pmi_caches_reset, monkeypatch):
    """Point config resolution at a tmp dir with a minimal valid config set."""
    (tmp_path / "PMI_FEEDS_CATALOG.json").write_text(json.dumps([
        {"url": "https://feeds.example/pmi.rss", "has_future_dates": True},
    ]), encoding="utf-8")
    (tmp_path / "PMI_ESTIMATOR_RULES.json").write_text(json.dumps([
        {
            "series_id": "us_manufacturing_final",
            "label": "US Manufacturing PMI",
            "country": "US",
            "classification": "final",
            "timezone": "America/New_York",
            "default_time_local": "09:45",
            "rule": {"type": "BUSINESS_DAY_OFFSET", "anchor": "MONTH_START", "offset_business_days": 0},
        },
    ]), encoding="utf-8")
    (tmp_path / "PMI_OVERRIDES.json").write_text(json.dumps({
        "us_manufacturing_final": {
            "2026-07": {"override_date_local": "2026-07-02", "override_time_local": "10:00", "reason": "holiday shift"},
        },
    }), encoding="utf-8")
    monkeypatch.setattr(pmi, "_CONFIG_BASE", tmp_path)
    return tmp_path


class TestConfigPresent:
    def test_estimator_emits_event_with_override(self, config_dir):
        events = fetch_pmi_spglobal_events(None, WINDOW_START, WINDOW_END)

        assert len(events) == 1
        ev = events[0]
        assert ev.title == "US Manufacturing PMI"
        assert ev.source == "SPGLOBAL_PMI"
        assert ev.agency == "SPGLOBAL"
        assert ev.country == "US"
        assert ev.event_local_tz == "America/New_York"
        assert ev.impact == "High"  # US Manufacturing -> major-country High
        # override 2026-07-02 10:00 America/New_York (EDT, -4) -> 14:00 UTC
        assert ev.date_time_utc == datetime(2026, 7, 2, 14, 0, tzinfo=UTC)
        assert ev.extras["discovered_via"] == "rules+override"
        assert ev.extras["time_confidence"] == "override"
        assert ev.extras["override_reason"] == "holiday shift"
        assert ev.extras["pmi_override"] is True
        assert len(ev.id) == 40  # sha1 via make_id

    def test_empty_window_returns_empty(self, config_dir):
        # A mid-month window with no rule date (rule fires on the 1st business
        # day; the override lands on the 2nd — both before the 10th).
        start = datetime(2026, 7, 10, tzinfo=UTC)
        end = datetime(2026, 7, 20, tzinfo=UTC)
        assert fetch_pmi_spglobal_events(None, start, end) == []
