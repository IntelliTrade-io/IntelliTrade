# coding: utf-8
"""
Stage 5 - Publication (§3.9).

Flag-gated (CSM_PUBLIC_REVIEWS_ENABLED=true). For every ready_for_publication
case, copy only the whitelisted fields into csm_public_reviews with a permanent,
collision-safe slug, then mark the case published. Idempotent via UNIQUE(case_id)
+ UNIQUE(slug). Nothing about a case is public before bar 60 is verified.
"""

from __future__ import annotations

import calendar
import datetime as dt
import logging
import os

from intellitrade_scanners.postgrest import PostgrestError, eq
from intellitrade_scanners.review import db, timeutil
from intellitrade_scanners.review.constants import LONG_BARS, MODEL_GENERATION_LABEL, SHORT_BARS

log = logging.getLogger(__name__)

UTC = dt.timezone.utc


def is_enabled() -> bool:
    return os.environ.get("CSM_PUBLIC_REVIEWS_ENABLED") == "true"


# ── pure helpers ────────────────────────────────────────────────────────────

def base_slug(strong: str, weak: str, captured_at: str) -> str:
    """eur-strongest-jpy-weakest-june-1-2026 (lowercase, capture month UTC)."""
    d = timeutil.parse_ts(captured_at)
    month = calendar.month_name[d.month].lower()
    return f"{strong.lower()}-strongest-{weak.lower()}-weakest-{month}-{d.day}-{d.year}"


def resolve_slug(candidate: str, existing: set[str]) -> str:
    """Append -2, -3, ... on same-day collision; permanent once assigned."""
    if candidate not in existing:
        return candidate
    n = 2
    while f"{candidate}-{n}" in existing:
        n += 1
    return f"{candidate}-{n}"


def confidence_band(confidence: float) -> str:
    if confidence >= 80:
        return "high"
    if confidence >= 65:
        return "elevated"
    return "moderate"


def headline(strong: str, weak: str, captured_at: str) -> str:
    d = timeutil.parse_ts(captured_at)
    return f"{strong} strongest, {weak} weakest on {d.strftime('%B')} {d.day}, {d.year}"


def build_public_row(case: dict, evaluation: dict, slug: str, now: dt.datetime) -> dict:
    captured_at = case["captured_at"]
    ref_open = timeutil.parse_ts(case["reference_open_time"])
    chart_from = ref_open - dt.timedelta(hours=4 * SHORT_BARS)
    chart_to = evaluation.get("long_bar_close_time") or (
        timeutil.parse_ts(case["reference_close_time"]) + dt.timedelta(hours=4 * LONG_BARS)
    ).isoformat().replace("+00:00", "Z")
    d = timeutil.parse_ts(captured_at)
    return {
        "case_id": case["id"],
        "slug": slug,
        "headline": headline(case["strong_currency"], case["weak_currency"], captured_at),
        "strong_currency": case["strong_currency"],
        "weak_currency": case["weak_currency"],
        "pair_symbol": case["pair_symbol"],
        "direction_multiplier": case["direction_multiplier"],
        "regime_label": case["regime_state_at_open"].capitalize(),
        "ladder": _public_ladder(case),
        "pair_confidence_band": confidence_band(float(case["pair_confidence"])),
        "captured_at": captured_at,
        "reference_close_time": case["reference_close_time"],
        "reference_close": evaluation["reference_close"],
        "short_return_pct": evaluation["short_return_norm_pct"],
        "long_return_pct": evaluation["long_return_norm_pct"],
        "max_continuation_pct": evaluation["max_continuation_pct"],
        "max_continuation_at": evaluation.get("max_continuation_at"),
        "max_pullback_pct": evaluation["max_pullback_pct"],
        "max_pullback_at": evaluation.get("max_pullback_at"),
        "classification": evaluation["classification"],
        "explanation_text": evaluation["explanation_text"],
        "chart_from": chart_from.isoformat().replace("+00:00", "Z"),
        "chart_to": chart_to,
        "model_generation": MODEL_GENERATION_LABEL,
        "capture_month": f"{d.year:04d}-{d.month:02d}",
        "published_at": now.isoformat().replace("+00:00", "Z"),
    }


def _public_ladder(case: dict) -> list[dict]:
    """Ladder projection for the public row: rank/currency/score only."""
    ladder = case.get("_ladder") or []
    return [{"rank": r["rank"], "currency": r["currency"], "score": r["score"]} for r in ladder]


# ── IO stage ────────────────────────────────────────────────────────────────

def run(feed_name: str, now: dt.datetime | None = None, client=None) -> dict:
    if not is_enabled():
        return {"published": 0, "skipped": "flag_off"}
    db_client = client or db.get_client()
    now = now or dt.datetime.now(UTC)

    cases = db_client.select(
        "csm_review_cases", columns="*",
        filters=[eq("feed_name", feed_name), eq("status", "ready_for_publication")],
    )
    existing = {r["slug"] for r in db_client.select("csm_public_reviews", columns="slug")}

    summary = {"published": 0, "skipped": 0}
    for case in cases:
        evals = db_client.select(
            "csm_review_evaluations", columns="*", filters=[eq("case_id", case["id"])])
        evaluation = next((e for e in evals if e.get("classification")), None)
        if not evaluation:
            summary["skipped"] += 1
            continue
        # Attach the immutable ladder from the opening snapshot.
        snap = db_client.select(
            "csm_review_snapshots", columns="ladder",
            filters=[eq("id", case["review_snapshot_id"])])
        case["_ladder"] = snap[0]["ladder"] if snap else []

        slug = resolve_slug(base_slug(case["strong_currency"], case["weak_currency"],
                                      case["captured_at"]), existing)
        row = build_public_row(case, evaluation, slug, now)
        try:
            db_client.insert("csm_public_reviews", row)
            existing.add(slug)
            db_client.update("csm_review_cases",
                             {"status": "published",
                              "updated_at": now.isoformat().replace("+00:00", "Z")},
                             [eq("id", case["id"])])
            summary["published"] += 1
        except PostgrestError as exc:
            if "409" in str(exc) or "duplicate" in str(exc).lower():
                summary["skipped"] += 1  # already published
            else:
                log.error("publish failed (case %s): %s", case["id"], exc)
    return summary
