# coding: utf-8
"""
Stage 4 (part) - Deterministic outcome classification (§3.7).

Continued if the normalized 60-bar return >= +band; Reversed if <= -band; else
Mixed. No AI involvement; raw numbers are always displayed regardless of label.
Pure functions only.
"""

from __future__ import annotations

from intellitrade_scanners.review.constants import EVALUATION_VERSION, NEUTRAL_BAND_PCT

VERSION = EVALUATION_VERSION

CONTINUED = "continued"
MIXED = "mixed"
REVERSED = "reversed"


def classify(long_return_norm_pct: float, band: float = NEUTRAL_BAND_PCT) -> str:
    """Classify a normalized 60-bar return into continued / mixed / reversed."""
    if long_return_norm_pct >= band:
        return CONTINUED
    if long_return_norm_pct <= -band:
        return REVERSED
    return MIXED
