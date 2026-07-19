# coding: utf-8
"""
Stage 6 - Aggregation (§3.9, §14).

Full recompute (idempotent by construction) of the monthly summaries (capture
month, only months with >=1 published case) and the single methodology-keyed
aggregate stats row: Continued/Mixed/Reversed counts + rates, mean/median
normalized 30/60 outcomes, mean MFE/MAE, coverage, overlap-disclosure counts,
and the incomplete-case count. Production cases only; never reconstructed.
"""

from __future__ import annotations

import datetime as dt
import logging
import statistics
from collections import Counter, defaultdict

from intellitrade_scanners.postgrest import eq
from intellitrade_scanners.review import db
from intellitrade_scanners.review.constants import METHODOLOGY_VERSION

log = logging.getLogger(__name__)

UTC = dt.timezone.utc

_INCOMPLETE_STATUSES = ("withheld_missing_data", "failed_validation", "incomplete")


# ── pure stats ──────────────────────────────────────────────────────────────

def _rate(n: int, total: int) -> float:
    return round(n / total, 4) if total else 0.0


def _mean(values: list[float]) -> float | None:
    return round(statistics.fmean(values), 4) if values else None


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 4) if values else None


def summarize(reviews: list[dict], incomplete_count: int = 0,
              overlap_count: int = 0) -> dict:
    """Compute the stats block from a list of published-review rows."""
    labels = Counter(r["classification"] for r in reviews)
    total = len(reviews)
    short = [float(r["short_return_pct"]) for r in reviews]
    long = [float(r["long_return_pct"]) for r in reviews]
    mfe = [float(r["max_continuation_pct"]) for r in reviews]
    mae = [float(r["max_pullback_pct"]) for r in reviews]
    return {
        "count": total,
        "continued": labels.get("continued", 0),
        "mixed": labels.get("mixed", 0),
        "reversed": labels.get("reversed", 0),
        "continued_rate": _rate(labels.get("continued", 0), total),
        "mixed_rate": _rate(labels.get("mixed", 0), total),
        "reversed_rate": _rate(labels.get("reversed", 0), total),
        "mean_short_return_pct": _mean(short),
        "median_short_return_pct": _median(short),
        "mean_long_return_pct": _mean(long),
        "median_long_return_pct": _median(long),
        "mean_max_continuation_pct": _mean(mfe),
        "mean_max_pullback_pct": _mean(mae),
        "overlap_disclosed_count": overlap_count,
        "incomplete_count": incomplete_count,
    }


# ── IO stage ────────────────────────────────────────────────────────────────

def run(feed_name: str | None = None, now: dt.datetime | None = None, client=None) -> dict:
    db_client = client or db.get_client()
    now = now or dt.datetime.now(UTC)
    now_iso = now.isoformat().replace("+00:00", "Z")

    reviews = db_client.select("csm_public_reviews", columns="*")
    cases = db_client.select("csm_review_cases", columns="id,status,overlapping_case_ids")
    incomplete_count = sum(1 for c in cases if c["status"] in _INCOMPLETE_STATUSES)
    overlap_count = sum(1 for c in cases if c.get("overlapping_case_ids"))

    # Monthly summaries (capture month; only months with >=1 published case).
    by_month: dict[str, list[dict]] = defaultdict(list)
    for r in reviews:
        by_month[r["capture_month"]].append(r)

    months_written = 0
    for month, rows in by_month.items():
        stats = summarize(rows)
        db_client.upsert("csm_review_monthly_summaries", {
            "capture_month": month,
            "stats": stats,
            "case_ids": [r["case_id"] for r in rows],
            "methodology_version": METHODOLOGY_VERSION,
            "computed_at": now_iso,
        }, on_conflict="capture_month")
        months_written += 1

    # Aggregate stats (one row keyed by methodology_version).
    agg = summarize(reviews, incomplete_count=incomplete_count, overlap_count=overlap_count)
    obs_start = min((r["captured_at"] for r in reviews), default=None)
    obs_end = max((r["published_at"] for r in reviews), default=None)
    db_client.upsert("csm_review_aggregate_stats", {
        "methodology_version": METHODOLOGY_VERSION,
        "stats": agg,
        "observation_start": obs_start,
        "observation_end": obs_end,
        "computed_at": now_iso,
    }, on_conflict="methodology_version")

    return {"months": months_written, "reviews": len(reviews),
            "incomplete": incomplete_count}
