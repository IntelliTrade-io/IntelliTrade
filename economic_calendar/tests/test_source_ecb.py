"""Per-source fixture test for ECB (plan 6.8) — follows test_source_eurostat.py.

Covers the ECB Governing Council fetcher's real path: DOM (primary) parse of the
release-calendar HTML, window filtering, the Day-1/Day-2 + press-conference event
fan-out, and the fallback ladder (DOM -> all-transports-down -> []). The fetcher's
own retry/parse stack runs; the network is never touched (FixtureSession routes
URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the ECB Governing Council
calendar page (structure per sources/ecb.py selectors: .ecb-basicList inside
#content) — no live capture, same approach as the eurostat exemplar.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.ecb import fetch_ecb_governing_council_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# One two-day monetary-policy meeting inside the window (10-11 July 2026, with a
# press conference -> Day-2 decision + press conference), one non-monetary Day-1
# meeting, and one August meeting that must be filtered out.
ECB_HTML = b"""<html><body><div id="content">
<ul class="ecb-basicList">
  <li>10-11 July 2026: Monetary policy meeting of the Governing Council, followed by a press conference</li>
  <li>3 September 2026: Non-monetary policy meeting of the Governing Council</li>
  <li>20-21 August 2026: Monetary policy meeting of the Governing Council, followed by a press conference</li>
</ul>
</div></body></html>"""


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
        session = FixtureSession({"mgcgc": _response(ECB_HTML)})
        events = fetch_ecb_governing_council_events(session, WINDOW_START, WINDOW_END)

        # Only the 10-11 July meeting is in-window; it fans out to Day-1 +
        # Day-2 decision + press conference. September/August are dropped.
        assert [e.title for e in events] == [
            "ECB Non-Monetary Policy Meeting",
            "ECB Monetary Policy Decision",
            "ECB Press Conference",
        ]

        day1, decision, press = events
        for e in events:
            assert e.agency == "ECB"
            assert e.country == "EU"
            assert e.event_local_tz == "Europe/Berlin"
            assert e.source == "ECB_HTML"
            assert len(e.id) == 40  # sha1 via make_id

        # Day-1 non-monetary meeting: Low impact, generic 14:30 Europe/Berlin
        # (CEST, +2) -> 12:30 UTC.
        assert day1.impact == "Low"
        assert day1.extras["day_index"] == 1
        assert day1.date_time_utc == datetime(2026, 7, 10, 12, 30, tzinfo=UTC)

        # Day-2 decision: High, forced 13:45 Europe/Berlin (CEST, +2) -> 11:45 UTC.
        assert decision.impact == "High"
        assert decision.extras["day_index"] == 2
        assert decision.date_time_utc == datetime(2026, 7, 11, 11, 45, tzinfo=UTC)

        # Press conference: High, 14:30 Europe/Berlin (CEST, +2) -> 12:30 UTC.
        assert press.impact == "High"
        assert press.date_time_utc == datetime(2026, 7, 11, 12, 30, tzinfo=UTC)

    def test_events_sorted_by_utc(self, lkg_off):
        session = FixtureSession({"mgcgc": _response(ECB_HTML)})
        events = fetch_ecb_governing_council_events(session, WINDOW_START, WINDOW_END)
        stamps = [e.date_time_utc for e in events]
        assert stamps == sorted(stamps)


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_ecb_governing_council_events(
            FixtureSession({}), WINDOW_START, WINDOW_END
        )
        assert events == []
