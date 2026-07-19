# coding: utf-8
"""
Stage 4 - Evaluation (§3.5-3.8).

Bar 0 is the reference candle (open = reference_open_time). Forward bar 1 is the
next fully-closed H4 candle; short result = close of forward bar 30; long result
= close of forward bar 60. Weekends vanish through bar counting. MFE/MAE are the
favorable/adverse normalized extremes over forward bars 1-60. Nothing is ever
estimated: missing bars block completion; a case past due with unresolved gaps
becomes withheld_missing_data. Evaluation refuses candles from a different feed.
"""

from __future__ import annotations

import datetime as dt
import logging

from intellitrade_scanners.postgrest import eq
from intellitrade_scanners.review import classifier, db, explainer, timeutil
from intellitrade_scanners.review.constants import (
    CANDLE_TIMEFRAME,
    EVALUATION_VERSION,
    LONG_BARS,
    NEUTRAL_BAND_PCT,
    PAST_DUE_DAYS,
    SHORT_BARS,
    TEMPLATE_VERSION,
)

log = logging.getLogger(__name__)

UTC = dt.timezone.utc


# ── pure forward-bar helpers ────────────────────────────────────────────────

def forward_open_times(reference_close_time: dt.datetime, count: int) -> list[dt.datetime]:
    """The next `count` weekday H4 open-times starting at reference_close_time
    (which is forward bar 1's open). Weekend boundaries are skipped."""
    times: list[dt.datetime] = []
    t = reference_close_time
    step = dt.timedelta(hours=4)
    # Guard against pathological loops (count weeks of 4h bars is plenty).
    limit = count * 5 + 100
    while len(times) < count and limit > 0:
        if timeutil.is_weekday_boundary(t):
            times.append(t)
        t += step
        limit -= 1
    return times


def contiguous_forward(candle_map: dict, reference_close_time: dt.datetime,
                       want: int = LONG_BARS) -> tuple[list[dict], int]:
    """Return (forward_candles, verified_bars) walking the weekday grid from
    forward bar 1, stopping at the first missing bar."""
    forward: list[dict] = []
    for open_time in forward_open_times(reference_close_time, want):
        candle = candle_map.get(open_time)
        if candle is None:
            break
        forward.append(candle)
    return forward, len(forward)


def compute_metrics(ref_close: float, forward: list[dict], direction: int) -> dict:
    """Compute normalized + raw returns and normalized MFE/MAE from forward bars.

    `forward` is the contiguous verified forward bars (bar 1..N). Returns only
    the metrics supportable by the available bars (short filled at N>=30, long at
    N>=60). Raises ValueError on an invalid reference price.
    """
    if ref_close is None or ref_close == 0:
        raise ValueError("invalid reference price")

    out: dict = {"verified_bars": len(forward)}

    def raw_pct(price: float) -> float:
        return (price - ref_close) / ref_close * 100.0

    # MFE / MAE over forward bars 1..min(60, N)
    window = forward[:LONG_BARS]
    if window:
        best = None
        worst = None
        for bar in window:
            cont = raw_pct(bar["high"]) if direction == 1 else -raw_pct(bar["low"])
            pull = raw_pct(bar["low"]) if direction == 1 else -raw_pct(bar["high"])
            if best is None or cont > best[0]:
                best = (cont, bar["open_time"])
            if worst is None or pull < worst[0]:
                worst = (pull, bar["open_time"])
        out["max_continuation_pct"] = round(best[0], 4)
        out["max_continuation_at"] = best[1]
        out["max_pullback_pct"] = round(worst[0], 4)
        out["max_pullback_at"] = worst[1]

    if len(forward) >= SHORT_BARS:
        bar30 = forward[SHORT_BARS - 1]
        out["short_close"] = bar30["close"]
        out["short_bar_close_time"] = bar30["close_time"]
        out["short_return_raw_pct"] = round(raw_pct(bar30["close"]), 4)
        out["short_return_norm_pct"] = round(raw_pct(bar30["close"]) * direction, 4)

    if len(forward) >= LONG_BARS:
        bar60 = forward[LONG_BARS - 1]
        out["long_close"] = bar60["close"]
        out["long_bar_close_time"] = bar60["close_time"]
        out["long_return_raw_pct"] = round(raw_pct(bar60["close"]), 4)
        out["long_return_norm_pct"] = round(raw_pct(bar60["close"]) * direction, 4)

    return out


# ── IO stage ────────────────────────────────────────────────────────────────

def _candle_map(client, feed_name: str, symbol: str, since: dt.datetime) -> dict:
    """Load candles for the case's feed only (feed mismatch refused by filter)."""
    from intellitrade_scanners.postgrest import gte
    rows = client.select(
        "fx_ohlc_candles",
        columns="open_time,close_time,open,high,low,close",
        filters=[
            eq("feed_name", feed_name),
            eq("symbol", symbol),
            eq("timeframe", CANDLE_TIMEFRAME),
            gte("open_time", since.isoformat().replace("+00:00", "Z")),
        ],
    )
    out = {}
    for r in rows:
        out[timeutil.parse_ts(r["open_time"])] = {
            "open_time": r["open_time"],
            "close_time": r["close_time"],
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
        }
    return out


def _patch_case(client, case_id: int, values: dict) -> None:
    values["updated_at"] = dt.datetime.now(UTC).isoformat().replace("+00:00", "Z")
    client.update("csm_review_cases", values, [eq("id", case_id)])


def evaluate_case(client, case: dict, now: dt.datetime) -> str:
    """Evaluate one case, persist its evaluation + status. Returns the new status."""
    ref_open = timeutil.parse_ts(case["reference_open_time"])
    ref_close_time = timeutil.parse_ts(case["reference_close_time"])
    direction = int(case["direction_multiplier"])

    candle_map = _candle_map(client, case["feed_name"], case["pair_symbol"], ref_open)
    ref_candle = candle_map.get(ref_open)
    if ref_candle is None or ref_candle["close"] == 0:
        return _maybe_withhold(client, case, now, "missing_reference_candle")

    ref_close = ref_candle["close"]
    forward, verified = contiguous_forward(candle_map, ref_close_time)

    try:
        metrics = compute_metrics(ref_close, forward, direction)
    except ValueError as exc:
        _patch_case(client, case["id"], {"status": "failed_validation",
                                         "failure_reason": str(exc)})
        return "failed_validation"

    evaluation = {
        "case_id": case["id"],
        "evaluation_version": EVALUATION_VERSION,
        "reference_close": ref_close,
        "expected_bars": LONG_BARS,
        "verified_bars": verified,
        "missing_bars": max(0, LONG_BARS - verified),
        "neutral_band_pct": NEUTRAL_BAND_PCT,
        "data_quality": "ok" if verified >= LONG_BARS else "gapped",
        **{k: v for k, v in metrics.items() if k != "verified_bars"},
    }

    if verified >= LONG_BARS:
        evaluation["classification"] = classifier.classify(evaluation["long_return_norm_pct"])
        facts = explainer.build_facts(case, evaluation)
        evaluation["explanation_facts"] = facts
        evaluation["explanation_text"] = explainer.render(facts)
        evaluation["template_version"] = TEMPLATE_VERSION
        status = "ready_for_publication"
    elif verified >= SHORT_BARS:
        status = "short_window_complete"
    else:
        status = "evaluating"

    evaluation["computed_at"] = now.isoformat().replace("+00:00", "Z")
    _upsert_evaluation(client, evaluation)

    if status in ("evaluating", "short_window_complete"):
        status = _maybe_withhold(client, case, now, "missing_forward_bars", fallback=status)
    else:
        _patch_case(client, case["id"], {"status": status, "reference_close": ref_close,
                                         "last_stage": "evaluate"})
    return status


def _maybe_withhold(client, case: dict, now: dt.datetime, reason: str,
                    fallback: str = "pending") -> str:
    """A case past due (bar 60 should have closed) with unresolved gaps is
    withheld; otherwise it stays in its incomplete state for a later sweep."""
    due = timeutil.parse_ts(case["reference_close_time"]) + dt.timedelta(
        hours=4 * LONG_BARS) + dt.timedelta(days=PAST_DUE_DAYS)
    if now >= due:
        _patch_case(client, case["id"], {"status": "withheld_missing_data",
                                         "failure_reason": reason})
        return "withheld_missing_data"
    _patch_case(client, case["id"], {"status": fallback, "last_stage": "evaluate"})
    return fallback


def _upsert_evaluation(client, evaluation: dict) -> None:
    from intellitrade_scanners.postgrest import PostgrestError
    try:
        client.upsert("csm_review_evaluations", evaluation,
                      on_conflict="case_id,evaluation_version")
    except PostgrestError as exc:
        log.error("evaluation upsert failed (case %s): %s", evaluation["case_id"], exc)
        raise


def run(feed_name: str, now: dt.datetime | None = None, client=None) -> dict:
    """Evaluate all incomplete cases for the configured feed."""
    db_client = client or db.get_client()
    now = now or dt.datetime.now(UTC)
    incomplete = db_client.select(
        "csm_review_cases",
        columns="*",
        filters=[eq("feed_name", feed_name)],
    )
    incomplete = [c for c in incomplete if c["status"] in (
        "pending", "evaluating", "short_window_complete", "long_window_complete")]

    summary = {"evaluated": 0, "ready": 0, "withheld": 0}
    for case in incomplete:
        try:
            status = evaluate_case(db_client, case, now)
        except Exception as exc:  # noqa: BLE001 - isolate per-case
            log.error("evaluate failed (case %s): %s", case.get("id"), exc)
            continue
        summary["evaluated"] += 1
        if status == "ready_for_publication":
            summary["ready"] += 1
        elif status == "withheld_missing_data":
            summary["withheld"] += 1
    return summary
