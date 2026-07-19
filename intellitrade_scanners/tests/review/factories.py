# coding: utf-8
"""Shared fixtures for the CSM review pipeline tests.

FakeClient is an in-memory stand-in for the PostgREST client with just enough
behaviour (eq/gte filters, autoincrement ids, unique-constraint violations,
upsert-on-conflict) to exercise the IO stages without a database.
"""

from __future__ import annotations

from intellitrade_scanners.postgrest import PostgrestError

# Unique constraints the pipeline relies on (subset used by tests).
_UNIQUE: dict[str, list[tuple[str, ...]]] = {
    "csm_review_snapshots": [("source_snapshot_id",), ("feed_name", "snapshot_type", "candle_close_ts")],
    "csm_review_cases": [("case_key",)],
    "csm_public_reviews": [("case_id",), ("slug",)],
    "fx_ohlc_candles": [("feed_name", "symbol", "timeframe", "open_time")],
    "csm_review_evaluations": [("case_id", "evaluation_version")],
    "csm_review_monthly_summaries": [("capture_month",)],
    "csm_review_aggregate_stats": [("methodology_version",)],
}


class FakeClient:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict]] = {}
        self._seq: dict[str, int] = {}

    # ── helpers ──
    def _rows(self, table: str) -> list[dict]:
        return self.tables.setdefault(table, [])

    def _next_id(self, table: str) -> int:
        self._seq[table] = self._seq.get(table, 0) + 1
        return self._seq[table]

    @staticmethod
    def _match(row: dict, filters) -> bool:
        for col, expr in filters:
            op, _, val = expr.partition(".")
            actual = row.get(col)
            if op == "eq":
                if str(actual) != val:
                    return False
            elif op == "gte":
                if actual is None or str(actual) < val:
                    return False
            elif op == "lte":
                if actual is None or str(actual) > val:
                    return False
            else:
                raise NotImplementedError(op)
        return True

    def _violates_unique(self, table: str, row: dict, ignore=None) -> bool:
        for cols in _UNIQUE.get(table, []):
            for other in self._rows(table):
                if other is ignore:
                    continue
                if all(other.get(c) == row.get(c) for c in cols):
                    return True
        return False

    # ── API ──
    def select(self, table: str, columns: str = "*", filters=()) -> list[dict]:
        return [dict(r) for r in self._rows(table) if self._match(r, filters)]

    def insert(self, table: str, rows):
        rows = [rows] if isinstance(rows, dict) else list(rows)
        out = []
        for r in rows:
            if self._violates_unique(table, r):
                raise PostgrestError(f"POST {table} -> 409: duplicate key")
            rec = dict(r)
            rec.setdefault("id", self._next_id(table))
            self._rows(table).append(rec)
            out.append(dict(rec))
        return out

    def upsert(self, table: str, rows, on_conflict: str | None = None):
        rows = [rows] if isinstance(rows, dict) else list(rows)
        keys = tuple(on_conflict.split(",")) if on_conflict else ()
        out = []
        for r in rows:
            existing = None
            if keys:
                for other in self._rows(table):
                    if all(other.get(c) == r.get(c) for c in keys):
                        existing = other
                        break
            if existing is not None:
                existing.update(r)
                out.append(dict(existing))
            else:
                rec = dict(r)
                rec.setdefault("id", self._next_id(table))
                self._rows(table).append(rec)
                out.append(dict(rec))
        return out

    def update(self, table: str, values, filters):
        out = []
        for r in self._rows(table):
            if self._match(r, filters):
                r.update(values)
                out.append(dict(r))
        return out

    def delete(self, table: str, filters):
        kept, removed = [], []
        for r in self._rows(table):
            (removed if self._match(r, filters) else kept).append(r)
        self.tables[table] = kept
        return removed


# ── synthetic data builders ─────────────────────────────────────────────────

from intellitrade_scanners.review import best_expression  # noqa: E402


def currencies_weighted(scores: dict) -> dict:
    """Build a currencies_weighted map from a {currency: score} dict."""
    out = {}
    for code, score in scores.items():
        bias = "Strong" if score > 15 else "Weak" if score < -15 else "Neutral"
        out[code] = {"bias": bias, "score": score, "strong_w": 0.0,
                     "weak_w": 0.0, "considered_w": 0.0, "avg_conf": 0.0}
    return out


def _pair_entry(label: str, conf: float, candle_time: str, candle_close: float) -> dict:
    return {
        "d1": label, "h4": label, "pair": label, "confidence": conf,
        "last_bos_d1": None, "last_bos_d1_time": None,
        "last_bos_h4": None, "last_bos_h4_time": None,
        "last_candle_h4_time": candle_time, "last_candle_h4_close": candle_close,
        "last_candle_d1_time": candle_time, "last_candle_d1_close": candle_close,
        "error": "",
    }


def pairs_payload(labels: dict, candle_time: str = "2026-06-01T04:00:00Z",
                  candle_close: float = 1.5) -> dict:
    """Build a complete 28-pair map (neutral by default) with `labels` applied.

    `labels` is {symbol: (pair_label, confidence)}. A complete payload is
    required for ingest validity; the detector reads only the overridden pair.
    """
    out = {sym: _pair_entry("neutral", 0.0, candle_time, candle_close)
           for sym in best_expression.STANDARD_PAIRS}
    for symbol, (label, conf) in labels.items():
        out[symbol] = _pair_entry(label, conf, candle_time, candle_close)
    return out


def source_row(row_id: int, run_ts: str, scores: dict, labels: dict,
               feed: str = "metaquotes_demo", run_id: str = "abc123",
               model_version: str = "csm-daily-v43-softgate-1") -> dict:
    """A fx_strength_snapshots-shaped source row for ingest tests."""
    return {
        "id": row_id,
        "type": "daily",
        "feed_name": feed,
        "scanner_version": "1.5.2-vps",
        "run_info": {"ts_utc": run_ts, "scanner": "d1h4_scanner", "feed": feed,
                     "version": "1.5.2-vps", "run_id": run_id,
                     "model_version": model_version, "tf1": "1day", "tf2": "4hour",
                     "symbols_ok": 28, "symbols_fail": 0},
        "pairs": pairs_payload(labels),
        "currencies_raw": currencies_weighted(scores),
        "currencies_weighted": currencies_weighted(scores),
        "created_at": run_ts,
    }


def review_snapshot(snap_id: int, candle_close_ts: str, scores: dict, labels: dict,
                    feed: str = "metaquotes_demo",
                    model_version: str = "csm-daily-v43-softgate-1") -> dict:
    """A csm_review_snapshots-shaped record for detector.detect_cases."""
    weighted = currencies_weighted(scores)
    return {
        "id": snap_id,
        "candle_close_ts": candle_close_ts,
        "captured_at": candle_close_ts,
        "feed_name": feed,
        "scanner_version": "1.5.2-vps",
        "model_version": model_version,
        "ladder": best_expression.build_ladder(weighted),
        "payload": {"pairs": pairs_payload(labels), "currencies_weighted": weighted},
        "completeness": "complete",
    }
