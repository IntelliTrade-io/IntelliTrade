# Trading-correctness audit — S&R zone engine + strength scanners

2026-07-07, Fable session. Scope: lookahead bias, repainting inputs, window/
timezone errors in `backend/support_resistance/` and `intellitrade_scanners/`.
Method: line-level read of zone_detector, research_zone_engine, fetch_candles,
feed_adapter, oanda_adapter, strength_core (scoring paths), cross-checked
against the locked research source in `claudeLoad/SnRTool/researchCode/`.

## F1 — HIGH: MT5 feed delivers the FORMING candle; nothing drops it

`feed_adapter.fetch_df` uses `mt5.copy_rates_from_pos(symbol, tf, 0, bars)` —
position 0 is the bar currently forming. The OANDA adapter, by contrast,
filters `complete == True` (closed candles only). No consumer of the MT5 path
(strength scanners, `fetch_candles` → S&R engine) drops the last row.

Consequences, live only (golden fixtures are built from closed candles, so
they can never catch this):

1. **Strength scores repaint.** `strength_core` reads `close.iloc[-1]`,
   `atr(...).iloc[-1]` etc. — on MT5 that's a candle 0–15 min (M15) or up to
   24 h (D1) from closing. The VPS daily scan runs ~20:05 UTC while the
   MetaQuotes D1 bar closes ~21:00 UTC — every daily score is computed on an
   unfinished daily candle. The same score recomputed after the close can
   differ. Also means MT5 and OANDA pipelines — algorithm-identical — see
   different inputs by construction.
2. **False close-reclaims possible.** `zone_detector.close_reclaim_state`
   confirms a reclaim when a bar "CLOSES strictly above zone_high" — but the
   forming bar's `close` is just the last tick. Price poking above the zone
   mid-bar can flag `reclaimed/active` and un-flag later. For a product whose
   core claim is *close-confirmed* reclaim, this materially weakens the claim.

**Recommended fix (owner decision — production VPS path, verify per the MT5
caution in memory):** fetch from position 1 (`copy_rates_from_pos(sym, tf, 1,
bars)`) so the newest bar is the last *closed* one, matching OANDA semantics.
One-line change in feed_adapter per strategy (3 call sites), but MUST be
verified on the VPS against MT5 before trusting (same class as the
naive-datetime caution). Alternative: keep fetch, drop rows whose bar period
has not elapsed vs true UTC. Do NOT regenerate golden fixtures — they are
closed-candle data and stay valid.

## F2 — MEDIUM (research-model quirk, faithful port): dashboard zone age ≡ recency

`research_zone_engine.generate_zones` (and the research original — verified
line-for-line, `zone_research_io.py` line 84) rebinds `created_index` to the
latest merged touch. Effect: `age_bars == last_touch_age_bars` always, so the
"old zone" penalty (−10 beyond 500 bars) is a duplicate of the recency branch
and the intended "zone created long ago" factor never exists in the dashboard
scorer. The events path (fixture-verified) keeps `first_created_index`
correctly. NOT a port bug — a quirk in the locked model. Fixing it changes
scores vs research; log as model-research backlog, don't hotfix.

## F3 — LOW (research-model quirk, faithful port): zone height scored vs current ATR

Dashboard scorer measures `zone_height_atr` against the ATR of the *last* bar,
not ATR at creation (events path uses creation ATR). Zones born in high-vol
regimes get penalized as "too tall" when volatility contracts. Faithful to
research (line 90/100). Same disposition as F2.

## F4 — INFO: reclaim confirmation excludes the touch bar itself

`close_reclaim_state` requires the confirming close on a bar strictly AFTER
the touch bar — a hammer that dips into the zone and closes back above it in
the same bar does not confirm. This matches the documented locked mechanics
(`max_confirm_wait_bars` semantics), noting it here because it surprises
chart-intuition; no action.

## Verified clean

- **No lookahead in zone construction:** swings require `lookback` future bars
  and only become known at `created_index = pivot + lookback`; events are
  emitted with data available at that index. Correct anti-lookahead design.
- ATR (SMA of TR) matches research `calculate_atr` exactly; `prepare()`
  mirrors dropna/reset_index.
- `zone_detector.detect_support_zones` sort keys match research label strings.
- OANDA candle path uses closed candles only.
- Broker→UTC offset detection (`fetch_candles.broker_utc_offset_hours`) is
  robust to the forming bar (sub-hour error rounds away) and absorbs DST.
- Strength BOS/swing "after" scans operate on historical bars only.

## Suggested order of action

1. Owner greenlights F1 fix → apply to feed_adapter → verify on VPS (compare
   one scan's snapshot against a manual closed-candle run) → ship with the
   6.7 deploy.
2. F2/F3 → model-research backlog (they shift scores; touch only with fixture
   regeneration and an explicit research decision).
