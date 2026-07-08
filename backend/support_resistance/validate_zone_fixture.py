# coding: utf-8
"""
Zone-geometry validation — backend engine vs canonical research reference.

Context: the original Phase 39 zone fixture's source candles are unrecoverable
(see fixtures manifest / memory), so that fixture cannot be reproduced and is
kept for SCORING only (run_fixture_validation.py, 428/428). For GEOMETRY we use
a controllable reference:

  * candles  = fixtures/controlled_qc_oanda_eurusd_m15_2021_2025.csv.gz
               (QuantConnect Oanda mid, M15, label=left)
  * reference = fixtures/controlled_zone_events_reference.csv
               generated ONCE by the REAL research code
               (claudeLoad/SnRTool/researchCode/zone_research_io.generate_zone_events)
               on those exact candles.

This validates that the shipped backend engine (research_zone_engine, used by
zone_detector) reproduces the research zone geometry + labels EXACTLY on
identical candles — i.e. the port is faithful. It does NOT claim anything about
the research model's live predictive accuracy (that's the separate win-rate work).

Run:
    python backend/support_resistance/validate_zone_fixture.py
Outputs:
    reports/zone_validation_report.json
    reports/zone_validation_mismatches.csv
"""

import csv
import gzip
import json
import logging
import os
import sys
from datetime import datetime

_PKG_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # -> backend/
if _PKG_PARENT not in sys.path:
    sys.path.insert(0, _PKG_PARENT)

from support_resistance import research_zone_engine as rze  # noqa: E402

logger = logging.getLogger(__name__)

_HERE = os.path.dirname(os.path.abspath(__file__))
_FX = os.path.join(_HERE, "fixtures")
_REPORTS = os.path.join(_HERE, "reports")

CANDLES_GZ = os.path.join(_FX, "controlled_qc_oanda_eurusd_m15_2021_2025.csv.gz")
CANDLE_MANIFEST = os.path.join(_FX, "controlled_qc_oanda_eurusd_m15_2021_2025_manifest.json")
REFERENCE = os.path.join(_FX, "controlled_zone_events_reference.csv")

# Locked research zone params (verified identical to research code).
RZ_PARAMS = dict(swing_lookback=4, atr_period=14, zone_width_atr=0.35,
                 merge_tolerance_atr=0.30, min_touches=3)


def _load_candles():
    errors, warnings = [], []
    rows = []
    with gzip.open(CANDLES_GZ, "rt", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        for col in ("time", "open", "high", "low", "close"):
            if col not in header:
                raise ValueError(f"candle file missing column: {col}")
        rows = list(reader)

    seen, dups, bad = set(), 0, 0
    times, o, h, l, c = [], [], [], [], []
    for r in rows:
        try:
            t = datetime.fromisoformat(r["time"].strip())
            oo, hh, ll, cc = float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"])
        except Exception:
            bad += 1
            continue
        if t in seen:
            dups += 1
            continue
        seen.add(t)
        if not (hh >= max(oo, cc) and ll <= min(oo, cc) and hh >= ll):
            bad += 1
            continue
        times.append(t); o.append(oo); h.append(hh); l.append(ll); c.append(cc)

    if dups:
        errors.append(f"{dups} duplicate timestamps")
    if bad:
        errors.append(f"{bad} rows failed OHLC/parse sanity")
    if os.path.exists(CANDLE_MANIFEST):
        man = json.load(open(CANDLE_MANIFEST, encoding="utf-8"))
        if man.get("rows") not in (None, len(rows)):
            warnings.append(f"manifest rows={man.get('rows')} vs loaded {len(rows)}")
    return {"time": times, "open": o, "high": h, "low": l, "close": c}, errors, warnings


def _load_reference():
    with open(REFERENCE, "r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _key(zone_type, low, high, touches, score, label):
    return (zone_type, round(float(low), 6), round(float(high), 6), int(touches), int(score), str(label))


def validate() -> dict:
    seqs, cerr, cwarn = _load_candles()
    ref = _load_reference()

    # backend engine output on the same candles
    events = rze.generate_zone_events(
        seqs["time"], seqs["open"], seqs["high"], seqs["low"], seqs["close"],
        symbol="EURUSD", timeframe="M15", max_events=10_000_000, **RZ_PARAMS,
    )

    # ordered field-exact comparison (same algorithm + candles => must be identical)
    ref_keys = [_key(r["zone_type"], r["low"], r["high"], r["touches"], r["score"], r["label"]) for r in ref]
    port_keys = [_key(e["zone_type"], e["low"], e["high"], e["touches"], e["score"], e["label"]) for e in events]

    n = min(len(ref_keys), len(port_keys))
    exact = sum(1 for i in range(n) if ref_keys[i] == port_keys[i])
    identical = ref_keys == port_keys

    # per-field pass rates (over the reference set, positional)
    geom_pass = label_pass = 0
    mismatches = []
    for i in range(n):
        r = ref[i]; e = events[i]
        g = abs(float(r["low"]) - e["low"]) <= 1e-6 and abs(float(r["high"]) - e["high"]) <= 1e-6 \
            and r["zone_type"] == e["zone_type"]
        lab = str(r["label"]) == str(e["label"])
        if g:
            geom_pass += 1
        if lab:
            label_pass += 1
        if not (g and lab) and len(mismatches) < 20:
            mismatches.append({
                "ref_index": i,
                "ref_zone_type": r["zone_type"], "port_zone_type": e["zone_type"],
                "ref_low": r["low"], "port_low": round(e["low"], 6),
                "ref_high": r["high"], "port_high": round(e["high"], 6),
                "ref_label": r["label"], "port_label": e["label"],
                "ref_touches": r["touches"], "port_touches": e["touches"],
            })

    total = len(ref_keys)
    geom_rate = geom_pass / total if total else 0.0
    label_rate = label_pass / total if total else 0.0

    status = "passed" if (identical and len(ref_keys) == len(port_keys)) else (
        "partial" if geom_rate >= 0.90 else "failed")

    report = {
        "purpose": "backend engine vs canonical research reference (port fidelity on controlled candles)",
        "candles": os.path.basename(CANDLES_GZ),
        "candle_rows": len(seqs["time"]),
        "candle_start": str(seqs["time"][0]) if seqs["time"] else None,
        "candle_end": str(seqs["time"][-1]) if seqs["time"] else None,
        "candle_validation_errors": cerr,
        "candle_validation_warnings": cwarn,
        "reference": os.path.basename(REFERENCE),
        "reference_generated_by": "claudeLoad/SnRTool/researchCode/zone_research_io.generate_zone_events (real research code)",
        "params": RZ_PARAMS,
        "reference_events": len(ref_keys),
        "backend_events": len(port_keys),
        "exact_positional_matches": exact,
        "identical": bool(identical),
        "geometry_pass_rate": round(geom_rate, 6),
        "label_pass_rate": round(label_rate, 6),
        "zone_geometry_validation_status": status,
        "close_reclaim_validation_status": "simplified",
        "note": "Validates the shipped backend engine reproduces the research zone "
                "algorithm EXACTLY on controlled candles. The original Phase 39 fixture "
                "geometry is NOT validated (its source candles are unrecoverable) and is "
                "kept for scoring only.",
        "first_mismatches": mismatches,
    }
    os.makedirs(_REPORTS, exist_ok=True)
    json.dump(report, open(os.path.join(_REPORTS, "zone_validation_report.json"), "w"), indent=2, default=str)
    with open(os.path.join(_REPORTS, "zone_validation_mismatches.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ref_index", "ref_zone_type", "port_zone_type", "ref_low", "port_low",
                    "ref_high", "port_high", "ref_label", "port_label", "ref_touches", "port_touches"])
        for m in mismatches:
            w.writerow([m[k] for k in ["ref_index", "ref_zone_type", "port_zone_type", "ref_low",
                                       "port_low", "ref_high", "port_high", "ref_label",
                                       "port_label", "ref_touches", "port_touches"]])
    return report


def main() -> int:
    r = validate()
    logger.info("== Zone geometry validation (backend engine vs research reference) ==")
    logger.info("candles           : %s (%s -> %s)", r["candle_rows"], r["candle_start"], r["candle_end"])
    if r["candle_validation_errors"]:
        logger.warning("candle ERRORS     : %s", r["candle_validation_errors"])
    if r["candle_validation_warnings"]:
        logger.warning("candle warnings   : %s", r["candle_validation_warnings"])
    logger.info("reference events  : %s (by %s)",
                r["reference_events"], r["reference_generated_by"].split("(")[0].strip())
    logger.info("backend events    : %s", r["backend_events"])
    logger.info("exact matches     : %s / %s", r["exact_positional_matches"], r["reference_events"])
    logger.info("identical         : %s", r["identical"])
    logger.info("geometry pass     : %.2f%%", r["geometry_pass_rate"] * 100)
    logger.info("label pass        : %.2f%%", r["label_pass_rate"] * 100)
    logger.info("zone_geometry_validation_status = %s", r["zone_geometry_validation_status"])
    logger.info("close_reclaim_validation_status = %s", r["close_reclaim_validation_status"])
    logger.info("reports -> backend/support_resistance/reports/")
    return 0 if r["zone_geometry_validation_status"] == "passed" else 1


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    sys.exit(main())
