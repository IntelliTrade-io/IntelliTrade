"""Pin the ICS parser: TZID handling, folding, defaults."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from economic_calendar.ics import parse_ics_bytes, parse_ics_datetime
from economic_calendar.timeutils import UTC

LONDON = ZoneInfo("Europe/London")


class TestParseIcsDatetime:
    def test_z_suffix_is_utc(self):
        dt = parse_ics_datetime("20260710T123000Z", {}, LONDON)
        assert dt == datetime(2026, 7, 10, 12, 30, tzinfo=UTC)

    def test_date_only_gets_default_time_and_source_tz(self):
        dt = parse_ics_datetime("20260710", {}, LONDON, default_hour=9, default_min=30)
        assert dt == datetime(2026, 7, 10, 9, 30, tzinfo=LONDON)

    def test_tzid_param_wins(self):
        dt = parse_ics_datetime("20260710T083000", {"TZID": "America/New_York"}, LONDON)
        assert dt.tzinfo == ZoneInfo("America/New_York")
        assert (dt.hour, dt.minute) == (8, 30)

    def test_bad_tzid_falls_back_to_source_tz(self):
        dt = parse_ics_datetime("20260710T083000", {"TZID": "Not/AZone"}, LONDON)
        assert dt.tzinfo is LONDON

    def test_unrecognized_raises(self):
        with pytest.raises(ValueError):
            parse_ics_datetime("July 10, 2026", {}, LONDON)


ICS_SAMPLE = b"""BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Consumer Price Index
DTSTART;TZID=America/New_York:20260710T083000
URL:https://www.bls.gov/cpi
END:VEVENT
BEGIN:VEVENT
SUMMARY:Folded
 Title
DTSTART:20260711
UID:evt-2
END:VEVENT
BEGIN:VEVENT
SUMMARY:No date, dropped
END:VEVENT
END:VCALENDAR
"""


class TestParseIcsBytes:
    def test_parses_events_with_params_and_folding(self):
        events = parse_ics_bytes(ICS_SAMPLE, LONDON, default_hour=7, default_min=0)
        assert len(events) == 2

        cpi = events[0]
        assert cpi["title"] == "Consumer Price Index"
        assert cpi["url"] == "https://www.bls.gov/cpi"
        assert cpi["dt"].tzinfo == ZoneInfo("America/New_York")

        folded = events[1]
        assert folded["title"] == "FoldedTitle"
        assert folded["url"] == "evt-2"  # UID fallback
        assert folded["dt"] == datetime(2026, 7, 11, 7, 0, tzinfo=LONDON)

    def test_empty_input(self):
        assert parse_ics_bytes(b"", LONDON) == []
