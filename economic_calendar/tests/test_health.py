"""Pin LKG persistence, fetch metadata, and health key/SLO behavior."""

from datetime import timedelta

import pytest

from economic_calendar import runstate
from economic_calendar.events import Event, make_id
from economic_calendar.health import (
    AGENCY_KEY_OVERRIDES,
    SourceHealth,
    _canonical_health_key,
    _get_fetch_metadata,
    _persist_lkg,
    _read_lkg_events,
    _reset_fetch_metadata,
    _set_fetch_metadata,
    _snapshot_fetch_metadata,
    maybe_merge_lkg,
)
from economic_calendar.http import EnhancedCacheManager
from economic_calendar.timeutils import _now_utc


def _event(title="CPI", days_ahead=3):
    dt = _now_utc() + timedelta(days=days_ahead)
    return Event(
        id=make_id("US", "BLS", title, dt),
        source="BLS_ICS",
        agency="BLS",
        country="US",
        title=title,
        date_time_utc=dt,
        event_local_tz="America/New_York",
        impact="High",
        url="https://www.bls.gov/x",
    )


@pytest.fixture
def lkg_env(tmp_path, monkeypatch):
    """Persisting run context with a real cache manager in tmp dirs."""
    cache = EnhancedCacheManager(cache_dir=str(tmp_path / "c"), snapshots_dir=str(tmp_path / "f"))
    monkeypatch.setattr(runstate, "CURRENT_CACHE_MANAGER", cache)
    monkeypatch.setitem(runstate.RUN_CONTEXT, "allow_persist", True)
    runstate.RUN_CONTEXT.pop("serverless", None)
    return cache


class TestSourceHealth:
    def test_scaled_by_window(self):
        # 30-day window returns base SLO
        assert SourceHealth.scaled(-1, 29, "BLS") == SourceHealth.SLO["BLS"]
        # half window scales down, floor 1
        assert SourceHealth.scaled(0, 15, "BLS") == max(1, round(SourceHealth.SLO["BLS"] / 2))
        # unknown source -> 0
        assert SourceHealth.scaled(0, 30, "NOPE") == 0


class TestHealthKeys:
    def test_statscan_alias(self):
        assert AGENCY_KEY_OVERRIDES["STATSCAN"] == "STATCAN"
        assert _canonical_health_key("statscan") == "STATCAN"
        assert _canonical_health_key("BLS") == "BLS"


class TestFetchMetadata:
    def test_set_get_snapshot_reset(self):
        _reset_fetch_metadata()
        _set_fetch_metadata("BLS", path_used="ics", count=5)
        assert _get_fetch_metadata("BLS")["count"] == 5
        snap = _snapshot_fetch_metadata()
        assert snap["BLS"]["path_used"] == "ics"
        _reset_fetch_metadata()
        assert _get_fetch_metadata("BLS") == {}


class TestLkgRoundtrip:
    def test_persist_then_read(self, lkg_env):
        events = [_event("CPI"), _event("PPI")]
        _persist_lkg("BLS", events)
        back = _read_lkg_events("BLS")
        assert {e.id for e in back} == {e.id for e in events}

    def test_merge_returns_lkg_when_live_empty(self, lkg_env):
        events = [_event("CPI")]
        _persist_lkg("ECB", events)
        merged = maybe_merge_lkg("ECB", [], ttl_days=30, tag="lkg")
        assert [e.id for e in merged] == [events[0].id]

    def test_merge_keeps_live_events(self, lkg_env):
        _persist_lkg("ECB", [_event("Old meeting")])
        live = [_event("Fresh meeting")]
        merged = maybe_merge_lkg("ECB", live, ttl_days=30, tag="lkg")
        assert merged == live

    def test_no_persist_when_disallowed(self, lkg_env):
        runstate.RUN_CONTEXT["allow_persist"] = False
        _persist_lkg("RBA", [_event("Rate decision")])
        assert _read_lkg_events("RBA") == []
