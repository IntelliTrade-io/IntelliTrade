# coding: utf-8
"""
Golden fixture validation CLI.

Loads fixtures/golden_backend_fixture.csv and, for every row, recomputes the
dynamic opportunity score and grade with the backend and compares against the
expected columns produced by the QuantConnect research branch.

The backend is NOT considered correct unless every row matches.

Run:
    python backend/support_resistance/run_fixture_validation.py
    python backend/support_resistance/run_fixture_validation.py --tolerance 1e-9

Exit code 0 = all rows passed, 1 = one or more failures / missing config.
"""

import argparse
import csv
import logging
import os
import sys

# Make `support_resistance` importable as a top-level package whether this file
# is run as a script or as a module.
_PKG_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # -> backend/
if _PKG_PARENT not in sys.path:
    sys.path.insert(0, _PKG_PARENT)

from support_resistance import config  # noqa: E402
from support_resistance import dynamic_score  # noqa: E402

logger = logging.getLogger(__name__)

DEFAULT_TOLERANCE = 1e-9

REQUIRED_INPUT_COLUMNS = [
    "label", "session", "m15_return_12_atr",
    "h1_above_ema200", "h1_ema200_slope_nonnegative",
    "h4_above_ema200", "h4_ema200_slope_nonnegative",
    "m15_above_ema200",
]
EXPECTED_COLUMNS = ["dynamic_opportunity_score", "dynamic_grade"]


class ValidationFailure(Exception):
    pass


def validate_fixture(fixture_path: str = None, tolerance: float = DEFAULT_TOLERANCE) -> dict:
    """Validate the golden fixture. Returns a summary dict. Raises
    ValidationFailure if the fixture is structurally unusable (missing columns,
    missing thresholds). Row-level mismatches are collected, not raised."""
    fixture_path = fixture_path or config.GOLDEN_FIXTURE_PATH
    if not os.path.exists(fixture_path):
        raise ValidationFailure(f"Golden fixture not found: {fixture_path}")

    # Force a loud failure now if thresholds/config are missing.
    config.score_thresholds()

    with open(fixture_path, "r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        missing = [c for c in (REQUIRED_INPUT_COLUMNS + EXPECTED_COLUMNS) if c not in header]
        if missing:
            raise ValidationFailure(
                f"Fixture {fixture_path} is missing required columns: {missing}"
            )

        rows_tested = 0
        failures = []
        for i, row in enumerate(reader, start=2):  # start=2: row 1 is the header
            rows_tested += 1
            expected_score = float(row["dynamic_opportunity_score"])
            expected_grade = row["dynamic_grade"].strip()

            actual_score = dynamic_score.score_row(row)
            actual_grade = dynamic_score.assign_dynamic_grade(actual_score)

            score_ok = abs(actual_score - expected_score) <= tolerance
            grade_ok = actual_grade == expected_grade
            if not (score_ok and grade_ok):
                failures.append({
                    "line": i,
                    "expected_score": expected_score,
                    "actual_score": actual_score,
                    "expected_grade": expected_grade,
                    "actual_grade": actual_grade,
                    "score_ok": score_ok,
                    "grade_ok": grade_ok,
                })

    return {
        "fixture": fixture_path,
        "tolerance": tolerance,
        "rows_tested": rows_tested,
        "rows_passed": rows_tested - len(failures),
        "rows_failed": len(failures),
        "failures": failures,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Validate the SR Alpha golden fixture.")
    parser.add_argument("--fixture", default=None, help="Path to golden_backend_fixture.csv")
    parser.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE,
                        help=f"Numeric score tolerance (default {DEFAULT_TOLERANCE})")
    parser.add_argument("--max-show", type=int, default=10,
                        help="Max failures to print in detail")
    args = parser.parse_args(argv)

    try:
        summary = validate_fixture(args.fixture, args.tolerance)
    except (ValidationFailure, config.ConfigError) as exc:
        logger.error("FATAL: %s", exc)
        return 1

    logger.info("== SR Alpha golden fixture validation ==")
    logger.info("fixture     : %s", summary["fixture"])
    logger.info("tolerance   : %s", summary["tolerance"])
    logger.info("rows tested : %s", summary["rows_tested"])
    logger.info("rows passed : %s", summary["rows_passed"])
    logger.info("rows failed : %s", summary["rows_failed"])

    if summary["failures"]:
        logger.info("first failures (expected vs actual):")
        for f in summary["failures"][: args.max_show]:
            logger.info(
                "  line %s: score %r vs %r (%s) | grade %r vs %r (%s)",
                f["line"],
                f["actual_score"], f["expected_score"],
                "ok" if f["score_ok"] else "MISMATCH",
                f["actual_grade"], f["expected_grade"],
                "ok" if f["grade_ok"] else "MISMATCH",
            )
        return 1

    logger.info("All rows reproduced the locked research scores and grades. [PASS]")
    return 0


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    sys.exit(main())
