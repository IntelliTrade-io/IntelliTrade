# coding: utf-8
"""
Export EURUSD M15 history from MT5 to CSV — for zone-geometry validation against
claudeLoad/validation/phase39_zone_validation_fixture.csv.

Run on the VPS (MT5 terminal connected):
    python scripts\\vps\\export_eurusd_m15.py
    python scripts\\vps\\export_eurusd_m15.py --start 2021-01-01 --out C:\\IntelliTrade\\out\\eurusd_m15.csv

Output columns: time,open,high,low,close,tick_vol   (time = UTC ISO)

NOTE: MetaQuotes-Demo history depth is limited — it may not reach 2021. If the
first exported row is later than the fixture's earliest date, use the
QuantConnect source data instead (same series the research fixture was built on).
"""

import argparse
import csv
import datetime as dt
import os
import sys

try:
    import MetaTrader5 as mt5
except ImportError:
    print("MetaTrader5 not installed. Run: pip install MetaTrader5", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    _env = r"C:\IntelliTrade\config\.env"
    load_dotenv(_env if os.path.exists(_env) else None)
except ImportError:
    pass

SYMBOL = "EURUSD"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2021-01-01", help="UTC start date YYYY-MM-DD")
    ap.add_argument("--out", default=os.path.join(os.getcwd(), "eurusd_m15.csv"))
    args = ap.parse_args()

    server = os.environ.get("MT5_SERVER") or None
    login = os.environ.get("MT5_LOGIN") or None
    password = os.environ.get("MT5_PASSWORD") or None
    kwargs = {}
    if login:
        kwargs = {"login": int(login), "password": password or "", "server": server or ""}
    if not mt5.initialize(**kwargs):
        print(f"MT5 initialize failed: {mt5.last_error()}", file=sys.stderr)
        return 1

    mt5.symbol_select(SYMBOL, True)
    start = dt.datetime.fromisoformat(args.start).replace(tzinfo=dt.timezone.utc)
    end = dt.datetime.now(dt.timezone.utc)

    # copy_rates_from_pos forces the terminal to load available history (unlike
    # copy_rates_range, which returns empty for start dates before the cache).
    # Pull a large count from the most recent bar backward, then filter by --start.
    COUNT = 300000  # ~8.5y of M15; MT5 returns only what it actually has
    rates = mt5.copy_rates_from_pos(SYMBOL, mt5.TIMEFRAME_M15, 0, COUNT)
    if rates is None or len(rates) == 0:
        rates = mt5.copy_rates_range(SYMBOL, mt5.TIMEFRAME_M15, start, end)  # fallback
    mt5.shutdown()

    if rates is None or len(rates) == 0:
        print(f"No M15 data returned for {SYMBOL}. Terminal may have no history loaded — "
              f"try opening an EURUSD M15 chart in MT5 and scrolling back, or use QuantConnect.",
              file=sys.stderr)
        return 1

    # keep only bars at/after the requested start
    start_epoch = int(start.timestamp())
    rates = [r for r in rates if int(r["time"]) >= start_epoch]
    if not rates:
        print(f"History exists but none at/after {args.start} — broker depth is shallower.",
              file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["time", "open", "high", "low", "close", "tick_vol"])
        for r in rates:
            # MT5 bar time is broker-server time; label UTC and correct if needed
            # downstream. Here we emit as-is (epoch seconds -> ISO).
            t = dt.datetime.fromtimestamp(int(r["time"]), tz=dt.timezone.utc)
            w.writerow([t.isoformat(), r["open"], r["high"], r["low"], r["close"], int(r["tick_volume"])])

    first = dt.datetime.fromtimestamp(int(rates[0]["time"]), tz=dt.timezone.utc)
    last = dt.datetime.fromtimestamp(int(rates[-1]["time"]), tz=dt.timezone.utc)
    print(f"Exported {len(rates)} M15 bars: {first.date()} -> {last.date()}")
    print(f"Written: {args.out}")
    if first.date() > dt.date(2021, 1, 4):
        print("WARNING: history starts after 2021-01-04 — earlier fixture rows can't be "
              "validated from this export. Consider the QuantConnect source.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
