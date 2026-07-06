"""Pin curated-fallback bookkeeping and zero-event policy."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from economic_calendar.curated import (
    CuratedMeeting,
    GRACE_WINDOW_SOURCES,
    _curated_fallback_info,
    _curated_fallback_source_key,
    _ensure_time_confidence,
    _is_benign_zero_case,
    _is_benign_zero_reason,
    _normalize_zero_reason,
    _resolve_curated_local_dt,
)
from economic_calendar.timeutils import LONDON_TZ, UTC


class TestZeroReason:
    def test_normalize_collapses_whitespace_and_case(self):
        assert _normalize_zero_reason("  Between   Meetings ") == "between meetings"
        assert _normalize_zero_reason(None) == ""

    def test_benign_set(self):
        assert _is_benign_zero_reason("between_meetings")
        assert not _is_benign_zero_reason("scrape failed")

    def test_blank_needs_allow_flag(self):
        assert not _is_benign_zero_reason("")
        assert _is_benign_zero_reason("", allow_blank=True)

    def test_legacy_pattern_per_source(self):
        reason = "curated first-wednesday schedule produced no events in window"
        assert _is_benign_zero_reason(reason, source_key="adp")
        assert not _is_benign_zero_reason(reason, source_key="BOC")


class TestBenignZeroCase:
    def test_nonzero_count_never_benign(self):
        assert not _is_benign_zero_case("BOE", "dom", 3, "between_meetings")

    def test_zero_with_benign_reason(self):
        assert _is_benign_zero_case("BOE", "dom", 0, "between_meetings")

    def test_zero_blank_reason_on_curated_path(self):
        assert _is_benign_zero_case("ADP", "curated", 0, None)
        assert not _is_benign_zero_case("ADP", "dom", 0, None)

    def test_garbage_count_treated_as_zero(self):
        assert _is_benign_zero_case("BOE", "estimator", "n/a", None)


class TestCuratedFallbackInfo:
    def test_statscan_alias(self):
        assert _curated_fallback_source_key("STATSCAN") == "STATCAN"
        assert _curated_fallback_source_key(" fed ") == "FED"

    def test_unknown_source_none(self):
        assert _curated_fallback_info("NOPE") is None

    def test_fresh_within_max_age(self):
        # FED reviewed 2026-05-26, max 60 days
        info = _curated_fallback_info("FED", as_of_utc=datetime(2026, 6, 25, tzinfo=UTC))
        assert info["fresh"] is True
        assert info["age_days"] == 30

    def test_stale_past_max_age(self):
        info = _curated_fallback_info("BLS", as_of_utc=datetime(2026, 7, 1, tzinfo=UTC))
        assert info["fresh"] is False  # 14-day budget, 31 days old

    def test_naive_as_of_assumed_utc(self):
        info = _curated_fallback_info("FED", as_of_utc=datetime(2026, 6, 25))
        assert info["age_days"] == 30


class TestResolveCuratedLocalDt:
    def test_announcement_local_parsed(self):
        meeting = CuratedMeeting(2025, 12, 10, "FED", {"announcement_local": "14:00 America/New_York"})
        dt, extras = _resolve_curated_local_dt(meeting, default_tz=LONDON_TZ, default_hour=9, default_minute=0)
        assert dt.tzinfo == ZoneInfo("America/New_York")
        assert (dt.hour, dt.minute) == (14, 0)
        assert extras["announcement_local"] == "14:00 America/New_York"

    def test_defaults_when_no_spec(self):
        meeting = CuratedMeeting(2026, 7, 10, "BOE", {})
        dt, _ = _resolve_curated_local_dt(meeting, default_tz=LONDON_TZ, default_hour=12, default_minute=0)
        assert dt.tzinfo is LONDON_TZ
        assert dt.hour == 12

    def test_unknown_tz_name_keeps_default(self):
        meeting = CuratedMeeting(2026, 7, 10, "X", {"announcement_local": "10:30 Mars/Olympus"})
        dt, _ = _resolve_curated_local_dt(meeting, default_tz=LONDON_TZ, default_hour=9, default_minute=0)
        assert dt.tzinfo is LONDON_TZ
        assert (dt.hour, dt.minute) == (10, 30)


class TestEnsureTimeConfidence:
    def test_sets_default(self):
        event = {}
        assert _ensure_time_confidence(event)["extras"]["time_confidence"] == "assumed"

    def test_keeps_existing(self):
        event = {"extras": {"time_confidence": "exact"}}
        assert _ensure_time_confidence(event)["extras"]["time_confidence"] == "exact"


class TestGraceWindows:
    def test_expected_sources_present(self):
        assert set(GRACE_WINDOW_SOURCES) == {"BLS", "FED", "ECB", "BOE", "BOJ", "RBA"}
        assert GRACE_WINDOW_SOURCES["FED"].hour == 14
