"""Per-source test for the ISM fetcher (plan 6.8).

``fetch_ism_events`` tries the ISM public calendar via ``source_sget``; when that
returns no usable response it falls back to a *deterministic release-rule* path
(``_build_rule_events``): Manufacturing PMI on the 1st business day and Services
PMI on the 3rd business day of each month, both 10:00 America/New_York.

This test never touches the network. A ``FixtureSession`` whose ``get`` always
raises makes ``source_sget`` return ``(None, "none")`` — exactly as a real
network outage would — so the fetcher walks its rules path. That path is
config-free and deterministic, so we assert its exact output. The ``lkg_off``
fixture pins run state inert and makes retry backoff instant.

Window: July 2026 (America/New_York is EDT, UTC-4).
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.ism import fetch_ism_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# A one-hour Monday-noon window: no 1st/3rd business day 10:00 release inside it.
EMPTY_START = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)
EMPTY_END = datetime(2026, 7, 6, 13, 0, tzinfo=UTC)


class FixtureSession:
    """requests.Session stand-in whose every GET fails.

    Forces source_sget to return (None, "none"), driving fetch_ism_events onto
    its deterministic rules fallback exactly as a network outage would. No
    ``cache_manager`` attribute, so LKG persistence stays inert.
    """

    def __init__(self):
        self.calls: list[str] = []

    def get(self, url: str, **kwargs) -> requests.Response:
        self.calls.append(url)
        raise requests.ConnectionError(f"no fixture route for {url}")


@pytest.fixture
def lkg_off(monkeypatch):
    """Keep LKG persistence inert and retry backoff instant."""
    monkeypatch.setattr(runstate, "CURRENT_CACHE_MANAGER", None)
    monkeypatch.setitem(runstate.RUN_CONTEXT, "allow_persist", False)
    monkeypatch.setattr("economic_calendar.http.time.sleep", lambda *_: None)


class TestRulesFallback:
    def test_release_rules_when_calendar_unreachable(self, lkg_off):
        events = fetch_ism_events(FixtureSession(), WINDOW_START, WINDOW_END)

        assert [e.title for e in events] == [
            "ISM Manufacturing PMI (July 2026)",  # 1st business day = Wed Jul 1
            "ISM Services PMI (July 2026)",       # 3rd business day = Fri Jul 3
        ]

        manuf = events[0]
        assert manuf.source == "ISM_RULES"
        assert manuf.agency == "ISM"
        assert manuf.country == "US"
        assert manuf.event_local_tz == "America/New_York"
        assert manuf.impact == "High"  # ISM releases are hard-coded High
        # 10:00 America/New_York (EDT, -4) -> 14:00 UTC
        assert manuf.date_time_utc == datetime(2026, 7, 1, 14, 0, tzinfo=UTC)
        assert manuf.extras["release_time_local"] == "10:00"
        assert manuf.extras["discovered_via"] == "ism_release_rules"
        assert manuf.extras["series"] == "manufacturing_pmi"
        assert len(manuf.id) == 40  # sha1 via make_id

        services = events[1]
        assert services.extras["series"] == "services_pmi"
        assert services.date_time_utc == datetime(2026, 7, 3, 14, 0, tzinfo=UTC)


class TestEmpty:
    def test_empty_window_returns_empty(self, lkg_off):
        events = fetch_ism_events(FixtureSession(), EMPTY_START, EMPTY_END)
        assert events == []
