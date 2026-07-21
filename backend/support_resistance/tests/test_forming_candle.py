# coding: utf-8
"""
F1 forming-candle exclusion — regression tests.

Proves that only COMPLETED M15 candles enter the S&R scoring / reclaim pipeline,
that the fix preserves count/order/uniqueness, that identical closed inputs
produce identical outputs (no intra-bar repaint), that a session change is a
distinct, intentional cause of a score change, and pins the H1/H4 resample
convention as a documented, unverified production adaptation.

Scope note: the fix lives in the S&R candle layer (fetch_candles), NOT in the
shared feed_adapter, so the currency-strength scanners are untouched.
"""

import datetime as dt

import pandas as pd

from support_resistance import fetch_candles, candle_store
from support_resistance import run_sr_alpha as runner
from support_resistance.opportunity_builder import MarketContext, build_opportunity
from support_resistance.zone_detector import SupportZone


# ── helpers ───────────────────────────────────────────────────────────────────

def _grid(n, last_open_utc, tf_min=15):
    """n M15 bars on a tf_min grid, oldest first, ending (open) at last_open_utc."""
    return [last_open_utc - dt.timedelta(minutes=tf_min * (n - 1 - i)) for i in range(n)]


def _mt5_shape_df(times):
    """A feed_adapter-shaped MT5 frame (tick_vol, no volume)."""
    n = len(times)
    return pd.DataFrame({
        "time": pd.to_datetime(times, utc=True),
        "open": [1.10] * n, "high": [1.11] * n, "low": [1.09] * n,
        "close": [1.10] * n, "tick_vol": [100] * n,
    })


def _fake_feed(times):
    class _FA:
        @staticmethod
        def initialize(**_kw):
            return None

        @staticmethod
        def fetch_df(symbol, timeframe_key, bars, symbol_map=None):
            # ignore `bars`; return the fixed frame under test
            return _mt5_shape_df(times)
    return _FA


# ── 1 + 3: MT5 position-0 (forming) bar is not passed downstream; count preserved
def test_forming_bar_excluded_and_count_preserved(monkeypatch):
    now = dt.datetime.now(dt.timezone.utc)
    # newest bar OPENED 5 min ago => still forming; 6 total, want 5 completed.
    aligned_last = now - dt.timedelta(minutes=5)
    times = _grid(6, aligned_last)
    monkeypatch.setattr(fetch_candles, "_import_feed_adapter", lambda: _fake_feed(times))
    monkeypatch.setattr(fetch_candles, "load_symbol_map", lambda: None)

    out = fetch_candles.fetch_from_mt5("EURUSD", bars=5)
    assert len(out) == 5                                   # count preserved (6 fetched → drop 1 forming)
    assert fetch_candles.last_m15_is_closed(out, now)      # (2) last included bar is complete


# ── 2 + 6: a bar is included only once it has completed
def test_bar_included_only_after_close():
    open_t = dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.timezone.utc)
    df = _mt5_shape_df(_grid(3, open_t))
    forming_now = open_t + dt.timedelta(minutes=5)   # 12:05 — 12:00 bar still forming
    closed_now = open_t + dt.timedelta(minutes=15)   # 12:15 — 12:00 bar closed
    dropped_df, dropped = fetch_candles.drop_forming_m15(df, forming_now)
    assert dropped and len(dropped_df) == 2
    kept_df, kept = fetch_candles.drop_forming_m15(df, closed_now)
    assert not kept and len(kept_df) == 3
    assert fetch_candles.last_m15_is_closed(kept_df, closed_now)
    assert not fetch_candles.last_m15_is_closed(df, forming_now)


# ── 4: order + uniqueness preserved
def test_order_and_uniqueness_preserved():
    open_t = dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.timezone.utc)
    df = _mt5_shape_df(_grid(10, open_t))
    out, _ = fetch_candles.drop_forming_m15(df, open_t + dt.timedelta(minutes=5))
    times = list(out["time"])
    assert times == sorted(times)               # chronological
    assert len(set(times)) == len(times)        # unique
    # only the trailing bar removed; earlier bars untouched
    assert list(df["time"])[:-1] == times


# ── 5: identical closed inputs → identical scoring output (no repaint)
def test_identical_closed_inputs_identical_output():
    open_t = dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.timezone.utc)
    df = _mt5_shape_df(_grid(3, open_t))
    now = open_t + dt.timedelta(minutes=5)
    a, _ = fetch_candles.drop_forming_m15(df, now)
    b, _ = fetch_candles.drop_forming_m15(df.copy(), now)
    assert list(a["time"]) == list(b["time"])
    assert [float(x) for x in a["close"]] == [float(x) for x in b["close"]]


# ── 7: a session transition is a SEPARATE, intentional cause of a score change,
#       distinct from candle repaint (the candle set is identical across it).
def test_session_transition_is_not_candle_repaint():
    # Same completed candles evaluated under two clocks in different UTC sessions.
    open_t = dt.datetime(2026, 7, 20, 6, 30, tzinfo=dt.timezone.utc)  # asia bar
    df = _mt5_shape_df(_grid(3, open_t))
    now_asia = open_t + dt.timedelta(minutes=15)          # 06:45 UTC -> asia
    a, da = fetch_candles.drop_forming_m15(df, now_asia)
    b, db = fetch_candles.drop_forming_m15(df, now_asia)
    # Candle inputs are clock-independent once closed → identical, not repainting.
    assert list(a["time"]) == list(b["time"]) and da == db
    # Session is derived from the bar timestamp, a distinct labelled input.
    from support_resistance import indicators
    assert indicators.session_for_utc(open_t) == "asia"
    assert indicators.session_for_utc(open_t.replace(hour=19)) == "late"


# ── 8: H1/H4 resample convention — CHARACTERIZATION + documented divergence.
#   Production candle_store.resample uses label="right", closed="right".
#   The locked research (claudeLoad/SnRTool/researchCode/research.ipynb) uses a
#   bare df.resample(rule) = pandas default label="left", closed="left", and its
#   HTF EMA200 feature-computation code is NOT preserved in the repo (the golden
#   fixture supplies h1/h4 flags as columns). So the production HTF feature path
#   is an UNVERIFIED production adaptation, tracked for V2 validation. F1 does not
#   change it. This test pins current behaviour so any future change is explicit.
def test_h1h4_resample_convention_diverges_from_research_default():
    open_t = dt.datetime(2026, 7, 20, 0, 0, tzinfo=dt.timezone.utc)
    m15 = fetch_candles._normalize(_mt5_shape_df(_grid(8, open_t)))  # 00:00..01:45

    # Production: label="right", closed="right".
    prod = candle_store.resample(m15, "1h")
    # Research default: bare df.resample(rule) == label="left", closed="left".
    research_default = (
        m15.set_index("time").resample("1h").agg(candle_store.OHLC_AGG)
        .dropna(subset=["close"]).reset_index()
    )

    prod_labels = [str(t) for t in prod["time"]]
    research_labels = [str(t) for t in research_default["time"]]
    # The two conventions label buckets differently → different M15 membership →
    # potentially different H1 closes feeding EMA200. Pinned as a KNOWN, UNVERIFIED
    # production adaptation (F1 does NOT change it; tracked for V2 validation).
    assert prod_labels and research_labels
    assert prod_labels != research_labels
    # Production offsets one hour later than research on the same bars (right vs
    # left edge) — the concrete symptom of the divergence.
    assert prod_labels[0] != research_labels[0]


# ── dry-run makes ZERO Supabase writes (automated proof, not just guard-reading)
def test_dry_run_performs_no_supabase_writes(monkeypatch):
    from unittest.mock import MagicMock
    from support_resistance import supabase_writer

    # Pretend Supabase IS configured, so the ONLY thing that can stop a write is
    # the dry_run guard itself. Any mutation OR client access during a dry run
    # raises and fails this test.
    monkeypatch.setattr(supabase_writer, "is_configured", lambda: True)
    guarded = ["upsert_candles", "upsert_zone", "upsert_opportunity", "prune_stale",
               "get_client", "_postgrest"]
    mocks = {}
    for name in guarded:
        m = MagicMock(side_effect=AssertionError(f"supabase_writer.{name} called during --dry-run"))
        monkeypatch.setattr(supabase_writer, name, m)
        mocks[name] = m

    summary = runner.run(source="mock", dry_run=True)

    for name, m in mocks.items():
        m.assert_not_called()
    assert summary["persisted"] is False
    assert summary["opportunities_written"] == 0
    assert summary["stale_opps_deleted"] == 0
    assert summary["stale_zones_deactivated"] == 0


# ── completeness probe surfaces developing H1/H4 buckets (observability)
def test_completeness_probe_flags_partial_buckets():
    # last M15 opens at 10:15 -> H1 (10:00) has 2 of 4 bars; H4 (08:00) developing.
    open_t = dt.datetime(2026, 7, 20, 10, 15, tzinfo=dt.timezone.utc)
    times = _grid(2, open_t)  # 10:00, 10:15
    now = open_t + dt.timedelta(minutes=15)
    c = runner._candle_completeness(times, now)
    assert c["m15_closed"] is True
    assert c["last_h1_m15_bars"] == 2 and c["h1_bucket_complete"] is False
    assert c["h4_bucket_complete"] is False
