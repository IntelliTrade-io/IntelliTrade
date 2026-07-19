# coding: utf-8
"""
Stage 3 - Case detection.

Runs the canonical state engine over the ordered complete review snapshots and
opens a case at the first qualifying snapshot after a genuine regime reset
(§3.3-3.4). Qualification is extremes-based: the strong currency is ladder rank 1,
the weak currency is ladder rank 8. Duplicate protection is DB-enforced via the
deterministic case_key and the uq_csm_case_active partial unique index; a
unique-violation insert is a clean no-op.
"""

from __future__ import annotations

import logging

from intellitrade_scanners.postgrest import PostgrestError, eq
from intellitrade_scanners.review import best_expression, db, state_engine
from intellitrade_scanners.review.constants import (
    BEST_EXPRESSION_MIN_CONFIDENCE,
    CONFIRMED_T,
    RESET_SNAPSHOTS,
    STATE_ENGINE_VERSION,
)

log = logging.getLogger(__name__)

_OPENABLE_STATES = ("fresh", "confirmed", "mature")
_ACTIVE_STATUSES = (
    "pending", "evaluating", "short_window_complete",
    "long_window_complete", "ready_for_publication",
)


# ── pure qualification ──────────────────────────────────────────────────────

def qualification(snapshot: dict, state_history: list[dict]) -> dict | None:
    """Return the qualifying candidate for a snapshot, or None.

    `state_history` is the ordered (oldest->newest) list of per-currency score
    maps for all complete snapshots up to and including this one.
    """
    ladder = snapshot.get("ladder") or []
    if len(ladder) < 8:
        return None
    top, bottom = ladder[0], ladder[7]
    strong, weak = top["currency"], bottom["currency"]

    if float(top["score"]) < CONFIRMED_T or float(bottom["score"]) > -CONFIRMED_T:
        return None

    pair = best_expression.conventional_pair(strong, weak)
    if pair is None:
        return None
    direction = best_expression.direction_multiplier(strong, pair)

    pairs = (snapshot.get("payload") or {}).get("pairs") or {}
    stored = pairs.get(pair) or {}
    label = stored.get("pair")
    if label != best_expression.expected_alignment(direction):
        return None
    confidence = float(stored.get("confidence") or 0.0)
    if confidence < BEST_EXPRESSION_MIN_CONFIDENCE:
        return None

    regime_state = state_engine.stage_for_currency(state_history, strong)
    if regime_state not in _OPENABLE_STATES:
        return None

    return {
        "strong_currency": strong,
        "weak_currency": weak,
        "pair_symbol": pair,
        "direction_multiplier": direction,
        "pair_alignment": label,
        "pair_confidence": confidence,
        "regime_state_at_open": regime_state,
    }


def _score_map(snapshot: dict) -> dict:
    weighted = (snapshot.get("payload") or {}).get("currencies_weighted") or {}
    return {c: float(v.get("score", 0.0)) for c, v in weighted.items()}


def detect_cases(ordered_snapshots: list[dict]) -> list[dict]:
    """Pure case detection over chronologically-ordered complete snapshots.

    Returns a list of case records (without DB-assigned overlap ids). A case
    opens at the first qualifying snapshot, then only re-opens for the same
    (pair, direction) after the qualification has failed on >= RESET_SNAPSHOTS
    consecutive valid snapshots.
    """
    state_history: list[dict] = []
    opened: dict[tuple[str, int, str], int] = {}      # key -> opening snapshot id
    fail_streak: dict[tuple[str, int, str], int] = {}
    cases: list[dict] = []

    for snap in ordered_snapshots:
        state_history.append(_score_map(snap))
        cand = qualification(snap, state_history)
        # Lineage is per (pair, direction, model_version): a model change is a
        # separate lineage that never collides with the old one (§3.9).
        cand_key = (
            (cand["pair_symbol"], cand["direction_multiplier"], snap.get("model_version") or "")
            if cand else None
        )

        # Every tracked regime that did NOT qualify this snapshot accrues a fail.
        for key in fail_streak:
            if key != cand_key:
                fail_streak[key] += 1

        if not cand:
            continue

        key = cand_key
        fail_streak.setdefault(key, 0)
        if key not in opened:
            open_now = True
        else:
            open_now = fail_streak[key] >= RESET_SNAPSHOTS

        if open_now:
            cases.append(_build_case(snap, cand))
            opened[key] = snap["id"]
        fail_streak[key] = 0

    return cases


def _build_case(snap: dict, cand: dict) -> dict:
    model_version = snap.get("model_version") or ""
    pair = cand["pair_symbol"]
    direction = cand["direction_multiplier"]
    case_key = f"{model_version}:{pair}:{direction}:{snap['id']}"
    return {
        "case_key": case_key,
        "review_snapshot_id": snap["id"],
        "model_version": model_version,
        "scanner_version": snap.get("scanner_version") or "",
        "feed_name": snap.get("feed_name") or "",
        "strong_currency": cand["strong_currency"],
        "weak_currency": cand["weak_currency"],
        "pair_symbol": pair,
        "direction_multiplier": direction,
        "pair_alignment": cand["pair_alignment"],
        "pair_confidence": cand["pair_confidence"],
        "regime_state_at_open": cand["regime_state_at_open"],
        "state_engine_version": STATE_ENGINE_VERSION,
        "captured_at": snap["captured_at"],
        "candle_close_ts": snap["candle_close_ts"],
    }


# ── IO stage ────────────────────────────────────────────────────────────────

def _reference_times(candle_close_ts: str) -> tuple[str, str]:
    from intellitrade_scanners.review import timeutil
    close = timeutil.parse_ts(candle_close_ts)
    open_time = timeutil.reference_open_time(close)
    return (open_time.isoformat().replace("+00:00", "Z"),
            close.isoformat().replace("+00:00", "Z"))


def run(feed_name: str, client=None) -> dict:
    """Detect and insert new cases for the configured feed."""
    db_client = client or db.get_client()

    snaps = db_client.select(
        "csm_review_snapshots",
        columns="id,candle_close_ts,captured_at,feed_name,scanner_version,model_version,ladder,payload,completeness",
        filters=[eq("feed_name", feed_name), eq("completeness", "complete")],
    )
    snaps = sorted(snaps, key=lambda s: s["candle_close_ts"])
    detected = detect_cases(snaps)

    active = db_client.select(
        "csm_review_cases",
        columns="id,strong_currency,weak_currency,status",
    )
    active = [c for c in active if c["status"] in _ACTIVE_STATUSES]

    summary = {"detected": len(detected), "inserted": 0, "skipped": 0}
    for case in detected:
        ref_open, ref_close = _reference_times(case.pop("candle_close_ts"))
        overlaps = [
            c["id"] for c in active
            if case["strong_currency"] in (c["strong_currency"], c["weak_currency"])
            or case["weak_currency"] in (c["strong_currency"], c["weak_currency"])
        ]
        record = {
            **case,
            "reference_open_time": ref_open,
            "reference_close_time": ref_close,
            "status": "pending",
            "overlapping_case_ids": overlaps,
        }
        try:
            db_client.insert("csm_review_cases", record)
            summary["inserted"] += 1
        except PostgrestError as exc:
            if "409" in str(exc) or "duplicate" in str(exc).lower():
                summary["skipped"] += 1  # already detected (case_key or active index)
            else:
                log.error("case insert failed (%s): %s", record["case_key"], exc)
    return summary
