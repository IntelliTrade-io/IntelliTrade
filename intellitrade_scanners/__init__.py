# coding: utf-8
"""
IntelliTrade scanner package — currency-strength engine, feed adapters,
scanner runners, and Supabase upload helpers.

Canonical home of the v1.5.2 strength algorithm (strength_core). Runners:
    python -m intellitrade_scanners.scanner_d1h4            (MT5, VPS)
    python -m intellitrade_scanners.scanner_h1m15           (MT5, VPS)
    python -m intellitrade_scanners.scanner_oanda_daily     (OANDA, CI)
    python -m intellitrade_scanners.scanner_oanda_intraday  (OANDA, CI)
"""
