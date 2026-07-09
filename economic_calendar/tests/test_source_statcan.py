"""Per-source fixture test for StatCan (plan 6.8) — follows test_source_eurostat.py.

Covers the StatCan fetcher's real fallback ladder: Atom feed (primary; each
entry's linked Daily page is fetched for a precise release time) -> HTML
"upcoming releases" calendar (fallback when the Atom feed yields 0 entries) ->
empty. The fetcher's own retry/parse stack runs; the network is never touched
(FixtureSession routes URLs to canned bytes).

IMPORTANT: statcan.gc.ca rate-limits aggressively, so nothing here is captured
live. Every response is synthesized in the shape StatCan serves:
  - the Atom feed at www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom
  - a Daily-quotidien article page carrying <time datetime="..."> (offset -04:00,
    i.e. EDT, since July is daylight time in Toronto)
  - the cal2-eng.htm upcoming-releases calendar (month-header + <ol>/<li>)
Structure per sources/statcan.py expectations, synthesized 2026-07-08.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.statcan import fetch_statcan_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

ATOM_URL = "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom"

# Two in-window entries (CPI -> High, Labour Force -> High) plus one whose page
# resolves to an August date and must be dropped by the window filter. The link
# targets are what the fetcher will re-request to read the precise <time> value.
CPI_PAGE_URL = "https://www150.statcan.gc.ca/n1/daily-quotidien/20260721/dq260721a-eng.htm"
LFS_PAGE_URL = "https://www150.statcan.gc.ca/n1/daily-quotidien/20260710/dq260710a-eng.htm"
AUG_PAGE_URL = "https://www150.statcan.gc.ca/n1/daily-quotidien/20260812/dq260812a-eng.htm"

ATOM_FEED = f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Statistics Canada - The Daily</title>
  <entry>
    <title>Consumer Price Index, June 2026</title>
    <link href="{CPI_PAGE_URL}"/>
    <published>2026-07-21T08:30:00-04:00</published>
    <updated>2026-07-21T08:30:00-04:00</updated>
  </entry>
  <entry>
    <title>Labour Force Survey, June 2026</title>
    <link href="{LFS_PAGE_URL}"/>
    <published>2026-07-10T08:30:00-04:00</published>
  </entry>
  <entry>
    <title>Gross domestic product, second quarter 2026</title>
    <link href="{AUG_PAGE_URL}"/>
    <published>2026-08-12T08:30:00-04:00</published>
  </entry>
</feed>""".encode()


def _daily_page(iso_dt: str) -> bytes:
    """A Daily article page exposing the release moment via <time datetime>."""
    return (
        f'<html><head><title>The Daily</title></head><body><main>'
        f'<time datetime="{iso_dt}">release</time>'
        f'</main></body></html>'
    ).encode()


# cal2-eng.htm upcoming-releases calendar: a month header followed by an <ol> of
# releases. StatCan's HTML path pins these to 08:30 America/Toronto.
CAL2_HTML = b"""<html><body><main>
<h3>July 15</h3>
<ol>
  <li>Retail sales, May 2026</li>
</ol>
<h3>August 5</h3>
<ol>
  <li>Building permits, June 2026</li>
</ol>
</main></body></html>"""


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


class TestAtomPath:
    def test_parses_entries_and_filters_window(self, lkg_off):
        session = FixtureSession({
            ".atom": _response(ATOM_FEED),
            "dq260721a": _response(_daily_page("2026-07-21T08:30:00-04:00")),
            "dq260710a": _response(_daily_page("2026-07-10T08:30:00-04:00")),
            "dq260812a": _response(_daily_page("2026-08-12T08:30:00-04:00")),
        })
        events = fetch_statcan_events(session, WINDOW_START, WINDOW_END)

        # August GDP entry is outside the window; order follows feed order.
        assert [e.title for e in events] == [
            "Consumer Price Index, June 2026",
            "Labour Force Survey, June 2026",
        ]
        cpi = events[0]
        assert cpi.source == "STATCAN_ATOM"
        assert cpi.agency == "STATCAN"
        assert cpi.country == "CA"
        assert cpi.event_local_tz == "America/Toronto"
        assert cpi.impact == "High"  # consumer price index keyword
        # 08:30 America/Toronto (EDT, -4) -> 12:30 UTC
        assert cpi.date_time_utc == datetime(2026, 7, 21, 12, 30, tzinfo=UTC)
        assert len(cpi.id) == 40  # sha1 via make_id
        assert events[1].impact == "High"  # labour force keyword
        assert events[1].date_time_utc == datetime(2026, 7, 10, 12, 30, tzinfo=UTC)

    def test_atom_time_falls_back_to_published_when_page_has_no_time(self, lkg_off):
        # Page reachable but exposes no <time>/meta: fetcher keeps the Atom
        # published timestamp (10:00 default only applies to date-only values;
        # here the published value already carries 08:30-04:00).
        session = FixtureSession({
            ".atom": _response(ATOM_FEED),
            "dq260721a": _response(b"<html><body><main>no date here</main></body></html>"),
            "dq260710a": _response(b"<html><body><main>no date here</main></body></html>"),
            "dq260812a": _response(b"<html><body><main>no date here</main></body></html>"),
        })
        events = fetch_statcan_events(session, WINDOW_START, WINDOW_END)
        titles = {e.title for e in events}
        assert "Consumer Price Index, June 2026" in titles
        cpi = next(e for e in events if e.title.startswith("Consumer"))
        assert cpi.date_time_utc == datetime(2026, 7, 21, 12, 30, tzinfo=UTC)


class TestHtmlFallback:
    def test_html_calendar_used_when_atom_empty(self, lkg_off):
        session = FixtureSession({
            # Atom reachable but zero entries -> fetcher drops to HTML calendar.
            ".atom": _response(b'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'),
            "cal2-eng.htm": _response(CAL2_HTML),
        })
        events = fetch_statcan_events(session, WINDOW_START, WINDOW_END)

        # Only the July 15 release is inside the window (August 5 dropped).
        assert [e.title for e in events] == ["Retail sales, May 2026"]
        ev = events[0]
        assert ev.source == "STATCAN_HTML"
        assert ev.agency == "STATCAN"
        assert ev.country == "CA"
        assert ev.event_local_tz == "America/Toronto"
        assert ev.impact == "Medium"  # retail sales/trade keyword
        # 08:30 America/Toronto (EDT, -4) -> 12:30 UTC
        assert ev.date_time_utc == datetime(2026, 7, 15, 12, 30, tzinfo=UTC)
        assert ev.extras["announcement_time_local"] == "08:30"
        assert len(ev.id) == 40


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_statcan_events(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
