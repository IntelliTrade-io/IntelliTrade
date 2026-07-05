# coding: utf-8
"""Pin the per-pair key contracts the frontend reads from
currency_strength_snapshots / fx_strength_snapshots. If one of these fails,
a runner changed the shape the dashboard depends on."""
from intellitrade_scanners import (
    scanner_d1h4,
    scanner_h1m15,
    scanner_oanda_daily,
    scanner_oanda_intraday,
)

CORE_INFO = {
    "tf1": "bullish", "tf2": "bearish", "pair": "neutral", "confidence": 42.0,
    "last_bos_tf1": 1.1, "last_bos_tf1_time": "2024-01-01",
    "last_bos_tf2": 1.2, "last_bos_tf2_time": "2024-01-02",
    "last_candle_tf1_time": "2024-01-03", "last_candle_tf2_time": "2024-01-03",
    "last_candle_tf1_close": 1.15,
}


def test_daily_oanda_remap_contract():
    out = scanner_oanda_daily.remap_pair(CORE_INFO)
    assert out == {
        "d1": "bullish", "h4": "bearish", "pair": "neutral", "confidence": 42.0,
        "last_bos_d1": 1.1, "last_bos_d1_time": "2024-01-01",
        "last_bos_h4": 1.2, "last_bos_h4_time": "2024-01-02",
        "error": "",
    }


def test_intraday_oanda_remap_contract():
    out = scanner_oanda_intraday.remap_pair(CORE_INFO, "H1", "M15")
    assert out == {
        "hi_tf": "H1", "lo_tf": "M15",
        "hi": "bullish", "lo": "bearish", "pair": "neutral", "confidence": 42.0,
        "last_bos_hi": 1.1, "last_bos_hi_time": "2024-01-01",
        "last_bos_lo": 1.2, "last_bos_lo_time": "2024-01-02",
        "error": "",
    }


def test_vps_d1h4_remap_contract():
    out = scanner_d1h4.remap_pair(CORE_INFO)
    assert out == {
        "d1": "bullish", "h4": "bearish", "pair": "neutral", "confidence": 42.0,
        "last_bos_d1": 1.1, "last_bos_d1_time": "2024-01-01",
        "last_bos_h4": 1.2, "last_bos_h4_time": "2024-01-02",
        "error": "",
    }


def test_vps_h1m15_remap_contract():
    out = scanner_h1m15.remap_pair(CORE_INFO)
    assert out == {
        "h1": "bullish", "m15": "bearish", "pair": "neutral", "confidence": 42.0,
        "last_bos_h1": 1.1, "last_bos_h1_time": "2024-01-01",
        "last_bos_m15": 1.2, "last_bos_m15_time": "2024-01-02",
        "error": "",
    }


def test_error_entry_remaps_cleanly():
    err = {"tf1": "neutral", "tf2": "neutral", "pair": "neutral",
           "confidence": 0.0, "error": "MT5 no data"}
    assert scanner_oanda_daily.remap_pair(err)["error"] == "MT5 no data"
    assert scanner_d1h4.remap_pair(err)["d1"] == "neutral"


def test_intraday_tf_key_mapping():
    assert scanner_oanda_intraday.TF_KEY == {"H1": "1hour", "M15": "15min"}
