"""Per-source fixture test for ONS (plan 6.8) — follows test_source_eurostat.py.

Covers the ONS fetcher's real fallback ladder: RSS (primary) -> HTML (fallback
when RSS yields 0) -> empty. The fetcher's own retry/parse stack runs; the
network is never touched (FixtureSession routes URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the ONS release-calendar
RSS feed and the "upcoming" HTML list (structure per sources/ons.py selectors) —
no live capture, same approach as the eurostat exemplar.
"""

from datetime import datetime
from pathlib import Path

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.ons import fetch_ons_events_enhanced
from economic_calendar.timeutils import UTC

FIXTURES = Path(__file__).parent / "fixtures"

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# RSS: two releases inside the window (GDP -> High, Labour -> Medium) plus one
# in August that must be filtered out.
RSS_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>GDP first quarterly estimate, UK</title>
    <link>https://www.ons.gov.uk/economy/gdp</link>
    <pubDate>Fri, 10 Jul 2026 07:00:00 +0100</pubDate>
  </item>
  <item>
    <title>Labour market overview, UK</title>
    <link>https://www.ons.gov.uk/employmentandlabourmarket</link>
    <pubDate>Thu, 16 Jul 2026 07:00:00 +0100</pubDate>
  </item>
  <item>
    <title>Retail sales, UK</title>
    <link>https://www.ons.gov.uk/economy/retail</link>
    <pubDate>Sat, 15 Aug 2026 07:00:00 +0100</pubDate>
  </item>
</channel></rss>"""

RSS_EMPTY = b'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>'

# HTML "upcoming" list — single page, no pager (fetcher stops after page 1).
HTML_PAGE = b"""<html><body>
<ol>
  <li><a href="/economy/gdp">GDP monthly estimate, UK</a>
      Release date: 10 July 2026 7:00am | Confirmed</li>
  <li><a href="/employmentandlabourmarket">Labour market overview, UK</a>
      Release date: 16 July 2026 7:00am | Confirmed</li>
</ol>
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


class TestRssPath:
    def test_parses_events_and_filters_window(self, lkg_off):
        session = FixtureSession({"?rss": _response(RSS_XML)})
        events = fetch_ons_events_enhanced(session, WINDOW_START, WINDOW_END)

        assert [e.title for e in events] == [
            "GDP first quarterly estimate, UK",
            "Labour market overview, UK",
        ]  # the August retail-sales item is outside the window
        gdp = events[0]
        assert gdp.source == "ONS_RSS_UPCOMING"
        assert gdp.agency == "ONS"
        assert gdp.country == "GB"
        assert gdp.event_local_tz == "Europe/London"
        assert gdp.impact == "High"  # GDP keyword
        # 07:00 Europe/London (BST, +1) -> 06:00 UTC
        assert gdp.date_time_utc == datetime(2026, 7, 10, 6, 0, tzinfo=UTC)
        assert len(gdp.id) == 40  # sha1 via make_id
        assert events[1].impact == "Medium"  # labour-market keyword


class TestHtmlFallback:
    def test_html_used_when_rss_empty(self, lkg_off):
        session = FixtureSession({
            "?rss": _response(RSS_EMPTY),          # RSS reachable but 0 items
            "highlight=true": _response(HTML_PAGE),  # upcoming HTML list
        })
        events = fetch_ons_events_enhanced(session, WINDOW_START, WINDOW_END)

        assert [e.title for e in events] == [
            "GDP monthly estimate, UK",
            "Labour market overview, UK",
        ]
        assert all(e.source == "ONS_HTML_UPCOMING" for e in events)
        assert events[0].date_time_utc == datetime(2026, 7, 10, 6, 0, tzinfo=UTC)
        assert events[0].impact == "High"


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_ons_events_enhanced(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
