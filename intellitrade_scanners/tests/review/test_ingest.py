# coding: utf-8
"""Stage 1 ingest: hashing, payload preservation, validity, idempotency."""

from __future__ import annotations

import factories as fx

from intellitrade_scanners.review import ingest

FEED = "metaquotes_demo"
STRONG_SCORES = {"EUR": 60, "USD": 30, "GBP": 20, "AUD": 10,
                 "NZD": -10, "CAD": -20, "CHF": -40, "JPY": -60}
LABELS = {"EURJPY": ("bullish", 75)}


def _valid_source(row_id=1, run_ts="2026-06-01T08:05:00Z"):
    return fx.source_row(row_id, run_ts, STRONG_SCORES, LABELS, feed=FEED)


def test_payload_hash_is_stable_and_order_independent():
    payload = ingest.canonical_payload(_valid_source())
    reordered = {k: payload[k] for k in reversed(list(payload))}
    assert ingest.payload_hash(payload) == ingest.payload_hash(reordered)


def test_build_review_snapshot_preserves_payload_and_sets_close_ts():
    rec = ingest.build_review_snapshot(_valid_source(), FEED)
    assert rec["completeness"] == "complete"
    assert rec["candle_close_ts"] == "2026-06-01T08:00:00Z"
    # payload preserved exactly (pairs + currencies survive round-trip)
    assert rec["payload"]["pairs"]["EURJPY"]["pair"] == "bullish"
    assert rec["ladder"][0]["currency"] == "EUR"
    assert rec["ladder"][-1]["currency"] == "JPY"


def test_missing_candle_metadata_is_invalid():
    row = _valid_source()
    del row["run_info"]["run_id"]
    rec = ingest.build_review_snapshot(row, FEED)
    assert rec["completeness"] == "invalid"
    assert "missing_candle_metadata" in rec["quality_flags"]


def test_weekend_run_is_invalid():
    # 2026-06-06 is a Saturday.
    row = _valid_source(run_ts="2026-06-06T08:05:00Z")
    rec = ingest.build_review_snapshot(row, FEED)
    assert rec["completeness"] == "invalid"
    assert "weekend_or_stale" in rec["quality_flags"]


def test_outside_run_window_is_invalid():
    # 90 minutes after the boundary -> stale/manual re-run.
    row = _valid_source(run_ts="2026-06-01T09:35:00Z")
    rec = ingest.build_review_snapshot(row, FEED)
    assert "outside_run_window" in rec["quality_flags"]


def test_run_ingests_once_and_is_idempotent(fake_client):
    fake_client.tables["fx_strength_snapshots"] = [_valid_source(1), _valid_source(2, "2026-06-01T12:05:00Z")]
    first = ingest.run(FEED, client=fake_client)
    assert first["inserted"] == 2
    # re-run: nothing new (already-ingested source ids skipped)
    second = ingest.run(FEED, client=fake_client)
    assert second["inserted"] == 0
    assert len(fake_client.tables["csm_review_snapshots"]) == 2


def test_duplicate_candle_close_rejected(fake_client):
    # Two runs sharing the same H4 boundary (weekend stale duplicate style).
    fake_client.tables["fx_strength_snapshots"] = [
        _valid_source(1, "2026-06-01T08:05:00Z"),
        _valid_source(2, "2026-06-01T08:20:00Z"),  # same floor4h -> same candle_close_ts
    ]
    summary = ingest.run(FEED, client=fake_client)
    assert summary["inserted"] == 1
    assert summary["skipped"] >= 1


def test_invalid_row_still_stored_as_lineage(fake_client):
    row = _valid_source(1)
    del row["run_info"]["run_id"]  # -> invalid
    fake_client.tables["fx_strength_snapshots"] = [row]
    summary = ingest.run(FEED, client=fake_client)
    assert summary["inserted"] == 1
    assert summary["invalid"] == 1
    assert fake_client.tables["csm_review_snapshots"][0]["completeness"] == "invalid"
