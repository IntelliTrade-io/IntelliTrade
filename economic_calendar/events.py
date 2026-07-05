"""Event model, stable IDs, schema validation, and content hashes.

Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict

from economic_calendar.timeutils import UTC

# --- JSON Schema for event validation (minimal, strict-enough for CI) ---
EVENT_JSON_SCHEMA = {
    "type": "object",
    "required": ["id", "source", "agency", "country", "title", "date_time_utc"],
    "properties": {
        "id": {"type": "string", "minLength": 8},
        "source": {"type": "string", "minLength": 2},
        "agency": {"type": "string", "minLength": 2},
        "country": {"type": "string", "minLength": 2, "maxLength": 2},
        "title": {"type": "string", "minLength": 2},
        "impact": {"type": "string"},
        "date_time_utc": {
            "type": "string",
            "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$",
        },
        "event_local_tz": {"type": "string"},
        "url": {"type": "string"},
        "extras": {"type": "object"},
    },
    "additionalProperties": True,
}

try:
    import jsonschema

    def _validate_event_schema(event_dict: dict) -> None:
        jsonschema.validate(event_dict, EVENT_JSON_SCHEMA)

except Exception:  # pragma: no cover - jsonschema missing

    def _validate_event_schema(event_dict: dict) -> None:
        return


def _content_hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def _content_hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


# Country code mapping
COUNTRY_CODES = {
    "US": "United States",
    "EU": "European Union",
    "GB": "United Kingdom",
    "CA": "Canada",
    "AU": "Australia",
    "NZ": "New Zealand",
    "JP": "Japan",
    "CN": "China",
    "CH": "Switzerland",
}

# ---------------------------------------------------------------------------
# Event model with stable IDs


@dataclass
class Event:
    """Complete production Event model with stable IDs and comprehensive metadata."""

    id: str                 # sha1(country|agency|title|date_time_utc)
    source: str             # scraper module tag, e.g., "ABS_HTML", "BLS_ICS"
    agency: str             # e.g., "ABS", "BLS", "ONS", "ECB", "FOMC"
    country: str            # ISO-2: AU, US, GB, CA, EU, NZ, JP, CN, CH
    title: str
    date_time_utc: datetime
    event_local_tz: str     # IANA, e.g., "Australia/Sydney"
    impact: str             # High/Medium/Low
    url: str
    extras: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the event to a JSON-serializable dictionary."""
        event_time_utc = self.date_time_utc.isoformat()
        extras = self.extras or {}
        return {
            "id": self.id,
            "source": self.source,
            "agency": self.agency,
            "country": self.country,
            "title": self.title,
            "date_time_utc": event_time_utc,
            "event_local_tz": self.event_local_tz,
            "impact": self.impact,
            "url": self.url,
            "trader_relevance_score": extras.get("trader_relevance_score"),
            "category": extras.get("category"),
            "asset_focus": extras.get("asset_focus"),
            "source_reliability": extras.get("source_reliability"),
            "lkg_used": bool(extras.get("lkg_used") or extras.get("cached")),
            "curated_fallback_reviewed_at": extras.get("curated_fallback_reviewed_at"),
            "curated_fallback_age_days": extras.get("curated_fallback_age_days"),
            "curated_fallback_max_age_days": extras.get("curated_fallback_max_age_days"),
            "time_confidence": extras.get("time_confidence"),
            "source_url": extras.get("source_url_standardized") or self.url,
            "source_name": extras.get("source_name") or self.agency or self.source,
            "local_time_timezone": self.event_local_tz,
            "event_time_utc": event_time_utc,
            "default_dashboard": extras.get("default_dashboard"),
            "event_group_key": extras.get("event_group_key"),
            "event_group_title": extras.get("event_group_title"),
            "event_group_type": extras.get("event_group_type"),
            "event_group_priority": extras.get("event_group_priority"),
            "extras": extras,
        }

    def __post_init__(self) -> None:
        extras = dict(self.extras or {})
        extras.setdefault("time_confidence", "exact")
        self.extras = extras
        _validate_event_schema(self.to_dict())


def _event_to_dict(ev: Event) -> dict:
    return ev.to_dict()


def _event_from_dict(data: dict) -> Event:
    dt = datetime.fromisoformat(data["date_time_utc"])
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return Event(
        id=data["id"],
        source=data["source"],
        agency=data["agency"],
        country=data["country"],
        title=data["title"],
        date_time_utc=dt,
        event_local_tz=data.get("event_local_tz") or "UTC",
        impact=data.get("impact") or "Low",
        url=data.get("url") or "",
        extras=data.get("extras") or {},
    )


def make_id(country: str, agency: str, title: str, dt_utc: datetime) -> str:
    """Generate stable event ID from canonical fields."""
    blob = f"{country}|{agency}|{title}|{dt_utc.isoformat()}"
    return hashlib.sha1(blob.encode()).hexdigest()
