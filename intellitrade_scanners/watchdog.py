# coding: utf-8
r"""
IntelliTrade Scanner Watchdog
Runs every 5 minutes. Checks scanner_health in Supabase.
Sends Discord (and optionally Telegram) alerts on stale data or errors.

Alert conditions:
  - H1/M15 scanner not updated in > 30 minutes
  - D1/H4 scanner not updated in > 5 hours
  - Any scanner status = 'error'
  - Symbols processed < 28

Environment (INTELLITRADE_HOME\config\.env, default C:\IntelliTrade — see config.py):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    DISCORD_WEBHOOK_URL         (optional)
    TELEGRAM_BOT_TOKEN          (optional)
    TELEGRAM_CHAT_ID            (optional)
"""

import os
import sys
import logging
import datetime as dt
from logging.handlers import TimedRotatingFileHandler

import requests

from intellitrade_scanners import config

config.load_env()

LOG_DIR = config.log_dir()

STALE_INTRADAY_MINUTES = 30
STALE_DAILY_HOURS = 5
MIN_SYMBOLS = 28


def setup_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s")
    fh = TimedRotatingFileHandler(
        os.path.join(LOG_DIR, "watchdog.log"),
        when="midnight", backupCount=14, encoding="utf-8"
    )
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logging.basicConfig(level=logging.INFO, handlers=[fh, sh])


def _get_supabase_client():
    try:
        from supabase import create_client
    except ImportError:
        raise RuntimeError("supabase not installed")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def send_discord(message: str) -> None:
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not webhook:
        return
    try:
        requests.post(webhook, json={"content": message}, timeout=10)
    except Exception as e:
        logging.getLogger("watchdog").warning(f"Discord alert failed: {e}")


def send_telegram(message: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": message}, timeout=10)
    except Exception as e:
        logging.getLogger("watchdog").warning(f"Telegram alert failed: {e}")


def alert(message: str) -> None:
    log = logging.getLogger("watchdog")
    log.warning(f"ALERT: {message}")
    tagged = f"🚨 **IntelliTrade Scanner Alert**\n{message}"
    send_discord(tagged)
    send_telegram(message)


def check_health() -> list[str]:
    """Fetch scanner_health rows and return list of alert messages."""
    sb = _get_supabase_client()
    result = sb.table("scanner_health").select("*").execute()
    if not result.data:
        return ["No scanner_health rows found — scanners may never have run."]

    now = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)
    issues = []

    for row in result.data:
        name = row.get("scanner_name", "?")
        group = row.get("timeframe_group", "?")
        status = row.get("status", "unknown")
        symbols = row.get("symbols_processed", 0)
        last_success_raw = row.get("last_success_at")
        last_error = row.get("last_error")

        # Parse last_success_at
        last_success = None
        if last_success_raw:
            try:
                ts = last_success_raw.replace("Z", "+00:00")
                last_success = dt.datetime.fromisoformat(ts)
            except Exception:
                pass

        # Status error
        if status == "error":
            issues.append(f"[{name}/{group}] status=error — {last_error or 'no details'}")

        # Symbols below threshold
        if symbols < MIN_SYMBOLS and status != "error":
            issues.append(f"[{name}/{group}] only {symbols}/{MIN_SYMBOLS} symbols processed")

        # Stale check
        if last_success is None:
            issues.append(f"[{name}/{group}] never successfully completed")
            continue

        age_minutes = (now - last_success).total_seconds() / 60

        if group in ("H1_M15",) and age_minutes > STALE_INTRADAY_MINUTES:
            issues.append(
                f"[{name}/{group}] STALE — last success {age_minutes:.0f}m ago "
                f"(threshold: {STALE_INTRADAY_MINUTES}m)"
            )
        elif group in ("D1_H4",) and age_minutes > STALE_DAILY_HOURS * 60:
            issues.append(
                f"[{name}/{group}] STALE — last success {age_minutes / 60:.1f}h ago "
                f"(threshold: {STALE_DAILY_HOURS}h)"
            )

    return issues


def main() -> int:
    setup_logging()
    log = logging.getLogger("watchdog")
    log.info(f"Watchdog check at {dt.datetime.utcnow().isoformat()}Z")

    try:
        issues = check_health()
    except Exception as e:
        log.error(f"Could not read scanner_health: {e}")
        alert(f"Watchdog could not read Supabase scanner_health: {e}")
        return 1

    if issues:
        for issue in issues:
            log.warning(issue)
        alert("\n".join(issues))
        return 1

    log.info("All scanners healthy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
