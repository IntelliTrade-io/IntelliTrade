# coding: utf-8
"""OANDA adapter tests — response parsing, retries, config errors."""
import pandas as pd
import pytest

from intellitrade_scanners import oanda_adapter


class FakeResponse:
    def __init__(self, candles):
        self._candles = candles

    def raise_for_status(self):
        pass

    def json(self):
        return {"candles": self._candles}


class FakeSession:
    def __init__(self, candles, fail_times=0):
        self.candles = candles
        self.fail_times = fail_times
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        if self.fail_times > 0:
            self.fail_times -= 1
            raise ConnectionError("boom")
        return FakeResponse(self.candles)


def candle(time, o, h, l, c, complete=True, volume=42):
    return {"time": time, "complete": complete, "volume": volume,
            "mid": {"o": str(o), "h": str(h), "l": str(l), "c": str(c)}}


CANDLES = [
    candle("2024-01-01T00:00:00Z", 1.10, 1.11, 1.09, 1.105),
    candle("2024-01-01T04:00:00Z", 1.105, 1.12, 1.10, 1.115),
    candle("2024-01-01T08:00:00Z", 1.115, 1.13, 1.11, 1.12, complete=False),
]


@pytest.fixture
def fake_session(monkeypatch):
    def _install(candles, fail_times=0):
        session = FakeSession(candles, fail_times)
        monkeypatch.setattr(oanda_adapter, "_get_session",
                            lambda: (session, "https://fake"))
        return session
    return _install


def test_fetch_df_parses_and_drops_incomplete(fake_session):
    session = fake_session(CANDLES)
    df = oanda_adapter.fetch_df("EURUSD", "4hour", 500)
    assert list(df.columns) == ["time", "open", "high", "low", "close", "tick_vol"]
    assert len(df) == 2  # incomplete candle dropped
    assert df["close"].iloc[-1] == pytest.approx(1.115)
    assert df["time"].dt.tz is not None
    url, params = session.calls[0]
    assert url == "https://fake/v3/instruments/EUR_USD/candles"
    assert params["granularity"] == "H4"
    assert params["count"] == 500


def test_fetch_df_caps_bars_at_5000(fake_session):
    session = fake_session(CANDLES)
    oanda_adapter.fetch_df("EURUSD", "1day", 99999)
    assert session.calls[0][1]["count"] == 5000
    assert session.calls[0][1]["granularity"] == "D"


def test_fetch_df_retries_then_succeeds(fake_session):
    session = fake_session(CANDLES, fail_times=2)
    df = oanda_adapter.fetch_df("EURUSD", "1hour", 100, max_retries=3, retry_wait=0.0)
    assert len(df) == 2
    assert len(session.calls) == 3


def test_fetch_df_raises_after_retries(fake_session):
    fake_session([], fail_times=0)  # always empty
    with pytest.raises(RuntimeError, match="no data for EURUSD"):
        oanda_adapter.fetch_df("EURUSD", "15min", 100, max_retries=2, retry_wait=0.0)


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("OANDA_API_KEY", raising=False)
    monkeypatch.setattr(oanda_adapter, "_session", None)
    with pytest.raises(RuntimeError, match="OANDA_API_KEY"):
        oanda_adapter._get_session()


def test_make_fetch_fn_signature(fake_session):
    fake_session(CANDLES)
    fetch_fn = oanda_adapter.make_fetch_fn(max_retries=1, retry_wait=0.0)
    df = fetch_fn("GBPJPY", "4hour", 10)
    assert isinstance(df, pd.DataFrame)
