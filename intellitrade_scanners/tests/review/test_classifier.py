# coding: utf-8
"""Stage 4 classifier: exact band boundaries."""

from __future__ import annotations

from intellitrade_scanners.review import classifier
from intellitrade_scanners.review.constants import NEUTRAL_BAND_PCT


def test_continued_at_and_above_band():
    assert classifier.classify(NEUTRAL_BAND_PCT) == "continued"
    assert classifier.classify(5.0) == "continued"


def test_reversed_at_and_below_negative_band():
    assert classifier.classify(-NEUTRAL_BAND_PCT) == "reversed"
    assert classifier.classify(-5.0) == "reversed"


def test_mixed_inside_band():
    assert classifier.classify(0.0) == "mixed"
    assert classifier.classify(NEUTRAL_BAND_PCT - 0.01) == "mixed"
    assert classifier.classify(-NEUTRAL_BAND_PCT + 0.01) == "mixed"
