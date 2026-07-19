# coding: utf-8
"""
Server-side "Best Expression" resolution from stored snapshot fields.

The frontend's lib/strength.ts computeExpressions is a score-spread
approximation the dev handoff itself calls "fundamentally wrong". For reviews we
use the stronger source of truth: the conventional pair for (strong, weak) plus
the stored per-pair `pair` label + `confidence`.

This module ports lib/strength.ts getCanonicalPair to Python (parity proven on
all 56 ordered currency pairs in the tests) and derives the ladder + direction.
Pure functions only — no IO.
"""

from __future__ import annotations

from intellitrade_scanners.review.constants import CURRENCIES, DEFAULT_PAIRS

# The 28 canonical, market-convention pairs (base first). Mirrors
# lib/strength.ts STANDARD_PAIRS and strength_core.DEFAULT_PAIRS.
STANDARD_PAIRS = frozenset(DEFAULT_PAIRS)


def get_canonical_pair(a: str, b: str) -> tuple[str, str]:
    """Port of lib/strength.ts getCanonicalPair -> (base, quote)."""
    if (a + b) in STANDARD_PAIRS:
        return (a, b)
    if (b + a) in STANDARD_PAIRS:
        return (b, a)
    return (a, b) if a < b else (b, a)


def conventional_pair(strong: str, weak: str) -> str | None:
    """The conventional 28-universe symbol for (strong, weak), or None if the
    canonical pair for these two currencies is not one of the 28."""
    base, quote = get_canonical_pair(strong, weak)
    symbol = base + quote
    return symbol if symbol in STANDARD_PAIRS else None


def direction_multiplier(strong: str, symbol: str) -> int:
    """+1 if the strong currency is the pair's base, else -1 (§3.6)."""
    return 1 if symbol[:3] == strong else -1


def expected_alignment(direction: int) -> str:
    """The stored pair label that agrees with the direction: bullish if the
    strong currency is base (dir=+1), bearish if it is the quote (dir=-1)."""
    return "bullish" if direction == 1 else "bearish"


def build_ladder(currencies_weighted: dict) -> list[dict]:
    """Deterministic 8-row ladder from currencies_weighted.

    Rank by score descending; ties broken by currency code ascending so the
    ordering is fully reproducible from the persisted snapshot alone.
    """
    rows = []
    for code in CURRENCIES:
        entry = currencies_weighted.get(code) or {}
        rows.append({
            "currency": code,
            "score": float(entry.get("score", 0.0)),
            "bias": entry.get("bias", "Neutral"),
        })
    rows.sort(key=lambda r: (-r["score"], r["currency"]))
    return [
        {"rank": i + 1, "currency": r["currency"], "score": r["score"], "bias": r["bias"]}
        for i, r in enumerate(rows)
    ]
