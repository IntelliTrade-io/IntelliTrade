# coding: utf-8
"""Stage 3 detector: qualification, single-open, reset, direction, lineage."""

from __future__ import annotations

import datetime as dt

import factories as fx

from intellitrade_scanners.review import detector
from intellitrade_scanners.review.constants import RESET_SNAPSHOTS

UTC = dt.timezone.utc
BASE = dt.datetime(2026, 6, 1, 0, 0, tzinfo=UTC)


def _ts(i: int) -> str:
    return (BASE + dt.timedelta(hours=4 * i)).isoformat().replace("+00:00", "Z")


def _qualifying(i, strong="EUR", weak="JPY", conf=75, weak_score=-60):
    scores = {strong: 60, weak: weak_score, "GBP": 20, "AUD": 10,
              "NZD": -10, "CAD": -20, "CHF": -30, "USD": 5}
    # ensure exactly 8 distinct currencies present
    scores = {c: scores.get(c, 0) for c in
              ["EUR", "USD", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]}
    scores[strong] = 60
    scores[weak] = weak_score
    from intellitrade_scanners.review import best_expression
    pair = best_expression.conventional_pair(strong, weak)
    direction = best_expression.direction_multiplier(strong, pair)
    label = best_expression.expected_alignment(direction)
    return fx.review_snapshot(i, _ts(i), scores, {pair: (label, conf)})


def _non_qualifying(i):
    scores = {c: 0 for c in ["EUR", "USD", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]}
    scores["EUR"] = 10
    scores["JPY"] = -10
    return fx.review_snapshot(i, _ts(i), scores, {"EURJPY": ("neutral", 0)})


def test_fresh_opens_one_case_and_continuation_opens_nothing():
    snaps = [_qualifying(i) for i in range(10)]  # qualifies every snapshot
    cases = detector.detect_cases(snaps)
    assert len(cases) == 1
    assert cases[0]["pair_symbol"] == "EURJPY"
    assert cases[0]["direction_multiplier"] == 1
    assert cases[0]["review_snapshot_id"] == 0  # opened at first qualifying snapshot


def test_no_case_when_low_confidence():
    snaps = [_qualifying(i, conf=40) for i in range(5)]  # below BEST_EXPRESSION_MIN_CONFIDENCE
    assert detector.detect_cases(snaps) == []


def test_no_case_when_weak_side_not_deep_enough():
    snaps = [_qualifying(i, weak_score=-40) for i in range(5)]  # rank8 > -50
    assert detector.detect_cases(snaps) == []


def test_misaligned_pair_label_does_not_qualify():
    # Direction says bullish but stored label is bearish -> reject.
    s = _qualifying(0)
    s["payload"]["pairs"]["EURJPY"]["pair"] = "bearish"
    assert detector.detect_cases([s]) == []


def test_reset_then_requalification_opens_second_case():
    snaps = [_qualifying(0)]
    snaps += [_non_qualifying(i) for i in range(1, 1 + RESET_SNAPSHOTS)]
    snaps.append(_qualifying(1 + RESET_SNAPSHOTS))
    cases = detector.detect_cases(snaps)
    assert len(cases) == 2
    assert cases[1]["review_snapshot_id"] == 1 + RESET_SNAPSHOTS


def test_insufficient_reset_does_not_reopen():
    snaps = [_qualifying(0)]
    snaps += [_non_qualifying(i) for i in range(1, RESET_SNAPSHOTS)]  # one short of reset
    snaps.append(_qualifying(RESET_SNAPSHOTS))
    cases = detector.detect_cases(snaps)
    assert len(cases) == 1  # regime never fully reset


def test_model_version_change_is_separate_lineage():
    a = [_qualifying(i) for i in range(3)]
    b = _qualifying(3)
    b["model_version"] = "csm-daily-v99-next"
    cases = detector.detect_cases(a + [b])
    # Same (pair, direction) but different model -> keys differ -> both open.
    assert len(cases) == 2
    assert {c["model_version"] for c in cases} == {"csm-daily-v43-softgate-1", "csm-daily-v99-next"}


def test_opposite_direction_tracked_independently():
    # EUR>JPY qualifies, then flips to JPY>EUR (EURJPY dir -1).
    up = [_qualifying(i, "EUR", "JPY") for i in range(2)]
    down = [_qualifying(i, "JPY", "EUR") for i in range(2, 4)]
    cases = detector.detect_cases(up + down)
    dirs = sorted(c["direction_multiplier"] for c in cases)
    assert dirs == [-1, 1]
    assert all(c["pair_symbol"] == "EURJPY" for c in cases)


def test_run_inserts_and_is_idempotent(fake_client):
    snaps = [_qualifying(i) for i in range(3)]
    for s in snaps:
        fake_client.tables.setdefault("csm_review_snapshots", []).append(s)
    first = detector.run("metaquotes_demo", client=fake_client)
    assert first["inserted"] == 1
    second = detector.run("metaquotes_demo", client=fake_client)
    assert second["inserted"] == 0  # case_key collision -> no-op
    assert len(fake_client.tables["csm_review_cases"]) == 1
    case = fake_client.tables["csm_review_cases"][0]
    assert case["reference_close_time"] == _ts(0)
    assert case["status"] == "pending"
