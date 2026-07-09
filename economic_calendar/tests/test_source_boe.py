"""Per-source fixture test for BoE (plan 6.8) — follows test_source_eurostat.py.

Covers the BoE MPC fetcher's primary DOM path (the ``upcoming-mpc-dates`` page's
``<time datetime>`` elements) plus its window filtering and the all-transports-
down -> empty tail. The fetcher's own retry/parse stack runs; the network is
never touched (FixtureSession routes URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the BoE
``upcoming-mpc-dates`` HTML (``<time datetime>`` markup per sources/boe.py's
``time[datetime]`` selector) — no live capture, same approach as the eurostat
exemplar.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.boe import fetch_boe_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, 23, 59, tzinfo=UTC)

# Two MPC announcements inside the July window plus one in September that must be
# filtered out. The <time datetime> values carry London's summer offset (+01:00),
# so 12:00 local -> 11:00 UTC. Each row wraps the <time> in an <a href> so the
# fetcher's anchor-discovery resolves the release URL.
MPC_PAGE = b"""<html><head><title>Upcoming MPC dates 2026</title></head><body>
<table>
  <tr>
    <td><a href="/monetary-policy/2026/august-2026">
        <time datetime="2026-07-24T12:00:00+01:00">24 July 2026</time></a></td>
    <td>MPC announcement and Monetary Policy Report</td>
  </tr>
  <tr>
    <td><a href="/monetary-policy/2026/september-2026">
        <time datetime="2026-07-31T12:00:00+01:00">31 July 2026</time></a></td>
    <td>MPC minutes</td>
  </tr>
  <tr>
    <td><a href="/monetary-policy/2026/november-2026">
        <time datetime="2026-09-18T12:00:00+01:00">18 September 2026</time></a></td>
    <td>MPC announcement</td>
  </tr>
</table>
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
        session = FixtureSession({"upcoming-mpc-dates": _response(MPC_PAGE)})
        events = fetch_boe_events(session, WINDOW_START, WINDOW_END)

        # Two July events survive; the September announcement is out of window.
        assert len(events) == 2
        first = events[0]
        assert first.title == "MPC Meeting"
        assert first.agency == "BOE"
        assert first.country == "GB"
        assert first.source == "BOE_HTML"
        assert first.event_local_tz == "Europe/London"
        assert first.impact == "High"
        # 12:00 Europe/London (BST, +1) -> 11:00 UTC
        assert first.date_time_utc == datetime(2026, 7, 24, 11, 0, tzinfo=UTC)
        assert first.extras["announcement_time_local"] == "12:00"
        assert first.extras["discovered_via"] == "dom"
        assert first.url.endswith("/monetary-policy/2026/august-2026")
        assert len(first.id) == 40  # sha1 via make_id
        # events are sorted ascending by UTC time
        assert events[1].date_time_utc == datetime(2026, 7, 31, 11, 0, tzinfo=UTC)


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        # Primary page and the news-hub discovery URL both unreachable; the
        # curated/estimator fallbacks yield nothing inside this window.
        events = fetch_boe_events(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
