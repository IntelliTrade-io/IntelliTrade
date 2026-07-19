# coding: utf-8
"""
Stage 4 (part) - Deterministic explanation templates (§3.8).

Renders only stored facts (returns, MFE/MAE + dates, classification, final close
vs reference). Facts are stored as JSONB separately from the rendered text so the
prose is fully reproducible. No macro/news/sentiment/pattern claims, and none of
the forbidden trading terms (enforced by test). Pure functions only.
"""

from __future__ import annotations

from intellitrade_scanners.review.constants import (
    FORBIDDEN_TERMS,
    LONG_BARS,
    SHORT_BARS,
    TEMPLATE_VERSION,
)

VERSION = TEMPLATE_VERSION

_CLASS_PHRASE = {
    "continued": "The reading continued: the pair extended in the direction of the original strength reading.",
    "mixed": "The reading was mixed: the pair finished close to where it started relative to the reading.",
    "reversed": "The reading reversed: the pair moved against the direction of the original strength reading.",
}


def _fmt_pct(value: float) -> str:
    return f"{value:+.2f}%"


def build_facts(case: dict, evaluation: dict) -> dict:
    """Assemble the machine facts that feed the template."""
    ref = float(evaluation["reference_close"])
    long_close = float(evaluation["long_close"])
    if long_close > ref:
        final_vs_reference = "above"
    elif long_close < ref:
        final_vs_reference = "below"
    else:
        final_vs_reference = "unchanged"

    return {
        "strong_currency": case["strong_currency"],
        "weak_currency": case["weak_currency"],
        "pair_symbol": case["pair_symbol"],
        "short_bars": SHORT_BARS,
        "long_bars": LONG_BARS,
        "short_return_pct": float(evaluation["short_return_norm_pct"]),
        "long_return_pct": float(evaluation["long_return_norm_pct"]),
        "max_continuation_pct": float(evaluation["max_continuation_pct"]),
        "max_continuation_at": evaluation.get("max_continuation_at"),
        "max_pullback_pct": float(evaluation["max_pullback_pct"]),
        "max_pullback_at": evaluation.get("max_pullback_at"),
        "classification": evaluation["classification"],
        "reference_close": ref,
        "final_close": long_close,
        "final_vs_reference": final_vs_reference,
    }


def render(facts: dict) -> str:
    """Render deterministic prose from facts. Reproducible; forbidden-word-free."""
    strong = facts["strong_currency"]
    weak = facts["weak_currency"]
    pair = facts["pair_symbol"]
    lines = [
        f"On the capture date, {strong} was the strongest currency and {weak} the weakest, "
        f"which the Daily reading expressed through {pair}.",
        f"Over the following {facts['short_bars']} four-hour bars the pair moved "
        f"{_fmt_pct(facts['short_return_pct'])} in the direction of the reading; "
        f"over {facts['long_bars']} bars it moved {_fmt_pct(facts['long_return_pct'])}.",
        f"Its furthest move in the direction of the reading was "
        f"{_fmt_pct(facts['max_continuation_pct'])}, and its furthest move against it was "
        f"{_fmt_pct(facts['max_pullback_pct'])}.",
        _CLASS_PHRASE[facts["classification"]],
    ]
    text = " ".join(lines)
    _assert_clean(text)
    return text


def _assert_clean(text: str) -> None:
    lowered = text.lower()
    hit = [term for term in FORBIDDEN_TERMS if term in lowered]
    if hit:
        raise ValueError(f"explanation contains forbidden term(s): {hit}")
