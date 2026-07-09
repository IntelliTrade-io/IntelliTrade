"""Pin classification and metadata enrichment behavior."""

from datetime import datetime

import pytest

from economic_calendar.enrich import (
    _abs_market_mover_allowed,
    _default_dashboard_allowed,
    _ecb_event_classification,
    _enrich_event_metadata,
    _impact_from_score,
    _infer_event_category,
    _infer_event_description,
    _infer_pair_relevance,
    _infer_source_reliability,
    _is_low_signal_event,
    _normalize_event_country_code,
    _standardize_source_url,
    _trader_relevance_score,
    _url_is_official,
    classify_event,
)
from economic_calendar.events import Event, make_id
from economic_calendar.timeutils import UTC


def _event(**overrides):
    dt = overrides.pop("date_time_utc", datetime(2026, 7, 14, 12, 30, tzinfo=UTC))
    fields = {
        "source": "BLS_ICS",
        "agency": "BLS",
        "country": "US",
        "title": "Consumer Price Index",
        "date_time_utc": dt,
        "event_local_tz": "America/New_York",
        "impact": "High",
        "url": "https://www.bls.gov/schedule/news_release/cpi.htm",
    }
    fields.update(overrides)
    fields.setdefault("id", make_id(fields["country"], fields["agency"], fields["title"], dt))
    return Event(**fields)


class TestClassifyEvent:
    def test_high_medium_low(self):
        assert classify_event("US CPI release") == "High"
        assert classify_event("Retail sales monthly") == "Medium"
        assert classify_event("Annual pottery survey") == "Low"


class TestCountryCode:
    def test_from_country_field(self):
        assert _normalize_event_country_code({"country": "United Kingdom"}) == "GB"

    def test_from_agency_hint(self):
        assert _normalize_event_country_code({"country": "??", "agency": "STATCAN"}) == "CA"

    def test_from_title_phrase(self):
        assert _normalize_event_country_code({"country": "", "agency": "", "title": "Swiss trade data"}) == "CH"

    def test_unknown_empty(self):
        assert _normalize_event_country_code({"country": "", "agency": "", "title": "mystery"}) == ""


class TestCategory:
    def test_central_bank_by_agency(self):
        assert _infer_event_category({"agency": "FED", "title": "whatever"}) == "central_bank"

    def test_pmi(self):
        assert _infer_event_category({"agency": "X1", "title": "Flash Manufacturing PMI"}) == "pmi"

    def test_inflation_with_negative_guard(self):
        assert _infer_event_category({"agency": "X1", "title": "Consumer price index"}) == "inflation"
        # house-price index is excluded from inflation, lands in real_estate
        assert _infer_event_category({"agency": "X1", "title": "House price index"}) == "real_estate"

    def test_labor(self):
        assert _infer_event_category({"agency": "X1", "title": "Unemployment rate"}) == "labor"

    def test_other(self):
        assert _infer_event_category({"agency": "X1", "title": "Village fair"}) == "other"


class TestPairRelevance:
    def test_us_central_bank_gets_rates_assets(self):
        rel = _infer_pair_relevance({"agency": "FED", "country": "US", "title": "FOMC"})
        assert "EURUSD" in rel["primary_fx_pairs"]
        assert "US10Y" in rel["related_assets"]

    def test_eurozone_alias_de(self):
        rel = _infer_pair_relevance({"agency": "X1", "country": "DE", "title": "Factory orders"})
        assert "EURUSD" in rel["primary_fx_pairs"]

    def test_cn_pmi_override_merged(self):
        rel = _infer_pair_relevance({"agency": "NBS", "country": "CN", "title": "Manufacturing PMI"})
        assert "HK50" in rel["related_assets"]


class TestUrls:
    def test_official_domain_check(self):
        assert _url_is_official("https://www.bls.gov/cpi")
        assert not _url_is_official("https://example.com/cpi")
        assert not _url_is_official("")

    def test_official_raw_url_passes_through(self):
        ev = {"source": "BLS", "agency": "BLS", "url": "https://www.bls.gov/schedule/news_release/cpi.htm", "extras": {}}
        assert _standardize_source_url(ev) == "https://www.bls.gov/schedule/news_release/cpi.htm"

    def test_fed_fallback(self):
        ev = {"source": "FED", "agency": "FED", "url": "", "extras": {}}
        assert _standardize_source_url(ev) == "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"

    def test_spglobal_builds_query_url(self):
        ev = {
            "source": "SPGLOBAL_PMI", "agency": "SPGLOBAL", "country": "US",
            "title": "US Manufacturing PMI", "url": "", "extras": {"series_id": "US_MANUFACTURING_FINAL"},
        }
        url = _standardize_source_url(ev)
        assert url.startswith("https://www.pmi.spglobal.com/Public/Release/ReleaseDates")
        assert "kw=" in url


class TestDescriptions:
    def test_central_bank_map(self):
        desc = _infer_event_description({"agency": "FED", "title": "FOMC Meeting"})
        assert desc.startswith("Communicates the Federal Reserve's")

    def test_us_cpi(self):
        desc = _infer_event_description({"agency": "BLS", "country": "US", "title": "Consumer Price Index"})
        assert "United States" in desc and "inflation" in desc


class TestReliability:
    @pytest.mark.parametrize("extras,source,expected", [
        ({"cached": True}, "BLS", "last_known_good"),
        ({"discovered_via": "lkg"}, "BLS", "last_known_good"),
        ({"discovered_via": "curated_official_schedule"}, "BLS", "curated"),
        ({"discovered_via": "rules"}, "BLS", "fallback"),
        ({}, "BLS", "official"),
    ])
    def test_paths(self, extras, source, expected):
        assert _infer_source_reliability({"source": source, "extras": extras}) == expected


class TestGates:
    def test_low_signal(self):
        assert _is_low_signal_event({"title": "Dairy production update"})
        assert not _is_low_signal_event({"title": "CPI"})

    def test_abs_suppressed_beats_mover(self):
        assert not _abs_market_mover_allowed({"agency": "ABS", "title": "Experimental labour force estimates"})
        assert _abs_market_mover_allowed({"agency": "ABS", "title": "ABS Labour force, Australia"})

    def test_impact_from_score_boundaries(self):
        assert _impact_from_score(80) == "High"
        assert _impact_from_score(79) == "Medium"
        assert _impact_from_score(60) == "Medium"
        assert _impact_from_score(59) == "Low"

    def test_dashboard_central_bank_always(self):
        ev = {"agency": "BOE", "title": "Bank Rate decision", "extras": {}}
        assert _default_dashboard_allowed(ev, "central_bank", 50, "Low")

    def test_dashboard_blocks_low_signal(self):
        ev = {"agency": "X1", "title": "Dairy production update", "extras": {}}
        assert not _default_dashboard_allowed(ev, "consumer", 90, "High")


class TestScoring:
    def test_bls_canonical_score_wins(self):
        ev = {"agency": "BLS", "title": "Employment Situation", "extras": {}}
        assert _trader_relevance_score(ev, "labor", "official") == 90

    def test_low_signal_capped(self):
        ev = {"agency": "X1", "title": "Dairy production update", "impact": "High", "extras": {}}
        assert _trader_relevance_score(ev, "consumer", "official") <= 25

    def test_speaker_score_passthrough(self):
        ev = {"extras": {"speaker_event": True, "trader_relevance_score": 999}}
        assert _trader_relevance_score(ev, "central_bank", "official") == 100


class TestEcbClassification:
    def test_non_ecb_none(self):
        assert _ecb_event_classification({"agency": "FED", "source": "FED"}) is None

    def test_press_conference(self):
        info = _ecb_event_classification({"agency": "ECB", "title": "ECB press conference", "extras": {}})
        assert info["impact"] == "High" and info["default_dashboard"] is True

    def test_day1_non_monetary_low(self):
        info = _ecb_event_classification({"agency": "ECB", "title": "Meeting", "extras": {"day_index": 1}})
        assert info["impact"] == "Low" and info["default_dashboard"] is False


class TestEnrichPipeline:
    def test_event_gets_bls_canonical_treatment(self):
        ev = _event()  # BLS CPI
        _enrich_event_metadata(ev)
        assert ev.title == "US Consumer Price Index (CPI)"
        assert ev.impact == "High"
        assert ev.extras["category"] == "inflation"
        assert ev.extras["trader_relevance_score"] == 90
        assert ev.extras["default_dashboard"] is True
        assert ev.extras["source_url_standardized"].startswith("https://www.bls.gov/")
        assert ev.extras["event_description"]
        assert "EURUSD" in ev.extras["asset_focus"]

    def test_dict_event_mirrors_extras_to_top_level(self):
        ev = {
            "source": "BLS_ICS", "agency": "BLS", "country": "US",
            "title": "Consumer Price Index", "impact": "High",
            "url": "https://www.bls.gov/schedule/news_release/cpi.htm",
            "date_time_utc": "2026-07-14T12:30:00+00:00",
            "event_local_tz": "America/New_York", "extras": {},
        }
        out = _enrich_event_metadata(ev)
        assert out["title"] == "US Consumer Price Index (CPI)"
        assert out["trader_relevance_score"] == 90
        assert out["default_dashboard"] is True
        assert out["extras"]["category"] == "inflation"
        assert out["event_time_utc"] == out["date_time_utc"]

    def test_speaker_event_category_forced(self):
        ev = {
            "source": "FED_SPEAKERS", "agency": "FED", "country": "US",
            "title": "Governor speech", "impact": "Low", "url": "",
            "date_time_utc": "2026-07-14T12:30:00+00:00",
            "extras": {"speaker_event": True, "trader_relevance_score": 70,
                       "default_dashboard": True, "asset_focus": ["EURUSD"]},
        }
        out = _enrich_event_metadata(ev)
        assert out["extras"]["category"] == "central_bank"
        assert out["trader_relevance_score"] == 70
        assert out["asset_focus"] == ["EURUSD"]
