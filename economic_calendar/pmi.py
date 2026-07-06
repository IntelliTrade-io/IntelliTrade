"""S&P Global PMI: config loading, release rules, and the rules-based estimator.

Moved verbatim from the monolith (plan 6.3); only formatting normalized.
One adaptation: config-file resolution anchored via ``set_config_base`` because
``__file__`` no longer points at scripts/ — the monolith pins it back at import.
"""

from __future__ import annotations

import calendar
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from economic_calendar.events import Event, make_id
from economic_calendar.timeutils import (
    UTC,
    _get_zoneinfo,
    _is_business_day,
    _month_year_iter,
    _move_business_days,
    _parse_local_time,
    _shift_to_business_day,
    _within,
    ensure_aware,
)

PROVIDER_SPGLOBAL_PMI = "SPGLOBAL_PMI"
PMI_PROVIDER_DISPLAY = "S&P Global"
NO_LKG_SOURCES: Set[str] = {PROVIDER_SPGLOBAL_PMI}


@dataclass(frozen=True)
class PMISeriesConfig:
    series_id: str
    label: str
    country: str
    classification: str
    timezone: str
    default_time_local: str
    time_confidence: str
    rule_confidence: str
    provider: str
    sector: str
    importance: str
    feed_source: Optional[str] = None

    @property
    def is_flash(self) -> bool:
        return self.classification.lower() == "flash"

    @property
    def is_final(self) -> bool:
        return not self.is_flash


@dataclass(frozen=True)
class PMIRuleConfig:
    series_id: str
    rule_type: str
    anchor: str
    offset_business_days: int
    direction: str
    holiday_mode: str

    @property
    def rule_id(self) -> str:
        return f"{self.series_id}:{self.rule_type}:{self.anchor}:{self.offset_business_days}:{self.direction}"


@dataclass(frozen=True)
class PMIOverrideConfig:
    series_id: str
    year: int
    month: int
    day: int
    hour: int
    minute: int
    has_time_override: bool
    reason: Optional[str] = None

    def to_local_datetime(self, tz: ZoneInfo, fallback_time: Tuple[int, int]) -> datetime:
        hour = self.hour if self.has_time_override else fallback_time[0]
        minute = self.minute if self.has_time_override else fallback_time[1]
        return ensure_aware(datetime(self.year, self.month, self.day, hour, minute), tz, hour, minute)


_PMI_CONFIG_PATHS: Dict[str, Path] = {}
_PMI_FEEDS: Optional[List[Dict[str, Any]]] = None
_PMI_RULE_ENTRIES: Optional[List[Dict[str, Any]]] = None
_PMI_RULES: Optional[Dict[str, PMIRuleConfig]] = None
_PMI_SERIES: Optional[Dict[str, PMISeriesConfig]] = None
_PMI_OVERRIDES: Optional[Dict[str, Dict[Tuple[int, int], List[PMIOverrideConfig]]]] = None
_PMI_PRIMARY_FEED_URL: Optional[str] = None
_PMI_CONFIG_HASH: Optional[str] = None

# Search base for the PMI config JSONs. Historically the monolith's own
# directory (scripts/); the monolith re-pins this at import time.
_CONFIG_BASE: Path = Path(__file__).resolve().parent


def set_config_base(base: Path) -> None:
    """Anchor config resolution to the directory the monolith lives in."""
    global _CONFIG_BASE
    _CONFIG_BASE = Path(base)


def _resolve_config_path(filename: str) -> Path:
    base = _CONFIG_BASE
    candidates = [
        base / filename,
        base / "PMI Research" / filename,
        base / "PMI_Research" / filename,
        base.parent / filename,
        base.parent / "PMI Research" / filename,
    ]
    for candidate in candidates:
        if candidate.exists():
            _PMI_CONFIG_PATHS[filename] = candidate
            return candidate
    if filename in _PMI_CONFIG_PATHS:
        return _PMI_CONFIG_PATHS[filename]
    raise FileNotFoundError(f"PMI config not found: {filename}")


def _load_json_config(filename: str) -> Any:
    path = _resolve_config_path(filename)
    return json.loads(path.read_text(encoding="utf-8"))


def _infer_pmi_sector(label: str) -> str:
    text = (label or "").lower()
    if "manufacturing" in text:
        return "Manufacturing"
    if "services" in text or "service" in text:
        return "Services"
    if "composite" in text:
        return "Composite"
    if "output" in text:
        return "Output"
    return "Composite"


def _infer_pmi_importance(country: str, classification: str, sector: str) -> str:
    classification = (classification or "").lower()
    if classification == "flash":
        return "High"
    major = {"US", "EZ", "GB", "DE", "FR", "JP", "CN"}
    if country in major and sector in {"Manufacturing", "Services", "Composite"}:
        return "High"
    return "Medium"


def _get_pmi_feeds() -> List[Dict[str, Any]]:
    global _PMI_FEEDS
    if _PMI_FEEDS is None:
        _PMI_FEEDS = _load_json_config("PMI_FEEDS_CATALOG.json")
    return _PMI_FEEDS


def _get_pmi_primary_feed_url() -> Optional[str]:
    global _PMI_PRIMARY_FEED_URL
    if _PMI_PRIMARY_FEED_URL is not None:
        return _PMI_PRIMARY_FEED_URL
    feeds = _get_pmi_feeds()
    for entry in feeds:
        if entry.get("has_future_dates"):
            _PMI_PRIMARY_FEED_URL = entry.get("url") or entry.get("url_pattern")
            break
    if _PMI_PRIMARY_FEED_URL is None and feeds:
        _PMI_PRIMARY_FEED_URL = feeds[0].get("url")
    return _PMI_PRIMARY_FEED_URL


def _get_pmi_rule_entries() -> List[Dict[str, Any]]:
    global _PMI_RULE_ENTRIES
    if _PMI_RULE_ENTRIES is None:
        _PMI_RULE_ENTRIES = _load_json_config("PMI_ESTIMATOR_RULES.json")
    return _PMI_RULE_ENTRIES


def _get_pmi_rules() -> Dict[str, PMIRuleConfig]:
    global _PMI_RULES
    if _PMI_RULES is None:
        entries = _get_pmi_rule_entries()
        rules: Dict[str, PMIRuleConfig] = {}
        for entry in entries:
            rule_meta = entry.get("rule") or {}
            rules[entry["series_id"]] = PMIRuleConfig(
                series_id=entry["series_id"],
                rule_type=rule_meta.get("type", "BUSINESS_DAY_OFFSET"),
                anchor=rule_meta.get("anchor", "MONTH_START"),
                offset_business_days=int(rule_meta.get("offset_business_days", 0)),
                direction=(rule_meta.get("direction") or "forward").lower(),
                holiday_mode=(rule_meta.get("holiday_handling", {}).get("mode") or "").lower(),
            )
        _PMI_RULES = rules
    return _PMI_RULES


def _get_pmi_series_configs() -> Dict[str, PMISeriesConfig]:
    global _PMI_SERIES
    if _PMI_SERIES is None:
        entries = _get_pmi_rule_entries()
        rules = _get_pmi_rules()
        feed_hint = _get_pmi_primary_feed_url()
        series_map: Dict[str, PMISeriesConfig] = {}
        for entry in entries:
            series_id = entry["series_id"]
            label = entry.get("label") or series_id.replace("_", " ").title()
            country = entry.get("country", "US")
            classification = entry.get("classification", "final")
            tz_name = entry.get("timezone", "UTC")
            default_time = entry.get("default_time_local", "09:00")
            sector = _infer_pmi_sector(label)
            importance = _infer_pmi_importance(country, classification, sector)
            series_map[series_id] = PMISeriesConfig(
                series_id=series_id,
                label=label,
                country=country,
                classification=classification,
                timezone=tz_name,
                default_time_local=default_time,
                time_confidence=entry.get("time_confidence", "assumed"),
                rule_confidence=entry.get("rule_confidence", "medium"),
                provider=entry.get("provider", PMI_PROVIDER_DISPLAY),
                sector=sector,
                importance=importance,
                feed_source=feed_hint,
            )
            # Ensure rules exist; raises KeyError later if missing.
            rules.setdefault(series_id, PMIRuleConfig(series_id, "BUSINESS_DAY_OFFSET", "MONTH_START", 0, "forward", ""))
        _PMI_SERIES = series_map
    return _PMI_SERIES


def _get_pmi_overrides() -> Dict[str, Dict[Tuple[int, int], List[PMIOverrideConfig]]]:
    global _PMI_OVERRIDES
    if _PMI_OVERRIDES is None:
        data = _load_json_config("PMI_OVERRIDES.json")
        overrides: Dict[str, Dict[Tuple[int, int], List[PMIOverrideConfig]]] = {}
        for series_id, per_month in (data or {}).items():
            series_overrides: Dict[Tuple[int, int], List[PMIOverrideConfig]] = {}
            for _, payload in (per_month or {}).items():
                date_str = payload.get("override_date_local") or _
                if not date_str:
                    continue
                try:
                    normalized = date_str if date_str.count("-") >= 2 else f"{date_str}-01"
                    base_date = datetime.fromisoformat(normalized)
                except ValueError:
                    continue
                hour, minute, has_time = _parse_local_time(payload.get("override_time_local"), (0, 0))
                entry = PMIOverrideConfig(
                    series_id=series_id,
                    year=base_date.year,
                    month=base_date.month,
                    day=base_date.day,
                    hour=hour,
                    minute=minute,
                    has_time_override=has_time,
                    reason=payload.get("reason"),
                )
                key = (entry.year, entry.month)
                series_overrides.setdefault(key, []).append(entry)
            if series_overrides:
                overrides[series_id] = series_overrides
        _PMI_OVERRIDES = overrides
    return _PMI_OVERRIDES


def _get_pmi_config_hash() -> str:
    global _PMI_CONFIG_HASH
    if _PMI_CONFIG_HASH is None:
        blobs: List[bytes] = []
        for filename in ("PMI_FEEDS_CATALOG.json", "PMI_ESTIMATOR_RULES.json", "PMI_OVERRIDES.json"):
            path = _resolve_config_path(filename)
            blobs.append(path.read_bytes())
        _PMI_CONFIG_HASH = hashlib.sha1(b"".join(blobs)).hexdigest()
    return _PMI_CONFIG_HASH


def _iter_pmi_overrides_for_series(series_id: str) -> Dict[Tuple[int, int], List[PMIOverrideConfig]]:
    overrides = _get_pmi_overrides()
    return overrides.get(series_id, {})


def _calc_pmi_rule_date(year: int, month: int, rule: PMIRuleConfig) -> Optional[datetime]:
    if rule.rule_type != "BUSINESS_DAY_OFFSET":
        return None
    if rule.anchor == "MONTH_END":
        base = datetime(year, month, calendar.monthrange(year, month)[1])
        base = _shift_to_business_day(base, "backward")
    else:
        base = datetime(year, month, 1)
        base = _shift_to_business_day(base, "forward")
    offset = int(rule.offset_business_days)
    direction = rule.direction or ("backward" if offset < 0 else "forward")
    if offset < 0:
        direction = "backward"
    elif offset > 0 and direction != "forward":
        direction = "forward"
    base = _move_business_days(base, abs(offset), direction)
    if not _is_business_day(base):
        if rule.holiday_mode == "shift_to_next_business_day":
            base = _shift_to_business_day(base, "forward")
        elif rule.holiday_mode == "shift_to_previous_business_day":
            base = _shift_to_business_day(base, "backward")
    return base


def _match_pmi_override_entry(candidates: List[PMIOverrideConfig], day: int) -> Optional[PMIOverrideConfig]:
    if not candidates:
        return None
    for entry in candidates:
        if entry.day == day:
            return entry
    return candidates[0]


def _estimate_pmi_releases_for_series(
    series: PMISeriesConfig,
    rules: PMIRuleConfig,
    overrides: Dict[str, Dict[Tuple[int, int], List[PMIOverrideConfig]]],
    since_utc: datetime,
    until_utc: datetime,
) -> List[Event]:
    tz = _get_zoneinfo(series.timezone)
    default_hour, default_minute, _ = _parse_local_time(series.default_time_local, (9, 0))
    local_since = since_utc.astimezone(tz)
    local_until = until_utc.astimezone(tz)
    events: List[Event] = []
    overrides_for_series = overrides.get(series.series_id, {})
    for year, month in _month_year_iter(local_since.year, local_since.month, local_until.year, local_until.month):
        target_date = _calc_pmi_rule_date(year, month, rules)
        if not target_date:
            continue
        local_dt = ensure_aware(
            datetime(target_date.year, target_date.month, target_date.day, default_hour, default_minute),
            tz,
            default_hour,
            default_minute,
        )
        override_candidates = overrides_for_series.get((year, month), [])
        override_entry = _match_pmi_override_entry(override_candidates, target_date.day)
        discovered_via = "rules"
        override_flag = False
        time_confidence = "assumed"
        if override_entry:
            override_flag = True
            discovered_via = "rules+override"
            local_dt = override_entry.to_local_datetime(tz, (default_hour, default_minute))
            time_confidence = "override"
        dt_utc = local_dt.astimezone(UTC)
        if not _within(dt_utc, since_utc, until_utc):
            continue
        title = series.label.strip()
        extras: Dict[str, Any] = {
            "provider": PMI_PROVIDER_DISPLAY,
            "series_id": series.series_id,
            "sector": series.sector,
            "is_flash": series.is_flash,
            "is_final": series.is_final,
            "country_code": series.country,
            "discovered_via": discovered_via,
            "time_confidence": time_confidence,
            "pmi_rule_id": rules.rule_id,
            "classification": series.classification,
            "rule_confidence": series.rule_confidence,
            "time_confidence_source": series.time_confidence,
            "pmi_override": override_flag,
        }
        if override_flag and override_entry and override_entry.reason:
            extras["override_reason"] = override_entry.reason
        if series.feed_source:
            extras["feed_source"] = series.feed_source
        url = series.feed_source or "https://www.pmi.spglobal.com"
        events.append(
            Event(
                id=make_id(series.country, "SPGLOBAL", title, dt_utc),
                source=PROVIDER_SPGLOBAL_PMI,
                agency="SPGLOBAL",
                country=series.country,
                title=title,
                date_time_utc=dt_utc,
                event_local_tz=series.timezone,
                impact=series.importance,
                url=url,
                extras=extras,
            )
        )
    return events
