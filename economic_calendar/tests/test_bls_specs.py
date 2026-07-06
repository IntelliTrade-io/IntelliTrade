"""Pin BLS canonical specs: text→key mapping and schedule rule lambdas."""

from datetime import datetime

from economic_calendar.bls_specs import (
    BLS_CANONICAL_SPECS,
    BLS_CURATED_OFFICIAL_DATE_OVERRIDES,
    _bls_canonical_key_from_text,
    _last_business_day_local,
    _nth_business_day_local,
    _weekday_local,
)
from economic_calendar.timeutils import NEW_YORK_TZ


class TestCanonicalKey:
    def test_maps_release_text(self):
        assert _bls_canonical_key_from_text("Employment Situation") == "BLS_EMPLOYMENT_SITUATION"
        assert _bls_canonical_key_from_text("nonfarm payrolls preview") == "BLS_EMPLOYMENT_SITUATION"
        assert _bls_canonical_key_from_text("Consumer Price Index") == "BLS_CPI"
        assert _bls_canonical_key_from_text("JOLTS job openings") == "BLS_JOLTS"

    def test_unknown_returns_none(self):
        assert _bls_canonical_key_from_text("weather report") is None
        assert _bls_canonical_key_from_text("") is None


class TestDateHelpers:
    def test_nth_business_day(self):
        # 8th business day of Jul 2026 (1st = Wed): 1,2,3,6,7,8,9,10 → Fri 10th
        dt = _nth_business_day_local(2026, 7, 8, 8, 30, NEW_YORK_TZ)
        assert (dt.day, dt.hour, dt.minute) == (10, 8, 30)
        assert dt.tzinfo is NEW_YORK_TZ

    def test_weekday_local_first_friday(self):
        dt = _weekday_local(2026, 7, 4, 1, 8, 30, NEW_YORK_TZ)
        assert dt.day == 3  # first Friday of Jul 2026

    def test_last_business_day(self):
        dt = _last_business_day_local(2026, 8, 8, 30, NEW_YORK_TZ)
        assert dt.day == 31  # Mon 2026-08-31


class TestSpecRules:
    def test_employment_situation_first_friday(self):
        dt = BLS_CANONICAL_SPECS["BLS_EMPLOYMENT_SITUATION"]["rule"](2026, 7)
        assert (dt.day, dt.hour, dt.minute) == (3, 8, 30)

    def test_eci_quarterly_only(self):
        assert BLS_CANONICAL_SPECS["BLS_ECI"]["rule"](2026, 7) is not None
        assert BLS_CANONICAL_SPECS["BLS_ECI"]["rule"](2026, 6) is None

    def test_all_specs_have_required_fields(self):
        for key, spec in BLS_CANONICAL_SPECS.items():
            assert spec["title"] and spec["url"] and spec["patterns"], key
            assert spec["impact"] in {"High", "Medium"}, key
            assert 0 <= spec["score"] <= 100, key
            assert callable(spec["rule"]), key

    def test_curated_overrides_parse_as_aware_datetimes(self):
        for key, stamps in BLS_CURATED_OFFICIAL_DATE_OVERRIDES.items():
            assert key in BLS_CANONICAL_SPECS
            for stamp in stamps:
                assert datetime.fromisoformat(stamp).tzinfo is not None
