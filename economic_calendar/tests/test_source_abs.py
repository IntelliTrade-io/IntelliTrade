"""Per-source fixture test for ABS (plan 6.8) — follows test_source_eurostat.py.

The ABS fetcher walks a month-by-month HTML calendar
(abs.gov.au/release-calendar/future-releases-calendar/{YYYYMM}) and parses
`div.view-item` blocks: a `<time datetime>` release moment, a
`strong.event-name` title, a product `<a href>` under /statistics/ (etc.), and
an optional `span.reference-period-value`. The fetcher's own retry/parse stack
runs; the network is never touched (FixtureSession routes URLs to canned bytes).

Fixture origin: synthesized 2026-07-08 in the shape of the ABS future-releases
calendar (structure per sources/abs.py selectors) — no live capture, same
approach as the eurostat exemplar. `<time>` values carry the +10:00 offset
(AEST; July is standard time in Sydney, no DST) so the UTC assertions are exact.
"""

from datetime import datetime

import pytest
import requests

from economic_calendar import runstate
from economic_calendar.sources.abs import fetch_abs_events
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# Two in-window releases (CPI -> High, Labour Force -> High) plus an August
# Retail Trade block that must be dropped by the window filter. The window in
# Sydney tz spans July and (partly) August, so the fetcher requests both month
# pages; FixtureSession serves this same body for every future-releases URL and
# the fetcher's seen_ids set dedupes across them.
CALENDAR_HTML = b"""<html><body><main>
<div class="view-item">
  <div class="contents exportable-element">
    <strong class="event-name">Consumer Price Index, Australia</strong>
    <time datetime="2026-07-29T11:30:00+10:00">29 July 2026</time>
    <span class="reference-period-value">June 2026</span>
    <div class="rs-product-link-latest">
      <a href="/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia">CPI</a>
    </div>
  </div>
</div>
<div class="view-item">
  <div class="contents exportable-element">
    <strong class="event-name">Labour Force, Australia</strong>
    <time datetime="2026-07-16T11:30:00+10:00">16 July 2026</time>
    <a href="/statistics/labour/employment-and-unemployment/labour-force-australia">LFS</a>
  </div>
</div>
<div class="view-item">
  <div class="contents exportable-element">
    <strong class="event-name">Retail Trade, Australia</strong>
    <time datetime="2026-08-04T11:30:00+10:00">4 August 2026</time>
    <a href="/statistics/industry/retail-and-wholesale-trade/retail-trade-australia">RT</a>
  </div>
</div>
</main></body></html>"""

# A block with a title but no product link under /statistics|/media-releases|
# /articles: the fetcher must skip it (href guard).
CALENDAR_NO_PRODUCT_LINK = b"""<html><body><main>
<div class="view-item">
  <div class="contents exportable-element">
    <strong class="event-name">Consumer Price Index, Australia</strong>
    <time datetime="2026-07-29T11:30:00+10:00">29 July 2026</time>
    <a href="/about/contact-us">contact</a>
  </div>
</div>
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


class TestHtmlPath:
    def test_parses_events_and_filters_window(self, lkg_off):
        session = FixtureSession({
            "future-releases-calendar": _response(CALENDAR_HTML),
        })
        events = fetch_abs_events(session, WINDOW_START, WINDOW_END)

        # August Retail Trade block is outside the window; dedup keeps each
        # in-window release once across the July + August month requests.
        assert sorted(e.title for e in events) == [
            "Consumer Price Index, Australia",
            "Labour Force, Australia",
        ]
        cpi = next(e for e in events if e.title.startswith("Consumer"))
        assert cpi.source == "ABS_HTML"
        assert cpi.agency == "ABS"
        assert cpi.country == "AU"
        assert cpi.event_local_tz == "Australia/Sydney"
        assert cpi.impact == "High"  # consumer price index keyword
        # 11:30 Australia/Sydney (AEST, +10) -> 01:30 UTC
        assert cpi.date_time_utc == datetime(2026, 7, 29, 1, 30, tzinfo=UTC)
        assert cpi.extras["release_time_local"] == "11:30"
        assert cpi.extras["reference_period"] == "June 2026"
        assert cpi.url == (
            "https://www.abs.gov.au/statistics/economy/"
            "price-indexes-and-inflation/consumer-price-index-australia"
        )
        assert len(cpi.id) == 40  # sha1 via make_id

        lfs = next(e for e in events if e.title.startswith("Labour"))
        assert lfs.impact == "High"  # labour force keyword
        assert lfs.date_time_utc == datetime(2026, 7, 16, 1, 30, tzinfo=UTC)
        # No reference-period node on this block.
        assert "reference_period" not in lfs.extras


class TestProductLinkGuard:
    def test_block_without_product_link_is_skipped(self, lkg_off):
        session = FixtureSession({
            "future-releases-calendar": _response(CALENDAR_NO_PRODUCT_LINK),
        })
        events = fetch_abs_events(session, WINDOW_START, WINDOW_END)
        assert events == []


class TestEmpty:
    def test_all_transports_down_returns_empty(self, lkg_off):
        events = fetch_abs_events(FixtureSession({}), WINDOW_START, WINDOW_END)
        assert events == []
