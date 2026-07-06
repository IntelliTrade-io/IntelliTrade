"""Shared per-run mutable state.

``RUN_CONTEXT`` carries run-scoped flags and health payloads
(``allow_persist``, ``serverless``, ``start_utc``/``end_utc``, per-family
health dicts). It is a single module-level dict so the monolith and package
modules mutate the same object. Moved verbatim from the monolith (plan 6.3).
"""

from __future__ import annotations

import threading
from typing import Any, Dict

RUN_CONTEXT: Dict[str, Any] = {}
RUN_CONTEXT_LOCK = threading.RLock()
