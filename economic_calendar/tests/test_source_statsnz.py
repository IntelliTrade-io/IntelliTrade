"""Per-source fixture test for Stats NZ (plan 6.8) — follows test_source_eurostat.py.

Covers the Stats NZ fetcher's real transport ladder: it walks two ICS URLs
(calendar-export -> release-calendar.ics) via source_sget, parsing the first that
returns in-window rows; when every transport is down it returns []. The fetcher's
own retry/circuit-breaker/parse stack runs; the network is never touched
(FixtureSession routes URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the Stats NZ
release-calendar ICS export (structure per sources/statsnz.py -> parse_ics_bytes
with WELLINGTON_TZ) — no live capture, same approach as the eurostat exemplar.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import http as _http
from economic_calendar import runstate
from economic_calendar.sources.statsnz import fetch_stats_nz_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# ICS export: two releases inside the window (CPI -> High, business confidence ->
# Medium) plus one in December that must be filtered out. Explicit 10:45 local
# times pin the Pacific/Auckland conversion; July is NZST (UTC+12, no DST).
STATSNZ_ICS = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Stats NZ//Release Calendar//EN
BEGIN:VEVENT
SUMMARY:Consumers price index (CPI): June 2026 quarter
DTSTART;TZID=Pacific/Auckland:20260716T104500
URL:https://www.stats.govt.nz/information-releases/consumers-price-index-june-2026-quarter
UID:statsnz-cpi-2026q2
END:VEVENT
BEGIN:VEVENT
SUMMARY:Business confidence survey: July 2026
DTSTART;TZID=Pacific/Auckland:20260728T104500
URL:https://www.stats.govt.nz/information-releases/business-confidence-july-2026
UID:statsnz-bc-202607
END:VEVENT
BEGIN:VEVENT
SUMMARY:Overseas merchandise trade: December 2026
DTSTART;TZID=Pacific/Auckland:20261218T104500
URL:https://www.stats.govt.nz/information-releases/overseas-merchandise-trade-december-2026
UID:statsnz-omt-out
END:VEVENT
END:VCALENDAR
"""


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
    """Keep LKG persistence inert, retry backoff instant, breakers fresh."""
    monkeypatch.setattr(runstate, "CURRENT_CACHE_MANAGER", None)
    monkeypatch.setitem(runstate.RUN_CONTEXT, "allow_persist", False)
    monkeypatch.setattr("economic_calendar.http.time.sleep", lambda *_: None)
    # Module-global circuit breakers persist across tests; reset so an earlier
    # "all-down" case can't leave STATSNZ open and short-circuit the next fetch.
    monkeypatch.setattr(_http, "SOURCE_BREAKERS", {})


class TestIcsPath:
    def test_parses_events_and_filters_window(self, lkg_off):
        session = FixtureSession({
            "calendar-export": _response(STATSNZ_ICS),
        })
        events = fetch_stats_nz_events(session, WINDOW_START, WINDOW_END)

        assert [e.title for e in events] == [
            "Consumers price index (CPI): June 2026 quarter",
            "Business confidence survey: July 2026",
        ]  # the December merchandise-trade item is outside the window
        cpi = events[0]
        assert cpi.source == "StatsNZ"
        assert cpi.agency == "STATSNZ"
        assert cpi.country == "NZ"
        assert cpi.event_local_tz == "Pacific/Auckland"
        assert cpi.impact == "High"  # classify_event: "cpi"/"consumer price index"
        # 10:45 Pacific/Auckland (NZST, +12) -> 22:45 UTC the previous day.
        assert cpi.date_time_utc == datetime(2026, 7, 15, 22, 45, tzinfo=UTC)
        assert cpi.extras["release_time_local"] == "10:45"
        assert len(cpi.id) == 40  # sha1 via make_id
        assert events[1].impact == "Medium"  # business confidence keyword
        assert events[1].date_time_utc == datetime(2026, 7, 27, 22, 45, tzinfo=UTC)


class TestIcsFallbackUrl:
    def test_second_url_used_when_first_empty(self, lkg_off):
        # First URL reachable but yields an empty calendar (0 rows); the fetcher
        # advances to the second URL, which carries the real feed.
        empty_ics = b"BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n"
        session = FixtureSession({
            "calendar-export": _response(empty_ics),
            "release-calendar.ics": _response(STATSNZ_ICS),
        })
        events = fetch_stats_nz_events(session, WINDOW_START, WINDOW_END)

        assert [e.title for e in events] == [
            "Consumers price index (CPI): June 2026 quarter",
            "Business confidence survey: July 2026",
        ]
        assert any("release-calendar.ics" in c for c in session.calls)
        assert events[0].date_time_utc == datetime(2026, 7, 15, 22, 45, tzinfo=UTC)


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_stats_nz_events(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
