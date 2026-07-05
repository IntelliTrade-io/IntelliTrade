# coding: utf-8
"""
MT5 Feed Adapter — IntelliTrade VPS Scanner
Wraps MetaTrader5 Python API with symbol mapping.
Supports feed abstraction: swap MetaQuotes-Demo → Switch Markets by changing config only.
"""

import os
import time
import logging
import datetime as dt
import pandas as pd

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

log = logging.getLogger(__name__)

# Default symbol map: canonical → MetaQuotes-Demo (1:1, no suffix)
DEFAULT_SYMBOL_MAP: dict[str, str] = {sym: sym for sym in [
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD",
    "EURGBP", "EURJPY", "EURAUD", "EURNZD", "EURCHF", "EURCAD",
    "GBPJPY", "GBPAUD", "GBPNZD", "GBPCHF", "GBPCAD",
    "AUDJPY", "AUDNZD", "AUDCHF", "AUDCAD",
    "NZDJPY", "NZDCHF", "NZDCAD",
    "CHFJPY", "CADJPY", "CADCHF",
]}

_initialized = False


def _tf_constants() -> dict:
    if not MT5_AVAILABLE:
        return {"1day": 5, "4hour": 17, "1hour": 16, "15min": 6}
    return {
        "1day":  mt5.TIMEFRAME_D1,
        "4hour": mt5.TIMEFRAME_H4,
        "1hour": mt5.TIMEFRAME_H1,
        "15min": mt5.TIMEFRAME_M15,
    }


def initialize(server: str = None, login: int = None, password: str = None) -> None:
    global _initialized
    if _initialized:
        return
    if not MT5_AVAILABLE:
        raise RuntimeError("MetaTrader5 not installed. Run: pip install MetaTrader5")

    kwargs: dict = {}
    # Only pass credentials if login is provided — otherwise connect to already-running terminal
    if login:
        kwargs["login"] = int(login)
        kwargs["password"] = str(password) if password else ""
        if server:
            kwargs["server"] = server

    if not mt5.initialize(**kwargs):
        raise RuntimeError(f"MT5 initialize() failed: {mt5.last_error()}")

    info = mt5.account_info()
    if info:
        log.info(f"MT5 connected — login={info.login} server={info.server} balance={info.balance:.2f}")
    else:
        log.warning("MT5 initialized but account_info() returned None")

    _initialized = True


def shutdown() -> None:
    global _initialized
    if _initialized and MT5_AVAILABLE:
        mt5.shutdown()
        _initialized = False


def is_connected() -> bool:
    if not MT5_AVAILABLE or not _initialized:
        return False
    terminal = mt5.terminal_info()
    return terminal is not None and terminal.connected


def ensure_symbol(broker_symbol: str) -> bool:
    """Add symbol to Market Watch. Retries with sleep if symbol_info returns None."""
    if not MT5_AVAILABLE:
        return False
    info = mt5.symbol_info(broker_symbol)
    if info is None:
        if not mt5.symbol_select(broker_symbol, True):
            time.sleep(0.2)
            mt5.symbol_select(broker_symbol, True)
    else:
        if not info.visible:
            mt5.symbol_select(broker_symbol, True)
    return True


def warmup_history(broker_symbol: str, timeframe_key: str,
                   bars: int = 50, retries: int = 2, wait: float = 0.20) -> bool:
    """Pre-fetch a small slice to prime MT5's internal history cache."""
    tf = _tf_constants()[timeframe_key]
    for _ in range(max(1, retries)):
        ok = mt5.copy_rates_from_pos(broker_symbol, tf, 0, bars)
        if ok is not None and len(ok) > 0:
            return True
        time.sleep(wait)
    return False


def fetch_df(canonical_symbol: str, timeframe_key: str, bars: int,
             symbol_map: dict = None,
             max_retries: int = 3, retry_wait: float = 0.25) -> pd.DataFrame:
    """
    Fetch last `bars` candles from MT5 with warmup + 3 fallback strategies.
    Returns DataFrame with columns: time, open, high, low, close, tick_vol
    """
    if not MT5_AVAILABLE:
        raise RuntimeError("MetaTrader5 package not available")
    if not _initialized:
        raise RuntimeError("MT5 not initialized — call initialize() first")

    sm = symbol_map if symbol_map is not None else DEFAULT_SYMBOL_MAP
    broker_symbol = sm.get(canonical_symbol, canonical_symbol)
    tf = _tf_constants()[timeframe_key]

    ensure_symbol(broker_symbol)
    _warmup_bars = {"1day": 80, "4hour": 120, "1hour": 80, "15min": 60}
    warmup_history(broker_symbol, timeframe_key,
                   bars=_warmup_bars.get(timeframe_key, 60), retries=3, wait=retry_wait)

    last_err = None
    for attempt in range(max_retries):
        # Strategy 1: copy_rates_from_pos
        rates = mt5.copy_rates_from_pos(broker_symbol, tf, 0, bars)
        if rates is not None and len(rates) > 0:
            df = pd.DataFrame(rates)
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df.rename(columns={"real_volume": "real_vol", "tick_volume": "tick_vol"}, inplace=True)
            return df[["time", "open", "high", "low", "close", "tick_vol"]].copy()

        # Strategy 2: copy_rates_from (datetime anchor)
        now = dt.datetime.utcnow()
        rates = mt5.copy_rates_from(broker_symbol, tf, now, bars)
        if rates is not None and len(rates) > 0:
            df = pd.DataFrame(rates)
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df.rename(columns={"real_volume": "real_vol", "tick_volume": "tick_vol"}, inplace=True)
            return df[["time", "open", "high", "low", "close", "tick_vol"]].copy()

        # Strategy 3: copy_rates_range
        if timeframe_key == "1day":
            start = now - dt.timedelta(days=500)
        elif timeframe_key == "4hour":
            start = now - dt.timedelta(days=200)
        else:
            start = now - dt.timedelta(days=90)
        rates = mt5.copy_rates_range(broker_symbol, tf, start, now)
        if rates is not None and len(rates) > 0:
            df = pd.DataFrame(rates)[-bars:]
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df.rename(columns={"real_volume": "real_vol", "tick_volume": "tick_vol"}, inplace=True)
            return df[["time", "open", "high", "low", "close", "tick_vol"]].copy()

        last_err = mt5.last_error()
        log.warning(f"[{broker_symbol} {timeframe_key}] attempt {attempt + 1} all strategies failed: {last_err}")
        time.sleep(retry_wait * (1 + attempt))

    raise RuntimeError(f"MT5 no data for {broker_symbol} {timeframe_key}: {last_err}")


def warmup_canonical(canonical_symbol: str, timeframe_key: str,
                     bars: int = 80, retries: int = 3, wait: float = 0.25,
                     symbol_map: dict = None) -> bool:
    """Per-symbol pre-warmup using canonical symbol with mapping applied."""
    if not MT5_AVAILABLE or not _initialized:
        return False
    sm = symbol_map if symbol_map is not None else DEFAULT_SYMBOL_MAP
    broker_symbol = sm.get(canonical_symbol, canonical_symbol)
    ensure_symbol(broker_symbol)
    return warmup_history(broker_symbol, timeframe_key, bars=bars, retries=retries, wait=wait)


def make_fetch_fn(symbol_map: dict = None, max_retries: int = 3, retry_wait: float = 0.25):
    """Return a fetch_fn compatible with strength_core.scan_pair."""
    sm = symbol_map or DEFAULT_SYMBOL_MAP

    def _fetch(canonical_symbol: str, timeframe_key: str, bars: int) -> pd.DataFrame:
        return fetch_df(canonical_symbol, timeframe_key, bars, sm, max_retries, retry_wait)

    return _fetch
