# coding: utf-8
"""Stage 6 aggregator: stats math and monthly grouping."""

from __future__ import annotations

import datetime as dt

from intellitrade_scanners.review import aggregator

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 7, 1, 0, 0, tzinfo=UTC)


def _review(month, classification, short, long, cont, pull, case_id):
    return {
        "case_id": case_id, "capture_month": month, "classification": classification,
        "short_return_pct": short, "long_return_pct": long,
        "max_continuation_pct": cont, "max_pullback_pct": pull,
        "captured_at": f"{month}-01T08:00:00Z", "published_at": f"{month}-15T00:00:00Z",
    }


def test_summarize_counts_and_rates():
    reviews = [
        _review("2026-06", "continued", 1.0, 2.0, 3.0, -1.0, 1),
        _review("2026-06", "reversed", -1.0, -2.0, 1.0, -3.0, 2),
        _review("2026-06", "mixed", 0.1, 0.2, 0.5, -0.5, 3),
    ]
    stats = aggregator.summarize(reviews)
    assert stats["count"] == 3
    assert stats["continued"] == 1 and stats["reversed"] == 1 and stats["mixed"] == 1
    assert stats["continued_rate"] == round(1 / 3, 4)
    assert stats["mean_long_return_pct"] == round((2.0 - 2.0 + 0.2) / 3, 4)
    assert stats["median_short_return_pct"] == 0.1


def test_run_writes_monthly_and_aggregate(fake_client):
    fake_client.tables["csm_public_reviews"] = [
        _review("2026-06", "continued", 1.0, 2.0, 3.0, -1.0, 1),
        _review("2026-07", "reversed", -1.0, -2.0, 1.0, -3.0, 2),
    ]
    fake_client.tables["csm_review_cases"] = [
        {"id": 1, "status": "published", "overlapping_case_ids": []},
        {"id": 2, "status": "published", "overlapping_case_ids": [1]},
        {"id": 3, "status": "withheld_missing_data", "overlapping_case_ids": []},
    ]
    summary = aggregator.run(now=NOW, client=fake_client)
    assert summary["months"] == 2
    assert summary["incomplete"] == 1
    agg = fake_client.tables["csm_review_aggregate_stats"][0]["stats"]
    assert agg["incomplete_count"] == 1
    assert agg["overlap_disclosed_count"] == 1
    # idempotent: re-run doesn't duplicate the monthly rows
    aggregator.run(now=NOW, client=fake_client)
    assert len(fake_client.tables["csm_review_monthly_summaries"]) == 2
