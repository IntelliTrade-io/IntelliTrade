# coding: utf-8
"""Pin supabase_writer's payload shaping and prune semantics (transport stubbed)."""
import pytest

from support_resistance import supabase_writer


class StubDB:
    def __init__(self, upsert_results=None):
        self.calls = []
        self.upsert_results = dict(upsert_results or {})

    def upsert(self, table, rows, on_conflict=None):
        self.calls.append({"op": "upsert", "table": table, "rows": rows,
                           "on_conflict": on_conflict})
        return self.upsert_results.get(table, [])

    def delete(self, table, filters):
        self.calls.append({"op": "delete", "table": table, "filters": list(filters)})
        return [{"id": "gone"}]

    def update(self, table, values, filters):
        self.calls.append({"op": "update", "table": table, "values": values,
                           "filters": list(filters)})
        return [{"id": "z-old-1"}, {"id": "z-old-2"}]


@pytest.fixture
def stub(monkeypatch):
    def _install(**kwargs):
        db = StubDB(**kwargs)
        monkeypatch.setattr(supabase_writer, "_client", db)
        return db
    return _install


def test_upsert_candles_empty_is_noop(stub):
    db = stub()
    assert supabase_writer.upsert_candles([]) == 0
    assert db.calls == []


def test_upsert_candles_conflict_key(stub):
    db = stub()
    rows = [{"symbol": "EURUSD", "timeframe": "15min", "time": "t"}]
    assert supabase_writer.upsert_candles(rows) == 1
    assert db.calls[0]["on_conflict"] == "symbol,timeframe,time"


def test_upsert_zone_returns_id(stub):
    db = stub(upsert_results={"sr_zones": [{"id": "zone-1"}]})
    zone_id = supabase_writer.upsert_zone({"symbol": "EURUSD"})
    assert zone_id == "zone-1"
    assert db.calls[0]["on_conflict"] == "symbol,zone_side,zone_created_time,model_version"


def test_upsert_opportunity_strips_internal_keys(stub):
    db = stub()
    supabase_writer.upsert_opportunity(
        {"dynamic_grade": "B", "dynamic_grade_display": "B+", "_debug": 1, "score": 0.5},
        zone_id="zone-9")
    (call,) = db.calls
    assert call["table"] == "sr_opportunities"
    assert call["on_conflict"] == "zone_id,model_version"
    assert call["rows"] == {"dynamic_grade": "B", "score": 0.5, "zone_id": "zone-9"}


def test_prune_stale_safety_valve_on_empty_zone_set(stub):
    db = stub()
    counts = supabase_writer.prune_stale("EURUSD", "v1", [])
    assert counts == {"opps_deleted": 0, "zones_deactivated": 0}
    assert db.calls == []


def test_prune_stale_deletes_and_deactivates(stub):
    db = stub()
    counts = supabase_writer.prune_stale("EURUSD", "v1", ["z1", "z2"])
    assert counts == {"opps_deleted": 1, "zones_deactivated": 2}
    delete_call, update_call = db.calls
    assert delete_call["op"] == "delete"
    assert delete_call["table"] == "sr_opportunities"
    assert ("zone_id", 'not.in.("z1","z2")') in delete_call["filters"]
    assert update_call["op"] == "update"
    assert update_call["values"] == {"is_active": False}
    assert ("id", 'not.in.("z1","z2")') in update_call["filters"]
