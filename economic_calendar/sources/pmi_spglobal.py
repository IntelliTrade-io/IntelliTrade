"""S&P Global PMI fetcher — moved verbatim from the monolith (plan 6.3).

Shared-framework imports only; behavior unchanged.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

import requests

try:
    from bs4 import BeautifulSoup
    import soupsieve as sv
except ImportError:
    BeautifulSoup = None
    sv = None

try:
    import feedparser
except ImportError:
    feedparser = None

try:
    from dateutil import parser as dateparser
except ImportError:
    dateparser = None

try:
    from lxml import html as lxml_html
except ImportError:
    lxml_html = None

from economic_calendar.events import Event
from economic_calendar.health import (
    _finalize_source_log,
)
from economic_calendar.pmi import (
    PROVIDER_SPGLOBAL_PMI,
    _estimate_pmi_releases_for_series,
    _get_pmi_config_hash,
    _get_pmi_overrides,
    _get_pmi_rules,
    _get_pmi_series_configs,
)

logger = logging.getLogger("econ_calendar_complete")

def fetch_pmi_spglobal_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Deterministic PMI release estimation using offline research artifacts."""
    # TODO: add tests under tests/pmi/ validating the estimator end-to-end by
    # asserting at least one US flash event falls within a fixed window and that
    # override paths toggle extras["pmi_override"] and time_confidence correctly.
    del session  # PMI engine is config-driven; no HTTP requests performed.
    source_key = PROVIDER_SPGLOBAL_PMI
    zero_reason: Optional[str] = None
    try:
        series_map = _get_pmi_series_configs()
        rules = _get_pmi_rules()
        overrides = _get_pmi_overrides()
    except FileNotFoundError as exc:
        logger.error("SPGLOBAL_PMI: missing configuration (%s)", exc)
        zero_reason = "config_missing"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []
    except Exception:
        logger.exception("SPGLOBAL_PMI: failed to load configuration")
        zero_reason = "config_error"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []

    if not series_map:
        zero_reason = "config_missing"
        _finalize_source_log(source_key, "none", 0, zero_reason=zero_reason)
        return []

    produced: List[Event] = []
    override_used = False
    for series_id in sorted(series_map.keys()):
        series = series_map[series_id]
        rule = rules.get(series_id)
        if not rule:
            continue
        releases = _estimate_pmi_releases_for_series(series, rule, overrides, start_utc, end_utc)
        if not releases:
            continue
        if not override_used:
            override_used = any(ev.extras.get("pmi_override") for ev in releases)
        produced.extend(releases)

    produced.sort(key=lambda ev: ev.date_time_utc)

    if not produced:
        zero_reason = "between_releases"
        _finalize_source_log(
            source_key,
            "rules",
            0,
            zero_reason=zero_reason,
            extra_meta={"config_hash": _get_pmi_config_hash()},
        )
        return []

    path_used = "rules+override" if override_used else "rules"
    _finalize_source_log(
        source_key,
        path_used,
        len(produced),
        extra_meta={"config_hash": _get_pmi_config_hash()},
    )
    return produced




