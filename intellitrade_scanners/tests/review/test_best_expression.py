# coding: utf-8
"""Canonical-pair parity, direction math, and ladder determinism."""

from __future__ import annotations

import itertools

from intellitrade_scanners.review import best_expression as be
from intellitrade_scanners.review.constants import CURRENCIES

# Reference implementation mirroring lib/strength.ts getCanonicalPair exactly.
STANDARD = set(be.STANDARD_PAIRS)


def _ts_canonical(a: str, b: str) -> tuple[str, str]:
    if (a + b) in STANDARD:
        return (a, b)
    if (b + a) in STANDARD:
        return (b, a)
    return (a, b) if a < b else (b, a)


def test_canonical_pair_parity_all_56_ordered_combos():
    combos = [(a, b) for a, b in itertools.permutations(CURRENCIES, 2)]
    assert len(combos) == 56
    for a, b in combos:
        assert be.get_canonical_pair(a, b) == _ts_canonical(a, b), (a, b)


def test_canonical_pair_is_symmetric_in_result():
    for a, b in itertools.permutations(CURRENCIES, 2):
        assert be.get_canonical_pair(a, b) == be.get_canonical_pair(b, a)


def test_conventional_pair_all_pairs_resolve_to_the_28():
    for a, b in itertools.permutations(CURRENCIES, 2):
        symbol = be.conventional_pair(a, b)
        assert symbol in be.STANDARD_PAIRS


def test_direction_multiplier_base_vs_quote():
    # EUR strongest, JPY weakest -> EURJPY, EUR is base -> +1
    assert be.direction_multiplier("EUR", "EURJPY") == 1
    # USD strongest, EUR weakest -> EURUSD, USD is quote -> -1
    assert be.direction_multiplier("USD", "EURUSD") == -1


def test_expected_alignment():
    assert be.expected_alignment(1) == "bullish"
    assert be.expected_alignment(-1) == "bearish"


def test_build_ladder_orders_by_score_then_code():
    weighted = {
        "USD": {"score": 80, "bias": "Strong"},
        "EUR": {"score": 80, "bias": "Strong"},   # tie with USD -> EUR first (code asc)
        "GBP": {"score": 10, "bias": "Neutral"},
        "JPY": {"score": -90, "bias": "Weak"},
        "AUD": {"score": 5, "bias": "Neutral"},
        "NZD": {"score": -5, "bias": "Neutral"},
        "CAD": {"score": 20, "bias": "Strong"},
        "CHF": {"score": -50, "bias": "Weak"},
    }
    ladder = be.build_ladder(weighted)
    assert [r["currency"] for r in ladder][:2] == ["EUR", "USD"]  # tie broken by code
    assert ladder[0]["rank"] == 1 and ladder[-1]["rank"] == 8
    assert ladder[-1]["currency"] == "JPY"  # lowest score last
    assert len(ladder) == 8


def test_build_ladder_handles_missing_currency():
    ladder = be.build_ladder({"EUR": {"score": 60, "bias": "Strong"}})
    assert len(ladder) == 8
    assert ladder[0]["currency"] == "EUR"
