# coding: utf-8
"""Stage 4 explainer: deterministic, reproducible, forbidden-word-free."""

from __future__ import annotations

import pytest

from intellitrade_scanners.review import explainer
from intellitrade_scanners.review.constants import FORBIDDEN_TERMS

CASE = {"strong_currency": "EUR", "weak_currency": "JPY", "pair_symbol": "EURJPY"}
EVAL = {
    "reference_close": 160.0,
    "long_close": 164.0,
    "short_return_norm_pct": 1.5,
    "long_return_norm_pct": 2.5,
    "max_continuation_pct": 3.1,
    "max_continuation_at": "2026-06-10T00:00:00Z",
    "max_pullback_pct": -0.8,
    "max_pullback_at": "2026-06-05T00:00:00Z",
    "classification": "continued",
}


def test_build_facts_final_vs_reference():
    facts = explainer.build_facts(CASE, EVAL)
    assert facts["final_vs_reference"] == "above"
    assert facts["strong_currency"] == "EUR"


def test_render_is_deterministic():
    facts = explainer.build_facts(CASE, EVAL)
    assert explainer.render(facts) == explainer.render(facts)


def test_render_reproducible_from_stored_facts():
    facts = explainer.build_facts(CASE, EVAL)
    # A fresh dict with the same stored facts renders identically.
    assert explainer.render(dict(facts)) == explainer.render(facts)


def test_render_has_no_forbidden_terms():
    for classification in ("continued", "mixed", "reversed"):
        facts = explainer.build_facts(CASE, {**EVAL, "classification": classification})
        text = explainer.render(facts).lower()
        for term in FORBIDDEN_TERMS:
            assert term not in text, (classification, term)


def test_render_rejects_injected_forbidden_term():
    facts = explainer.build_facts(CASE, EVAL)
    facts["pair_symbol"] = "buy now"  # inject a forbidden word
    with pytest.raises(ValueError):
        explainer.render(facts)
