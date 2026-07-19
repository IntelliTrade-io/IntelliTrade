# coding: utf-8
"""Stage 5 publisher: slugs, flag gating, idempotency, whitelist projection."""

from __future__ import annotations

import datetime as dt

from intellitrade_scanners.review import publisher

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 6, 20, 0, 0, tzinfo=UTC)


def test_base_slug_format():
    slug = publisher.base_slug("EUR", "JPY", "2026-06-01T08:00:00Z")
    assert slug == "eur-strongest-jpy-weakest-june-1-2026"


def test_resolve_slug_collision_suffix():
    existing = {"eur-strongest-jpy-weakest-june-1-2026"}
    assert publisher.resolve_slug("eur-strongest-jpy-weakest-june-1-2026", existing) \
        == "eur-strongest-jpy-weakest-june-1-2026-2"


def test_confidence_band():
    assert publisher.confidence_band(85) == "high"
    assert publisher.confidence_band(70) == "elevated"
    assert publisher.confidence_band(60) == "moderate"


def _seed(fake_client, status="ready_for_publication"):
    fake_client.tables["csm_review_snapshots"] = [
        {"id": 1, "ladder": [{"rank": r + 1, "currency": c, "score": 10.0}
                             for r, c in enumerate(
                                 ["EUR", "USD", "GBP", "AUD", "NZD", "CAD", "CHF", "JPY"])]}
    ]
    fake_client.tables["csm_review_cases"] = [{
        "id": 10, "review_snapshot_id": 1, "feed_name": "metaquotes_demo",
        "status": status, "strong_currency": "EUR", "weak_currency": "JPY",
        "pair_symbol": "EURJPY", "direction_multiplier": 1, "pair_confidence": 75,
        "regime_state_at_open": "confirmed", "captured_at": "2026-06-01T08:00:00Z",
        "reference_open_time": "2026-06-01T04:00:00Z",
        "reference_close_time": "2026-06-01T08:00:00Z",
    }]
    fake_client.tables["csm_review_evaluations"] = [{
        "id": 1, "case_id": 10, "evaluation_version": "1.0.0",
        "reference_close": 160.0, "short_return_norm_pct": 1.5, "long_return_norm_pct": 2.5,
        "max_continuation_pct": 3.1, "max_continuation_at": "2026-06-10T00:00:00Z",
        "max_pullback_pct": -0.8, "max_pullback_at": "2026-06-05T00:00:00Z",
        "classification": "continued", "explanation_text": "EUR was strongest.",
        "long_bar_close_time": "2026-06-11T00:00:00Z",
    }]


def test_flag_off_publishes_nothing(fake_client, monkeypatch):
    monkeypatch.delenv("CSM_PUBLIC_REVIEWS_ENABLED", raising=False)
    _seed(fake_client)
    summary = publisher.run("metaquotes_demo", now=NOW, client=fake_client)
    assert summary == {"published": 0, "skipped": "flag_off"}
    assert fake_client.tables.get("csm_public_reviews", []) == []


def test_only_ready_cases_project(fake_client, monkeypatch):
    monkeypatch.setenv("CSM_PUBLIC_REVIEWS_ENABLED", "true")
    _seed(fake_client, status="evaluating")  # not ready
    summary = publisher.run("metaquotes_demo", now=NOW, client=fake_client)
    assert summary["published"] == 0


def test_publishes_and_is_idempotent(fake_client, monkeypatch):
    monkeypatch.setenv("CSM_PUBLIC_REVIEWS_ENABLED", "true")
    _seed(fake_client)
    first = publisher.run("metaquotes_demo", now=NOW, client=fake_client)
    assert first["published"] == 1
    row = fake_client.tables["csm_public_reviews"][0]
    assert row["slug"] == "eur-strongest-jpy-weakest-june-1-2026"
    assert row["classification"] == "continued"
    assert row["chart_to"] == "2026-06-11T00:00:00Z"
    assert len(row["ladder"]) == 8
    assert row["capture_month"] == "2026-06"
    # case marked published
    assert fake_client.tables["csm_review_cases"][0]["status"] == "published"
    # re-run: no duplicate (case already published, not ready)
    second = publisher.run("metaquotes_demo", now=NOW, client=fake_client)
    assert second["published"] == 0
    assert len(fake_client.tables["csm_public_reviews"]) == 1
