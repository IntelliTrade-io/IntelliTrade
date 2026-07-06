"""Pin PMI config loading, release-date rules, and the estimator."""

import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from economic_calendar import pmi
from economic_calendar.pmi import (
    PMI_PROVIDER_DISPLAY,
    PMIOverrideConfig,
    PMIRuleConfig,
    PMISeriesConfig,
    PROVIDER_SPGLOBAL_PMI,
    _calc_pmi_rule_date,
    _estimate_pmi_releases_for_series,
    _infer_pmi_importance,
    _infer_pmi_sector,
    _match_pmi_override_entry,
    _resolve_config_path,
)
from economic_calendar.timeutils import UTC


@pytest.fixture
def pmi_caches_reset(monkeypatch):
    """Blank the module-level lazy caches so each test loads fresh config."""
    for name in ("_PMI_FEEDS", "_PMI_RULE_ENTRIES", "_PMI_RULES", "_PMI_SERIES",
                 "_PMI_OVERRIDES", "_PMI_PRIMARY_FEED_URL", "_PMI_CONFIG_HASH"):
        monkeypatch.setattr(pmi, name, None)
    monkeypatch.setattr(pmi, "_PMI_CONFIG_PATHS", {})


@pytest.fixture
def config_dir(tmp_path, pmi_caches_reset, monkeypatch):
    """Point config resolution at a tmp dir with a minimal valid config set."""
    (tmp_path / "PMI_FEEDS_CATALOG.json").write_text(json.dumps([
        {"url": "https://feeds.example/pmi.rss", "has_future_dates": True},
        {"url": "https://feeds.example/other.rss"},
    ]), encoding="utf-8")
    (tmp_path / "PMI_ESTIMATOR_RULES.json").write_text(json.dumps([
        {
            "series_id": "us_manufacturing_final",
            "label": "US Manufacturing PMI",
            "country": "US",
            "classification": "final",
            "timezone": "America/New_York",
            "default_time_local": "09:45",
            "rule": {"type": "BUSINESS_DAY_OFFSET", "anchor": "MONTH_START", "offset_business_days": 0},
        },
    ]), encoding="utf-8")
    (tmp_path / "PMI_OVERRIDES.json").write_text(json.dumps({
        "us_manufacturing_final": {
            "2026-07": {"override_date_local": "2026-07-02", "override_time_local": "10:00", "reason": "holiday shift"},
        },
    }), encoding="utf-8")
    monkeypatch.setattr(pmi, "_CONFIG_BASE", tmp_path)
    return tmp_path


class TestInference:
    def test_sector(self):
        assert _infer_pmi_sector("US Manufacturing PMI") == "Manufacturing"
        assert _infer_pmi_sector("Services PMI") == "Services"
        assert _infer_pmi_sector("Composite Output") == "Composite"
        assert _infer_pmi_sector("Output Index") == "Output"
        assert _infer_pmi_sector("") == "Composite"

    def test_importance(self):
        assert _infer_pmi_importance("US", "flash", "Manufacturing") == "High"
        assert _infer_pmi_importance("US", "final", "Manufacturing") == "High"
        assert _infer_pmi_importance("AU", "final", "Manufacturing") == "Medium"
        assert _infer_pmi_importance("US", "final", "Output") == "Medium"


class TestRuleDate:
    def _rule(self, **kw):
        base = dict(series_id="s", rule_type="BUSINESS_DAY_OFFSET", anchor="MONTH_START",
                    offset_business_days=0, direction="forward", holiday_mode="")
        base.update(kw)
        return PMIRuleConfig(**base)

    def test_month_start_anchor_shifts_to_business_day(self):
        # 2026-08-01 is a Saturday → first business day Mon 3rd
        assert _calc_pmi_rule_date(2026, 8, self._rule()).day == 3

    def test_month_end_anchor(self):
        # 2026-08-31 is a Monday
        assert _calc_pmi_rule_date(2026, 8, self._rule(anchor="MONTH_END")).day == 31

    def test_offset_business_days(self):
        # first business day of Jul 2026 = Wed 1st; +2 business days = Fri 3rd
        assert _calc_pmi_rule_date(2026, 7, self._rule(offset_business_days=2)).day == 3

    def test_negative_offset_forces_backward(self):
        # last business day of Jul 2026 = Fri 31st; -1 business day = Thu 30th
        rule = self._rule(anchor="MONTH_END", offset_business_days=-1, direction="forward")
        assert _calc_pmi_rule_date(2026, 7, rule).day == 30

    def test_non_business_day_offset_rule_returns_none(self):
        assert _calc_pmi_rule_date(2026, 7, self._rule(rule_type="FIXED_DAY")) is None


class TestOverrideMatch:
    def _entry(self, day):
        return PMIOverrideConfig("s", 2026, 7, day, 9, 0, True)

    def test_exact_day_wins(self):
        entries = [self._entry(1), self._entry(15)]
        assert _match_pmi_override_entry(entries, 15).day == 15

    def test_falls_back_to_first(self):
        entries = [self._entry(1), self._entry(15)]
        assert _match_pmi_override_entry(entries, 20).day == 1

    def test_empty_returns_none(self):
        assert _match_pmi_override_entry([], 1) is None


class TestOverrideToLocal:
    def test_uses_override_time_when_present(self):
        entry = PMIOverrideConfig("s", 2026, 7, 2, 10, 30, True)
        dt = entry.to_local_datetime(ZoneInfo("America/New_York"), (9, 45))
        assert (dt.hour, dt.minute) == (10, 30)

    def test_falls_back_to_series_default_time(self):
        entry = PMIOverrideConfig("s", 2026, 7, 2, 0, 0, False)
        dt = entry.to_local_datetime(ZoneInfo("America/New_York"), (9, 45))
        assert (dt.hour, dt.minute) == (9, 45)


class TestConfigLoading:
    def test_resolve_missing_raises(self, tmp_path, pmi_caches_reset, monkeypatch):
        monkeypatch.setattr(pmi, "_CONFIG_BASE", tmp_path)
        with pytest.raises(FileNotFoundError):
            _resolve_config_path("PMI_FEEDS_CATALOG.json")

    def test_primary_feed_prefers_future_dates(self, config_dir):
        assert pmi._get_pmi_primary_feed_url() == "https://feeds.example/pmi.rss"

    def test_rules_and_series_built_from_entries(self, config_dir):
        rules = pmi._get_pmi_rules()
        series = pmi._get_pmi_series_configs()
        assert rules["us_manufacturing_final"].anchor == "MONTH_START"
        cfg = series["us_manufacturing_final"]
        assert cfg.sector == "Manufacturing"
        assert cfg.importance == "High"
        assert cfg.provider == PMI_PROVIDER_DISPLAY
        assert cfg.feed_source == "https://feeds.example/pmi.rss"

    def test_overrides_parsed(self, config_dir):
        overrides = pmi._get_pmi_overrides()
        entry = overrides["us_manufacturing_final"][(2026, 7)][0]
        assert (entry.day, entry.hour, entry.minute, entry.has_time_override) == (2, 10, 0, True)
        assert entry.reason == "holiday shift"

    def test_config_hash_stable(self, config_dir):
        first = pmi._get_pmi_config_hash()
        assert len(first) == 40
        assert pmi._get_pmi_config_hash() == first


class TestEstimator:
    def test_rule_event_with_override_applied(self, config_dir):
        series = pmi._get_pmi_series_configs()["us_manufacturing_final"]
        rules = pmi._get_pmi_rules()["us_manufacturing_final"]
        overrides = pmi._get_pmi_overrides()
        since = datetime(2026, 7, 1, tzinfo=UTC)
        until = datetime(2026, 7, 31, tzinfo=UTC)
        events = _estimate_pmi_releases_for_series(series, rules, overrides, since, until)
        assert len(events) == 1
        ev = events[0]
        assert ev.source == PROVIDER_SPGLOBAL_PMI
        assert ev.agency == "SPGLOBAL"
        assert ev.extras["discovered_via"] == "rules+override"
        assert ev.extras["time_confidence"] == "override"
        assert ev.extras["override_reason"] == "holiday shift"
        # override 2026-07-02 10:00 America/New_York → 14:00 UTC
        assert ev.date_time_utc == datetime(2026, 7, 2, 14, 0, tzinfo=UTC)

    def test_outside_window_skipped(self, config_dir):
        series = pmi._get_pmi_series_configs()["us_manufacturing_final"]
        rules = pmi._get_pmi_rules()["us_manufacturing_final"]
        since = datetime(2026, 7, 10, tzinfo=UTC)
        until = datetime(2026, 7, 20, tzinfo=UTC)
        assert _estimate_pmi_releases_for_series(series, rules, {}, since, until) == []
