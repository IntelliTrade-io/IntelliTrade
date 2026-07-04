# coding: utf-8
"""
IntelliTrade Support & Resistance Alpha — backend package.

Locked model: EURUSD Dynamic Support Reclaim Opportunity Score v1
Scope (this pass): EURUSD support zones only, M15 execution context,
close-reclaim opportunity model, short-term first-reaction.

Source of truth for all tunable values: fixtures/locked_phase39_config.json
Golden regression fixture:               fixtures/golden_backend_fixture.csv

Nothing in this package is a trading signal. See README.md.
"""

MODEL_VERSION = "eurusd_support_reclaim_v1"
