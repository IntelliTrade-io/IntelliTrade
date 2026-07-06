"""Pin central-bank speaker collection: identity, scoring, parsing, dedupe."""

from datetime import datetime
from types import SimpleNamespace

import pytest

bs4 = pytest.importorskip("bs4")
from bs4 import BeautifulSoup

from economic_calendar import speakers
from economic_calendar.runstate import RUN_CONTEXT
from economic_calendar.speakers import (
    _central_bank_speaker_sources,
    _dedupe_central_bank_speaker_events,
    _parse_central_bank_speaker_html,
    _speaker_datetime_from_value,
    _speaker_event_type,
    _speaker_identity,
    _speaker_response_classification,
    _speaker_role_score,
    _speaker_score_and_visibility,
    _speaker_title,
    collect_central_bank_speaker_events,
)
from economic_calendar.timeutils import UTC

WINDOW_START = datetime(2026, 7, 1, tzinfo=UTC)
WINDOW_END = datetime(2026, 7, 31, tzinfo=UTC)


class TestSources:
    def test_year_expansion(self):
        sources = _central_bank_speaker_sources(
            datetime(2026, 12, 20, tzinfo=UTC), datetime(2027, 1, 10, tzinfo=UTC)
        )
        paths = {s["source_path"] for s in sources}
        assert {"fed_speeches_2026", "fed_speeches_2027", "boj_speeches_2026", "boj_speeches_2027"} <= paths


class TestResponseClassification:
    def test_kinds(self):
        assert _speaker_response_classification(b"", "", 200) == "empty"
        assert _speaker_response_classification(b"denied", "", 403) == "blocked"
        assert _speaker_response_classification(b"<html><body/>", "text/html", 200) == "html"
        assert _speaker_response_classification(b"plain", "text/plain", 200) == "text"


class TestIdentity:
    def test_fed_scores_capped(self):
        assert _speaker_role_score("FED", "Governor", 90) == 75
        assert _speaker_role_score("FED", "Regional Fed President", 92) == 68
        assert _speaker_role_score("BOE", "Governor", 0) == 92

    def test_known_name_lookup(self):
        name, role, score = _speaker_identity("BOE", "Speech by Andrew Bailey on inflation")
        assert (name, role, score) == ("Andrew Bailey", "Governor", 92)

    def test_role_rule_with_trailing_name(self):
        name, role, score = _speaker_identity("BOC", "Deputy Governor Carolyn Rogers speaks at conference")
        assert role == "Deputy Governor"
        assert name.startswith("Carolyn")
        assert score == 80

    def test_no_match(self):
        assert _speaker_identity("SNB", "quarterly bulletin published") == ("", "", 0)


class TestEventType:
    @pytest.mark.parametrize("text,expected", [
        ("Beige Book release", "beige_book"),
        ("Testimony before the committee", "testimony"),
        ("Post-meeting press conference", "press_conference"),
        ("Panel discussion", "panel"),
        ("TV interview", "interview"),
        ("Opening remarks", "remarks"),
        ("Speech on outlook", "speech"),
    ])
    def test_mapping(self, text, expected):
        assert _speaker_event_type(text) == expected


class TestScoreVisibility:
    def test_policy_topic_bumps(self):
        score, dashboard, impact = _speaker_score_and_visibility("BOE", 80, "Deputy Governor", "speech on monetary policy", "exact")
        assert score == 85
        assert dashboard is True  # policy relevant, >= 68

    def test_technical_only_penalized(self):
        score, dashboard, _ = _speaker_score_and_visibility("BOE", 72, "Policy Committee Member", "fintech payments seminar", "exact")
        assert score == 57
        assert dashboard is False

    def test_date_only_hides_non_top_tier(self):
        _, dashboard, _ = _speaker_score_and_visibility("BOE", 80, "Deputy Governor", "speech on inflation", "date_only")
        assert dashboard is False

    def test_top_tier_survives_date_only(self):
        _, dashboard, _ = _speaker_score_and_visibility("BOE", 92, "Governor", "ceremony", "date_only")
        assert dashboard is True


class TestDatetimeParsing:
    def test_iso_with_offset(self):
        dt, confidence = _speaker_datetime_from_value("2026-07-10T14:30:00+01:00", "Europe/London")
        assert confidence == "exact"
        assert dt == datetime(2026, 7, 10, 13, 30, tzinfo=UTC)

    def test_date_only_defaults_noon_local(self):
        dt, confidence = _speaker_datetime_from_value("July 10, 2026", "Europe/London")
        assert confidence == "date_only"
        assert dt.astimezone(UTC).hour == 11  # noon BST

    def test_garbage_none(self):
        assert _speaker_datetime_from_value("not a date at all", "Europe/London") == (None, "")


class TestTitle:
    def test_variants(self):
        assert _speaker_title("FED", "", "", "beige_book") == "Federal Reserve Beige Book"
        assert _speaker_title("BOE", "Andrew Bailey", "Governor", "testimony") == "BoE Governor Bailey Testimony"
        assert _speaker_title("ECB", "Christine Lagarde", "President", "speech") == "ECB President Lagarde Speaks"


SPEAKER_PAGE = """
<html><body>
<article>
  <time datetime="2026-07-10T12:00:00+01:00"></time>
  Speech by Andrew Bailey, Governor, on monetary policy and inflation
  <a href="https://www.bankofengland.co.uk/speech/2026/july/governor">details</a>
</article>
<article>
  <time datetime="2026-07-10T12:00:00+01:00"></time>
  Speech by Andrew Bailey, Governor, on monetary policy and inflation
  <a href="https://www.bankofengland.co.uk/speech/2026/july/governor/full-text">details</a>
</article>
<li>Unrelated bulletin item with no keywords</li>
</body></html>
"""


class TestHtmlParsing:
    def test_parse_extracts_and_dedupes(self):
        events = _parse_central_bank_speaker_html(
            "BOE", SPEAKER_PAGE, "https://www.bankofengland.co.uk/news/upcoming",
            "boe_upcoming_events", WINDOW_START, WINDOW_END,
        )
        assert len(events) == 1
        ev = events[0]
        assert ev.agency == "BOE"
        assert ev.source == "BOE_SPEAKERS"
        assert ev.title == "BoE Governor Bailey Speaks"
        assert ev.extras["speaker_event"] is True
        assert ev.extras["policy_relevance"] is True
        assert ev.date_time_utc == datetime(2026, 7, 10, 11, 0, tzinfo=UTC)
        # dedupe merged both source candidates
        assert len(ev.extras["source_candidates"]) == 2

    def test_unknown_institution_empty(self):
        assert _parse_central_bank_speaker_html("XXX", SPEAKER_PAGE, "u", "p", WINDOW_START, WINDOW_END) == []


class TestCollect:
    def test_collect_writes_health(self, monkeypatch):
        def fake_request(session, url):
            if "bankofengland" in url and "news/upcoming" in url:
                return SimpleNamespace(status_code=200, text=SPEAKER_PAGE)
            return None  # every other source fails

        monkeypatch.setattr(speakers, "_request_central_bank_speaker_source", fake_request)
        RUN_CONTEXT.pop("central_bank_speakers_health", None)

        events = collect_central_bank_speaker_events(object(), WINDOW_START, WINDOW_END)

        assert len(events) == 1
        health = RUN_CONTEXT["central_bank_speakers_health"]
        assert health["status"] == "DEGRADED"  # other institutions failed
        assert health["by_institution"]["BOE"]["count"] == 1
        assert health["by_institution"]["BOE"]["status"] == "HEALTHY"
        assert "FED speaker live sources failed" in health["warnings"]
        assert health["speaker_event_count"] == 1
        RUN_CONTEXT.pop("central_bank_speakers_health", None)
