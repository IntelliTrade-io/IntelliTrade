"""EXEMPLAR per-source fixture test (plan 6.8) — replicate this pattern per source.

The pattern:
  1. A captured/synthesized fixture file under tests/fixtures/ (note its origin).
  2. FixtureSession stands in for requests.Session and routes URLs to canned
     responses — the fetcher's real retry/parse stack runs, network never touched.
  3. The lkg_off fixture pins run state so LKG persistence stays inert.
  4. Assert the Event contract: ids (make_id inputs), agency/tz, window filtering,
     impact via classify_event, and the fallback ladder (primary -> fallback -> []).

Fixture origin: synthesized in the shape of Eurostat's release-calendar ICS/JSON
feeds (structure per sources/eurostat.py expectations), 2026-07-06.
"""

import json
from datetime import datetime
from pathlib import Path

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.eurostat import fetch_eurostat_events
from economic_calendar.timeutils import UTC

FIXTURES = Path(__file__).parent / "fixtures"

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)


def _response(content: bytes, status: int = 200) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status
    resp._content = content
    return resp


class FixtureSession:
    """requests.Session stand-in: routes by URL substring, records calls.

    Unmatched URLs raise ConnectionError so the fetcher walks its real
    fallback ladder exactly as it would on a network failure.
    """

    def __init__(self, routes: dict[str, requests.Response]):
        self.routes = routes
        self.calls: list[str] = []

    def get(self, url: str, **kwargs) -> requests.Response:
        self.calls.append(url)
        for needle, resp in self.routes.items():
            if needle in url:
                return resp
        raise requests.ConnectionError(f"no fixture route for {url}")


@pytest.fixture
def lkg_off(monkeypatch):
    """Keep LKG persistence inert and retry backoff instant for fetcher tests."""
    monkeypatch.setattr(runstate, "CURRENT_CACHE_MANAGER", None)
    monkeypatch.setitem(runstate.RUN_CONTEXT, "allow_persist", False)
    monkeypatch.setattr("economic_calendar.http.time.sleep", lambda *_: None)


class TestIcsPath:
    def test_parses_events_and_filters_window(self, lkg_off):
        session = FixtureSession({
            ".ics": _response((FIXTURES / "eurostat_calendar.ics").read_bytes()),
        })
        events = fetch_eurostat_events(session, WINDOW_START, WINDOW_END)

        assert [e.title for e in events] == [
            "GDP and main aggregates - flash estimate",
            "Unemployment - monthly data",
        ]  # third fixture event is outside the window
        gdp = events[0]
        assert gdp.agency == "EUROSTAT"
        assert gdp.country == "EU"
        assert gdp.event_local_tz == "Europe/Luxembourg"
        assert gdp.impact == "High"  # classify_event: "gdp"
        # 11:00 Europe/Luxembourg (CEST, +2) -> 09:00 UTC
        assert gdp.date_time_utc == datetime(2026, 7, 10, 9, 0, tzinfo=UTC)
        assert gdp.extras["release_time_local"] == "11:00"
        assert len(gdp.id) == 40  # sha1 via make_id


class TestJsonFallback:
    def test_json_used_when_ics_fails(self, lkg_off):
        payload = [
            {"start": "2026-07-10T11:00:00+02:00", "title": "GDP and main aggregates", "theme": "economy", "period": "2026Q2"},
            {"start": "", "title": "no start, skipped"},
        ]
        session = FixtureSession({
            "eventsJson": _response(json.dumps(payload).encode()),
        })
        events = fetch_eurostat_events(session, WINDOW_START, WINDOW_END)

        assert len(events) == 1
        ev = events[0]
        assert ev.source == "EUROSTAT_JSON"
        assert ev.extras["period"] == "2026Q2"
        assert ev.date_time_utc == datetime(2026, 7, 10, 9, 0, tzinfo=UTC)


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_eurostat_events(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
