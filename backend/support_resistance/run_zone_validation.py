# coding: utf-8
"""
Zone / close-reclaim validation against the Phase 39 zone fixture.

Unlike the golden fixture (score only), this fixture carries geometry + timing
(zone_created_time, touch_time, confirm_time, entry/exit, zone_low/high) for 428
research rows. We validate what is checkable WITHOUT the source candle history:

  1. Dynamic score + grade reproduced for every row (extends the golden 50).
  2. Close-reclaim TIMING windows obeyed by the research data, and consistent
     with our locked constants:
        0 <= (confirm_time - touch_time)      <= max_confirm_wait_bars (+tol)
        0 <= (touch_time  - zone_created_time) <= max_touch_wait_bars  (+tol)
     This validates the constants used by zone_detector.close_reclaim_state.
  3. Model metadata (symbol / zone_type / confirmation_type / model_name)
     matches locked_phase39_config.json.

Zone PRICE geometry (zone_low/high) cannot be checked here — that needs the raw
M15 candle history to re-run detection. Flagged, not silently skipped.

Run:
    python backend/support_resistance/run_zone_validation.py
    python backend/support_resistance/run_zone_validation.py --fixture <path>
"""

import argparse
import csv
import os
import sys
import bisect
import glob
from datetime import datetime

_PKG_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # -> backend/
if _PKG_PARENT not in sys.path:
    sys.path.insert(0, _PKG_PARENT)

from support_resistance import config  # noqa: E402
from support_resistance import dynamic_score  # noqa: E402
from support_resistance import indicators  # noqa: E402
from support_resistance import zone_detector  # noqa: E402

_VALIDATION_DIR = os.path.join(_PKG_PARENT, "..", "claudeLoad", "validation")
DEFAULT_FIXTURE = os.path.abspath(os.path.join(_VALIDATION_DIR, "phase39_zone_validation_fixture.csv"))
SCORE_TOLERANCE = 1e-9
M15_SECONDS = 15 * 60
TIME_TOL_BARS = 1  # recommended_tolerances.time_tolerance_m15_bars
GEOM_WINDOW = 1500  # bars the live worker sees per run
PRICE_FLOOR_TOL = 0.00020  # recommended_tolerances.zone_price_tolerance floor


def _find_candles_csv():
    """Auto-locate an exported M15 candle CSV under claudeLoad/validation/."""
    hits = glob.glob(os.path.join(_VALIDATION_DIR, "**", "*m15*.csv"), recursive=True)
    hits = [h for h in hits if os.path.isfile(h) and "fixture" not in os.path.basename(h).lower()]
    return os.path.abspath(hits[0]) if hits else None


def _load_candles(path):
    """Load an OHLC csv into aligned sequences (time as datetime, ascending)."""
    seq = {"time": [], "open": [], "high": [], "low": [], "close": [], "volume": []}
    with open(path, "r", encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            seq["time"].append(datetime.fromisoformat(r["time"].strip()))
            seq["open"].append(float(r["open"]))
            seq["high"].append(float(r["high"]))
            seq["low"].append(float(r["low"]))
            seq["close"].append(float(r["close"]))
            seq["volume"].append(0.0)
    # ensure ascending by time
    if seq["time"] != sorted(seq["time"]):
        order = sorted(range(len(seq["time"])), key=lambda i: seq["time"][i])
        for k in seq:
            seq[k] = [seq[k][i] for i in order]
    return seq


def validate_geometry(candles_path, fixture_path, max_show=10):
    """Run the REAL backend detector windowed at each fixture zone's creation
    time and check whether it produces a zone at the fixture's price band.

    For each fixture zone: take the GEOM_WINDOW candles up to zone_created_time
    (what the live worker would have seen then), run detect_support_zones, and
    match if any detected zone's mid is within tolerance of the fixture mid.
    Tolerance = max(0.00020, 0.10 * ATR) per the fixture config.
    """
    print("\n== Zone GEOMETRY validation (real backend detector vs research zones) ==")
    print(f"candles     : {candles_path}")
    cseq = _load_candles(candles_path)
    ctimes = cseq["time"]
    print(f"candles bars: {len(ctimes)}  ({ctimes[0]} -> {ctimes[-1]})")

    covered = matched = strength_ok = 0
    misses = []
    with open(fixture_path, "r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    for row in rows:
        t = datetime.fromisoformat(row["zone_created_time"].strip())
        end = bisect.bisect_right(ctimes, t)          # candles strictly at/before t
        start = max(0, end - GEOM_WINDOW)
        if end - start < 200:                          # not enough history before this zone
            continue
        covered += 1
        win = {k: cseq[k][start:end] for k in cseq}
        atr_series = indicators.atr(win["high"], win["low"], win["close"])
        atr_end = indicators._recent_atr(atr_series) if hasattr(indicators, "_recent_atr") else None
        if not atr_end:
            atr_end = next((v for v in reversed(atr_series) if v), 0.0) or 0.001
        tol = max(PRICE_FLOOR_TOL, 0.10 * atr_end)
        fmid = (float(row["zone_low"]) + float(row["zone_high"])) / 2.0

        zones = zone_detector.detect_support_zones(win, atr_series)
        hit = next((z for z in zones if abs(z.zone_mid - fmid) <= tol), None)
        if hit:
            matched += 1
            if hit.static_strength == row["label"].strip():
                strength_ok += 1
        elif len(misses) < max_show:
            near = sorted((round(z.zone_mid, 5) for z in zones), key=lambda m: abs(m - fmid))[:4]
            misses.append((str(t), round(fmid, 5), round(tol, 5), near))

    rate = 100 * matched / max(covered, 1)
    print(f"fixture zones          : {len(rows)}")
    print(f"covered (enough history): {covered}")
    print(f"price-matched          : {matched}  ({rate:.1f}%)")
    print(f"strength agreed (of matched): {strength_ok}/{matched}")
    if misses:
        print("sample misses (created_time, fixture_mid, tol, nearest detected mids):")
        for m in misses:
            print("  ", m)
    print("\nNOTE: the backend detector is an engineering RECONSTRUCTION, not the "
          "research zone engine — a gap here is expected and quantifies the difference.")


def _parse(ts: str):
    if not ts:
        return None
    return datetime.fromisoformat(ts.strip())


def _bars_between(a: str, b: str):
    """(t_b - t_a) in whole wall-clock M15 bars, or None if either missing."""
    da, db = _parse(a), _parse(b)
    if da is None or db is None:
        return None
    return (db - da).total_seconds() / M15_SECONDS


def _trading_bars_between(a: str, b: str):
    """M15 bars between two times counting TRADING slots only (FX is closed
    Sat/Sun, ~192 M15 slots per weekend). Research windows are in trading bars,
    so wall-clock counting over-counts across weekends."""
    from datetime import timedelta

    da, db = _parse(a), _parse(b)
    if da is None or db is None:
        return None
    sign = 1
    if db < da:
        da, db, sign = db, da, -1
    count = 0
    t = da
    step = timedelta(seconds=M15_SECONDS)
    # cap iterations defensively (fixture gaps are < ~600 bars)
    guard = 0
    while t < db and guard < 5000:
        t += step
        if t.weekday() < 5:  # Mon-Fri (approx; ignores Sun 22:00 open / holidays)
            count += 1
        guard += 1
    return count * sign


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Validate the Phase 39 zone fixture.")
    parser.add_argument("--fixture", default=DEFAULT_FIXTURE)
    parser.add_argument("--tolerance", type=float, default=SCORE_TOLERANCE)
    parser.add_argument("--max-show", type=int, default=10)
    parser.add_argument("--candles", default=None,
                        help="M15 candle CSV for zone-geometry validation "
                             "(auto-detected under claudeLoad/validation/ if omitted)")
    args = parser.parse_args(argv)

    if not os.path.exists(args.fixture):
        print(f"FATAL: fixture not found: {args.fixture}", file=sys.stderr)
        return 1

    cfg = config.load_locked_config()
    be = config.base_engine()
    max_confirm = int(be.get("max_confirm_wait_bars", 8))
    max_touch_wait = int(be.get("max_touch_wait_bars", 384))
    exp_symbol = str(be["symbol"])
    exp_zone_type = str(be["zone_type"])
    exp_confirm = str(be["confirmation_type"])
    exp_model = str(cfg["model_name"])

    rows = 0
    score_fail, grade_fail = [], []
    confirm_win_fail, touch_win_fail = [], []  # informational (weekend/holiday-approx)
    order_fail = []
    meta_fail = []

    with open(args.fixture, "r", encoding="utf-8", newline="") as fh:
        for i, row in enumerate(csv.DictReader(fh), start=2):
            rows += 1

            # 1. score + grade
            try:
                exp_score = float(row["dynamic_opportunity_score"])
                exp_grade = row["dynamic_grade"].strip()
                act_score = dynamic_score.score_row(row)
                act_grade = dynamic_score.assign_dynamic_grade(act_score)
                if abs(act_score - exp_score) > args.tolerance:
                    score_fail.append((i, exp_score, act_score))
                if act_grade != exp_grade:
                    grade_fail.append((i, exp_grade, act_grade))
            except (KeyError, ValueError) as exc:
                score_fail.append((i, "parse-error", str(exc)))

            # 2. close-reclaim timing windows — INFORMATIONAL only. Exact trading-bar
            # counts need the candle calendar (weekends + holidays); our approximation
            # over-counts Fri->weekend/holiday spans, so we don't fail on it.
            ct = _trading_bars_between(row.get("touch_time", ""), row.get("confirm_time", ""))
            if ct is not None and not (-TIME_TOL_BARS <= ct <= max_confirm + TIME_TOL_BARS):
                confirm_win_fail.append((i, ct))
            tw = _trading_bars_between(row.get("zone_created_time", ""), row.get("touch_time", ""))
            if tw is not None and not (-TIME_TOL_BARS <= tw <= max_touch_wait + TIME_TOL_BARS):
                touch_win_fail.append((i, tw))

            # 2b. chronological ordering — the robust hard invariant (no bar-counting):
            # zone_created <= touch <= confirm <= entry <= exit.
            seq = [
                ("created", _parse(row.get("zone_created_time", ""))),
                ("touch", _parse(row.get("touch_time", ""))),
                ("confirm", _parse(row.get("confirm_time", ""))),
                ("entry", _parse(row.get("entry_time", ""))),
                ("exit", _parse(row.get("exit_time", ""))),
            ]
            present = [(name, t) for name, t in seq if t is not None]
            for (n1, t1), (n2, t2) in zip(present, present[1:]):
                if t2 < t1:
                    order_fail.append((i, f"{n2} < {n1}"))
                    break

            # 3. metadata
            if row.get("expected_symbol") and row["expected_symbol"] != exp_symbol:
                meta_fail.append((i, "symbol", row["expected_symbol"]))
            if row.get("expected_zone_type") and row["expected_zone_type"] != exp_zone_type:
                meta_fail.append((i, "zone_type", row["expected_zone_type"]))
            if row.get("expected_confirmation_type") and row["expected_confirmation_type"] != exp_confirm:
                meta_fail.append((i, "confirmation_type", row["expected_confirmation_type"]))
            if row.get("expected_model_name") and row["expected_model_name"] != exp_model:
                meta_fail.append((i, "model_name", row["expected_model_name"]))

    def block(title, fails, fmt, hard=True):
        tag = "" if hard else " [info]"
        status = "PASS" if not fails else (f"FAIL ({len(fails)})" if hard else f"{len(fails)} outliers")
        print(f"  {title:42}{tag} {status}")
        for f in fails[: args.max_show]:
            print(f"      {fmt(f)}")

    print("== Phase 39 zone-fixture validation ==")
    print(f"fixture     : {args.fixture}")
    print(f"rows tested : {rows}")
    print(f"windows     : max_confirm_wait_bars={max_confirm}, max_touch_wait_bars={max_touch_wait}, tol=+/-{TIME_TOL_BARS} bar")
    print("")
    print("HARD CHECKS:")
    block("dynamic_opportunity_score reproduced", score_fail,
          lambda f: f"line {f[0]}: expected {f[1]} got {f[2]}")
    block("dynamic_grade reproduced", grade_fail,
          lambda f: f"line {f[0]}: expected {f[1]!r} got {f[2]!r}")
    block("chronological ordering (created<=...<=exit)", order_fail,
          lambda f: f"line {f[0]}: {f[1]}")
    block("model metadata matches locked config", meta_fail,
          lambda f: f"line {f[0]}: {f[1]}={f[2]!r}")

    print("\nINFORMATIONAL (approx trading-bar counts; can't exclude holidays without candles):")
    block("confirm within max_confirm_wait_bars", confirm_win_fail,
          lambda f: f"line {f[0]}: ~{f[1]} bars touch->confirm (Fri->weekend/holiday span)", hard=False)
    block("touch within max_touch_wait_bars", touch_win_fail,
          lambda f: f"line {f[0]}: ~{f[1]} bars created->touch", hard=False)

    failed = any([score_fail, grade_fail, order_fail, meta_fail])  # timing windows are informational
    print("\nRESULT:", "FAIL" if failed else "ALL HARD CHECKS PASSED [PASS]")

    # Zone-geometry validation (separate, informational) — runs the real detector
    # on exported candles if a candle CSV is present.
    candles = args.candles or _find_candles_csv()
    if candles and os.path.exists(candles):
        validate_geometry(candles, args.fixture, max_show=args.max_show)
    else:
        print("\n(zone geometry not validated — no candle CSV found under "
              "claudeLoad/validation/; pass --candles PATH)")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
