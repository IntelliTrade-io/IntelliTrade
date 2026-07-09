"""Per-source fixture test for FOMC (plan 6.8) — follows test_source_eurostat.py.

Covers the Fed FOMC fetcher's real path: DOM (primary) parse of the
fomccalendars.htm page (year heading -> month/day blocks), window filtering, the
Event contract, and the fallback ladder (DOM -> curated -> LKG -> []). The
curated safety net only holds a 2025-12-10 meeting, so a 2026-07 window with all
transports down cleanly returns []. The fetcher's own retry/parse stack runs; the
network is never touched (FixtureSession routes URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the Federal Reserve
fomccalendars.htm page (structure per sources/fomc.py: "20YY FOMC Meetings"
heading + "Month  day1-day2" rows) — no live capture, same approach as the
eurostat exemplar.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.fomc import fetch_fed_fomc_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# One in-window two-day meeting (28-29 July 2026 -> Day-2 decision) plus a
# January meeting that must be filtered out.
FOMC_HTML = b"""<html><body>
<h4>2026 FOMC Meetings</h4>
<table><tbody>
  <tr><td>January</td><td>27-28</td></tr>
  <tr><td>July</td><td>28-29</td></tr>
</tbody></table>
</body></html>"""


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


class TestDomPath:
    def test_parses_events_and_filters_window(self, lkg_off):
        session = FixtureSession({"fomccalendars": _response(FOMC_HTML)})
        events = fetch_fed_fomc_events(session, WINDOW_START, WINDOW_END)

        # Only the 28-29 July meeting is in-window (Day-2 decision). The January
        # meeting is dropped.
        assert len(events) == 1
        ev = events[0]
        assert ev.title == "FOMC Meeting"
        assert ev.source == "FED_HTML_CALENDAR"
        assert ev.agency == "FED"
        assert ev.country == "US"
        assert ev.event_local_tz == "America/New_York"
        assert ev.impact == "High"  # classify_event: "fomc"
        assert ev.extras["decision_day"] == 2
        assert ev.extras["meeting_span_local"] == "July 28-29"
        # 14:00 America/New_York (EDT, -4) -> 18:00 UTC on the decision day.
        assert ev.date_time_utc == datetime(2026, 7, 29, 18, 0, tzinfo=UTC)
        assert len(ev.id) == 40  # sha1 via make_id

    def test_out_of_window_only_returns_empty(self, lkg_off):
        # A page whose only meeting is outside the window (and the curated
        # 2025-12-10 net is also outside) drives the DOM->curated->[] ladder.
        html = b"""<html><body>
<h4>2026 FOMC Meetings</h4>
<table><tbody><tr><td>January</td><td>27-28</td></tr></tbody></table>
</body></html>"""
        session = FixtureSession({"fomccalendars": _response(html)})
        events = fetch_fed_fomc_events(session, WINDOW_START, WINDOW_END)
        assert events == []


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        # Network down + curated net (2025-12-10) outside the 2026-07 window.
        events = fetch_fed_fomc_events(
            FixtureSession({}), WINDOW_START, WINDOW_END
        )
        assert events == []
