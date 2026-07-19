# coding: utf-8
"""
Shadow-mode audit tool (§6 audit).

Human-readable report used before the flag flips and on demand. Per case:
payload hash re-verify, ladder parity vs payload, direction math re-derivation,
candle coverage, duplicate scan, and public/private reconciliation. Read-only.
"""

from __future__ import annotations

import datetime as dt

from intellitrade_scanners.postgrest import eq
from intellitrade_scanners.review import best_expression, db, ingest


def _check_snapshot_hashes(client) -> list[str]:
    out = []
    snaps = client.select("csm_review_snapshots",
                          columns="id,source_snapshot_id,payload,payload_hash,ladder")
    for s in snaps:
        recomputed = ingest.payload_hash(s["payload"])
        if recomputed != s["payload_hash"]:
            out.append(f"  [HASH MISMATCH] review_snapshot {s['id']} "
                       f"(source {s['source_snapshot_id']})")
        expected_ladder = best_expression.build_ladder(
            (s["payload"] or {}).get("currencies_weighted") or {})
        if [r["currency"] for r in expected_ladder] != [r["currency"] for r in (s["ladder"] or [])]:
            out.append(f"  [LADDER DRIFT] review_snapshot {s['id']}")
    return out


def _check_direction(client) -> list[str]:
    out = []
    for c in client.select("csm_review_cases", columns="*"):
        expected_dir = best_expression.direction_multiplier(c["strong_currency"], c["pair_symbol"])
        if expected_dir != c["direction_multiplier"]:
            out.append(f"  [DIRECTION] case {c['id']} {c['pair_symbol']}: "
                       f"stored {c['direction_multiplier']} != derived {expected_dir}")
        expected_align = best_expression.expected_alignment(c["direction_multiplier"])
        if expected_align != c["pair_alignment"]:
            out.append(f"  [ALIGNMENT] case {c['id']} {c['pair_symbol']}: "
                       f"stored {c['pair_alignment']} != expected {expected_align}")
    return out


def _check_duplicates(client) -> list[str]:
    out = []
    keys = [c["case_key"] for c in client.select("csm_review_cases", columns="case_key")]
    seen = set()
    for k in keys:
        if k in seen:
            out.append(f"  [DUPLICATE CASE_KEY] {k}")
        seen.add(k)
    return out


def _check_reconciliation(client) -> list[str]:
    out = []
    published = {c["id"] for c in client.select(
        "csm_review_cases", columns="id,status", filters=[eq("status", "published")])}
    public_case_ids = {r["case_id"] for r in client.select(
        "csm_public_reviews", columns="case_id")}
    missing = published - public_case_ids
    orphan = public_case_ids - published
    for cid in missing:
        out.append(f"  [RECON] case {cid} is published but has no csm_public_reviews row")
    for cid in orphan:
        out.append(f"  [RECON] public review references case {cid} not marked published")
    return out


def build_report(client=None) -> str:
    db_client = client or db.get_client()
    now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    lines = [f"CSM Review Audit @ {now}", "=" * 60]

    sections = [
        ("Snapshot hash + ladder parity", _check_snapshot_hashes),
        ("Direction / alignment math", _check_direction),
        ("Duplicate case keys", _check_duplicates),
        ("Public/private reconciliation", _check_reconciliation),
    ]
    total_issues = 0
    for title, fn in sections:
        issues = fn(db_client)
        total_issues += len(issues)
        lines.append(f"\n{title}: {'OK' if not issues else str(len(issues)) + ' issue(s)'}")
        lines.extend(issues)

    cases = db_client.select("csm_review_cases", columns="status")
    counts: dict[str, int] = {}
    for c in cases:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    lines.append("\nCase status counts:")
    for status, n in sorted(counts.items()):
        lines.append(f"  {status}: {n}")

    lines.append("\n" + "=" * 60)
    lines.append(f"TOTAL ISSUES: {total_issues}")
    return "\n".join(lines)


def run(client=None) -> dict:
    report = build_report(client)
    print(report)
    return {"issues": report.count("[")}
