"""ICS (iCalendar) parsing with TZID support.

Moved verbatim from the monolith (plan 6.3); only formatting normalized.
Logs to the monolith's logger name so its handler keeps receiving records.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

from economic_calendar.timeutils import UTC

logger = logging.getLogger("econ_calendar_complete")


def parse_ics_datetime(val: str, params: Dict[str, str], source_tz: ZoneInfo,
                       default_hour: int = 10, default_min: int = 0) -> datetime:
    """Parse ICS datetime with proper TZID handling."""
    # Z suffix = UTC
    if val.endswith("Z"):
        dt = datetime.strptime(val[:-1], "%Y%m%dT%H%M%S")
        return dt.replace(tzinfo=UTC)
    # Date-only YYYYMMDD
    if re.fullmatch(r"\d{8}", val):
        dt = datetime.strptime(val, "%Y%m%d").replace(hour=default_hour, minute=default_min)
        if "TZID" in params:
            try:
                tz = ZoneInfo(params["TZID"])
                return dt.replace(tzinfo=tz)
            except Exception:
                pass
        return dt.replace(tzinfo=source_tz)
    # Date-time YYYYMMDDTHHMMSS
    if re.fullmatch(r"\d{8}T\d{6}", val):
        dt = datetime.strptime(val, "%Y%m%dT%H%M%S")
        if "TZID" in params:
            try:
                tz = ZoneInfo(params["TZID"])
                return dt.replace(tzinfo=tz)
            except Exception:
                pass
        return dt.replace(tzinfo=source_tz)
    raise ValueError(f"Unrecognized DTSTART format: {val}")


def parse_ics_bytes(data: bytes, source_tz: ZoneInfo, default_hour: int = 10,
                    default_min: int = 0) -> List[Dict[str, Any]]:
    """Enhanced ICS parser with TZID support."""
    text = data.decode("utf-8", errors="ignore")
    # Unfold folded lines
    lines = []
    for line in text.splitlines():
        if line.startswith(" ") or line.startswith("\t"):
            if lines:
                lines[-1] += line.strip()
        else:
            lines.append(line.strip())

    events = []
    cur = {}
    in_event = False

    def flush_event():
        if not cur:
            return
        title = cur.get("SUMMARY") or cur.get("DESCRIPTION") or "Untitled"
        dt_start_raw = cur.get("DTSTART")
        dt_start_params = cur.get("DTSTART_PARAMS", {})
        url = cur.get("URL") or cur.get("UID") or ""
        if not dt_start_raw:
            return
        try:
            dt = parse_ics_datetime(dt_start_raw, dt_start_params, source_tz, default_hour, default_min)
            events.append({
                "title": title.strip(),
                "dt": dt,
                "url": url,
                "raw": dict(cur),
            })
        except Exception as e:
            logger.debug(f"Failed to parse ICS datetime {dt_start_raw}: {e}")

    for ln in lines:
        if ln == "BEGIN:VEVENT":
            in_event = True
            cur = {}
            continue
        if ln == "END:VEVENT":
            in_event = False
            flush_event()
            cur = {}
            continue
        if not in_event:
            continue
        if ":" in ln:
            left, val = ln.split(":", 1)
            # Parse parameters
            if ";" in left:
                key, param_str = left.split(";", 1)
                params = {}
                for param in param_str.split(";"):
                    if "=" in param:
                        pk, pv = param.split("=", 1)
                        params[pk.upper()] = pv
                cur[key.upper() + "_PARAMS"] = params
            else:
                key = left
            cur[key.upper()] = val.strip()

    return events
