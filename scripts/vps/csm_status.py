# coding: utf-8
r"""
CSM review pipeline status — read-only, run any day to see health at a glance.

    python scripts\vps\csm_status.py

Prints: review snapshot counts (valid/invalid), cases by status, candle coverage,
the latest job run per stage with age, and the public review count. Touches no
data. Resolves the repo root itself so it runs from anywhere.
"""

from __future__ import annotations

import datetime as dt
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from intellitrade_scanners import config  # noqa: E402

config.load_env()

from intellitrade_scanners.postgrest import Postgrest  # noqa: E402

UTC = dt.timezone.utc


def _parse(ts):
    if not ts:
        return None
    try:
        return dt.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def _age(ts) -> str:
    d = _parse(ts)
    if not d:
        return "n/a"
    mins = (dt.datetime.now(UTC) - d).total_seconds() / 60
    return f"{mins/60:.1f}h ago" if mins >= 60 else f"{mins:.0f}m ago"


def main() -> int:
    db = Postgrest()
    print("=" * 56)
    print("CSM REVIEW PIPELINE STATUS", dt.datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"))
    print("=" * 56)

    snaps = db.select("csm_review_snapshots", columns="completeness")
    valid = sum(1 for s in snaps if s["completeness"] == "complete")
    print(f"\nReview snapshots : {len(snaps)} total  ({valid} valid, {len(snaps)-valid} invalid)")

    cases = db.select("csm_review_cases", columns="status")
    print(f"Cases            : {len(cases)} total")
    counts: dict[str, int] = {}
    for c in cases:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    for status, n in sorted(counts.items()):
        print(f"    {status:26} {n}")

    candles = db.select("fx_ohlc_candles", columns="symbol,open_time")
    symbols = {c["symbol"] for c in candles}
    latest = max((c["open_time"] for c in candles), default=None)
    print(f"\nCandles          : {len(candles)} rows, {len(symbols)}/28 pairs")
    print(f"    newest bar open : {latest} ({_age(latest)})")

    public = db.select("csm_public_reviews", columns="slug")
    print(f"\nPublished reviews: {len(public)}")

    runs = db.select("csm_review_job_runs", columns="job_name,status,finished_at")
    latest_by_stage: dict[str, dict] = {}
    for r in runs:
        prev = latest_by_stage.get(r["job_name"])
        if prev is None or str(r.get("finished_at")) > str(prev.get("finished_at")):
            latest_by_stage[r["job_name"]] = r
    print("\nLast run per stage:")
    for stage in ("ingest", "candles", "detect", "evaluate", "publish", "aggregate"):
        r = latest_by_stage.get(stage)
        if r:
            print(f"    {stage:10} {r['status']:8} {_age(r.get('finished_at'))}")
        else:
            print(f"    {stage:10} (never run)")

    print("\n" + "=" * 56)
    return 0


if __name__ == "__main__":
    sys.exit(main())
