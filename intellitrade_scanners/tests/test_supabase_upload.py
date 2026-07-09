# coding: utf-8
"""Pin supabase_upload's table payloads and failure semantics (transport stubbed)."""
import pytest

from intellitrade_scanners import supabase_upload


class StubDB:
    def __init__(self, insert_results=None, fail_tables=()):
        self.calls = []
        self.insert_results = dict(insert_results or {})
        self.fail_tables = set(fail_tables)

    def _record(self, op, table, rows, on_conflict=None):
        self.calls.append({"op": op, "table": table, "rows": rows, "on_conflict": on_conflict})
        if table in self.fail_tables:
            raise RuntimeError(f"boom {table}")
        return self.insert_results.get(table, [])

    def insert(self, table, rows):
        return self._record("insert", table, rows)

    def upsert(self, table, rows, on_conflict=None):
        return self._record("upsert", table, rows, on_conflict)


@pytest.fixture
def stub(monkeypatch):
    def _install(**kwargs):
        db = StubDB(**kwargs)
        monkeypatch.setattr(supabase_upload, "_client", db)
        return db
    return _install


RUN_INFO = {"ts_utc": "2026-07-05T00:00:00Z"}
PAIRS = {"EURUSD": {"d1": "bullish"}}
CURR = {"EUR": {"score": 50.0}}
CURR_W = {"EUR": {"score": 40.0}}


def test_upload_snapshot_writes_both_tables_and_returns_id(stub):
    db = stub(insert_results={"fx_strength_snapshots": [{"id": 99}]})
    snap_id = supabase_upload.upload_snapshot(
        "daily", "metaquotes_demo", RUN_INFO, PAIRS, CURR, CURR_W, scanner_version="1.5.2-vps")
    assert snap_id == 99
    primary, compat = db.calls
    assert primary["table"] == "fx_strength_snapshots"
    assert primary["rows"]["feed_name"] == "metaquotes_demo"
    assert primary["rows"]["scanner_version"] == "1.5.2-vps"
    assert primary["rows"]["pairs"] == PAIRS
    # compat table gets the legacy shape: no feed_name / scanner_version
    assert compat["table"] == "currency_strength_snapshots"
    assert "feed_name" not in compat["rows"]
    assert "scanner_version" not in compat["rows"]
    assert compat["rows"]["currencies_weighted"] == CURR_W


def test_upload_snapshot_primary_failure_still_writes_compat(stub):
    db = stub(fail_tables={"fx_strength_snapshots"})
    snap_id = supabase_upload.upload_snapshot("daily", "f", RUN_INFO, PAIRS, CURR, CURR_W)
    assert snap_id is None
    assert [c["table"] for c in db.calls] == [
        "fx_strength_snapshots", "currency_strength_snapshots"]


def test_upload_snapshot_compat_failure_keeps_id(stub):
    db = stub(insert_results={"fx_strength_snapshots": [{"id": 5}]},
              fail_tables={"currency_strength_snapshots"})
    assert supabase_upload.upload_snapshot("daily", "f", RUN_INFO, PAIRS, CURR, CURR_W) == 5


def test_upload_components_skips_without_snapshot_id(stub):
    db = stub()
    supabase_upload.upload_components(None, {"EURUSD": {}}, "1day", "4hour")
    assert db.calls == []


def test_upload_components_row_shape(stub):
    db = stub()
    supabase_upload.upload_components(
        7, {"EURUSD": {"tf1": "bullish", "tf2": "bearish", "pair": "neutral", "confidence": 42.0}},
        "1day", "4hour")
    (call,) = db.calls
    assert call["table"] == "fx_strength_components"
    assert call["rows"] == [{
        "snapshot_id": 7, "symbol": "EURUSD",
        "tf1": "1day", "tf1_trend": "bullish",
        "tf2": "4hour", "tf2_trend": "bearish",
        "pair_label": "neutral", "confidence": 42.0,
    }]


def test_upsert_latest_candles_only_present_timestamps(stub):
    db = stub()
    supabase_upload.upsert_latest_candles(
        {
            "EURUSD": {"last_candle_tf1_time": "t1", "last_candle_tf1_close": 1.1,
                       "last_candle_tf2_time": "t2"},
            "GBPUSD": {},  # failed pair: no candle info -> no rows
        },
        "metaquotes_demo", "1day", "4hour")
    (call,) = db.calls
    assert call["op"] == "upsert"
    assert call["on_conflict"] == "symbol,timeframe,feed_name"
    assert call["rows"] == [
        {"symbol": "EURUSD", "timeframe": "1day", "feed_name": "metaquotes_demo",
         "time": "t1", "close": 1.1, "tick_vol": 0},
        {"symbol": "EURUSD", "timeframe": "4hour", "feed_name": "metaquotes_demo",
         "time": "t2", "close": 0.0, "tick_vol": 0},
    ]


def test_update_health_ok_sets_success_and_clears_error(stub):
    db = stub()
    supabase_upload.update_health("d1h4_scanner", "D1_H4", "feed",
                                  status="ok", symbols_processed=28)
    (call,) = db.calls
    assert call["table"] == "scanner_health"
    assert call["on_conflict"] == "scanner_name,timeframe_group"
    row = call["rows"]
    assert row["status"] == "ok"
    assert row["last_error"] is None
    assert row["last_success_at"]


def test_update_health_error_keeps_error_no_success(stub):
    db = stub()
    supabase_upload.update_health("d1h4_scanner", "D1_H4", "feed",
                                  status="error", symbols_processed=0,
                                  last_error="MT5 init failed")
    row = db.calls[0]["rows"]
    assert row["last_error"] == "MT5 init failed"
    assert "last_success_at" not in row
