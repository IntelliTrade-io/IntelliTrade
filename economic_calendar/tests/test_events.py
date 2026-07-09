"""Pin the Event model contract: stable IDs, serialization, extras defaults."""

from datetime import datetime


from economic_calendar.events import (
    Event,
    _content_hash_bytes,
    _content_hash_text,
    _event_from_dict,
    _event_to_dict,
    make_id,
)
from economic_calendar.timeutils import UTC


def _make_event(**overrides):
    dt = overrides.pop("date_time_utc", datetime(2026, 7, 10, 12, 30, 0, tzinfo=UTC))
    fields = {
        "id": make_id("US", "BLS", "CPI", dt),
        "source": "BLS_ICS",
        "agency": "BLS",
        "country": "US",
        "title": "CPI",
        "date_time_utc": dt,
        "event_local_tz": "America/New_York",
        "impact": "High",
        "url": "https://www.bls.gov/schedule/news_release/cpi.htm",
    }
    fields.update(overrides)
    return Event(**fields)


class TestMakeId:
    def test_stable_sha1_of_canonical_fields(self):
        dt = datetime(2026, 7, 10, 12, 30, tzinfo=UTC)
        # Pinned: any change to this hash breaks scraperID continuity in Supabase
        # (prune-then-upsert in economic_calendar_upload keys on it).
        assert make_id("US", "BLS", "CPI", dt) == "4b14cfa0c865c03b737e49c52827360f5ee08e12"

    def test_sensitive_to_each_field(self):
        dt = datetime(2026, 7, 10, 12, 30, tzinfo=UTC)
        base = make_id("US", "BLS", "CPI", dt)
        assert make_id("GB", "BLS", "CPI", dt) != base
        assert make_id("US", "ONS", "CPI", dt) != base
        assert make_id("US", "BLS", "PPI", dt) != base
        assert make_id("US", "BLS", "CPI", datetime(2026, 7, 11, 12, 30, tzinfo=UTC)) != base


class TestEvent:
    def test_post_init_defaults_time_confidence(self):
        ev = _make_event()
        assert ev.extras["time_confidence"] == "exact"

    def test_post_init_keeps_explicit_time_confidence(self):
        ev = _make_event(extras={"time_confidence": "assumed"})
        assert ev.extras["time_confidence"] == "assumed"

    def test_post_init_copies_extras(self):
        shared = {"category": "inflation"}
        ev = _make_event(extras=shared)
        assert ev.extras is not shared

    def test_to_dict_core_fields(self):
        ev = _make_event()
        d = ev.to_dict()
        assert d["id"] == ev.id
        assert d["date_time_utc"] == "2026-07-10T12:30:00+00:00"
        assert d["event_time_utc"] == d["date_time_utc"]
        assert d["local_time_timezone"] == "America/New_York"
        assert d["source_name"] == "BLS"
        assert d["source_url"] == ev.url
        assert d["lkg_used"] is False

    def test_to_dict_prefers_standardized_source_url(self):
        ev = _make_event(extras={"source_url_standardized": "https://example.gov/x"})
        assert ev.to_dict()["source_url"] == "https://example.gov/x"

    def test_to_dict_lkg_flag_from_cached(self):
        assert _make_event(extras={"cached": True}).to_dict()["lkg_used"] is True


class TestRoundTrip:
    def test_dict_roundtrip(self):
        ev = _make_event(extras={"category": "inflation"})
        back = _event_from_dict(_event_to_dict(ev))
        assert back == ev

    def test_from_dict_defaults(self):
        data = {
            "id": "a" * 40,
            "source": "BLS_ICS",
            "agency": "BLS",
            "country": "US",
            "title": "CPI",
            "date_time_utc": "2026-07-10T12:30:00",  # naive → assumed UTC
        }
        ev = _event_from_dict(data)
        assert ev.date_time_utc.tzinfo is UTC
        assert ev.event_local_tz == "UTC"
        assert ev.impact == "Low"
        assert ev.url == ""


class TestContentHashes:
    def test_bytes_hash_is_16_hex(self):
        h = _content_hash_bytes(b"payload")
        assert len(h) == 16
        assert h == _content_hash_bytes(b"payload")
        assert h != _content_hash_bytes(b"payload2")

    def test_text_hash_ignores_encoding_errors(self):
        assert _content_hash_text("café") == _content_hash_text("café")
        assert len(_content_hash_text("x")) == 16
