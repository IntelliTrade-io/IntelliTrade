"""Per-source fixture test for the Bank of Japan MPM schedule (plan 6.8) —
follows test_source_eurostat.py.

Covers the BOJ fetcher's real locale ladder: it tries the EN schedule pages
first (via sget_retry_alt), parsing the h2[id^='p20'] year headings + meeting
tables; a JP page is the fallback, and when every transport is down (and there
are no curated/LKG dates) it returns []. The fetcher's own retry/parse stack
runs; the network is never touched (FixtureSession routes URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the BOJ EN "Outline of
Monetary Policy Meetings" schedule page (structure per sources/boj.py
_parse_schedule) — no live capture, same approach as the eurostat exemplar.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import http as _http
from economic_calendar import runstate
from economic_calendar.sources import boj as _boj
from economic_calendar.sources.boj import fetch_boj_mpm_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 8, 31, tzinfo=UTC)

# EN schedule page: an h2 anchored "p20xx" carrying the context year, then a table
# whose first cell holds each meeting's date. Two meetings inside the window
# (July, August) plus one in December that must be filtered out. No explicit time
# on the schedule, so the fetcher applies its 12:00 JST placeholder.
BOJ_EN_HTML = b"""<html><body>
<h2 id="p20260101">Monetary Policy Meetings in 2026</h2>
<table>
  <tbody>
    <tr><td>July 15</td><td>Statement</td></tr>
    <tr><td>August 5</td><td>Statement</td></tr>
    <tr><td>December 18</td><td>Statement</td></tr>
  </tbody>
</table>
</body></html>"""

# JP fallback page: same two in-window meetings expressed in Japanese era/date
# form (2026 = Reiwa 8), used only when the EN page parses zero rows.
BOJ_JP_HTML = (
    "<html><body>"
    "<h2 id=\"p20260101\">2026年の金融政策決定会合</h2>"
    "<table><tbody>"
    "<tr><td>令和8年7月15日</td><td>公表</td></tr>"
    "<tr><td>令和8年8月5日</td><td>公表</td></tr>"
    "</tbody></table>"
    "</body></html>"
).encode("utf-8")


def _response(content: bytes, status: int = 200) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status
    resp._content = content
    resp.encoding = "utf-8"
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
    # "all-down" case can't leave BOJ open and short-circuit the next fetch.
    monkeypatch.setattr(_http, "SOURCE_BREAKERS", {})
    # Keep the zero-path health writes off disk in the all-transports-down test.
    monkeypatch.setattr(_boj, "write_zero_snapshot", lambda *a, **k: None)
    monkeypatch.setattr(_boj, "_finalize_source_log", lambda *a, **k: None)


class TestEnSchedulePath:
    def test_parses_events_and_filters_window(self, lkg_off):
        session = FixtureSession({"/en/mopo/": _response(BOJ_EN_HTML)})
        events = fetch_boj_mpm_events(session, WINDOW_START, WINDOW_END)

        # Both in-window meetings carry the fixed MPM title; the December row is
        # dropped by the window filter. Events are sorted by UTC time.
        assert len(events) == 2
        july = events[0]
        assert july.title == "Japan — BoJ Monetary Policy Meeting"
        assert july.source == "BOJ_SCHEDULE"
        assert july.agency == "BOJ"
        assert july.country == "JP"
        assert july.event_local_tz == "Asia/Tokyo"
        assert july.impact == "High"  # classify_event: "monetary policy"
        assert july.extras["source_locale"] == "en"
        assert july.extras["meeting_type"] == "MPM"
        # No explicit time -> 12:00 Asia/Tokyo (JST, +9) -> 03:00 UTC.
        assert july.date_time_utc == datetime(2026, 7, 15, 3, 0, tzinfo=UTC)
        assert events[1].date_time_utc == datetime(2026, 8, 5, 3, 0, tzinfo=UTC)
        assert len(july.id) == 40  # sha1 via make_id


class TestJpFallback:
    def test_jp_used_when_en_parses_zero(self, lkg_off):
        # EN page reachable but structurally empty (no year heading -> 0 rows);
        # the fetcher advances to the JP locale, which carries the era-form dates.
        empty_en = b"<html><body><p>Schedule to be announced.</p></body></html>"
        session = FixtureSession({
            "/en/mopo/": _response(empty_en),
            "/mopo/": _response(BOJ_JP_HTML),  # bare (JP) path
        })
        events = fetch_boj_mpm_events(session, WINDOW_START, WINDOW_END)

        assert len(events) == 2
        assert all(e.extras["source_locale"] == "jp" for e in events)
        assert events[0].date_time_utc == datetime(2026, 7, 15, 3, 0, tzinfo=UTC)
        assert events[1].date_time_utc == datetime(2026, 8, 5, 3, 0, tzinfo=UTC)
        assert events[0].impact == "High"


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_boj_mpm_events(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
