"""Event-agnostic text/metadata helpers shared by enrichment and source specs.

Work on either an ``Event`` instance or a plain dict ("eventish").
Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, Tuple


def _eventish_value(event: Any, field: str, default: Any = "") -> Any:
    if isinstance(event, dict):
        return event.get(field, default)
    return getattr(event, field, default)


def _eventish_extras(event: Any) -> Dict[str, Any]:
    extras = _eventish_value(event, "extras", {})
    return extras if isinstance(extras, dict) else {}


def _normalize_metadata_text(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _eventish_text_blob(event: Any) -> str:
    extras = _eventish_extras(event)
    parts = [
        _eventish_value(event, "title", ""),
        _eventish_value(event, "source", ""),
        _eventish_value(event, "agency", ""),
        _eventish_value(event, "country", ""),
        extras.get("provider"),
        extras.get("classification"),
        extras.get("series_id"),
        extras.get("release_type"),
        extras.get("official_title"),
        extras.get("release_series"),
    ]
    normalized = [_normalize_metadata_text(part).lower() for part in parts if _normalize_metadata_text(part)]
    return " ".join(normalized)


def _text_has_any(text: str, tokens: Tuple[str, ...]) -> bool:
    return any(token in text for token in tokens)


def _regex_has_any(text: str, patterns: Tuple[str, ...]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)
