"""Pin eventish/text helpers."""

from types import SimpleNamespace

from economic_calendar.textutils import (
    _eventish_extras,
    _eventish_text_blob,
    _eventish_value,
    _normalize_metadata_text,
    _regex_has_any,
    _text_has_any,
)


class TestEventish:
    def test_value_from_dict_and_object(self):
        assert _eventish_value({"title": "CPI"}, "title") == "CPI"
        assert _eventish_value(SimpleNamespace(title="CPI"), "title") == "CPI"
        assert _eventish_value({}, "title", "x") == "x"

    def test_extras_requires_dict(self):
        assert _eventish_extras({"extras": {"a": 1}}) == {"a": 1}
        assert _eventish_extras({"extras": "junk"}) == {}
        assert _eventish_extras({}) == {}


class TestNormalize:
    def test_unicode_quotes_dashes_whitespace(self):
        assert _normalize_metadata_text("It’s  a – test\n") == "It's a - test"

    def test_none_is_empty(self):
        assert _normalize_metadata_text(None) == ""


class TestTextBlob:
    def test_composes_lowercased_fields(self):
        blob = _eventish_text_blob({
            "title": "CPI Release",
            "agency": "BLS",
            "extras": {"provider": "Official", "series_id": "CPI_US"},
        })
        assert "cpi release" in blob
        assert "bls" in blob
        assert "cpi_us" in blob


class TestMatchers:
    def test_text_has_any(self):
        assert _text_has_any("flash pmi day", ("pmi",))
        assert not _text_has_any("quiet day", ("pmi",))

    def test_regex_has_any(self):
        assert _regex_has_any("us cpi report", (r"\bcpi\b",))
        assert not _regex_has_any("script", (r"\bcpi\b",))
