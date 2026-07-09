"""Pin behavior of the time/date helpers extracted from the scraper monolith."""

from datetime import datetime


from economic_calendar.timeutils import (
    LONDON_TZ,
    UTC,
    _get_zoneinfo,
    _is_business_day,
    _iso,
    _last_weekday_of_month,
    _month_year_iter,
    _move_business_days,
    _now_utc,
    _nth_weekday_of_month,
    _parse_local_time,
    _shift_to_business_day,
    _within,
    ensure_aware,
    month_to_num,
)


class TestMonthToNum:
    def test_full_names(self):
        assert month_to_num("January") == 1
        assert month_to_num("december") == 12

    def test_prefix_match(self):
        assert month_to_num("Sept") == 9
        assert month_to_num("mar") == 3

    def test_abbreviations(self):
        assert month_to_num("sept") == 9
        assert month_to_num("jun") == 6

    def test_invalid(self):
        assert month_to_num("") is None
        assert month_to_num(None) is None
        assert month_to_num("notamonth") is None


class TestZoneinfo:
    def test_lookup_hits_shared_constants(self):
        assert _get_zoneinfo("Europe/London") is LONDON_TZ

    def test_cache_returns_same_instance(self):
        first = _get_zoneinfo("America/Chicago")
        assert _get_zoneinfo("America/Chicago") is first


class TestNowIso:
    def test_now_utc_is_aware_utc(self):
        now = _now_utc()
        assert now.tzinfo is UTC

    def test_iso_converts_to_utc(self):
        dt = datetime(2026, 7, 1, 12, 0, tzinfo=LONDON_TZ)
        assert _iso(dt) == "2026-07-01T11:00:00+00:00"


class TestParseLocalTime:
    def test_parses_hh_mm(self):
        assert _parse_local_time("14:30") == (14, 30, True)

    def test_hour_only(self):
        assert _parse_local_time("9") == (9, 0, True)

    def test_blank_returns_default_unparsed(self):
        assert _parse_local_time(None) == (9, 0, False)
        assert _parse_local_time("  ") == (9, 0, False)

    def test_garbage_returns_default(self):
        assert _parse_local_time("noon", default=(10, 15)) == (10, 15, False)


class TestEnsureAware:
    def test_none_passthrough(self):
        assert ensure_aware(None, UTC) is None

    def test_naive_midnight_gets_default_time(self):
        dt = ensure_aware(datetime(2026, 7, 1), LONDON_TZ)
        assert (dt.hour, dt.minute) == (10, 0)
        assert dt.tzinfo is LONDON_TZ

    def test_naive_with_time_keeps_time(self):
        dt = ensure_aware(datetime(2026, 7, 1, 8, 30), LONDON_TZ)
        assert (dt.hour, dt.minute) == (8, 30)

    def test_aware_untouched(self):
        original = datetime(2026, 7, 1, tzinfo=UTC)
        assert ensure_aware(original, LONDON_TZ) is original


class TestCalendarHelpers:
    def test_month_year_iter_crosses_year(self):
        assert list(_month_year_iter(2025, 11, 2026, 2)) == [
            (2025, 11), (2025, 12), (2026, 1), (2026, 2),
        ]

    def test_nth_weekday(self):
        # First Friday of July 2026 is the 3rd
        assert _nth_weekday_of_month(2026, 7, 4, 1) == 3
        # No 5th Friday in June 2026
        assert _nth_weekday_of_month(2026, 6, 4, 5) is None
        assert _nth_weekday_of_month(2026, 6, 4, 0) is None

    def test_last_weekday(self):
        # Last Friday of July 2026 is the 31st
        assert _last_weekday_of_month(2026, 7, 4) == 31

    def test_business_day_predicates(self):
        assert _is_business_day(datetime(2026, 7, 3))       # Friday
        assert not _is_business_day(datetime(2026, 7, 4))   # Saturday

    def test_shift_to_business_day(self):
        saturday = datetime(2026, 7, 4)
        assert _shift_to_business_day(saturday, "forward").day == 6
        assert _shift_to_business_day(saturday, "backward").day == 3

    def test_move_business_days_skips_weekend(self):
        friday = datetime(2026, 7, 3)
        assert _move_business_days(friday, 1, "forward").day == 6
        assert _move_business_days(friday, 0, "forward") is friday


class TestWithin:
    def test_inclusive_bounds(self):
        start = datetime(2026, 7, 1, tzinfo=UTC)
        end = datetime(2026, 7, 31, tzinfo=UTC)
        assert _within(start, start, end)
        assert _within(end, start, end)
        assert not _within(datetime(2026, 8, 1, tzinfo=UTC), start, end)
