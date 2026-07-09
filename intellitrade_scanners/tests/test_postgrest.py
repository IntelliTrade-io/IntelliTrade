# coding: utf-8
"""Postgrest client: request shapes, headers, filter encoding, errors."""
import json

import pytest

from intellitrade_scanners import postgrest
from intellitrade_scanners.postgrest import Postgrest, PostgrestError, eq, gte, lte, not_in


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else []
        body = json.dumps(self._payload)
        self.content = body.encode()
        self.text = body

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, response=None):
        self.headers = {}
        self.response = response or FakeResponse()
        self.calls = []

    def request(self, method, url, params=None, json=None, headers=None, timeout=None):
        self.calls.append({"method": method, "url": url, "params": params,
                           "json": json, "headers": headers})
        return self.response


@pytest.fixture
def client(monkeypatch):
    def _make(response=None):
        db = Postgrest(url="https://x.supabase.co/", key="svc-key")
        fake = FakeSession(response)
        fake.headers = db._session.headers
        db._session = fake
        return db, fake
    return _make


def test_auth_headers_and_base_url(client):
    db, fake = client()
    db.select("scanner_health")
    assert fake.headers["apikey"] == "svc-key"
    assert fake.headers["Authorization"] == "Bearer svc-key"
    assert fake.calls[0]["url"] == "https://x.supabase.co/rest/v1/scanner_health"


def test_missing_env_raises(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        Postgrest()


def test_select_with_filters(client):
    db, fake = client(FakeResponse(payload=[{"a": 1}]))
    rows = db.select("symbol_mapping", "canonical_symbol, broker_symbol",
                     [eq("feed_name", "metaquotes_demo")])
    assert rows == [{"a": 1}]
    assert fake.calls[0]["params"] == [
        ("select", "canonical_symbol, broker_symbol"),
        ("feed_name", "eq.metaquotes_demo"),
    ]


def test_insert_wraps_single_dict_and_returns_rows(client):
    db, fake = client(FakeResponse(payload=[{"id": 7}]))
    rows = db.insert("fx_strength_snapshots", {"type": "daily"})
    assert rows[0]["id"] == 7
    call = fake.calls[0]
    assert call["method"] == "POST"
    assert call["json"] == [{"type": "daily"}]
    assert call["headers"]["Prefer"] == "return=representation"


def test_upsert_sets_conflict_and_merge_prefer(client):
    db, fake = client()
    db.upsert("fx_candles", [{"symbol": "EURUSD"}], on_conflict="symbol,timeframe,feed_name")
    call = fake.calls[0]
    assert ("on_conflict", "symbol,timeframe,feed_name") in call["params"]
    assert call["headers"]["Prefer"] == "resolution=merge-duplicates,return=representation"


def test_update_uses_patch_with_filters(client):
    db, fake = client()
    db.update("sr_zones", {"is_active": False},
              [eq("symbol", "EURUSD"), not_in("id", ["z1", "z2"])])
    call = fake.calls[0]
    assert call["method"] == "PATCH"
    assert call["json"] == {"is_active": False}
    assert ("id", 'not.in.("z1","z2")') in call["params"]


def test_delete_with_range_and_not_in(client):
    db, fake = client(FakeResponse(payload=[{"id": 1}, {"id": 2}]))
    deleted = db.delete("economic_events", [
        gte("date_time_utc", "2026-01-01"),
        lte("date_time_utc", "2026-02-01"),
        not_in("scraperID", ["a", "b"]),
    ])
    assert len(deleted) == 2
    call = fake.calls[0]
    assert call["method"] == "DELETE"
    assert ("date_time_utc", "gte.2026-01-01") in call["params"]
    assert ("scraperID", 'not.in.("a","b")') in call["params"]


def test_quote_escapes_embedded_quotes():
    assert postgrest._quote('va"l') == '"va\\"l"'


def test_non_2xx_raises_with_context(client):
    db, fake = client(FakeResponse(status_code=409, payload={"message": "conflict"}))
    with pytest.raises(PostgrestError, match=r"POST market_candles -> 409"):
        db.insert("market_candles", {"x": 1})


def test_empty_body_returns_empty_list(client):
    resp = FakeResponse(payload=[])
    resp.content = b""
    db, fake = client(resp)
    assert db.delete("t", [eq("a", 1)]) == []
