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

# CLI/run overrides shared with the monolith (dict-mutated, same object everywhere).
RUN_OVERRIDES: Dict[str, Any] = {}

# Debug flags rebound by the CLI; read via attribute access (runstate.DEBUG_ZERO_FLAG)
# so mutation in one module is visible in all.
DEBUG_ZERO_FLAG = False
STRICT_ZERO_FLAG = False

# Active cache manager for the current run; rebound by gather_events via
# attribute access (runstate.CURRENT_CACHE_MANAGER) so all modules see it.
CURRENT_CACHE_MANAGER: Any = None
