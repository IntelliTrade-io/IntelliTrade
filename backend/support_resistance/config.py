# coding: utf-8
"""
Config loader for the Support & Resistance Alpha backend.

Loads fixtures/locked_phase39_config.json and exposes it as the single source
of truth. Every scoring / grading / threshold value used by the backend MUST
come from here. If a required field is missing we FAIL LOUDLY with a clear
error rather than silently inventing a default — the backend is only correct if
it reproduces the locked research branch.
"""

import json
import os
from functools import lru_cache

# ── Paths ───────────────────────────────────────────────────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURES_DIR = os.path.join(_THIS_DIR, "fixtures")
LOCKED_CONFIG_PATH = os.path.join(FIXTURES_DIR, "locked_phase39_config.json")
GOLDEN_FIXTURE_PATH = os.path.join(FIXTURES_DIR, "golden_backend_fixture.csv")

# ── Model identity ────────────────────────────────────────────────────────────
MODEL_VERSION = "eurusd_support_reclaim_v1"


class ConfigError(RuntimeError):
    """Raised when the locked config is missing, unreadable, or incomplete."""


@lru_cache(maxsize=1)
def load_locked_config() -> dict:
    """Load and cache locked_phase39_config.json. Raises ConfigError on failure."""
    if not os.path.exists(LOCKED_CONFIG_PATH):
        raise ConfigError(
            f"Locked config not found at {LOCKED_CONFIG_PATH}. "
            "Copy locked_phase39_config.json into the fixtures/ folder."
        )
    try:
        with open(LOCKED_CONFIG_PATH, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except (OSError, ValueError) as exc:  # ValueError covers JSONDecodeError
        raise ConfigError(f"Failed to read locked config {LOCKED_CONFIG_PATH}: {exc}") from exc

    _validate(cfg)
    return cfg


def _require(cfg: dict, *path):
    """Walk a nested key path, raising ConfigError with the full path if absent."""
    node = cfg
    walked = []
    for key in path:
        walked.append(key)
        if not isinstance(node, dict) or key not in node:
            raise ConfigError(
                "Locked config is missing required field: "
                + " -> ".join(str(p) for p in walked)
            )
        node = node[key]
    return node


def _validate(cfg: dict) -> None:
    """Assert every field the backend depends on is present. Fail loudly."""
    _require(cfg, "base_engine", "symbol")
    _require(cfg, "base_engine", "zone_variant")
    _require(cfg, "base_engine", "zone_type")
    _require(cfg, "base_engine", "confirmation_type")
    _require(cfg, "base_engine", "target_r")
    _require(cfg, "base_engine", "stop_buffer_atr")
    _require(cfg, "base_engine", "session_filter")

    for label in ("weak", "medium", "strong"):
        _require(cfg, "dynamic_score_components", "static_zone_score", label)

    _require(cfg, "dynamic_score_components", "positive_components", "session_score")
    for session in ("asia", "london_midday", "ny_open", "london_open", "other"):
        _require(cfg, "dynamic_score_components", "positive_components", "session_score", session)

    for thr in ("green", "elite_green", "a_plus"):
        _require(cfg, "train_score_thresholds", thr)


# ── Convenience accessors ─────────────────────────────────────────────────────

def base_engine() -> dict:
    return load_locked_config()["base_engine"]


def static_zone_score_map() -> dict:
    """{'weak': 0.0, 'medium': 1.0, 'strong': 2.0} straight from the locked config."""
    return _require(load_locked_config(), "dynamic_score_components", "static_zone_score")


def session_score_map() -> dict:
    """{'asia': 1.0, 'london_midday': 0.75, ...} from the locked config."""
    return _require(
        load_locked_config(), "dynamic_score_components", "positive_components", "session_score"
    )


def score_thresholds() -> dict:
    """{'green': 2.8, 'elite_green': 3.65, 'a_plus': 4.5} from the locked config."""
    return _require(load_locked_config(), "train_score_thresholds")


def target_r() -> float:
    return float(base_engine()["target_r"])


def stop_buffer_atr() -> float:
    return float(base_engine()["stop_buffer_atr"])


def symbol() -> str:
    return str(base_engine()["symbol"])
