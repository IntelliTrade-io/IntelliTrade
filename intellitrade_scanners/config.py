# coding: utf-8
r"""
Deployment paths for the scanners.

Everything roots at INTELLITRADE_HOME (default C:\IntelliTrade — the current
VPS convention) so the code is not locked to one box. Each directory can also
be overridden individually:

    INTELLITRADE_HOME        base dir           (default C:\IntelliTrade)
    INTELLITRADE_CONFIG_ENV  path to the .env   (default <home>\config\.env)
    INTELLITRADE_LOG_DIR     log directory      (default <home>\logs)
    INTELLITRADE_OUT_DIR     output directory   (default <home>\out)

Overrides must be set in the shell/Task Scheduler environment, not in the
.env itself (the .env location is what they resolve).
"""

import os

DEFAULT_HOME = r"C:\IntelliTrade"


def home() -> str:
    return os.environ.get("INTELLITRADE_HOME", DEFAULT_HOME)


def env_file() -> str:
    return os.environ.get("INTELLITRADE_CONFIG_ENV",
                          os.path.join(home(), "config", ".env"))


def log_dir() -> str:
    return os.environ.get("INTELLITRADE_LOG_DIR", os.path.join(home(), "logs"))


def out_dir() -> str:
    return os.environ.get("INTELLITRADE_OUT_DIR", os.path.join(home(), "out"))


def load_env() -> None:
    """Load the deployment .env if python-dotenv is installed.

    Missing file falls back to python-dotenv's default .env discovery,
    matching the previous per-runner behavior.
    """
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    path = env_file()
    load_dotenv(path if os.path.exists(path) else None)
