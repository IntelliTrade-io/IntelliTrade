# coding: utf-8
"""
Candle ingestion for the SR Alpha backend.

Clean interface: every fetch returns a pandas DataFrame with columns
    time (tz-aware UTC), open, high, low, close, volume

Three sources, in priority order:
  1. MT5  — reuses the shared feed adapter (intellitrade_scanners/feed_adapter.py)
            if it is importable and MetaTrader5 is installed. This is the
            production path on the VPS.  [TODO: wire symbol_map / feed config
            from Supabase broker_feeds like the strength scanner does.]
  2. CSV  — load a local OHLC csv for offline dev / backtests.
  3. mock — deterministic synthetic series for local smoke tests (no network).

The rest of the backend depends only on the DataFrame contract above, so the
source can be swapped without touching scoring / zone logic.
"""

import os
import sys
import logging
import datetime as dt
from typing import Optional

import pandas as pd

log = logging.getLogger(__name__)

REQUIRED_COLUMNS = ["time", "open", "high", "low", "close", "volume"]


def broker_utc_offset_hours(df: pd.DataFrame) -> int:
    """Detect the broker-server -> true-UTC offset from candle timestamps.

    MT5 (e.g. MetaQuotes-Demo) returns bar times in the broker's server timezone
    (EET/EEST = UTC+2/+3), but feed_adapter labels them as UTC. The latest bar's
    (mislabelled) time is therefore ~offset hours ahead of the real UTC clock.
    We compare the last bar to `now` in true UTC and snap to whole hours, which
    also absorbs DST automatically. Returns 0 if timestamps already look UTC.
    """
    if df.empty:
        return 0
    now_utc = dt.datetime.now(dt.timezone.utc)
    last = pd.Timestamp(df["time"].iloc[-1]).to_pydatetime()
    if last.tzinfo is None:
        last = last.replace(tzinfo=dt.timezone.utc)
    return int(round((last - now_utc).total_seconds() / 3600.0))


def _shift_to_utc(df: pd.DataFrame) -> pd.DataFrame:
    """Shift broker-time candle stamps to true UTC (see broker_utc_offset_hours)."""
    offset = broker_utc_offset_hours(df)
    if offset != 0:
        df = df.copy()
        df["time"] = df["time"] - pd.Timedelta(hours=offset)
        log.info(f"Corrected broker->UTC offset of {offset:+d}h on candle timestamps")
    return df

# The MT5 feed adapter lives in the intellitrade_scanners package (repo root).
# Fallback paths cover source checkouts without `pip install -e .` and the
# pre-package VPS layout (flat scripts/vps) until the 6.7 git-based deploy.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_VPS_DIR = os.path.join(_REPO_ROOT, "scripts", "vps")


def _import_feed_adapter():
    try:
        from intellitrade_scanners import feed_adapter
        return feed_adapter
    except ImportError:
        pass
    if _REPO_ROOT not in sys.path:
        sys.path.insert(0, _REPO_ROOT)
    try:
        from intellitrade_scanners import feed_adapter
        return feed_adapter
    except ImportError:
        pass
    if _VPS_DIR not in sys.path:
        sys.path.insert(0, _VPS_DIR)
    import feed_adapter  # type: ignore
    return feed_adapter


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce an arbitrary OHLC frame to the REQUIRED_COLUMNS contract."""
    df = df.copy()
    # tolerate common alternate volume column names from MT5
    if "volume" not in df.columns:
        for alt in ("tick_vol", "tick_volume", "real_vol", "real_volume"):
            if alt in df.columns:
                df["volume"] = df[alt]
                break
        else:
            df["volume"] = 0
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"candle frame missing columns: {missing}")
    df["time"] = pd.to_datetime(df["time"], utc=True)
    df = df[REQUIRED_COLUMNS].sort_values("time").reset_index(drop=True)
    return df


# ── Source 1: MT5 (production) ────────────────────────────────────────────────

def load_symbol_map() -> Optional[dict]:
    """Build canonical->broker symbol map from Supabase symbol_mapping for the
    active feed (ACTIVE_FEED_NAME), mirroring the currency-strength scanners.

    Returns None if Supabase isn't configured or the table is empty/unreadable —
    feed_adapter then falls back to its 1:1 default map.
    """
    feed = os.environ.get("ACTIVE_FEED_NAME", "metaquotes_demo")
    try:
        from . import supabase_writer
        if not supabase_writer.is_configured():
            return None
        sb = supabase_writer.get_client()
        res = (
            sb.table("symbol_mapping")
            .select("canonical_symbol, broker_symbol")
            .eq("feed_name", feed)
            .execute()
        )
        rows = res.data or []
        mapping = {r["canonical_symbol"]: r["broker_symbol"] for r in rows if r.get("canonical_symbol")}
        if mapping:
            log.info(f"symbol_map: loaded {len(mapping)} entries for feed '{feed}'")
            return mapping
    except Exception as exc:  # noqa: BLE001 - never fail the run over a mapping lookup
        log.warning(f"symbol_map lookup failed ({exc}); using feed_adapter default map")
    return None


def fetch_from_mt5(symbol: str = "EURUSD", bars: int = 1500,
                   timeframe_key: str = "15min") -> pd.DataFrame:
    """Fetch M15 candles from MT5 via the existing VPS feed adapter.

    Uses the broker_feeds/symbol_mapping table (active feed) to resolve the
    canonical symbol to the broker symbol, so switching feeds is config-only.
    Raises RuntimeError if MT5 / the adapter is unavailable — callers should
    fall back to CSV/mock for local dev.
    """
    try:
        feed_adapter = _import_feed_adapter()
    except ImportError as exc:  # pragma: no cover - depends on VPS env
        raise RuntimeError(f"feed_adapter not importable ({exc}). Use CSV/mock locally.") from exc

    mt5_server = os.environ.get("MT5_SERVER", "") or None
    mt5_login_str = os.environ.get("MT5_LOGIN", "") or None
    mt5_password = os.environ.get("MT5_PASSWORD", "") or None
    mt5_login = int(mt5_login_str) if mt5_login_str else None

    feed_adapter.initialize(server=mt5_server, login=mt5_login, password=mt5_password)
    symbol_map = load_symbol_map()  # None -> feed_adapter uses its 1:1 default
    df = feed_adapter.fetch_df(symbol, timeframe_key, bars, symbol_map=symbol_map)
    # MT5 bar times are broker-server time mislabelled as UTC -> correct to true UTC
    # so session bucketing and calculated_at are accurate.
    return _shift_to_utc(_normalize(df))


# ── Source 2: CSV (offline dev) ───────────────────────────────────────────────

def load_candles_csv(path: str) -> pd.DataFrame:
    """Load an OHLC csv. Expects a `time` column plus open/high/low/close and
    optionally volume/tick_vol."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"candle csv not found: {path}")
    return _normalize(pd.read_csv(path))


# ── Source 3: mock (smoke tests, no network) ──────────────────────────────────

def mock_m15_candles(bars: int = 800, start_price: float = 1.1000,
                     seed_step: float = 0.0002) -> pd.DataFrame:
    """Deterministic synthetic M15 series (no randomness — reproducible).

    Produces a gently oscillating series with a few support shelves so the zone
    detector and scoring pipeline have something to chew on locally."""
    import math

    base_time = pd.Timestamp("2024-01-01 00:00:00", tz="UTC")
    rows = []
    price = start_price
    for i in range(bars):
        # slow sine wave + tiny drift => repeated visits to similar lows
        wave = math.sin(i / 24.0) * 0.0040
        drift = (i % 96 - 48) * seed_step * 0.02
        mid = start_price + wave + drift
        open_ = mid
        close = mid + math.sin(i / 6.0) * 0.0006
        high = max(open_, close) + 0.0004
        low = min(open_, close) - 0.0004
        rows.append({
            "time": base_time + pd.Timedelta(minutes=15 * i),
            "open": round(open_, 5), "high": round(high, 5),
            "low": round(low, 5), "close": round(close, 5),
            "volume": 100 + (i % 50),
        })
        price = close
    return _normalize(pd.DataFrame(rows))


# ── Unified entry point ───────────────────────────────────────────────────────

def fetch_m15_candles(symbol: str = "EURUSD", bars: int = 1500,
                      source: str = "auto", csv_path: Optional[str] = None) -> pd.DataFrame:
    """Return M15 candles for `symbol`.

    source:
      'auto' -> try MT5, fall back to CSV (if csv_path given) else mock
      'mt5'  -> MT5 only (raises if unavailable)
      'csv'  -> CSV only (requires csv_path)
      'mock' -> synthetic
    """
    if source == "mt5":
        return fetch_from_mt5(symbol, bars)
    if source == "csv":
        if not csv_path:
            raise ValueError("source='csv' requires csv_path")
        return load_candles_csv(csv_path)
    if source == "mock":
        return mock_m15_candles(bars=bars)

    # auto
    try:
        return fetch_from_mt5(symbol, bars)
    except Exception as exc:  # noqa: BLE001 - broad on purpose for local fallback
        log.warning(f"MT5 fetch unavailable ({exc}); falling back.")
        if csv_path:
            return load_candles_csv(csv_path)
        log.warning("No csv_path provided; using deterministic mock candles.")
        return mock_m15_candles(bars=bars)
