"""BLS reconcile machinery: candidate selection, curated matching, status ladder.

The most intricate source logic in the scraper — these tests pin the decision
tree of _reconcile_bls_candidates and its helpers with synthetic candidates
(no network, no fixtures needed: candidates are plain dicts).
"""

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from economic_calendar.sources.bls import (
    _bls_candidate,
    _bls_candidate_dt,
    _bls_curated_candidates,
    _bls_event_from_candidate,
    _group_bls_candidates_by_time,
    _match_bls_curated_occurrences,
    _reconcile_bls_candidates,
    _select_bls_official_candidate,
    verify_bls_release_published,
)
from economic_calendar.timeutils import UTC

CPI_JULY = datetime(2026, 7, 14, 12, 30, tzinfo=UTC)  # curated override date


def _cand(key="BLS_CPI", dt=CPI_JULY, path="ics", reliability="official", url=""):
    return _bls_candidate(
        key, dt,
        source_path=path,
        source_url=url,
        release_title_raw="",
        confidence="tentative",
        source_reliability=reliability,
    )


class TestCandidateDt:
    def test_datetime_passthrough_and_naive_utc(self):
        assert _bls_candidate_dt({"date_time_utc": CPI_JULY}) == CPI_JULY
        naive = {"date_time_utc": datetime(2026, 7, 14, 12, 30)}
        assert _bls_candidate_dt(naive).tzinfo is UTC

    def test_iso_string_with_z(self):
        assert _bls_candidate_dt({"date_time_utc": "2026-07-14T12:30:00Z"}) == CPI_JULY


class TestSelectOfficial:
    def test_majority_bucket_wins_with_high_confidence(self):
        other = CPI_JULY + timedelta(days=1)
        selected, confidence = _select_bls_official_candidate(
            [_cand(path="ics"), _cand(path="html"), _cand(dt=other, path="ics")]
        )
        assert _bls_candidate_dt(selected) == CPI_JULY
        assert confidence == "high"

    def test_single_source_is_medium_high(self):
        _, confidence = _select_bls_official_candidate([_cand()])
        assert confidence == "medium_high"

    def test_tie_broken_by_earliest_time(self):
        later = CPI_JULY + timedelta(hours=2)
        selected, _ = _select_bls_official_candidate([_cand(dt=later), _cand()])
        assert _bls_candidate_dt(selected) == CPI_JULY


class TestGrouping:
    def test_groups_sorted_by_time(self):
        later = CPI_JULY + timedelta(days=30)
        groups = _group_bls_candidates_by_time([_cand(dt=later), _cand(), _cand()])
        assert [len(g) for g in groups] == [2, 1]
        assert _bls_candidate_dt(groups[0][0]) == CPI_JULY


class TestCuratedMatching:
    def test_exact_match_reserved_before_nearest(self):
        # Official occurrences: late June (unusual) and mid July.
        june_official = _cand(dt=datetime(2026, 6, 30, 12, 30, tzinfo=UTC))
        july_official = _cand()
        # Curated estimate exists only for July, at the exact July time.
        july_curated = _cand(reliability="curated")
        matches = _match_bls_curated_occurrences([june_official, july_official], [july_curated])
        july_key = _bls_candidate_dt(july_official).isoformat(timespec="minutes")
        june_key = _bls_candidate_dt(june_official).isoformat(timespec="minutes")
        # July keeps its exact match; June must NOT steal it despite being first.
        assert matches[july_key] is july_curated
        assert june_key not in matches

    def test_nearest_within_14_days_matches(self):
        official = _cand()
        curated = _cand(dt=CPI_JULY + timedelta(days=3), reliability="curated")
        matches = _match_bls_curated_occurrences([official], [curated])
        assert list(matches.values()) == [curated]

    def test_beyond_14_days_unmatched(self):
        official = _cand()
        curated = _cand(dt=CPI_JULY + timedelta(days=20), reliability="curated")
        assert _match_bls_curated_occurrences([official], [curated]) == {}


class TestVerifyPublished:
    def test_future_release_not_due(self):
        as_of = CPI_JULY - timedelta(hours=1)
        assert verify_bls_release_published("BLS_CPI", CPI_JULY, as_of_utc=as_of) == "not_due"

    def test_disabled_returns_unknown(self):
        as_of = CPI_JULY + timedelta(hours=1)
        assert verify_bls_release_published("BLS_CPI", CPI_JULY, enabled=False, as_of_utc=as_of) == "unknown"

    def test_enabled_reads_api(self):
        as_of = CPI_JULY + timedelta(hours=1)
        payload = {"Results": {"series": [{"data": [{"value": "1"}]}]}}
        session = SimpleNamespace(get=lambda url, timeout: SimpleNamespace(ok=True, json=lambda: payload))
        assert verify_bls_release_published("BLS_CPI", CPI_JULY, session=session, enabled=True, as_of_utc=as_of) == "published"
        empty = {"Results": {"series": [{"data": []}]}}
        session = SimpleNamespace(get=lambda url, timeout: SimpleNamespace(ok=True, json=lambda: empty))
        assert verify_bls_release_published("BLS_CPI", CPI_JULY, session=session, enabled=True, as_of_utc=as_of) == "not_yet_updated"

    def test_api_error_unknown(self):
        as_of = CPI_JULY + timedelta(hours=1)
        def boom(url, timeout):
            raise OSError("down")
        session = SimpleNamespace(get=boom)
        assert verify_bls_release_published("BLS_CPI", CPI_JULY, session=session, enabled=True, as_of_utc=as_of) == "unknown"


class TestCuratedCandidates:
    def test_override_replaces_rule_date_for_its_month(self):
        start = datetime(2026, 7, 1, tzinfo=UTC)
        end = datetime(2026, 7, 31, tzinfo=UTC)
        cpi = [c for c in _bls_curated_candidates(start, end) if c["canonical_key"] == "BLS_CPI"]
        assert len(cpi) == 1
        # Curated override 2026-07-14, NOT the 8th-business-day rule date (2026-07-10).
        assert _bls_candidate_dt(cpi[0]) == CPI_JULY
        assert cpi[0]["source_reliability"] == "curated"

    def test_rule_generates_when_month_not_overridden(self):
        # BLS_PRODUCTIVITY_COSTS overrides list only June + August 2026; September
        # has no override, so the quarterly rule yields nothing (Sep not in {2,5,8,11})
        # while EMPLOYMENT_SITUATION's monthly rule does fire.
        start = datetime(2026, 9, 1, tzinfo=UTC)
        end = datetime(2026, 9, 30, tzinfo=UTC)
        keys = {c["canonical_key"] for c in _bls_curated_candidates(start, end)}
        assert "BLS_EMPLOYMENT_SITUATION" in keys
        assert "BLS_PRODUCTIVITY_COSTS" not in keys


class TestReconcile:
    AS_OF_FRESH = datetime(2026, 6, 10, tzinfo=UTC)   # within BLS 14-day curated budget (reviewed 2026-05-31)
    AS_OF_STALE = datetime(2026, 7, 6, tzinfo=UTC)    # past it

    def test_two_official_sources_agree_healthy_high(self):
        events, health = _reconcile_bls_candidates(
            [_cand(path="ics"), _cand(path="official_html")],
            required_keys=["BLS_CPI"],
            source_status={"live_sources_succeeded": ["ics"]},
            as_of_utc=self.AS_OF_FRESH,
        )
        assert len(events) == 1
        ev = events[0]
        assert ev.title == "US Consumer Price Index (CPI)"
        assert ev.extras["schedule_confidence"] == "high"
        assert ev.extras["time_confidence"] == "exact"
        assert ev.extras["post_release_status"] == "not_due"
        assert health["status"] == "healthy"
        assert health["alert_severity"] == "none"

    def test_official_curated_conflict_warns_but_stays_healthy(self):
        conflicting_curated = _cand(dt=CPI_JULY + timedelta(days=1), reliability="curated", path="curated")
        events, health = _reconcile_bls_candidates(
            [_cand(path="ics"), conflicting_curated],
            required_keys=["BLS_CPI"],
            as_of_utc=self.AS_OF_FRESH,
        )
        assert len(events) == 1
        assert health["status"] == "healthy"
        assert health["alert_severity"] == "warning"
        assert health["source_conflicts"]
        # the conflicting curated candidate is preserved in the event's audit trail
        assert len(events[0].extras["bls_candidates"]) == 2

    def test_curated_only_fresh_is_fallback_fresh(self):
        events, health = _reconcile_bls_candidates(
            [_cand(reliability="curated", path="curated")],
            required_keys=["BLS_CPI"],
            as_of_utc=self.AS_OF_FRESH,
        )
        assert len(events) == 1
        assert events[0].extras["fallback_reason"]
        assert health["status"] == "fallback_fresh"
        assert health["curated_fallback_used"] is True
        assert health["alert_severity"] in {"warning", "low_warning", "elevated_warning"}

    def test_curated_only_stale_fails(self):
        _, health = _reconcile_bls_candidates(
            [_cand(reliability="curated", path="curated")],
            required_keys=["BLS_CPI"],
            as_of_utc=self.AS_OF_STALE,
        )
        assert health["status"] == "failed"
        assert health["stale_required"] == ["BLS_CPI"]

    def test_missing_required_fails(self):
        _, health = _reconcile_bls_candidates(
            [], required_keys=["BLS_CPI"], as_of_utc=self.AS_OF_FRESH,
        )
        assert health["status"] == "failed"
        assert health["required_missing"] == ["BLS_CPI"]
        assert health["required_market_movers_present"] == {"BLS_CPI": False}

    def test_lkg_only_selected_with_warning(self):
        events, health = _reconcile_bls_candidates(
            [_cand(reliability="last_known_good", path="lkg")],
            required_keys=["BLS_CPI"],
            as_of_utc=self.AS_OF_FRESH,
        )
        assert len(events) == 1
        assert events[0].extras["cached"] is True
        assert any("LKG" in w for w in health["warnings"])

    def test_next_required_event_payload(self):
        _, health = _reconcile_bls_candidates(
            [_cand(path="ics")],
            required_keys=["BLS_CPI"],
            as_of_utc=self.AS_OF_FRESH,
        )
        nxt = health["next_required_bls_event"]
        assert nxt["canonical_key"] == "BLS_CPI"
        assert nxt["date_time_utc"] == CPI_JULY.isoformat()


class TestEventFromCandidate:
    def test_canonical_identity_and_audit_trail(self):
        selected = _cand(path="ics")
        ev = _bls_event_from_candidate(
            selected, [selected], schedule_confidence="high", post_release_status="not_due",
        )
        assert ev.title == "US Consumer Price Index (CPI)"
        assert ev.source == "BLS_ICS"
        assert ev.event_local_tz == "America/New_York"
        assert ev.extras["release_time_local"] == "08:30"  # 12:30 UTC in July = 08:30 ET
        assert ev.extras["bls_candidates"][0]["date_time_utc"] == CPI_JULY.isoformat()
        assert ev.extras["default_dashboard"] is True
