"""Per-source test for the US curated-schedule fetchers (plan 6.8).

These sources are deterministic: they emit events from fixed release-day rules
(DOL jobless claims = Thursdays 08:30 NY; EIA petroleum status = Wednesdays
10:30 NY) with no network fetch — the ``session`` argument is ``del``'d inside
each fetcher. So there is nothing to mock: we call the public function over a
fixed window and assert the exact deterministic output (count, titles, the Event
contract, and UTC instants), plus that an empty window returns ``[]`` cleanly.

Window: July 2026 (chosen so DST is active — America/New_York is EDT, UTC-4).
"""

from datetime import datetime

from economic_calendar.sources.us_curated import (
    fetch_dol_jobless_claims_events,
    fetch_eia_petroleum_status_events,
)
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)

# A tiny Monday-noon window with no Thursday/Wednesday release inside it.
EMPTY_START = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)
EMPTY_END = datetime(2026, 7, 6, 13, 0, tzinfo=UTC)


class TestDolJoblessClaims:
    def test_weekly_thursday_schedule(self):
        # session is unused by the curated fetcher (del session) — pass None.
        events = fetch_dol_jobless_claims_events(None, WINDOW_START, WINDOW_END)

        # Five Thursdays fall in July 2026 (2, 9, 16, 23, 30).
        assert len(events) == 5
        assert [e.date_time_utc for e in events] == [
            datetime(2026, 7, 2, 12, 30, tzinfo=UTC),
            datetime(2026, 7, 9, 12, 30, tzinfo=UTC),
            datetime(2026, 7, 16, 12, 30, tzinfo=UTC),
            datetime(2026, 7, 23, 12, 30, tzinfo=UTC),
            datetime(2026, 7, 30, 12, 30, tzinfo=UTC),
        ]  # 08:30 America/New_York (EDT, -4) -> 12:30 UTC

        first = events[0]
        assert first.title == "US Initial and Continuing Jobless Claims"
        assert first.source == "DOL_CURATED"
        assert first.agency == "DOL"
        assert first.country == "US"
        assert first.event_local_tz == "America/New_York"
        assert first.impact == "High"  # "jobless" keyword
        assert first.extras["release_time_local"] == "08:30"
        assert first.extras["time_confidence"] == "exact"
        assert first.extras["series"] == "jobless_claims"
        assert len(first.id) == 40  # sha1 via make_id

    def test_empty_window_returns_empty(self):
        assert fetch_dol_jobless_claims_events(None, EMPTY_START, EMPTY_END) == []


class TestEiaPetroleumStatus:
    def test_weekly_wednesday_schedule(self):
        events = fetch_eia_petroleum_status_events(None, WINDOW_START, WINDOW_END)

        # Five Wednesdays fall in July 2026 (1, 8, 15, 22, 29).
        assert len(events) == 5
        assert [e.date_time_utc for e in events] == [
            datetime(2026, 7, 1, 14, 30, tzinfo=UTC),
            datetime(2026, 7, 8, 14, 30, tzinfo=UTC),
            datetime(2026, 7, 15, 14, 30, tzinfo=UTC),
            datetime(2026, 7, 22, 14, 30, tzinfo=UTC),
            datetime(2026, 7, 29, 14, 30, tzinfo=UTC),
        ]  # 10:30 America/New_York (EDT, -4) -> 14:30 UTC

        first = events[0]
        assert first.title == (
            "EIA Weekly Petroleum Status Report "
            "(Crude Oil, Gasoline, Distillate Inventories)"
        )
        assert first.source == "EIA_CURATED"
        assert first.agency == "EIA"
        assert first.country == "US"
        assert first.event_local_tz == "America/New_York"
        assert first.impact == "Medium"  # "petroleum status" / "oil inventories"
        assert first.extras["release_time_local"] == "10:30"
        assert first.extras["time_confidence"] == "exact"
        assert first.extras["series"] == "oil_inventories"
        assert len(first.id) == 40

    def test_empty_window_returns_empty(self):
        assert fetch_eia_petroleum_status_events(None, EMPTY_START, EMPTY_END) == []
