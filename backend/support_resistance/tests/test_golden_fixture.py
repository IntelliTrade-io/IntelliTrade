# coding: utf-8
"""
Mandatory golden regression: every row in golden_backend_fixture.csv must
reproduce the QuantConnect research branch's dynamic_opportunity_score (within
tolerance) and dynamic_grade (exactly).
"""
import csv

import pytest

from support_resistance import config
from support_resistance import dynamic_score

SCORE_TOLERANCE = 1e-9

REQUIRED_INPUT_COLUMNS = [
    "label", "session", "m15_return_12_atr",
    "h1_above_ema200", "h1_ema200_slope_nonnegative",
    "h4_above_ema200", "h4_ema200_slope_nonnegative",
    "m15_above_ema200",
]
EXPECTED_COLUMNS = ["dynamic_opportunity_score", "dynamic_grade"]


def _load_rows():
    with open(config.GOLDEN_FIXTURE_PATH, "r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = list(reader)
    return header, rows


def test_thresholds_present():
    thr = config.score_thresholds()
    for key in ("green", "elite_green", "a_plus"):
        assert key in thr


def test_fixture_has_required_columns():
    header, _ = _load_rows()
    for col in REQUIRED_INPUT_COLUMNS + EXPECTED_COLUMNS:
        assert col in header, f"fixture missing column {col}"


def test_fixture_not_empty():
    _, rows = _load_rows()
    assert len(rows) >= 1


def test_every_row_reproduces_score_and_grade():
    _, rows = _load_rows()
    failures = []
    for i, row in enumerate(rows, start=2):
        expected_score = float(row["dynamic_opportunity_score"])
        expected_grade = row["dynamic_grade"].strip()
        actual_score = dynamic_score.score_row(row)
        actual_grade = dynamic_score.assign_dynamic_grade(actual_score)
        if abs(actual_score - expected_score) > SCORE_TOLERANCE or actual_grade != expected_grade:
            failures.append(
                f"line {i}: score {actual_score} vs {expected_score}, "
                f"grade {actual_grade!r} vs {expected_grade!r}"
            )
    assert not failures, "golden fixture mismatches:\n" + "\n".join(failures)


def test_grade_derives_from_expected_score():
    """Independent of the backend score: the expected grade must be consistent
    with the expected score under the locked thresholds (guards the fixture)."""
    _, rows = _load_rows()
    for i, row in enumerate(rows, start=2):
        expected_score = float(row["dynamic_opportunity_score"])
        expected_grade = row["dynamic_grade"].strip()
        assert dynamic_score.assign_dynamic_grade(expected_score) == expected_grade, (
            f"line {i}: expected grade {expected_grade!r} inconsistent with score {expected_score}"
        )
